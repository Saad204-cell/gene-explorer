// strand.js: draws a CDS as a scrollable pixel-art double helix on a <canvas>,
// with three modes:
//   Look    - tap a base pair to see its codon and amino acid
//   Mutate  - change, insert or delete one base and see what happens to the protein
//   Primers - pick a forward and a reverse primer; get Tm, GC% and PCR product size
//
// Why a canvas: a CDS can be thousands of base pairs (BRCA1 is 5,592). Making a page
// element for every block would make phones lag. A canvas is one picture that we
// redraw on every scroll, and we only draw the ~30 rows that are on screen.
//
// Layout of one row (one base pair), left to right:
//   position number | top-strand letter | twisting helix | bottom-strand letter | codon + amino acid
// The letters sit in fixed columns so they stay readable even where the helix twists thin.

const Strand = {
  ROW: 24,          // CSS pixels per base pair (vertically)
  PX: 4,            // size of one "pixel-art" pixel
  HEAD: 32,         // space above/below the strand for the 5' / 3' labels
  TURN: 10.5,       // base pairs per full helix turn (real B-DNA is about 10.5)
  COMPLEMENT: { A: 'T', T: 'A', G: 'C', C: 'G' },

  // =====================================================================
  // Biology (pure functions, no drawing) so they can be checked by hand
  // =====================================================================

  reverseComplement(dna) {
    return [...dna].reverse().map(b => this.COMPLEMENT[b] || 'N').join('');
  },

  // Amino acid letter for every complete codon ('*' = stop, 'X' = unreadable)
  codonsToAA(dna) {
    const out = [];
    for (let i = 0; i + 3 <= dna.length; i += 3) {
      const codon = dna.slice(i, i + 3);
      out.push(/[^ACGT]/.test(codon) ? 'X' : Learn.aaOf(codon));
    }
    return out;
  },

  // The protein the ribosome would make: read codons until the first stop.
  // stopped = false means no stop codon appeared before the CDS ran out.
  proteinOf(dna) {
    const aas = this.codonsToAA(dna);
    const stop = aas.indexOf('*');
    return { protein: (stop === -1 ? aas : aas.slice(0, stop)).join(''), stopped: stop !== -1, stopCodon: stop };
  },

  // Apply one mutation. pos is 0-based. kind: 'sub' (replace), 'ins' (insert after pos), 'del'.
  mutate(dna, { kind, pos, base }) {
    if (kind === 'sub') return dna.slice(0, pos) + base + dna.slice(pos + 1);
    if (kind === 'ins') return dna.slice(0, pos + 1) + base + dna.slice(pos + 1);
    return dna.slice(0, pos) + dna.slice(pos + 1);
  },

  three(letter) { return letter === '*' ? 'Ter' : (Learn.info(letter)?.three || 'Xaa'); },

  // Explain what a mutation does to the protein.
  // Returns { type, notation, text } where notation uses the standard HGVS protein style
  // (e.g. p.Ser6Pro), which is what papers and databases use.
  classify(original, mutated, mut) {
    const O = this.proteinOf(original), M = this.proteinOf(mutated);
    const c = Math.floor(mut.pos / 3);    // codon index (0-based) of the mutated base

    if (mut.kind === 'sub') {
      const oldCodon = original.slice(c * 3, c * 3 + 3), newCodon = mutated.slice(c * 3, c * 3 + 3);
      const oa = Learn.aaOf(oldCodon), ma = Learn.aaOf(newCodon);
      const codonText = `Codon ${c + 1} changes from ${oldCodon} to ${newCodon}.`;
      if (c === 0 && oldCodon === 'ATG' && newCodon !== 'ATG') {
        return { type: 'Start codon lost', notation: 'p.Met1?', term: null,
          text: `${codonText} The start codon is destroyed, so the ribosome may not start here at all, or may start at a later ATG. The result can't be predicted from the CDS alone, which is why the notation uses "?".` };
      }
      if (oa === '*' && ma !== '*') {
        return { type: 'Stop codon lost', notation: `p.Ter${c + 1}${this.three(ma)}ext*?`, term: null,
          text: `${codonText} The stop codon now codes for ${Learn.info(ma).name}, so the ribosome keeps reading past the end of the gene into the 3' UTR, which is not part of the CDS. The protein gets longer, but by how much can't be told from here.` };
      }
      if (oa === ma) {
        return { type: 'Silent', notation: `p.${this.three(oa)}${c + 1}=`, term: 'silent',
          text: `${codonText} Both codons code for ${oa === '*' ? 'stop' : Learn.info(oa).name}, so the protein is unchanged. This works because the genetic code has several codons for most amino acids.` };
      }
      if (ma === '*') {
        const kept = (c / O.protein.length * 100).toFixed(0);
        return { type: 'Nonsense', notation: `p.${this.three(oa)}${c + 1}Ter`, term: 'nonsense',
          text: `${codonText} ${Learn.info(oa).name} is replaced by a stop codon, so the protein ends after ${c} amino acids instead of ${O.protein.length} (${kept}% of its normal length). A cut-short protein usually doesn't work, and cells often destroy the mRNA before it is used.` };
      }
      const oc = Learn.CLASS_LABEL[Learn.info(oa).cls], mc = Learn.CLASS_LABEL[Learn.info(ma).cls];
      const classNote = oc === mc
        ? `Both are ${oc.toLowerCase()}, a similar kind of amino acid, so the effect may be mild.`
        : `It swaps a ${oc.toLowerCase()} amino acid for a ${mc.toLowerCase()} one. Changes like this are more likely to disturb how the protein folds.`;
      return { type: 'Missense', notation: `p.${this.three(oa)}${c + 1}${this.three(ma)}`, term: 'missense',
        text: `${codonText} ${Learn.info(oa).name} becomes ${Learn.info(ma).name}. ${classNote} Whether it actually causes disease depends on where in the protein it is.` };
    }

    // Insertion or deletion of 1 base: everything after it is read in a new frame.
    const what = mut.kind === 'ins' ? 'Inserting one base' : 'Deleting one base';
    let d = 0;   // first amino acid that differs
    while (d < O.protein.length && d < M.protein.length && O.protein[d] === M.protein[d]) d++;
    const startNote = original.startsWith('ATG') && !mutated.startsWith('ATG') ? ' It also destroys the start codon.' : '';
    if (d >= O.protein.length && M.stopped && M.protein.length === O.protein.length) {
      return { type: 'Frameshift (after the stop)', notation: 'no protein change', term: 'frameshift',
        text: `${what} after the stop codon doesn't change the protein, because the ribosome has already stopped.` };
    }
    if (!M.stopped) {
      return { type: 'Frameshift', notation: `p.${this.three(O.protein[d] || '*')}${d + 1}fs`, term: 'frameshift',
        text: `${what} shifts the reading frame from codon ${d + 1} onwards. The first ${d} amino acids are unchanged, but after that every codon is read wrongly and no stop codon appears before the CDS ends. The protein would run on into the 3' UTR, which isn't shown here.${startNote}` };
    }
    const newPart = M.protein.length - d;
    const notation = newPart === 0
      ? `p.${this.three(O.protein[d])}${d + 1}Ter`
      : `p.${this.three(O.protein[d])}${d + 1}${this.three(M.protein[d])}fsTer${newPart + 1}`;
    return { type: 'Frameshift', notation, term: 'frameshift',
      text: `${what} shifts the reading frame from codon ${d + 1} onwards. The first ${d} amino acids are unchanged, then ${newPart} wrong amino acid(s) are added before an early stop codon. The protein has ${M.protein.length} amino acids instead of ${O.protein.length}.${startNote} Watch the highlighted codons on the strand: every one after the change is different.` };
  },

  // Primer pair from two regions [start, end] (0-based, inclusive) of the top strand.
  primerPair(dna, fwd, rev) {
    const forward = dna.slice(fwd[0], fwd[1] + 1);
    const reverse = this.reverseComplement(dna.slice(rev[0], rev[1] + 1));
    const f = Calc.primerTm({ seq: forward, naMolar: 0.05 });
    const r = Calc.primerTm({ seq: reverse, naMolar: 0.05 });
    const warnings = [];
    if (rev[0] <= fwd[1]) warnings.push('The reverse primer must sit after (further down than) the forward primer, or the two will not make a product.');
    if (Math.abs(f.tm - r.tm) > 5) warnings.push(`The two Tm values differ by ${fmt(Math.abs(f.tm - r.tm))} °C. Aim for less than 5 °C so both primers work at the same annealing temperature.`);
    return { forward, reverse, f, r, productSize: rev[1] - fwd[0] + 1, warnings };
  },

  // =====================================================================
  // Screen
  // =====================================================================

  // Draw `cds` inside `box`. Safe to call again (e.g. for a new gene): it starts fresh.
  render(box, cds) {
    box.innerHTML = `
      <div class="segmented strand-modes">
        <button class="seg-btn active" data-mode="look">Look</button>
        <button class="seg-btn" data-mode="mutate">Mutate</button>
        <button class="seg-btn" data-mode="primers">Primers</button>
      </div>
      <div class="strand-scroll"><canvas></canvas><div class="strand-spacer"></div></div>
      <div class="strand-info"></div>`;
    const scroller = box.querySelector('.strand-scroll');
    const canvas = box.querySelector('canvas');
    const spacer = box.querySelector('.strand-spacer');
    const info = box.querySelector('.strand-info');

    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    const state = {
      original: cds, cds, mode: 'look', selected: null, width: 0, height: 0,
      mutation: null,                      // { kind, pos, base } while a mutation is shown
      primers: { fwd: null, rev: null, pendingStart: null },
      colours: { A: v('--base-A'), T: v('--base-T'), G: v('--base-G'), C: v('--base-C') },
      aaColours: { nonpolar: v('--aa-nonpolar'), polar: v('--aa-polar'), basic: v('--aa-basic'), acidic: v('--aa-acidic') },
      border: v('--border'), muted: v('--muted'), text: v('--text'), bg: v('--bg'),
      font: getComputedStyle(document.body).fontFamily,
      aaClass: Object.fromEntries(Learn.AMINO.map(a => [a.one, a.cls])),
      originalAA: this.codonsToAA(cds)
    };
    this.refreshDerived(state);
    const redraw = () => this.draw(state, scroller.scrollTop);

    // Size the canvas to the box. The canvas "sticks" to the top of the scroll box while
    // the spacer below it makes the box as tall as the whole strand, so the scrollbar
    // is right. Re-run when the box changes size (phone rotated) or the strand length
    // changes (insertion/deletion).
    const resize = () => {
      state.width = scroller.clientWidth;
      state.height = scroller.clientHeight;
      if (!state.width) return;
      const total = this.HEAD * 2 + state.cds.length * this.ROW;
      spacer.style.height = Math.max(0, total - state.height) + 'px';
      // Draw at the screen's real resolution so pixels stay sharp on high-DPI phones.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = state.width * dpr;
      canvas.height = state.height * dpr;
      canvas.style.width = state.width + 'px';
      canvas.style.height = state.height + 'px';
      state.ctx = canvas.getContext('2d');
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    resize();
    new ResizeObserver(resize).observe(scroller);

    // Redraw at most once per screen frame while scrolling.
    let pending = false;
    scroller.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; redraw(); });
    });

    // Switching mode always goes back to the original, unmutated sequence.
    const setMode = mode => {
      state.mode = mode;
      state.selected = null;
      state.mutation = null;
      state.cds = state.original;
      state.primers = { fwd: null, rev: null, pendingStart: null };
      this.refreshDerived(state);
      box.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      this.showInfo(state, info, { resize, redraw });
      resize();
    };
    box.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

    // Tap -> which row? (tap position + how far we've scrolled - header) / row height
    canvas.addEventListener('click', e => {
      const y = e.clientY - canvas.getBoundingClientRect().top + scroller.scrollTop - this.HEAD;
      const i = Math.floor(y / this.ROW);
      if (i < 0 || i >= state.cds.length) return;
      if (state.mode === 'primers') this.tapPrimer(state, i);
      else state.selected = i;
      this.showInfo(state, info, { resize, redraw });
      redraw();
    });

    this.showInfo(state, info, { resize, redraw });
  },

  // Things that depend on the current sequence, recalculated after each mutation
  refreshDerived(state) {
    state.currentAA = this.codonsToAA(state.cds);
    state.firstStop = state.currentAA.indexOf('*');          // codon index, or -1
    state.hasStart = state.cds.startsWith('ATG');
  },

  // Primer mode: taps come in pairs (first base, last base): forward first, then reverse.
  tapPrimer(state, i) {
    const p = state.primers;
    if (p.fwd && p.rev) { p.fwd = null; p.rev = null; }      // a 5th tap starts over
    if (p.pendingStart === null) { p.pendingStart = i; return; }
    const region = [Math.min(p.pendingStart, i), Math.max(p.pendingStart, i)];
    p.pendingStart = null;
    if (!p.fwd) p.fwd = region; else p.rev = region;
  },

  // The panel under the strand. Its content depends on the mode.
  showInfo(state, info, { resize, redraw }) {
    const col = x => `<span class="b-${x}">${x}</span>`;
    const seqHtml = s => `<span class="codon">${[...s].map(col).join('')}</span>`;

    if (state.mode === 'look') {
      info.innerHTML = state.selected === null ? '<p class="note">Tap a base pair for details.</p>' : `<p>${this.describe(state, state.selected)}</p>`;
      return;
    }

    if (state.mode === 'mutate') {
      if (state.mutation) {
        const r = this.classify(state.original, state.cds, state.mutation);
        const label = r.term ? Explore.term(r.type, r.term) : `<b>${r.type}</b>`;
        info.innerHTML = `
          <div class="result mut-result">
            <div class="answer">${label}</div>
            <p class="notation">${Explore.term('Notation', 'hgvs')}: <b>${r.notation}</b></p>
            <p>${r.text}</p>
            <button class="btn secondary" data-undo>Undo mutation</button>
          </div>`;
        info.querySelector('[data-undo]').onclick = () => {
          state.mutation = null; state.cds = state.original; state.selected = null;
          this.refreshDerived(state); this.showInfo(state, info, { resize, redraw }); resize();
        };
        return;
      }
      if (state.selected === null) {
        info.innerHTML = '<p class="note">Tap any base, then choose how to change it. One mutation at a time; Undo puts the gene back.</p>';
        return;
      }
      const i = state.selected, b = state.cds[i];
      const buttons = (kind, list) => list.map(x => `<button class="base-btn b-${x}" data-kind="${kind}" data-base="${x}">${x}</button>`).join('');
      info.innerHTML = `
        <p>${this.describe(state, i)}</p>
        <div class="mut-row"><span>Change to</span>${buttons('sub', ['A', 'C', 'G', 'T'].filter(x => x !== b))}</div>
        <div class="mut-row"><span>Insert after</span>${buttons('ins', ['A', 'C', 'G', 'T'])}</div>
        <div class="mut-row"><span>Or</span><button class="btn secondary del-btn" data-kind="del">Delete ${b}</button></div>`;
      info.querySelectorAll('[data-kind]').forEach(btn => btn.onclick = () => {
        state.mutation = { kind: btn.dataset.kind, pos: i, base: btn.dataset.base };
        state.cds = this.mutate(state.original, state.mutation);
        this.refreshDerived(state);
        this.showInfo(state, info, { resize, redraw });
        resize();   // an insertion/deletion changes the strand's length
      });
      return;
    }

    // Primers
    const p = state.primers;
    const step = p.pendingStart !== null
      ? `Step ${p.fwd ? 4 : 2}: now tap the <b>last</b> base of the ${p.fwd ? 'reverse' : 'forward'} primer, about 18 to 30 rows below the first.`
      : !p.fwd ? 'Step 1: tap the <b>first</b> base of the <b>forward</b> primer, near the <b>top</b> of the strand.'
      : !p.rev ? 'Step 3: scroll <b>down</b> past the forward primer and tap the <b>first</b> base of the <b>reverse</b> primer.'
      : 'Done. Tap the strand again to start over.';

    // Beginner guide: open until both primers are picked, then folded away.
    const guide = `
      <details class="primer-guide" ${p.fwd && p.rev ? '' : 'open'}>
        <summary>How do I pick primers?</summary>
        <ol class="steps">
          <li><b>Up and down = position along the gene.</b> The top of the strand is the start (5' end) of the gene, the bottom is the end. Left and right are the two strands, not positions.</li>
          <li><b>Forward primer: near the top.</b> Tap its first base, then its last base about 18 to 30 rows below. It is a copy of the <b>left</b> strand, read 5'→3' downwards (green bar, arrow points down).</li>
          <li><b>Reverse primer: further down,</b> below the forward primer. Tap its first and last base the same way. It sticks to the <b>left</b> strand, so its sequence is the <b>right</b> strand read upwards (blue bar, arrow points up). That is why it is shown as the "reverse complement".</li>
          <li><b>Everything between them gets copied</b> by PCR. That is your product.</li>
          <li>It does not matter where in a row you tap; the whole base pair is picked.</li>
        </ol>
        <p><b>What makes a good primer</b></p>
        <ul class="plain-list">
          <li>18 to 30 bases long.</li>
          <li>40 to 60% GC.</li>
          <li>Both Tm values within 5 °C of each other.</li>
          <li>Ending in a G or C (a "GC clamp") helps the 3' end grip, but avoid more than 3 G or C in the last 5 bases.</li>
        </ul>
        <p class="note">The app checks the first three for you and warns if something is off.</p>
      </details>`;
    let body = '';
    const tooLong = r => r && r[1] - r[0] + 1 > 60;
    if (tooLong(p.fwd) || tooLong(p.rev)) {
      body = '<p class="error">That stretch is longer than 60 bases. Primers are usually 18 to 30 bases, so pick a shorter stretch.</p>';
    } else if (p.fwd) {
      const fSeq = state.cds.slice(p.fwd[0], p.fwd[1] + 1);
      const f = Calc.primerTm({ seq: fSeq, naMolar: 0.05 });
      const line = (name, seq, t) => `<p><b>${name}</b> 5'-${seqHtml(seq)}-3'<br>
        <span class="note">${seq.length} nt · ${fmt(t.gcPct)}% GC · Tm ${fmt(t.tm)} °C</span></p>`;
      body = line('Forward', fSeq, f);
      if (p.rev) {
        const pair = this.primerPair(state.cds, p.fwd, p.rev);
        body = line('Forward', pair.forward, pair.f) + line('Reverse', pair.reverse, pair.r) + `
          <p>${Explore.term('PCR product', 'product')}: <b>${pair.productSize} bp</b> (from base ${p.fwd[0] + 1} to ${p.rev[1] + 1})</p>
          <p class="note">The reverse primer is the <b>reverse complement</b> of the top strand: it binds the top strand and is read 5'→3' up the bottom strand (see its arrow).</p>`;
        const warns = [...pair.warnings, ...pair.f.warnings.map(w => 'Forward: ' + w), ...pair.r.warnings.map(w => 'Reverse: ' + w)];
        body += warns.map(w => `<p class="warn">Warning: ${w}</p>`).join('');
        body += '<p class="note">Tm uses the salt-adjusted formula at 50 mM Na+ (see the Primer Tm tool). It is an estimate.</p>';
      }
    }
    info.innerHTML = `${guide}<p class="primer-step">${step}</p>${body}`;
  },

  // Text for one tapped base pair
  describe(state, i) {
    const b = state.cds[i], pair = this.COMPLEMENT[b] || '?';
    const start = i - (i % 3);
    const codon = state.cds.slice(start, start + 3);
    let what = 'an incomplete codon at the end';
    if (codon.length === 3 && !/[^ACGT]/.test(codon)) {
      const a = Learn.info(Learn.aaOf(codon));
      what = a.one === '*' ? 'a <b>stop codon</b>' : `${a.name} (${a.three}, ${a.one})`;
      if (start === 0 && codon === 'ATG') what += ', the <b>start codon</b>';
    }
    const col = x => `<span class="b-${x}">${x}</span>`;
    return `Base pair <b>${i + 1}</b>: ${col(b)}–${col(pair)} · codon ${start / 3 + 1} ` +
           `(<span class="codon">${[...codon].map(col).join('')}</span>) → ${what}`;
  },

  draw(state, scrollTop) {
    const { ctx, width: W, height: H, cds } = state;
    if (!ctx || !W) return;
    const { ROW, PX, HEAD } = this;
    const n = cds.length;
    const snap = x => Math.round(x / PX) * PX;   // lock to the pixel-art grid

    // Column positions. The layout is at most 340px wide and centred, so on a wide
    // screen the helix keeps its shape instead of stretching flat.
    const layoutW = Math.min(W, 340), left = Math.floor((W - layoutW) / 2);
    const numRight = left + 30, letterL = left + 46, labelX = left + layoutW - 74, letterR = left + layoutW - 86;
    const helixL = letterL + 16, helixR = letterR - 14;
    const cx = (helixL + helixR) / 2, amp = Math.min(64, (helixR - helixL) / 2 - PX);

    ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // Only rows that are (partly) on screen
    const first = Math.max(0, Math.floor((scrollTop - HEAD) / ROW) - 1);
    const last = Math.min(n - 1, Math.ceil((scrollTop + H - HEAD) / ROW) + 1);
    const rowY = i => HEAD + i * ROW - scrollTop;

    // 5' / 3' labels: top strand runs 5'->3' downwards, its partner runs the other way
    ctx.font = `bold 12px ${state.font}`;
    ctx.fillStyle = state.muted;
    ctx.textAlign = 'center';
    const topY = HEAD / 2 - scrollTop, endY = HEAD + n * ROW + HEAD / 2 - scrollTop;
    ctx.fillText("5'", letterL, topY); ctx.fillText("3'", letterR, topY);
    ctx.fillText("3'", letterL, endY); ctx.fillText("5'", letterR, endY);

    const selCodon = state.selected === null ? -1 : state.selected - (state.selected % 3);
    const stopRow = state.firstStop === -1 ? -1 : state.firstStop * 3;
    const mut = state.mutation;
    const inRegion = (r, i) => r && i >= r[0] && i <= r[1];

    for (let i = first; i <= last; i++) {
      const y = rowY(i);
      const b = cds[i], pair = this.COMPLEMENT[b];
      const codonStart = i - (i % 3), codonIndex = codonStart / 3;

      // Background tints: start codon green, (first) stop codon red, tapped codon white
      if (state.hasStart && i < 3) { ctx.fillStyle = 'rgba(74,222,128,0.18)'; ctx.fillRect(0, y, W, ROW); }
      if (stopRow !== -1 && i >= stopRow && i < stopRow + 3) { ctx.fillStyle = 'rgba(255,93,93,0.18)'; ctx.fillRect(0, y, W, ROW); }
      if (codonStart === selCodon && !mut) { ctx.fillStyle = 'rgba(232,236,255,0.10)'; ctx.fillRect(0, y, W, ROW); }
      // Primer regions: a light band across the row
      if (inRegion(state.primers.fwd, i) || inRegion(state.primers.rev, i)) {
        ctx.fillStyle = 'rgba(232,236,255,0.08)'; ctx.fillRect(0, y, W, ROW);
      }

      // Dashed codon divider above every third base pair
      if (i % 3 === 0 && i > 0) {
        ctx.fillStyle = state.border;
        for (let x = letterL - 8; x < left + layoutW - 4; x += 8) ctx.fillRect(x, y, 4, 1);
      }

      // The helix. Each row is drawn in thin slices so the backbone stays continuous
      // even where it moves sideways fast. Angle -> x position via cos; sin tells us
      // which strand is in front at that moment (front is bright, back is dim).
      const slices = ROW / PX;
      const backbone = [];
      for (let k = 0; k < slices; k++) {
        const angle = 2 * Math.PI * (i + k / slices) / this.TURN;
        const x1 = snap(cx + amp * Math.cos(angle)), x2 = snap(cx - amp * Math.cos(angle));
        const front1 = Math.sin(angle) >= 0;
        backbone.push({ y: y + k * PX, x1, x2, front1 });
      }
      // Back strand first, then the rung (base pair), then the front strand on top
      for (const s of backbone) {
        ctx.fillStyle = '#4a5280';
        ctx.fillRect((s.front1 ? s.x2 : s.x1) - PX, s.y, PX * 2, PX);
      }
      const mid = backbone[slices / 2];   // rung sits in the middle of the row
      const rungY = y + ROW / 2 - PX / 2;
      const half = snap((mid.x1 + mid.x2) / 2);
      ctx.fillStyle = state.colours[b] || state.muted;
      ctx.fillRect(Math.min(mid.x1, half), rungY, Math.abs(half - mid.x1), PX);
      ctx.fillStyle = state.colours[pair] || state.muted;
      ctx.fillRect(Math.min(mid.x2, half), rungY, Math.abs(half - mid.x2), PX);
      for (const s of backbone) {
        ctx.fillStyle = state.text;
        ctx.fillRect((s.front1 ? s.x1 : s.x2) - PX, s.y, PX * 2, PX);
      }

      // Letters in fixed columns, always readable
      ctx.font = `bold 13px ${state.font}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = state.colours[b] || state.muted;
      ctx.fillText(b, letterL, y + ROW / 2 + 1);
      ctx.fillStyle = state.colours[pair] || state.muted;
      ctx.fillText(pair || '?', letterR, y + ROW / 2 + 1);

      // Position number on the first base and every 10th
      if (i === 0 || (i + 1) % 10 === 0) {
        ctx.font = `10px ${state.font}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = state.muted;
        ctx.fillText(String(i + 1), numRight, y + ROW / 2 + 1);
      }

      // Codon and amino acid, beside the middle row of each codon.
      // After a mutation: changed amino acids get a yellow box; codons after the first
      // stop are greyed out, because the ribosome never reads them.
      if (i % 3 === 1) {
        const codon = cds.slice(codonStart, codonStart + 3);
        if (codon.length === 3 && !/[^ACGT]/.test(codon)) {
          const letter = state.currentAA[codonIndex];
          const unread = state.firstStop !== -1 && codonIndex > state.firstStop;
          const changed = mut && !unread && letter !== state.originalAA[codonIndex];
          if (changed) {
            ctx.fillStyle = 'rgba(255,212,59,0.25)';
            ctx.fillRect(labelX - 3, y + 3, 64, ROW - 6);
          }
          ctx.font = `11px ${state.font}`;
          ctx.textAlign = 'left';
          ctx.fillStyle = state.muted;
          ctx.fillText(codon, labelX, y + ROW / 2 + 1);
          ctx.font = `bold 11px ${state.font}`;
          ctx.fillStyle = unread ? state.border
            : letter === '*' ? state.colours.T : (state.aaColours[state.aaClass[letter]] || state.text);
          ctx.fillText(unread ? '···' : this.three(letter).replace('Ter', 'Stop'), labelX + 30, y + ROW / 2 + 1);
        }
      }

      // Mutation marker: yellow box on a changed/inserted base, red line where one was deleted
      if (mut) {
        const marked = mut.kind === 'ins' ? mut.pos + 1 : mut.pos;
        if (i === marked && mut.kind !== 'del') {
          ctx.strokeStyle = state.colours.G; ctx.lineWidth = 2;
          ctx.strokeRect(letterL - 10, y + 1, letterR - letterL + 20, ROW - 2);
        }
        if (i === mut.pos && mut.kind === 'del') {
          ctx.fillStyle = state.colours.T;
          for (let x = letterL - 10; x < letterR + 10; x += 8) ctx.fillRect(x, y - 1, 5, 3);
          ctx.font = `bold 10px ${state.font}`; ctx.textAlign = 'right';
          ctx.fillText('del', numRight, y + 1);
        }
      }

      // Primer bars with arrows. The forward primer is part of the top strand and reads
      // 5'->3' downwards; the reverse primer matches the bottom strand and reads upwards.
      this.drawPrimerBar(ctx, state.primers.fwd, i, y, letterL - 14, 'down', state.colours.A);
      this.drawPrimerBar(ctx, state.primers.rev, i, y, letterR + 8, 'up', state.colours.C);
      if (state.primers.pendingStart === i) {
        ctx.strokeStyle = state.text; ctx.lineWidth = 2;
        ctx.strokeRect(letterL - 10, y + 1, letterR - letterL + 20, ROW - 2);
      }

      // Outline the exact base pair that was tapped
      if (i === state.selected && !mut) {
        ctx.strokeStyle = state.text;
        ctx.lineWidth = 1;
        ctx.strokeRect(letterL - 10.5, y + 0.5, letterR - letterL + 20, ROW - 1);
      }
    }
  },

  drawPrimerBar(ctx, region, i, y, x, direction, colour) {
    if (!region || i < region[0] || i > region[1]) return;
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, this.PX, this.ROW);
    // Arrowhead at the 3' end: the end of the primer the polymerase extends from
    const tip = direction === 'down' ? region[1] : region[0];
    if (i !== tip) return;
    const P = this.PX;
    if (direction === 'down') {
      ctx.fillRect(x - P, y + this.ROW - 2 * P, 3 * P, P);
      ctx.fillRect(x, y + this.ROW - P, P, P);
    } else {
      ctx.fillRect(x - P, y + P, 3 * P, P);
      ctx.fillRect(x, y, P, P);
    }
  }
};

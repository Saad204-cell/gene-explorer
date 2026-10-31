// Explore tab: search box, result list, and the gene card.
// Data comes from api.js; this file only decides what to show and how.

// Escape text from the internet before putting it in the page. Without this, a
// database record containing "<" could break (or hijack) the layout.
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Plain-English explanations for the "What does this mean?" taps.
const Glossary = {
  accession: ['Accession number', 'A unique ID that a database gives to one record, like a library catalogue number. UniProt\'s looks like P01308. It never changes, so scientists use it to point at exactly the same record.'],
  uniprotid: ['UniProt ID (entry name)', 'A readable label for the protein: a short protein name, an underscore, then a species code, e.g. INS_HUMAN means "insulin in human". Unlike the accession number it can occasionally be renamed.'],
  cds: ['CDS (coding sequence)', 'The part of a gene\'s DNA that is read by the ribosome to build the protein: from the start codon to the stop codon. Introns (removed pieces) and the untranslated ends are left out. Its length is always a multiple of 3, because each codon of 3 bases codes for 1 amino acid.'],
  gc: ['GC content', 'The percentage of bases in the sequence that are G or C. G-C pairs have 3 hydrogen bonds and A-T pairs only 2, so a high GC content means DNA that is harder to melt apart.'],
  startcodon: ['Start codon', 'The three bases (almost always ATG) where translation begins. ATG also codes for the amino acid methionine, which is why many proteins start with M.'],
  stopcodon: ['Stop codon', 'TAA, TAG or TGA. No amino acid matches these, so when the ribosome reaches one it stops and releases the finished protein.'],
  isoform: ['Isoform', 'Many genes can produce several slightly different versions of their protein, for example by skipping a piece of the RNA. Each version is an isoform. UniProt shows the "canonical" one, its chosen reference version, here.'],
  silent: ['Silent mutation', 'A DNA change that does not change the amino acid, because the new codon codes for the same one (e.g. CTT and CTC are both leucine). The protein stays the same.'],
  missense: ['Missense mutation', 'A DNA change that swaps one amino acid for another. Sickle cell disease is caused by a missense mutation in HBB (Glu to Val at position 7, counting the starting Met).'],
  nonsense: ['Nonsense mutation', 'A DNA change that turns an amino acid codon into a stop codon. The protein is cut short, and the shortened mRNA is often destroyed by the cell before it is used.'],
  frameshift: ['Frameshift mutation', 'Inserting or deleting bases (not in a multiple of 3) shifts how the sequence is split into codons. Every codon after the change is read wrongly, usually until an early stop codon appears.'],
  hgvs: ['Mutation notation (HGVS)', 'The standard way scientists write protein changes. p.Ser6Pro means "in the protein, serine at position 6 became proline". Ter means stop, fs means frameshift, and = means no change.'],
  product: ['PCR product', 'The piece of DNA that PCR copies: from the start of the forward primer to the end of the reverse primer. Its size in bp is what you check on a gel.'],
  plddt: ['pLDDT', 'AlphaFold\'s confidence score for each amino acid in a predicted 3D structure, from 0 to 100. Above 90 (dark blue): the position is very likely right. 70 to 90 (light blue): the overall fold is likely right. 50 to 70 (yellow): low confidence. Below 50 (orange): treat as a guess; these parts are often naturally floppy. The structure is a prediction, not an experiment.']
};

const Explore = {
  organisms: [
    ['9606', 'Human'], ['10090', 'Mouse'], ['10116', 'Rat'], ['7955', 'Zebrafish'],
    ['7227', 'Fruit fly'], ['83333', 'E. coli K-12'], ['559292', 'Baker\'s yeast'],
    ['3702', 'Arabidopsis'], ['4565', 'Wheat'], ['6100', 'Jellyfish (Aequorea)'], ['', 'Any organism']
  ],
  chips: [
    { label: 'insulin', q: 'insulin', org: '9606' },
    { label: 'hemoglobin', q: 'hemoglobin', org: '9606' },
    { label: 'GFP', q: 'green fluorescent protein', org: '6100' }
  ],
  lastResults: null,   // kept so the Back gesture returns to the same results
  token: 0,            // bumped on each new load, so a slow old request can't overwrite a new one

  init() {
    document.getElementById('ex-org').innerHTML = this.organisms.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    document.getElementById('ex-chips').innerHTML = this.chips.map((c, i) => `<button class="chip" data-chip="${i}">${c.label}</button>`).join('');
    document.getElementById('ex-form').onsubmit = e => { e.preventDefault(); this.search(); };
    document.getElementById('ex-chips').onclick = e => {
      const chip = this.chips[e.target.dataset.chip];
      if (!chip) return;
      document.getElementById('ex-q').value = chip.q;
      document.getElementById('ex-org').value = chip.org;
      this.search();
    };
    // One handler for every "?" term button on the page (event delegation).
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-term]');
      if (t) this.showTerm(t.dataset.term);
      if (e.target.closest('#sheet-close') || e.target.id === 'sheet') document.getElementById('sheet').hidden = true;
    });
  },

  // Called by the router. sub = a UniProt accession from the URL, or undefined for search.
  show(sub) {
    const searchView = document.getElementById('ex-search-view');
    const cardView = document.getElementById('ex-card');
    searchView.hidden = !!sub;
    cardView.hidden = !sub;
    if (sub) this.loadGene(sub);
    else this.token++;   // leaving the card: ignore any request still in flight
  },

  // A tappable term with an explanation
  term(label, key) {
    return `<button class="term" data-term="${key}">${label}<span aria-hidden="true"> ?</span></button>`;
  },
  showTerm(key) {
    const [title, body] = Glossary[key];
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').textContent = body;
    document.getElementById('sheet').hidden = false;
  },

  // ---------- loading bar ----------
  setProgress(box, pct, label) {
    box.innerHTML = `<div class="loadbar"><div class="loadbar-fill" style="width:${pct}%"></div></div><p class="note">${esc(label)}</p>`;
  },
  showError(box, e) {
    box.innerHTML = `<div class="result bad"><span class="error">${esc(e.message || 'Something went wrong.')}</span></div>`;
  },

  // ---------- search ----------
  async search() {
    const q = document.getElementById('ex-q').value.trim();
    const org = document.getElementById('ex-org').value;
    const box = document.getElementById('ex-status');
    const list = document.getElementById('ex-results');
    if (!q) { box.innerHTML = '<p class="warn">Type a gene or protein name first, for example insulin or BRCA1.</p>'; return; }
    list.innerHTML = '';
    const my = ++this.token;
    this.setProgress(box, 30, 'Searching UniProt…');
    try {
      const results = await Api.searchGenes(q, org);
      if (my !== this.token) return;
      this.lastResults = results;
      this.setProgress(box, 100, '');
      box.innerHTML = '';
      this.renderResults(results, q, org);
    } catch (e) {
      if (my === this.token) this.showError(box, e);
    }
  },

  renderResults(results, q, org) {
    const list = document.getElementById('ex-results');
    if (!results.length) {
      const orgName = this.organisms.find(o => o[0] === org)?.[1] || 'that organism';
      list.innerHTML = `<div class="panel"><p>No reviewed UniProt entry matches "<b>${esc(q)}</b>" in ${esc(orgName)}.</p>
        <p class="note">Try the gene symbol (like INS or TP53), a different spelling, or "Any organism".</p></div>`;
      return;
    }
    list.innerHTML = '<p class="note">Tap the one you mean:</p>' + results.map(r => `
      <a class="result-row" href="#explore/${esc(r.accession)}">
        <div class="aa-name">${esc(r.protein)}</div>
        <div class="aa-sub">${r.gene ? esc(r.gene) + ' · ' : ''}${esc(r.organism)} · ${r.length} aa · ${esc(r.accession)}</div>
      </a>`).join('');
  },

  // ---------- gene card ----------
  async loadGene(accession) {
    const my = ++this.token;
    const card = document.getElementById('ex-card');
    card.innerHTML = `<a href="#explore" class="btn secondary back-btn" style="display:inline-block;text-decoration:none">&lt; Back</a><div id="card-status"></div><div id="card-body"></div>`;
    const status = document.getElementById('card-status');
    this.setProgress(status, 15, 'Fetching protein facts from UniProt…');
    try {
      const entry = await Api.getEntry(accession);
      if (my !== this.token) return;
      document.getElementById('card-body').innerHTML = this.cardHtml(entry);
      this.wirePanels(entry, my);
      App.showFeedbackLinks(document.getElementById('card-body'));
      this.setProgress(status, 45, 'Finding the coding sequence (Ensembl, then NCBI)…');

      // Gene length and CDS are independent, so ask for both at once.
      const geneLength = Api.getGeneLength(entry).then(len => {
        if (my === this.token) document.getElementById('gene-length').textContent = len ? len.toLocaleString() + ' bp' : 'not available';
      });
      const result = await Api.getCds(entry);
      if (my !== this.token) return;
      this.setProgress(status, 100, '');
      status.innerHTML = '';
      this.fillCds(entry, result);
      this.fillProtein(entry, result);
      if (result) App.sound('done');
      await geneLength;
    } catch (e) {
      if (my !== this.token) return;
      this.showError(status, e);
      // If the overview already showed, the CDS/protein panels need an explanation too
      const cdsPanel = document.getElementById('panel-cds');
      if (cdsPanel) cdsPanel.innerHTML = `<p class="error">${esc(e.message)}</p>`;
    }
  },

  // Overview card + the (initially empty) swipeable panels
  cardHtml(entry) {
    const name = entry.proteinDescription?.recommendedName?.fullName?.value
      || entry.proteinDescription?.submissionNames?.[0]?.fullName?.value || '(no name listed)';
    const gene = entry.genes?.[0]?.geneName?.value || 'not listed';
    const comment = type => (entry.comments || []).filter(c => c.commentType === type);

    // Function: show the first two sentences, rest behind "more"
    const fnText = comment('FUNCTION')[0]?.texts?.[0]?.value;
    let fnHtml = '<p class="note">UniProt lists no function for this protein.</p>';
    if (fnText) {
      const sentences = fnText.match(/[^.!?]+[.!?]+(\s|$)/g) || [fnText];
      const head = sentences.slice(0, 2).join('').trim();
      const rest = sentences.slice(2).join('').trim();
      fnHtml = `<p>${esc(head)}</p>${rest ? `<details><summary>Read more</summary><p>${esc(rest)}</p></details>` : ''}`;
    }

    const locs = [...new Set(comment('SUBCELLULAR LOCATION').flatMap(c => (c.subcellularLocations || []).map(l => l.location.value)))];
    const diseases = comment('DISEASE').map(c => c.disease).filter(Boolean);
    const diseaseHtml = diseases.length
      ? '<ul class="plain-list">' + diseases.slice(0, 5).map(d => `<li><b>${esc(d.diseaseId)}</b>${d.description ? ': ' + esc((d.description.match(/^.*?\.(\s|$)/) || [d.description])[0].trim()) : ''}</li>`).join('')
        + '</ul>' + (diseases.length > 5 ? `<p class="note">…and ${diseases.length - 5} more listed in UniProt.</p>` : '')
      : '<p class="note">No linked diseases listed in UniProt.</p>';

    return `
      <div class="panel">
        <h2 class="pixel">${esc(name)}</h2>
        <table class="facts">
          <tr><th>Gene</th><td>${esc(gene)}</td></tr>
          <tr><th>Organism</th><td>${esc(entry.organism?.scientificName || '')}${entry.organism?.commonName ? ' (' + esc(entry.organism.commonName) + ')' : ''}</td></tr>
          <tr><th>${this.term('Accession number', 'accession')}</th><td>${esc(entry.primaryAccession)}</td></tr>
          <tr><th>${this.term('UniProt ID', 'uniprotid')}</th><td>${esc(entry.uniProtkbId)}</td></tr>
          <tr><th>Protein length</th><td>${entry.sequence.length.toLocaleString()} amino acids</td></tr>
          <tr><th>${this.term('CDS', 'cds')} length</th><td id="cds-length">looking…</td></tr>
          <tr><th>Gene length</th><td id="gene-length">looking…</td></tr>
          <tr><th>Cell location</th><td>${locs.length ? esc(locs.join(', ')) : 'Not listed in UniProt'}</td></tr>
        </table>
        <h3>What it does</h3>${fnHtml}
        <h3>Linked diseases</h3>${diseaseHtml}
        <p class="note">${this.term('Isoform', 'isoform')}: this is UniProt's reference version. Text is from UniProt.</p>
      </div>

      <div class="segmented panel-tabs">
        <button class="seg-btn active" data-panel="0">CDS</button>
        <button class="seg-btn" data-panel="1">Protein</button>
        <button class="seg-btn" data-panel="2">3D</button>
      </div>
      <div class="panels" id="panels">
        <div class="panel-slide"><div class="panel" id="panel-cds"><p class="note">Fetching…</p></div></div>
        <div class="panel-slide"><div class="panel" id="panel-protein"><p class="note">Fetching…</p></div></div>
        <div class="panel-slide"><div class="panel" id="panel-3d">
          <h2 class="pixel">3D structure</h2>
          <p class="note">Swipe here or tap 3D to load the AlphaFold model.</p>
        </div></div>
      </div>
      <p class="note">Something wrong or confusing on this card?</p>
      <a class="btn secondary feedback-link" target="_blank" rel="noopener" hidden>Send feedback</a>`;
  },

  // Tabs <-> swipeable panels. The panels sit side by side in a horizontally scrolling
  // strip that snaps to each one; the tabs scroll it, and scrolling updates the tabs.
  // The 3D structure is only downloaded the first time its panel is reached, because
  // it is the biggest download and not everyone needs it.
  wirePanels(entry, my) {
    const strip = document.getElementById('panels');
    const tabs = [...document.querySelectorAll('[data-panel]')];
    let structureStarted = false;
    const onPanel = i => {
      tabs.forEach((t, n) => t.classList.toggle('active', n === i));
      if (i === 2 && !structureStarted) {
        structureStarted = true;
        Structure.show(document.getElementById('panel-3d'), entry, () => my === this.token);
      }
    };
    tabs.forEach(t => t.onclick = () => {
      strip.scrollTo({ left: strip.clientWidth * Number(t.dataset.panel), behavior: 'smooth' });
      onPanel(Number(t.dataset.panel));
    });
    strip.onscroll = () => onPanel(Math.round(strip.scrollLeft / strip.clientWidth));
  },

  // ---------- CDS panel ----------
  fillCds(entry, result) {
    const panel = document.getElementById('panel-cds');
    const lenCell = document.getElementById('cds-length');
    if (!result) {
      lenCell.textContent = 'not found';
      panel.innerHTML = `<h2 class="pixel">${this.term('Coding sequence', 'cds')}</h2>
        <p class="error">No coding sequence was found for this protein in Ensembl or NCBI. Nothing is shown rather than a guess.</p>`;
      return;
    }
    const { cds, source, id, differences } = result;
    lenCell.textContent = `${cds.length.toLocaleString()} bp`;
    const gc = [...cds].filter(b => b === 'G' || b === 'C').length / cds.length * 100;
    const hasStart = cds.startsWith('ATG');
    const hasStop = /^(TAA|TAG|TGA)$/.test(cds.slice(-3));
    const match = differences === 0
      ? '<p class="match-ok">Check passed: translating this CDS gives exactly the UniProt protein.</p>'
      : `<p class="warn">Warning: translating this CDS differs from the UniProt protein by ${differences} position(s). It may be a different isoform or a natural variant, so do not treat it as the same sequence.</p>`;

    // Show at most 3,000 bases on screen to keep phones fast. Copy and FASTA give everything.
    const LIMIT = 3000;
    let seq = '';
    for (let i = 0; i < Math.min(cds.length, LIMIT); i++) {
      const cls = [`b-${cds[i]}`];
      if (hasStart && i < 3) cls.push('start-codon');
      if (hasStop && i >= cds.length - 3) cls.push('stop-codon');
      seq += `<span class="${cls.join(' ')}">${cds[i]}</span>` + ((i + 1) % 10 === 0 ? ' ' : '');
    }
    if (cds.length > LIMIT) seq += `<p class="note">Showing the first ${LIMIT.toLocaleString()} of ${cds.length.toLocaleString()} bases. Copy and download include all of it.</p>`;

    panel.innerHTML = `
      <h2 class="pixel">${this.term('Coding sequence', 'cds')}</h2>
      <table class="facts">
        <tr><th>Length</th><td>${cds.length.toLocaleString()} bp (${cds.length / 3} codons, including the stop)</td></tr>
        <tr><th>${this.term('GC content', 'gc')}</th><td>${gc.toFixed(1)}%</td></tr>
        <tr><th>${this.term('Start codon', 'startcodon')}</th><td>${hasStart ? '<span class="start-codon">ATG</span> yes' : 'does not begin with ATG'}</td></tr>
        <tr><th>${this.term('Stop codon', 'stopcodon')}</th><td>${hasStop ? `<span class="stop-codon">${cds.slice(-3)}</span> yes` : 'not at the end of this record'}</td></tr>
        <tr><th>Source</th><td>${source} (${esc(id)})</td></tr>
      </table>
      ${match}
      <div class="segmented view-switch">
        <button class="seg-btn active" data-view="text">Text</button>
        <button class="seg-btn" data-view="strand">Strand</button>
      </div>
      <div class="seq" id="cds-text">${seq}</div>
      <div id="cds-strand" hidden></div>
      <button class="btn" id="btn-copy">Copy</button>
      <button class="btn secondary" id="btn-fasta">Download FASTA</button>
      <span id="copy-msg" class="note"></span>`;

    // Text / Strand switch. The strand is only drawn the first time it is opened,
    // because the canvas needs to be visible to know its width.
    let strandDrawn = false;
    panel.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => {
      const strand = btn.dataset.view === 'strand';
      panel.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('cds-text').hidden = strand;
      document.getElementById('cds-strand').hidden = !strand;
      if (strand && !strandDrawn) { Strand.render(document.getElementById('cds-strand'), cds); strandDrawn = true; }
    });

    document.getElementById('btn-copy').onclick = () => this.copy(cds);
    document.getElementById('btn-fasta').onclick = () => {
      const gene = entry.genes?.[0]?.geneName?.value || entry.primaryAccession;
      const header = `>${gene}|${entry.organism?.scientificName}|${entry.primaryAccession}|CDS|${source}:${id}`;
      const body = cds.match(/.{1,70}/g).join('\n');   // FASTA lines are conventionally 70 wide
      const url = URL.createObjectURL(new Blob([header + '\n' + body + '\n'], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${gene}_CDS.fasta`; a.click();
      URL.revokeObjectURL(url);
    };
  },

  // Clipboard API needs a secure page (https or localhost); fall back to a hidden textarea.
  async copy(text) {
    const msg = document.getElementById('copy-msg');
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = 'Copied!';
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      msg.textContent = document.execCommand('copy') ? 'Copied!' : 'Copy failed. Use Download instead.';
      ta.remove();
    }
  },

  // ---------- Protein panel ----------
  fillProtein(entry, result) {
    const protein = entry.sequence.value;
    const classOf = Object.fromEntries(Learn.AMINO.map(a => [a.one, a.cls]));
    const LIMIT = 3000;
    let seq = '';
    for (let i = 0; i < Math.min(protein.length, LIMIT); i++) {
      seq += `<span class="aa-${classOf[protein[i]] || 'other'}">${protein[i]}</span>` + ((i + 1) % 10 === 0 ? ' ' : '');
    }
    if (protein.length > LIMIT) seq += `<p class="note">Showing the first ${LIMIT.toLocaleString()} of ${protein.length.toLocaleString()} residues.</p>`;

    let compare;
    if (!result) compare = '<p class="note">No CDS was found, so the translate-and-compare check could not run.</p>';
    else {
      const translated = Api.translate(result.cds);
      compare = result.differences === 0
        ? `<p class="match-ok">Translate-and-compare: the CDS translates to ${translated.length} amino acids, identical to UniProt's.</p>`
        : `<p class="warn">Translate-and-compare: the CDS gives ${translated.length} amino acids, UniProt has ${protein.length}. ${result.differences} difference(s).</p>`;
    }
    document.getElementById('panel-protein').innerHTML = `
      <h2 class="pixel">Protein</h2>
      <p class="note">${protein.length.toLocaleString()} amino acids, one letter each, coloured by class:</p>
      <div class="legend">
        <span class="aa-nonpolar">Nonpolar</span> <span class="aa-polar">Polar</span>
        <span class="aa-basic">Basic (+)</span> <span class="aa-acidic">Acidic (−)</span>
      </div>
      <div class="seq">${seq}</div>
      ${compare}
      <button class="btn" id="btn-copy-prot">Copy</button><span id="copy-prot-msg" class="note"></span>`;
    document.getElementById('btn-copy-prot').onclick = async () => {
      try { await navigator.clipboard.writeText(protein); document.getElementById('copy-prot-msg').textContent = 'Copied!'; }
      catch (e) { document.getElementById('copy-prot-msg').textContent = 'Copy failed.'; }
    };
  }
};

// Learn: interactive codon table and amino acid reference cards. All data is
// hard-coded here, so this tab works offline.

const Learn = {
  // The standard genetic code. Codons are ordered T, C, A, G for each of the three
  // positions, so index = 16*first + 4*second + third. "*" means stop.
  BASES: ['T', 'C', 'A', 'G'],
  CODE: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',

  // Class names follow the common textbook grouping. Some residues (Gly, Cys, Tyr,
  // Trp, His) are classified differently between books; the note on the screen says so.
  AMINO: [
    { one: 'A', three: 'Ala', name: 'Alanine',       cls: 'nonpolar', chain: 'Methyl, –CH3' },
    { one: 'R', three: 'Arg', name: 'Arginine',      cls: 'basic',    chain: 'Guanidinium group, long and positively charged' },
    { one: 'N', three: 'Asn', name: 'Asparagine',    cls: 'polar',    chain: 'Amide, –CH2–CONH2' },
    { one: 'D', three: 'Asp', name: 'Aspartic acid', cls: 'acidic',   chain: 'Carboxylate, –CH2–COO−' },
    { one: 'C', three: 'Cys', name: 'Cysteine',      cls: 'polar',    chain: 'Thiol, –CH2–SH. Two Cys can form a disulfide bond' },
    { one: 'Q', three: 'Gln', name: 'Glutamine',     cls: 'polar',    chain: 'Amide, –(CH2)2–CONH2' },
    { one: 'E', three: 'Glu', name: 'Glutamic acid', cls: 'acidic',   chain: 'Carboxylate, –(CH2)2–COO−' },
    { one: 'G', three: 'Gly', name: 'Glycine',       cls: 'nonpolar', chain: 'Just a hydrogen, –H. The smallest amino acid' },
    { one: 'H', three: 'His', name: 'Histidine',     cls: 'basic',    chain: 'Imidazole ring. Only weakly basic (pKa near 6)' },
    { one: 'I', three: 'Ile', name: 'Isoleucine',    cls: 'nonpolar', chain: 'Branched hydrocarbon, –CH(CH3)CH2CH3' },
    { one: 'L', three: 'Leu', name: 'Leucine',       cls: 'nonpolar', chain: 'Branched hydrocarbon, –CH2CH(CH3)2' },
    { one: 'K', three: 'Lys', name: 'Lysine',        cls: 'basic',    chain: 'Amine, –(CH2)4–NH3+' },
    { one: 'M', three: 'Met', name: 'Methionine',    cls: 'nonpolar', chain: 'Thioether, –(CH2)2–S–CH3. ATG codes for it and also marks "start"' },
    { one: 'F', three: 'Phe', name: 'Phenylalanine', cls: 'nonpolar', chain: 'Benzyl, aromatic ring, –CH2–C6H5' },
    { one: 'P', three: 'Pro', name: 'Proline',       cls: 'nonpolar', chain: 'Ring that loops back onto the backbone nitrogen. Bends the chain' },
    { one: 'S', three: 'Ser', name: 'Serine',        cls: 'polar',    chain: 'Hydroxyl, –CH2–OH' },
    { one: 'T', three: 'Thr', name: 'Threonine',     cls: 'polar',    chain: 'Hydroxyl, –CH(OH)CH3' },
    { one: 'W', three: 'Trp', name: 'Tryptophan',    cls: 'nonpolar', chain: 'Indole, two fused aromatic rings. The largest amino acid' },
    { one: 'Y', three: 'Tyr', name: 'Tyrosine',      cls: 'polar',    chain: 'Phenol, aromatic ring with –OH, –CH2–C6H4–OH' },
    { one: 'V', three: 'Val', name: 'Valine',        cls: 'nonpolar', chain: 'Branched hydrocarbon, –CH(CH3)2' }
  ],
  CLASS_LABEL: { nonpolar: 'Nonpolar', polar: 'Polar (uncharged)', basic: 'Positively charged (basic)', acidic: 'Negatively charged (acidic)' },

  // State for the codon table
  firstBase: 'A',
  rna: false,
  selectedCodon: null,
  selectedAA: null,
  classFilter: 'all',

  // All codons (written with T) for an amino acid letter, or '*' for stop.
  codonsFor(letter) {
    const out = [];
    for (let i = 0; i < 64; i++) if (this.CODE[i] === letter) out.push(this.codonAt(i));
    return out;
  },
  codonAt(i) {
    return this.BASES[Math.floor(i / 16)] + this.BASES[Math.floor(i / 4) % 4] + this.BASES[i % 4];
  },
  aaOf(codon) {
    const i = 16 * this.BASES.indexOf(codon[0]) + 4 * this.BASES.indexOf(codon[1]) + this.BASES.indexOf(codon[2]);
    return this.CODE[i];
  },
  info(letter) {
    return letter === '*' ? { one: '*', three: 'Stop', name: 'Stop codon' } : this.AMINO.find(a => a.one === letter);
  },
  // Coloured codon, switching T to U when RNA view is on.
  codonHtml(codon) {
    return [...codon].map(b => `<span class="b-${b}">${this.rna && b === 'T' ? 'U' : b}</span>`).join('');
  },

  init() {
    document.querySelectorAll('[data-learn]').forEach(btn => btn.onclick = () => {
      document.querySelectorAll('[data-learn]').forEach(b => b.classList.toggle('active', b === btn));
      ['codons', 'amino', 'quiz'].forEach(name => document.getElementById('learn-' + name).hidden = btn.dataset.learn !== name);
      if (btn.dataset.learn === 'quiz' && !this.quiz.current) this.nextQuestion();
    });
    this.renderCodons();
    this.renderAmino();
    this.loadXP();
  },

  // ---------- quiz ----------
  // Multiple-choice questions generated from the same amino acid and codon data the
  // cards use, so the quiz can never disagree with the reference.
  // XP is saved on this device only (no accounts).
  quiz: { current: null, xp: 0, streak: 0, best: 0, answered: false },
  // Textbooks classify these differently, so they are left out of "which class?" questions.
  DISPUTED_CLASS: ['G', 'C', 'Y', 'W', 'H'],

  loadXP() {
    try {
      const saved = JSON.parse(localStorage.getItem('ge:quiz') || '{}');
      this.quiz.xp = saved.xp || 0;
      this.quiz.best = saved.best || 0;
    } catch (e) { /* storage blocked: start from zero */ }
  },
  saveXP() {
    try { localStorage.setItem('ge:quiz', JSON.stringify({ xp: this.quiz.xp, best: this.quiz.best })); } catch (e) { /* ignore */ }
  },

  pick(list) { return list[Math.floor(Math.random() * list.length)]; },
  shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },
  // The right answer plus 3 different wrong ones, in random order
  options(right, pool) {
    return this.shuffle([right, ...this.shuffle([...new Set(pool)].filter(x => x !== right)).slice(0, 3)]);
  },

  makeQuestion() {
    const aa = this.pick(this.AMINO);
    const types = ['oneToName', 'nameToThree', 'nameToOne', 'codon', 'class'];
    const type = this.pick(this.DISPUTED_CLASS.includes(aa.one) ? types.slice(0, 4) : types);
    if (type === 'oneToName') return {
      q: `Which amino acid has the one-letter code <b>${aa.one}</b>?`,
      answer: aa.name, options: this.options(aa.name, this.AMINO.map(a => a.name)),
      explain: `${aa.one} = ${aa.name} (${aa.three}).` };
    if (type === 'nameToThree') return {
      q: `What is the three-letter code for <b>${aa.name}</b>?`,
      answer: aa.three, options: this.options(aa.three, this.AMINO.map(a => a.three)),
      explain: `${aa.name} = ${aa.three}, one-letter code ${aa.one}.` };
    if (type === 'nameToOne') return {
      q: `What is the one-letter code for <b>${aa.name}</b>?`,
      answer: aa.one, options: this.options(aa.one, this.AMINO.map(a => a.one)),
      explain: `${aa.name} = ${aa.one} (${aa.three}).` };
    if (type === 'class') {
      const right = this.CLASS_LABEL[aa.cls];
      return {
        q: `Which group does <b>${aa.name}</b> belong to?`,
        answer: right, options: this.shuffle(Object.values(this.CLASS_LABEL)),
        explain: `${aa.name} is ${right.toLowerCase()}. Its side chain: ${aa.chain}.` };
    }
    // codon -> amino acid (stop codons included)
    const letter = this.pick([...this.AMINO.map(a => a.one), '*']);
    const codon = this.pick(this.codonsFor(letter));
    const name = l => l === '*' ? 'Stop' : this.info(l).name;
    return {
      q: `The codon <b class="codon">${this.codonHtml(codon)}</b> codes for…`,
      answer: name(letter), options: this.options(name(letter), [...this.AMINO.map(a => a.name), 'Stop']),
      explain: `${codon} → ${name(letter)}. All its codons: ${this.codonsFor(letter).join(', ')}.` };
  },

  nextQuestion() {
    this.quiz.current = this.makeQuestion();
    this.quiz.answered = false;
    this.renderQuiz();
  },

  level(xp) { return Math.floor(xp / 100) + 1; },

  answer(choice) {
    const q = this.quiz;
    if (q.answered) return;
    q.answered = true;
    q.lastChoice = choice;
    const before = this.level(q.xp);
    if (choice === q.current.answer) {
      q.streak++;
      q.best = Math.max(q.best, q.streak);
      q.gained = 10 + (q.streak >= 3 ? 5 : 0);   // bonus for 3 or more in a row
      q.xp += q.gained;
      App.sound(this.level(q.xp) > before ? 'level' : 'right');
    } else {
      q.streak = 0;
      q.gained = 0;
      App.sound('wrong');
    }
    this.saveXP();
    this.renderQuiz();
  },

  renderQuiz() {
    const q = this.quiz, cur = q.current;
    const el = document.getElementById('learn-quiz');
    const inLevel = q.xp % 100;
    let feedback = '';
    if (q.answered) {
      const right = q.lastChoice === cur.answer;
      feedback = `<div class="result ${right ? '' : 'bad'}">
        <div class="answer">${right ? `Correct! +${q.gained} XP` : 'Not quite.'}</div>
        <p>${cur.explain}</p>
        ${q.streak >= 3 ? `<p class="warn">${q.streak} in a row: streak bonus +5 XP</p>` : ''}
      </div>
      <button class="btn" id="quiz-next">Next question</button>`;
    }
    el.innerHTML = `
      <div class="panel">
        <div class="xp-row"><span>LV ${this.level(q.xp)}</span><span>${q.xp} XP</span><span>Streak ${q.streak}</span></div>
        <div class="xp-bar" aria-label="${inLevel} of 100 XP to the next level"><div class="xp-fill" style="width:${inLevel}%"></div></div>
        <p class="quiz-q">${cur.q}</p>
        <div class="quiz-options">
          ${cur.options.map(o => {
            const cls = !q.answered ? '' : o === cur.answer ? 'right' : o === q.lastChoice ? 'wrong' : '';
            return `<button class="quiz-opt ${cls}" data-opt="${o}" ${q.answered ? 'disabled' : ''}>${o}</button>`;
          }).join('')}
        </div>
        ${feedback}
        <p class="note">+10 XP per right answer, +5 bonus from 3 in a row. 100 XP per level. Best streak: ${q.best}. Saved on this phone only.</p>
      </div>`;
    el.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => this.answer(b.dataset.opt));
    const next = el.querySelector('#quiz-next');
    if (next) next.onclick = () => this.nextQuestion();
  },

  // ---------- codon table ----------
  // Phone screens are too narrow for all 64 codons with 44px tap targets, so the table is
  // split by first base: pick the first base on top, then columns = second base,
  // rows = third base.
  renderCodons() {
    const el = document.getElementById('learn-codons');
    const tabs = this.BASES.map(b =>
      `<button class="base-tab b-${b} ${b === this.firstBase ? 'active' : ''}" data-first="${b}">${this.rna && b === 'T' ? 'U' : b}</button>`).join('');

    let grid = '<div></div>' + this.BASES.map(b => `<div class="axis b-${b}">${this.rna && b === 'T' ? 'U' : b}</div>`).join('');
    const hitSet = this.selectedAA ? this.codonsFor(this.selectedAA) : null;
    for (const third of this.BASES) {
      grid += `<div class="axis b-${third}">${this.rna && third === 'T' ? 'U' : third}</div>`;
      for (const second of this.BASES) {
        const codon = this.firstBase + second + third;
        const aa = this.info(this.aaOf(codon));
        const cls = ['codon-btn', hitSet ? (hitSet.includes(codon) ? 'hit' : 'dim') : '', codon === this.selectedCodon ? 'sel' : ''].join(' ');
        grid += `<button class="${cls}" data-codon="${codon}"><span class="codon">${this.codonHtml(codon)}</span><small>${aa.three}</small></button>`;
      }
    }

    const chips = [...this.AMINO.map(a => a.one), '*'].map(l =>
      `<button class="aa-chip ${l === this.selectedAA ? 'active' : ''}" data-aa="${l}">${l === '*' ? 'Stop' : l}</button>`).join('');

    el.innerHTML = `
      <div class="panel">
        <h2 class="pixel">Codon table</h2>
        <div class="chips">
          <button class="chip ${!this.rna ? 'active' : ''}" data-rna="0">DNA (T)</button>
          <button class="chip ${this.rna ? 'active' : ''}" data-rna="1">mRNA (U)</button>
        </div>
        <label>1. Pick the first base</label>
        <div class="base-tabs">${tabs}</div>
        <label>2. Columns = second base, rows = third base. Tap a codon.</label>
        <div class="codon-grid">${grid}</div>
        <label>Or tap an amino acid to light up all its codons</label>
        <div class="aa-chip-row">${chips}</div>
        <div id="codon-detail">${this.detailHtml()}</div>
      </div>`;

    el.querySelectorAll('[data-first]').forEach(b => b.onclick = () => { this.firstBase = b.dataset.first; this.renderCodons(); });
    el.querySelectorAll('[data-rna]').forEach(b => b.onclick = () => { this.rna = b.dataset.rna === '1'; this.renderCodons(); });
    el.querySelectorAll('[data-codon]').forEach(b => b.onclick = () => {
      this.selectedCodon = b.dataset.codon; this.selectedAA = null; this.renderCodons();
    });
    el.querySelectorAll('[data-aa]').forEach(b => b.onclick = () => {
      this.selectedAA = this.selectedAA === b.dataset.aa ? null : b.dataset.aa; this.selectedCodon = null; this.renderCodons();
    });
  },

  detailHtml() {
    if (this.selectedCodon) {
      const letter = this.aaOf(this.selectedCodon);
      const a = this.info(letter);
      const all = this.codonsFor(letter).map(c => this.codonHtml(c)).join(' &nbsp; ');
      let extra = '';
      if (this.selectedCodon === 'ATG') extra = '<p>ATG is the usual <b>start codon</b>. Translation begins here.</p>';
      if (letter === '*') extra = '<p>A stop codon ends translation. It does not add an amino acid.</p>';
      return `<div class="result"><div class="answer"><span class="codon">${this.codonHtml(this.selectedCodon)}</span> = ${a.name}${letter === '*' ? '' : ` (${a.three}, ${a.one})`}</div>
        ${extra}<p>All codons for this: ${all}</p></div>`;
    }
    if (this.selectedAA) {
      const a = this.info(this.selectedAA);
      const all = this.codonsFor(this.selectedAA).map(c => this.codonHtml(c)).join(' &nbsp; ');
      return `<div class="result"><div class="answer">${a.name}${this.selectedAA === '*' ? '' : ` (${a.three}, ${a.one})`}</div>
        <p>${this.codonsFor(this.selectedAA).length} codon(s): ${all}</p></div>`;
    }
    return '<p class="note">Tap a codon or an amino acid to see details.</p>';
  },

  // ---------- amino acid cards ----------
  renderAmino() {
    const el = document.getElementById('learn-amino');
    const filters = ['all', 'nonpolar', 'polar', 'basic', 'acidic'].map(c =>
      `<button class="chip ${c === this.classFilter ? 'active' : ''}" data-class="${c}">${c === 'all' ? 'All 20' : this.CLASS_LABEL[c].split(' ')[0]}</button>`).join('');
    const cards = this.AMINO.filter(a => this.classFilter === 'all' || a.cls === this.classFilter).map(a => `
      <div class="aa-card ${a.cls}">
        <div class="aa-head">
          <div class="aa-letter" style="color:var(--aa-${a.cls})">${a.one}</div>
          <div><div class="aa-name">${a.name}</div><div class="aa-sub">${a.three} · ${this.CLASS_LABEL[a.cls]}</div></div>
        </div>
        <div class="aa-detail">Side chain: ${a.chain}</div>
        <div class="aa-detail">Codons: ${this.codonsFor(a.one).map(c => this.codonHtml(c)).join(' &nbsp; ')}</div>
      </div>`).join('');
    el.innerHTML = `
      <div class="chips">${filters}</div>
      ${cards}
      <p class="note">Textbooks disagree on a few residues (glycine, cysteine, tyrosine, tryptophan, histidine), so your lecture notes may group them differently.</p>`;
    el.querySelectorAll('[data-class]').forEach(b => b.onclick = () => { this.classFilter = b.dataset.class; this.renderAmino(); });
  }
};

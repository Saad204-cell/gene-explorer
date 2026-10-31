// Toolkit: four lab calculators. Everything here runs offline.
//
// Two layers:
//   1. Calc    - pure maths functions. No page code, so each one can be checked by hand.
//   2. Toolkit - builds the screens, reads the inputs, and calls Calc.
// Every Calc function returns { answer, steps } or { error }, so the screen can
// always show the working, not only the result.

const Calc = {

  // ---------- Molarity: M = mass / (MW x V) ----------
  // Inputs are in base units (g, g/mol, L, mol/L). Exactly one of mass/volume/conc is null.
  molarity({ mw, mass, volume, conc }) {
    if (!(mw > 0)) return { error: 'Enter the molecular weight (g/mol).' };
    const blanks = [mass, volume, conc].filter(v => v === null).length;
    if (blanks !== 1) return { error: 'Fill in exactly two of mass, volume and concentration. Leave the one you want blank.' };
    const steps = [];
    if (conc === null) {
      const moles = mass / mw;
      const c = moles / volume;
      steps.push(`Moles = mass / MW = ${fmt(mass)} g / ${fmt(mw)} g/mol = ${fmt(moles)} mol`);
      steps.push(`Concentration = moles / volume = ${fmt(moles)} mol / ${fmt(volume)} L = ${fmt(c)} mol/L`);
      return { field: 'conc', value: c, steps };
    }
    if (mass === null) {
      const moles = conc * volume;
      const m = moles * mw;
      steps.push(`Moles = concentration x volume = ${fmt(conc)} mol/L x ${fmt(volume)} L = ${fmt(moles)} mol`);
      steps.push(`Mass = moles x MW = ${fmt(moles)} mol x ${fmt(mw)} g/mol = ${fmt(m)} g`);
      return { field: 'mass', value: m, steps };
    }
    const moles = mass / mw;
    const v = moles / conc;
    steps.push(`Moles = mass / MW = ${fmt(mass)} g / ${fmt(mw)} g/mol = ${fmt(moles)} mol`);
    steps.push(`Volume = moles / concentration = ${fmt(moles)} mol / ${fmt(conc)} mol/L = ${fmt(v)} L`);
    return { field: 'volume', value: v, steps };
  },

  // ---------- Dilution: C1 x V1 = C2 x V2 ----------
  // Exactly one of c1, v1, c2, v2 is null. All concentrations share one unit (cu) and all
  // volumes share one unit (vu), so the numbers can be used as they are.
  dilution({ c1, v1, c2, v2, cu = '', vu = '' }) {
    const vals = { c1, v1, c2, v2 };
    const blanks = Object.keys(vals).filter(k => vals[k] === null);
    if (blanks.length !== 1) return { error: 'Fill in exactly three values. Leave the one you want blank.' };
    const missing = blanks[0];
    const C = x => `${fmt(x)} ${cu}`.trim(), V = x => `${fmt(x)} ${vu}`.trim();
    let value;
    const steps = [];
    if (missing === 'c1')      { value = c2 * v2 / v1; steps.push(`C1 = (C2 x V2) / V1 = (${C(c2)} x ${V(v2)}) / ${V(v1)} = ${C(value)}`); }
    else if (missing === 'v1') { value = c2 * v2 / c1; steps.push(`V1 = (C2 x V2) / C1 = (${C(c2)} x ${V(v2)}) / ${C(c1)} = ${V(value)}`); }
    else if (missing === 'c2') { value = c1 * v1 / v2; steps.push(`C2 = (C1 x V1) / V2 = (${C(c1)} x ${V(v1)}) / ${V(v2)} = ${C(value)}`); }
    else                       { value = c1 * v1 / c2; steps.push(`V2 = (C1 x V1) / C2 = (${C(c1)} x ${V(v1)}) / ${C(c2)} = ${V(value)}`); }

    const f = { c1, v1, c2, v2 }; f[missing] = value;
    const warnings = [];
    if (f.c2 > f.c1) warnings.push('C2 is higher than C1. Diluting can only make a solution weaker, so check your numbers.');
    if (f.v1 > f.v2) warnings.push('V1 is larger than V2. You cannot take more stock than the final volume.');
    if (!warnings.length) {
      steps.push(`Diluent to add = V2 - V1 = ${V(f.v2)} - ${V(f.v1)} = ${V(f.v2 - f.v1)}`);
    }
    return { field: missing, value, steps, warnings };
  },

  // ---------- Buffer prep: pH = pKa + log10([base]/[acid]) ----------
  // Weights are for the ANHYDROUS forms. Hydrated salts weigh more per mole.
  buffers: {
    tris:      { name: 'Tris-HCl (pKa 8.07)',        pKa: 8.07, acid: 'Tris-HCl',          acidMW: 157.60, base: 'Tris base',          baseMW: 121.14 },
    phosphate: { name: 'Phosphate (pKa 7.21)',       pKa: 7.21, acid: 'NaH2PO4',           acidMW: 119.98, base: 'Na2HPO4',            baseMW: 141.96 },
    acetate:   { name: 'Acetate (pKa 4.76)',         pKa: 4.76, acid: 'Acetic acid',       acidMW: 60.05,  base: 'Sodium acetate',     baseMW: 82.03 },
    hepes:     { name: 'HEPES (pKa 7.48)',           pKa: 7.48, acid: 'HEPES (free acid)', acidMW: 238.30, base: 'HEPES sodium salt',  baseMW: 260.29 }
  },

  // Grams of each component for a target pH, total concentration (mol/L) and volume (L).
  bufferMake({ key, pH, conc, volume }) {
    const b = Calc.buffers[key];
    if (!b) return { error: 'Choose a buffer system.' };
    const ratio = Math.pow(10, pH - b.pKa);
    const total = conc * volume;
    const molBase = total * ratio / (1 + ratio);
    const molAcid = total - molBase;
    const steps = [
      `Henderson-Hasselbalch: pH = pKa + log10([base]/[acid])`,
      `[base]/[acid] = 10^(pH - pKa) = 10^(${fmt(pH)} - ${fmt(b.pKa)}) = ${fmt(ratio)}`,
      `Total moles = concentration x volume = ${fmt(conc)} mol/L x ${fmt(volume)} L = ${fmt(total)} mol`,
      `Moles of ${b.base} = total x ratio / (1 + ratio) = ${fmt(molBase)} mol`,
      `Moles of ${b.acid} = total - moles of base = ${fmt(molAcid)} mol`,
      `Grams of ${b.base} = ${fmt(molBase)} mol x ${fmt(b.baseMW)} g/mol = ${fmt(molBase * b.baseMW)} g`,
      `Grams of ${b.acid} = ${fmt(molAcid)} mol x ${fmt(b.acidMW)} g/mol = ${fmt(molAcid * b.acidMW)} g`
    ];
    const warnings = [];
    if (Math.abs(pH - b.pKa) > 1) warnings.push(`This pH is more than 1 unit from the pKa (${b.pKa}). Outside that range the buffer resists pH change poorly.`);
    return { b, gramsBase: molBase * b.baseMW, gramsAcid: molAcid * b.acidMW, steps, warnings };
  },

  // pH estimate from the grams of each component you actually weighed. Volume cancels out.
  bufferPH({ key, gramsAcid, gramsBase }) {
    const b = Calc.buffers[key];
    if (!b) return { error: 'Choose a buffer system.' };
    if (!(gramsAcid > 0) || !(gramsBase > 0)) return { error: 'Enter a weight greater than zero for both components.' };
    const molAcid = gramsAcid / b.acidMW;
    const molBase = gramsBase / b.baseMW;
    const pH = b.pKa + Math.log10(molBase / molAcid);
    const steps = [
      `Moles of ${b.acid} = ${fmt(gramsAcid)} g / ${fmt(b.acidMW)} g/mol = ${fmt(molAcid)} mol`,
      `Moles of ${b.base} = ${fmt(gramsBase)} g / ${fmt(b.baseMW)} g/mol = ${fmt(molBase)} mol`,
      `pH = pKa + log10(base/acid) = ${fmt(b.pKa)} + log10(${fmt(molBase)} / ${fmt(molAcid)}) = ${fmt(pH)}`
    ];
    return { pH, steps, warnings: [] };
  },

  // ---------- Primer Tm ----------
  // Under 14 nt: Wallace rule  Tm = 2(A+T) + 4(G+C)
  // 14 nt or more: salt-adjusted  Tm = 81.5 + 16.6 log10[Na+] + 0.41 (%GC) - 675/N
  primerTm({ seq, naMolar }) {
    const s = seq.replace(/\s+/g, '').toUpperCase();
    if (!s) return { error: 'Enter a primer sequence.' };
    if (/[^ACGT]/.test(s)) return { error: 'Only A, C, G and T are allowed. Check for typos, numbers or U (RNA).' };
    const n = s.length;
    const count = ch => [...s].filter(c => c === ch).length;
    const a = count('A'), t = count('T'), g = count('G'), c = count('C');
    const gc = g + c;
    const gcPct = gc / n * 100;
    const steps = [`Length N = ${n} nt. Counts: A=${a}, T=${t}, G=${g}, C=${c}. GC content = ${gc}/${n} = ${fmt(gcPct)}%`];
    let tm;
    if (n < 14) {
      tm = 2 * (a + t) + 4 * (g + c);
      steps.push(`Under 14 nt, so use the Wallace rule: Tm = 2(A+T) + 4(G+C)`);
      steps.push(`Tm = 2 x ${a + t} + 4 x ${gc} = ${fmt(tm)} °C`);
    } else {
      if (!(naMolar > 0)) return { error: 'Enter the sodium concentration in mM (greater than 0).' };
      tm = 81.5 + 16.6 * Math.log10(naMolar) + 0.41 * gcPct - 675 / n;
      steps.push(`14 nt or longer, so use the salt-adjusted formula: Tm = 81.5 + 16.6 x log10[Na+] + 0.41 x (%GC) - 675/N`);
      steps.push(`Tm = 81.5 + 16.6 x log10(${fmt(naMolar)}) + 0.41 x ${fmt(gcPct)} - 675/${n} = ${fmt(tm)} °C`);
    }
    const warnings = [];
    if (n < 18 || n > 30) warnings.push(`Length ${n} nt is outside the usual 18 to 30 nt for PCR primers.`);
    if (gcPct < 40 || gcPct > 60) warnings.push(`GC content ${fmt(gcPct)}% is outside the usual 40 to 60%.`);
    steps.push('These are estimates. Real melting temperature also depends on Mg2+, primer concentration and neighbouring bases, so treat the result as a starting point.');
    return { tm, n, gcPct, steps, warnings };
  }
};

// Make Calc available to test scripts that load this file in a browser console.
if (typeof window !== 'undefined') window.Calc = Calc;

// =====================================================================
// Screens
// =====================================================================

const Toolkit = {
  tools: [
    { id: 'molarity', name: 'Molarity', icon: ['.wwwwww.', '...ww...', '...ww...', '..wwww..', '.wwwwww.', 'wwwwwwww', 'wyyyyyyw', 'wwwwwwww'] },
    { id: 'dilution', name: 'Dilution', icon: ['..wwww..', '..w..w..', '..w..w..', '..wbbw..', '..wbbw..', '..wbbw..', '..wbbw..', '...ww...'] },
    { id: 'buffer',   name: 'Buffer prep', icon: ['..wwww..', '...ww...', '...ww...', '..wggw..', '.wggggw.', 'wggggggw', 'wggggggw', '.wwwwww.'] },
    { id: 'tm',       name: 'Primer Tm', icon: ['...ww...', '...wr...', '...wr...', '...wr...', '...wr...', '..wrrw..', '..wrrw..', '...ww...'] }
  ],

  // Called by the router. sub is the tool id from the URL, or undefined for the grid.
  show(sub) {
    const grid = document.getElementById('tool-grid');
    const view = document.getElementById('tool-view');
    const tool = this.tools.find(t => t.id === sub);
    grid.hidden = !!tool;
    view.hidden = !tool;
    if (!tool) {
      if (!grid.children.length) this.renderGrid(grid);
      return;
    }
    view.innerHTML = `<a href="#toolkit" class="btn secondary back-btn" style="display:inline-block;text-decoration:none">&lt; Back</a>
      <div class="panel"><h2 class="pixel">${tool.name}</h2><div id="tool-body"></div></div>`;
    this['render_' + tool.id](document.getElementById('tool-body'));
  },

  renderGrid(grid) {
    grid.innerHTML = this.tools.map(t =>
      `<a class="tile" href="#toolkit/${t.id}" style="text-decoration:none">${App.pixelIcon(t.icon)}<span>${t.name}</span></a>`
    ).join('');
  },

  // ---- shared helpers ----
  // Read a number box: returns null if blank, NaN if not a number.
  num(id) {
    const raw = document.getElementById(id).value.trim();
    return raw === '' ? null : Number(raw);
  },
  // Show a result box. result has .error or .steps (and optionally .warnings).
  show_result(boxId, result, answerHtml) {
    const box = document.getElementById(boxId);
    if (result.error) {
      box.innerHTML = `<div class="result bad"><span class="error">${result.error}</span></div>`;
      return;
    }
    const warn = (result.warnings || []).map(w => `<p class="warn">Warning: ${w}</p>`).join('');
    App.sound('done');
    box.innerHTML = `<div class="result"><div class="answer">${answerHtml}</div>${warn}
      <h3>Working</h3><ol class="steps">${result.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>`;
  },
  numericProblem(values) {
    return values.some(v => v !== null && (Number.isNaN(v) || v < 0));
  },
  unitSelect(id, options) {
    return `<select class="select" id="${id}">${options.map(([label, factor]) => `<option value="${factor}">${label}</option>`).join('')}</select>`;
  },
  numField(id, label, unitSelectHtml, placeholder = 'leave blank to solve') {
    return `<label for="${id}">${label}</label><div class="input-row">
      <input class="text-input" id="${id}" type="number" inputmode="decimal" step="any" min="0" placeholder="${placeholder}">${unitSelectHtml || ''}</div>`;
  },

  // ---- Molarity ----
  render_molarity(el) {
    el.innerHTML = `
      <div class="formula">M = mass / (MW x V)</div>
      <p class="note">Enter any two of mass, volume and concentration. Leave the one you want blank.</p>
      <label for="mol-mw">Molecular weight (g/mol)</label>
      <input class="text-input" id="mol-mw" type="number" inputmode="decimal" step="any" min="0" placeholder="e.g. 58.44 for NaCl">
      ${this.numField('mol-mass', 'Mass', this.unitSelect('mol-mass-u', [['g', 1], ['mg', 1e-3], ['µg', 1e-6]]))}
      ${this.numField('mol-vol', 'Volume', this.unitSelect('mol-vol-u', [['mL', 1e-3], ['L', 1], ['µL', 1e-6]]))}
      ${this.numField('mol-conc', 'Concentration', this.unitSelect('mol-conc-u', [['mM', 1e-3], ['M', 1], ['µM', 1e-6]]))}
      <button class="btn" id="mol-go">Calculate</button>
      <div id="mol-out"></div>`;
    document.getElementById('mol-go').onclick = () => {
      const f = id => Number(document.getElementById(id).value);
      const mw = this.num('mol-mw'), mass = this.num('mol-mass'), vol = this.num('mol-vol'), conc = this.num('mol-conc');
      if (this.numericProblem([mw, mass, vol, conc])) return this.show_result('mol-out', { error: 'Use positive numbers only.' });
      // Convert everything to base units (g, L, mol/L) before calculating.
      const r = Calc.molarity({
        mw,
        mass: mass === null ? null : mass * f('mol-mass-u'),
        volume: vol === null ? null : vol * f('mol-vol-u'),
        conc: conc === null ? null : conc * f('mol-conc-u')
      });
      if (r.error) return this.show_result('mol-out', r);
      // Show the answer in the unit chosen for that field.
      const unitSel = document.getElementById({ mass: 'mol-mass-u', volume: 'mol-vol-u', conc: 'mol-conc-u' }[r.field]);
      const label = unitSel.options[unitSel.selectedIndex].text;
      const name = { mass: 'Mass', volume: 'Volume', conc: 'Concentration' }[r.field];
      this.show_result('mol-out', r, `${name} = ${fmt(r.value / Number(unitSel.value))} ${label}`);
    };
  },

  // ---- Dilution ----
  render_dilution(el) {
    const opt = list => list.map(u => `<option>${u}</option>`).join('');
    el.innerHTML = `
      <div class="formula">C1 x V1 = C2 x V2</div>
      <p class="note">C1, V1 = stock. C2, V2 = what you want to end up with. Fill in three, leave one blank. One unit is shared by both concentrations and one by both volumes.</p>
      <div class="input-row">
        <div style="flex:1"><label for="dil-cu">Concentration unit</label><select class="select" id="dil-cu" style="width:100%">${opt(['M', 'mM', 'µM', 'mg/mL', 'X'])}</select></div>
        <div style="flex:1"><label for="dil-vu">Volume unit</label><select class="select" id="dil-vu" style="width:100%">${opt(['mL', 'L', 'µL'])}</select></div>
      </div>
      ${this.numField('dil-c1', 'C1: stock concentration')}
      ${this.numField('dil-v1', 'V1: volume of stock')}
      ${this.numField('dil-c2', 'C2: final concentration')}
      ${this.numField('dil-v2', 'V2: final volume')}
      <button class="btn" id="dil-go">Calculate</button>
      <div id="dil-out"></div>`;
    document.getElementById('dil-go').onclick = () => {
      const v = { c1: this.num('dil-c1'), v1: this.num('dil-v1'), c2: this.num('dil-c2'), v2: this.num('dil-v2') };
      if (this.numericProblem(Object.values(v))) return this.show_result('dil-out', { error: 'Use positive numbers only.' });
      if (Object.values(v).some(x => x === 0)) return this.show_result('dil-out', { error: 'Zero is not allowed here. It would mean dividing by zero.' });
      const cu = document.getElementById('dil-cu').value, vu = document.getElementById('dil-vu').value;
      const r = Calc.dilution({ ...v, cu, vu });
      const unit = { c1: cu, c2: cu, v1: vu, v2: vu };
      const names = { c1: 'C1', v1: 'V1', c2: 'C2', v2: 'V2' };
      this.show_result('dil-out', r, r.error ? '' : `${names[r.field]} = ${fmt(r.value)} ${unit[r.field]}`);
    };
  },

  // ---- Buffer prep ----
  render_buffer(el) {
    const options = Object.entries(Calc.buffers).map(([k, b]) => `<option value="${k}">${b.name}</option>`).join('');
    el.innerHTML = `
      <div class="formula">pH = pKa + log10([base]/[acid])</div>
      <div class="segmented">
        <button class="seg-btn active" id="buf-mode-make">Make a buffer</button>
        <button class="seg-btn" id="buf-mode-ph">Estimate pH</button>
      </div>
      <label for="buf-sys">Buffer system</label>
      <select class="select" id="buf-sys" style="width:100%">${options}</select>
      <div id="buf-inputs"></div>
      <button class="btn" id="buf-go">Calculate</button>
      <div id="buf-out"></div>
      <p class="note">Weights assume anhydrous (dry) chemicals. If your bottle says hydrate (for example ·7H2O) the molecular weight is higher, so adjust it. Henderson-Hasselbalch ignores ionic strength and temperature (Tris pH drops as it warms), so always check with a pH meter.</p>`;

    let mode = 'make';
    const inputs = document.getElementById('buf-inputs');
    const draw = () => {
      document.getElementById('buf-mode-make').classList.toggle('active', mode === 'make');
      document.getElementById('buf-mode-ph').classList.toggle('active', mode === 'ph');
      document.getElementById('buf-out').innerHTML = '';
      const b = Calc.buffers[document.getElementById('buf-sys').value];
      inputs.innerHTML = mode === 'make'
        ? this.numField('buf-ph', 'Target pH', '', '')
          + this.numField('buf-conc', 'Total buffer concentration (mM)', '', '')
          + this.numField('buf-vol', 'Final volume (mL)', '', '')
        : this.numField('buf-ga', `Grams of ${b.acid}`, '', '')
          + this.numField('buf-gb', `Grams of ${b.base}`, '', '');
    };
    document.getElementById('buf-sys').onchange = draw;
    document.getElementById('buf-mode-make').onclick = () => { mode = 'make'; draw(); };
    document.getElementById('buf-mode-ph').onclick = () => { mode = 'ph'; draw(); };
    draw();

    document.getElementById('buf-go').onclick = () => {
      const key = document.getElementById('buf-sys').value;
      if (mode === 'make') {
        const pH = this.num('buf-ph'), mM = this.num('buf-conc'), mL = this.num('buf-vol');
        if (pH === null || mM === null || mL === null || Number.isNaN(pH + mM + mL) || mM <= 0 || mL <= 0 || pH < 0 || pH > 14) {
          return this.show_result('buf-out', { error: 'Enter a pH between 0 and 14, plus a concentration and volume above zero.' });
        }
        const r = Calc.bufferMake({ key, pH, conc: mM / 1000, volume: mL / 1000 });
        this.show_result('buf-out', r, `Weigh ${fmt(r.gramsAcid)} g ${r.b.acid}<br>and ${fmt(r.gramsBase)} g ${r.b.base}<br><span class="note">then top up to ${fmt(mL)} mL with water</span>`);
      } else {
        const ga = this.num('buf-ga'), gb = this.num('buf-gb');
        if (ga === null || gb === null || Number.isNaN(ga + gb)) return this.show_result('buf-out', { error: 'Enter both weights.' });
        const r = Calc.bufferPH({ key, gramsAcid: ga, gramsBase: gb });
        this.show_result('buf-out', r, r.error ? '' : `Estimated pH = ${fmt(r.pH)}`);
      }
    };
  },

  // ---- Primer Tm ----
  render_tm(el) {
    el.innerHTML = `
      <div class="formula">Under 14 nt: Tm = 2(A+T) + 4(G+C)<br>14 nt or more: Tm = 81.5 + 16.6 log10[Na+] + 0.41(%GC) - 675/N</div>
      <label for="tm-seq">Primer sequence (5' to 3')</label>
      <textarea id="tm-seq" rows="3" spellcheck="false" autocapitalize="characters" placeholder="e.g. ATGCGTACGTTAGCCTAGGA"></textarea>
      <label for="tm-na">Sodium concentration (mM)</label>
      <input class="text-input" id="tm-na" type="number" inputmode="decimal" step="any" min="0" value="50">
      <button class="btn" id="tm-go">Calculate</button>
      <div id="tm-out"></div>`;
    document.getElementById('tm-go').onclick = () => {
      const na = this.num('tm-na');
      const r = Calc.primerTm({ seq: document.getElementById('tm-seq').value, naMolar: na === null ? NaN : na / 1000 });
      this.show_result('tm-out', r, r.error ? '' : `Tm = ${fmt(r.tm)} °C<br><span class="note">${r.n} nt, ${fmt(r.gcPct)}% GC</span>`);
    };
  }
};

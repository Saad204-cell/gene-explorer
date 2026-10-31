// structure.js: the 3D panel. Shows the AlphaFold predicted structure with 3Dmol.js,
// coloured by pLDDT (AlphaFold's confidence score).
//
// 3Dmol.js is about 500 KB, so it is only downloaded the first time someone opens a
// 3D panel, not when the app starts.

const Structure = {
  LIBRARY: 'https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.4.2/3Dmol-min.js',

  // AlphaFold's own confidence colours, so the picture matches the AlphaFold website
  BANDS: [
    { min: 90, colour: '#0053D6', label: 'Very high (90+)', key: 'fractionPlddtVeryHigh' },
    { min: 70, colour: '#65CBF3', label: 'Confident (70 to 90)', key: 'fractionPlddtConfident' },
    { min: 50, colour: '#FFDB13', label: 'Low (50 to 70)', key: 'fractionPlddtLow' },
    { min: 0,  colour: '#FF7D45', label: 'Very low (below 50)', key: 'fractionPlddtVeryLow' }
  ],

  libraryPromise: null,

  // Add the 3Dmol <script> tag once. Returns a Promise that resolves when it has loaded.
  loadLibrary() {
    if (window.$3Dmol) return Promise.resolve();
    if (!this.libraryPromise) {
      this.libraryPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = this.LIBRARY;
        s.onload = resolve;
        s.onerror = () => { this.libraryPromise = null; reject(new Error('Could not download the 3D viewer. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return this.libraryPromise;
  },

  colourFor(plddt) { return this.BANDS.find(b => plddt >= b.min).colour; },

  // Fill the 3D panel for one UniProt entry. isCurrent() tells us if the user has
  // already moved on to another gene, so a slow download can't draw in the wrong card.
  async show(panel, entry, isCurrent) {
    panel.innerHTML = `<h2 class="pixel">3D structure</h2><div id="af-status"></div>`;
    const status = panel.querySelector('#af-status');
    Explore.setProgress(status, 20, 'Asking AlphaFold for a predicted structure…');
    try {
      const [, af] = await Promise.all([this.loadLibrary(), Api.getAlphaFold(entry.primaryAccession)]);
      if (!isCurrent()) return;
      if (!af) {
        panel.innerHTML = `<h2 class="pixel">3D structure</h2>
          <p>AlphaFold has no predicted structure for ${esc(entry.primaryAccession)}. This is common for very long proteins (over about 2,700 amino acids) and for some organisms.</p>
          <p class="note">Nothing is shown rather than a guess.</p>`;
        return;
      }
      this.draw(panel, entry, af);
    } catch (e) {
      if (isCurrent()) Explore.showError(status, e);
    }
  },

  draw(panel, entry, { meta, pdb }) {
    const legend = this.BANDS.map(b => {
      const share = typeof meta[b.key] === 'number' ? ` · ${(meta[b.key] * 100).toFixed(0)}% of residues` : '';
      return `<li><span class="swatch" style="background:${b.colour}"></span>${b.label}${share}</li>`;
    }).join('');
    // The model is for the sequence AlphaFold used. If UniProt has since changed the
    // sequence, say so instead of pretending they are the same.
    const sameSeq = !meta.uniprotSequence || meta.uniprotSequence === entry.sequence.value;

    panel.innerHTML = `
      <h2 class="pixel">3D structure</h2>
      <p class="warn"><b>This is a prediction, not a measurement.</b> AlphaFold computed this shape from the sequence. Trust the blue parts more than the orange parts.</p>
      <div id="af-viewer" class="af-viewer" aria-label="3D structure viewer. Drag to rotate, pinch to zoom."></div>
      <p class="note">Drag to rotate · pinch or scroll to zoom</p>
      <button class="btn secondary" id="af-reset">Reset view</button>
      <button class="btn secondary" id="af-spin">Spin: off</button>
      <h3>Colour = ${Explore.term('pLDDT', 'plddt')} confidence</h3>
      <ul class="legend-list">${legend}</ul>
      <p>Average pLDDT: <b>${fmt(meta.globalMetricValue)}</b>. Orange, floppy-looking regions are often parts that are naturally flexible or only fold when bound to a partner, not necessarily mistakes.</p>
      ${sameSeq ? '' : '<p class="warn">Warning: the AlphaFold model was built from a slightly different version of this sequence than UniProt shows now.</p>'}
      <p class="note">Model ${esc(meta.entryId)} (version ${esc(meta.latestVersion)}) from the AlphaFold Protein Structure Database.</p>`;

    // 3Dmol draws into the div. colorfunc is called for every atom; AlphaFold put the
    // pLDDT score in the atom's B-factor field (atom.b).
    const viewer = $3Dmol.createViewer(panel.querySelector('#af-viewer'), { backgroundColor: '#0f1220' });
    viewer.addModel(pdb, 'pdb');
    viewer.setStyle({}, { cartoon: { colorfunc: atom => this.colourFor(atom.b) } });
    viewer.zoomTo();
    viewer.render();

    let spinning = false;
    panel.querySelector('#af-reset').onclick = () => { viewer.zoomTo(); viewer.render(); };
    panel.querySelector('#af-spin').onclick = e => {
      spinning = !spinning;
      viewer.spin(spinning ? 'y' : false);
      e.target.textContent = `Spin: ${spinning ? 'on' : 'off'}`;
    };
  }
};

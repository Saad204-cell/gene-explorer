// api.js: everything that talks to the internet.
//
// Sources (all allow direct browser requests, checked in Phase 2):
//   UniProt  - search, protein facts, protein sequence, links to Ensembl / EMBL
//   Ensembl  - coding sequence (CDS) for vertebrates and other model organisms
//   NCBI     - fallback CDS (E-utilities) when Ensembl has nothing, e.g. GFP, E. coli, wheat
//
// Every function here is async: it returns a Promise, so callers use `await`.
// While the browser waits for the network, the rest of the page keeps working.

const Api = {
  UNIPROT: 'https://rest.uniprot.org/uniprotkb',
  ENSEMBL: 'https://rest.ensembl.org',
  NCBI: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',

  // ---------- networking with cache + friendly errors ----------
  // Responses are kept in sessionStorage (cleared when the tab closes) so a repeat
  // lookup does not hit the API again. Returns the response body as text.
  async fetchText(url, timeoutMs = 15000) {
    const key = 'ge:' + url;
    try {
      const hit = sessionStorage.getItem(key);
      if (hit !== null) return hit;
    } catch (e) { /* storage blocked: just skip the cache */ }

    if (navigator.onLine === false) throw new ApiError('offline', 'You are offline. Gene lookup needs internet. The Toolkit and Learn tabs still work.');

    // Give up after a while so the loading bar never hangs forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (e) {
      throw new ApiError(e.name === 'AbortError' ? 'timeout' : 'network',
        e.name === 'AbortError' ? 'The server took too long to answer. Try again in a moment.'
                                : 'Could not reach the database. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) throw new ApiError('rate', 'The database says we are asking too often. Wait a few seconds and try again.');
    if (!res.ok) throw new ApiError('http', `The database returned an error (HTTP ${res.status}).`, res.status);

    const text = await res.text();
    try { sessionStorage.setItem(key, text); } catch (e) { /* cache full: fine */ }
    return text;
  },
  async fetchJson(url) { return JSON.parse(await this.fetchText(url)); },

  // ---------- UniProt ----------
  // Search reviewed (curated Swiss-Prot) entries only. Unreviewed entries are mostly
  // automatic guesses, which would confuse beginners.
  async searchGenes(text, organismId) {
    const clean = text.replace(/["()]/g, ' ').trim();
    if (!clean) return [];
    let query = `(${clean}) AND (reviewed:true)`;
    if (organismId) query += ` AND (organism_id:${organismId})`;
    const fields = 'accession,id,protein_name,gene_names,organism_name,length';
    const data = await this.fetchJson(`${this.UNIPROT}/search?query=${encodeURIComponent(query)}&fields=${fields}&size=8&format=json`);
    return data.results.map(r => ({
      accession: r.primaryAccession,
      entryName: r.uniProtkbId,
      protein: r.proteinDescription?.recommendedName?.fullName?.value
            || r.proteinDescription?.submissionNames?.[0]?.fullName?.value || '(no name listed)',
      gene: r.genes?.[0]?.geneName?.value || '',
      organism: r.organism?.scientificName || '',
      length: r.sequence?.length
    }));
  },

  // One full entry: facts, protein sequence and database cross-references.
  async getEntry(accession) {
    if (!/^[A-Z0-9]{6,10}$/i.test(accession)) throw new ApiError('badid', 'That does not look like a UniProt accession number.');
    const fields = 'accession,id,protein_name,gene_names,organism_name,length,cc_function,cc_subcellular_location,cc_disease,xref_ensembl,xref_embl,sequence';
    try {
      return await this.fetchJson(`${this.UNIPROT}/${accession.toUpperCase()}?fields=${fields}&format=json`);
    } catch (e) {
      if (e.status === 404 || e.status === 400) throw new ApiError('notfound', `UniProt has no entry called ${accession}.`);
      throw e;
    }
  },

  // ---------- translation (used to verify every CDS we show) ----------
  // Translate DNA into a protein string using the standard code from learn.js.
  // Stops at the first stop codon; the stop itself is not included.
  translate(dna) {
    let protein = '';
    for (let i = 0; i + 3 <= dna.length; i += 3) {
      const codon = dna.slice(i, i + 3).toUpperCase();
      if (/[^ACGT]/.test(codon)) { protein += 'X'; continue; }   // ambiguous base
      const aa = Learn.aaOf(codon);
      if (aa === '*') break;
      protein += aa;
    }
    return protein;
  },

  // How different two protein strings are: mismatched positions + length difference.
  proteinDifferences(a, b) {
    let diff = Math.abs(a.length - b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
    return diff;
  },

  // ---------- CDS ----------
  // Never invent data: a candidate CDS is only shown if translating it reproduces the
  // UniProt protein. We try several candidates and keep the best match.
  // Returns { cds, source, id, differences } or null if nothing usable was found.
  async getCds(entry) {
    const protein = entry.sequence.value;
    let best = null;
    const consider = (cds, source, id) => {
      const differences = this.proteinDifferences(this.translate(cds), protein);
      if (!best || differences < best.differences) best = { cds, source, id, differences };
      return differences === 0;
    };

    // 1) Ensembl: UniProt lists every Ensembl transcript of the gene. The first one is not
    //    always the one matching UniProt's reference protein (e.g. BRCA1), so try several.
    //    Ensembl can be slow or drop requests (its error replies carry no CORS headers, so
    //    the browser reports them as a plain network failure). After one failed retry we
    //    stop asking Ensembl and go to NCBI instead of making the user wait.
    let lastError = null;
    const transcripts = (entry.uniProtKBCrossReferences || [])
      .filter(x => x.database === 'Ensembl').map(x => x.id.split('.')[0]).slice(0, 8);
    ensembl: for (const id of transcripts) {
      const url = `${this.ENSEMBL}/sequence/id/${id}?type=cds;content-type=text/plain`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await this.fetchText(url, 25000);
          if (consider(text.trim().toUpperCase(), 'Ensembl', id)) return best;
          break;                               // got a CDS, just not a perfect match: next transcript
        } catch (e) {
          if (e.code === 'offline') throw e;
          if (e.code === 'http') break;        // this transcript has no CDS: next one
          lastError = e;                       // timeout / network / rate limit
          if (attempt === 1) break ensembl;    // retry failed too: give up on Ensembl
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // 2) NCBI fallback: UniProt's EMBL links carry GenBank protein IDs; NCBI can return the
    //    CDS for each. Prefer mRNA records (complete CDS) over genomic fragments.
    const embl = (entry.uniProtKBCrossReferences || []).filter(x => x.database === 'EMBL')
      .map(x => ({
        proteinId: x.properties.find(p => p.key === 'ProteinId')?.value,
        type: x.properties.find(p => p.key === 'MoleculeType')?.value
      }))
      .filter(x => x.proteinId && x.proteinId !== '-')
      .sort((a, b) => (b.type === 'mRNA') - (a.type === 'mRNA'))
      .slice(0, 5);
    for (const { proteinId } of embl) {
      if (best && best.differences === 0) break;
      try {
        const url = `${this.NCBI}/efetch.fcgi?db=protein&id=${proteinId}&rettype=fasta_cds_na&retmode=text&tool=GeneExplorer`;
        const text = await this.fetchText(url);
        const cds = text.split('\n').filter(l => !l.startsWith('>')).join('').trim().toUpperCase();
        if (/^[ACGTN]+$/.test(cds) && consider(cds, 'NCBI', proteinId)) return best;
      } catch (e) {
        if (e.code === 'offline') throw e;
        if (e.code !== 'http') lastError = e;
      }
      await new Promise(r => setTimeout(r, 400));  // NCBI allows about 3 requests per second
    }
    // Nothing found AND a connection problem happened: say that, rather than "no CDS exists".
    if (!best && lastError) throw lastError;
    return best;  // may be a close-but-not-exact match (flagged in the UI) or null
  },

  // ---------- AlphaFold ----------
  // Returns { meta, pdb } or null when AlphaFold has no model for this protein.
  // meta has the confidence summary; pdb is the structure file as text. In a PDB file
  // AlphaFold stores each atom's pLDDT confidence in the "B-factor" column.
  async getAlphaFold(accession) {
    let list;
    try {
      list = await this.fetchJson(`https://alphafold.ebi.ac.uk/api/prediction/${accession}`);
    } catch (e) {
      if (e.status === 400 || e.status === 404) return null;   // no model for this protein
      throw e;
    }
    const meta = Array.isArray(list) ? list.find(m => m.uniprotAccession === accession) || list[0] : null;
    if (!meta?.pdbUrl) return null;
    const pdb = await this.fetchText(meta.pdbUrl, 30000);
    return { meta, pdb };
  },

  // Genomic length of the gene from Ensembl (start to end on the chromosome, in bp).
  // Returns null when Ensembl does not know the gene. Not essential, so errors become null.
  async getGeneLength(entry) {
    const ref = (entry.uniProtKBCrossReferences || []).find(x => x.database === 'Ensembl');
    const geneId = ref?.properties.find(p => p.key === 'GeneId')?.value?.split('.')[0];
    if (!geneId) return null;
    // Ensembl is sometimes slow or drops a request, so allow a longer wait and one retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await this.fetchText(`${this.ENSEMBL}/lookup/id/${geneId}?content-type=application/json`, 25000);
        const g = JSON.parse(text);
        return g.end - g.start + 1;
      } catch (e) {
        if (e.code === 'offline' || e.code === 'http') return null;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return null;
  }
};

// An error with a short code, so the UI can decide what to say.
class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

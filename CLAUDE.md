# Gene Explorer

A mobile-friendly web app that turns a gene name into a beginner-friendly card with its
coding sequence, protein and 3D structure, plus everyday lab calculators.

Built by Saad (GitHub: Saad204-cell), final-year BS Biotechnology student at Riphah
International University, Faisalabad, Pakistan. First users are his classmates: beginners
in bioinformatics who study on their phones.

---

## Working with me

I know Python and basic R. I am a **beginner at web development**. Keep that in mind:

- **Build in phases, not all at once.** Never jump ahead to a later phase unless I ask.
- **After each phase, explain what you built** in plain language — what each file does and
  how the main pieces connect. My classmates will ask how it works and I need to answer.
- **Comment the non-obvious parts of the code**, especially API calls and anything
  asynchronous. Skip comments on self-evident lines.
- **Tell me when I'm wrong.** If I ask for something that's a bad idea, say so and explain
  why before doing it.
- **Stop and ask** rather than guessing when a requirement is ambiguous.
- At the end of each phase, suggest one small change I can make myself to learn the code.

---

## The problem this solves

NCBI and UniProt are built for experts. A beginner searches "insulin", gets dozens of
cryptic records, and gives up. Getting a coding sequence means knowing which record, which
format and which download option. Meanwhile basic lab calculators live on ad-filled sites
that work badly on a phone.

Gene Explorer: one search box, one screen per answer, every technical term tappable and
explained.

---

## Scope

### Explore (needs internet)

1. Search by plain-English gene or protein name (insulin, BRCA1, TP53). Organism
   selectable; human is the default.
2. **Overview card**: full name, organism, gene and protein length, function in plain
   English, cellular location, linked diseases.
3. **Coding sequence (CDS)**: length, GC content, start and stop codons highlighted, copy
   button and FASTA download.
4. **Protein sequence**: colour-coded by amino acid class.
5. **3D structure**: AlphaFold model, rotatable by finger, coloured by model confidence
   (pLDDT).
6. **"What does this mean?" taps**: short plain-English explanations on every technical
   term — accession number, UniProt ID, CDS, pLDDT, isoform.

### Toolkit (works offline)

| Tool | Notes |
| --- | --- |
| Molarity | mass / volume / concentration — enter any two, get the third |
| Dilution | C1V1 = C2V2, solve for the missing value |
| Buffer prep | grams to weigh, plus pH estimate via Henderson-Hasselbalch |
| Primer Tm | Wallace rule for primers under 14 nt, salt-adjusted formula above that |

Every calculator **shows its formula and the working steps**, not just the answer. That is
the point: classmates should learn the method.

### Learn (works offline)

- Interactive codon table / wheel: tap a codon for its amino acid, tap an amino acid for
  its codons.
- Amino acid reference cards: 3-letter and 1-letter codes, class (polar, nonpolar,
  charged), structure.
- Quiz mode over the amino acid cards, with an XP-style counter.

### Deliberately deprioritised

Basic sequence tools (reverse complement, transcription, translation, GC content, ORF
finder) are **not** the differentiator. A classmate already published BioHelix, which
covers exactly those from pasted FASTA. Add them late, as a convenience, or not at all.

What is genuinely mine: **live gene lookup by name**, **CDS retrieval**, the **AlphaFold
viewer**, the **beginner explanations**, and the **lab calculators**. Prioritise those.

---

## Tech stack

- **Plain HTML, CSS and JavaScript.** No framework, no build step, no bundler.
- **Progressive Web App**: manifest + service worker, so it installs to the home screen and
  the offline half keeps working with no signal.
- **No server, no login, no cost.** Everything runs in the browser.
- **Hosted free on GitHub Pages** from the repo root or `/docs`.

Keep dependencies to the minimum. The only third-party library planned is 3Dmol.js for the
structure viewer. Justify any other addition before adding it.

---

## Data sources

| Need | Source |
| --- | --- |
| Gene and protein facts | UniProt REST API |
| Coding sequence (CDS) | Ensembl REST API (NCBI E-utilities as fallback) |
| 3D structure | AlphaFold Database API |
| Structure viewer | 3Dmol.js |
| Toolkit and Learn data | Hard-coded in JS — never fetched |

**Verify in Phase 2:** whether NCBI E-utilities permits direct browser requests (CORS). If
not, Ensembl alone covers human, mouse and most model organisms — that is acceptable.

Always identify the app politely in requests where the API expects it, respect documented
rate limits, and cache responses in `sessionStorage` so repeat lookups don't re-hit the API.

---

## Visual style

**Retro pixel-art meets lab notebook.** It should feel like a handheld console that happens
to know molecular biology.

- **Dark background.** Four base colours used consistently everywhere, so students absorb
  them passively: **A green, T red, G yellow, C blue.**
- **Type**: a pixel font (e.g. Press Start 2P) for headings and buttons; a clean monospace
  for sequences and numbers, which must stay readable at small sizes.
- **Pixel details**: pixel DNA helix logo, chunky 8-bit buttons with a pressed-down state,
  pixel icons per tool (test tube, flask, scale, codon wheel).
- **Small game touches**: loading bar that fills like a health bar; short 8-bit sound on
  completion, with a mute switch defaulting to off; XP counter in the quiz.
- **Mobile first**: single column, large tap targets (44px minimum), bottom navigation with
  three tabs — **Explore**, **Toolkit**, **Learn**.

Readability beats theme. If the pixel font makes something hard to read, use the monospace
font there.

---

## Screens

1. **Home / Explore** — pixel logo, one search box, example chips (insulin, hemoglobin, GFP)
2. **Gene card** — overview on top, swipeable panels for CDS, Protein, 3D Structure
3. **Toolkit** — grid of pixel tool tiles, each opening its own calculator screen
4. **Learn** — codon wheel, amino acid cards, quiz mode
5. **About** — who built it, GitHub link, data sources credited, feedback link

---

## Build order

Work through these in order. Do not start a phase before I have tested the previous one on
my phone and said it's good.

1. **Toolkit + Learn.** Offline, quick, useful on day one. Establishes the pixel style and
   the three-tab shell.
2. **Gene card.** Search, overview card and CDS from UniProt and Ensembl, with the
   "What does this mean?" explanations.
3. **3D structure and polish.** AlphaFold viewer, quiz mode, sounds, PWA install, offline
   support.
4. **Classmate beta.** Share with 5–10 classmates, collect feedback, fix the top issues.
5. **Public launch.** Clean README with screenshots, share in the class group, LinkedIn
   screen recording.

---

## Correctness rules

This is a teaching tool for biology students, so a wrong number is worse than a missing
feature.

- **Validate every calculator by hand** before shipping it. Show me the worked example.
- **Sanity-check the CDS**: translating it should reproduce the UniProt protein sequence.
  Build that check in as a test case for at least five genes (e.g. INS, TP53, BRCA1, GFP,
  HBB).
- **Never invent data.** If an API returns nothing for a gene, say so in the UI clearly
  rather than showing a blank or a guess.
- **Label uncertainty.** AlphaFold models are predictions; the confidence colouring must be
  explained, not just displayed.
- Handle offline and failed requests gracefully: a clear message, never a silent failure or
  a spinner that never stops.

---

## Repo conventions

- Flat, obvious structure. No deep nesting.
- `index.html`, `css/`, `js/`, `assets/`, `manifest.json`, `sw.js`.
- One JS file per feature area (`explore.js`, `toolkit.js`, `learn.js`, `api.js`).
- Descriptive names over clever ones.
- Commit messages in plain English describing what changed and why.
- README must include: what it does, screenshots, how to run it locally, the live link, and
  credit to UniProt, Ensembl, AlphaFold and 3Dmol.js.

---

## Success criteria

- At least 10 classmates install it, and some use it again before exams.
- Finding a gene's CDS takes under a minute instead of a confusing NCBI session.
- A live, working app on GitHub that shows coding, API work and biology together.

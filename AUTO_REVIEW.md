# Auto-review

Upload an incoming security questionnaire; get back a list of questions, each
either answered from your history, backed by a cited passage from your policy
documents, or flagged as needing a real answer.

This replaces the placeholder the app used to show on the upload path —
*"Connect a file parsing service (PDF.js, Mammoth for DOCX) to auto-extract
questions."*

---

## The pipeline

```
 upload
   │
   ├─ 1. extract text          src/lib/extract.js
   │      PDF.js · Mammoth · xlsx.js · CSV/TSV · TXT/MD
   │
   ├─ 2. find the questions    a spreadsheet → gridQuestions.js (which column?)
   │                           anything else → questionExtract.js (which lines?)
   │
   ├─ 3. score against the KB  src/lib/matcher.js
   │      ├─ lexical   BM25 + coverage + phrase bonus   src/lib/textIndex.js
   │      └─ semantic  Titan embeddings, cosine         src/lib/embeddings.js
   │
   └─ 4. classify
          auto-filled · suggested with citation · needs a manual answer
```

The knowledge base being searched is built by `src/lib/kbIndex.js`, which indexes
policy documents on import and completed questionnaires on completion.

---

## 1. Text extraction, in the browser

| Type | How |
|---|---|
| `.pdf` | PDF.js, page by page, keeping page numbers for citations |
| `.docx` | Mammoth (`extractRawText`) |
| `.xlsx` `.xlsm` | `src/lib/xlsx.js` — no dependency, see below |
| `.csv` `.tsv` | Parsed as a grid so table rows survive as rows |
| `.txt` `.md` | Read directly |

PDF.js and Mammoth load via dynamic `import()`, so they are code-split — PDF.js is
over a megabyte and someone who only pastes text never downloads it.

**A scanned PDF has no text layer**: pages parse and produce nothing, and the app
says so rather than reporting "0 questions found". OCR would need Textract or
tesseract.js. Legacy `.xls` is a binary format from before the ZIP era and errors
with an instruction to re-save as `.xlsx`.

### Why the spreadsheet reader has no dependency

The obvious choice is SheetJS, and it is the wrong one here. The `xlsx` package on
npm is pinned at 0.18.5 and carries **CVE-2023-30533** (prototype pollution) plus
a ReDoS advisory. The fix shipped in 0.19.3, which was never published to npm —
SheetJS moved to distributing from their own CDN. So the options were a tarball URL
as a dependency, or a known-vulnerable package that Dependabot would flag forever
in a tool whose entire job is answering *"do you monitor your dependencies?"*

Neither appealed, and reading a questionnaire needs a fraction of what SheetJS
does. So `src/lib/unzip.js` (~200 lines) and `src/lib/xlsx.js` (~300 lines) do it
directly:

- **Unzipping** uses the platform's own `DecompressionStream('deflate-raw')` — no
  inflate implementation to carry or audit. Available in every browser since
  Safari 16.4, and in Node, which is why the parser is unit-testable without a
  browser.
- **XML** is read with a linear `indexOf` scanner rather than `DOMParser` or
  regexes. Sheet XML is machine-generated and highly regular, so scanning is both
  simpler and strictly linear — and after the response-column regex in
  `questionExtract.js` turned out to be quadratic on real uploads, a parser with
  no backtracking at all seemed like the right default for code that reads
  untrusted files.

Scope is cell *text*, which is all a questionnaire needs: shared strings, inline
strings, rich-text runs, formula cached results, booleans, sheet names and hidden
flags. Styles, charts, images and pivot tables are ignored. Date cells come
through as their serial number, because resolving them means parsing `styles.xml`
and the number-format table — worth doing only if dates ever matter.

Bounded on purpose, since the input is untrusted: 20,000 rows per sheet, 256
columns, 60 sheets, 64 MB per decompressed entry. A workbook that exceeds a limit
is truncated with a warning rather than refused.

## 2. Finding the questions in a spreadsheet

A real SIG or CAIQ workbook is not a list of questions. It is a cover page, an
instructions tab, a glossary, the questionnaire itself, and often an old version
somebody forgot to delete. On the questionnaire sheet the question is rarely in
column A — it sits to the right of a control ID and a domain, with empty response
and comment columns after it.

So `src/lib/gridQuestions.js` treats it as a structural problem:

1. **Skip sheets that are not questionnaires** — by name (`Instructions`,
   `Glossary`, `Revision History`, …) and by having nothing question-shaped in
   them. Name-based skipping only applies when something else remains, so a
   workbook whose only sheet is called "Reference" is still read.
2. **Find the header row**, which is frequently not row 1 — the first row within
   the first 25 that has at least two header-like cells.
3. **Score every column** using the same `scoreLine` the text path uses, then
   pick the best. A header cell reading "Question" adds 3; one reading "Comments"
   subtracts 3, because a column's title is a stronger signal than its contents.
4. **Report what it chose**, in a sentence:

> Found 10 questions in sig-questionnaire.xlsx — used 10 from column C
> ("Question") of "Full Questionnaire" — skipped "Old Version 2024" (hidden
> sheet), "Instructions" (looks like guidance), "Glossary" (looks like a
> glossary).

Step 4 matters as much as the rest. Auto-detection is invisible when it works and
baffling when it does not, so the analyst always gets told which sheet and column
were used — that is the decision most likely to be wrong and the hardest to guess
at from the results.

Row numbers in the report are the ones Excel shows. Blank rows are dropped during
parsing rather than padded (a sheet with one entry at row 10,000 should not
allocate 10,000 arrays), so real row numbers are tracked alongside the array
rather than inferred from its index.

If no column stands out, it falls back to joining each row into a line — the same
treatment CSV gets.

## 3. Finding the questions in text

Questionnaires are not structured data. They arrive as numbered lists, lettered
sub-items, control-ID tables, CSV grids, or prose — often several in one file. So
candidate lines are *scored* rather than pattern-matched:

- rejoin lines a PDF broke mid-sentence
- group lines into items using enumeration markers (`1.`, `a)`, `AC-2`, `CC6.1`,
  `A.9.2.1`, bullets), so a question keeps its sub-clauses
- score on question marks, requirement phrasing ("do you", "please describe"),
  interrogative openings, enumeration, table shape — minus boilerplate, page
  furniture and non-prose
- strip the marker and any response columns (`| Yes/No | Comments`), then
  de-duplicate on a normalised key

`tests/extraction.spec.mjs` is the specification here: every case in it is a real
format that broke an earlier version. Worth reading before you tune the
heuristics.

## 4. Scoring

Each candidate gets two independent scores in 0..1, and they are combined as:

```
score = max(lexical, semantic) + 0.05 · min(lexical, semantic)
```

**Why max rather than a blend.** Either signal alone should be able to carry a
match. Lexical catches exact control language and acronyms that embeddings blur
together; semantic catches paraphrases that share no vocabulary at all ("Who vets
the companies you buy software from?" → your vendor management policy). Blending
would let a weak signal drag down a strong one. The small agreement bonus breaks
ties in favour of candidates both methods like. When embeddings are unavailable
the formula degrades to plain lexical with no special-casing.

**Lexical** is BM25 with two additions that matter specifically here:

- *A GRC synonym map.* "Is MFA enforced?" and "Do you require multi-factor
  authentication?" share no tokens. Collapsing both to a canonical form is what
  makes keyword matching viable at all. Deliberately conservative — over-
  expanding creates false matches, which are worse than misses because they
  arrive wearing a confidence score.
- *Term coverage weighted above the BM25 score* (0.6 / 0.4). Raw BM25 is
  unbounded and can be dominated by one rare term, which produces confident
  nonsense. Coverage — "matched 4 of 6 key terms" — is bounded, explainable, and
  is what the UI shows.

**Semantic** is Amazon Titan Text Embeddings V2 at 256 dimensions, computed by a
Lambda (`amplify/functions/embed-text/`) and compared with cosine similarity.

## 5. Classification

| Source | Score | Outcome |
|---|---|---|
| Past answer | ≥ 0.72 **and** corroborated | **auto-filled**, attributed to the questionnaire it came from |
| Past answer | ≥ 0.45 | suggested, not filled |
| Document | ≥ 0.40 | suggested **with a citation**, never filled |
| — | below | needs a manual answer, with the closest near-miss reported |

Two deliberate constraints:

**A document passage is never written into the answer box.** A policy paragraph
is evidence that an answer *can* be written, not the answer itself. In GRC the
cost of shipping an unread compliance claim to a customer is far higher than the
cost of a click, so accepting a citation is always explicit.

**Auto-fill needs corroboration, not just a score.** "What is your RTO?" is a
single meaningful token, so coverage alone can clear the threshold on one
coincidental hit. Auto-fill therefore also requires two or more distinct matched
terms, or a semantic score strong enough to stand alone (≥ 0.85). Otherwise it is
downgraded to a suggestion that says *"matched on only one term"*.

Thresholds live in `THRESHOLDS` at the top of `src/lib/matcher.js`.

---

## The index

`KbIndexChunk` rows, holding both kinds of material because both answer the same
question — *can we already answer this?*

| `sourceType` | Content | Matched on |
|---|---|---|
| `qa` | A question/answer pair from a completed questionnaire | the question |
| `document` | A passage of an imported policy document | the passage |

Documents are split on paragraph and sentence boundaries, ~700 characters with a
120-character overlap, page numbers carried through. Once a passage reaches 280
characters a paragraph boundary ends it rather than being merged across: merging
two sections still *matches*, but the citation then spans two topics, and
precision is most of the value of citing a source.

Embeddings are attached **at index time**, so a match run costs one embedding call
for the questions being asked no matter how large the knowledge base is. Q&A rows
embed the question only, even though the lexical index uses question + answer:
BM25 gains from the answer's vocabulary, whereas an embedding of a long answer
drifts away from the short question it should match.

### Backfill

Documents imported before this feature existed have an S3 object and no extracted
text, so auto-review could never find them. The knowledge base screen shows how
much is searchable and offers to index the rest — it fetches each file back from
storage, parses it and indexes it. Per-document badges say **Searchable** or
**Not indexed**, so the library never quietly lies about what auto-review can see.

---

## When Bedrock is not available

Being unavailable is a normal state, not an error. No backend attached, model
access not enabled, a region without Titan, a Lambda that is not deployed — in
every case the matcher runs lexical-only and the review screen says so:

> Keyword matching only — semantic matching is off, so reworded questions may
> have been missed.

That banner matters. A "needs a manual answer" from a degraded run means
something weaker than one from a full run, and the analyst should know which they
are looking at.

**To enable the semantic half:** Console → Bedrock → Model access → enable
`amazon.titan-embed-text-v2:0` in your deployment region. The IAM grant is
already in `amplify/backend.ts`, scoped to that one model.

If you change `EMBEDDING_DIMENSIONS`, existing vectors become incomparable —
cosine on different widths is meaningless. The matcher detects the mismatch,
counts it, and tells you to re-index rather than silently degrading. Re-run the
backfill after any such change.

⚠️ **`embedTexts` is currently callable by guests**, like the rest of the data
layer while auth is deferred — but unlike the rest, this one costs money per
call. Anyone with the AppSync URL could invoke Titan. The Lambda caps a request
at 120 texts × 8,000 characters, which bounds the damage per call but not the
number of calls. Tighten it to `allow.authenticated()` in
`amplify/data/resource.ts` as part of the auth pass.

---

## Cost

Per questionnaire: one `embedTexts` call covering all its questions. Indexing a
document costs one call per passage, once. Titan V2 is billed per input token, so
a 50-question review is a fraction of a cent; the index is the larger one-off.
Lexical matching is free and runs in the browser.

---

## Testing

```bash
npm test              # extraction + matching, plain Node, no browser

# The browser suites need Playwright, which is deliberately not a dependency —
# it downloads ~150MB of browsers and the deploy build has no use for it.
npm i -D playwright && npx playwright install chromium
npm run build && npm run preview &
npm run test:browser
```

- `tests/extraction.spec.mjs` — six real questionnaire formats, chunking, and
  regression tests for a whitespace pattern that used to take 67 seconds on an
  ordinary file.
- `tests/xlsx.spec.mjs` — the ZIP reader (including stored entries, missing
  entries, non-archives), shared strings, rich-text runs, out-of-order and sparse
  cells, a SIG-shaped workbook with instruction/glossary/hidden tabs, a sheet with
  no header row, a question column sitting to the right of a longer guidance
  column, and a 3,000-row performance bound. Fixtures are generated by
  `npm run fixtures`, which writes the XML by hand so these shapes are exact.
- `tests/matching.spec.mjs` — lexical-only, hybrid with synthetic embeddings, thin
  evidence, corrupt vectors, dimension mismatch, and a 1,200-passage performance
  bound.
- `tests/autoreview.spec.mjs` — the whole chain in a real browser against a real
  PDF, including the failure paths (`.xlsx`, a file with no questions).

The negative assertions are the ones that matter most. A matcher that finds
something for every question is worse than useless here: it launders guesses as
evidence. So the tests check that unrelated questions get nothing, that document
passages are never auto-filled, and that thin evidence is downgraded.

## Where an answer came from

Every auto-filled or suggested answer records its source: the document or past
questionnaire it was pulled from, the page where applicable, and **the date that
source was added to the library**. The date is not decoration — an old SOC 2
report and this year's will both match a question about encryption, and the
scorer has no way to know which one is current. That judgement is the reviewer's,
and it needs the date to be made.

Sources are resolved at match time by `withCurrentSources` rather than read from
the index rows, so a renamed document cites its new name and a re-uploaded one
cites its new date without the index being rebuilt.

### Changing the source

When more than one source could answer a question, the review screen offers
**Change source**. It lists one entry per source — not per passage, because three
paragraphs of the same policy is one choice, not three — ordered by score, each
with its date, match method and the passage itself.

Choosing a past answer marks the question auto-filled. Choosing a policy document
leaves it flagged: the passage was written to answer something else, so it is a
draft until a human has read it against this question. That is the same rule the
matcher applies on its own, and it is why documents are never auto-filled without
being asked for.

The candidate list lives only for the duration of a review run. It holds up to
six full passages per question, which on a 261-question CAIQ is over a megabyte —
several times DynamoDB's 400 KB item limit — so `trimQuestion` strips it before
anything is written. The chosen source persists; the alternatives are rebuilt on
the next run.

### Passage boundaries

Passages are cut on sentence boundaries where possible and word boundaries
always. This used to be a character-count slice, which produced citations opening
mid-word — "ative access to production" — and those fragments went into the
lexical index as tokens that match nothing.

Spreadsheets get one more rule: a workbook arrives as one line per row, so rows
are the unit a passage is built from. Splitting a sheet on sentence boundaries
put several unrelated controls in one citation and cut through the middle of
them.

## Staying current with the knowledge base

Auto-review runs at import, and its verdicts are written into the questions and
persisted. That is what makes a draft survive a refresh — and it is also why an
open questionnaire used to ignore the knowledge base growing underneath it. A
document imported after the review changed nothing, through a refresh or a
reload, because a reload restores the stored verdict rather than re-running the
matcher.

The editor now watches a cheap fingerprint of the library — document and entry
counts plus the newest `savedAt`, derived from records already in memory rather
than from the index, which carries embeddings and runs to thousands of rows. When
that fingerprint differs from the one the questionnaire was last reviewed
against, the review re-runs in the background.

The merge rule is the part worth being careful about:

| State of the question | What the refresh does |
|---|---|
| No answer, never edited | Takes the new verdict whole — answer, status, citation |
| Answered, or edited by a human | **Nothing.** The answer is not touched |

An answered question that a newer source would match better gets a `update`
marker rather than a rewrite: which document, when it was added, and its score
against the one in use, shown as a hover tooltip and a click-through to the
source picker. A compliance answer somebody has read and approved must not change
because a file was uploaded in another tab.

`touched` is set the moment a reviewer types in the box, accepts a suggestion, or
picks a source, and it is what makes the second row of that table hold. The
fingerprint the review ran against is persisted with the draft, so resuming a
questionnaire days later — on another device — still notices what has changed
since.

### What "real time" does and does not mean here

Within a browser this is live: the fingerprint updates as soon as indexing
finishes, and the questionnaire reacts without a reload. Backfilling the index
bumps it explicitly, since re-indexing existing documents changes no record.

It is not push. A document imported by a colleague on another machine will not
appear until this browser reloads its records. Doing that properly means AppSync
subscriptions on the `KbIndexChunk` and `KbDocument` models — a real-time
transport the store layer does not use today, and which needs the backend
deployed first. Every browser is also its own guest identity until auth is
enforced, so there is no shared library to be notified about yet.

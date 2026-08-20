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
   │      PDF.js · Mammoth · CSV/TSV · TXT/MD
   │
   ├─ 2. find the questions    src/lib/questionExtract.js
   │      score candidate lines, strip markers, de-duplicate
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
| `.csv` `.tsv` | Parsed as a grid so table rows survive as rows |
| `.txt` `.md` | Read directly |

Both parsers load via dynamic `import()`, so they are code-split — PDF.js is over
a megabyte and someone who only pastes text never downloads it.

**Two honest failure modes.** A scanned PDF has no text layer: pages parse and
produce nothing, and the app says so rather than reporting "0 questions found"
(OCR would need Textract or tesseract.js). And `.xlsx` is not parsed — that needs
SheetJS — so the error tells you to export the sheet as CSV, which is supported.
Since SIG and CAIQ commonly arrive as spreadsheets, that is the most likely thing
to add next.

## 2. Finding the questions

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

## 3. Scoring

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

## 4. Classification

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
npm run test:unit     # extraction + matching, plain Node, no browser
npm test              # the above, plus both browser suites
```

- `tests/extraction.spec.mjs` — six real questionnaire formats, chunking, and
  regression tests for a whitespace pattern that used to take 67 seconds on an
  ordinary file.
- `tests/matching.spec.mjs` — lexical-only, hybrid with synthetic embeddings, thin
  evidence, corrupt vectors, dimension mismatch, and a 1,200-passage performance
  bound.
- `tests/autoreview.spec.mjs` — the whole chain in a real browser against a real
  PDF, including the failure paths (`.xlsx`, a file with no questions).

The negative assertions are the ones that matter most. A matcher that finds
something for every question is worse than useless here: it launders guesses as
evidence. So the tests check that unrelated questions get nothing, that document
passages are never auto-filled, and that thin evidence is downgraded.

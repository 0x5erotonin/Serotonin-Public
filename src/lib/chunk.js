/**
 * Splitting document text into passages for the auto-review index.
 *
 * Kept in its own module with no store or Amplify dependency, so it stays a
 * pure function of its input — which is what lets tests/extraction.spec.mjs
 * exercise it in plain Node without a bundler.
 */

/** Target passage size. Large enough to hold a whole control, small enough to cite. */
const CHUNK_TARGET = 700;
const CHUNK_MAX = 1100;
const CHUNK_OVERLAP = 120;
const MIN_CHUNK = 60;

/**
 * Once a passage reaches this size, a paragraph boundary ends it rather than
 * being merged across.
 *
 * Merging two whole sections into one passage still *matches* — but the citation
 * the analyst then sees is a wall of text spanning two topics, and precision is
 * most of the value of citing a source at all. Below this size a paragraph is
 * too small to stand alone and does get merged.
 */
const PARAGRAPH_BREAK = 280;

/** Cap per document, so one enormous PDF cannot flood the table. */
const MAX_CHUNKS_PER_DOC = 300;

/* ── Chunking ─────────────────────────────────────────────────────────────── */

/**
 * Split extracted text into passages.
 *
 * @param pages  [{ page, text }] from extractText (falls back to one page)
 * @returns [{ text, page, chunkIndex }]
 */
export function chunkPages(pages, fullText = '') {
  const source =
    Array.isArray(pages) && pages.length > 0
      ? pages
      : [{ page: 1, text: String(fullText || '') }];

  const chunks = [];
  for (const { page, text } of source) {
    for (const passage of splitPassage(String(text || ''))) {
      if (passage.trim().length < MIN_CHUNK) continue;
      chunks.push({ text: passage.trim(), page: page ?? null, chunkIndex: chunks.length });
      if (chunks.length >= MAX_CHUNKS_PER_DOC) return chunks;
    }
  }
  return chunks;
}

/* ── Boundary helpers ─────────────────────────────────────────────────────── */
//
// Every cut this file makes lands on a word boundary at minimum, and on a
// sentence boundary where one is available. Slicing by raw character index is
// what produced citations beginning mid-word — "ative access to production"
// instead of "administrative access to production" — because the 120-character
// overlap tail was taken with `slice(-120)` and simply started wherever that
// landed. A citation whose first word is a fragment reads as corrupted data, and
// it also poisons the lexical index: "ative" is a token that matches nothing.

/**
 * The smallest index at or after `index` that begins a whole word.
 * Returns text.length if there is no boundary left (one very long token).
 */
function wordStartAt(text, index) {
  if (index <= 0) return 0;
  if (index >= text.length) return text.length;
  if (/\s/.test(text[index - 1])) return index;
  const next = text.slice(index).search(/\s/);
  return next === -1 ? text.length : index + next + 1;
}

/**
 * The largest index at or before `index` that ends a whole word, so a passage
 * never stops mid-word either.
 */
function wordEndAt(text, index) {
  if (index >= text.length) return text.length;
  if (index <= 0) return 0;
  if (/\s/.test(text[index])) return index;
  const before = text.lastIndexOf(' ', index);
  return before <= 0 ? index : before;
}

/**
 * Where the carried-forward overlap should start.
 *
 * Prefers the first sentence boundary inside the overlap window, so the next
 * passage opens on a complete sentence and reads as a citation rather than a
 * fragment. Falls back to a word boundary when the window holds no sentence
 * break at all.
 */
function overlapStart(text, size) {
  if (text.length <= size) return 0;
  const from = text.length - size;
  const window = text.slice(from);
  // ". " / "! " / "? " — the character after the break starts the sentence.
  const match = window.match(/[.!?]["')\]]?\s+/);
  if (match && match.index !== undefined) {
    const candidate = from + match.index + match[0].length;
    // Only worth it if a useful amount of text remains.
    if (text.length - candidate >= 40) return candidate;
  }
  return wordStartAt(text, from);
}

/**
 * The units a paragraph is built from, largest first.
 *
 * Newlines are a boundary before sentences are. A spreadsheet reaches this file
 * as one line per row — `extract.js` joins cells with " | " and rows with "\n" —
 * and with no blank lines the whole sheet is a single "paragraph". Splitting
 * that on sentence boundaries put unrelated controls in one passage and cut
 * through the middle of them; splitting on rows keeps each control intact. For
 * prose, single newlines are line wraps, and breaking on them costs nothing
 * because the accumulator below merges units back up to the target size.
 */
function unitsOf(paragraph) {
  if (paragraph.length <= CHUNK_MAX) return [paragraph.replace(/\n+/g, ' ').trim()];

  const units = [];
  for (const line of paragraph.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.length <= CHUNK_MAX) {
      units.push(line);
      continue;
    }
    const sentences = line.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [line];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) units.push(trimmed);
    }
  }
  return units;
}

/**
 * Greedy accumulation over paragraphs, then rows or sentences for anything
 * oversized, with a trailing overlap carried into the next passage.
 */
function splitPassage(text) {
  // Horizontal whitespace is collapsed, newlines are kept: unitsOf needs them.
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim())
    .filter(Boolean);

  const out = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim().length >= MIN_CHUNK) out.push(buffer.trim());
    // Carry the tail forward so a control split across a boundary still matches
    // — starting at a sentence or word boundary, never mid-word.
    buffer = buffer.length > CHUNK_OVERLAP ? buffer.slice(overlapStart(buffer, CHUNK_OVERLAP)) : '';
  };

  for (const paragraph of paragraphs) {
    // Prefer to end a passage at a paragraph boundary once it is big enough to
    // be useful on its own — see PARAGRAPH_BREAK.
    if (buffer.trim().length >= PARAGRAPH_BREAK) flush();

    for (const piece of unitsOf(paragraph)) {
      const candidate = buffer ? `${buffer} ${piece}` : piece;
      if (candidate.length > CHUNK_TARGET && buffer) {
        flush();
        buffer = buffer ? `${buffer} ${piece}` : piece;
      } else {
        buffer = candidate;
      }

      // A single unit longer than the hard max — an unbroken wall of text with
      // no row, sentence or paragraph structure — is emitted on its own.
      while (buffer.length > CHUNK_MAX) {
        let end = wordEndAt(buffer, CHUNK_MAX);
        // A token longer than the whole chunk has no boundary to find; cut it.
        if (end < MIN_CHUNK) end = CHUNK_MAX;
        out.push(buffer.slice(0, end).trim());

        let resume = wordStartAt(buffer, Math.max(0, end - CHUNK_OVERLAP));
        // Guarantee forward progress whatever the input looks like.
        if (resume <= 0 || resume >= buffer.length) resume = end;
        buffer = buffer.slice(resume).replace(/^\s+/, '');
      }
    }
  }
  if (buffer.trim().length >= MIN_CHUNK) out.push(buffer.trim());
  return out;
}

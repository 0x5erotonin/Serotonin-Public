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

/**
 * Greedy accumulation over paragraphs, then sentences for anything oversized,
 * with a trailing overlap carried into the next passage.
 */
function splitPassage(text) {
  const paragraphs = text.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim().length >= MIN_CHUNK) out.push(buffer.trim());
    // Carry the tail forward so a control split across a boundary still matches.
    buffer = buffer.length > CHUNK_OVERLAP ? buffer.slice(-CHUNK_OVERLAP) : '';
  };

  for (const paragraph of paragraphs) {
    // Prefer to end a passage at a paragraph boundary once it is big enough to
    // be useful on its own — see PARAGRAPH_BREAK.
    if (buffer.trim().length >= PARAGRAPH_BREAK) flush();

    // A paragraph longer than the max gets broken on sentence boundaries.
    const pieces =
      paragraph.length > CHUNK_MAX
        ? paragraph.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [paragraph]
        : [paragraph];

    for (const piece of pieces) {
      const candidate = buffer ? `${buffer} ${piece.trim()}` : piece.trim();
      if (candidate.length > CHUNK_TARGET && buffer) {
        flush();
        buffer = buffer ? `${buffer} ${piece.trim()}` : piece.trim();
      } else {
        buffer = candidate;
      }
      // A single sentence longer than the hard max: emit it on its own.
      while (buffer.length > CHUNK_MAX) {
        out.push(buffer.slice(0, CHUNK_MAX).trim());
        buffer = buffer.slice(CHUNK_MAX - CHUNK_OVERLAP);
      }
    }
  }
  if (buffer.trim().length >= MIN_CHUNK) out.push(buffer.trim());
  return out;
}

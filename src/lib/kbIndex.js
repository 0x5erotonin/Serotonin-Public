/**
 * Building and maintaining the auto-review index.
 *
 * Two kinds of material go in, both as `chunks` rows:
 *
 *   documents  Imported policy files, split into passages. Split on paragraph
 *              and sentence boundaries with a small overlap, so a control that
 *              straddles a boundary is still findable, and page numbers are
 *              carried through so a match can be cited as "p.12".
 *
 *   qa         Question/answer pairs from completed questionnaires. One row per
 *              pair, matched on the question.
 *
 * Embeddings are attached at index time, once, rather than at match time — a
 * match run then costs one embedding call for the questions being asked, no
 * matter how large the knowledge base is. If the embedding function is
 * unavailable the rows are still written, just without vectors, and lexical
 * matching works on them immediately. Re-running the backfill later fills the
 * vectors in.
 */

import * as store from './store.js';
import { embedTexts } from './embeddings.js';
import { extractText } from './extract.js';
import { fetchStoredFile } from './files.js';
import { chunkPages } from './chunk.js';

export { chunkPages } from './chunk.js';
export { withCurrentSourceNames } from './sourceNames.js';

/* ── Embedding attachment ─────────────────────────────────────────────────── */

/**
 * Attach vectors to rows in place.
 *
 * Documents embed their passage text. Q&A rows embed the *question* only, even
 * though the lexical index uses question + answer: BM25 gains from the answer's
 * vocabulary, whereas an embedding of a long answer drifts away from the short
 * question it should match.
 */
async function attachEmbeddings(rows) {
  if (rows.length === 0) return { embedded: 0, available: false, reason: null };
  const targets = rows.map((row) =>
    row.sourceType === 'qa' ? row.question || row.text : row.text,
  );
  const result = await embedTexts(targets);
  let embedded = 0;
  rows.forEach((row, index) => {
    const vector = result.vectors[index];
    if (Array.isArray(vector) && vector.length > 0) {
      row.embedding = vector;
      row.embeddingDims = vector.length;
      row.embeddingModel = 'titan-embed-text-v2';
      embedded += 1;
    }
  });
  return { embedded, available: result.available, reason: result.reason };
}

const chunkId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/* ── Indexing a document ──────────────────────────────────────────────────── */

/**
 * Index one imported policy document.
 *
 * @param doc        the KbDocument UI record ({ id, name, category, storagePath })
 * @param extracted  { text, pages } from extractText — pass it in if the file was
 *                   just parsed on the way in, to avoid re-downloading it
 * @returns { chunks, embedded, warning }
 */
export async function indexDocument(doc, extracted = null) {
  if (!doc?.id) return { chunks: 0, embedded: 0, warning: 'Document has no id.' };

  let parsed = extracted;
  if (!parsed) {
    if (!doc.storagePath) {
      return { chunks: 0, embedded: 0, warning: `${doc.name}: the file itself was not stored, so it cannot be indexed.` };
    }
    const file = await fetchStoredFile(doc.storagePath, doc.name);
    if (!file) {
      return { chunks: 0, embedded: 0, warning: `${doc.name}: could not be retrieved from storage.` };
    }
    parsed = await extractText(file);
    if (parsed.error) return { chunks: 0, embedded: 0, warning: `${doc.name}: ${parsed.error}` };
  }

  const passages = chunkPages(parsed.pages, parsed.text);
  if (passages.length === 0) {
    return {
      chunks: 0,
      embedded: 0,
      warning:
        parsed.warnings?.[0] || `${doc.name}: no readable text found, so nothing was indexed.`,
    };
  }

  const rows = passages.map((passage) => ({
    id: chunkId('chunk'),
    sourceType: 'document',
    sourceId: String(doc.id),
    sourceName: doc.name || 'Document',
    category: doc.category || '',
    question: '',
    text: passage.text,
    page: passage.page,
    chunkIndex: passage.chunkIndex,
    embedding: null,
    embeddingDims: 0,
    embeddingModel: '',
    savedAt: new Date().toISOString(),
  }));

  // Embed first, delete second, insert third.
  //
  // Deleting up front would leave the document with no passages for the whole
  // duration of the embedding calls — up to a minute of Lambda time — during
  // which a match run sees it as unindexed and a reload strands it that way.
  // Doing the slow part first shrinks that window to two round trips.
  const { embedded } = await attachEmbeddings(rows);
  await removeChunksFor(doc.id);
  try {
    await store.createMany('chunks', rows);
  } catch (err) {
    return { chunks: 0, embedded: 0, warning: `${doc.name}: ${err?.message || err}` };
  }

  return {
    chunks: rows.length,
    embedded,
    warning: parsed.warnings?.[0] || null,
  };
}

/* ── Indexing a completed questionnaire ──────────────────────────────────── */

/**
 * Index the Q&A pairs of a completed questionnaire, so the next questionnaire
 * that asks the same thing can reuse the answer. Pairs with an empty answer are
 * skipped — an unanswered question is not answer history.
 */
export async function indexQaPairs(entry) {
  const pairs = Array.isArray(entry?.qaData) ? entry.qaData : [];
  const usable = pairs.filter((pair) => pair?.text?.trim() && pair?.answer?.trim());
  if (usable.length === 0) return { chunks: 0, embedded: 0 };

  const rows = usable.map((pair, index) => ({
    id: chunkId('qa'),
    sourceType: 'qa',
    sourceId: String(entry.id),
    sourceName: entry.vendor ? `${entry.vendor}${entry.date ? ` · ${entry.date}` : ''}` : 'Previous questionnaire',
    category: entry.industry || '',
    question: pair.text.trim(),
    text: pair.answer.trim(),
    page: null,
    chunkIndex: index,
    embedding: null,
    embeddingDims: 0,
    embeddingModel: '',
    savedAt: new Date().toISOString(),
  }));

  // Embed before removing the previous pass, for the reason in indexDocument.
  const { embedded } = await attachEmbeddings(rows);
  await removeChunksFor(entry.id);
  await store.createMany('chunks', rows);
  return { chunks: rows.length, embedded };
}

/* ── Reading and removing ────────────────────────────────────────────────── */

/** Every indexed passage for the current owner. Called by a match run. */
export async function loadChunks() {
  try {
    return await store.listAll('chunks');
  } catch (err) {
    console.warn('[serotonin] Could not load the knowledge base index.', err);
    return [];
  }
}

/**
 * Drop every passage belonging to one document or questionnaire.
 *
 * Queries by sourceId rather than listing the whole index and filtering: the
 * index carries embeddings, so downloading all of it to delete 300 rows was both
 * slow and pointless.
 */
export async function removeChunksFor(sourceId) {
  if (!sourceId) return 0;
  try {
    const candidates = await store.listByField('chunks', 'sourceId', String(sourceId));
    // Re-check client-side before deleting. If the server-side filter ever fails
    // to narrow — an unsupported filter shape, a resolver change — this query
    // returns the whole index, and deleting that would wipe the entire knowledge
    // base in order to re-index one document. Never delete a row we have not
    // confirmed belongs to this source.
    const doomed = candidates.filter((chunk) => String(chunk.sourceId) === String(sourceId));
    if (doomed.length !== candidates.length) {
      console.warn(
        `[serotonin] The index query returned ${candidates.length} rows for source ${sourceId} but only ${doomed.length} match — deleting just those.`,
      );
    }
    if (doomed.length === 0) return 0;
    await store.deleteRows('chunks', doomed);
    return doomed.length;
  } catch (err) {
    console.warn('[serotonin] Could not remove index entries.', err);
    return 0;
  }
}

/* ── Coverage + backfill ─────────────────────────────────────────────────── */

/**
 * What is indexed and what is not.
 *
 * The backfill exists because documents imported before this feature shipped
 * have an S3 object and no text. Without it the knowledge base would look
 * broken: files listed in the library that auto-review can never find.
 */
export function indexCoverage({ docs = [], entries = [], chunks = [] }) {
  const indexedSources = new Set(chunks.map((chunk) => String(chunk.sourceId)));
  const withoutVectors = chunks.filter((chunk) => !Array.isArray(chunk.embedding)).length;

  const pendingDocs = docs.filter(
    (doc) => !indexedSources.has(String(doc.id)) && !!doc.storagePath,
  );
  const unindexableDocs = docs.filter(
    (doc) => !indexedSources.has(String(doc.id)) && !doc.storagePath,
  );
  const pendingEntries = entries.filter(
    (entry) =>
      !indexedSources.has(String(entry.id)) &&
      Array.isArray(entry.qaData) &&
      entry.qaData.some((pair) => pair?.answer?.trim()),
  );

  return {
    chunks: chunks.length,
    withoutVectors,
    documentChunks: chunks.filter((c) => c.sourceType === 'document').length,
    qaChunks: chunks.filter((c) => c.sourceType === 'qa').length,
    pendingDocs,
    pendingEntries,
    unindexableDocs,
    pending: pendingDocs.length + pendingEntries.length,
  };
}

/**
 * Index everything not yet indexed.
 *
 * Sequential on purpose: each document is downloaded from S3, parsed in the
 * browser and embedded, so running them in parallel would fight for the main
 * thread and make the progress readout meaningless.
 */
export async function backfillIndex({ docs = [], entries = [], chunks = [], onProgress = () => {} }) {
  const coverage = indexCoverage({ docs, entries, chunks });
  const total = coverage.pending;
  const result = { indexed: 0, chunks: 0, embedded: 0, warnings: [], total };

  if (total === 0) {
    onProgress({ done: 0, total: 0, label: 'Everything is already indexed' });
    return result;
  }

  let done = 0;
  for (const doc of coverage.pendingDocs) {
    onProgress({ done, total, label: `Reading ${doc.name}` });
    try {
      const outcome = await indexDocument(doc);
      result.chunks += outcome.chunks;
      result.embedded += outcome.embedded;
      if (outcome.chunks > 0) result.indexed += 1;
      if (outcome.warning) result.warnings.push(outcome.warning);
    } catch (err) {
      result.warnings.push(`${doc.name}: ${err?.message || err}`);
    }
    done += 1;
    onProgress({ done, total, label: `Indexed ${doc.name}` });
  }

  for (const entry of coverage.pendingEntries) {
    onProgress({ done, total, label: `Indexing answers from ${entry.vendor || 'a questionnaire'}` });
    try {
      const outcome = await indexQaPairs(entry);
      result.chunks += outcome.chunks;
      result.embedded += outcome.embedded;
      if (outcome.chunks > 0) result.indexed += 1;
    } catch (err) {
      result.warnings.push(`${entry.vendor || 'questionnaire'}: ${err?.message || err}`);
    }
    done += 1;
    onProgress({ done, total, label: `Indexed ${entry.vendor || 'questionnaire'}` });
  }

  for (const doc of coverage.unindexableDocs) {
    result.warnings.push(
      `${doc.name}: metadata only — the file was never stored, so it cannot be indexed. Re-import it.`,
    );
  }

  onProgress({ done: total, total, label: 'Done' });
  return result;
}

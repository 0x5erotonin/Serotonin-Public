/**
 * Keeping index citations pointed at the right name.
 *
 * Split out of kbIndex.js purely so it can be unit tested: kbIndex pulls in the
 * store, which pulls in the Amplify client, which uses `import.meta.glob` and so
 * cannot be imported outside a bundler. This function is pure and has no
 * dependencies, so it belongs somewhere a plain Node test can reach it.
 */

/**
 * Re-point index rows at their source's current name.
 *
 * Index rows store `sourceName` denormalised, because the matcher works over
 * thousands of passages and should not be joining against anything. That copy
 * goes stale the moment a document is renamed, and auto-review would keep citing
 * the old filename — which is precisely when a citation stops being useful,
 * since the reader cannot find the document it names.
 *
 * Refreshing on read rather than rewriting on rename is deliberate: a rename
 * then touches one record instead of up to 300 index rows, it cannot half-fail,
 * and it also repairs rows that drifted for any other reason.
 *
 * Only 'document' rows are re-pointed. A 'qa' row's name is built from a
 * completed questionnaire's vendor and date, which renaming a document does not
 * affect.
 *
 * @param chunks  index rows as loaded
 * @param docs    the current kbDocs list
 * @returns the same rows with document names brought up to date. The original
 *          array is returned untouched when nothing needs correcting, so this is
 *          cheap to call before every review.
 */
export function withCurrentSourceNames(chunks = [], docs = []) {
  if (!chunks.length || !docs.length) return chunks;

  const nameById = new Map(
    docs.filter((doc) => doc?.id && doc?.name).map((doc) => [String(doc.id), doc.name]),
  );
  if (nameById.size === 0) return chunks;

  let changed = false;
  const updated = chunks.map((chunk) => {
    if (chunk?.sourceType !== 'document') return chunk;
    const current = nameById.get(String(chunk.sourceId));
    // No match means the document was deleted; keep the stored name so the row
    // still says something rather than going blank.
    if (!current || current === chunk.sourceName) return chunk;
    changed = true;
    return { ...chunk, sourceName: current };
  });

  return changed ? updated : chunks;
}

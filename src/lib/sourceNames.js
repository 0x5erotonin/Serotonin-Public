/**
 * Keeping index rows pointed at what their source is called and when it landed.
 *
 * Split out of kbIndex.js purely so it can be unit tested: kbIndex pulls in the
 * store, which pulls in the Amplify client, which uses `import.meta.glob` and so
 * cannot be imported outside a bundler. This function is pure and has no
 * dependencies, so it belongs somewhere a plain Node test can reach it.
 */

/**
 * Re-point index rows at their source's current name and date.
 *
 * Index rows store `sourceName` denormalised, because the matcher works over
 * thousands of passages and should not be joining against anything. That copy
 * goes stale the moment a document is renamed, and auto-review would keep citing
 * the old filename — precisely when a citation stops being useful, since the
 * reader cannot find the document it names.
 *
 * The date is stamped here rather than stored at index time for the same reason
 * it is needed at all: when two documents both answer a question, the reviewer's
 * first question is "which of these is current?", and a name alone cannot
 * answer it.
 *
 * Refreshing on read rather than rewriting on rename is deliberate: a rename
 * then touches one record instead of up to 300 index rows, it cannot half-fail,
 * and it also repairs rows that drifted for any other reason.
 *
 * A 'qa' row's name is composed from a completed questionnaire's vendor and date
 * at index time and is left alone; only its date is stamped.
 *
 * @param chunks            index rows as loaded
 * @param sources.docs      the current kbDocs list
 * @param sources.entries   the current kbEntries list
 * @returns the same rows brought up to date. The original array is returned
 *          untouched when nothing needs correcting, so this is cheap to call
 *          before every review.
 */
export function withCurrentSources(chunks = [], { docs = [], entries = [] } = {}) {
  if (!chunks.length) return chunks;

  const docById = new Map(
    (docs || []).filter((doc) => doc?.id).map((doc) => [String(doc.id), doc]),
  );
  const entryById = new Map(
    (entries || []).filter((entry) => entry?.id).map((entry) => [String(entry.id), entry]),
  );
  if (docById.size === 0 && entryById.size === 0) return chunks;

  let changed = false;
  const updated = chunks.map((chunk) => {
    const isDoc = chunk?.sourceType === 'document';
    const source = (isDoc ? docById : entryById).get(String(chunk?.sourceId));
    // No match means the source was deleted; keep whatever the row already says
    // rather than blanking a citation.
    if (!source) return chunk;

    // Documents own their name; a questionnaire's label was composed at index
    // time from fields a document rename cannot touch.
    const name = isDoc && source.name ? source.name : chunk.sourceName;
    const date = source.date || '';
    const savedAt = source.savedAt || '';

    if (
      name === chunk.sourceName &&
      date === (chunk.sourceDate || '') &&
      savedAt === (chunk.sourceSavedAt || '')
    ) {
      return chunk;
    }

    changed = true;
    return { ...chunk, sourceName: name, sourceDate: date, sourceSavedAt: savedAt };
  });

  return changed ? updated : chunks;
}

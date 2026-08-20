/**
 * Persistence layer.
 *
 * One async API, two implementations behind it:
 *
 *   AWS      When amplify_outputs.json exists, reads and writes go to AppSync /
 *            DynamoDB, scoped to the caller's ownerKey. Every result is also
 *            mirrored into local storage, so a dropped network or a cold start
 *            with no connectivity still renders the last known good data
 *            instead of an empty dashboard.
 *
 *   Device   With no backend configured, local storage *is* the store. This is
 *            what makes `npm run dev` on a fresh clone survive a refresh — the
 *            behaviour the app was missing — and it keeps the public demo
 *            working with no AWS account attached.
 *
 * Note the deliberate move off sessionStorage: sessionStorage is scoped to a tab
 * and evaporates when it closes, which is why the old build lost everything.
 *
 * ─── THREE THINGS THAT MAKE THE AWS PATH SAFE ───────────────────────────────
 *
 * 1. DIRTY TRACKING. A mutation that fails is recorded as dirty. `listAll` then
 *    overlays the dirty local copy on top of the server rows and retries the
 *    write, instead of letting the next successful read silently overwrite work
 *    that never reached DynamoDB.
 *
 * 2. TOMBSTONES. A delete that fails, or a delete that races an in-flight save
 *    of the same record, leaves a tombstone. Tombstoned ids are filtered out of
 *    reads, skipped by writes, and retried — so a deleted draft cannot come
 *    back from a mutation that was already in the air.
 *
 * 3. PER-ID SERIALISATION. All mutations for one record queue behind each other.
 *    Without this, two autosaves 1.2s apart could both see "no row yet" and both
 *    issue a create, losing the newer content to a duplicate-key error.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { getDataClient, getOwnerKey } from './amplifyClient.js';
import { COLLECTIONS, PROFILE_COLLECTION, asId } from './collections.js';

const MIRROR_PREFIX = 'serotonin.v2.';
const DIRTY_PREFIX = 'serotonin.v2.dirty.';
const TOMB_PREFIX = 'serotonin.v2.tomb.';
const SEEDED_PREFIX = 'serotonin.v2.seeded.';
const PAGE_LIMIT = 200;
const MAX_PAGES = 25;

/* ── Local-storage helpers ────────────────────────────────────────────────── */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Quota exceeded or private-mode restrictions. On the AWS path the real
    // write already happened, so this is a cache miss rather than data loss.
    console.warn(`[serotonin] Could not write "${key}" on this device.`, err);
    return false;
  }
}

const readMirror = (name, fallback) => readJson(`${MIRROR_PREFIX}${name}`, fallback);

/**
 * Write the on-device mirror, applying the collection's `stripForMirror` hook.
 *
 * Some collections carry fields that are pointless or ruinous to mirror — the
 * index's embedding vectors would exhaust the localStorage quota on their own.
 * Returns false when the write failed (quota, private mode), which matters when
 * the mirror *is* the store.
 */
function writeMirror(name, value) {
  const strip = COLLECTIONS[name]?.stripForMirror;
  const payload = strip && Array.isArray(value) ? value.map(strip) : value;
  return writeJson(`${MIRROR_PREFIX}${name}`, payload);
}

const readDirty = (name) => readJson(`${DIRTY_PREFIX}${name}`, {});
const readTombs = (name) => readJson(`${TOMB_PREFIX}${name}`, {});

function markDirty(name, id, dirty) {
  const map = readDirty(name);
  if (dirty) map[asId(id)] = Date.now();
  else delete map[asId(id)];
  writeJson(`${DIRTY_PREFIX}${name}`, map);
}

function markTomb(name, id, tombstoned) {
  const map = readTombs(name);
  if (tombstoned) map[asId(id)] = Date.now();
  else delete map[asId(id)];
  writeJson(`${TOMB_PREFIX}${name}`, map);
}

const isTombstoned = (name, id) => asId(id) in readTombs(name);

/** True once this collection's demo seed has been written, so it is never re-seeded. */
export const hasSeeded = (name) => readJson(`${SEEDED_PREFIX}${name}`, false) === true;
export const markSeeded = (name) => writeJson(`${SEEDED_PREFIX}${name}`, true);

/* ── Per-record mutation queue ────────────────────────────────────────────── */

const chains = new Map();

/**
 * Run `fn` after any mutation already queued for the same key, whether that one
 * succeeded or failed. Keeps create/update/delete for one record in order.
 */
function withLock(key, fn) {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const guarded = run.catch(() => {});
  chains.set(key, guarded);
  guarded.then(() => {
    if (chains.get(key) === guarded) chains.delete(key);
  });
  return run;
}

/* ── Collection helpers ───────────────────────────────────────────────────── */

function collection(name) {
  const def = COLLECTIONS[name];
  if (!def) throw new Error(`[serotonin] Unknown collection "${name}"`);
  return def;
}

/** Apply a collection's canonical ordering. Exported so hooks can re-sort merges. */
export function sortRows(name, rows) {
  const def = collection(name);
  return def.sort ? [...rows].sort(def.sort) : rows;
}

/** Replace-or-insert by id, preserving order. */
export function upsert(rows, record) {
  const id = asId(record.id);
  const index = rows.findIndex((row) => asId(row.id) === id);
  if (index === -1) return [record, ...rows];
  const next = [...rows];
  next[index] = record;
  return next;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

/** Read every record in a collection for the current owner. */
export async function listAll(name) {
  const def = collection(name);
  const client = await getDataClient();
  if (!client) return sortRows(name, readMirror(name, []));

  try {
    const ownerKey = await getOwnerKey();
    const model = client.models[def.model];
    const raw = [];
    let nextToken = null;
    let pages = 0;
    const maxPages = def.maxPages ?? MAX_PAGES;

    do {
      const { data, errors, nextToken: token } = await model.list({
        filter: { ownerKey: { eq: ownerKey } },
        limit: PAGE_LIMIT,
        nextToken,
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      raw.push(...(data || []));
      nextToken = token ?? null;
      pages += 1;
    } while (nextToken && pages < maxPages);

    // Silent truncation is the dangerous kind: a truncated index quietly stops
    // matching, and a truncated read makes deletes miss rows they should remove.
    if (nextToken) {
      console.warn(
        `[serotonin] "${name}" has more than ${maxPages * PAGE_LIMIT} records — the read was truncated. Raise maxPages for this collection.`,
      );
    }

    let rows = raw.map(def.fromModel);

    // Drop anything the user deleted whose delete has not landed yet, and retry
    // those deletes. Otherwise a failed delete reappears on every reload.
    const tombs = Object.keys(readTombs(name));
    if (tombs.length > 0) {
      const tombSet = new Set(tombs);
      rows = rows.filter((row) => !tombSet.has(asId(row.id)));
      for (const id of tombs) retryDelete(name, id);
    }

    // Overlay records whose write never reached AWS, so a successful read can
    // never discard unsaved work — then retry those writes.
    const dirtyIds = Object.keys(readDirty(name));
    if (dirtyIds.length > 0) {
      const mirror = readMirror(name, []);
      const dirtySet = new Set(dirtyIds);
      for (const local of mirror) {
        if (dirtySet.has(asId(local.id))) {
          rows = upsert(rows, local);
          retryPut(name, local);
        }
      }
    }

    writeMirror(name, rows);
    return sortRows(name, rows);
  } catch (err) {
    console.warn(`[serotonin] Could not load "${name}" from AWS — using the on-device mirror.`, err);
    return sortRows(name, readMirror(name, []));
  }
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

/**
 * Create or replace one record. Returns the normalised UI shape so callers hold
 * the same object the next read will produce (ids become strings, defaults fill
 * in), which keeps optimistic state and server state from drifting.
 *
 * Never rejects: a failed write is marked dirty and retried on the next read.
 */
export async function putRecord(name, uiRecord) {
  const def = collection(name);
  const ownerKey = await getOwnerKey();
  const modelRecord = def.toModel(uiRecord, ownerKey);
  const normalised = def.fromModel(modelRecord);
  const id = asId(modelRecord.id);

  // Mirror first, so the UI has something durable immediately even if the
  // network call below is slow or fails.
  writeMirror(name, upsert(readMirror(name, []), normalised));

  const client = await getDataClient();
  if (!client) return normalised; // device is the store of record; nothing to sync

  markDirty(name, id, true);
  await withLock(`${name}:${id}`, async () => {
    // The record may have been deleted while this save was in the air. Writing
    // now would resurrect it, in the UI and in DynamoDB.
    if (isTombstoned(name, id)) {
      markDirty(name, id, false);
      return;
    }
    try {
      const model = client.models[def.model];
      const existing = await model.get({ id });
      const op = existing?.data ? model.update : model.create;
      const { errors } = await op.call(model, modelRecord);
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      markDirty(name, id, false);
    } catch (err) {
      console.warn(
        `[serotonin] Could not save to "${name}" on AWS — kept on this device and queued for retry.`,
        err,
      );
    }
  });

  return normalised;
}

/** Create or replace several records. Sequential, so per-record locks stay ordered. */
export async function putMany(name, uiRecords) {
  const results = [];
  for (const record of uiRecords) {
    results.push(await putRecord(name, record));
  }
  return sortRows(name, results);
}

/**
 * Bulk-insert records that are known to be new.
 *
 * `putRecord` does a `get` before every write so it can choose create vs
 * update. That is right for user edits but wrong for bulk indexing: a 50-page
 * PDF becomes ~100 chunks, and 200 sequential round trips would make importing a
 * document feel broken. Freshly minted ids cannot already exist, so this skips
 * the existence check and runs with bounded concurrency.
 *
 * Falls back to `putRecord` for anything that fails, so a duplicate id is still
 * handled correctly rather than silently dropped.
 */
export async function createMany(name, uiRecords, { concurrency = 6 } = {}) {
  const def = collection(name);
  const ownerKey = await getOwnerKey();
  const prepared = uiRecords.map((record) => {
    const modelRecord = def.toModel(record, ownerKey);
    return { modelRecord, normalised: def.fromModel(modelRecord) };
  });

  // Mirror everything up front: one read-modify-write instead of N.
  const mirror = readMirror(name, []);
  const mirrored = writeMirror(name, [...prepared.map((p) => p.normalised), ...mirror]);

  const client = await getDataClient();
  if (!client) {
    // With no backend, the mirror IS the store — a failed write here is real
    // data loss, not a cache miss, so the caller has to hear about it rather
    // than reporting success for records that went nowhere.
    if (!mirrored) {
      throw new Error(
        `This browser's storage is full, so "${name}" could not be saved. Free up space, or attach an AWS backend.`,
      );
    }
    return prepared.map((p) => p.normalised);
  }

  const model = client.models[def.model];
  let cursor = 0;
  const failed = [];

  const worker = async () => {
    while (cursor < prepared.length) {
      const index = cursor;
      cursor += 1;
      const { modelRecord, normalised } = prepared[index];
      try {
        const { errors } = await model.create(modelRecord);
        if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      } catch (err) {
        failed.push({ normalised, err });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, prepared.length || 1) }, worker),
  );

  for (const { normalised, err } of failed) {
    console.warn(`[serotonin] Bulk insert into "${name}" fell back to upsert.`, err);
    await putRecord(name, normalised);
  }

  return prepared.map((p) => p.normalised);
}

/** Delete one record by id. Never rejects; a failed delete is retried on the next read. */
export async function deleteRecord(name, id) {
  const def = collection(name);
  const recordId = asId(id);

  writeMirror(
    name,
    readMirror(name, []).filter((row) => asId(row.id) !== recordId),
  );

  const client = await getDataClient();
  if (!client) return;

  // Set the tombstone before taking the lock: any save already queued for this
  // id will see it and skip its write.
  markDirty(name, recordId, false);
  markTomb(name, recordId, true);

  await withLock(`${name}:${recordId}`, async () => {
    try {
      const { errors } = await client.models[def.model].delete({ id: recordId });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      markTomb(name, recordId, false);
    } catch (err) {
      console.warn(`[serotonin] Could not delete from "${name}" on AWS — queued for retry.`, err);
    }
  });
}

/** Delete every record in a collection for the current owner. */
export async function deleteAll(name) {
  const rows = await listAll(name);
  for (const row of rows) {
    await deleteRecord(name, row.id);
  }
}

/**
 * Read the records of a collection whose `field` equals `value`.
 *
 * Filters server-side rather than pulling the whole collection down and
 * filtering in memory. That matters for the index: removing one document's
 * passages used to fetch every embedding in the knowledge base first.
 */
export async function listByField(name, field, value) {
  const def = collection(name);
  const client = await getDataClient();
  if (!client) {
    return sortRows(
      name,
      readMirror(name, []).filter((row) => String(row[field]) === String(value)),
    );
  }

  try {
    const ownerKey = await getOwnerKey();
    const model = client.models[def.model];
    const raw = [];
    let nextToken = null;
    let pages = 0;
    const maxPages = def.maxPages ?? MAX_PAGES;

    do {
      const { data, errors, nextToken: token } = await model.list({
        filter: { and: [{ ownerKey: { eq: ownerKey } }, { [field]: { eq: String(value) } }] },
        limit: PAGE_LIMIT,
        nextToken,
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      raw.push(...(data || []));
      nextToken = token ?? null;
      pages += 1;
    } while (nextToken && pages < maxPages);

    return sortRows(name, raw.map(def.fromModel));
  } catch (err) {
    console.warn(`[serotonin] Could not query "${name}" by ${field} — using the on-device mirror.`, err);
    return sortRows(
      name,
      readMirror(name, []).filter((row) => String(row[field]) === String(value)),
    );
  }
}

/** Delete records matching a predicate. Used to clean up a questionnaire's attachments. */
export async function deleteWhere(name, predicate) {
  const rows = await listAll(name);
  return deleteRows(name, rows.filter(predicate));
}

/**
 * Delete a known set of rows, a few at a time.
 *
 * Sequential deletion is fine for a handful of attachments but not for an
 * index: re-importing one 300-passage document meant 300 sequential round trips.
 * Distinct ids never contend for the same per-record lock, so a bounded pool is
 * safe here.
 */
export async function deleteRows(name, rows, { concurrency = 6 } = {}) {
  const doomed = [...rows];
  let cursor = 0;
  const worker = async () => {
    while (cursor < doomed.length) {
      const index = cursor;
      cursor += 1;
      await deleteRecord(name, doomed[index].id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, doomed.length || 1) }, worker));
  return doomed;
}

/* ── Retry helpers (fire-and-forget) ──────────────────────────────────────── */

function retryPut(name, record) {
  putRecord(name, record).catch(() => {});
}

async function retryDelete(name, id) {
  const def = collection(name);
  const client = await getDataClient();
  if (!client) return;
  withLock(`${name}:${asId(id)}`, async () => {
    try {
      const { errors } = await client.models[def.model].delete({ id: asId(id) });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
      markTomb(name, id, false);
    } catch {
      /* stays tombstoned; retried on the next read */
    }
  });
}

/* ── Profile (single record, keyed by owner) ──────────────────────────────── */

/** Read the single profile record for the current owner, or null. */
export async function getProfile() {
  const client = await getDataClient();
  if (!client) return readMirror('profile', null);

  try {
    const ownerKey = await getOwnerKey();
    const { data, errors } = await client.models[PROFILE_COLLECTION.model].get({ id: ownerKey });
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
    if (!data) return readMirror('profile', null);
    const ui = PROFILE_COLLECTION.fromModel(data);
    writeMirror('profile', ui);
    return ui;
  } catch (err) {
    console.warn('[serotonin] Could not load the profile from AWS — using the on-device mirror.', err);
    return readMirror('profile', null);
  }
}

/**
 * Mirror the profile locally without touching AWS. Called on every edit so a
 * refresh inside the debounce window cannot lose it.
 */
export function mirrorProfile(uiProfile) {
  const normalised = PROFILE_COLLECTION.fromModel(PROFILE_COLLECTION.toModel(uiProfile, ''));
  writeMirror('profile', normalised);
  return normalised;
}

/** Create or replace the profile record for the current owner. */
export async function saveProfile(uiProfile) {
  const ownerKey = await getOwnerKey();
  const modelRecord = PROFILE_COLLECTION.toModel(uiProfile, ownerKey);
  const normalised = PROFILE_COLLECTION.fromModel(modelRecord);
  writeMirror('profile', normalised);

  const client = await getDataClient();
  if (!client) return normalised;

  await withLock(`profile:${modelRecord.id}`, async () => {
    try {
      const model = client.models[PROFILE_COLLECTION.model];
      const existing = await model.get({ id: modelRecord.id });
      const op = existing?.data ? model.update : model.create;
      const { errors } = await op.call(model, modelRecord);
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
    } catch (err) {
      console.warn('[serotonin] Could not save the profile to AWS — kept on this device.', err);
    }
  });
  return normalised;
}

/* ── Audit log ────────────────────────────────────────────────────────────── */

/**
 * Append to the audit log. Fire-and-forget: a failed audit write must never
 * block the user action that triggered it.
 */
export async function recordAudit(action, entityType, entityId, metadata = {}) {
  const client = await getDataClient();
  if (!client) return;
  try {
    const ownerKey = await getOwnerKey();
    await client.models.AuditLog.create({
      ownerKey,
      action,
      entityType: entityType || '',
      entityId: asId(entityId),
      metadata,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[serotonin] Audit log write failed.', err);
  }
}

/* ── Legacy migration ─────────────────────────────────────────────────────── */

/**
 * One-time migration off the old sessionStorage keys.
 *
 * Anyone with the previous build open in a tab has drafts and KB entries that
 * would otherwise vanish the moment this version ships. Copy them into the new
 * store, then drop the old keys so this runs once.
 */
const LEGACY_KEYS = {
  drafts: 'serotonin_drafts',
  kbEntries: 'serotonin_kb',
  kbDocs: 'serotonin_kb_docs',
};

export async function migrateLegacySessionState() {
  const migrated = {};
  for (const [name, legacyKey] of Object.entries(LEGACY_KEYS)) {
    let legacyRows = [];
    try {
      const raw = sessionStorage.getItem(legacyKey);
      if (!raw) continue;
      legacyRows = JSON.parse(raw) || [];
    } catch {
      continue;
    }
    if (!Array.isArray(legacyRows) || legacyRows.length === 0) continue;

    // Never clobber records that already live in the new store, and never
    // resurrect one the user has since deleted.
    const current = await listAll(name);
    const knownIds = new Set(current.map((row) => asId(row.id)));
    const incoming = legacyRows.filter(
      (row) => !knownIds.has(asId(row.id)) && !isTombstoned(name, row.id),
    );
    if (incoming.length > 0) {
      await putMany(name, incoming);
      migrated[name] = incoming.length;
    }
    try {
      sessionStorage.removeItem(legacyKey);
    } catch {
      /* ignore */
    }
  }
  if (Object.keys(migrated).length > 0) {
    console.info('[serotonin] Migrated legacy session data into durable storage:', migrated);
  }
  return migrated;
}

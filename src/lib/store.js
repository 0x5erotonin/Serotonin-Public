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
/**
 * Set once a collection has been reconciled with AWS.
 *
 * Until then an empty result from AWS means "this collection has never been
 * uploaded", not "this collection is empty" — and the difference decides whether
 * overwriting the on-device copy destroys the only copy that exists.
 */
const SYNCED_PREFIX = 'serotonin.v2.synced.';
const MIGRATED_KEY = 'serotonin.v2.migratedToCloud';
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

const isSynced = (name) => readJson(`${SYNCED_PREFIX}${name}`, false) === true;
const markSynced = (name) => writeJson(`${SYNCED_PREFIX}${name}`, true);

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

  // Before any read is allowed to overwrite the mirror, the device's own
  // records have to be in the cloud. Without this gate the first read wins the
  // race against the migration, writes the cloud's view over the mirror, and
  // the migration then finds nothing left to upload.
  await ensureDeviceMigration();

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

    // ── Never let an empty cloud wipe a full device ──────────────────────
    //
    // The mirror is normally a cache of what AWS holds, so overwriting it with
    // a fresh read is right. It is NOT right the first time a backend appears:
    // everything written before that was stored on the device alone and was
    // never marked dirty (see putRecord — with no client there is nothing to
    // sync to, so no retry is queued). A successful read of an empty table
    // would then overwrite the only copy of the user's work with nothing.
    //
    // So an empty result is only allowed to overwrite the mirror once this
    // collection has actually been reconciled with AWS.
    const local = readMirror(name, []);
    if (rows.length === 0 && local.length > 0 && !isSynced(name)) {
      console.warn(
        `[serotonin] AWS returned no "${name}" records but ${local.length} exist on this device, ` +
          'and they have never been uploaded. Keeping the device copy — run the migration to upload them.',
      );
      return sortRows(name, local);
    }

    writeMirror(name, rows);
    markSynced(name);
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

/* ── Device → cloud migration ─────────────────────────────────────────────── */

/**
 * Move everything held on this device into AWS, once, the first time a backend
 * is actually reachable.
 *
 * Why this has to exist: with no `amplify_outputs.json` the device *is* the
 * store of record. `putRecord` returns early before marking anything dirty,
 * because there is nothing to sync to — so when a backend finally deploys there
 * is no retry queue to drain and nothing to tell the store that these records
 * have never been uploaded. Without this, the first successful read from an
 * empty DynamoDB would be treated as the truth.
 *
 * Runs at most once per device (`MIGRATED_KEY`), and only uploads a collection
 * that is empty in AWS — so it can never duplicate records or overwrite work
 * done on another device that got there first.
 *
 * File bytes are moved too. A KbDocument whose `storagePath` still points at
 * `idb://` would otherwise be listed in a cloud-backed library while its bytes
 * sat in one browser's IndexedDB, which looks exactly like a working document
 * until someone else clicks it.
 *
 * @param onProgress  called with { stage, detail, done, total }
 * @returns { ran, records, files, warnings }
 */
let migrationPromise = null;
const migrationWatchers = new Set();

/**
 * Run the device → cloud migration exactly once per page load, whoever asks.
 *
 * Both the store (before its first read) and the UI (to show progress) need
 * this to have happened; memoising it means they cannot run two copies against
 * each other. Progress is fanned out to every caller that asked for it.
 */
export function ensureDeviceMigration({ onProgress } = {}) {
  if (onProgress) migrationWatchers.add(onProgress);
  if (!migrationPromise) {
    migrationPromise = migrateDeviceToCloud({
      onProgress: (update) => {
        for (const watcher of migrationWatchers) {
          try { watcher(update); } catch { /* a broken listener must not stop the migration */ }
        }
      },
    }).catch((err) => {
      console.warn('[serotonin] Device-to-cloud migration failed.', err);
      return { ran: true, records: 0, files: 0, warnings: [String(err?.message || err)] };
    });
  }
  return migrationPromise;
}

export async function migrateDeviceToCloud({ onProgress = () => {} } = {}) {
  const result = { ran: false, records: 0, files: 0, warnings: [] };

  const client = await getDataClient();
  if (!client) return result;                        // still device-only
  if (readJson(MIGRATED_KEY, false) === true) return result;

  const names = Object.keys(COLLECTIONS);
  const pending = names.filter((name) => readMirror(name, []).length > 0);

  if (pending.length === 0) {
    // Nothing to move. Mark it done so this never runs again, and let the
    // collections be treated as reconciled.
    writeJson(MIGRATED_KEY, true);
    for (const name of names) markSynced(name);
    return result;
  }

  result.ran = true;
  onProgress({ stage: 'starting', detail: 'Checking what is already in the cloud', done: 0, total: pending.length });

  let index = 0;
  for (const name of pending) {
    index += 1;
    const local = readMirror(name, []);
    onProgress({ stage: 'records', detail: name, done: index, total: pending.length });

    try {
      // Merge by id rather than filling only an empty collection.
      //
      // Skipping a collection that already had rows looked safe and was not:
      // if another device synced first, this device's records — which exist
      // nowhere else — would be skipped here and then overwritten by the next
      // read, because a non-empty cloud result bypasses the guard in listAll.
      // Uploading only the ids the cloud does not have avoids both the loss and
      // any duplication.
      const remoteIds = await listRemoteIds(client, name);
      const missing = local.filter((record) => !remoteIds.has(asId(record.id)));

      for (const record of missing) {
        await putRecord(name, record);
        result.records += 1;
      }
      if (missing.length < local.length) {
        result.warnings.push(
          `${name}: ${local.length - missing.length} record(s) were already in the cloud and were left as they are.`,
        );
      }
      markSynced(name);
    } catch (err) {
      result.warnings.push(`${name}: ${err?.message || err}`);
    }
  }

  // Files second: the records now exist, so a rewritten storagePath lands on a
  // row that is already in the cloud.
  try {
    const moved = await migrateDeviceFiles(onProgress);
    result.files = moved.count;
    result.warnings.push(...moved.warnings);
  } catch (err) {
    result.warnings.push(`files: ${err?.message || err}`);
  }

  // Marked done even with warnings. A second automatic pass would re-upload
  // whatever succeeded the first time; the warnings say what needs a human.
  writeJson(MIGRATED_KEY, true);
  onProgress({ stage: 'done', detail: '', done: pending.length, total: pending.length });
  return result;
}

/** Every record id this owner already has in AWS for one collection. */
async function listRemoteIds(client, name) {
  const def = collection(name);
  const ownerKey = await getOwnerKey();
  const model = client.models[def.model];
  const ids = new Set();
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
    for (const row of data || []) ids.add(asId(row.id));
    nextToken = token ?? null;
    pages += 1;
  } while (nextToken && pages < maxPages);

  // A truncated read here would make records look absent and re-upload them.
  // They are keyed by id so nothing duplicates, but say so rather than hide it.
  if (nextToken) {
    throw new Error(
      `more than ${maxPages * PAGE_LIMIT} records already in the cloud — migration stopped rather than risk a partial comparison`,
    );
  }
  return ids;
}

/**
 * Re-upload `idb://` files to S3 and repoint the records at them.
 *
 * Imported lazily so the store does not pull the storage layer into every build
 * that never migrates.
 */
async function migrateDeviceFiles(onProgress) {
  const out = { count: 0, warnings: [] };
  const { fetchStoredFile, uploadFile } = await import('./files.js');

  const targets = [
    { name: 'kbDocs', folder: 'kb-documents' },
    { name: 'attachments', folder: 'attachments' },
  ];

  for (const { name, folder } of targets) {
    const rows = readMirror(name, []).filter((row) => String(row.storagePath || '').startsWith('idb://'));
    let done = 0;
    for (const row of rows) {
      done += 1;
      onProgress({ stage: 'files', detail: row.name || name, done, total: rows.length });
      try {
        const file = await fetchStoredFile(row.storagePath, row.name || 'document');
        if (!file) {
          out.warnings.push(`${row.name || row.id}: the stored bytes could not be read, so the record still points at this device.`);
          continue;
        }
        const uploaded = await uploadFile(file, { folder });
        if (uploaded.error || !uploaded.storagePath || uploaded.storagePath.startsWith('idb://')) {
          out.warnings.push(`${row.name || row.id}: upload failed (${uploaded.error || 'no path returned'}).`);
          continue;
        }
        await putRecord(name, { ...row, storagePath: uploaded.storagePath });
        out.count += 1;
      } catch (err) {
        out.warnings.push(`${row.name || row.id}: ${err?.message || err}`);
      }
    }
  }
  return out;
}

/* ── Export / import ──────────────────────────────────────────────────────── */

/** Everything this device holds, as one portable object. */
export async function exportEverything({ includeFiles = true, onProgress = () => {} } = {}) {
  const bundle = {
    format: 'serotonin.backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: {},
    profile: readJson(`${MIRROR_PREFIX}${PROFILE_COLLECTION}`, null),
    files: {},
  };

  for (const name of Object.keys(COLLECTIONS)) {
    onProgress({ stage: 'records', detail: name });
    // Read through the store rather than the mirror, so an AWS-backed device
    // exports what the server holds rather than a possibly partial cache.
    try {
      bundle.collections[name] = await listAll(name);
    } catch {
      bundle.collections[name] = readMirror(name, []);
    }
  }

  if (includeFiles) {
    const { fetchStoredFile } = await import('./files.js');
    const withFiles = [
      ...(bundle.collections.kbDocs || []),
      ...(bundle.collections.attachments || []),
    ].filter((row) => row.storagePath);

    let done = 0;
    for (const row of withFiles) {
      done += 1;
      onProgress({ stage: 'files', detail: row.name || row.id, done, total: withFiles.length });
      try {
        const file = await fetchStoredFile(row.storagePath, row.name || 'document');
        if (!file) continue;
        bundle.files[row.storagePath] = {
          name: row.name || 'document',
          contentType: file.type || 'application/octet-stream',
          base64: await fileToBase64(file),
        };
      } catch (err) {
        console.warn(`[serotonin] Could not include "${row.name}" in the export.`, err);
      }
    }
  }

  return bundle;
}

/**
 * Restore a bundle.
 *
 * Additive by default: a record whose id already exists is skipped rather than
 * overwritten, so importing a backup into a library that has moved on does not
 * roll it back. Pass `overwrite` to replace instead.
 */
export async function importEverything(bundle, { overwrite = false, onProgress = () => {} } = {}) {
  const summary = { records: 0, files: 0, skipped: 0, warnings: [] };
  if (!bundle || bundle.format !== 'serotonin.backup') {
    throw new Error('That file is not a Serotonin backup.');
  }

  const { uploadFile } = await import('./files.js');
  const pathMap = new Map();

  // Files first, so records can be written already pointing at the new paths.
  const fileEntries = Object.entries(bundle.files || {});
  let fileIndex = 0;
  for (const [originalPath, payload] of fileEntries) {
    fileIndex += 1;
    onProgress({ stage: 'files', detail: payload?.name || originalPath, done: fileIndex, total: fileEntries.length });
    try {
      const file = base64ToFile(payload.base64, payload.name, payload.contentType);
      const folder = originalPath.includes('attachments') ? 'attachments' : 'kb-documents';
      const uploaded = await uploadFile(file, { folder });
      if (uploaded.storagePath) {
        pathMap.set(originalPath, uploaded.storagePath);
        summary.files += 1;
      }
    } catch (err) {
      summary.warnings.push(`${payload?.name || originalPath}: ${err?.message || err}`);
    }
  }

  for (const [name, rows] of Object.entries(bundle.collections || {})) {
    if (!COLLECTIONS[name] || !Array.isArray(rows)) continue;
    onProgress({ stage: 'records', detail: name });
    const existing = new Set((await listAll(name)).map((row) => asId(row.id)));
    for (const row of rows) {
      if (!overwrite && existing.has(asId(row.id))) {
        summary.skipped += 1;
        continue;
      }
      try {
        const storagePath = pathMap.get(row.storagePath) || row.storagePath;
        await putRecord(name, { ...row, storagePath });
        summary.records += 1;
      } catch (err) {
        summary.warnings.push(`${name}/${row.id}: ${err?.message || err}`);
      }
    }
  }

  return summary;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.slice(value.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToFile(base64, name, contentType) {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || 'document', { type: contentType || 'application/octet-stream' });
}

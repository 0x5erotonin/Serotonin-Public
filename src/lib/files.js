/**
 * File storage.
 *
 * Before this existed the app kept a filename and a byte count and threw the
 * file itself away — an upload looked like it worked until you refreshed. Now
 * the bytes actually go somewhere:
 *
 *   AWS      Amplify Storage → S3. Objects land under the caller's own prefix
 *            and are read back through short-lived signed URLs.
 *
 *   Device   IndexedDB. Chosen over localStorage because it stores Blobs
 *            natively and is not capped at ~5 MB, so a real 8 MB SOC 2 PDF
 *            survives a refresh even with no AWS account attached.
 *
 * Either way the caller gets back a `storagePath` to persist alongside the
 * document record, and `getFileUrl(storagePath)` turns it back into something
 * an <a href> or <img src> can use.
 */

import { getIdentityId, getOwnerKey, isSignedIn, isSharedLibrary } from './amplifyClient.js';
import { SHARED_FILE_PREFIX } from './libraryMode.js';

const IDB_SCHEME = 'idb://';
const DB_NAME = 'serotonin-files';
const DB_STORE = 'files';
const DB_VERSION = 1;

/**
 * storagePath → object URL, for on-device files. Cached so repeated downloads
 * of the same document do not leak a new blob URL each time, and revoked when
 * the file is deleted.
 */
const blobUrls = new Map();

function revokeBlobUrl(storagePath) {
  const url = blobUrls.get(storagePath);
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* already gone */
  }
  blobUrls.delete(storagePath);
}

/* ── Human-readable sizes ─────────────────────────────────────────────────── */

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Path building ────────────────────────────────────────────────────────── */

/** Strip anything that would make an awkward S3 key. */
function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120);
}

function uniqueSegment() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Where a new object goes.
 *
 * Signed-in callers get `user-files/<identityId>/…`, which IAM locks to them
 * individually. Guests get `guest-files/<identityId>/…` — scoped per browser in
 * the UI, but not enforced by IAM, because unauthenticated identities cannot be
 * isolated that way. See amplify/storage/resource.ts.
 */
async function resolvePrefix(identityId) {
  // `isSignedIn()` reads a flag that only gets set once the session has been
  // resolved. Await getOwnerKey() first so an upload that happens before any
  // record read cannot mistake a signed-in user for a guest and drop their file
  // into the unenforced prefix.
  await getOwnerKey();
  // One prefix for everyone, so a file uploaded from one browser opens in
  // another. Existing objects under guest-files/ keep working untouched: that
  // rule already grants every guest read across the whole prefix, so nothing
  // has to be moved when the mode changes.
  if (isSharedLibrary()) return SHARED_FILE_PREFIX;
  return isSignedIn() ? `user-files/${identityId}/` : `guest-files/${identityId}/`;
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Persist a File/Blob. `folder` groups objects logically ('kb-documents',
 * 'attachments', 'avatars').
 *
 * Returns metadata to store on the record. Never throws: on failure it returns
 * a result with `storagePath: ''` and an `error`, so the document still gets
 * saved with its metadata rather than the whole import dying.
 */
export async function uploadFile(file, { folder = 'uploads' } = {}) {
  const meta = {
    name: file?.name || 'Untitled file',
    sizeBytes: Number(file?.size) || 0,
    contentType: file?.type || 'application/octet-stream',
    storagePath: '',
    error: null,
  };
  if (!file) return { ...meta, error: 'No file provided' };

  const key = `${folder}/${uniqueSegment()}-${safeName(meta.name)}`;
  const identityId = await getIdentityId();

  // No backend configured → keep the bytes on this device.
  if (!identityId) {
    try {
      await idbPut(key, file);
      return { ...meta, storagePath: `${IDB_SCHEME}${key}` };
    } catch (err) {
      console.warn('[serotonin] Could not store the file on this device.', err);
      return { ...meta, error: String(err?.message || err) };
    }
  }

  try {
    const { uploadData } = await import('aws-amplify/storage');
    const path = `${await resolvePrefix(identityId)}${key}`;
    await uploadData({
      path,
      data: file,
      options: { contentType: meta.contentType },
    }).result;
    return { ...meta, storagePath: path };
  } catch (err) {
    console.warn('[serotonin] S3 upload failed — falling back to on-device storage.', err);
    try {
      await idbPut(key, file);
      return { ...meta, storagePath: `${IDB_SCHEME}${key}` };
    } catch (fallbackErr) {
      return { ...meta, error: String(fallbackErr?.message || fallbackErr) };
    }
  }
}

/**
 * Turn a stored path back into a usable URL, or null if the object is gone.
 *
 * S3 URLs are signed and expire (default 15 minutes), so resolve them at the
 * moment of use rather than caching them in a record.
 */
export async function getFileUrl(storagePath) {
  if (!storagePath) return null;

  if (storagePath.startsWith(IDB_SCHEME)) {
    // Reuse the object URL per path. Minting a new one on every click pins
    // another copy of the blob in memory for the life of the document, which
    // adds up fast with multi-megabyte PDFs.
    const cached = blobUrls.get(storagePath);
    if (cached) return cached;
    try {
      const blob = await idbGet(storagePath.slice(IDB_SCHEME.length));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      blobUrls.set(storagePath, url);
      return url;
    } catch (err) {
      console.warn('[serotonin] Could not read the file from this device.', err);
      return null;
    }
  }

  try {
    const { getUrl } = await import('aws-amplify/storage');
    const { url } = await getUrl({ path: storagePath, options: { expiresIn: 900 } });
    return url?.toString() ?? null;
  } catch (err) {
    console.warn('[serotonin] Could not sign a download URL.', err);
    return null;
  }
}

/** Delete a stored object. Best effort — a failed delete must not block the UI. */
export async function removeFile(storagePath) {
  if (!storagePath) return;

  if (storagePath.startsWith(IDB_SCHEME)) {
    revokeBlobUrl(storagePath);
    try {
      await idbDelete(storagePath.slice(IDB_SCHEME.length));
    } catch (err) {
      console.warn('[serotonin] Could not delete the on-device file.', err);
    }
    return;
  }

  try {
    const { remove } = await import('aws-amplify/storage');
    await remove({ path: storagePath });
  } catch (err) {
    console.warn('[serotonin] Could not delete the S3 object.', err);
  }
}

/**
 * Open a stored file. Returns false when it could not be resolved.
 *
 * `window.open` is attempted first, but it is called after an `await` — the
 * click's user-gesture window has expired by then, so popup blockers routinely
 * refuse it and return null. The anchor fallback is treated as a navigation
 * rather than a popup, so it survives that.
 */
export async function openFile(storagePath, { filename } = {}) {
  const url = await getFileUrl(storagePath);
  if (!url) return false;

  let opened = null;
  try {
    opened = window.open(url, '_blank', 'noopener');
  } catch {
    opened = null;
  }
  if (opened) return true;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  // Ignored for cross-origin S3 URLs, honoured for on-device blob URLs.
  if (filename) anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

/**
 * Retrieve a stored object as a File, for re-parsing.
 *
 * The backfill needs this: documents imported before auto-review existed have
 * an S3 object and no extracted text, so indexing them means fetching the bytes
 * back and running the parser over them. Works for both S3 signed URLs and
 * on-device blob URLs, since both are fetchable.
 */
export async function fetchStoredFile(storagePath, name = 'document') {
  const url = await getFileUrl(storagePath);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new File([blob], name, { type: blob.type || 'application/octet-stream' });
  } catch (err) {
    console.warn(`[serotonin] Could not fetch "${name}" back from storage.`, err);
    return null;
  }
}

/* ── IndexedDB helpers ────────────────────────────────────────────────────── */

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function idbTransaction(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const store = tx.objectStore(DB_STORE);
        let result;
        try {
          result = run(store);
        } catch (err) {
          reject(err);
          return;
        }
        // IDBRequest results are only readable once the transaction completes.
        // `'result' in x` rather than `??` so a legitimately-undefined value
        // (key not found) does not fall through to the request object itself.
        tx.oncomplete = () =>
          resolve(result && typeof result === 'object' && 'result' in result ? result.result : result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function idbPut(key, blob) {
  return idbTransaction('readwrite', (store) => store.put(blob, key));
}

function idbGet(key) {
  return idbTransaction('readonly', (store) => store.get(key));
}

function idbDelete(key) {
  return idbTransaction('readwrite', (store) => store.delete(key));
}

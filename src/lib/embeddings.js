/**
 * Client side of the semantic half of the matcher.
 *
 * Calls the `embedTexts` mutation (amplify/data/resource.ts → the embed-text
 * Lambda → Bedrock Titan V2) and caches the results.
 *
 * The important property here is that being unavailable is normal, not an
 * error. There is no backend in demo mode; Bedrock model access might not be
 * enabled; the region might not have Titan. In every one of those cases this
 * module reports `available: false` with a reason, and the matcher runs
 * lexical-only — degraded, but working and honest about it.
 *
 * Cached in sessionStorage as well as memory: a questionnaire that gets
 * re-reviewed, or a page reload mid-review, should not re-pay for embeddings it
 * already has.
 */

import { getDataClient } from './amplifyClient.js';

const CACHE_KEY = 'serotonin.v2.embedCache';
const CACHE_LIMIT = 400;
const MAX_PER_CALL = 100;

/** Why the semantic half is off, if it is. Surfaced in the UI. */
let unavailableReason = null;
let probed = false;

const memoryCache = new Map();
let cacheLoaded = false;

/* ── Cache ────────────────────────────────────────────────────────────────── */

/**
 * Cache key. Includes the model and dimension count, not just the text: a cached
 * 256-dim vector is useless once the backend starts returning 512-dim ones, and
 * keying on text alone would serve the stale width forever.
 */
function cacheKeyFor(text, fingerprint) {
  // Small, stable, collision-tolerant: a cache miss just re-embeds.
  const normalised = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let i = 0; i < normalised.length; i += 1) {
    hash = ((hash << 5) + hash + normalised.charCodeAt(i)) | 0;
  }
  return `${fingerprint}|${normalised.length}:${(hash >>> 0).toString(36)}`;
}

/** Model + dimensions last seen from the backend, used in the cache key. */
let modelFingerprint = 'unknown';

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return;
    for (const [key, vector] of Object.entries(JSON.parse(raw) || {})) {
      if (Array.isArray(vector)) memoryCache.set(key, vector);
    }
  } catch {
    /* corrupt cache is a cache miss, nothing more */
  }
}

function persistCache() {
  try {
    // Keep the most recent entries only; vectors are a few KB each.
    const entries = [...memoryCache.entries()].slice(-CACHE_LIMIT);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* quota — the memory cache still works for this session */
  }
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Embed an array of strings.
 *
 * @returns { vectors, available, reason, model, dimensions }
 *          `vectors[i]` is a number[] or null. Nulls are expected and fine:
 *          the matcher falls back to lexical for those.
 */
export async function embedTexts(texts) {
  loadCache();
  const list = (texts || []).map((t) => String(t || ''));
  const vectors = new Array(list.length).fill(null);

  // Serve what we already have.
  const pending = [];
  list.forEach((text, index) => {
    const key = cacheKeyFor(text, modelFingerprint);
    const cached = memoryCache.get(key);
    if (cached) vectors[index] = cached;
    else if (text.trim()) pending.push({ index, text, key });
  });

  if (pending.length === 0) {
    return {
      vectors,
      available: !unavailableReason,
      reason: unavailableReason,
      cached: true,
    };
  }

  const client = await getDataClient();
  if (!client) {
    unavailableReason = 'No backend is attached to this build, so semantic matching is off.';
    return { vectors, available: false, reason: unavailableReason };
  }
  if (typeof client.mutations?.embedTexts !== 'function') {
    unavailableReason =
      'The embedTexts function is not deployed — run `npx ampx sandbox` or redeploy the backend.';
    return { vectors, available: false, reason: unavailableReason };
  }

  try {
    // Chunked so one run cannot exceed the Lambda's own cap.
    for (let offset = 0; offset < pending.length; offset += MAX_PER_CALL) {
      const batch = pending.slice(offset, offset + MAX_PER_CALL);
      const { data, errors } = await client.mutations.embedTexts({
        texts: batch.map((item) => item.text),
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));

      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      const returned = payload?.vectors;
      if (!Array.isArray(returned)) throw new Error('embedTexts returned no vectors');

      // If the backend has switched model or dimensions, the cached vectors are
      // a different shape and must not be mixed with the new ones.
      const fingerprint = `${payload?.model || 'model'}@${payload?.dimensions || 0}`;
      if (fingerprint !== modelFingerprint) {
        if (modelFingerprint !== 'unknown') {
          console.info(`[serotonin] Embedding model changed (${modelFingerprint} → ${fingerprint}); clearing the vector cache.`);
          memoryCache.clear();
        }
        modelFingerprint = fingerprint;
      }

      if (payload?.errors?.length) {
        // Bedrock rejected some or all of them — most often model access is not
        // enabled. Report it, but keep whatever did come back.
        unavailableReason = `Bedrock: ${payload.errors[0]}`;
      }

      batch.forEach((item, i) => {
        const vector = returned[i];
        if (Array.isArray(vector) && vector.length > 0) {
          vectors[item.index] = vector;
          // Re-key: the fingerprint may have changed since the key was computed.
          memoryCache.set(cacheKeyFor(item.text, modelFingerprint), vector);
        }
      });
    }
    persistCache();
    probed = true;

    const gotAny = vectors.some(Array.isArray);
    if (gotAny) unavailableReason = null;
    return {
      vectors,
      available: gotAny,
      reason: gotAny ? null : unavailableReason || 'Bedrock returned no embeddings.',
    };
  } catch (err) {
    unavailableReason = `Semantic matching unavailable: ${err?.message || err}`;
    console.warn('[serotonin] Embedding call failed — falling back to lexical matching.', err);
    return { vectors, available: false, reason: unavailableReason };
  }
}

/** Last known reason the semantic half is off, or null. */
export const semanticStatus = () => ({
  probed,
  available: probed && !unavailableReason,
  reason: unavailableReason,
});

/** Drop cached vectors — call if the embedding model or dimensions change. */
export function clearEmbeddingCache() {
  memoryCache.clear();
  unavailableReason = null;
  probed = false;
  modelFingerprint = 'unknown';
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

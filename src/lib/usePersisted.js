/**
 * React bindings over src/lib/store.js.
 *
 * These hooks exist so Serotonin.jsx barely changes. The old code looked like:
 *
 *     const [drafts, setDrafts] = useState(() => JSON.parse(sessionStorage…))
 *     const saveDraft   = (d)  => { …setDrafts…; sessionStorage.setItem(…) }
 *     const deleteDraft = (id) => { …setDrafts…; sessionStorage.setItem(…) }
 *
 * and becomes:
 *
 *     const { items: drafts, save: saveDraft, remove: deleteDraft } =
 *       usePersistentList('drafts')
 *
 * Same call signatures reach the components, so every `onSaveDraft={saveDraft}`
 * prop keeps working untouched.
 *
 * Writes are optimistic: state updates immediately, persistence happens in the
 * background, and a failure is logged rather than thrown — the user never loses
 * a keystroke to a slow network. Three guards keep that from going wrong:
 *
 *   • A per-id version counter, so a slow older response cannot overwrite the
 *     newer value the user has already seen.
 *   • A removed-id set, so a save still in flight cannot resurrect a record the
 *     user just deleted.
 *   • A locally-written set, so the initial load — which on a cold start can
 *     resolve *after* the first autosave — merges instead of clobbering.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as store from './store.js';
import { asId } from './collections.js';

/**
 * A durable array of records.
 *
 * @param name  collection key from COLLECTIONS
 * @param seed  optional () => rows, written once ever for this collection (used
 *              for the demo notification feed). Guarded by a persisted marker so
 *              clearing the feed does not bring it back on the next load.
 */
export function usePersistentList(name, { seed } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const seedRef = useRef(seed);
  seedRef.current = seed;

  // Mirror of `items` for callbacks that need the current value without
  // re-creating themselves on every change.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const versions = useRef(new Map()); // id → latest issued save version
  const removed = useRef(new Set()); // ids deleted this session
  const localWrites = useRef(new Set()); // ids written locally, may pre-date the load

  useEffect(() => {
    mounted.current = true;
    (async () => {
      let rows = [];
      try {
        rows = await store.listAll(name);
        if (rows.length === 0 && seedRef.current && !store.hasSeeded(name)) {
          const seedRows = seedRef.current() || [];
          if (seedRows.length > 0) rows = await store.putMany(name, seedRows);
          store.markSeeded(name);
        }
      } catch (err) {
        console.warn(`[serotonin] Could not load "${name}".`, err);
      }
      if (!mounted.current) return;

      setItems((pending) => {
        // Nothing happened while loading — take the server view as-is.
        if (localWrites.current.size === 0 && removed.current.size === 0) return rows;
        // Otherwise keep anything written or deleted in the meantime: those are
        // newer than what the read returned.
        let merged = rows.filter((row) => !removed.current.has(asId(row.id)));
        for (const row of pending) {
          if (localWrites.current.has(asId(row.id))) merged = store.upsert(merged, row);
        }
        return store.sortRows(name, merged);
      });
      setLoading(false);
    })();
    return () => {
      mounted.current = false;
    };
  }, [name]);

  /** Create or replace one record. Accepts the UI shape the components already build. */
  const save = useCallback(
    (record) => {
      if (!record) return;
      const id = asId(record.id);
      const version = (versions.current.get(id) ?? 0) + 1;
      versions.current.set(id, version);
      removed.current.delete(id);
      localWrites.current.add(id);

      setItems((prev) => store.upsert(prev, { ...record, id }));

      store
        .putRecord(name, record)
        .then((normalised) => {
          if (!mounted.current || !normalised) return;
          // A newer save has been issued since — its value is the one on screen.
          if (versions.current.get(id) !== version) return;
          // Deleted while this was in flight; do not bring it back.
          if (removed.current.has(id)) return;
          setItems((prev) =>
            prev.some((row) => asId(row.id) === id) ? store.upsert(prev, normalised) : prev,
          );
        })
        .catch((err) => console.warn(`[serotonin] Could not save to "${name}".`, err));
    },
    [name],
  );

  /** Delete one record by id. */
  const remove = useCallback(
    (id) => {
      const target = asId(id);
      removed.current.add(target);
      localWrites.current.delete(target);
      versions.current.delete(target);
      setItems((prev) => prev.filter((row) => asId(row.id) !== target));
      store
        .deleteRecord(name, target)
        .catch((err) => console.warn(`[serotonin] Could not delete from "${name}".`, err));
    },
    [name],
  );

  /** Delete everything in the collection. */
  const removeAll = useCallback(() => {
    for (const row of itemsRef.current) removed.current.add(asId(row.id));
    localWrites.current.clear();
    setItems([]);
    store.deleteAll(name).catch((err) => console.warn(`[serotonin] Could not clear "${name}".`, err));
  }, [name]);

  /**
   * Apply a patch to matching records and persist each one. Used for
   * mark-as-read, which touches one or every notification.
   */
  const patch = useCallback(
    (predicate, changes) => {
      // Read from the ref rather than inside a setState updater: StrictMode
      // invokes updaters twice in development, which would double the writes.
      const current = itemsRef.current;
      const touched = current.filter(predicate).map((row) => ({ ...row, ...changes }));
      if (touched.length === 0) return;
      const touchedIds = new Set(touched.map((row) => asId(row.id)));
      for (const id of touchedIds) {
        versions.current.set(id, (versions.current.get(id) ?? 0) + 1);
        localWrites.current.add(id);
      }
      setItems(current.map((row) => (touchedIds.has(asId(row.id)) ? { ...row, ...changes } : row)));
      store
        .putMany(name, touched)
        .catch((err) => console.warn(`[serotonin] Could not update "${name}".`, err));
    },
    [name],
  );

  return { items, loading, save, remove, removeAll, patch };
}

/**
 * A single durable record (the user profile).
 *
 * Returns a setter with the same contract as `useState`'s — value or updater
 * function — so `onUpdateProfile={setProfile}` needs no changes at the call
 * site. Persistence is debounced, because the profile panel writes on every
 * keystroke and every preference toggle.
 *
 * Two things worth knowing:
 *   • Nothing is written to AWS until the stored profile has been read back.
 *     Otherwise an early edit — the sign-in seeding effect, say — could persist
 *     a mostly-empty default record over a real saved profile.
 *   • Every edit mirrors to this device immediately, so a refresh inside the
 *     debounce window still keeps it.
 */
export function usePersistentProfile(defaults, { debounceMs = 500 } = {}) {
  const [profile, setProfileState] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const timer = useRef(null);
  const pending = useRef(null);
  const hydrated = useRef(false);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const toSave = pending.current;
    pending.current = null;
    if (toSave && hydrated.current) {
      store
        .saveProfile(toSave)
        .catch((err) => console.warn('[serotonin] Could not save the profile.', err));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      let stored = null;
      try {
        stored = await store.getProfile();
      } catch (err) {
        console.warn('[serotonin] Could not load the profile.', err);
      }
      if (!mounted.current) return;
      if (stored) {
        setProfileState((prev) => ({
          ...prev,
          ...stripEmpty(stored),
          // Merge prefs so a preference added in a later release still gets its
          // default instead of coming back undefined.
          prefs: { ...prev.prefs, ...(stored.prefs || {}) },
        }));
      }
      hydrated.current = true;
      setLoading(false);
      // An edit made while the read was in flight was mirrored but not synced.
      if (pending.current) flush();
    })();

    // A refresh or tab close never runs effect cleanup, so flush on pagehide too.
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  const setProfile = useCallback(
    (valueOrUpdater) => {
      setProfileState((prev) => {
        const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
        if (!next) return prev;
        pending.current = next;
        // Durable on this device straight away, regardless of the debounce.
        try {
          store.mirrorProfile(next);
        } catch {
          /* non-fatal */
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, debounceMs);
        return next;
      });
    },
    [debounceMs, flush],
  );

  return { profile, setProfile, loading };
}

/** Drop empty strings so a blank stored field cannot overwrite a real default. */
function stripEmpty(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === '' || value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Durable scalar in local storage — theme choice, editor scratch state.
 * Synchronous by design: these are read during the first render.
 *
 * `validate` guards against a corrupt or stale stored value. That matters more
 * than it used to: under sessionStorage a bad value died with the tab, but a bad
 * value in local storage would break every load until site data is cleared.
 */
export function useLocalValue(key, initial, validate) {
  const storageKey = `serotonin.v2.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw);
      if (validate && !validate(parsed)) return initial;
      return parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* quota or private mode — non-fatal */
    }
  }, [storageKey, value]);

  return [value, setValue];
}

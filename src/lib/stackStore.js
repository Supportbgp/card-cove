// On-device storage for the stack scanner (decided with the user: the stack
// lives on this device until it's added to the catalog — no new table).
// IndexedDB rather than localStorage: every stacked card carries its own
// photo (~50-150 KB as a JPEG data URL), so a few dozen cards would blow
// past localStorage's ~5 MB per-origin limit, while IndexedDB has room.
//
// Every call is best-effort: IndexedDB can be missing (older browsers,
// jsdom in unit tests) or blocked (private windows, cleared site data). A
// failure just means the stack isn't saved — scanning itself never breaks.

import { IS_STAGING } from './appEnv.js';

// Staging is served from the same origin as production
// (supportbgp.github.io), and IndexedDB is per origin, so it gets its own
// database: a stack scanned on staging must never show up in production.
const DB_NAME = IS_STAGING ? 'card-cove-staging' : 'card-cove';
const STORE = 'scan-stacks';
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function loadStack(key) {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveStack(key, items) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (items && items.length) tx.objectStore(STORE).put(items, key);
      else tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

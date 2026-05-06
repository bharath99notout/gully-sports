// Tiny IndexedDB wrapper. No dependency on `idb` — keeps bundle small and the
// surface tiny enough to audit. The single store holds queued mutations that
// could not (or should not) reach Supabase yet.

const DB_NAME = 'gullysports_offline';
const DB_VERSION = 1;
const STORE = 'pending_ops';

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Open (or create) the offline DB. Resolves to `null` if IDB is unavailable
 * (private browsing in some Safari versions, storage quota exhausted, etc.).
 * Callers must handle the null case — we degrade to a session-only in-memory
 * queue so the user can still finish the over before the data is lost.
 */
export function openOfflineDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_created_at', 'created_at');
        store.createIndex('by_match_id', 'match_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export const PENDING_OPS_STORE = STORE;

/** Run a callback inside a single object-store transaction. */
export async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T | null> {
  const db = await openOfflineDB();
  if (!db) return null;
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = Promise.resolve(fn(store));
    tx.oncomplete = () => result.then(resolve, reject);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** Promise wrapper around `IDBRequest` for ergonomic await usage. */
export function req<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB storage for the working draft and saved question sets.
 * If IndexedDB is unavailable (blocked, private mode), the draft is kept in memory
 * for this page session and putDraft() reports persisted: false so the UI can warn.
 */
const DB_NAME = 'mcqstudio';
const DB_VERSION = 1;
let dbPromise = null;
let memoryDraft = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
        if (!db.objectStoreNames.contains('sets')) db.createObjectStore('sets', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
      req.onblocked = () => reject(new Error('The local database is blocked by another open tab.'));
    });
  }
  return dbPromise;
}

/** Run one request inside a transaction and resolve with its result. */
function run(store, mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || new Error('Database write failed.'));
    tx.onabort = () => reject(tx.error || new Error('Database transaction was aborted.'));
  }));
}

/** Save the working draft. Never rejects; check the returned `persisted` flag. */
export async function putDraft(draft) {
  memoryDraft = draft;
  try {
    await run('drafts', 'readwrite', (s) => s.put(draft, 'current'));
    return { persisted: true };
  } catch (err) {
    console.warn('[MCQ Studio] Draft not saved to IndexedDB.', err);
    return { persisted: false, error: err.message };
  }
}

/** Load the working draft, falling back to the in-memory copy. */
export async function getDraft() {
  try {
    const draft = await run('drafts', 'readonly', (s) => s.get('current'));
    return draft ?? memoryDraft;
  } catch {
    return memoryDraft;
  }
}

/** All saved question sets. Throws if the database is unavailable. */
export async function listSets() {
  return run('sets', 'readonly', (s) => s.getAll());
}

/** Save a named question set. Throws on failure so the UI can report it. */
export async function saveSet(set) {
  await run('sets', 'readwrite', (s) => s.put(set));
}

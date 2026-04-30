// Minimal IndexedDB wrapper for gig notes
const DB_NAME = 'gig-notes-db';
const STORE = 'notes';
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type LocalNoteRecord = {
  id: string; // gigId or songId
  notesJson: string; // serialized notes state
  updatedAt: string; // ISO
  syncedAt?: string | null; // ISO when last synced to server
};

export async function saveLocalNotes(id: string, notesJson: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const now = new Date().toISOString();
    store.put({ id, notesJson, updatedAt: now, syncedAt: null });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalNotes(id: string): Promise<LocalNoteRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPending(): Promise<LocalNoteRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as LocalNoteRecord[];
      const pending = all.filter((r) => !r.syncedAt);
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as LocalNoteRecord | undefined;
      if (!rec) {
        resolve();
        return;
      }
      rec.syncedAt = new Date().toISOString();
      store.put(rec);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

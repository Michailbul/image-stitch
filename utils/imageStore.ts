import { Thread, StoredImage, StitchSettings } from '../types';

const DB_NAME = 'laniameda-stitch';
const DB_VERSION = 1;
const THREADS_STORE = 'threads';
const IMAGES_STORE = 'images';

export const DEFAULT_SETTINGS: StitchSettings = {
  containerWidth: 1200,
  targetRowHeight: 300,
  spacing: 12,
  backgroundColor: '#ffffff',
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(THREADS_STORE)) {
        db.createObjectStore(THREADS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        const store = db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
        store.createIndex('threadId', 'threadId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// --- Threads ---

export async function listThreads(): Promise<Thread[]> {
  const all = await tx<Thread[]>(THREADS_STORE, 'readonly', s => s.getAll() as IDBRequest<Thread[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveThread(thread: Thread): Promise<void> {
  await tx(THREADS_STORE, 'readwrite', s => s.put(thread));
}

export async function deleteThread(id: string): Promise<void> {
  const imgs = await listImagesByThread(id);
  await Promise.all(imgs.map(i => deleteImage(i.id)));
  await tx(THREADS_STORE, 'readwrite', s => s.delete(id));
}

export function createThread(name: string): Thread {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    canvasItems: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// --- Images ---

export async function listImagesByThread(threadId: string): Promise<StoredImage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(IMAGES_STORE, 'readonly');
    const idx = t.objectStore(IMAGES_STORE).index('threadId');
    const req = idx.getAll(threadId);
    req.onsuccess = () => {
      const result = (req.result as StoredImage[]).sort((a, b) => a.createdAt - b.createdAt);
      resolve(result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addImage(image: StoredImage): Promise<void> {
  await tx(IMAGES_STORE, 'readwrite', s => s.put(image));
}

export async function deleteImage(id: string): Promise<void> {
  await tx(IMAGES_STORE, 'readwrite', s => s.delete(id));
}

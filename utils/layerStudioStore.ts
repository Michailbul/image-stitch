// Persistence for Layer Studio. A *project* holds a shared pool of uploaded
// assets (stored once) and multiple *tabs* (documents), each with its own
// layers, masks and artboard. Stored in its own IndexedDB database so it
// survives reloads. Kept separate from the auto-stitch DB.

const DB_NAME = 'laniameda-layerstudio';
const DB_VERSION = 1;
const STORE = 'doc';
const DOC_KEY = 'current';

export interface PersistedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  assetId: string; // references a project asset
}

export interface PersistedAsset {
  name: string;
  w: number;
  h: number;
  dataUrl: string;
}

export interface PersistedTab {
  id: string;
  name: string;
  docW: number;
  docH: number;
  aw: number;
  ah: number;
  bgColor: string | null;
  showBounds: boolean;
  activeId: string | null;
  layers: PersistedLayer[];
  masks: Record<string, string>; // layerId -> mask PNG data URL
}

export interface PersistedProject {
  v: number;
  activeTabId: string | null;
  assets: Record<string, PersistedAsset>; // assetId -> asset (stored once, shared)
  tabs: PersistedTab[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveProject(project: PersistedProject): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(project, DOC_KEY);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** Migrate the old single-document format (v1) into a one-tab project. */
function migrate(raw: any): PersistedProject | null {
  if (!raw) return null;
  if (Array.isArray(raw.tabs)) return raw as PersistedProject; // already a project
  if (!Array.isArray(raw.layers)) return null;
  const assets: Record<string, PersistedAsset> = {};
  const layers: PersistedLayer[] = [];
  for (const l of raw.layers) {
    const assetId = 'A-' + l.id;
    const src = raw.images?.[l.id];
    if (src) assets[assetId] = { name: l.name, w: 0, h: 0, dataUrl: src };
    layers.push({ ...l, assetId });
  }
  const tabId = 'T-' + Date.now().toString(36);
  return {
    v: 2,
    activeTabId: tabId,
    assets,
    tabs: [{
      id: tabId, name: 'Untitled',
      docW: raw.docW, docH: raw.docH, aw: raw.aw, ah: raw.ah,
      bgColor: raw.bgColor, showBounds: raw.showBounds, activeId: raw.activeId,
      layers, masks: raw.masks || {},
    }],
  };
}

export async function loadProject(): Promise<PersistedProject | null> {
  try {
    const db = await openDB();
    const raw = await new Promise<any>((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(DOC_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return migrate(raw);
  } catch {
    return null;
  }
}

export async function clearProject(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(DOC_KEY);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

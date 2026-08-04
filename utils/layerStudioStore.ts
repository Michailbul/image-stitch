// Persistence for Layer Studio.
//
// Hierarchy: a *workspace* holds many named *projects*. A project holds a shared
// pool of uploaded assets (stored once) and multiple named *tabs* (documents),
// each with its own layers, masks and artboard.
//
// Layout in IndexedDB (one object store, discrete keys so saving one project
// never re-serializes the others):
//   'index'      -> WorkspaceIndex  (project list + which one is open)
//   'proj:<id>'  -> PersistedProject
//   'current'    -> legacy single-project record, migrated on first read

const DB_NAME = 'laniameda-layerstudio';
const DB_VERSION = 1;
const STORE = 'doc';
const INDEX_KEY = 'index';
const LEGACY_KEY = 'current';
const projKey = (id: string) => `proj:${id}`;

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
  // 'layer' = masks are stored in each layer's own pixel space (current).
  // Absent = legacy doc-space masks, reprojected onto the layer on load.
  maskSpace?: 'layer';
  /**
   * Extra scale the export needs so every source is rendered at full resolution.
   * Set when an Auto Stitch layout was larger than the artboard pixel budget
   * allowed. Absent or 1 = the artboard already holds full detail.
   */
  nativeScale?: number;
}

export interface PersistedProject {
  v: number;
  id: string;
  name: string;
  activeTabId: string | null;
  assets: Record<string, PersistedAsset>; // assetId -> asset (stored once, shared)
  tabs: PersistedTab[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export interface WorkspaceIndex {
  v: number;
  activeProjectId: string | null;
  projects: ProjectMeta[];
}

const newId = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

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

function get<T>(key: string): Promise<T | null> {
  return openDB().then(db => new Promise<T | null>((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  }));
}

function put(key: string, value: any): Promise<void> {
  return openDB().then(db => new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  }));
}

function del(key: string): Promise<void> {
  return openDB().then(db => new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  }));
}

/**
 * Normalize a legacy record into a project. Handles both the original single
 * document (v1: flat layers + images) and the one-project-many-tabs shape (v2).
 */
function migrateLegacy(raw: any): PersistedProject | null {
  if (!raw) return null;
  const id = newId();
  if (Array.isArray(raw.tabs)) {
    return { v: 3, id, name: raw.name || 'Project 1', activeTabId: raw.activeTabId ?? null, assets: raw.assets || {}, tabs: raw.tabs };
  }
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
    v: 3, id, name: 'Project 1', activeTabId: tabId, assets,
    tabs: [{
      id: tabId, name: 'Untitled',
      docW: raw.docW, docH: raw.docH, aw: raw.aw, ah: raw.ah,
      bgColor: raw.bgColor, showBounds: raw.showBounds, activeId: raw.activeId,
      layers, masks: raw.masks || {},
    }],
  };
}

/**
 * Read the workspace index, migrating any legacy single-project record into a
 * real project on first run. Never throws — a broken DB yields an empty index.
 */
export async function loadWorkspace(): Promise<WorkspaceIndex> {
  const empty: WorkspaceIndex = { v: 3, activeProjectId: null, projects: [] };
  try {
    const idx = await get<WorkspaceIndex>(INDEX_KEY);
    if (idx && Array.isArray(idx.projects)) return idx;
    const legacy = migrateLegacy(await get<any>(LEGACY_KEY));
    if (!legacy) return empty;
    const next: WorkspaceIndex = {
      v: 3,
      activeProjectId: legacy.id,
      projects: [{ id: legacy.id, name: legacy.name, updatedAt: Date.now() }],
    };
    await put(projKey(legacy.id), legacy);
    await put(INDEX_KEY, next);
    await del(LEGACY_KEY);
    return next;
  } catch {
    return empty;
  }
}

export async function saveWorkspace(index: WorkspaceIndex): Promise<void> {
  await put(INDEX_KEY, index);
}

export async function loadProject(id: string): Promise<PersistedProject | null> {
  try {
    return await get<PersistedProject>(projKey(id));
  } catch {
    return null;
  }
}

/** Write a project and refresh its entry (name + timestamp) in the index. */
export async function saveProject(project: PersistedProject): Promise<void> {
  await put(projKey(project.id), project);
  const idx = (await get<WorkspaceIndex>(INDEX_KEY)) || { v: 3, activeProjectId: project.id, projects: [] };
  const i = idx.projects.findIndex(p => p.id === project.id);
  const meta: ProjectMeta = { id: project.id, name: project.name, updatedAt: Date.now() };
  if (i < 0) idx.projects.push(meta); else idx.projects[i] = meta;
  await put(INDEX_KEY, idx);
}

export async function deleteProject(id: string): Promise<void> {
  await del(projKey(id));
  const idx = await get<WorkspaceIndex>(INDEX_KEY);
  if (!idx) return;
  idx.projects = idx.projects.filter(p => p.id !== id);
  if (idx.activeProjectId === id) idx.activeProjectId = idx.projects[0]?.id ?? null;
  await put(INDEX_KEY, idx);
}

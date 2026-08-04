import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sam3Segment, fluxFill, getFalKey, setFalKey, hasFalKey } from '../utils/fal';
import {
  saveProject, loadProject, loadWorkspace, saveWorkspace, deleteProject,
  PersistedProject, PersistedTab, ProjectMeta,
} from '../utils/layerStudioStore';
import {
  chooseStitchRows, exportScaleForDoc, fitStitchInBox, stitchAtNativeResolution,
} from '../utils/stitchLayout';
import { downloadCanvasPng } from '../utils/download';
import {
  Upload,
  Move,
  Brush,
  Hand,
  Eye,
  EyeOff,
  Trash2,
  Download,
  ArrowUp,
  ArrowDown,
  Eraser,
  Paintbrush,
  Maximize,
  RotateCw,
  Layers as LayersIcon,
  Frame,
  Pipette,
  Undo2,
  Redo2,
  Wand2,
  Loader2,
  KeyRound,
  X,
  LayoutGrid,
  Plus,
  ImagePlus,
  Crop,
  Sparkles,
  GripVertical,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Pencil,
  Link,
  Unlink,
  Rows3,
} from 'lucide-react';

// --- Config ---
const DOC_LONG = 2048;         // artboard long-edge working resolution (px)
const EXPORT_LONG_EDGE = 2048; // minimum export long edge (larger docs export at their own resolution)
// 4K is the ceiling for everything Auto Stitch produces — the stitch canvas and
// the export that follows it. Recovering full source resolution for a dense
// stitch would mean 8K+ files; 4K is the deliverable size, so the layout is
// allowed to downscale sources rather than blow past it.
const MAX_LONG_EDGE_4K = 4096;
const EXPORT_MAX_SIDE = MAX_LONG_EDGE_4K;
const EXPORT_MAX_PIXELS = MAX_LONG_EDGE_4K * MAX_LONG_EDGE_4K;
const DEFAULT_BG = '#3a3a3c';  // neutral grey studio backdrop

const ASPECTS: { label: string; w: number; h: number; hint?: string }[] = [
  { label: '21:9', w: 21, h: 9 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '1:1', w: 1, h: 1 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:4', w: 3, h: 4 },
  { label: '4:5', w: 4, h: 5 },
  { label: '3:2', w: 3, h: 2 },
  { label: '2:3', w: 2, h: 3 },
  { label: '2:1', w: 2, h: 1 },
  { label: '1:2', w: 1, h: 2 },
  { label: '7:6', w: 7, h: 6, hint: 'two 21:9 frames stacked' },
  { label: '14:3', w: 14, h: 3, hint: 'two 21:9 frames side by side' },
];

const BG_SWATCHES: { label: string; value: string | null }[] = [
  { label: 'Grey', value: DEFAULT_BG },
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#0a0a0a' },
  { label: 'None', value: null },
];

/** Artboard pixel dims for a given aspect ratio (long edge = DOC_LONG). */
const dimsForAspect = (aw: number, ah: number) =>
  aw >= ah
    ? { w: DOC_LONG, h: Math.round((DOC_LONG * ah) / aw) }
    : { w: Math.round((DOC_LONG * aw) / ah), h: DOC_LONG };

// Custom canvas size limits — the pixel budget matters more than either edge on
// its own.
const MIN_SIDE = 64;
const MAX_SIDE = 8192;
const MAX_PIXELS = 4096 * 4096;

// Layer masks live in the *layer's own* pixel space, not the artboard's, so a
// mask stays glued to its image through moves, scales, rotations and canvas
// resizes. Capped so a 60MP source doesn't allocate a 240MB mask.
const MASK_MAX_SIDE = 4096;
const MASK_MAX_PIXELS = 4096 * 2304;

/** Mask resolution for a source image: its natural size, clamped. */
const maskDims = (iw: number, ih: number) => {
  const w = Math.max(1, Math.round(iw) || 1);
  const h = Math.max(1, Math.round(ih) || 1);
  const k = Math.min(1, MASK_MAX_SIDE / Math.max(w, h), Math.sqrt(MASK_MAX_PIXELS / (w * h)));
  return k < 1 ? { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) } : { w, h };
};

/** Clamp a requested canvas size to the working limits, preserving its ratio. */
const clampDims = (w: number, h: number) => {
  let cw = Math.max(1, Math.round(w) || 1);
  let ch = Math.max(1, Math.round(h) || 1);
  // Shrink both edges by the same factor so an oversized request keeps its shape.
  const k = Math.min(1, MAX_SIDE / Math.max(cw, ch), Math.sqrt(MAX_PIXELS / (cw * ch)));
  if (k < 1) { cw = Math.round(cw * k); ch = Math.round(ch * k); }
  return {
    w: Math.min(MAX_SIDE, Math.max(MIN_SIDE, cw)),
    h: Math.min(MAX_SIDE, Math.max(MIN_SIDE, ch)),
  };
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** Smallest integer ratio for a pixel size — kept on the doc for persistence. */
const reduceRatio = (w: number, h: number) => {
  const g = gcd(w, h) || 1;
  return { w: Math.round(w / g), h: Math.round(h / g) };
};
/** A preset is "current" when the live canvas matches its ratio (rounding aside). */
const RATIO_EPS = 0.004;
const ratioMatches = (w: number, h: number, aw: number, ah: number) =>
  Math.abs(w / h - aw / ah) < RATIO_EPS;

type Tool = 'move' | 'mask' | 'hand' | 'eyedropper' | 'select' | 'crop';
type MaskMode = 'hide' | 'reveal';

const MAX_ZOOM = 16;      // hard upper bound
const MIN_ZOOM_FIT = 0.5; // can't zoom out below this fraction of the fit scale
const PAN_MARGIN = 140;   // px of empty space allowed beyond the artboard edges

// Right-hand layers panel: drag-resizable width, remembered across sessions.
const PANEL_MIN = 240;
const PANEL_MAX = 620;
const PANEL_DEFAULT = 288;
const PANEL_W_KEY = 'ls-panel-w';
const readPanelW = () => {
  const n = Number(localStorage.getItem(PANEL_W_KEY));
  return Number.isFinite(n) && n >= PANEL_MIN && n <= PANEL_MAX ? n : PANEL_DEFAULT;
};

// Which panel sections are open — remembered so the list keeps the height the
// user gave it across reloads.
const readOpen = (key: string) => localStorage.getItem(`ls-open-${key}`) !== '0';
const writeOpen = (key: string, open: boolean) => localStorage.setItem(`ls-open-${key}`, open ? '1' : '0');

// --- Auto Stitch preferences (remembered across sessions) ---
const STITCH_GAP_KEY = 'ls-stitch-gap';     // gap as % of the block width
const STITCH_FIT_KEY = 'ls-stitch-fit';     // size the canvas to the stitch
const STITCH_AUTO_KEY = 'ls-stitch-auto';   // stitch automatically on import
const STITCH_GAP_DEFAULT = 1.5;
const STITCH_GAP_MAX = 8;
const readStitchGap = () => {
  const raw = localStorage.getItem(STITCH_GAP_KEY);
  if (raw === null) return STITCH_GAP_DEFAULT; // Number(null) is 0 — check the string
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= STITCH_GAP_MAX ? n : STITCH_GAP_DEFAULT;
};
const readFlag = (key: string, dflt: boolean) => {
  const v = localStorage.getItem(key);
  return v === null ? dflt : v === '1';
};

/** Undo/redo snapshot of the whole editable state. Masks are stored as data URLs. */
interface Snapshot {
  layers: CompLayer[];
  masks: Record<string, string>;
  bgColor: string | null;
  aw: number; ah: number;
  docW: number; docH: number;
  activeId: string | null;
  /** Layers whose mask is a Fill-layout crop rect (safe for Auto Stitch to drop). */
  cropped: string[];
  /** Export scale needed for full source resolution (see nativeScale). */
  nativeScale: number;
}

interface CompLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;   // 0..1
  x: number;         // top-left in doc space
  y: number;
  scale: number;     // multiplier on the source image's natural size
  rotation: number;  // degrees
  assetId: string;   // references a shared project asset
}

interface ProjectAsset { id: string; name: string; w: number; h: number; }

let uid = 0;
const nextId = () => `L${Date.now().toString(36)}-${uid++}`;
const newUUID = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${uid++}`);

const LayerStudioView: React.FC = () => {
  // --- Document / artboard ---
  const initial = dimsForAspect(16, 9);
  const [docW, setDocW] = useState(initial.w);
  const [docH, setDocH] = useState(initial.h);
  const [aspect, setAspect] = useState<{ w: number; h: number }>({ w: 16, h: 9 });
  const [bgColor, setBgColor] = useState<string | null>(DEFAULT_BG);
  const [showBounds, setShowBounds] = useState(true);
  // Custom canvas size: draft strings so the fields stay editable while typing.
  const [sizeDraft, setSizeDraft] = useState({ w: String(initial.w), h: String(initial.h) });
  const [lockRatio, setLockRatio] = useState(false);
  const [scaleWithCanvas, setScaleWithCanvas] = useState(true);
  const bgColorRef = useRef<string | null>(DEFAULT_BG);
  bgColorRef.current = bgColor;
  const showBoundsRef = useRef(true);
  showBoundsRef.current = showBounds;

  // --- Layers (metadata only; pixels live in refs) ---
  const [layers, setLayers] = useState<CompLayer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Box selection: drag on empty artboard with the move tool. Auto Stitch acts on
  // the selection when there is one, so a subset can be stitched on its own.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  selectedIdsRef.current = selectedIds;
  // Marquee rect in doc space while dragging, plus the selection it started from
  // (shift-drag adds) and the per-layer origins of a multi-layer move.
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const moveOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Non-reactive pixel stores for the ACTIVE tab (keyed by layer id).
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const masksRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  // Layers whose current mask is nothing but a Fill-layout crop rect. Auto Stitch
  // clears these (it shows whole frames) but never touches hand-painted or AI masks.
  const croppedRef = useRef<Set<string>>(new Set());

  // --- Auto Stitch settings ---
  const [stitchGap, setStitchGap] = useState(readStitchGap);
  const [stitchFitCanvas, setStitchFitCanvas] = useState(() => readFlag(STITCH_FIT_KEY, true));
  const [stitchOnImport, setStitchOnImport] = useState(() => readFlag(STITCH_AUTO_KEY, true));
  const stitchGapRef = useRef(stitchGap);
  stitchGapRef.current = stitchGap;
  const stitchFitCanvasRef = useRef(stitchFitCanvas);
  stitchFitCanvasRef.current = stitchFitCanvas;
  const stitchOnImportRef = useRef(stitchOnImport);
  stitchOnImportRef.current = stitchOnImport;
  // How much bigger than the artboard the composition would have to be for every
  // source to sit at full resolution. >1 after a stitch the pixel budget clamped;
  // the export renders at this scale so none of that detail is lost.
  const [nativeScale, setNativeScale] = useState(1);
  const nativeScaleRef = useRef(1);
  nativeScaleRef.current = nativeScale;

  // --- Project: shared assets + tabs ---
  // Assets are uploaded once and shared across every tab in the project.
  const assetsRef = useRef<Map<string, { name: string; w: number; h: number; img: HTMLImageElement; dataUrl: string }>>(new Map());
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [tabsMeta, setTabsMeta] = useState<{ id: string; name: string }[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const tabsMetaRef = useRef(tabsMeta);
  tabsMetaRef.current = tabsMeta;
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTabId;
  // Serialized docs for tabs (inactive tabs live here; the active tab's live
  // state is authoritative and flushed here on save/switch).
  const tabDocsRef = useRef<Map<string, PersistedTab>>(new Map());
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  // --- Workspace: many named projects, each with its own tabs + assets ---
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Project 1');
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false);

  // --- Layers panel chrome: resizable width + collapsible sections ---
  const [panelW, setPanelW] = useState(readPanelW);
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;
  const panelResizeRef = useRef<{ x: number; w: number } | null>(null);
  const [showArtboard, setShowArtboard] = useState(() => readOpen('artboard'));
  const [showProps, setShowProps] = useState(() => readOpen('props'));
  const [showAssets, setShowAssets] = useState(() => readOpen('assets'));
  const [showStitch, setShowStitch] = useState(() => readOpen('stitch'));
  const toggleSection = (key: string, set: React.Dispatch<React.SetStateAction<boolean>>) =>
    set(v => { writeOpen(key, !v); return !v; });

  // --- Layer list interaction: rename + drag-to-reorder ---
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; before: boolean } | null>(null);

  // --- Tools ---
  const [tool, setTool] = useState<Tool>('move');
  const [maskMode, setMaskMode] = useState<MaskMode>('hide');
  const [brushSize, setBrushSize] = useState(120);
  const [brushHardness, setBrushHardness] = useState(0.5); // 0 soft .. 1 hard
  const [brushFlow, setBrushFlow] = useState(0.85);
  const [brushFeather, setBrushFeather] = useState(0);     // px, edge blur baked per-stroke
  const brushFeatherRef = useRef(0);
  brushFeatherRef.current = brushFeather;

  // --- Smart Select (SAM 3 via fal) ---
  const [selectPrompt, setSelectPrompt] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectMsg, setSelectMsg] = useState<string | null>(null);
  const [busyMsg, setBusyMsg] = useState<string | null>(null); // multi-step AI preset overlay
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // --- View transform ---
  const viewScaleRef = useRef(1);
  const viewOffRef = useRef({ x: 0, y: 0 }); // screen px offset of doc origin

  // --- Canvas refs ---
  const viewCanvasRef = useRef<HTMLCanvasElement>(null);
  const docCanvasRef = useRef<HTMLCanvasElement>(null); // offscreen composite @ doc res
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Interaction state
  const dragRef = useRef<{ mode: 'none' | 'move' | 'pan' | 'paint' | 'crop' | 'marquee'; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  // Crop marquee (doc-space rect) while dragging with the crop tool.
  const cropRectRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // In-progress mask stroke: accumulated on its own buffer so its feather is
  // baked only into this stroke, never re-blurring previously painted areas.
  const strokeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // `feather` is in mask px and `frame` is the layer geometry the stroke started
  // on, so the whole stroke stays consistent even mid-drag.
  const strokeInfoRef = useRef<{ layerId: string; mode: MaskMode; feather: number; frame: LayerFrame } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [, force] = useState(0);
  const rerender = () => force(n => n + 1);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  // Space-to-pan (temporary hand from any tool) + undo/redo history.
  const spaceRef = useRef(false);
  const movePushedRef = useRef(false);
  const histRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const [, setHistVer] = useState(0);
  const bumpHist = () => setHistVer(v => v + 1);
  const [zoomPct, setZoomPct] = useState(100);
  const syncZoom = () => setZoomPct(prev => {
    const p = Math.round(viewScaleRef.current * 100);
    return prev === p ? prev : p;
  });

  // Persistence: hydrating guard (don't autosave over saved data during load)
  // and a debounced save timer.
  const hydratingRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------
  const loadImage = (file: File): Promise<HTMLImageElement | null> =>
    new Promise(resolve => {
      if (!file.type.startsWith('image/')) return resolve(null);
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  // Build a fresh, fully-opaque (visible) mask in the layer's own pixel space.
  const blankMask = (iw: number, ih: number) => {
    const { w, h } = maskDims(iw, ih);
    const mask = document.createElement('canvas');
    mask.width = w; mask.height = h;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, w, h);
    return mask;
  };

  /** Place an existing project asset as a new layer on the active tab. */
  const addLayerFromAsset = (assetId: string, activate = true) => {
    const asset = assetsRef.current.get(assetId);
    if (!asset) return null;
    const dw = docWRef.current, dh = docHRef.current;
    const id = nextId();
    imagesRef.current.set(id, asset.img);
    masksRef.current.set(id, blankMask(asset.w, asset.h));
    const fit = Math.min(dw / asset.w, dh / asset.h);
    const w = asset.w * fit, h = asset.h * fit;
    const layer: CompLayer = {
      id, name: asset.name, visible: true, opacity: 1,
      x: (dw - w) / 2, y: (dh - h) / 2, scale: fit, rotation: 0, assetId,
    };
    setLayers(prev => [...prev, layer]);
    if (activate) setActiveId(id);
    return layer;
  };

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const loaded = await Promise.all(list.map(async f => ({ file: f, img: await loadImage(f) })));
    const valid = loaded.filter(l => l.img) as { file: File; img: HTMLImageElement }[];
    if (!valid.length) return;
    const dw = docWRef.current, dh = docHRef.current;
    pushHistory();

    const newAssets: ProjectAsset[] = [];
    const newLayers: CompLayer[] = [];
    let lastId: string | null = null;
    for (const { file, img } of valid) {
      // Register a shared project asset (stored once, reusable in any tab).
      const assetId = newUUID();
      const name = (file.name.replace(/\.[^.]+$/, '') || 'Image').slice(0, 28);
      assetsRef.current.set(assetId, { name, w: img.naturalWidth, h: img.naturalHeight, img, dataUrl: img.src });
      newAssets.push({ id: assetId, name, w: img.naturalWidth, h: img.naturalHeight });

      const id = nextId();
      imagesRef.current.set(id, img);
      masksRef.current.set(id, blankMask(img.naturalWidth, img.naturalHeight));
      const fit = Math.min(dw / img.naturalWidth, dh / img.naturalHeight);
      const w = img.naturalWidth * fit, h = img.naturalHeight * fit;
      newLayers.push({
        id, name, visible: true, opacity: 1,
        x: (dw - w) / 2, y: (dh - h) / 2, scale: fit, rotation: 0, assetId,
      });
      lastId = id;
    }
    setAssets(prev => [...prev, ...newAssets]);
    setLayers(prev => [...prev, ...newLayers]);
    setSelectedIds(new Set()); // a stale selection must not narrow the stitch
    selectedIdsRef.current = new Set();
    if (lastId) setActiveId(lastId);

    // Two or more frames on the artboard would otherwise land as a centered
    // pile. Stitch them into justified rows instead (history was pushed above).
    const all = [...layersRef.current, ...newLayers];
    const stitch = stitchOnImportRef.current && all.length > 1;
    setTimeout(() => {
      if (stitch) stitchLayers({ history: false, layers: all });
      else { fitView(dw, dh); redrawAll(); }
    }, 0);
  }, []);

  const docWRef = useRef(initial.w);
  const docHRef = useRef(initial.h);
  useEffect(() => { docWRef.current = docW; }, [docW]);
  useEffect(() => { docHRef.current = docH; }, [docH]);
  // Keep the size fields in step with the doc (presets, undo, tab/project switch).
  useEffect(() => { setSizeDraft({ w: String(docW), h: String(docH) }); }, [docW, docH]);

  // Fit the artboard into view on mount, and re-fit until the container has a
  // real size (flex layout may not be settled when the effect first runs).
  const didFitRef = useRef(false);
  useEffect(() => {
    const tryFit = () => {
      const cont = containerRef.current;
      if (!cont || cont.clientWidth < 2) return false;
      fitView(); redrawAll();
      didFitRef.current = true;
      return true;
    };
    if (!tryFit()) requestAnimationFrame(tryFit);
    const ro = new ResizeObserver(() => {
      if (!didFitRef.current) tryFit();
      else drawView();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
    /* eslint-disable-next-line */
  }, []);

  // ---------------------------------------------------------------------------
  // Artboard resolution / aspect
  // ---------------------------------------------------------------------------
  /**
   * Resize the artboard to an exact pixel size.
   *
   * Two behaviors, picked by the "Scale layers" switch:
   *  - on  → layers are rescaled with the frame (nothing jumps off canvas; the
   *          composition is preserved, just at a new shape).
   *  - off → Photoshop "Canvas Size": pixels keep their size and the frame grows
   *          or crops around them, anchored at the center.
   *
   * Masks are untouched either way — they live in layer space and ride along.
   *
   * `ratio` lets a preset keep its clean integer ratio (16:9 rather than the
   * reduced form of 2048×1152).
   */
  const resizeDoc = (nw: number, nh: number, ratio?: { w: number; h: number }) => {
    const { w: cw, h: ch } = clampDims(nw, nh);
    const ow = docWRef.current, oh = docHRef.current;
    const ar = ratio ?? reduceRatio(cw, ch);
    if (cw === ow && ch === oh) { setAspect(ar); return; }
    pushHistory();
    const scaleContent = scaleWithCanvas;
    const dx = Math.round((cw - ow) / 2), dy = Math.round((ch - oh) / 2);
    if (scaleContent) {
      // Re-scale layer positions proportionally so nothing jumps off-canvas.
      const rx = cw / ow, ry = ch / oh;
      setLayers(prev => prev.map(l => {
        const img = imagesRef.current.get(l.id);
        if (!img) return l;
        const w = img.naturalWidth * l.scale, h = img.naturalHeight * l.scale;
        const cx = (l.x + w / 2) * rx, cy = (l.y + h / 2) * ry;
        const ns = l.scale * Math.min(rx, ry);
        const nwd = img.naturalWidth * ns, nhd = img.naturalHeight * ns;
        return { ...l, scale: ns, x: cx - nwd / 2, y: cy - nhd / 2 };
      }));
      // Layers shrank with the frame, so the export has that much more to make up.
      const next = Math.max(1, nativeScaleRef.current * (ow / cw));
      nativeScaleRef.current = next;
      setNativeScale(next);
    } else {
      setLayers(prev => prev.map(l => ({ ...l, x: l.x + dx, y: l.y + dy })));
      // Pixels kept their size — what the export needs is unchanged.
    }
    docWRef.current = cw; docHRef.current = ch;
    setDocW(cw); setDocH(ch);
    setAspect(ar);
    setTimeout(() => { fitView(cw, ch); redrawAll(); }, 0);
  };

  const applyAspect = (aw: number, ah: number) => {
    const { w, h } = dimsForAspect(aw, ah);
    resizeDoc(w, h, { w: aw, h: ah });
  };

  /** Type into a size field; with the ratio locked the other edge follows. */
  const editSize = (edge: 'w' | 'h', raw: string) => {
    const v = raw.replace(/[^\d]/g, '').slice(0, 5);
    setSizeDraft(prev => {
      const next = { ...prev, [edge]: v };
      const n = Number(v);
      if (lockRatio && n > 0 && docW > 0 && docH > 0) {
        next[edge === 'w' ? 'h' : 'w'] = String(
          Math.max(1, Math.round(edge === 'w' ? (n * docH) / docW : (n * docW) / docH)),
        );
      }
      return next;
    });
  };

  const draftDims = clampDims(Number(sizeDraft.w), Number(sizeDraft.h));
  const sizeDirty =
    Number(sizeDraft.w) > 0 && Number(sizeDraft.h) > 0 &&
    (draftDims.w !== docW || draftDims.h !== docH);

  const revertSize = () => setSizeDraft({ w: String(docW), h: String(docH) });

  const commitSize = () => {
    if (!sizeDirty) { revertSize(); return; }
    resizeDoc(draftDims.w, draftDims.h);
  };

  // ---------------------------------------------------------------------------
  // View math
  // ---------------------------------------------------------------------------
  /**
   * Scale at which the artboard fits the viewport with padding. Guards against a
   * container that has not been laid out yet — subtracting the padding from a
   * zero-height box would otherwise yield a negative scale and flip the view.
   */
  const fitScaleValue = (dw = docWRef.current, dh = docHRef.current) => {
    const cont = containerRef.current;
    if (!cont || !dw || !dh) return 1;
    const W = cont.clientWidth, H = cont.clientHeight;
    if (W < 2 || H < 2) return viewScaleRef.current || 1;
    const pad = 64;
    return Math.max(0.01, Math.min((W - pad) / dw, (H - pad) / dh, 1.5));
  };

  const fitView = (dw = docWRef.current, dh = docHRef.current) => {
    const cont = containerRef.current;
    if (!cont || !dw || !dh) return;
    if (cont.clientWidth < 2 || cont.clientHeight < 2) return; // laid out yet?
    const scale = fitScaleValue(dw, dh);
    viewScaleRef.current = scale;
    viewOffRef.current = {
      x: (cont.clientWidth - dw * scale) / 2,
      y: (cont.clientHeight - dh * scale) / 2,
    };
    syncZoom();
  };

  /**
   * Keep the camera bounded: clamp zoom to [fit*MIN_ZOOM_FIT, MAX_ZOOM] and keep
   * the artboard from being panned entirely out of view (a fixed margin of empty
   * space is allowed on each side). This is the "locked canvas" behavior.
   */
  const clampView = () => {
    const cont = containerRef.current;
    if (!cont) return;
    const W = cont.clientWidth, H = cont.clientHeight;
    const dw = docWRef.current, dh = docHRef.current;
    if (!dw || !dh) return;
    const minZoom = Math.min(fitScaleValue(dw, dh) * MIN_ZOOM_FIT, MAX_ZOOM);
    const s = Math.max(minZoom, Math.min(MAX_ZOOM, viewScaleRef.current));
    viewScaleRef.current = s;
    const bw = dw * s, bh = dh * s;
    const axis = (off: number, box: number, ext: number) => {
      if (box + 2 * PAN_MARGIN <= ext) return (ext - box) / 2; // fits → center
      return Math.max(ext - box - PAN_MARGIN, Math.min(PAN_MARGIN, off)); // clamp to edges
    };
    viewOffRef.current = {
      x: axis(viewOffRef.current.x, bw, W),
      y: axis(viewOffRef.current.y, bh, H),
    };
    syncZoom();
  };

  const screenToDoc = (clientX: number, clientY: number) => {
    const cv = viewCanvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const s = viewScaleRef.current;
    const off = viewOffRef.current;
    return { x: (sx - off.x) / s, y: (sy - off.y) / s };
  };

  // ---------------------------------------------------------------------------
  // Layer space
  //
  // A mask belongs to its layer, not to the artboard: it is stored at the source
  // image's resolution and always drawn across the layer's rect. Everything the
  // user paints therefore travels with the image when it is moved, scaled or
  // rotated — and survives a canvas resize untouched. Doc-space input (brush
  // points, crop marquees, SAM masks) is converted on the way in.
  // ---------------------------------------------------------------------------
  interface LayerFrame {
    w: number; h: number;    // layer size in doc px
    cx: number; cy: number;  // layer center in doc px
    rad: number;             // rotation in radians
    mw: number; mh: number;  // mask size in mask px
    m: number;               // doc px → mask px
  }

  const frameFor = (
    iw: number, ih: number,
    geom: { x: number; y: number; scale: number; rotation: number },
    mw: number, mh: number,
  ): LayerFrame => {
    const w = (iw * geom.scale) || 1, h = (ih * geom.scale) || 1;
    return {
      w, h,
      cx: geom.x + w / 2,
      cy: geom.y + h / 2,
      rad: (geom.rotation * Math.PI) / 180,
      mw, mh,
      m: mw / w,
    };
  };

  /** Frame for a live layer — null until its pixels and mask are loaded. */
  const layerFrame = (layer: CompLayer): LayerFrame | null => {
    const img = imagesRef.current.get(layer.id);
    const mask = masksRef.current.get(layer.id);
    if (!img || !mask) return null;
    return frameFor(img.naturalWidth, img.naturalHeight, layer, mask.width, mask.height);
  };

  /** Doc-space point → mask pixel. */
  const docToMask = (f: LayerFrame, x: number, y: number) => {
    const dx = x - f.cx, dy = y - f.cy;
    const c = Math.cos(-f.rad), s = Math.sin(-f.rad);
    return {
      x: (dx * c - dy * s) * f.m + f.mw / 2,
      y: (dx * s + dy * c) * f.m + f.mh / 2,
    };
  };

  /** Set a context up so doc-space drawing lands in mask space. */
  const useDocToMask = (ctx: CanvasRenderingContext2D, f: LayerFrame) => {
    ctx.translate(f.mw / 2, f.mh / 2);
    ctx.scale(f.m, f.m);
    ctx.rotate(-f.rad);
    ctx.translate(-f.cx, -f.cy);
  };

  /** Rasterize a doc-space stamp into a fresh mask-space canvas. */
  const docStampToMask = (f: LayerFrame, src: CanvasImageSource, sw: number, sh: number) => {
    const out = document.createElement('canvas');
    out.width = f.mw; out.height = f.mh;
    const octx = out.getContext('2d')!;
    octx.save();
    useDocToMask(octx, f);
    octx.drawImage(src, 0, 0, sw, sh);
    octx.restore();
    return out;
  };

  // ---------------------------------------------------------------------------
  // Compositing
  // ---------------------------------------------------------------------------
  /**
   * The mask actually used to render a layer. Feather is already baked into the
   * stored mask per-stroke, so no global blur here. If a stroke is mid-flight on
   * this layer, merge its (feathered) preview so the canvas updates live.
   */
  const effectiveMaskFor = (layer: CompLayer): HTMLCanvasElement | undefined => {
    const base = masksRef.current.get(layer.id);
    if (!base) return undefined;
    const stroke = strokeCanvasRef.current;
    const info = strokeInfoRef.current;
    if (!stroke || !info || info.layerId !== layer.id) return base;
    const m = document.createElement('canvas');
    m.width = base.width; m.height = base.height;
    const mc = m.getContext('2d')!;
    mc.drawImage(base, 0, 0);
    mc.globalCompositeOperation = info.mode === 'hide' ? 'destination-out' : 'source-over';
    if (info.feather > 0) mc.filter = `blur(${info.feather}px)`;
    mc.drawImage(stroke, 0, 0);
    return m;
  };

  /** Draw the full document composite into ctx at pixel scale k (1 = doc res). */
  const compositeInto = (ctx: CanvasRenderingContext2D, k: number) => {
    const dw = docWRef.current, dh = docHRef.current;
    const ls = layersRef.current;
    ctx.clearRect(0, 0, dw * k, dh * k);
    // Background fill (neutral grey by default; null = transparent).
    const bg = bgColorRef.current;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dw * k, dh * k);
    }
    for (const layer of ls) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const img = imagesRef.current.get(layer.id);
      const mask = effectiveMaskFor(layer);
      if (!img || !mask) continue;

      const lc = document.createElement('canvas');
      lc.width = Math.max(1, Math.round(dw * k));
      lc.height = Math.max(1, Math.round(dh * k));
      const lctx = lc.getContext('2d')!;

      const w = img.naturalWidth * layer.scale;
      const h = img.naturalHeight * layer.scale;
      const cx = (layer.x + w / 2) * k;
      const cy = (layer.y + h / 2) * k;
      lctx.save();
      lctx.translate(cx, cy);
      lctx.rotate((layer.rotation * Math.PI) / 180);
      lctx.imageSmoothingQuality = 'high';
      lctx.drawImage(img, (-w / 2) * k, (-h / 2) * k, w * k, h * k);
      // The mask rides with the layer: same rect, same rotation. Feather is
      // already baked into it per-stroke, so no global blur here.
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(mask, (-w / 2) * k, (-h / 2) * k, w * k, h * k);
      lctx.restore();

      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(lc, 0, 0);
      ctx.globalAlpha = 1;
    }
  };

  const redrawDoc = () => {
    const dw = docWRef.current, dh = docHRef.current;
    if (!dw || !dh) return;
    let dc = docCanvasRef.current;
    if (!dc) { dc = document.createElement('canvas'); docCanvasRef.current = dc; }
    if (dc.width !== dw || dc.height !== dh) { dc.width = dw; dc.height = dh; }
    const ctx = dc.getContext('2d')!;
    compositeInto(ctx, 1);
  };

  const drawView = () => {
    const cv = viewCanvasRef.current;
    const cont = containerRef.current;
    if (!cv || !cont) return;
    const W = cont.clientWidth, H = cont.clientHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const dw = docWRef.current, dh = docHRef.current;
    if (!dw || !dh) return;
    const s = viewScaleRef.current;
    const off = viewOffRef.current;

    const bw = dw * s, bh = dh * s;

    // Drop shadow so the artboard reads as a physical surface over the stage.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#000';
    ctx.fillRect(off.x, off.y, bw, bh);
    ctx.restore();

    // Checkerboard (only visible where the artboard is transparent).
    ctx.save();
    ctx.beginPath();
    ctx.rect(off.x, off.y, bw, bh);
    ctx.clip();
    const cell = 12;
    for (let y = 0; y < bh; y += cell) {
      for (let x = 0; x < bw; x += cell) {
        const dark = ((x / cell) + (y / cell)) % 2 < 1;
        ctx.fillStyle = dark ? 'rgba(140,140,150,0.28)' : 'rgba(90,90,100,0.16)';
        ctx.fillRect(off.x + x, off.y + y, cell, cell);
      }
    }
    ctx.restore();

    // Composite.
    const dc = docCanvasRef.current;
    if (dc) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(dc, off.x, off.y, bw, bh);
    }

    // Artboard border — clearly visible when enabled.
    if (showBounds) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(off.x - 0.5, off.y - 0.5, bw + 1, bh + 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeRect(off.x - 1.5, off.y - 1.5, bw + 3, bh + 3);
    }

    // Box selection: outline every selected layer, plus the live marquee.
    if (tool === 'move') {
      const sel = selectedIdsRef.current;
      if (sel.size > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,85,46,0.75)';
        ctx.lineWidth = 1;
        for (const l of layersRef.current) {
          if (!sel.has(l.id)) continue;
          const img = imagesRef.current.get(l.id);
          if (!img) continue;
          const w = img.naturalWidth * l.scale, h = img.naturalHeight * l.scale;
          ctx.strokeRect(off.x + l.x * s, off.y + l.y * s, w * s, h * s);
        }
        ctx.restore();
      }
      const mq = marqueeRef.current;
      if (mq) {
        const rx = off.x + Math.min(mq.x0, mq.x1) * s;
        const ry = off.y + Math.min(mq.y0, mq.y1) * s;
        const rw = Math.abs(mq.x1 - mq.x0) * s;
        const rh = Math.abs(mq.y1 - mq.y0) * s;
        ctx.save();
        ctx.fillStyle = 'rgba(255,85,46,0.10)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = '#FF552E';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }
    }

    // Active layer bounds.
    const active = layersRef.current.find(l => l.id === activeIdRef.current);
    if (active && tool === 'move') {
      const img = imagesRef.current.get(active.id);
      if (img) {
        const w = img.naturalWidth * active.scale;
        const h = img.naturalHeight * active.scale;
        const cx = off.x + (active.x + w / 2) * s;
        const cy = off.y + (active.y + h / 2) * s;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((active.rotation * Math.PI) / 180);
        ctx.strokeStyle = '#FF552E';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect((-w / 2) * s, (-h / 2) * s, w * s, h * s);
        ctx.restore();
      }
    }

    // Crop marquee (while dragging with the crop tool): dim outside, dashed box.
    const cr = cropRectRef.current;
    if (tool === 'crop' && cr) {
      const rx = off.x + Math.min(cr.x0, cr.x1) * s;
      const ry = off.y + Math.min(cr.y0, cr.y1) * s;
      const rw = Math.abs(cr.x1 - cr.x0) * s;
      const rh = Math.abs(cr.y1 - cr.y0) * s;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.rect(off.x, off.y, bw, bh);
      ctx.rect(rx, ry, rw, rh);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#FF552E';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }
  };

  const redrawAll = () => { redrawDoc(); drawView(); };
  const scheduleRedraw = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redrawAll();
    });
  };

  // Redraw when layer metadata or artboard settings change.
  useEffect(() => { redrawAll(); }, [layers, tool, showBounds, bgColor, docW, docH]);

  // Resize handling.
  useEffect(() => {
    const onResize = () => { drawView(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------
  const stampBrush = (mctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    // Inner (full-alpha) radius. Clamp below r: identical inner/outer radii make
    // createRadialGradient paint nothing, which would break a fully-hard brush.
    const inner = r * Math.min(brushHardness, 0.98);
    const grad = mctx.createRadialGradient(x, y, inner, x, y, r);
    const a = brushFlow;
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    mctx.fillStyle = grad;
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fill();
  };

  const paintAt = (docX: number, docY: number) => {
    // Stamps accumulate on the stroke buffer (solid white); feather is applied
    // once when the stroke is committed, so the interior stays solid and only
    // this stroke's edge is softened — earlier strokes are untouched.
    const stroke = strokeCanvasRef.current;
    const info = strokeInfoRef.current;
    if (!stroke || !info) return;
    const sctx = stroke.getContext('2d')!;

    // Paint where the cursor is *on the image*, not on the artboard. The brush
    // size stays a doc-space measure, so the on-screen circle matches the mark
    // whatever scale the layer is at.
    const f = info.frame;
    const p = docToMask(f, docX, docY);
    const r = Math.max(0.5, (brushSize / 2) * f.m);

    const last = lastPaintRef.current;
    if (last) {
      const dx = p.x - last.x, dy = p.y - last.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(1, r * 0.3);
      const n = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= n; i++) {
        stampBrush(sctx, last.x + (dx * i) / n, last.y + (dy * i) / n, r);
      }
    } else {
      stampBrush(sctx, p.x, p.y, r);
    }
    lastPaintRef.current = { x: p.x, y: p.y };
    scheduleRedraw();
  };

  /** Merge the finished stroke into the layer mask, baking its feather. */
  const commitStroke = () => {
    const info = strokeInfoRef.current;
    const stroke = strokeCanvasRef.current;
    strokeInfoRef.current = null;
    strokeCanvasRef.current = null;
    if (!info || !stroke) return;
    const mask = masksRef.current.get(info.layerId);
    if (mask) {
      const mctx = mask.getContext('2d')!;
      mctx.save();
      mctx.globalCompositeOperation = info.mode === 'hide' ? 'destination-out' : 'source-over';
      if (info.feather > 0) mctx.filter = `blur(${info.feather}px)`;
      mctx.drawImage(stroke, 0, 0);
      mctx.restore();
    }
    redrawAll();
    markDirty();
  };

  // ---------------------------------------------------------------------------
  // Eyedropper — sample a color from the composited canvas onto the background
  // ---------------------------------------------------------------------------
  const sampleColorAt = (docX: number, docY: number) => {
    const dc = docCanvasRef.current;
    if (!dc) return;
    const x = Math.max(0, Math.min(dc.width - 1, Math.round(docX)));
    const y = Math.max(0, Math.min(dc.height - 1, Math.round(docY)));
    const [r, g, b, a] = dc.getContext('2d')!.getImageData(x, y, 1, 1).data;
    if (a === 0) return; // transparent spot — nothing to pick
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    commitBgColor(hex);
  };

  // ---------------------------------------------------------------------------
  // Smart Select — SAM 3 (fal) generates a mask from a click or a text concept,
  // then bakes it into the active layer's mask like an auto-shaped brush stroke.
  // ---------------------------------------------------------------------------
  const docToBlob = (): Promise<Blob | null> => new Promise(resolve => {
    redrawDoc();
    const dc = docCanvasRef.current;
    if (!dc) return resolve(null);
    dc.toBlob(b => resolve(b), 'image/png');
  });

  const loadImageEl = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  /** Bake a SAM mask (data URI) into the active layer mask as hide/reveal + feather. */
  const applySelectionMask = async (maskUrl: string, layerId: string) => {
    const img = await loadImageEl(maskUrl);
    const dw = docWRef.current, dh = docHRef.current;
    // Convert the SAM mask (white object) into an alpha stamp.
    const sel = document.createElement('canvas');
    sel.width = dw; sel.height = dh;
    const sctx = sel.getContext('2d')!;
    sctx.drawImage(img, 0, 0, dw, dh);
    const idata = sctx.getImageData(0, 0, dw, dh);
    const d = idata.data;
    for (let i = 0; i < d.length; i += 4) {
      // Works whether the mask is white-on-black (opaque) or object-on-transparent.
      const alpha = ((d[i] + d[i + 1] + d[i + 2]) / 3) * (d[i + 3] / 255);
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = alpha;
    }
    sctx.putImageData(idata, 0, 0);

    const mask = masksRef.current.get(layerId);
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!mask || !layer) return;
    const f = layerFrame(layer);
    if (!f) return;
    // SAM works on the composited artboard, so its mask is doc-space: reproject
    // it onto the layer before baking, then blur in mask px.
    const stamp = docStampToMask(f, sel, dw, dh);
    pushHistory();
    const mctx = mask.getContext('2d')!;
    mctx.save();
    mctx.globalCompositeOperation = maskMode === 'hide' ? 'destination-out' : 'source-over';
    if (brushFeatherRef.current > 0) mctx.filter = `blur(${brushFeatherRef.current * f.m}px)`;
    mctx.drawImage(stamp, 0, 0);
    mctx.restore();
    redrawAll();
    markDirty();
  };

  const runSmartSelect = async (opts: { prompt?: string; point?: { x: number; y: number } }) => {
    const id = activeIdRef.current;
    if (!id) { setSelectMsg('Pick a layer first'); return; }
    if (!hasFalKey()) { setKeyModalOpen(true); return; }
    setSelecting(true); setSelectMsg(null);
    try {
      const blob = await docToBlob();
      if (!blob) throw new Error('Nothing to segment');
      const { maskUrl, count } = await sam3Segment({ imageBlob: blob, prompt: opts.prompt, point: opts.point });
      if (!maskUrl) { setSelectMsg(opts.prompt ? `No "${opts.prompt}" found` : 'Nothing found there'); return; }
      await applySelectionMask(maskUrl, id);
      setSelectMsg(count > 1 ? `Selected ${count} regions` : null);
    } catch (e: any) {
      const m = String(e?.message || e);
      if (/api key|credentials|unauthor|403|401/i.test(m)) { setSelectMsg('Invalid or missing fal key'); setKeyModalOpen(true); }
      else setSelectMsg(m.slice(0, 120));
    } finally {
      setSelecting(false);
    }
  };

  const imgToBlob = (img: HTMLImageElement): Promise<Blob | null> => new Promise(resolve => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    c.toBlob(b => resolve(b), 'image/png');
  });

  const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'));

  /**
   * PRESET: isolate the subject and replace the background with a clean neutral
   * grey studio backdrop. SAM 3 segments the subject → the inverse becomes the
   * fill mask → FLUX Fill regenerates the background as #3a3a3c. Replaces the
   * active layer's image with the result (undoable).
   */
  const isolateOnGreyPreset = async () => {
    const id = activeIdRef.current;
    const layer = layersRef.current.find(l => l.id === id);
    if (!id || !layer) { setSelectMsg('Pick a layer first'); return; }
    if (!hasFalKey()) { setKeyModalOpen(true); return; }
    const asset = assetsRef.current.get(layer.assetId);
    if (!asset) return;
    const subject = selectPrompt.trim() || 'person, character';
    setBusyMsg('Isolating subject with SAM 3…'); setSelectMsg(null);
    try {
      const srcBlob = await imgToBlob(asset.img);
      if (!srcBlob) throw new Error('No image');
      // 1) Segment the subject.
      const { maskUrl } = await sam3Segment({ imageBlob: srcBlob, prompt: subject });
      if (!maskUrl) { setSelectMsg(`No "${subject}" found`); return; }

      // 2) Build the FLUX fill mask = inverse of the subject (white = background
      //    to regenerate), slightly grown + softened for a seamless blend.
      const iw = asset.img.naturalWidth, ih = asset.img.naturalHeight;
      const maskImg = await loadImageEl(maskUrl);
      const mc = document.createElement('canvas');
      mc.width = iw; mc.height = ih;
      const mctx = mc.getContext('2d')!;
      mctx.drawImage(maskImg, 0, 0, iw, ih);
      const idata = mctx.getImageData(0, 0, iw, ih);
      const d = idata.data;
      for (let i = 0; i < d.length; i += 4) {
        const subjAlpha = ((d[i] + d[i + 1] + d[i + 2]) / 3) * (d[i + 3] / 255);
        const bg = 255 - subjAlpha; // invert → background is white
        d[i] = bg; d[i + 1] = bg; d[i + 2] = bg; d[i + 3] = 255;
      }
      mctx.putImageData(idata, 0, 0);
      const maskBlob = await canvasToBlob(mc);
      if (!maskBlob) throw new Error('Mask build failed');

      // 3) FLUX Fill the background with a neutral grey studio backdrop.
      setBusyMsg('Filling background with FLUX…');
      const resultDataUrl = await fluxFill({
        imageBlob: srcBlob,
        maskBlob,
        prompt: `clean seamless deep neutral grey ${DEFAULT_BG} studio background, smooth even studio lighting, no objects, no props, no shadows, plain solid backdrop`,
      });

      // 4) Replace the active layer's image with the result (new shared asset).
      const resultImg = await loadImageEl(resultDataUrl);
      const newAssetId = newUUID();
      const name = `${asset.name} · grey`;
      assetsRef.current.set(newAssetId, { name, w: resultImg.naturalWidth, h: resultImg.naturalHeight, img: resultImg, dataUrl: resultDataUrl });
      setAssets(prev => [...prev, { id: newAssetId, name, w: resultImg.naturalWidth, h: resultImg.naturalHeight }]);
      pushHistory();
      imagesRef.current.set(id, resultImg);
      setLayers(prev => prev.map(l => (l.id === id ? { ...l, assetId: newAssetId, name } : l)));
      setTimeout(() => redrawAll(), 0);
      setSelectMsg('Isolated · grey background');
    } catch (e: any) {
      const m = String(e?.message || e);
      if (/api key|credentials|unauthor|403|401/i.test(m)) { setSelectMsg('Invalid or missing fal key'); setKeyModalOpen(true); }
      else setSelectMsg(m.slice(0, 140));
    } finally {
      setBusyMsg(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Tabs — each tab is a document; assets are shared across the whole project.
  // ---------------------------------------------------------------------------
  /** Flush the active tab's live state (incl. masks) into tabDocsRef. */
  const serializeActiveTab = () => {
    const id = activeTabIdRef.current;
    if (!id) return;
    const masks: Record<string, string> = {};
    masksRef.current.forEach((cv, lid) => { masks[lid] = cv.toDataURL('image/png'); });
    tabDocsRef.current.set(id, {
      id,
      name: tabsMetaRef.current.find(t => t.id === id)?.name || 'Untitled',
      docW: docWRef.current, docH: docHRef.current,
      aw: aspectRef.current.w, ah: aspectRef.current.h,
      bgColor: bgColorRef.current, showBounds: showBoundsRef.current,
      activeId: activeIdRef.current,
      layers: layersRef.current.map(l => ({ ...l })),
      masks,
      maskSpace: 'layer',
      nativeScale: nativeScaleRef.current,
    });
  };

  /**
   * Reproject a legacy doc-space mask onto its layer. The old format painted
   * holes in artboard coordinates, so map the holes — not the mask — through the
   * layer transform: anything the artboard never covered stays revealed.
   */
  const legacyMaskToLayer = (docMask: HTMLImageElement, f: LayerFrame, dw: number, dh: number) => {
    const holes = document.createElement('canvas');
    holes.width = dw; holes.height = dh;
    const hctx = holes.getContext('2d')!;
    hctx.fillStyle = '#fff';
    hctx.fillRect(0, 0, dw, dh);
    hctx.globalCompositeOperation = 'destination-out';
    hctx.drawImage(docMask, 0, 0, dw, dh); // now opaque exactly where the layer was hidden

    const mask = document.createElement('canvas');
    mask.width = f.mw; mask.height = f.mh;
    const mctx = mask.getContext('2d')!;
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, f.mw, f.mh);
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    useDocToMask(mctx, f);
    mctx.drawImage(holes, 0, 0);
    mctx.restore();
    return mask;
  };

  /** Rebuild the active working state from a serialized tab doc. */
  const loadTabDoc = async (doc: PersistedTab) => {
    const imgMap = new Map<string, HTMLImageElement>();
    const maskMap = new Map<string, HTMLCanvasElement>();
    await Promise.all(doc.layers.map(async l => {
      const asset = assetsRef.current.get(l.assetId);
      if (asset) imgMap.set(l.id, asset.img);
      const iw = asset?.img.naturalWidth || asset?.w || doc.docW;
      const ih = asset?.img.naturalHeight || asset?.h || doc.docH;
      const murl = doc.masks[l.id];
      let mc: HTMLCanvasElement | null = null;
      if (murl) {
        try {
          const mimg = await loadImageEl(murl);
          if (doc.maskSpace === 'layer') {
            const { w, h } = maskDims(iw, ih);
            mc = document.createElement('canvas');
            mc.width = w; mc.height = h;
            mc.getContext('2d')!.drawImage(mimg, 0, 0, w, h);
          } else {
            const { w, h } = maskDims(iw, ih);
            mc = legacyMaskToLayer(mimg, frameFor(iw, ih, l, w, h), doc.docW, doc.docH);
          }
        } catch { mc = null; }
      }
      maskMap.set(l.id, mc ?? blankMask(iw, ih));
    }));
    const layers = doc.layers.filter(l => imgMap.has(l.id));
    imagesRef.current = imgMap;
    masksRef.current = maskMap;
    docWRef.current = doc.docW; docHRef.current = doc.docH;
    setDocW(doc.docW); setDocH(doc.docH);
    setAspect({ w: doc.aw, h: doc.ah });
    setBgColor(doc.bgColor);
    setShowBounds(doc.showBounds);
    setNativeScale(doc.nativeScale && doc.nativeScale > 1 ? doc.nativeScale : 1);
    setLayers(layers);
    setActiveId(layers.some(l => l.id === doc.activeId) ? doc.activeId : (layers[layers.length - 1]?.id ?? null));
    histRef.current = []; redoRef.current = []; bumpHist(); // undo is per-tab
    setTimeout(() => { fitView(doc.docW, doc.docH); redrawAll(); }, 0);
  };

  const emptyTabDoc = (name: string): PersistedTab => {
    const d = dimsForAspect(16, 9);
    return { id: newUUID(), name, docW: d.w, docH: d.h, aw: 16, ah: 9, bgColor: DEFAULT_BG, showBounds: true, activeId: null, layers: [], masks: {}, maskSpace: 'layer' };
  };

  const switchTab = async (tabId: string) => {
    if (tabId === activeTabIdRef.current) return;
    serializeActiveTab();
    const doc = tabDocsRef.current.get(tabId);
    if (!doc) return;
    setActiveTabId(tabId); activeTabIdRef.current = tabId;
    await loadTabDoc(doc);
    markDirty();
  };

  const newTab = async () => {
    serializeActiveTab();
    const doc = emptyTabDoc(`Tab ${tabsMetaRef.current.length + 1}`);
    tabDocsRef.current.set(doc.id, doc);
    setTabsMeta(prev => [...prev, { id: doc.id, name: doc.name }]);
    setActiveTabId(doc.id); activeTabIdRef.current = doc.id;
    await loadTabDoc(doc);
    markDirty();
  };

  const closeTab = async (tabId: string) => {
    const meta = tabsMetaRef.current;
    const idx = meta.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    const remaining = meta.filter(t => t.id !== tabId);
    tabDocsRef.current.delete(tabId);
    if (remaining.length === 0) {
      const doc = emptyTabDoc('Tab 1');
      tabDocsRef.current.set(doc.id, doc);
      setTabsMeta([{ id: doc.id, name: doc.name }]);
      setActiveTabId(doc.id); activeTabIdRef.current = doc.id;
      await loadTabDoc(doc);
    } else {
      setTabsMeta(remaining);
      if (activeTabIdRef.current === tabId) {
        const target = remaining[Math.max(0, idx - 1)];
        setActiveTabId(target.id); activeTabIdRef.current = target.id;
        const doc = tabDocsRef.current.get(target.id);
        if (doc) await loadTabDoc(doc);
      }
    }
    markDirty();
  };

  const renameTab = (tabId: string, name: string) => {
    setTabsMeta(prev => prev.map(t => (t.id === tabId ? { ...t, name: name || t.name } : t)));
    const doc = tabDocsRef.current.get(tabId);
    if (doc) doc.name = name || doc.name;
    markDirty();
  };

  // ---------------------------------------------------------------------------
  // Persistence (IndexedDB) — autosave the whole project, hydrate on mount
  // ---------------------------------------------------------------------------
  const captureProject = (): PersistedProject => {
    serializeActiveTab();
    const assetsObj: PersistedProject['assets'] = {};
    assetsRef.current.forEach((a, id) => { assetsObj[id] = { name: a.name, w: a.w, h: a.h, dataUrl: a.dataUrl }; });
    const tabs = tabsMetaRef.current.map(m => tabDocsRef.current.get(m.id)).filter(Boolean) as PersistedTab[];
    return {
      v: 3,
      id: activeProjectIdRef.current || newUUID(),
      name: projectNameRef.current,
      activeTabId: activeTabIdRef.current,
      assets: assetsObj,
      tabs,
    };
  };

  const markDirty = () => {
    if (hydratingRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveProject(captureProject()).catch(() => { /* ignore quota/errors */ });
    }, 800);
  };

  /** Write the active project immediately (before switching away from it). */
  const flushNow = async () => {
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (hydratingRef.current || !activeProjectIdRef.current) return;
    try { await saveProject(captureProject()); } catch { /* ignore quota/errors */ }
  };

  /** Load a project's assets + tabs into the live editing state. */
  const openProjectDoc = async (proj: PersistedProject) => {
    const amap = new Map<string, { name: string; w: number; h: number; img: HTMLImageElement; dataUrl: string }>();
    const alist: ProjectAsset[] = [];
    await Promise.all(Object.entries(proj.assets || {}).map(async ([id, a]) => {
      try {
        const img = await loadImageEl(a.dataUrl);
        amap.set(id, { name: a.name, w: a.w || img.naturalWidth, h: a.h || img.naturalHeight, img, dataUrl: a.dataUrl });
        alist.push({ id, name: a.name, w: a.w || img.naturalWidth, h: a.h || img.naturalHeight });
      } catch { /* skip broken asset */ }
    }));
    assetsRef.current = amap;
    setAssets(alist);

    setActiveProjectId(proj.id); activeProjectIdRef.current = proj.id;
    setProjectName(proj.name); projectNameRef.current = proj.name;

    tabDocsRef.current = new Map();
    const tabs = proj.tabs.length ? proj.tabs : [emptyTabDoc('Tab 1')];
    tabs.forEach(t => tabDocsRef.current.set(t.id, t));
    setTabsMeta(tabs.map(t => ({ id: t.id, name: t.name })));
    tabsMetaRef.current = tabs.map(t => ({ id: t.id, name: t.name }));
    const tabId = tabs.some(t => t.id === proj.activeTabId) ? proj.activeTabId! : tabs[0].id;
    setActiveTabId(tabId); activeTabIdRef.current = tabId;
    await loadTabDoc(tabDocsRef.current.get(tabId)!);
  };

  const blankProject = (name: string): PersistedProject => {
    const doc = emptyTabDoc('Tab 1');
    return { v: 3, id: newUUID(), name, activeTabId: doc.id, assets: {}, tabs: [doc] };
  };

  const hydrate = async () => {
    const ws = await loadWorkspace();
    if (!ws.projects.length) {
      const proj = blankProject('Project 1');
      setProjects([{ id: proj.id, name: proj.name, updatedAt: Date.now() }]);
      await openProjectDoc(proj);
      hydratingRef.current = false;
      markDirty();
      return;
    }
    setProjects(ws.projects);
    projectsRef.current = ws.projects;
    const wantId = ws.projects.some(p => p.id === ws.activeProjectId) ? ws.activeProjectId! : ws.projects[0].id;
    const proj = (await loadProject(wantId)) || blankProject(ws.projects.find(p => p.id === wantId)?.name || 'Project 1');
    await openProjectDoc(proj);
    hydratingRef.current = false;
  };

  useEffect(() => { hydrate(); /* eslint-disable-next-line */ }, []);
  // Autosave when persisted state changes; mask-pixel edits call markDirty directly.
  useEffect(() => { markDirty(); /* eslint-disable-next-line */ }, [layers, bgColor, showBounds, docW, docH, aspect, activeId, tabsMeta, activeTabId, assets, projectName]);

  // ---------------------------------------------------------------------------
  // Projects — a project owns its tabs and its shared asset pool
  // ---------------------------------------------------------------------------
  const persistProjectList = (list: ProjectMeta[], activeId: string | null) => {
    setProjects(list);
    projectsRef.current = list;
    saveWorkspace({ v: 3, activeProjectId: activeId, projects: list }).catch(() => { /* ignore */ });
  };

  const switchProject = async (id: string) => {
    if (id === activeProjectIdRef.current) { setProjectMenuOpen(false); return; }
    setProjectMenuOpen(false);
    setSwitchingProject(true);
    try {
      await flushNow();
      hydratingRef.current = true; // don't autosave the in-between state
      const proj = (await loadProject(id)) || blankProject(projectsRef.current.find(p => p.id === id)?.name || 'Project');
      await openProjectDoc(proj);
      persistProjectList(projectsRef.current, id);
    } finally {
      hydratingRef.current = false;
      setSwitchingProject(false);
    }
  };

  const newProject = async () => {
    setProjectMenuOpen(false);
    setSwitchingProject(true);
    try {
      await flushNow();
      hydratingRef.current = true;
      const proj = blankProject(`Project ${projectsRef.current.length + 1}`);
      await openProjectDoc(proj);
      const list = [...projectsRef.current, { id: proj.id, name: proj.name, updatedAt: Date.now() }];
      persistProjectList(list, proj.id);
    } finally {
      hydratingRef.current = false;
      setSwitchingProject(false);
    }
    // Write the (empty) project record now so the index never points at nothing.
    saveProject(captureProject()).catch(() => { /* ignore */ });
  };

  const renameProject = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const id = activeProjectIdRef.current;
    setProjectName(clean); projectNameRef.current = clean;
    persistProjectList(projectsRef.current.map(p => (p.id === id ? { ...p, name: clean } : p)), id);
    markDirty();
  };

  const removeProject = async (id: string) => {
    const meta = projectsRef.current.find(p => p.id === id);
    if (!meta) return;
    if (!window.confirm(`Delete project "${meta.name}"? Its tabs, layers and assets are removed for good.`)) return;
    const remaining = projectsRef.current.filter(p => p.id !== id);
    await deleteProject(id).catch(() => { /* ignore */ });
    if (id !== activeProjectIdRef.current) {
      persistProjectList(remaining, activeProjectIdRef.current);
      return;
    }
    setSwitchingProject(true);
    try {
      hydratingRef.current = true;
      if (!remaining.length) {
        const proj = blankProject('Project 1');
        await openProjectDoc(proj);
        persistProjectList([{ id: proj.id, name: proj.name, updatedAt: Date.now() }], proj.id);
      } else {
        const proj = (await loadProject(remaining[0].id)) || blankProject(remaining[0].name);
        await openProjectDoc(proj);
        persistProjectList(remaining, remaining[0].id);
      }
    } finally {
      hydratingRef.current = false;
      setSwitchingProject(false);
    }
    markDirty();
  };

  // ---------------------------------------------------------------------------
  // Undo / redo
  // ---------------------------------------------------------------------------
  const loadMaskCanvas = (url: string) => new Promise<HTMLCanvasElement>(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.src = url;
  });

  const captureSnapshot = (): Snapshot => {
    const masks: Record<string, string> = {};
    masksRef.current.forEach((cv, id) => { masks[id] = cv.toDataURL('image/png'); });
    return {
      layers: layersRef.current.map(l => ({ ...l })),
      masks,
      bgColor: bgColorRef.current,
      aw: aspectRef.current.w, ah: aspectRef.current.h,
      docW: docWRef.current, docH: docHRef.current,
      activeId: activeIdRef.current,
      cropped: [...croppedRef.current],
      nativeScale: nativeScaleRef.current,
    };
  };

  /** Record the current state so the next mutation can be undone. */
  const pushHistory = () => {
    histRef.current.push(captureSnapshot());
    if (histRef.current.length > 60) histRef.current.shift();
    redoRef.current = [];
    bumpHist();
  };

  const restoreSnapshot = async (snap: Snapshot) => {
    const resized = snap.docW !== docWRef.current || snap.docH !== docHRef.current;
    const newMasks = new Map<string, HTMLCanvasElement>();
    await Promise.all(Object.entries(snap.masks).map(async ([id, url]) => {
      newMasks.set(id, await loadMaskCanvas(url));
    }));
    masksRef.current = newMasks;
    croppedRef.current = new Set(snap.cropped ?? []);
    setNativeScale(snap.nativeScale ?? 1);
    // Rebuild the per-layer image map from each layer's asset (assetId can
    // change, e.g. the isolate preset swaps a layer's image).
    const imgMap = new Map<string, HTMLImageElement>();
    for (const l of snap.layers) { const a = assetsRef.current.get(l.assetId); if (a) imgMap.set(l.id, a.img); }
    imagesRef.current = imgMap;
    docWRef.current = snap.docW; docHRef.current = snap.docH;
    setDocW(snap.docW); setDocH(snap.docH);
    setBgColor(snap.bgColor);
    setAspect({ w: snap.aw, h: snap.ah });
    setLayers(snap.layers.map(l => ({ ...l })));
    setActiveId(snap.activeId);
    setTimeout(() => { if (resized) fitView(snap.docW, snap.docH); redrawAll(); }, 0);
  };

  const undo = async () => {
    if (!histRef.current.length) return;
    redoRef.current.push(captureSnapshot());
    const snap = histRef.current.pop()!;
    await restoreSnapshot(snap);
    bumpHist();
  };

  const redo = async () => {
    if (!redoRef.current.length) return;
    histRef.current.push(captureSnapshot());
    const snap = redoRef.current.pop()!;
    await restoreSnapshot(snap);
    bumpHist();
  };

  /** Set the background as an undoable action. */
  const commitBgColor = (v: string | null) => { pushHistory(); setBgColor(v); };

  // Keyboard: tool hotkeys, space-to-pan, zoom, undo/redo.
  const [spacePan, setSpacePan] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (meta && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        setSelectedIds(new Set(layersRef.current.map(l => l.id)));
        return;
      }
      if (e.key === 'Escape' && !typing) { setSelectedIds(new Set()); scheduleRedraw(); return; }
      if (meta || typing) return;
      switch (e.key.toLowerCase()) {
        case 'v': setTool('move'); break;
        case 'b': setTool('mask'); break;
        case 'h': setTool('hand'); break;
        case 's': setTool('select'); break;
        case 'c': setTool('crop'); break;
        case 'i': case 'e': setTool('eyedropper'); break;
        case 'f': fitView(); drawView(); break;
        // L fills the artboard (crops to cells); ⇧L stitches whole frames.
        case 'l': e.shiftKey ? stitchLayers() : autoLayout(); break;
        case '=': case '+': zoomBy(1.2); break;
        case '-': case '_': zoomBy(1 / 1.2); break;
        case ' ':
          e.preventDefault();
          if (!spaceRef.current) { spaceRef.current = true; setSpacePan(true); }
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = false; setSpacePan(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
    /* eslint-disable-next-line */
  }, []);

  // ---------------------------------------------------------------------------
  // Pointer events
  // ---------------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const isPan = tool === 'hand' || spaceRef.current || e.button === 1 || e.altKey;
    if (isPan) {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: viewOffRef.current.x, oy: viewOffRef.current.y };
      return;
    }
    const p = screenToDoc(e.clientX, e.clientY);
    if (tool === 'eyedropper') {
      sampleColorAt(p.x, p.y);
      return;
    }
    if (tool === 'select') {
      const dw = docWRef.current, dh = docHRef.current;
      if (p.x < 0 || p.y < 0 || p.x > dw || p.y > dh) return; // ignore clicks off the artboard
      if (!selecting) runSmartSelect({ point: { x: p.x, y: p.y } });
      return;
    }
    if (tool === 'crop') {
      if (!activeIdRef.current) return;
      cropRectRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      dragRef.current = { mode: 'crop', sx: e.clientX, sy: e.clientY, ox: 0, oy: 0 };
      scheduleRedraw();
      return;
    }
    if (tool === 'mask') {
      const id = activeIdRef.current;
      const layer = layersRef.current.find(l => l.id === id);
      if (!id || !layer) return;
      const frame = layerFrame(layer);
      if (!frame) return;
      pushHistory();
      croppedRef.current.delete(id); // hand-painted from here on — not a crop rect
      // Fresh buffer for this stroke, in the active layer's mask space.
      const buf = document.createElement('canvas');
      buf.width = frame.mw; buf.height = frame.mh;
      strokeCanvasRef.current = buf;
      strokeInfoRef.current = { layerId: id, mode: maskMode, feather: brushFeatherRef.current * frame.m, frame };
      dragRef.current = { mode: 'paint', sx: e.clientX, sy: e.clientY, ox: 0, oy: 0 };
      lastPaintRef.current = null;
      paintAt(p.x, p.y);
    } else if (tool === 'move') {
      const hit = layerAt(p.x, p.y);
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!hit) {
        // Empty artboard → box-select. A plain click (no drag) clears.
        marqueeRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        marqueeBaseRef.current = additive ? new Set(selectedIdsRef.current) : new Set();
        if (!additive) setSelectedIds(new Set());
        dragRef.current = { mode: 'marquee', sx: p.x, sy: p.y, ox: 0, oy: 0 };
        scheduleRedraw();
        return;
      }
      // Clicking a layer selects it (shift/⌘ adds), and drags the whole selection.
      let sel = selectedIdsRef.current;
      if (additive) {
        sel = new Set(sel);
        if (sel.has(hit.id)) sel.delete(hit.id); else sel.add(hit.id);
        setSelectedIds(sel);
      } else if (!sel.has(hit.id)) {
        sel = new Set([hit.id]);
        setSelectedIds(sel);
      }
      if (hit.id !== activeIdRef.current) { setActiveId(hit.id); activeIdRef.current = hit.id; }
      movePushedRef.current = false;
      // Origins for every layer that moves with this drag.
      moveOriginsRef.current = new Map(
        layersRef.current
          .filter(l => (sel.size > 1 ? sel.has(l.id) : l.id === hit.id))
          .map(l => [l.id, { x: l.x, y: l.y }]),
      );
      dragRef.current = { mode: 'move', sx: p.x, sy: p.y, ox: hit.x, oy: hit.y };
    }
  };

  /** Topmost visible layer whose (unrotated) box contains a doc-space point. */
  const layerAt = (x: number, y: number): CompLayer | null => {
    const ls = layersRef.current;
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      if (!l.visible) continue;
      const img = imagesRef.current.get(l.id);
      if (!img) continue;
      const w = img.naturalWidth * l.scale, h = img.naturalHeight * l.scale;
      if (x >= l.x && x <= l.x + w && y >= l.y && y <= l.y + h) return l;
    }
    return null;
  };

  /** Doc-space bounding box of a set of layers. */
  const boundsOf = (ids: Set<string> | string[]): { x: number; y: number; w: number; h: number } | null => {
    const want = ids instanceof Set ? ids : new Set(ids);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const l of layersRef.current) {
      if (!want.has(l.id)) continue;
      const img = imagesRef.current.get(l.id);
      if (!img) continue;
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + img.naturalWidth * l.scale);
      maxY = Math.max(maxY, l.y + img.naturalHeight * l.scale);
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Brush cursor overlay.
    if (cursorRef.current) {
      const cont = containerRef.current!;
      const rect = cont.getBoundingClientRect();
      const size = brushSize * viewScaleRef.current;
      cursorRef.current.style.width = `${size}px`;
      cursorRef.current.style.height = `${size}px`;
      cursorRef.current.style.left = `${e.clientX - rect.left}px`;
      cursorRef.current.style.top = `${e.clientY - rect.top}px`;
      cursorRef.current.style.display = (tool === 'mask' && !spaceRef.current) ? 'block' : 'none';
    }

    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pan') {
      viewOffRef.current = { x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) };
      clampView();
      scheduleRedraw();
    } else if (d.mode === 'paint') {
      const p = screenToDoc(e.clientX, e.clientY);
      paintAt(p.x, p.y);
    } else if (d.mode === 'move') {
      const p = screenToDoc(e.clientX, e.clientY);
      const dx = p.x - d.sx, dy = p.y - d.sy;
      if (!movePushedRef.current) { pushHistory(); movePushedRef.current = true; }
      const origins = moveOriginsRef.current;
      setLayers(prev => prev.map(l => {
        const o = origins.get(l.id);
        return o ? { ...l, x: o.x + dx, y: o.y + dy } : l;
      }));
    } else if (d.mode === 'marquee' && marqueeRef.current) {
      const p = screenToDoc(e.clientX, e.clientY);
      marqueeRef.current = { ...marqueeRef.current, x1: p.x, y1: p.y };
      const r = marqueeRef.current;
      const minX = Math.min(r.x0, r.x1), maxX = Math.max(r.x0, r.x1);
      const minY = Math.min(r.y0, r.y1), maxY = Math.max(r.y0, r.y1);
      const hit = new Set(marqueeBaseRef.current);
      for (const l of layersRef.current) {
        const img = imagesRef.current.get(l.id);
        if (!img || !l.visible) continue;
        const w = img.naturalWidth * l.scale, h = img.naturalHeight * l.scale;
        // Touch, not enclose — a partial sweep still catches the layer.
        if (l.x + w > minX && l.x < maxX && l.y + h > minY && l.y < maxY) hit.add(l.id);
      }
      selectedIdsRef.current = hit;
      setSelectedIds(hit);
      scheduleRedraw();
    } else if (d.mode === 'crop' && cropRectRef.current) {
      const p = screenToDoc(e.clientX, e.clientY);
      cropRectRef.current = { ...cropRectRef.current, x1: p.x, y1: p.y };
      scheduleRedraw();
    }
  };

  const onPointerUp = () => {
    const mode = dragRef.current?.mode;
    dragRef.current = null;
    lastPaintRef.current = null;
    if (mode === 'paint') commitStroke();
    else if (mode === 'crop') commitCrop();
    else if (mode === 'marquee') {
      marqueeRef.current = null;
      // The last selected layer becomes active so the Properties panel follows.
      const sel = selectedIdsRef.current;
      if (sel.size && !sel.has(activeIdRef.current ?? '')) {
        const last = [...layersRef.current].reverse().find(l => sel.has(l.id));
        if (last) setActiveId(last.id);
      }
      scheduleRedraw();
    }
  };

  /** Apply the crop marquee to the active layer as a rectangular mask. */
  const commitCrop = () => {
    const r = cropRectRef.current;
    cropRectRef.current = null;
    const id = activeIdRef.current;
    if (!r || !id) { scheduleRedraw(); return; }
    const dw = docWRef.current, dh = docHRef.current;
    let x = Math.max(0, Math.min(r.x0, r.x1));
    let y = Math.max(0, Math.min(r.y0, r.y1));
    let w = Math.min(dw, Math.max(r.x0, r.x1)) - x;
    let h = Math.min(dh, Math.max(r.y0, r.y1)) - y;
    if (w < 4 || h < 4) { scheduleRedraw(); return; } // ignore tiny/accidental drags
    pushHistory();
    setRectMask(id, x, y, w, h);
    croppedRef.current.delete(id); // a hand crop is intentional — Auto Stitch keeps it
    redrawAll();
    markDirty();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const cv = viewCanvasRef.current!;
    const rect = cv.getBoundingClientRect();
    // Ctrl/Cmd + wheel (and trackpad pinch) → zoom to cursor. Plain wheel → pan.
    if (e.ctrlKey || e.metaKey) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const s0 = viewScaleRef.current;
      const factor = Math.exp(-e.deltaY * 0.01);
      const s1 = s0 * factor;
      const off = viewOffRef.current;
      viewOffRef.current = {
        x: mx - ((mx - off.x) * s1) / s0,
        y: my - ((my - off.y) * s1) / s0,
      };
      viewScaleRef.current = s1;
    } else {
      viewOffRef.current = {
        x: viewOffRef.current.x - e.deltaX,
        y: viewOffRef.current.y - e.deltaY,
      };
    }
    clampView();
    scheduleRedraw();
  };

  const zoomBy = (factor: number) => {
    const cont = containerRef.current;
    if (!cont) return;
    const cx = cont.clientWidth / 2, cy = cont.clientHeight / 2;
    const s0 = viewScaleRef.current;
    const s1 = s0 * factor;
    const off = viewOffRef.current;
    viewOffRef.current = { x: cx - ((cx - off.x) * s1) / s0, y: cy - ((cy - off.y) * s1) / s0 };
    viewScaleRef.current = s1;
    clampView();
    drawView();
  };

  // ---------------------------------------------------------------------------
  // Layer ops
  // ---------------------------------------------------------------------------
  const patchLayer = (id: string, patch: Partial<CompLayer>) =>
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    pushHistory();
    // Keep the source image in imagesRef so an undo can restore the layer.
    masksRef.current.delete(id);
    setSelectedIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev); next.delete(id); return next;
    });
    setLayers(prev => {
      const out = prev.filter(l => l.id !== id);
      if (activeIdRef.current === id) setActiveId(out.length ? out[out.length - 1].id : null);
      return out;
    });
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    pushHistory();
    setLayers(prev => {
      const i = prev.findIndex(l => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const out = [...prev];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  };

  const renameLayer = (id: string, name: string) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return;
    pushHistory();
    patchLayer(id, { name: clean });
  };

  /**
   * Drop `dragId` next to `targetId` in the *panel* order (top layer first),
   * then flip back to the stored order (bottom layer first). Masks and images
   * are keyed by layer id, so only the array order moves.
   */
  const reorderLayer = (dragId: string, targetId: string, before: boolean) => {
    if (dragId === targetId) return;
    pushHistory();
    setLayers(prev => {
      const display = [...prev].reverse();
      const from = display.findIndex(l => l.id === dragId);
      if (from < 0) return prev;
      const [moved] = display.splice(from, 1);
      const ti = display.findIndex(l => l.id === targetId);
      if (ti < 0) return prev;
      display.splice(before ? ti : ti + 1, 0, moved);
      return display.reverse();
    });
  };

  const clearMask = (id: string) => {
    const mask = masksRef.current.get(id);
    if (!mask) return;
    pushHistory();
    const mctx = mask.getContext('2d')!;
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, mask.width, mask.height);
    redrawAll();
    markDirty();
  };

  const invertMask = (id: string) => {
    const mask = masksRef.current.get(id);
    if (!mask) return;
    pushHistory();
    const mctx = mask.getContext('2d')!;
    const img = mctx.getImageData(0, 0, mask.width, mask.height);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255 - d[i];
    mctx.putImageData(img, 0, 0);
    redrawAll();
    markDirty();
  };

  const resetTransform = (id: string) => {
    const img = imagesRef.current.get(id);
    if (!img) return;
    pushHistory();
    const dw = docWRef.current, dh = docHRef.current;
    const fit = Math.min(dw / img.naturalWidth, dh / img.naturalHeight);
    const w = img.naturalWidth * fit, h = img.naturalHeight * fit;
    patchLayer(id, { scale: fit, rotation: 0, x: (dw - w) / 2, y: (dh - h) / 2 });
  };

  const fillDoc = (id: string) => {
    const img = imagesRef.current.get(id);
    if (!img) return;
    pushHistory();
    const dw = docWRef.current, dh = docHRef.current;
    const cover = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
    const w = img.naturalWidth * cover, h = img.naturalHeight * cover;
    patchLayer(id, { scale: cover, rotation: 0, x: (dw - w) / 2, y: (dh - h) / 2 });
  };

  /**
   * Set a layer's mask to a single opaque doc-space rectangle (crops the layer
   * to it). `geom` overrides the layer's stored transform for callers that are
   * about to move it in the same commit (auto layout).
   */
  const setRectMask = (
    layerId: string, rx: number, ry: number, rw: number, rh: number,
    geom?: { x: number; y: number; scale: number; rotation: number },
  ) => {
    const img = imagesRef.current.get(layerId);
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!img || !layer) return;
    const { w: mw, h: mh } = maskDims(img.naturalWidth, img.naturalHeight);
    const f = frameFor(img.naturalWidth, img.naturalHeight, geom ?? layer, mw, mh);
    const mask = document.createElement('canvas');
    mask.width = mw; mask.height = mh; // fully transparent → only the rect shows
    const mctx = mask.getContext('2d')!;
    mctx.save();
    useDocToMask(mctx, f);              // a rotated layer gets a rotated rect
    mctx.fillStyle = '#fff';
    mctx.fillRect(rx, ry, rw, rh);
    mctx.restore();
    masksRef.current.set(layerId, mask);
  };

  // ---------------------------------------------------------------------------
  // Auto Layout — tile the WHOLE artboard with the layers so it is fully filled
  // for the chosen aspect ratio. Each image is scaled to *cover* its cell and
  // cropped to it (via a rectangular mask), so there are never empty gaps. The
  // grid shape (rows × columns) is chosen to minimise how much each image is
  // cropped, adapting to the images' orientations and the artboard aspect.
  // ---------------------------------------------------------------------------
  const autoLayout = (gapPct = 0) => {
    const items = layersRef.current
      .map(l => { const img = imagesRef.current.get(l.id); return img ? { id: l.id, ar: img.naturalWidth / img.naturalHeight, img } : null; })
      .filter(Boolean) as { id: string; ar: number; img: HTMLImageElement }[];
    const n = items.length;
    if (n === 0) return;
    const dw = docWRef.current, dh = docHRef.current;
    const gap = Math.round((dw * gapPct) / 100);

    // Distribute n items into r rows as evenly as possible (contiguous).
    const rowsFor = (r: number) => {
      const base = Math.floor(n / r), extra = n % r;
      const counts: number[] = [];
      for (let i = 0; i < r; i++) counts.push(base + (i < extra ? 1 : 0));
      return counts;
    };

    // Cost of a grid = how far each cell's aspect is from its image's aspect
    // (log-ratio); lower means less cropping.
    const cost = (r: number) => {
      const counts = rowsFor(r);
      const cellH = (dh - gap * (r + 1)) / r;
      let c = 0, idx = 0;
      for (const cCount of counts) {
        const cellW = (dw - gap * (cCount + 1)) / cCount;
        const cellAR = cellW / cellH;
        for (let k = 0; k < cCount; k++) { c += Math.abs(Math.log(cellAR / items[idx].ar)); idx++; }
      }
      return c;
    };

    let bestR = 1, bestCost = Infinity;
    for (let r = 1; r <= n; r++) { const c = cost(r); if (c < bestCost) { bestCost = c; bestR = r; } }

    const counts = rowsFor(bestR);
    const cellH = (dh - gap * (bestR + 1)) / bestR;

    pushHistory();
    const patches = new Map<string, Partial<CompLayer>>();
    let idx = 0;
    let y = gap;
    for (const cCount of counts) {
      const cellW = (dw - gap * (cCount + 1)) / cCount;
      let x = gap;
      for (let k = 0; k < cCount; k++) {
        const it = items[idx++];
        const cover = Math.max(cellW / it.img.naturalWidth, cellH / it.img.naturalHeight);
        const w = it.img.naturalWidth * cover, h = it.img.naturalHeight * cover;
        // Center the covered image on the cell, crop to the cell via a rect mask.
        const geom = { x: x + (cellW - w) / 2, y: y + (cellH - h) / 2, scale: cover, rotation: 0 };
        patches.set(it.id, geom);
        setRectMask(it.id, x, y, cellW, cellH, geom); // the layer's new placement, not its old one
        croppedRef.current.add(it.id);                // Auto Stitch may drop this crop
        x += cellW + gap;
      }
      y += cellH + gap;
    }
    setLayers(prev => prev.map(l => (patches.has(l.id) ? { ...l, ...patches.get(l.id)! } : l)));
    markDirty();
  };

  // ---------------------------------------------------------------------------
  // Auto Stitch — arrange the layers as justified rows of WHOLE frames, the way
  // Smart Stitch does. Nothing is cropped: each image keeps its full frame and
  // native aspect, rows are justified to a common width, and the row split is
  // chosen to land closest to the artboard's aspect.
  //
  // With "Fit canvas" on, the artboard is resized to the stitch and its
  // resolution raised toward the point where no image is downscaled — so the
  // composite is sharp instead of squeezed into a 2K frame. 4K is the ceiling:
  // a dense stitch of large sources is downscaled to fit it rather than growing
  // into an 8K file.
  // ---------------------------------------------------------------------------
  const stitchLayers = (opts: { history?: boolean; layers?: CompLayer[] } = {}) => {
    // `opts.layers` lets a caller stitch a list it has in hand — importFiles runs
    // before React has committed the new layers, so the ref would be stale.
    const source = opts.layers ?? layersRef.current;
    // A box selection of 2+ layers stitches just those, in place: the rest of the
    // composition and the artboard are left alone.
    const sel = selectedIdsRef.current;
    const subset = !opts.layers && sel.size > 1 && sel.size < source.length;
    const pool = subset ? source.filter(l => sel.has(l.id)) : source;
    const entries = pool
      .map(l => { const img = imagesRef.current.get(l.id); return img ? { l, img } : null; })
      .filter(Boolean) as { l: CompLayer; img: HTMLImageElement }[];
    if (!entries.length) return;

    const inputs = entries.map(({ l, img }) => ({
      id: l.id, width: img.naturalWidth, height: img.naturalHeight,
    }));
    const gapRatio = Math.max(0, stitchGapRef.current) / 100;
    const dw = docWRef.current, dh = docHRef.current;

    let placements;
    let nextW = dw, nextH = dh;
    let wantScale = 1; // what the export needs to restore full source detail
    if (subset) {
      // Arrange the selection inside its own bounding box — the canvas keeps its
      // size, and layers outside the selection do not move.
      const b = boundsOf(sel) ?? { x: 0, y: 0, w: dw, h: dh };
      const layout = fitStitchInBox(inputs, {
        boxWidth: b.w, boxHeight: b.h, gap: b.w * gapRatio, targetAspect: b.w / b.h,
      });
      placements = layout.items.map(p => ({ ...p, x: p.x + b.x, y: p.y + b.y }));
      // Keep whatever the doc already needed; a subset never lowers the bar.
      wantScale = Math.max(nativeScaleRef.current, layout.nativeScale);
    } else if (stitchFitCanvasRef.current) {
      const layout = stitchAtNativeResolution(inputs, {
        gapRatio,
        targetAspect: dw / dh,
        maxSide: Math.min(MAX_SIDE, MAX_LONG_EDGE_4K),
        maxPixels: Math.min(MAX_PIXELS, MAX_LONG_EDGE_4K * MAX_LONG_EDGE_4K),
      });
      // clampDims can shrink further (min edge / rounding) — rescale to match.
      const { w, h } = clampDims(layout.width, layout.height);
      const k = layout.width > 0 ? w / layout.width : 1;
      placements = layout.items.map(p => ({
        id: p.id, x: p.x * k, y: p.y * k, width: p.width * k, height: p.height * k,
      }));
      nextW = w; nextH = h;
      wantScale = layout.nativeScale / (k || 1);
    } else {
      const layout = fitStitchInBox(inputs, {
        boxWidth: dw, boxHeight: dh, gap: dw * gapRatio,
      });
      placements = layout.items;
      wantScale = layout.nativeScale;
    }
    if (!placements.length) return;

    if (opts.history !== false) pushHistory();

    const patches = new Map<string, Partial<CompLayer>>();
    for (const p of placements) {
      const src = entries.find(e => e.l.id === p.id);
      if (!src) continue;
      patches.set(p.id, {
        x: p.x,
        y: p.y,
        scale: p.width / src.img.naturalWidth,
        rotation: 0,
      });
      // Whole frames — drop a crop rect a previous Fill layout baked in, but
      // leave hand-painted and AI masks alone.
      if (croppedRef.current.has(p.id)) {
        masksRef.current.set(p.id, blankMask(src.img.naturalWidth, src.img.naturalHeight));
        croppedRef.current.delete(p.id);
      }
    }

    const resized = nextW !== dw || nextH !== dh;
    if (resized) {
      docWRef.current = nextW; docHRef.current = nextH;
      setDocW(nextW); setDocH(nextH);
      setAspect(reduceRatio(nextW, nextH));
    }
    nativeScaleRef.current = Math.max(1, wantScale);
    setNativeScale(Math.max(1, wantScale));
    setLayers(prev => prev.map(l => (patches.has(l.id) ? { ...l, ...patches.get(l.id)! } : l)));
    setTimeout(() => { fitView(nextW, nextH); redrawAll(); }, 0);
    markDirty();
  };

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  const [exporting, setExporting] = useState(false);
  /**
   * Export scale: at least 2K on the long edge, never below the artboard's own
   * resolution, and up to `nativeScale` so a stitch the artboard had to shrink
   * regains source detail — bounded by the 4K ceiling. Layers are re-drawn from
   * their original images at this scale: a bigger render, not an upscale of the
   * preview. A doc the user sized past 4K by hand still exports 1:1, never below
   * its own pixels.
   */
  const exportScale = exportScaleForDoc({
    docW, docH,
    wanted: nativeScale,
    minLongEdge: EXPORT_LONG_EDGE,
    maxSide: EXPORT_MAX_SIDE,
    maxPixels: EXPORT_MAX_PIXELS,
  });
  const exportDims = {
    w: Math.round(docW * exportScale),
    h: Math.round(docH * exportScale),
  };
  const exportImage = async () => {
    const dw = docWRef.current, dh = docHRef.current;
    if (!dw || !dh) return;
    setExporting(true);
    try {
      const k = exportScaleForDoc({
        docW: dw, docH: dh,
        wanted: nativeScaleRef.current,
        minLongEdge: EXPORT_LONG_EDGE,
        maxSide: EXPORT_MAX_SIDE,
        maxPixels: EXPORT_MAX_PIXELS,
      });
      const out = document.createElement('canvas');
      out.width = Math.round(dw * k);
      out.height = Math.round(dh * k);
      const ctx = out.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      compositeInto(ctx, k);
      await downloadCanvasPng(out, `layer-studio-${out.width}x${out.height}.png`);
    } finally {
      setExporting(false);
    }
  };

  // File drop
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files);
  };

  const active = layers.find(l => l.id === activeId);
  const hasLayers = layers.length > 0;
  const isCustomBg = bgColor !== null && !BG_SWATCHES.some(s => s.value === bgColor);
  // Auto Stitch acts on the box selection when it is a real subset of the layers.
  const stitchSubset = selectedIds.size > 1 && selectedIds.size < layers.length;
  // Row split the next Auto Stitch would use — shown in the section header so the
  // shape is visible before committing to it.
  const stitchRows = React.useMemo(() => {
    const inputs = layers
      .map(l => { const img = imagesRef.current.get(l.id); return img ? { id: l.id, width: img.naturalWidth, height: img.naturalHeight } : null; })
      .filter(Boolean) as { id: string; width: number; height: number }[];
    return inputs.length > 1 ? chooseStitchRows(inputs, docW / docH) : [];
  }, [layers, docW, docH]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full h-full flex flex-col bg-background text-primary select-none">
      {/* Project bar — the project owns its tabs and its shared asset pool */}
      <div className="h-9 shrink-0 border-b border-border flex items-center gap-2 px-3 relative">
        <FolderOpen size={13} className="text-accent shrink-0" />
        {renamingProject ? (
          <input
            autoFocus
            defaultValue={projectName}
            onBlur={e => { renameProject(e.target.value); setRenamingProject(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { renameProject((e.target as HTMLInputElement).value); setRenamingProject(false); }
              if (e.key === 'Escape') setRenamingProject(false);
            }}
            className="bg-surface border border-accent rounded px-1.5 py-0.5 text-xs w-48 focus:outline-none"
          />
        ) : (
          <>
            <button onClick={() => setProjectMenuOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-accent transition-colors max-w-[240px]"
              title="Switch project">
              <span className="truncate">{projectName}</span>
              <ChevronDown size={12} className="text-secondary shrink-0" />
            </button>
            <button onClick={() => setRenamingProject(true)}
              className="text-secondary hover:text-primary shrink-0" title="Rename project">
              <Pencil size={11} />
            </button>
          </>
        )}
        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-secondary">
          {tabsMeta.length} {tabsMeta.length === 1 ? 'tab' : 'tabs'} · {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
        </span>

        {projectMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProjectMenuOpen(false)} />
            <div className="absolute left-2 top-9 z-50 w-72 bg-background border border-border rounded-lg shadow-elevated py-1">
              <div className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-secondary">Projects</div>
              <div className="max-h-72 overflow-y-auto">
                {projects.map(p => (
                  <div key={p.id}
                    className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 ${p.id === activeProjectId ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary hover:bg-surface'}`}
                    onClick={() => switchProject(p.id)}>
                    <span className="text-xs truncate flex-1">{p.id === activeProjectId ? projectName : p.name}</span>
                    <button onClick={e => { e.stopPropagation(); removeProject(p.id); }}
                      className="opacity-0 group-hover:opacity-100 text-secondary hover:text-accent shrink-0" title="Delete project">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="h-px bg-border my-1" />
              <button onClick={newProject}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-secondary hover:text-primary hover:bg-surface">
                <Plus size={12} /> New project
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tab bar */}
      <div className="h-9 shrink-0 border-b border-border flex items-stretch pl-2 pr-1 gap-0.5 overflow-x-auto no-scrollbar">
        {tabsMeta.map(t => {
          const active = t.id === activeTabId;
          return (
            <div key={t.id}
              onClick={() => switchTab(t.id)}
              onDoubleClick={() => { setRenamingTabId(t.id); }}
              className={`group relative flex items-center gap-2 pl-3 pr-2 h-full cursor-pointer border-b-2 max-w-[180px] ${active ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'}`}>
              {renamingTabId === t.id ? (
                <input
                  autoFocus
                  defaultValue={t.name}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { renameTab(t.id, e.target.value.trim()); setRenamingTabId(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { renameTab(t.id, (e.target as HTMLInputElement).value.trim()); setRenamingTabId(null); } if (e.key === 'Escape') setRenamingTabId(null); }}
                  className="bg-surface border border-accent rounded px-1 text-xs w-24 focus:outline-none"
                />
              ) : (
                <span className="text-xs truncate" title={`${t.name} — double-click to rename`}>{t.name}</span>
              )}
              <button
                onClick={e => { e.stopPropagation(); closeTab(t.id); }}
                className={`shrink-0 rounded p-0.5 text-secondary hover:text-primary hover:bg-surface ${active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'}`}
                title="Close tab">
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button onClick={newTab} title="New tab"
          className="shrink-0 self-center ml-1 w-6 h-6 flex items-center justify-center rounded text-secondary hover:text-primary hover:bg-surface">
          <Plus size={15} />
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
      {/* Tool rail */}
      <div className="w-14 shrink-0 border-r border-border flex flex-col items-center py-4 gap-2">
        <ToolBtn icon={<Move size={18} />} label="Move / Transform — V" active={tool === 'move'} onClick={() => setTool('move')} />
        <ToolBtn icon={<Brush size={18} />} label="Mask brush — B" active={tool === 'mask'} onClick={() => setTool('mask')} />
        <ToolBtn icon={<Wand2 size={18} />} label="Smart Select (SAM 3) — S" active={tool === 'select'} onClick={() => setTool('select')} />
        <ToolBtn icon={<Crop size={18} />} label="Crop active layer — C" active={tool === 'crop'} onClick={() => setTool('crop')} />
        <ToolBtn icon={<Hand size={18} />} label="Pan — H  (or hold Space / Alt)" active={tool === 'hand' || spacePan} onClick={() => setTool('hand')} />
        <ToolBtn icon={<Pipette size={18} />} label="Eyedropper → background — I" active={tool === 'eyedropper'} onClick={() => setTool('eyedropper')} />
        <div className="h-px w-8 bg-border my-1" />
        <ToolBtn icon={<Upload size={18} />} label="Import image" onClick={() => fileInputRef.current?.click()} />
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
          onChange={e => e.target.files && importFiles(e.target.files)} />
      </div>

      {/* Canvas stage */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Context toolbar */}
        <div className="h-14 shrink-0 border-b border-border flex items-center gap-4 px-5">
          <div className="flex items-center gap-2 text-secondary shrink-0">
            <LayersIcon size={16} className="text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Layer Studio</span>
          </div>

          {/* Scrollable brush controls — never pushes the Export cluster off-screen. */}
          <div className="flex-1 min-w-0 flex items-center overflow-x-auto no-scrollbar">
            {tool === 'select' && (
              <div className="flex items-center gap-3 animate-fade-in whitespace-nowrap">
                <div className="flex items-center bg-surface rounded-lg p-0.5">
                  <SegBtn active={maskMode === 'hide'} onClick={() => setMaskMode('hide')} icon={<Eraser size={13} />}>Hide</SegBtn>
                  <SegBtn active={maskMode === 'reveal'} onClick={() => setMaskMode('reveal')} icon={<Paintbrush size={13} />}>Reveal</SegBtn>
                </div>
                <input
                  value={selectPrompt}
                  onChange={e => setSelectPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && selectPrompt.trim() && !selecting) runSmartSelect({ prompt: selectPrompt }); }}
                  placeholder="describe what to select — e.g. the sky"
                  className="w-56 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-primary placeholder:text-secondary/60 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => selectPrompt.trim() && !selecting && runSmartSelect({ prompt: selectPrompt })}
                  disabled={selecting || !selectPrompt.trim()}
                  className="flex items-center gap-1.5 bg-inverse text-inverseText text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">
                  {selecting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Select
                </button>
                <span className="font-mono text-[10px] text-secondary">or click an object</span>
                <span className="w-px h-5 bg-border" />
                <button
                  onClick={() => !busyMsg && !selecting && isolateOnGreyPreset()}
                  disabled={!!busyMsg || selecting}
                  title="Isolate the subject and replace the background with a neutral grey studio fill (SAM 3 + FLUX)"
                  className="flex items-center gap-1.5 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">
                  <Sparkles size={13} /> Isolate → grey BG
                </button>
                {selectMsg && <span className="font-mono text-[10px] text-accent">{selectMsg}</span>}
                <button onClick={() => { setKeyInput(getFalKey()); setKeyModalOpen(true); }}
                  className="flex items-center gap-1 text-[10px] font-mono text-secondary hover:text-primary" title="fal API key">
                  <KeyRound size={12} /> {hasFalKey() ? 'key set' : 'set key'}
                </button>
              </div>
            )}
            {tool === 'mask' && (
              <div className="flex items-center gap-5 animate-fade-in whitespace-nowrap">
                <div className="flex items-center bg-surface rounded-lg p-0.5">
                  <SegBtn active={maskMode === 'hide'} onClick={() => setMaskMode('hide')} icon={<Eraser size={13} />}>Hide</SegBtn>
                  <SegBtn active={maskMode === 'reveal'} onClick={() => setMaskMode('reveal')} icon={<Paintbrush size={13} />}>Reveal</SegBtn>
                </div>
                <Slider label="Size" value={brushSize} min={5} max={600} step={1} onChange={setBrushSize} suffix="px" w={90} />
                <Slider label="Softness" value={Math.round((1 - brushHardness) * 100)} min={0} max={100} step={1}
                  onChange={v => setBrushHardness(1 - v / 100)} suffix="%" w={80} />
                <Slider label="Flow" value={Math.round(brushFlow * 100)} min={5} max={100} step={1}
                  onChange={v => setBrushFlow(v / 100)} suffix="%" w={70} />
                <Slider label="Feather" value={brushFeather} min={0} max={80} step={1}
                  onChange={setBrushFeather} suffix="px" w={80} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 pl-2">
            <div className="flex items-center">
              <button onClick={undo} disabled={histRef.current.length === 0} title="Undo (⌘Z)"
                className="text-secondary hover:text-primary disabled:opacity-30 disabled:hover:text-secondary p-1.5 rounded hover:bg-surface shrink-0">
                <Undo2 size={15} />
              </button>
              <button onClick={redo} disabled={redoRef.current.length === 0} title="Redo (⌘⇧Z)"
                className="text-secondary hover:text-primary disabled:opacity-30 disabled:hover:text-secondary p-1.5 rounded hover:bg-surface shrink-0">
                <Redo2 size={15} />
              </button>
            </div>
            <span className="font-mono text-[10px] text-secondary tabular-nums">{zoomPct}%</span>
            <span className="font-mono text-[10px] text-secondary">{docW}×{docH}</span>
            <button onClick={() => autoLayout()} disabled={!hasLayers}
              className="text-xs text-secondary hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-surface shrink-0 disabled:opacity-30 disabled:hover:text-secondary" title="Fill — tile the artboard, cropping each image to its cell (L)">
              <LayoutGrid size={13} /> Fill
            </button>
            <button onClick={() => stitchLayers()} disabled={!hasLayers}
              className="text-xs text-secondary hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-surface shrink-0 disabled:opacity-30 disabled:hover:text-secondary"
              title={stitchSubset
                ? `Auto Stitch ${selectedIds.size} selected layers into justified rows, in place (⇧L)`
                : 'Auto Stitch — justified rows of whole frames, nothing cropped. Box-select on the artboard to stitch a subset (⇧L)'}>
              <Rows3 size={13} /> Stitch{stitchSubset ? ` ${selectedIds.size}` : ''}
            </button>
            <button onClick={() => { fitView(); drawView(); }}
              className="text-xs text-secondary hover:text-primary flex items-center gap-1 px-2 py-1 rounded hover:bg-surface shrink-0" title="Fit (F)">
              <Maximize size={13} /> Fit
            </button>
            <button onClick={exportImage} disabled={exporting}
              title={`Exports ${exportDims.w}×${exportDims.h} PNG${exportScale > 1.001 ? ` — rendered at ${exportScale.toFixed(2)}× the artboard to recover source detail, up to 4K` : ''}`}
              className="flex items-center gap-2 bg-accent text-white text-xs font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0 whitespace-nowrap">
              <Download size={14} /> {exporting ? 'Exporting…' : `Export ${(() => { const l = Math.max(exportDims.w, exportDims.h) / 1024; return `${l.toFixed(l % 1 < 0.05 ? 0 : 1)}K`; })()}`}
            </button>
          </div>
        </div>

        {/* Stage */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          style={{ background: 'var(--bg-surface)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <canvas
            ref={viewCanvasRef}
            className="absolute inset-0"
            style={{ cursor: (spacePan || tool === 'hand') ? 'grab' : tool === 'move' ? 'move' : (tool === 'eyedropper' || tool === 'select' || tool === 'crop') ? 'crosshair' : 'none', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => { onPointerUp(); if (cursorRef.current) cursorRef.current.style.display = 'none'; }}
            onWheel={onWheel}
          />
          {/* Brush cursor */}
          <div
            ref={cursorRef}
            className="absolute pointer-events-none rounded-full border-2"
            style={{
              display: 'none',
              transform: 'translate(-50%, -50%)',
              borderColor: maskMode === 'hide' ? 'rgba(255,85,46,0.9)' : 'rgba(120,183,145,0.95)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }}
          />

          {!hasLayers && !dragOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
              <div className="w-16 h-16 border-2 border-dashed border-white/40 rounded-2xl flex items-center justify-center">
                <Upload size={24} className="text-white/60" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/70">
                Drop images or import to start compositing
              </p>
            </div>
          )}
          {dragOver && (
            <div className="absolute inset-4 z-20 border-2 border-dashed border-accent bg-accent/5 rounded-2xl flex items-center justify-center pointer-events-none">
              <span className="font-serif text-lg bg-background px-6 py-3 rounded-full border border-accent/30 shadow-elevated">Drop to add layer</span>
            </div>
          )}

          {/* Navigation hint + zoom controls */}
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <span className="font-mono text-[9px] text-secondary/70 tracking-wide">
              Space/Alt-drag or scroll to pan · ⌘-scroll to zoom · ⌘Z undo
            </span>
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-background/80 backdrop-blur border border-border rounded-lg px-1 py-0.5 shadow-sm">
            <button onClick={() => zoomBy(1 / 1.2)} className="w-6 h-6 flex items-center justify-center text-secondary hover:text-primary rounded" title="Zoom out (−)">−</button>
            <button onClick={() => { fitView(); drawView(); }} className="font-mono text-[10px] text-secondary hover:text-primary px-1.5 tabular-nums" title="Fit (F)">{zoomPct}%</button>
            <button onClick={() => zoomBy(1.2)} className="w-6 h-6 flex items-center justify-center text-secondary hover:text-primary rounded" title="Zoom in (+)">+</button>
          </div>

          {/* Project switch overlay — assets and masks are re-decoded on load */}
          {switchingProject && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1px] pointer-events-none">
              <div className="flex items-center gap-3 bg-background border border-border rounded-full px-5 py-3 shadow-elevated">
                <Loader2 size={18} className="animate-spin text-accent" />
                <span className="font-serif text-base text-primary">Opening project…</span>
              </div>
            </div>
          )}

          {/* Smart Select working overlay */}
          {(selecting || busyMsg) && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40 backdrop-blur-[1px] pointer-events-none">
              <div className="flex items-center gap-3 bg-background border border-border rounded-full px-5 py-3 shadow-elevated">
                <Loader2 size={18} className="animate-spin text-accent" />
                <span className="font-serif text-base text-primary">{busyMsg || 'Segmenting with SAM 3…'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Layers panel — drag the left edge to resize */}
      <div
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); panelResizeRef.current = { x: e.clientX, w: panelWRef.current }; }}
        onPointerMove={e => {
          const st = panelResizeRef.current;
          if (!st) return;
          setPanelW(Math.max(PANEL_MIN, Math.min(PANEL_MAX, st.w - (e.clientX - st.x))));
        }}
        onPointerUp={() => {
          if (!panelResizeRef.current) return;
          panelResizeRef.current = null;
          localStorage.setItem(PANEL_W_KEY, String(panelWRef.current));
        }}
        onDoubleClick={() => { setPanelW(PANEL_DEFAULT); localStorage.setItem(PANEL_W_KEY, String(PANEL_DEFAULT)); }}
        title="Drag to resize · double-click to reset"
        className="w-1.5 shrink-0 cursor-col-resize bg-border/40 hover:bg-accent/60 transition-colors"
      />
      <div className="shrink-0 border-l border-border flex flex-col min-h-0" style={{ width: panelW }}>
        <div className="h-14 shrink-0 border-b border-border flex items-center justify-between px-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">Layers</span>
          <button onClick={() => fileInputRef.current?.click()}
            className="text-secondary hover:text-accent transition-colors" title="Import">
            <Upload size={16} />
          </button>
        </div>

        {/* Artboard settings */}
        <div className="border-b border-border shrink-0">
          <SectionHead icon={<Frame size={12} className="text-accent" />} title="Artboard" open={showArtboard}
            onToggle={() => toggleSection('artboard', setShowArtboard)} right={`${docW}×${docH}`} />
        {showArtboard && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {ASPECTS.map(a => (
              <button key={a.label} onClick={() => applyAspect(a.w, a.h)}
                title={a.hint ? `${a.label} — ${a.hint}` : a.label}
                className={`text-[10px] font-mono py-1.5 rounded border transition-colors ${ratioMatches(docW, docH, a.w, a.h) ? 'border-accent text-accent bg-accentDim' : 'border-border text-secondary hover:text-primary hover:border-accent/50'}`}>
                {a.label}
              </button>
            ))}
          </div>

          {/* Custom canvas size */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wide text-secondary">Size</span>
              <button onClick={() => setLockRatio(v => !v)}
                title={lockRatio ? 'Aspect ratio locked — the other edge follows' : 'Aspect ratio free — edges are independent'}
                className={`flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide transition-colors ${lockRatio ? 'text-accent' : 'text-secondary hover:text-primary'}`}>
                {lockRatio ? <Link size={10} /> : <Unlink size={10} />}Lock
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <SizeField value={sizeDraft.w} onChange={v => editSize('w', v)} onCommit={commitSize} onRevert={revertSize} title="Width (px)" />
              <span className="text-[10px] font-mono text-secondary shrink-0">×</span>
              <SizeField value={sizeDraft.h} onChange={v => editSize('h', v)} onCommit={commitSize} onRevert={revertSize} title="Height (px)" />
              <button onClick={commitSize} disabled={!sizeDirty}
                className="shrink-0 text-[10px] font-mono uppercase tracking-wide px-2 py-1.5 rounded border border-border text-secondary hover:text-primary hover:border-accent transition-colors disabled:opacity-30 disabled:hover:text-secondary disabled:hover:border-border">
                Apply
              </button>
            </div>
            <button onClick={() => setScaleWithCanvas(v => !v)}
              title="On: layers rescale with the frame. Off: pixels keep their size and the frame crops or extends around them."
              className="flex items-center gap-2 mt-2 text-[10px] font-mono uppercase tracking-wide text-secondary hover:text-primary transition-colors">
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${scaleWithCanvas ? 'bg-accent border-accent' : 'border-border'}`}>
                {scaleWithCanvas && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
              </span>
              Scale layers with canvas
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wide text-secondary">Background</span>
              {isCustomBg && <span className="text-[10px] font-mono text-primary uppercase tabular-nums">{bgColor}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {BG_SWATCHES.map(sw => {
                const activeSw = bgColor === sw.value;
                return (
                  <button key={sw.label} onClick={() => commitBgColor(sw.value)} title={sw.label}
                    className={`w-7 h-7 rounded-md border-2 transition-all ${activeSw ? 'border-accent scale-105' : 'border-border'}`}
                    style={sw.value
                      ? { background: sw.value }
                      : { backgroundImage: 'linear-gradient(45deg,#888 25%,transparent 25%,transparent 75%,#888 75%),linear-gradient(45deg,#888 25%,#ccc 25%,#ccc 75%,#888 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0,4px 4px' }} />
                );
              })}
              <label className={`ml-auto relative w-7 h-7 rounded-md border-2 overflow-hidden cursor-pointer transition-all ${isCustomBg ? 'border-accent scale-105' : 'border-border'}`}
                title="Custom color (or use the eyedropper)"
                style={{ background: isCustomBg ? (bgColor as string) : undefined }}>
                {!isCustomBg && <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-secondary pointer-events-none">+</span>}
                <input type="color" value={bgColor ?? '#3a3a3c'} onFocus={() => pushHistory()} onChange={e => setBgColor(e.target.value)}
                  className="absolute -inset-2 w-12 h-12 cursor-pointer opacity-0" />
              </label>
            </div>
          </div>
          <button onClick={() => setShowBounds(v => !v)}
            className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wide text-secondary hover:text-primary transition-colors">
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${showBounds ? 'bg-accent border-accent' : 'border-border'}`}>
              {showBounds && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
            </span>
            Show canvas bounds
          </button>
        </div>
        )}
        </div>

        {/* Auto Stitch */}
        <div className="border-b border-border shrink-0">
          <SectionHead icon={<Rows3 size={12} className="text-accent" />} title="Auto Stitch" open={showStitch}
            onToggle={() => toggleSection('stitch', setShowStitch)}
            right={stitchRows.length ? stitchRows.join('·') : undefined} />
          {showStitch && (
          <div className="px-4 pb-4 space-y-3">
            <PropSlider label="Gap" value={stitchGap} min={0} max={STITCH_GAP_MAX} step={0.5} suffix="%"
              onChange={(v: number) => { setStitchGap(v); localStorage.setItem(STITCH_GAP_KEY, String(v)); }} />
            <button onClick={() => { const v = !stitchFitCanvas; setStitchFitCanvas(v); localStorage.setItem(STITCH_FIT_KEY, v ? '1' : '0'); }}
              title="On: the canvas is resized to the stitch, at the highest resolution up to 4K. Off: the stitch is fitted inside the current artboard."
              className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wide text-secondary hover:text-primary transition-colors">
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${stitchFitCanvas ? 'bg-accent border-accent' : 'border-border'}`}>
                {stitchFitCanvas && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
              </span>
              Fit canvas to stitch
            </button>
            <button onClick={() => { const v = !stitchOnImport; setStitchOnImport(v); localStorage.setItem(STITCH_AUTO_KEY, v ? '1' : '0'); }}
              title="Arrange automatically whenever an import leaves more than one layer on the artboard."
              className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wide text-secondary hover:text-primary transition-colors">
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${stitchOnImport ? 'bg-accent border-accent' : 'border-border'}`}>
                {stitchOnImport && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
              </span>
              Stitch on import
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => stitchLayers()} disabled={!hasLayers}
                className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-wide px-2 py-2 rounded border border-border text-secondary hover:text-primary hover:border-accent transition-colors disabled:opacity-30 disabled:hover:text-secondary disabled:hover:border-border">
                <Rows3 size={11} /> {stitchSubset ? `Stitch ${selectedIds.size} selected` : 'Stitch now'}
              </button>
              <button onClick={() => autoLayout(stitchGap)} disabled={!hasLayers}
                title="Fill the artboard instead — cells are cropped to cover"
                className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-wide px-2 py-2 rounded border border-border text-secondary hover:text-primary hover:border-accent transition-colors disabled:opacity-30 disabled:hover:text-secondary disabled:hover:border-border">
                <LayoutGrid size={11} /> Fill
              </button>
            </div>
            <p className="text-[9px] font-mono text-secondary/70 leading-relaxed">
              Justified rows, whole frames, nothing cropped. Row split follows the artboard aspect. Max 4K.
              {' '}Box-select on the artboard (move tool) to stitch only those layers, in place.
            </p>
          </div>
          )}
        </div>

        {/* Active layer properties */}
        {active && (
          <div className="border-b border-border shrink-0">
          <SectionHead icon={<Move size={12} className="text-accent" />} title="Properties" open={showProps}
            onToggle={() => toggleSection('props', setShowProps)} right={active.name} />
          {showProps && (
          <div className="px-4 pb-4 space-y-4">
            <PropSlider label="Opacity" value={Math.round(active.opacity * 100)} min={0} max={100} suffix="%"
              onStart={pushHistory}
              onChange={v => patchLayer(active.id, { opacity: v / 100 })} />
            <PropSlider label="Scale" value={Math.round(active.scale * 100)} min={1} max={400} suffix="%"
              onStart={pushHistory}
              onChange={v => {
                // Scale about the layer center to keep it anchored.
                const img = imagesRef.current.get(active.id)!;
                const oldW = img.naturalWidth * active.scale, oldH = img.naturalHeight * active.scale;
                const newScale = v / 100;
                const newW = img.naturalWidth * newScale, newH = img.naturalHeight * newScale;
                patchLayer(active.id, { scale: newScale, x: active.x + (oldW - newW) / 2, y: active.y + (oldH - newH) / 2 });
              }} />
            <PropSlider label="Rotate" value={Math.round(active.rotation)} min={-180} max={180} suffix="°"
              icon={<RotateCw size={12} className="text-secondary" />}
              onStart={pushHistory}
              onChange={v => patchLayer(active.id, { rotation: v })} />

            <div className="flex flex-wrap gap-2 pt-1">
              <MiniBtn onClick={() => resetTransform(active.id)}>Fit</MiniBtn>
              <MiniBtn onClick={() => fillDoc(active.id)}>Fill</MiniBtn>
              <MiniBtn onClick={() => invertMask(active.id)}>Invert mask</MiniBtn>
              <MiniBtn onClick={() => clearMask(active.id)}>Reset mask</MiniBtn>
            </div>
          </div>
          )}
          </div>
        )}

        {/* Layer list (top layer first) — drag rows to restack */}
        <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-border text-secondary">
          <LayersIcon size={12} className="text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-widest">Stack</span>
          <span className="ml-auto font-mono text-[9px] text-secondary/70">
            {layers.length ? 'drag to restack' : ''}
          </span>
        </div>
        <div
          className="flex-1 min-h-[80px] overflow-y-auto"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (dragLayerId && dropHint) reorderLayer(dragLayerId, dropHint.id, dropHint.before);
            setDragLayerId(null); setDropHint(null);
          }}
        >
          {[...layers].reverse().map((layer, i) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              index={i}
              img={imagesRef.current.get(layer.id)}
              active={layer.id === activeId}
              selected={selectedIds.has(layer.id)}
              renaming={renamingLayerId === layer.id}
              dragging={dragLayerId === layer.id}
              hint={dropHint?.id === layer.id ? (dropHint.before ? 'before' : 'after') : null}
              onSelect={(e: React.MouseEvent) => {
                setActiveId(layer.id);
                const additive = e?.shiftKey || e?.metaKey || e?.ctrlKey;
                setSelectedIds(prev => {
                  if (!additive) return new Set([layer.id]);
                  const next = new Set(prev);
                  if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id);
                  return next;
                });
              }}
              onToggle={() => patchLayer(layer.id, { visible: !layer.visible })}
              onUp={() => moveLayer(layer.id, 1)}
              onDown={() => moveLayer(layer.id, -1)}
              onDelete={() => removeLayer(layer.id)}
              onRenameStart={() => setRenamingLayerId(layer.id)}
              onRenameCommit={(v: string) => { renameLayer(layer.id, v); setRenamingLayerId(null); }}
              onRenameCancel={() => setRenamingLayerId(null)}
              onDragStart={() => setDragLayerId(layer.id)}
              onDragOverRow={(before: boolean) => {
                if (!dragLayerId || dragLayerId === layer.id) return;
                setDropHint(prev => (prev?.id === layer.id && prev.before === before ? prev : { id: layer.id, before }));
              }}
              onDragEnd={() => { setDragLayerId(null); setDropHint(null); }}
              onDropRow={() => {
                if (dragLayerId && dropHint) reorderLayer(dragLayerId, dropHint.id, dropHint.before);
                setDragLayerId(null); setDropHint(null);
              }}
            />
          ))}
          {layers.length === 0 && (
            <div className="p-6 text-center text-secondary text-xs font-mono">No layers yet</div>
          )}
        </div>

        {/* Shared project assets — reusable across every tab in this project */}
        {assets.length > 0 && (
          <div className="shrink-0 border-t border-border">
            <SectionHead icon={<ImagePlus size={12} className="text-accent" />} title="Project Assets" open={showAssets}
              onToggle={() => toggleSection('assets', setShowAssets)} right={String(assets.length)} />
            {showAssets && (
              <div className="flex flex-wrap gap-1.5 px-3 pb-3 max-h-28 overflow-y-auto">
                {assets.map(a => (
                  <button key={a.id} onClick={() => addLayerFromAsset(a.id)}
                    title={`Add "${a.name}" to this tab`}
                    className="relative w-11 h-11 rounded border border-border overflow-hidden hover:border-accent group">
                    <AssetThumb img={assetsRef.current.get(a.id)?.img} />
                    <span className="absolute inset-0 flex items-center justify-center bg-accent/70 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={16} className="text-white" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* fal API key modal */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setKeyModalOpen(false)}>
          <div className="bg-background border border-border rounded-2xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-accent" />
                <h3 className="font-serif text-xl text-primary">Connect fal</h3>
              </div>
              <button onClick={() => setKeyModalOpen(false)} className="text-secondary hover:text-primary"><X size={18} /></button>
            </div>
            <p className="text-xs text-secondary leading-relaxed mb-4">
              Smart Select runs Meta SAM 3 on fal (~$0.005 per select). Paste your fal API key — it's stored only in this browser and sent directly to fal.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="fal API key (key_...)"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder:text-secondary/60 focus:outline-none focus:border-accent mb-4"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-[11px] font-mono text-secondary hover:text-accent">get a key ↗</a>
              <div className="flex gap-2">
                {hasFalKey() && (
                  <button onClick={() => { setFalKey(''); setKeyInput(''); }}
                    className="text-xs px-3 py-2 rounded-lg border border-border text-secondary hover:text-primary">Clear</button>
                )}
                <button onClick={() => { setFalKey(keyInput); setKeyModalOpen(false); setSelectMsg(null); }}
                  disabled={!keyInput.trim()}
                  className="text-xs px-4 py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-40">Save key</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Small UI pieces ---
const ToolBtn = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} title={label}
    className={`group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${active ? 'bg-accentDim text-accent' : 'text-secondary hover:text-primary hover:bg-surface'}`}>
    {icon}
    <span className="absolute left-12 px-2 py-1 bg-inverse text-inverseText text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-lg">{label}</span>
  </button>
);

const SegBtn = ({ active, onClick, icon, children }: any) => (
  <button onClick={onClick}
    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${active ? 'bg-background text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}>
    {icon}{children}
  </button>
);

const Slider = ({ label, value, min, max, step = 1, onChange, suffix = '', w = 90 }: any) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-mono uppercase tracking-wide text-secondary">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="accent-accent" style={{ width: w }} />
    <span className="text-[10px] font-mono text-primary w-10 tabular-nums">{value}{suffix}</span>
  </div>
);

const PropSlider = ({ label, value, min, max, step = 1, onChange, onStart, suffix = '', icon }: any) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-mono uppercase tracking-wide text-secondary flex items-center gap-1">{icon}{label}</span>
      <span className="text-[10px] font-mono text-primary tabular-nums">{value}{suffix}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onPointerDown={onStart}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full accent-accent" />
  </div>
);

/** Numeric canvas-dimension field. Enter applies, Escape reverts to the doc. */
const SizeField = ({ value, onChange, onCommit, onRevert, title }: any) => (
  <input
    type="text" inputMode="numeric" value={value} title={title} aria-label={title}
    onChange={e => onChange(e.target.value)}
    onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); onCommit(); }
      if (e.key === 'Escape') { onRevert(); (e.target as HTMLInputElement).blur(); }
    }}
    className="min-w-0 flex-1 bg-surface border border-border rounded px-2 py-1.5 text-[10px] font-mono text-primary tabular-nums text-center focus:outline-none focus:border-accent"
  />
);

const AssetThumb = ({ img }: { img?: HTMLImageElement }) => (
  <span className="block w-full h-full bg-black/20">
    {img && <img src={img.src} alt="" className="w-full h-full object-cover" draggable={false} />}
  </span>
);

const MiniBtn = ({ children, onClick }: any) => (
  <button onClick={onClick}
    className="text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded border border-border text-secondary hover:text-primary hover:border-accent transition-colors">
    {children}
  </button>
);

/** Collapsible panel section header. Collapsing frees height for the layer list. */
const SectionHead = ({ icon, title, open, onToggle, right }: any) => (
  <button onClick={onToggle}
    className="w-full flex items-center gap-1.5 px-4 py-2.5 text-secondary hover:text-primary transition-colors">
    {open ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
    {icon}
    <span className="font-mono text-[10px] uppercase tracking-widest">{title}</span>
    {right && <span className="ml-auto font-mono text-[10px] text-primary tabular-nums truncate max-w-[45%]">{right}</span>}
  </button>
);

const LayerRow = ({
  layer, img, index, active, selected, renaming, dragging, hint,
  onSelect, onToggle, onUp, onDown, onDelete,
  onRenameStart, onRenameCommit, onRenameCancel,
  onDragStart, onDragOverRow, onDragEnd, onDropRow,
}: any) => {
  const thumbRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = thumbRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = Math.min(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }, [img]);
  return (
    <div
      onClick={onSelect}
      draggable={!renaming}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', layer.id); onDragStart(); }}
      onDragOver={e => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragOverRow(e.clientY < r.top + r.height / 2);
      }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropRow(); }}
      className={`relative flex items-center gap-2 pl-1.5 pr-3 py-2.5 cursor-pointer border-l-2 transition-colors ${active ? 'border-accent bg-accentDim/40' : selected ? 'border-accent/60 bg-accentDim/20' : 'border-transparent hover:bg-surface'} ${dragging ? 'opacity-40' : ''}`}>
      {hint === 'before' && <span className="absolute left-0 right-0 -top-px h-0.5 bg-accent pointer-events-none" />}
      {hint === 'after' && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent pointer-events-none" />}
      <GripVertical size={13} className="text-secondary/40 shrink-0 cursor-grab" />
      <button onClick={e => { e.stopPropagation(); onToggle(); }} className="text-secondary hover:text-primary shrink-0">
        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <canvas ref={thumbRef} width={40} height={40}
        className="w-10 h-10 rounded bg-black/20 shrink-0 border border-border" />
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            autoFocus
            defaultValue={layer.name}
            onClick={e => e.stopPropagation()}
            onBlur={e => onRenameCommit(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') onRenameCommit((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') onRenameCancel();
            }}
            className="w-full bg-surface border border-accent rounded px-1 py-0.5 text-xs text-primary focus:outline-none"
          />
        ) : (
          <div onDoubleClick={e => { e.stopPropagation(); onRenameStart(); }}
            title={`${layer.name} — double-click to rename`}
            className={`text-xs truncate ${layer.visible ? 'text-primary' : 'text-secondary'}`}>
            {layer.name}
          </div>
        )}
        <div className="text-[9px] font-mono text-secondary tabular-nums">
          {index + 1} · {Math.round(layer.opacity * 100)}%
        </div>
      </div>
      <div className="flex flex-col shrink-0">
        <button onClick={e => { e.stopPropagation(); onUp(); }} title="Move up" className="text-secondary hover:text-primary"><ArrowUp size={12} /></button>
        <button onClick={e => { e.stopPropagation(); onDown(); }} title="Move down" className="text-secondary hover:text-primary"><ArrowDown size={12} /></button>
      </div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete layer" className="text-secondary hover:text-accent shrink-0"><Trash2 size={14} /></button>
    </div>
  );
};

export default LayerStudioView;

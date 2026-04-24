import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload, Download, Trash2, Settings2, Plus, X, Edit2, MoreVertical,
  Layers, Sparkles, Hand, CheckSquare, Square, MousePointer2, Keyboard,
  ZoomIn, ZoomOut, Maximize2, Check, Eye, LayoutGrid,
} from 'lucide-react';
import { Thread, StoredImage, CanvasItem, StitchSettings, SmartStitchImage } from '../types';
import {
  generateSmartStitch, generateManualStitch, loadImage, computeJustifiedLayout,
} from '../utils/imageUtils';
import {
  listThreads, saveThread, deleteThread, createThread,
  listImagesByThread, addImage, deleteImage, DEFAULT_SETTINGS,
} from '../utils/imageStore';

const THUMB_HEIGHT = 180;
const MIN_ITEM_SIZE = 30;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

type Snapshot = Map<string, { x: number; y: number; width: number; height: number }>;

export default function SmartStitchView() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [settings, setSettings] = useState<StitchSettings>(DEFAULT_SETTINGS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [draggedLibraryImage, setDraggedLibraryImage] = useState<StoredImage | null>(null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [autoPreview, setAutoPreview] = useState<{ originals: Snapshot; autoDownload?: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [previewImage, setPreviewImage] = useState<StoredImage | null>(null);
  const [librarySelection, setLibrarySelection] = useState<Set<string>>(new Set());
  const historyRef = useRef<{ canvasItems: CanvasItem[]; images: StoredImage[] }[]>([]);
  const canvasItemsRef = useRef(canvasItems);
  const imagesRef = useRef(images);

  const [libraryWidth, setLibraryWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 260;
    const saved = Number(localStorage.getItem('stitch-library-width'));
    return saved >= 200 && saved <= 600 ? saved : 260;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const spaceRef = useRef(false);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { spaceRef.current = isSpaceDown; }, [isSpaceDown]);
  useEffect(() => { canvasItemsRef.current = canvasItems; }, [canvasItems]);
  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { localStorage.setItem('stitch-library-width', String(libraryWidth)); }, [libraryWidth]);

  const pushHistory = () => {
    historyRef.current.push({ canvasItems: canvasItemsRef.current, images: imagesRef.current });
    if (historyRef.current.length > 50) historyRef.current.shift();
  };

  const undo = async () => {
    const snap = historyRef.current.pop();
    if (!snap) return;
    // Reconcile library IDB: re-add any images that were deleted, remove any that were added.
    const prevIds = new Set(snap.images.map(i => i.id));
    const curIds = new Set(imagesRef.current.map(i => i.id));
    const toReAdd = snap.images.filter(i => !curIds.has(i.id));
    const toRemove = imagesRef.current.filter(i => !prevIds.has(i.id));
    await Promise.all([
      ...toReAdd.map(i => addImage(i)),
      ...toRemove.map(i => deleteImage(i.id)),
    ]);
    setImages(snap.images);
    setCanvasItems(snap.canvasItems);
    setAutoPreview(null);
    setSelectedIds(new Set());
  };

  const handleLibraryResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = libraryWidth;
    const onMove = (ev: PointerEvent) => {
      const next = clamp(startW + (ev.clientX - startX), 200, 600);
      setLibraryWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Load threads on mount ---
  useEffect(() => {
    (async () => {
      const all = await listThreads();
      if (all.length === 0) {
        const t = createThread('Untitled');
        await saveThread(t);
        setThreads([t]);
        setActiveThreadId(t.id);
      } else {
        setThreads(all);
        setActiveThreadId(all[0].id);
      }
    })();
  }, []);

  // --- Load thread contents when active changes ---
  useEffect(() => {
    if (!activeThreadId) return;
    const thread = threads.find(t => t.id === activeThreadId);
    if (!thread) return;
    setCanvasItems(thread.canvasItems);
    setSettings(thread.settings);
    setSelectedIds(new Set());
    setAutoPreview(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLibrarySelection(new Set());
    historyRef.current = [];
    (async () => {
      const imgs = await listImagesByThread(activeThreadId);
      setImages(imgs);
    })();
  }, [activeThreadId]);

  // --- Persist (debounced, skip no-op via ref identity) ---
  useEffect(() => {
    if (!activeThreadId || autoPreview) return; // don't persist preview state
    const thread = threads.find(t => t.id === activeThreadId);
    if (!thread) return;
    if (thread.canvasItems === canvasItems && thread.settings === settings) return;
    const id = setTimeout(() => {
      const updated: Thread = { ...thread, canvasItems, settings, updatedAt: Date.now() };
      saveThread(updated);
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t));
    }, 500);
    return () => clearTimeout(id);
  }, [canvasItems, settings, activeThreadId, threads, autoPreview]);

  // --- Close thread menu on outside click ---
  useEffect(() => {
    const handler = () => setThreadMenuId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  // --- Space key for pan mode ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setIsSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // --- Wheel: ctrl/cmd = zoom around cursor, else pan ---
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.002);
        const oldZoom = zoomRef.current;
        const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
        const p = panRef.current;
        const wx = (mx - p.x) / oldZoom;
        const wy = (my - p.y) / oldZoom;
        setZoom(newZoom);
        setPan({ x: mx - wx * newZoom, y: my - wy * newZoom });
      } else {
        setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // --- Auto-preview layout effect ---
  useEffect(() => {
    if (!autoPreview) return;
    const ids = [...autoPreview.originals.keys()];
    if (ids.length === 0) return;

    // Intrinsic aspect from each item's current true aspect: prefer image src size, else item size
    const itemsForLayout = ids.map(id => {
      const ci = canvasItems.find(c => c.id === id);
      if (!ci) return { id, width: 100, height: 100 };
      if (ci.type === 'stitch') return { id, width: ci.width, height: ci.height };
      const img = images.find(i => i.id === ci.imageId);
      return { id, width: img?.width ?? ci.width, height: img?.height ?? ci.height };
    });

    const xs = ids.map(id => autoPreview.originals.get(id)!.x);
    const ys = ids.map(id => autoPreview.originals.get(id)!.y);
    const originX = Math.min(...xs);
    const originY = Math.min(...ys);

    const laid = computeJustifiedLayout(itemsForLayout, settings);
    const byId = new Map(laid.map(l => [l.id, l]));

    setCanvasItems(prev => prev.map(ci => {
      const l = byId.get(ci.id);
      return l ? { ...ci, x: l.x + originX, y: l.y + originY, width: l.width, height: l.height } : ci;
    }));
    // Intentionally not listing canvasItems in deps to avoid feedback loop (we write it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPreview, settings, images]);

  // --- Resolve dataUrl for any canvas item ---
  const resolveDataUrl = (ci: CanvasItem): string | null => {
    if (ci.type === 'stitch') return ci.dataUrl || null;
    const img = images.find(i => i.id === ci.imageId);
    return img?.dataUrl || null;
  };

  // --- Stitch (manual layout or approve auto preview) ---
  const runManualStitchOnIds = async (ids: string[]): Promise<CanvasItem | null> => {
    const target = canvasItems.filter(i => ids.includes(i.id));
    if (target.length === 0) return null;
    const payload: { dataUrl: string; x: number; y: number; width: number; height: number }[] = [];
    for (const ci of target) {
      const dataUrl = resolveDataUrl(ci);
      if (!dataUrl) continue;
      payload.push({ dataUrl, x: ci.x, y: ci.y, width: ci.width, height: ci.height });
    }
    const url = await generateManualStitch(payload, settings.backgroundColor);
    if (!url) return null;
    const stitchedImg = await loadImage(url);
    const minX = Math.min(...target.map(i => i.x));
    const maxY = Math.max(...target.map(i => i.y + i.height));
    const aspect = stitchedImg.width / stitchedImg.height;
    const displayWidth = Math.min(400, stitchedImg.width);
    const displayHeight = displayWidth / aspect;
    return {
      id: crypto.randomUUID(),
      type: 'stitch',
      dataUrl: url,
      stitchMode: autoPreview ? 'auto' : 'manual',
      x: minX,
      y: maxY + 30,
      width: displayWidth,
      height: displayHeight,
    };
  };

  const handleManualStitch = async () => {
    if (canvasItems.length === 0) return;
    pushHistory();
    const ids = selectedIds.size > 0 ? [...selectedIds] : canvasItems.map(i => i.id);
    setIsStitching(true);
    try {
      const newItem = await runManualStitchOnIds(ids);
      if (newItem) {
        setCanvasItems(prev => [...prev, newItem]);
        setSelectedIds(new Set([newItem.id]));
      }
    } finally {
      setIsStitching(false);
    }
  };

  // --- Auto preview controls ---
  const enterAutoPreview = () => {
    if (selectedIds.size === 0) return;
    const snap: Snapshot = new Map();
    canvasItems.forEach(i => {
      if (selectedIds.has(i.id)) snap.set(i.id, { x: i.x, y: i.y, width: i.width, height: i.height });
    });
    setAutoPreview({ originals: snap });
  };

  const cancelAutoPreview = () => {
    if (!autoPreview) return;
    setCanvasItems(prev => prev.map(ci => {
      const o = autoPreview.originals.get(ci.id);
      return o ? { ...ci, ...o } : ci;
    }));
    setAutoPreview(null);
  };

  const approveAutoPreview = async () => {
    if (!autoPreview) return;
    pushHistory();
    setIsStitching(true);
    try {
      const ids = [...autoPreview.originals.keys()];
      const newItem = await runManualStitchOnIds(ids);
      // Restore originals
      setCanvasItems(prev => {
        const restored = prev.map(ci => {
          const o = autoPreview.originals.get(ci.id);
          return o ? { ...ci, ...o } : ci;
        });
        return newItem ? [...restored, newItem] : restored;
      });
      if (newItem) {
        setSelectedIds(new Set([newItem.id]));
        if (autoPreview.autoDownload) handleDownloadStitch(newItem);
      }
      setAutoPreview(null);
    } finally {
      setIsStitching(false);
    }
  };

  // --- Hotkeys ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        if (previewImage) setPreviewImage(null);
        else if (autoPreview) cancelAutoPreview();
        else setSelectedIds(new Set());
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (!autoPreview) undo();
        return;
      }
      if (autoPreview && e.key === 'Enter') { e.preventDefault(); approveAutoPreview(); return; }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        pushHistory();
        setCanvasItems(prev => prev.filter(i => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
        return;
      }
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelectedIds(new Set(canvasItems.map(i => i.id)));
        return;
      }
      if (mod && (e.key === 'd' || e.key === 'D') && selectedIds.size > 0) {
        e.preventDefault();
        pushHistory();
        const newIds = new Set<string>();
        setCanvasItems(prev => {
          const dups = prev
            .filter(i => selectedIds.has(i.id))
            .map(i => { const id = crypto.randomUUID(); newIds.add(id); return { ...i, id, x: i.x + 20, y: i.y + 20 }; });
          return [...prev, ...dups];
        });
        setSelectedIds(newIds);
        return;
      }
      if (mod && e.key === 'Enter') { e.preventDefault(); handleManualStitch(); return; }
      if (mod && (e.key === '0')) { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); return; }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); return; }
      if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); return; }
      if (e.key.startsWith('Arrow') && selectedIds.size > 0) {
        e.preventDefault();
        pushHistory();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setCanvasItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, canvasItems, autoPreview, settings, images, previewImage]);

  // --- Zoom helpers ---
  const zoomBy = (factor: number) => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = rect.width / 2, my = rect.height / 2;
    const oldZoom = zoomRef.current;
    const newZoom = clamp(oldZoom * factor, MIN_ZOOM, MAX_ZOOM);
    const p = panRef.current;
    const wx = (mx - p.x) / oldZoom;
    const wy = (my - p.y) / oldZoom;
    setZoom(newZoom);
    setPan({ x: mx - wx * newZoom, y: my - wy * newZoom });
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // --- Thread actions ---
  const handleNewThread = async () => {
    const t = createThread(`Thread ${threads.length + 1}`);
    await saveThread(t);
    setThreads(prev => [t, ...prev]);
    setActiveThreadId(t.id);
  };
  const handleDeleteThread = async (id: string) => {
    if (threads.length === 1) { alert('Cannot delete the only thread.'); return; }
    if (!confirm('Delete this thread and all its images?')) return;
    await deleteThread(id);
    const remaining = threads.filter(t => t.id !== id);
    setThreads(remaining);
    if (activeThreadId === id) setActiveThreadId(remaining[0]?.id ?? null);
  };
  const handleRenameThread = async (id: string, name: string) => {
    const trimmed = name.trim();
    setRenamingThreadId(null);
    if (!trimmed) return;
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    const updated = { ...thread, name: trimmed, updatedAt: Date.now() };
    await saveThread(updated);
    setThreads(prev => prev.map(t => t.id === id ? updated : t));
  };

  // --- Library ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !activeThreadId) return;
    const files = Array.from(e.target.files);
    pushHistory();
    const loaded = await Promise.all(files.map(readFileAsStoredImage(activeThreadId)));
    await Promise.all(loaded.map(addImage));
    setImages(prev => [...prev, ...loaded]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const handleDeleteImage = async (id: string) => {
    pushHistory();
    await deleteImage(id);
    setImages(prev => prev.filter(i => i.id !== id));
    setCanvasItems(prev => prev.filter(i => i.imageId !== id));
  };

  // --- Viewport → world coord ---
  const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    if (!viewportRef.current) return { x: 0, y: 0 };
    const r = viewportRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - pan.x) / zoom,
      y: (clientY - r.top - pan.y) / zoom,
    };
  };

  // --- Canvas drop (native files or library image) ---
  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files && e.dataTransfer.files.length > 0
      ? (Array.from(e.dataTransfer.files) as File[]).filter((f) => f.type.startsWith('image/'))
      : [];
    if (files.length > 0 && activeThreadId) {
      pushHistory();
      const drop = toWorld(e.clientX, e.clientY);
      const loaded = await Promise.all(files.map(readFileAsStoredImage(activeThreadId)));
      await Promise.all(loaded.map(addImage));
      setImages(prev => [...prev, ...loaded]);
      const newItems: CanvasItem[] = loaded.map((img, i) => {
        const aspect = img.width / img.height;
        const h = THUMB_HEIGHT, w = h * aspect;
        return {
          id: crypto.randomUUID(), type: 'image', imageId: img.id,
          x: drop.x - w / 2 + i * 16, y: drop.y - h / 2 + i * 16,
          width: w, height: h,
        };
      });
      setCanvasItems(prev => [...prev, ...newItems]);
      setSelectedIds(new Set(newItems.map(i => i.id)));
      return;
    }
    if (!draggedLibraryImage) return;
    const { x, y } = toWorld(e.clientX, e.clientY);
    addCanvasItemFromImage(draggedLibraryImage, x, y);
    setDraggedLibraryImage(null);
  };

  // --- Drop overlay (dropping anywhere in the view adds to library) ---
  const [isDroppingFile, setIsDroppingFile] = useState(false);
  const dropCounterRef = useRef(0);
  const handleRootDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dropCounterRef.current += 1;
    setIsDroppingFile(true);
  };
  const handleRootDragLeave = () => {
    dropCounterRef.current = Math.max(0, dropCounterRef.current - 1);
    if (dropCounterRef.current === 0) setIsDroppingFile(false);
  };
  const handleRootDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropCounterRef.current = 0;
    setIsDroppingFile(false);
    // If drop landed outside the canvas viewport, add to library only.
    const files = e.dataTransfer.files && e.dataTransfer.files.length > 0
      ? (Array.from(e.dataTransfer.files) as File[]).filter((f) => f.type.startsWith('image/'))
      : [];
    if (files.length === 0 || !activeThreadId) return;
    pushHistory();
    const loaded = await Promise.all(files.map(readFileAsStoredImage(activeThreadId)));
    await Promise.all(loaded.map(addImage));
    setImages(prev => [...prev, ...loaded]);
  };
  const handleAddAllToCanvas = () => {
    if (images.length === 0 || !viewportRef.current) return;
    pushHistory();
    const r = viewportRef.current.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const itemsForLayout = images.map(i => ({ id: i.id, width: i.width, height: i.height }));
    const laid = computeJustifiedLayout(itemsForLayout, settings);
    if (laid.length === 0) return;
    const maxX = Math.max(...laid.map(l => l.x + l.width));
    const maxY = Math.max(...laid.map(l => l.y + l.height));
    const offsetX = center.x - maxX / 2;
    const offsetY = center.y - maxY / 2;
    const newItems: CanvasItem[] = laid.map(l => ({
      id: crypto.randomUUID(), type: 'image', imageId: l.id,
      x: l.x + offsetX, y: l.y + offsetY, width: l.width, height: l.height,
    }));
    setCanvasItems(prev => [...prev, ...newItems]);
    setSelectedIds(new Set(newItems.map(i => i.id)));
  };

  const handleLibraryAutoStitch = () => {
    if (librarySelection.size === 0 || !viewportRef.current) return;
    const selectedImgs = images.filter(i => librarySelection.has(i.id));
    if (selectedImgs.length === 0) return;
    pushHistory();
    const r = viewportRef.current.getBoundingClientRect();
    const center = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const itemsForLayout = selectedImgs.map(i => ({ id: i.id, width: i.width, height: i.height }));
    const laid = computeJustifiedLayout(itemsForLayout, settings);
    const maxX = Math.max(...laid.map(l => l.x + l.width));
    const maxY = Math.max(...laid.map(l => l.y + l.height));
    const offsetX = center.x - maxX / 2;
    const offsetY = center.y - maxY / 2;
    const newItems: CanvasItem[] = laid.map(l => ({
      id: crypto.randomUUID(), type: 'image', imageId: l.id,
      x: l.x + offsetX, y: l.y + offsetY, width: l.width, height: l.height,
    }));
    setCanvasItems(prev => [...prev, ...newItems]);
    const newIds = new Set(newItems.map(i => i.id));
    setSelectedIds(newIds);
    const snap: Snapshot = new Map();
    newItems.forEach(i => snap.set(i.id, { x: i.x, y: i.y, width: i.width, height: i.height }));
    setAutoPreview({ originals: snap, autoDownload: true });
    setLibrarySelection(new Set());
  };

  const toggleLibrarySelection = (id: string) => {
    setLibrarySelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addCanvasItemFromImage = (img: StoredImage, cx: number, cy: number) => {
    pushHistory();
    const aspect = img.width / img.height;
    const height = THUMB_HEIGHT;
    const width = height * aspect;
    const item: CanvasItem = {
      id: crypto.randomUUID(), type: 'image', imageId: img.id,
      x: cx - width / 2, y: cy - height / 2, width, height,
    };
    setCanvasItems(prev => [...prev, item]);
    setSelectedIds(new Set([item.id]));
  };

  // --- Viewport pointer down: pan (space/middle) or marquee (on empty) ---
  const handleViewportPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const onSurface = !!target.dataset.canvasSurface;
    // During auto-preview, empty-canvas left-drag pans instead of marquee-selecting.
    const isPan = spaceRef.current || e.button === 1 || (autoPreview && onSurface && e.button === 0);
    if (isPan) {
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const startPan = { ...panRef.current };
      const onMove = (ev: PointerEvent) => {
        setPan({ x: startPan.x + (ev.clientX - startX), y: startPan.y + (ev.clientY - startY) });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    // Marquee — only if target is viewport or world itself (not an item)
    if (!onSurface) return;
    if (e.button !== 0) return;
    if (autoPreview) return; // no selection change during preview

    const start = toWorld(e.clientX, e.clientY);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const base = additive ? new Set(selectedIds) : new Set<string>();
    setSelectedIds(base);
    setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });

    const onMove = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      setMarquee({ x1: start.x, y1: start.y, x2: w.x, y2: w.y });
      const minX = Math.min(start.x, w.x), maxX = Math.max(start.x, w.x);
      const minY = Math.min(start.y, w.y), maxY = Math.max(start.y, w.y);
      const hit = new Set(base);
      canvasItems.forEach(i => {
        if (i.x + i.width > minX && i.x < maxX && i.y + i.height > minY && i.y < maxY) hit.add(i.id);
      });
      setSelectedIds(hit);
    };
    const onUp = () => {
      setMarquee(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Item move ---
  const handleItemPointerDown = (e: React.PointerEvent, item: CanvasItem) => {
    if (spaceRef.current || e.button === 1) return; // let viewport handle pan
    if (autoPreview) { e.stopPropagation(); return; } // lock during preview
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    let movingIds: Set<string>;
    if (!selectedIds.has(item.id)) {
      const next = multi ? new Set([...selectedIds, item.id]) : new Set([item.id]);
      setSelectedIds(next); movingIds = next;
    } else if (multi) {
      const next = new Set(selectedIds); next.delete(item.id); setSelectedIds(next); return;
    } else {
      movingIds = selectedIds;
    }

    const startX = e.clientX, startY = e.clientY;
    const startZoom = zoomRef.current;
    const origin = new Map<string, { x: number; y: number }>();
    canvasItems.forEach(i => { if (movingIds.has(i.id)) origin.set(i.id, { x: i.x, y: i.y }); });
    let didSnapshot = false;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / startZoom;
      const dy = (ev.clientY - startY) / startZoom;
      if (!didSnapshot && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) { pushHistory(); didSnapshot = true; }
      setCanvasItems(prev => prev.map(i => {
        const o = origin.get(i.id);
        return o ? { ...i, x: o.x + dx, y: o.y + dy } : i;
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- Resize ---
  const handleResizePointerDown = (e: React.PointerEvent, item: CanvasItem, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    if (autoPreview) { e.stopPropagation(); return; }
    e.stopPropagation();
    setSelectedIds(new Set([item.id]));
    const startX = e.clientX, startY = e.clientY;
    const startZoom = zoomRef.current;
    const orig = { x: item.x, y: item.y, w: item.width, h: item.height };
    const aspect = orig.w / orig.h;
    let didSnapshot = false;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / startZoom;
      const dy = (ev.clientY - startY) / startZoom;
      if (!didSnapshot && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) { pushHistory(); didSnapshot = true; }
      const free = ev.shiftKey;
      let newW = orig.w, newH = orig.h, newX = orig.x, newY = orig.y;
      if (corner === 'br') { newW = orig.w + dx; newH = free ? orig.h + dy : newW / aspect; }
      else if (corner === 'bl') { newW = orig.w - dx; newH = free ? orig.h + dy : newW / aspect; newX = orig.x + (orig.w - newW); }
      else if (corner === 'tr') { newW = orig.w + dx; newH = free ? orig.h - dy : newW / aspect; newY = orig.y + (orig.h - newH); }
      else { newW = orig.w - dx; newH = free ? orig.h - dy : newW / aspect; newX = orig.x + (orig.w - newW); newY = orig.y + (orig.h - newH); }
      if (newW < MIN_ITEM_SIZE || newH < MIN_ITEM_SIZE) return;
      setCanvasItems(prev => prev.map(i => i.id === item.id ? { ...i, x: newX, y: newY, width: newW, height: newH } : i));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === canvasItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(canvasItems.map(i => i.id)));
  };

  const handleDownloadStitch = (item: CanvasItem) => {
    if (!item.dataUrl) return;
    const a = document.createElement('a');
    a.href = item.dataUrl;
    const threadName = threads.find(t => t.id === activeThreadId)?.name || 'stitch';
    a.download = `${threadName.toLowerCase().replace(/\s+/g, '-')}-${item.stitchMode}-${Date.now()}.png`;
    a.click();
  };

  // --- Derived ---
  const imageMap = useMemo(() => {
    const m = new Map<string, StoredImage>();
    images.forEach(i => m.set(i.id, i));
    return m;
  }, [images]);

  const activeThread = threads.find(t => t.id === activeThreadId);
  const modMeta = isMac() ? '⌘' : 'Ctrl';
  const panCursor = isSpaceDown ? 'grab' : 'default';

  return (
    <div className="w-full h-full flex flex-col animate-fade-in relative z-10"
      onDragEnter={handleRootDragEnter}
      onDragLeave={handleRootDragLeave}
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}>
      {isDroppingFile && (
        <div className="absolute inset-4 z-50 border-2 border-dashed border-accent bg-accent/5 rounded-3xl flex items-center justify-center backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-background px-8 py-4 rounded-full shadow-elevated border border-accent/20 flex items-center gap-3">
            <Upload className="text-accent animate-bounce" size={24} />
            <span className="font-serif text-xl text-primary">Drop to add to library</span>
          </div>
        </div>
      )}

      {/* --- Thread Bar --- */}
      <div className="h-12 flex-shrink-0 flex items-stretch border-b border-border bg-background overflow-x-auto">
        {threads.map(t => {
          const isActive = t.id === activeThreadId;
          const isRenaming = renamingThreadId === t.id;
          const isMenuOpen = threadMenuId === t.id;
          return (
            <div
              key={t.id}
              onClick={() => !isRenaming && setActiveThreadId(t.id)}
              className={`group relative flex items-center gap-2 px-4 cursor-pointer border-r border-border transition-colors min-w-[140px]
                ${isActive ? 'bg-accentDim text-accent' : 'text-secondary hover:text-primary hover:bg-surface'}`}
            >
              <Layers size={13} />
              {isRenaming ? (
                <input autoFocus defaultValue={t.name}
                  onBlur={(e) => handleRenameThread(t.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameThread(t.id, e.currentTarget.value);
                    if (e.key === 'Escape') setRenamingThreadId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-b border-accent outline-none text-sm py-0.5 w-28"
                />
              ) : (
                <span className="text-sm font-medium max-w-[120px] truncate"
                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingThreadId(t.id); }}
                >{t.name}</span>
              )}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setThreadMenuId(isMenuOpen ? null : t.id); }}
                  className="p-1 rounded hover:bg-border/60 opacity-0 group-hover:opacity-100 transition-opacity"
                ><MoreVertical size={12} /></button>
                {isMenuOpen && (
                  <div className="absolute top-7 right-0 bg-background border border-border rounded shadow-elevated z-50 w-36 overflow-hidden animate-fade-in">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingThreadId(t.id); setThreadMenuId(null); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-surface flex items-center gap-2">
                      <Edit2 size={12} /> Rename
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteThread(t.id); setThreadMenuId(null); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-500 flex items-center gap-2">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <button onClick={handleNewThread}
          className="flex items-center gap-1 px-4 text-secondary hover:text-accent hover:bg-surface transition-colors text-sm"
        ><Plus size={14} /> Thread</button>
        <div className="flex-1" />
        <button onClick={() => setShowHotkeys(true)}
          className="flex items-center gap-1 px-4 text-secondary hover:text-accent hover:bg-surface transition-colors text-xs font-mono uppercase tracking-widest"
        ><Keyboard size={13} /> Keys</button>
      </div>

      {/* --- Main Area --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Library */}
        <div className="flex-shrink-0 relative border-r border-border flex flex-col bg-background"
          style={{ width: libraryWidth }}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">Library</span>
            <span className="font-mono text-[10px] text-secondary">{images.length}</span>
          </div>
          <input type="file" multiple accept="image/*" className="hidden"
            ref={fileInputRef} onChange={handleFileUpload} />
          <div className="mx-4 mt-4 flex flex-col gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="py-3 px-3 bg-surface border border-dashed border-border rounded-lg text-secondary hover:text-accent hover:border-accent transition-all flex items-center justify-center gap-2 text-xs font-medium">
              <Upload size={14} /> Add Images
            </button>
            {librarySelection.size > 0 ? (
              <>
                <button onClick={handleLibraryAutoStitch} disabled={isStitching}
                  className="py-2.5 px-3 bg-accent text-white hover:bg-orange-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider disabled:opacity-40">
                  <Sparkles size={13} /> Auto Stitch ({librarySelection.size})
                </button>
                <button onClick={() => setLibrarySelection(new Set())}
                  className="py-1.5 text-[10px] font-mono uppercase tracking-widest text-secondary hover:text-primary">
                  Clear selection
                </button>
              </>
            ) : images.length > 0 && (
              <>
                <button onClick={handleAddAllToCanvas}
                  className="py-2.5 px-3 bg-inverse text-inverseText hover:bg-accent hover:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <LayoutGrid size={13} /> Add All to Canvas
                </button>
                <button onClick={() => setLibrarySelection(new Set(images.map(i => i.id)))}
                  className="py-1.5 text-[10px] font-mono uppercase tracking-widest text-secondary hover:text-accent">
                  Select all for stitch
                </button>
              </>
            )}
          </div>
          <div className="h-4" />
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {images.length === 0 ? (
              <p className="text-[10px] font-mono text-secondary text-center py-8 uppercase tracking-wider">Empty library</p>
            ) : (
              <div className="gap-2 [column-fill:_balance]"
                style={{ columnCount: Math.max(2, Math.floor(libraryWidth / 130)) }}>
                {images.map(img => {
                  const isPicked = librarySelection.has(img.id);
                  return (
                  <div key={img.id} draggable
                    onDragStart={() => setDraggedLibraryImage(img)}
                    onDragEnd={() => setDraggedLibraryImage(null)}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-stop-preview]')) return;
                      setPreviewImage(img);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(null);
                      if (!viewportRef.current) return;
                      const r = viewportRef.current.getBoundingClientRect();
                      const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
                      addCanvasItemFromImage(img, w.x, w.y);
                    }}
                    title="Click to preview · double-click to drop at center · drag to place · checkbox to batch-stitch"
                    className={`relative rounded bg-surface group overflow-hidden cursor-grab active:cursor-grabbing transition-all mb-2 break-inside-avoid
                      ${isPicked ? 'ring-2 ring-accent' : 'border border-border'}`}>
                    <img src={img.dataUrl} alt={img.name}
                      className="w-full h-auto object-contain pointer-events-none block"
                      style={{ aspectRatio: `${img.width} / ${img.height}` }} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <Eye size={18} className="text-white" />
                    </div>
                    <button data-stop-preview
                      onClick={(e) => { e.stopPropagation(); toggleLibrarySelection(img.id); }}
                      title="Select for Auto Stitch"
                      className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center transition-opacity
                        ${isPicked ? 'bg-accent text-white opacity-100' : 'bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-accent'}`}>
                      {isPicked ? <Check size={12} /> : <Square size={11} />}
                    </button>
                    <button data-stop-preview
                      onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                      <Trash2 size={10} />
                    </button>
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white font-mono text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {img.width}×{img.height}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Resize handle */}
          <div
            onPointerDown={handleLibraryResize}
            className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize hover:bg-accent/40 transition-colors z-20"
            title="Drag to resize"
          />
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col relative bg-background overflow-hidden">
          {/* Toolbar */}
          <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="bg-background border border-border rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
                <MousePointer2 size={12} className="text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                  {canvasItems.length} items · {selectedIds.size} selected
                </span>
              </div>
              {canvasItems.length > 0 && !autoPreview && (
                <button onClick={toggleSelectAll}
                  className="bg-background border border-border rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm hover:border-accent text-xs text-secondary hover:text-accent transition-colors"
                  title={`${modMeta}+A`}>
                  {selectedIds.size === canvasItems.length ? <Square size={12} /> : <CheckSquare size={12} />}
                  {selectedIds.size === canvasItems.length ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              {autoPreview ? (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent bg-accentDim px-3 py-1.5 rounded-full">
                    Previewing Auto Layout — tweak parameters →
                  </span>
                  <button onClick={cancelAutoPreview}
                    className="bg-background border border-border hover:border-secondary text-secondary hover:text-primary px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors"
                    title="Esc">
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={approveAutoPreview} disabled={isStitching}
                    className="bg-accent text-white hover:bg-orange-600 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sharp transition-colors disabled:opacity-40"
                    title="Enter">
                    <Check size={14} /> {isStitching ? 'Stitching…' : 'Approve & Stitch'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={enterAutoPreview} disabled={selectedIds.size === 0}
                    className="bg-background border border-border hover:border-accent text-secondary hover:text-accent px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Auto-arrange selected into justified rows (preview)">
                    <Sparkles size={13} /> Auto Arrange
                  </button>
                  <button onClick={handleManualStitch} disabled={canvasItems.length === 0 || isStitching}
                    className="bg-inverse text-inverseText hover:bg-accent hover:text-white px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sharp transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Stitch canvas layout · ${modMeta}+Enter`}>
                    <Hand size={13} /> {isStitching ? 'Stitching…' : 'Stitch'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 bg-background border border-border rounded-full shadow-sm p-1 pointer-events-auto">
            <button onClick={() => zoomBy(1 / 1.2)} className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface" title={`${modMeta}+-`}>
              <ZoomOut size={13} />
            </button>
            <button onClick={resetView} className="px-2 min-w-[50px] text-[10px] font-mono text-secondary hover:text-primary transition-colors" title={`${modMeta}+0`}>
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => zoomBy(1.2)} className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface" title={`${modMeta}++`}>
              <ZoomIn size={13} />
            </button>
            <button onClick={resetView} className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface" title="Reset view">
              <Maximize2 size={12} />
            </button>
          </div>

          {/* Viewport */}
          <div
            ref={viewportRef}
            data-canvas-surface="true"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleCanvasDrop}
            onPointerDown={handleViewportPointerDown}
            className="flex-1 grid-bg relative overflow-hidden"
            style={{ minHeight: 0, cursor: panCursor }}
          >
            {canvasItems.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                <div className="w-20 h-20 border border-dashed border-border rounded-full flex items-center justify-center bg-surface">
                  <Upload size={26} className="text-secondary/50" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-serif text-2xl text-primary">{activeThread?.name || 'Canvas'}</h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                    Drag images from the library · double-click to drop at center
                  </p>
                </div>
              </div>
            )}

            {/* World layer */}
            <div
              data-canvas-surface="true"
              className="absolute top-0 left-0"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                width: 1, height: 1, // placeholder; children use absolute positioning
              }}
            >
              {canvasItems.map(item => {
                const isStitch = item.type === 'stitch';
                const img = !isStitch ? imageMap.get(item.imageId || '') : null;
                const src = isStitch ? item.dataUrl : img?.dataUrl;
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    onPointerDown={(e) => handleItemPointerDown(e, item)}
                    className={`absolute select-none group
                      ${isSelected ? 'ring-2 ring-accent shadow-elevated z-10' : (isStitch ? 'ring-2 ring-accent/40' : 'ring-1 ring-border')}
                    `}
                    style={{
                      left: item.x, top: item.y,
                      width: item.width, height: item.height,
                      cursor: autoPreview ? 'default' : (isSelected ? 'move' : 'pointer'),
                    }}
                  >
                    {src ? (
                      <img src={src} draggable={false} className="w-full h-full object-cover pointer-events-none block" alt="" />
                    ) : (
                      <div className="w-full h-full bg-surface flex items-center justify-center text-xs text-secondary">missing</div>
                    )}
                    {isStitch && !autoPreview && (
                      <div className="absolute -top-10 left-0 right-0 flex items-center justify-between pointer-events-none" style={{ transform: `scale(${1/zoom})`, transformOrigin: '0 0' }}>
                        <span className="pointer-events-auto bg-accent text-white text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
                          {item.stitchMode === 'manual' ? <Hand size={10} /> : <Sparkles size={10} />}
                          {item.stitchMode} Stitch
                        </span>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); handleDownloadStitch(item); }}
                          className="pointer-events-auto bg-inverse text-inverseText hover:bg-accent hover:text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sharp flex items-center gap-1 transition-colors">
                          <Download size={11} /> PNG
                        </button>
                      </div>
                    )}
                    {isSelected && !autoPreview && (
                      <>
                        <ResizeHandle corner="tl" onPointerDown={(e) => handleResizePointerDown(e, item, 'tl')} />
                        <ResizeHandle corner="tr" onPointerDown={(e) => handleResizePointerDown(e, item, 'tr')} />
                        <ResizeHandle corner="bl" onPointerDown={(e) => handleResizePointerDown(e, item, 'bl')} />
                        <ResizeHandle corner="br" onPointerDown={(e) => handleResizePointerDown(e, item, 'br')} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Marquee */}
              {marquee && (
                <div
                  className="absolute border border-accent bg-accent/10 pointer-events-none"
                  style={{
                    left: Math.min(marquee.x1, marquee.x2),
                    top: Math.min(marquee.y1, marquee.y2),
                    width: Math.abs(marquee.x2 - marquee.x1),
                    height: Math.abs(marquee.y2 - marquee.y1),
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Settings panel — only when in auto preview */}
        {autoPreview && (
          <div className="w-[280px] flex-shrink-0 border-l border-border bg-background flex flex-col animate-fade-in">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase flex items-center gap-2">
                <Sparkles size={12} /> Auto Parameters
              </span>
              <button onClick={cancelAutoPreview} className="text-secondary hover:text-primary" title="Esc">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              <p className="font-mono text-[10px] text-secondary uppercase tracking-wider leading-relaxed">
                {autoPreview.originals.size} item{autoPreview.originals.size === 1 ? '' : 's'} previewing. Adjust and click Approve.
              </p>
              <RangeField label="Output Width" value={settings.containerWidth} unit="px"
                min={400} max={3000} step={50}
                onChange={(v) => setSettings(s => ({ ...s, containerWidth: v }))} />
              <RangeField label="Row Height" value={settings.targetRowHeight} unit="px"
                min={80} max={800} step={20}
                onChange={(v) => setSettings(s => ({ ...s, targetRowHeight: v }))} />
              <RangeField label="Spacing" value={settings.spacing} unit="px"
                min={0} max={100} step={2}
                onChange={(v) => setSettings(s => ({ ...s, spacing: v }))} />
              <label className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-primary">Canvas Color</span>
                <div className="flex border border-border rounded-lg overflow-hidden h-9">
                  <input type="color" value={settings.backgroundColor}
                    onChange={(e) => setSettings(s => ({ ...s, backgroundColor: e.target.value }))}
                    className="w-10 h-full cursor-pointer border-r border-border p-0 bg-surface" />
                  <input type="text" value={settings.backgroundColor}
                    onChange={(e) => setSettings(s => ({ ...s, backgroundColor: e.target.value }))}
                    className="flex-1 px-3 font-mono text-xs uppercase bg-background outline-none text-primary" />
                </div>
              </label>
            </div>
            <div className="p-4 border-t border-border flex gap-2">
              <button onClick={cancelAutoPreview}
                className="flex-1 py-2.5 rounded-lg border border-border text-secondary hover:border-secondary hover:text-primary transition-colors text-xs font-medium">
                Cancel
              </button>
              <button onClick={approveAutoPreview} disabled={isStitching}
                className="flex-1 py-2.5 rounded-lg bg-accent text-white hover:bg-orange-600 transition-colors text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40">
                <Check size={13} /> Approve
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Library image preview modal --- */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage.dataUrl} alt={previewImage.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-elevated" />
            <div className="bg-background border border-border rounded-full px-5 py-2 flex items-center gap-4 shadow-sharp">
              <span className="font-mono text-[10px] uppercase tracking-widest text-secondary truncate max-w-[240px]">
                {previewImage.name}
              </span>
              <span className="font-mono text-[10px] text-secondary">
                {previewImage.width} × {previewImage.height}
              </span>
              <button
                onClick={() => {
                  if (!viewportRef.current) return;
                  const r = viewportRef.current.getBoundingClientRect();
                  const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
                  addCanvasItemFromImage(previewImage, w.x, w.y);
                  setPreviewImage(null);
                }}
                className="px-3 py-1 bg-accent text-white hover:bg-orange-600 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors">
                <Plus size={11} /> Add to Canvas
              </button>
              <button onClick={() => setPreviewImage(null)}
                className="w-7 h-7 rounded-full hover:bg-surface text-secondary flex items-center justify-center">
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Hotkey help --- */}
      {showHotkeys && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in"
          onClick={() => setShowHotkeys(false)}>
          <div className="bg-background border border-border rounded-xl w-[440px] shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-serif text-lg text-primary flex items-center gap-2">
                <Keyboard size={16} className="text-accent" /> Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowHotkeys(false)}
                className="w-8 h-8 rounded-full hover:bg-surface text-secondary flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-2 text-sm">
              <HotkeyRow keys={[`${modMeta}`, 'Z']} label="Undo last action" />
              <HotkeyRow keys={[`${modMeta}`, 'Enter']} label="Stitch (current layout)" />
              <HotkeyRow keys={['Enter']} label="Approve auto preview" />
              <HotkeyRow keys={['Esc']} label="Cancel preview / clear selection" />
              <HotkeyRow keys={[`${modMeta}`, 'A']} label="Select all" />
              <HotkeyRow keys={[`${modMeta}`, 'D']} label="Duplicate selected" />
              <HotkeyRow keys={['Del']} label="Delete selected" />
              <HotkeyRow keys={['Space', '+ Drag']} label="Pan canvas" />
              <HotkeyRow keys={[`${modMeta}`, '+ Wheel']} label="Zoom" />
              <HotkeyRow keys={[`${modMeta}`, '+/−/0']} label="Zoom in / out / reset" />
              <HotkeyRow keys={['Wheel']} label="Pan" />
              <HotkeyRow keys={['Drag empty']} label="Marquee select" />
              <HotkeyRow keys={['←', '→', '↑', '↓']} label="Nudge 1px (Shift: 10px)" />
              <HotkeyRow keys={['Shift', '+ Drag corner']} label="Free resize" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Helpers ---
const ResizeHandle: React.FC<{ corner: 'tl' | 'tr' | 'bl' | 'br'; onPointerDown: (e: React.PointerEvent) => void }> = ({ corner, onPointerDown }) => {
  const pos: Record<string, string> = {
    tl: '-top-1.5 -left-1.5 cursor-nwse-resize',
    tr: '-top-1.5 -right-1.5 cursor-nesw-resize',
    bl: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
    br: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
  };
  return <div onPointerDown={onPointerDown} className={`absolute w-3 h-3 bg-background border-2 border-accent rounded-sm z-30 ${pos[corner]}`} />;
};

const RangeField: React.FC<{ label: string; value: number; unit: string; min: number; max: number; step: number; onChange: (v: number) => void }> = ({ label, value, unit, min, max, step, onChange }) => (
  <label className="flex flex-col gap-2">
    <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider">
      <span className="text-primary">{label}</span>
      <span className="text-secondary">{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="range-clean" />
  </label>
);

const HotkeyRow: React.FC<{ keys: string[]; label: string }> = ({ keys, label }) => (
  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
    <span className="text-primary">{label}</span>
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="font-mono text-[10px] px-2 py-1 bg-surface border border-border rounded text-secondary">{k}</kbd>
      ))}
    </div>
  </div>
);

function readFileAsStoredImage(threadId: string) {
  return (file: File): Promise<StoredImage> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => resolve({
        id: crypto.randomUUID(), threadId, name: file.name,
        dataUrl, width: img.width, height: img.height, createdAt: Date.now(),
      });
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

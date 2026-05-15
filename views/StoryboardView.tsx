import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  X,
  Crop as CropIcon,
  Replace,
  Download,
  GripVertical,
  Clapperboard,
  Rows3,
  Columns3,
  Grid3x3,
  Maximize2,
  Minus,
} from 'lucide-react';
import { CropRegion } from '../types';
import {
  cropImage,
  loadImage,
  generateLayoutStitch,
  EXPORT_SCALE_OPTIONS,
  StitchLayout,
} from '../utils/imageUtils';

interface StorySource {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
}

interface StoryPanel {
  id: string;
  src: string;
  width: number;
  height: number;
}

interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

const BG_SWATCHES: { label: string; value: string }[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Linen', value: '#FFF4EA' },
  { label: 'Carbon', value: '#191919' },
  { label: 'Obsidian', value: '#0A0805' },
  { label: 'None', value: 'transparent' },
];

// --- Crop Stage ---------------------------------------------------------

type CropMode = 'create' | 'move' | 'nw' | 'ne' | 'sw' | 'se';

const CropStage: React.FC<{
  source: StorySource;
  onAddCrop: (sel: Selection) => void;
  onAddFull: () => void;
}> = ({ source, onAddCrop, onAddFull }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const selRef = useRef(sel);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  const [drag, setDrag] = useState<{
    mode: CropMode;
    startX: number;
    startY: number;
    init?: Selection;
  } | null>(null);
  const dragRef = useRef(drag);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Reset selection when the source image changes.
  useEffect(() => {
    setSel(null);
    setDrag(null);
  }, [source.id]);

  // Escape clears the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toPercent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const d = dragRef.current;
      if (!d) return;
      const pos = toPercent(e.clientX, e.clientY);

      if (d.mode === 'create') {
        setSel({
          x: Math.min(d.startX, pos.x),
          y: Math.min(d.startY, pos.y),
          width: Math.abs(pos.x - d.startX),
          height: Math.abs(pos.y - d.startY),
        });
        return;
      }

      if (!d.init) return;
      const dx = pos.x - d.startX;
      const dy = pos.y - d.startY;
      const init = d.init;
      const next = { ...init };

      if (d.mode === 'move') {
        next.x = Math.min(Math.max(0, init.x + dx), 100 - init.width);
        next.y = Math.min(Math.max(0, init.y + dy), 100 - init.height);
      } else if (d.mode === 'se') {
        next.width = Math.max(2, Math.min(init.width + dx, 100 - init.x));
        next.height = Math.max(2, Math.min(init.height + dy, 100 - init.y));
      } else if (d.mode === 'sw') {
        next.x = Math.max(0, Math.min(init.x + dx, init.x + init.width - 2));
        next.width = init.width + (init.x - next.x);
        next.height = Math.max(2, Math.min(init.height + dy, 100 - init.y));
      } else if (d.mode === 'ne') {
        next.y = Math.max(0, Math.min(init.y + dy, init.y + init.height - 2));
        next.height = init.height + (init.y - next.y);
        next.width = Math.max(2, Math.min(init.width + dx, 100 - init.x));
      } else if (d.mode === 'nw') {
        next.x = Math.max(0, Math.min(init.x + dx, init.x + init.width - 2));
        next.y = Math.max(0, Math.min(init.y + dy, init.y + init.height - 2));
        next.width = init.width + (init.x - next.x);
        next.height = init.height + (init.y - next.y);
      }
      setSel(next);
    };

    const onUp = () => setDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]);

  const startCreate = (e: React.MouseEvent) => {
    const pos = toPercent(e.clientX, e.clientY);
    setSel({ x: pos.x, y: pos.y, width: 0, height: 0 });
    setDrag({ mode: 'create', startX: pos.x, startY: pos.y });
  };

  const startMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sel) return;
    const pos = toPercent(e.clientX, e.clientY);
    setDrag({ mode: 'move', startX: pos.x, startY: pos.y, init: { ...sel } });
  };

  const startResize = (e: React.MouseEvent, mode: CropMode) => {
    e.stopPropagation();
    if (!sel) return;
    const pos = toPercent(e.clientX, e.clientY);
    setDrag({ mode, startX: pos.x, startY: pos.y, init: { ...sel } });
  };

  const hasSelection = !!sel && sel.width > 2 && sel.height > 2;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8">
      <div className="relative shadow-elevated bg-surface p-2">
        {sel === null && (
          <div className="absolute -top-9 left-0 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-secondary">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            Drag a region, or add the whole frame
          </div>
        )}

        <div
          ref={containerRef}
          onMouseDown={startCreate}
          className="relative cursor-crosshair touch-none select-none"
        >
          <img
            src={source.src}
            alt={source.name}
            className="max-w-full max-h-[62vh] block pointer-events-none"
            draggable={false}
          />

          {sel && (
            <div
              onMouseDown={startMove}
              className="absolute z-20 cursor-move"
              style={{
                left: `${sel.x}%`,
                top: `${sel.y}%`,
                width: `${sel.width}%`,
                height: `${sel.height}%`,
              }}
            >
              <div className="absolute inset-0 border border-accent bg-accent/5 pointer-events-none" />
              {/* Editorial corner brackets */}
              <div className="absolute -top-px -left-px w-3 h-3 border-l-2 border-t-2 border-accent pointer-events-none" />
              <div className="absolute -top-px -right-px w-3 h-3 border-r-2 border-t-2 border-accent pointer-events-none" />
              <div className="absolute -bottom-px -left-px w-3 h-3 border-l-2 border-b-2 border-accent pointer-events-none" />
              <div className="absolute -bottom-px -right-px w-3 h-3 border-r-2 border-b-2 border-accent pointer-events-none" />

              <div
                onMouseDown={(e) => startResize(e, 'nw')}
                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-accent border border-white z-30 cursor-nw-resize"
              />
              <div
                onMouseDown={(e) => startResize(e, 'ne')}
                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-accent border border-white z-30 cursor-ne-resize"
              />
              <div
                onMouseDown={(e) => startResize(e, 'sw')}
                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-accent border border-white z-30 cursor-sw-resize"
              />
              <div
                onMouseDown={(e) => startResize(e, 'se')}
                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-accent border border-white z-30 cursor-se-resize"
              />

              {hasSelection && (
                <div className="absolute -bottom-7 left-0 bg-accent text-white font-mono text-[9px] px-2 py-0.5">
                  {Math.round(sel.width)}% × {Math.round(sel.height)}%
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating action pill */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
        <div className="bg-inverse text-inverseText px-2 py-2 rounded-full shadow-elevated flex items-center gap-1">
          <button
            onClick={onAddFull}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-inverseText/80 hover:bg-secondary/20 hover:text-inverseText transition-colors cursor-pointer"
          >
            <Maximize2 size={14} /> Whole Frame
          </button>
          <button
            onClick={() => hasSelection && sel && onAddCrop(sel)}
            disabled={!hasSelection}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold bg-accent text-white hover:bg-orange-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <CropIcon size={14} /> Add Panel
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Storyboard View ----------------------------------------------------

const StoryboardView: React.FC = () => {
  const [sources, setSources] = useState<StorySource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [panels, setPanels] = useState<StoryPanel[]>([]);
  const [stage, setStage] = useState<'crop' | 'result'>('crop');

  const [layout, setLayout] = useState<StitchLayout>('grid');
  const [columns, setColumns] = useState(3);
  const [spacing, setSpacing] = useState(12);
  const [bg, setBg] = useState('#ffffff');
  const [exportScale, setExportScale] = useState(1);

  const [resultSrc, setResultSrc] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);

  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  const activeSource = sources.find((s) => s.id === activeSourceId) ?? null;

  // --- File ingestion ---
  const ingestFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const source: StorySource = {
          id: crypto.randomUUID(),
          name: file.name,
          src,
          width: img.width,
          height: img.height,
        };
        setSources((prev) => [...prev, source]);
        setActiveSourceId((prev) => prev ?? source.id);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((f) => ingestFile(f));
    if (uploadRef.current) uploadRef.current.value = '';
  };

  // --- Panels ---
  const addCropPanel = async (sel: Selection) => {
    if (!activeSource) return;
    const region: CropRegion = {
      id: crypto.randomUUID(),
      x: sel.x,
      y: sel.y,
      width: sel.width,
      height: sel.height,
      isLocked: false,
      replacementSrc: null,
      isStitched: false,
    };
    const src = await cropImage(
      activeSource.src,
      region,
      activeSource.width,
      activeSource.height
    );
    const img = await loadImage(src);
    setPanels((prev) => [
      ...prev,
      { id: crypto.randomUUID(), src, width: img.width, height: img.height },
    ]);
  };

  const addFullPanel = async () => {
    if (!activeSource) return;
    setPanels((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        src: activeSource.src,
        width: activeSource.width,
        height: activeSource.height,
      },
    ]);
  };

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  };

  const triggerReplace = (id: string) => {
    replaceTargetId.current = id;
    replaceRef.current?.click();
  };

  const handleReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = replaceTargetId.current;
    if (file && targetId) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const src = evt.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setPanels((prev) =>
            prev.map((p) =>
              p.id === targetId
                ? { ...p, src, width: img.width, height: img.height }
                : p
            )
          );
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
    replaceTargetId.current = null;
    if (replaceRef.current) replaceRef.current.value = '';
  };

  // --- Reorder ---
  const reorder = (from: number, to: number) => {
    setPanels((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // --- Result generation ---
  useEffect(() => {
    if (stage !== 'result' || panels.length === 0) {
      setResultSrc(null);
      return;
    }
    let cancelled = false;
    setIsComposing(true);
    generateLayoutStitch(
      panels.map((p) => p.src),
      { layout, columns, spacing, backgroundColor: bg, exportScale }
    )
      .then((url) => {
        if (!cancelled) setResultSrc(url);
      })
      .catch((err) => console.error('Storyboard compose failed', err))
      .finally(() => {
        if (!cancelled) setIsComposing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage, panels, layout, columns, spacing, bg, exportScale]);

  const handleExport = async () => {
    if (panels.length === 0) return;
    const url = await generateLayoutStitch(
      panels.map((p) => p.src),
      { layout, columns, spacing, backgroundColor: bg, exportScale }
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard-${layout}-${Math.round(exportScale * 100)}.png`;
    a.click();
  };

  // --- Drag & drop on the workspace ---
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    Array.from(e.dataTransfer.files ?? []).forEach((f) => ingestFile(f as File));
  };

  return (
    <div
      className="w-full h-full flex bg-background relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        type="file"
        ref={uploadRef}
        onChange={handleUpload}
        className="hidden"
        accept="image/*"
        multiple
      />
      <input
        type="file"
        ref={replaceRef}
        onChange={handleReplace}
        className="hidden"
        accept="image/*"
      />

      {isDraggingFile && (
        <div className="absolute inset-4 z-50 border-2 border-dashed border-accent bg-accent/5 rounded-3xl flex items-center justify-center backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-background px-8 py-4 rounded-full shadow-elevated border border-accent/20 flex items-center gap-3">
            <Upload className="text-accent animate-bounce" size={24} />
            <span className="font-serif text-xl text-primary">Drop to Add Source</span>
          </div>
        </div>
      )}

      {/* --- SOURCES RAIL --- */}
      <aside className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-background z-10">
        <div className="h-20 px-5 flex items-center justify-between border-b border-border">
          <div>
            <span className="font-mono text-[10px] text-accent tracking-widest uppercase block mb-1">
              Sources
            </span>
            <span className="font-serif text-lg text-primary">
              Frames{' '}
              <span className="font-sans text-xs text-secondary">({sources.length})</span>
            </span>
          </div>
          <button
            onClick={() => uploadRef.current?.click()}
            className="w-9 h-9 flex items-center justify-center bg-inverse text-inverseText hover:bg-accent hover:text-white transition-colors rounded-full cursor-pointer"
            title="Upload images"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sources.length === 0 && (
            <button
              onClick={() => uploadRef.current?.click()}
              className="w-full mt-4 py-10 border border-dashed border-border rounded-xl flex flex-col items-center gap-3 text-secondary hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              <Upload size={22} />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Upload Frames
              </span>
            </button>
          )}

          {sources.map((source) => {
            const isActive = source.id === activeSourceId;
            return (
              <div
                key={source.id}
                onClick={() => {
                  setActiveSourceId(source.id);
                  setStage('crop');
                }}
                className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all ${
                  isActive
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <img
                  src={source.src}
                  alt={source.name}
                  className="w-full h-24 object-cover block"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 flex items-end justify-between">
                  <span className="text-white text-[10px] font-medium truncate max-w-[110px]">
                    {source.name}
                  </span>
                  <span className="text-white/70 font-mono text-[8px]">
                    {source.width}×{source.height}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSources((prev) => prev.filter((s) => s.id !== source.id));
                    if (activeSourceId === source.id) {
                      const next = sources.find((s) => s.id !== source.id);
                      setActiveSourceId(next ? next.id : null);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all cursor-pointer"
                  title="Remove source"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* --- CENTER COLUMN --- */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute inset-0 grid-bg pointer-events-none" />

        {/* Header + stage toggle */}
        <header className="h-20 flex items-center justify-between px-8 border-b border-border z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">
                06 — storyboard
              </span>
              <div className="h-px w-8 bg-accent" />
            </div>
            <h1 className="font-serif text-3xl text-primary mt-1">Storyboard Workbench</h1>
          </div>

          <div className="bg-background border border-border p-1 rounded-full shadow-md flex gap-1">
            <button
              onClick={() => setStage('crop')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                stage === 'crop'
                  ? 'bg-accent text-white'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Crop
            </button>
            <button
              onClick={() => setStage('result')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                stage === 'result'
                  ? 'bg-accent text-white'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Result
            </button>
          </div>
        </header>

        {/* Stage */}
        <div className="flex-1 relative overflow-hidden z-10">
          {stage === 'crop' ? (
            activeSource ? (
              <CropStage
                source={activeSource}
                onAddCrop={addCropPanel}
                onAddFull={addFullPanel}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface">
                  <Clapperboard size={32} className="text-secondary/50" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-serif text-3xl text-primary">Build a Storyboard</h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                    Add source frames to start cropping
                  </p>
                </div>
              </div>
            )
          ) : panels.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-6">
              <div className="w-24 h-24 border border-dashed border-border rounded-full flex items-center justify-center bg-surface">
                <Grid3x3 size={32} className="text-secondary/50" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-serif text-3xl text-primary">No Panels Yet</h3>
                <p className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                  Crop frames into panels to compose
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8">
              {isComposing && !resultSrc ? (
                <div className="flex flex-col items-center gap-4 text-secondary font-mono">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  Composing...
                </div>
              ) : resultSrc ? (
                <div
                  className="shadow-elevated p-2"
                  style={{
                    background:
                      bg === 'transparent'
                        ? 'repeating-conic-gradient(#0000000d 0% 25%, transparent 0% 50%) 50% / 20px 20px'
                        : 'var(--bg-surface)',
                  }}
                >
                  <img
                    src={resultSrc}
                    alt="Storyboard composition"
                    className="max-w-full max-h-[64vh] object-contain block"
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Panel strip */}
        <div className="h-44 bg-surface border-t border-border flex flex-col z-10">
          <div className="px-6 py-2.5 border-b border-border flex items-center justify-between bg-background/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">
              Panels ({panels.length})
            </span>
            {panels.length > 0 && (
              <button
                onClick={() => setPanels([])}
                className="font-mono text-[10px] uppercase tracking-widest text-secondary hover:text-red-500 transition-colors cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-x-auto p-4 flex gap-3 items-center">
            {panels.length === 0 && (
              <div className="w-full text-center text-secondary text-sm font-mono opacity-50">
                Cropped panels appear here — drag to reorder
              </div>
            )}

            {panels.map((panel, index) => {
              const isDragging = draggingIndex === index;
              const isTarget = dropTargetIndex === index;
              return (
                <div
                  key={panel.id}
                  draggable
                  onDragStart={() => setDraggingIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggingIndex !== null && draggingIndex !== index) {
                      setDropTargetIndex(index);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingIndex !== null && draggingIndex !== index) {
                      reorder(draggingIndex, index);
                    }
                    setDraggingIndex(null);
                    setDropTargetIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggingIndex(null);
                    setDropTargetIndex(null);
                  }}
                  className={`relative group flex-shrink-0 w-32 h-24 bg-background border rounded-md overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                    isDragging ? 'opacity-20' : ''
                  } ${isTarget ? 'border-accent ring-1 ring-accent' : 'border-border'}`}
                >
                  <img
                    src={panel.src}
                    alt={`Panel ${index + 1}`}
                    className="w-full h-full object-contain pointer-events-none"
                  />

                  <div className="absolute bottom-1 left-1 bg-inverse text-inverseText font-mono text-[9px] px-1.5 py-0.5 rounded-sm">
                    {index + 1}
                  </div>

                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => triggerReplace(panel.id)}
                      className="w-6 h-6 rounded-sm bg-inverse text-inverseText flex items-center justify-center hover:bg-accent hover:text-white transition-colors cursor-pointer"
                      title="Replace panel"
                    >
                      <Replace size={11} />
                    </button>
                    <button
                      onClick={() => removePanel(panel.id)}
                      className="w-6 h-6 rounded-sm bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer"
                      title="Delete panel"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={12} className="text-white drop-shadow" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- COMPOSITION RAIL --- */}
      <aside className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-background z-10">
        <div className="h-20 px-6 flex flex-col justify-center border-b border-border">
          <span className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1">
            Composition
          </span>
          <span className="font-serif text-lg text-primary">Assembly</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Layout */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-secondary block mb-2">
              Layout
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'row', label: 'Row', icon: <Columns3 size={16} /> },
                  { value: 'column', label: 'Column', icon: <Rows3 size={16} /> },
                  { value: 'grid', label: 'Grid', icon: <Grid3x3 size={16} /> },
                ] as { value: StitchLayout; label: string; icon: React.ReactNode }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLayout(opt.value)}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                    layout === opt.value
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-secondary hover:text-primary hover:border-accent'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Columns (grid only) */}
          {layout === 'grid' && (
            <div className="animate-fade-in">
              <label className="font-mono text-[10px] uppercase tracking-widest text-secondary block mb-2">
                Columns
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setColumns((c) => Math.max(1, c - 1))}
                  className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-secondary hover:text-primary hover:border-accent transition-colors cursor-pointer"
                >
                  <Minus size={14} />
                </button>
                <span className="flex-1 text-center font-serif text-2xl text-primary">
                  {columns}
                </span>
                <button
                  onClick={() => setColumns((c) => Math.min(6, c + 1))}
                  className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-secondary hover:text-primary hover:border-accent transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Spacing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-secondary">
                Spacing
              </label>
              <span className="font-mono text-[10px] text-secondary">{spacing}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value))}
              className="range-clean"
            />
          </div>

          {/* Background */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-secondary block mb-2">
              Background
            </label>
            <div className="flex gap-2">
              {BG_SWATCHES.map((swatch) => (
                <button
                  key={swatch.value}
                  onClick={() => setBg(swatch.value)}
                  title={swatch.label}
                  className={`w-9 h-9 rounded-lg border-2 transition-all cursor-pointer ${
                    bg === swatch.value
                      ? 'border-accent scale-105'
                      : 'border-border hover:border-accent/50'
                  }`}
                  style={
                    swatch.value === 'transparent'
                      ? {
                          background:
                            'repeating-conic-gradient(#00000022 0% 25%, #ffffff 0% 50%) 50% / 10px 10px',
                        }
                      : { background: swatch.value }
                  }
                />
              ))}
            </div>
          </div>

          {/* Export scale */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-secondary block mb-2">
              Export Size
            </label>
            <div className="grid grid-cols-4 gap-2">
              {EXPORT_SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExportScale(opt.value)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    exportScale === opt.value
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-secondary hover:text-primary hover:border-accent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border">
          <button
            onClick={handleExport}
            disabled={panels.length === 0}
            className="w-full bg-inverse text-inverseText hover:bg-accent hover:text-white px-6 py-3.5 text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 shadow-sharp transition-colors rounded-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download size={16} />
            Export {Math.round(exportScale * 100)}%
          </button>
        </div>
      </aside>
    </div>
  );
};

export default StoryboardView;

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  X,
  Crop as CropIcon,
  Replace,
  Download,
  Clapperboard,
  MousePointer2,
  Hand,
  Scissors,
  ImagePlus,
  RotateCcw,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { loadImage } from '../utils/imageUtils';

// ─────────────────────────────────────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'crop' | 'fill' | 'pan';

interface Cut {
  id: string;
  /** All values are 0..1 fractions of the frame */
  x: number;
  y: number;
  width: number;
  height: number;
  fillSrc?: string;
  fillName?: string;
}

interface Frame {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  cuts: Cut[];
}

interface Bake {
  id: string;
  src: string;
  width: number;
  height: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const readFileAsFrame = (file: File): Promise<Frame> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () =>
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          src,
          width: img.width,
          height: img.height,
          cuts: [],
        });
      img.onerror = reject;
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Bake the current frame into a single composite PNG.
 * - Draws the base image
 * - For each cut with a fill: replaces that rect with the fill (scaled to slice/cover)
 * - For each cut without a fill: punches transparent (clearRect)
 */
const bakeFrame = async (frame: Frame): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const baseImg = await loadImage(frame.src);
  ctx.drawImage(baseImg, 0, 0, frame.width, frame.height);

  for (const cut of frame.cuts) {
    const cx = cut.x * frame.width;
    const cy = cut.y * frame.height;
    const cw = cut.width * frame.width;
    const ch = cut.height * frame.height;

    if (cut.fillSrc) {
      // cover-fit the fill into the cut rect
      const fill = await loadImage(cut.fillSrc);
      const scale = Math.max(cw / fill.width, ch / fill.height);
      const dw = fill.width * scale;
      const dh = fill.height * scale;
      const dx = cx + (cw - dw) / 2;
      const dy = cy + (ch - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();
      ctx.drawImage(fill, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.clearRect(cx, cy, cw, ch);
    }
  }

  return canvas.toDataURL('image/png');
};

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS — frame renderer with SVG masks (so unfilled cuts show real holes)
// ─────────────────────────────────────────────────────────────────────────────

interface FrameCanvasProps {
  frame: Frame;
  tool: Tool;
  selectedCutId: string | null;
  onSelectCut: (id: string | null) => void;
  onCreateCut: (cut: Cut) => void;
  onUpdateCut: (id: string, cut: Partial<Cut>) => void;
  onDeleteCut: (id: string) => void;
  onTriggerFill: (id: string) => void;
}

type DragMode =
  | { kind: 'create'; startX: number; startY: number }
  | { kind: 'move'; cutId: string; startX: number; startY: number; init: Cut }
  | {
      kind: 'resize';
      cutId: string;
      handle: 'nw' | 'ne' | 'sw' | 'se';
      startX: number;
      startY: number;
      init: Cut;
    };

const FrameCanvas: React.FC<FrameCanvasProps> = ({
  frame,
  tool,
  selectedCutId,
  onSelectCut,
  onCreateCut,
  onUpdateCut,
  onDeleteCut,
  onTriggerFill,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);
  const [tempRect, setTempRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const fracOf = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  // Global mousemove/up while dragging
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const p = fracOf(e.clientX, e.clientY);

      if (drag.kind === 'create') {
        const x = Math.min(drag.startX, p.x);
        const y = Math.min(drag.startY, p.y);
        const width = Math.abs(p.x - drag.startX);
        const height = Math.abs(p.y - drag.startY);
        setTempRect({ x, y, width, height });
        return;
      }

      if (drag.kind === 'move') {
        const dx = p.x - drag.startX;
        const dy = p.y - drag.startY;
        const init = drag.init;
        const nx = clamp(init.x + dx, 0, 1 - init.width);
        const ny = clamp(init.y + dy, 0, 1 - init.height);
        onUpdateCut(drag.cutId, { x: nx, y: ny });
        return;
      }

      if (drag.kind === 'resize') {
        const init = drag.init;
        const next: Partial<Cut> = {};
        const min = 0.01;
        if (drag.handle === 'se') {
          next.width = clamp(p.x - init.x, min, 1 - init.x);
          next.height = clamp(p.y - init.y, min, 1 - init.y);
        } else if (drag.handle === 'sw') {
          const nx = clamp(p.x, 0, init.x + init.width - min);
          next.x = nx;
          next.width = init.x + init.width - nx;
          next.height = clamp(p.y - init.y, min, 1 - init.y);
        } else if (drag.handle === 'ne') {
          const ny = clamp(p.y, 0, init.y + init.height - min);
          next.y = ny;
          next.height = init.y + init.height - ny;
          next.width = clamp(p.x - init.x, min, 1 - init.x);
        } else if (drag.handle === 'nw') {
          const nx = clamp(p.x, 0, init.x + init.width - min);
          const ny = clamp(p.y, 0, init.y + init.height - min);
          next.x = nx;
          next.y = ny;
          next.width = init.x + init.width - nx;
          next.height = init.y + init.height - ny;
        }
        onUpdateCut(drag.cutId, next);
      }
    };

    const onUp = () => {
      if (drag.kind === 'create' && tempRect) {
        if (tempRect.width > 0.02 && tempRect.height > 0.02) {
          onCreateCut({
            id: crypto.randomUUID(),
            ...tempRect,
          });
        }
      }
      setDrag(null);
      setTempRect(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, tempRect, onCreateCut, onUpdateCut]);

  // ESC / Delete key handling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSelectCut(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCutId) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
          return;
        onDeleteCut(selectedCutId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCutId, onSelectCut, onDeleteCut]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'crop') {
      onSelectCut(null);
      return;
    }
    e.preventDefault();
    const p = fracOf(e.clientX, e.clientY);
    setDrag({ kind: 'create', startX: p.x, startY: p.y });
    setTempRect({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const startMove = (e: React.MouseEvent, cut: Cut) => {
    e.stopPropagation();
    onSelectCut(cut.id);
    if (tool === 'fill') {
      onTriggerFill(cut.id);
      return;
    }
    if (tool !== 'select') return;
    const p = fracOf(e.clientX, e.clientY);
    setDrag({
      kind: 'move',
      cutId: cut.id,
      startX: p.x,
      startY: p.y,
      init: { ...cut },
    });
  };

  const startResize = (
    e: React.MouseEvent,
    cut: Cut,
    handle: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    onSelectCut(cut.id);
    const p = fracOf(e.clientX, e.clientY);
    setDrag({
      kind: 'resize',
      cutId: cut.id,
      handle,
      startX: p.x,
      startY: p.y,
      init: { ...cut },
    });
  };

  const cursorClass =
    tool === 'crop'
      ? 'cursor-crosshair'
      : tool === 'pan'
      ? 'cursor-grab'
      : 'cursor-default';

  // Filter unfilled vs filled for SVG mask
  const holes = frame.cuts.filter((c) => !c.fillSrc);
  const fills = frame.cuts.filter((c) => c.fillSrc);

  return (
    <div className="relative inline-block">
      {/* Corner registration marks above frame */}
      <div className="absolute -top-7 left-0 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-secondary pointer-events-none select-none">
        <span className="text-accent">●</span>
        <span>FRAME 01 / {frame.name.slice(0, 36)}</span>
        <span className="text-secondary/40">·</span>
        <span>{frame.width}×{frame.height}</span>
      </div>
      <div className="absolute -top-7 right-0 font-mono text-[9px] uppercase tracking-[0.2em] text-secondary pointer-events-none select-none">
        TAKE / {frame.cuts.length.toString().padStart(2, '0')}
      </div>

      {/* Corner brackets */}
      <CornerBrackets />

      <div
        ref={ref}
        onMouseDown={onMouseDown}
        className={`relative select-none touch-none ${cursorClass}`}
        style={{
          width: 'min(72vw, 1100px)',
          aspectRatio: `${frame.width} / ${frame.height}`,
          maxHeight: '70vh',
        }}
      >
        {/* SVG renders the image with holes masked out and fills composited in */}
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none block"
        >
          <defs>
            <mask id={`mask-${frame.id}`}>
              <rect width={frame.width} height={frame.height} fill="white" />
              {holes.map((c) => (
                <rect
                  key={c.id}
                  x={c.x * frame.width}
                  y={c.y * frame.height}
                  width={c.width * frame.width}
                  height={c.height * frame.height}
                  fill="black"
                />
              ))}
            </mask>
            {/* Per-fill clip paths so cover-fit slicing reads correctly */}
            {fills.map((c) => (
              <clipPath
                key={`clip-${c.id}`}
                id={`clip-${frame.id}-${c.id}`}
              >
                <rect
                  x={c.x * frame.width}
                  y={c.y * frame.height}
                  width={c.width * frame.width}
                  height={c.height * frame.height}
                />
              </clipPath>
            ))}
          </defs>

          <image
            href={frame.src}
            x={0}
            y={0}
            width={frame.width}
            height={frame.height}
            mask={`url(#mask-${frame.id})`}
            preserveAspectRatio="none"
          />

          {fills.map((c) => (
            <g key={c.id} clipPath={`url(#clip-${frame.id}-${c.id})`}>
              <image
                href={c.fillSrc!}
                x={c.x * frame.width}
                y={c.y * frame.height}
                width={c.width * frame.width}
                height={c.height * frame.height}
                preserveAspectRatio="xMidYMid slice"
              />
            </g>
          ))}
        </svg>

        {/* Interactive HTML overlay for cuts (handles, labels) */}
        {frame.cuts.map((cut, i) => {
          const isSelected = cut.id === selectedCutId;
          const isFilled = !!cut.fillSrc;
          const number = (i + 1).toString().padStart(2, '0');

          const cursor =
            tool === 'fill'
              ? 'cursor-cell'
              : tool === 'select'
              ? 'cursor-move'
              : 'cursor-default';

          return (
            <div
              key={cut.id}
              onMouseDown={(e) => startMove(e, cut)}
              className={`absolute group ${cursor} transition-shadow`}
              style={{
                left: `${cut.x * 100}%`,
                top: `${cut.y * 100}%`,
                width: `${cut.width * 100}%`,
                height: `${cut.height * 100}%`,
              }}
            >
              {/* Border treatment differs for hole vs patch */}
              {isFilled ? (
                <div
                  className={`absolute inset-0 border ${
                    isSelected
                      ? 'border-accent shadow-[0_0_0_2px_var(--color-accent)]'
                      : 'border-accent/60'
                  }`}
                />
              ) : (
                <div
                  className={`absolute inset-0 ${
                    isSelected
                      ? 'border-2 border-dashed border-accent'
                      : 'border border-dashed border-accent/70'
                  }`}
                  style={{
                    background:
                      'repeating-conic-gradient(rgba(255,85,46,0.08) 0% 25%, transparent 0% 50%) 50% / 14px 14px',
                  }}
                />
              )}

              {/* Corner brackets — extra emphasis when selected */}
              {isSelected && (
                <>
                  <span className="absolute -top-px -left-px w-3 h-3 border-l-2 border-t-2 border-accent pointer-events-none" />
                  <span className="absolute -top-px -right-px w-3 h-3 border-r-2 border-t-2 border-accent pointer-events-none" />
                  <span className="absolute -bottom-px -left-px w-3 h-3 border-l-2 border-b-2 border-accent pointer-events-none" />
                  <span className="absolute -bottom-px -right-px w-3 h-3 border-r-2 border-b-2 border-accent pointer-events-none" />
                </>
              )}

              {/* Cut label */}
              <div className="absolute -top-5 left-0 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] pointer-events-none">
                <span
                  className={`px-1.5 py-0.5 ${
                    isFilled
                      ? 'bg-accent text-white'
                      : 'bg-inverse text-inverseText'
                  }`}
                >
                  {isFilled ? `PATCH ${number}` : `CUT ${number}`}
                </span>
                <span className="text-secondary">
                  {Math.round(cut.width * 100)}×{Math.round(cut.height * 100)}%
                </span>
              </div>

              {/* Hint inside empty cut */}
              {!isFilled && cut.width > 0.12 && cut.height > 0.08 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/90 backdrop-blur-sm px-3 py-2 border border-accent flex items-center gap-2">
                    <ImagePlus size={12} className="text-accent" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
                      {tool === 'fill' ? 'Click → Fill' : 'Switch to Fill'}
                    </span>
                  </div>
                </div>
              )}

              {/* Resize handles (only when select tool is active) */}
              {tool === 'select' && isSelected && (
                <>
                  <button
                    onMouseDown={(e) => startResize(e, cut, 'nw')}
                    className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-accent border border-white cursor-nw-resize"
                  />
                  <button
                    onMouseDown={(e) => startResize(e, cut, 'ne')}
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-accent border border-white cursor-ne-resize"
                  />
                  <button
                    onMouseDown={(e) => startResize(e, cut, 'sw')}
                    className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-accent border border-white cursor-sw-resize"
                  />
                  <button
                    onMouseDown={(e) => startResize(e, cut, 'se')}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-accent border border-white cursor-se-resize"
                  />
                </>
              )}

              {/* Floating action chips on hover (select tool) */}
              {tool === 'select' && isSelected && (
                <div className="absolute -bottom-9 left-0 flex items-center gap-1 animate-fade-in">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerFill(cut.id);
                    }}
                    className="bg-inverse text-inverseText hover:bg-accent hover:text-white font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-1 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ImagePlus size={10} />
                    {isFilled ? 'Replace' : 'Fill'}
                  </button>
                  {isFilled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCut(cut.id, {
                          fillSrc: undefined,
                          fillName: undefined,
                        });
                      }}
                      className="bg-inverse text-inverseText hover:bg-secondary font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-1 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw size={10} />
                      Clear Fill
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCut(cut.id);
                    }}
                    className="bg-red-500 text-white hover:bg-red-600 font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-1 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 size={10} />
                    Cut
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* In-progress create rectangle */}
        {drag?.kind === 'create' && tempRect && (
          <div
            className="absolute pointer-events-none border-2 border-accent bg-accent/10"
            style={{
              left: `${tempRect.x * 100}%`,
              top: `${tempRect.y * 100}%`,
              width: `${tempRect.width * 100}%`,
              height: `${tempRect.height * 100}%`,
            }}
          >
            <div className="absolute -top-5 left-0 bg-accent text-white font-mono text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5">
              {Math.round(tempRect.width * 100)}×
              {Math.round(tempRect.height * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CornerBrackets: React.FC = () => (
  <>
    <span className="absolute -top-2 -left-2 w-4 h-4 border-l-2 border-t-2 border-secondary/40 pointer-events-none" />
    <span className="absolute -top-2 -right-2 w-4 h-4 border-r-2 border-t-2 border-secondary/40 pointer-events-none" />
    <span className="absolute -bottom-2 -left-2 w-4 h-4 border-l-2 border-b-2 border-secondary/40 pointer-events-none" />
    <span className="absolute -bottom-2 -right-2 w-4 h-4 border-r-2 border-b-2 border-secondary/40 pointer-events-none" />
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VIEW
// ─────────────────────────────────────────────────────────────────────────────

const StoryboardView: React.FC = () => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('crop');
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [bakes, setBakes] = useState<Bake[]>([]);
  const [isBaking, setIsBaking] = useState(false);
  const [bakeFlash, setBakeFlash] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [zoom, setZoom] = useState(1);

  const sourceInputRef = useRef<HTMLInputElement>(null);
  const fillInputRef = useRef<HTMLInputElement>(null);
  const fillTargetCutRef = useRef<string | null>(null);

  const activeFrame = useMemo(
    () => frames.find((f) => f.id === activeFrameId) ?? null,
    [frames, activeFrameId]
  );

  // ── File ingestion ────────────────────────────────────────────────────────
  const ingestSource = useCallback(async (file: File) => {
    try {
      const frame = await readFileAsFrame(file);
      setFrames((prev) => [...prev, frame]);
      setActiveFrameId(frame.id);
      setSelectedCutId(null);
    } catch {
      /* ignore non-images */
    }
  }, []);

  const onUploadSource = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((f) => ingestSource(f));
    if (sourceInputRef.current) sourceInputRef.current.value = '';
  };

  // ── Cut operations ────────────────────────────────────────────────────────
  const updateActiveFrame = (mut: (f: Frame) => Frame) => {
    if (!activeFrameId) return;
    setFrames((prev) =>
      prev.map((f) => (f.id === activeFrameId ? mut(f) : f))
    );
  };

  const handleCreateCut = (cut: Cut) => {
    updateActiveFrame((f) => ({ ...f, cuts: [...f.cuts, cut] }));
    setSelectedCutId(cut.id);
    // After creating a cut, auto-switch to fill mode for fast workflow
    setTool('fill');
  };

  const handleUpdateCut = (id: string, patch: Partial<Cut>) => {
    updateActiveFrame((f) => ({
      ...f,
      cuts: f.cuts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const handleDeleteCut = (id: string) => {
    updateActiveFrame((f) => ({
      ...f,
      cuts: f.cuts.filter((c) => c.id !== id),
    }));
    if (selectedCutId === id) setSelectedCutId(null);
  };

  // ── Fill flow ─────────────────────────────────────────────────────────────
  const triggerFillForCut = (cutId: string) => {
    fillTargetCutRef.current = cutId;
    fillInputRef.current?.click();
  };

  const handleFillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const cutId = fillTargetCutRef.current;
    if (file && cutId) {
      const src = await readFileAsDataURL(file);
      handleUpdateCut(cutId, { fillSrc: src, fillName: file.name });
      setTool('select');
    }
    fillTargetCutRef.current = null;
    if (fillInputRef.current) fillInputRef.current.value = '';
  };

  // ── Stitch ────────────────────────────────────────────────────────────────
  const handleStitch = async () => {
    if (!activeFrame) return;
    if (activeFrame.cuts.length === 0) return;
    setIsBaking(true);
    try {
      const src = await bakeFrame(activeFrame);
      const img = await loadImage(src);
      const bake: Bake = {
        id: crypto.randomUUID(),
        src,
        width: img.width,
        height: img.height,
        createdAt: Date.now(),
      };
      setBakes((prev) => [bake, ...prev].slice(0, 12));
      // Replace the active frame with the baked composite so further edits can stack
      updateActiveFrame((f) => ({
        ...f,
        src: bake.src,
        cuts: [],
        name: `${f.name.replace(/\.[^.]+$/, '')} (stitched).png`,
      }));
      setSelectedCutId(null);
      setBakeFlash(true);
      window.setTimeout(() => setBakeFlash(false), 700);
    } finally {
      setIsBaking(false);
    }
  };

  const handleExportBake = (bake: Bake) => {
    const a = document.createElement('a');
    a.href = bake.src;
    a.download = `storyboard-stitch-${bake.id.slice(0, 6)}.png`;
    a.click();
  };

  // ── File drop on viewport ────────────────────────────────────────────────
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
    Array.from(e.dataTransfer.files ?? []).forEach((f) =>
      ingestSource(f as File)
    );
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )
        return;
      if (e.key === 'v') setTool('select');
      if (e.key === 'c') setTool('crop');
      if (e.key === 'f') setTool('fill');
      if (e.key === 'h') setTool('pan');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasCuts = (activeFrame?.cuts.length ?? 0) > 0;
  const hasUnfilledCut =
    activeFrame?.cuts.some((c) => !c.fillSrc) ?? false;

  return (
    <div
      className="w-full h-full flex bg-background relative font-sans"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Hidden inputs */}
      <input
        type="file"
        ref={sourceInputRef}
        onChange={onUploadSource}
        className="hidden"
        accept="image/*"
        multiple
      />
      <input
        type="file"
        ref={fillInputRef}
        onChange={handleFillUpload}
        className="hidden"
        accept="image/*"
      />

      {/* Drop overlay */}
      {isDraggingFile && (
        <div className="absolute inset-4 z-50 border-2 border-dashed border-accent bg-accent/5 rounded-3xl flex items-center justify-center backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-background px-8 py-4 rounded-full shadow-elevated border border-accent/20 flex items-center gap-3">
            <Upload className="text-accent animate-bounce" size={24} />
            <span className="font-serif text-xl text-primary">
              Drop frame to load
            </span>
          </div>
        </div>
      )}

      {/* ── LEFT: SOURCES + TOOLS DOCK ─────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-background z-10">
        {/* Header */}
        <div className="h-20 px-5 flex items-center justify-between border-b border-border">
          <div>
            <span className="font-mono text-[10px] text-accent tracking-[0.25em] uppercase block mb-1">
              Reel
            </span>
            <span className="font-serif text-lg text-primary">
              Frames{' '}
              <span className="font-sans text-xs text-secondary">
                ({frames.length.toString().padStart(2, '0')})
              </span>
            </span>
          </div>
          <button
            onClick={() => sourceInputRef.current?.click()}
            className="w-9 h-9 flex items-center justify-center bg-inverse text-inverseText hover:bg-accent hover:text-white transition-colors rounded-full cursor-pointer"
            title="Load frame"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Frames list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {frames.length === 0 && (
            <button
              onClick={() => sourceInputRef.current?.click()}
              className="w-full mt-4 py-10 border border-dashed border-border rounded-lg flex flex-col items-center gap-3 text-secondary hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              <Upload size={22} />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em]">
                Load Frame
              </span>
            </button>
          )}

          {frames.map((frame, i) => {
            const isActive = frame.id === activeFrameId;
            return (
              <div
                key={frame.id}
                onClick={() => {
                  setActiveFrameId(frame.id);
                  setSelectedCutId(null);
                }}
                className={`group relative overflow-hidden border cursor-pointer transition-all ${
                  isActive
                    ? 'border-accent'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <div className="absolute top-1.5 left-1.5 font-mono text-[8px] tracking-[0.2em] text-white bg-black/60 px-1 py-0.5 z-10">
                  {(i + 1).toString().padStart(2, '0')}
                </div>
                <img
                  src={frame.src}
                  alt={frame.name}
                  className="w-full h-24 object-cover block"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 flex items-end justify-between">
                  <span className="text-white text-[10px] font-medium truncate max-w-[120px]">
                    {frame.name}
                  </span>
                  {frame.cuts.length > 0 && (
                    <span className="text-accent font-mono text-[8px] bg-black/60 px-1">
                      {frame.cuts.length} cut
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFrames((prev) =>
                      prev.filter((f) => f.id !== frame.id)
                    );
                    if (activeFrameId === frame.id) {
                      const next = frames.find((f) => f.id !== frame.id);
                      setActiveFrameId(next?.id ?? null);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all cursor-pointer"
                  title="Remove frame"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Instrument legend */}
        <div className="border-t border-border p-4 space-y-1.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-secondary mb-2">
            Hotkeys
          </div>
          <ShortcutRow keys="V" label="Select" />
          <ShortcutRow keys="C" label="Crop" />
          <ShortcutRow keys="F" label="Fill" />
          <ShortcutRow keys="⌫" label="Delete cut" />
        </div>
      </aside>

      {/* ── CENTER: CANVAS WORKBENCH ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute inset-0 grid-bg pointer-events-none" />

        {/* Header */}
        <header className="h-20 flex items-center justify-between px-10 border-b border-border z-10 bg-background/80 backdrop-blur-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-accent font-bold tracking-[0.25em] uppercase">
                06 — Storyboard
              </span>
              <div className="h-px w-8 bg-accent" />
            </div>
            <h1 className="font-serif text-3xl text-primary mt-1">
              Cutting Bench
            </h1>
          </div>

          {/* Live status pill */}
          <div className="flex items-center gap-6">
            {activeFrame && (
              <div className="hidden md:flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-secondary">
                <span>STATUS</span>
                <span className="w-px h-4 bg-border" />
                <span className={hasCuts ? 'text-accent' : ''}>
                  {hasCuts
                    ? `${activeFrame.cuts.length} cut${
                        activeFrame.cuts.length === 1 ? '' : 's'
                      } · ${
                        activeFrame.cuts.filter((c) => c.fillSrc).length
                      } patched`
                    : 'No cuts'}
                </span>
              </div>
            )}

            <ZoomControls zoom={zoom} setZoom={setZoom} />
          </div>
        </header>

        {/* Canvas viewport */}
        <div className="flex-1 relative overflow-auto z-10">
          {!activeFrame ? (
            <EmptyState onUpload={() => sourceInputRef.current?.click()} />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center p-10 pl-24"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease-out',
              }}
            >
              <FrameCanvas
                frame={activeFrame}
                tool={tool}
                selectedCutId={selectedCutId}
                onSelectCut={setSelectedCutId}
                onCreateCut={handleCreateCut}
                onUpdateCut={handleUpdateCut}
                onDeleteCut={handleDeleteCut}
                onTriggerFill={triggerFillForCut}
              />
            </div>
          )}

          {/* Bake flash overlay */}
          {bakeFlash && (
            <div className="absolute inset-0 pointer-events-none bg-accent/10 animate-fade-in" />
          )}

          {/* Tool dock — vertical, brutalist */}
          <ToolDock tool={tool} setTool={setTool} disabled={!activeFrame} />

          {/* Stitch action — bottom center */}
          {activeFrame && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 animate-slide-up">
              <button
                onClick={handleStitch}
                disabled={!hasCuts || isBaking}
                className={`group relative px-7 py-4 font-mono text-xs uppercase tracking-[0.3em] font-bold flex items-center gap-3 transition-all cursor-pointer shadow-elevated ${
                  hasCuts && !isBaking
                    ? 'bg-accent text-white hover:bg-orange-600 hover:scale-[1.02]'
                    : 'bg-secondary/20 text-secondary cursor-not-allowed'
                }`}
                style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
                title={hasCuts ? 'Bake cuts into the frame' : 'Crop a region first'}
              >
                {isBaking ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Sealing</span>
                  </>
                ) : (
                  <>
                    <Scissors size={14} />
                    <span>Stitch & Seal</span>
                    <ChevronRight
                      size={14}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
                {hasUnfilledCut && !isBaking && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 font-mono text-[8px] uppercase tracking-[0.2em] text-secondary whitespace-nowrap">
                    ↑ unfilled cuts will punch through
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Bottom strip — bake history */}
        {bakes.length > 0 && (
          <div className="h-32 border-t border-border bg-surface/30 z-10 flex flex-col">
            <div className="px-6 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles size={12} className="text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-secondary">
                  Sealed · {bakes.length.toString().padStart(2, '0')}
                </span>
              </div>
              <button
                onClick={() => setBakes([])}
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-secondary hover:text-red-500 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-x-auto px-6 py-3 flex gap-3 items-center">
              {bakes.map((b, i) => (
                <div
                  key={b.id}
                  className="group relative flex-shrink-0 h-20 bg-background border border-border hover:border-accent transition-colors"
                  style={{ aspectRatio: `${b.width} / ${b.height}` }}
                >
                  <img
                    src={b.src}
                    alt="bake"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-1 left-1 font-mono text-[8px] tracking-[0.2em] bg-inverse text-inverseText px-1">
                    {bakes.length - i}
                  </div>
                  <button
                    onClick={() => handleExportBake(b)}
                    className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] cursor-pointer"
                  >
                    <Download size={11} /> Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── RIGHT: INSPECTOR ─────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-background z-10">
        <div className="h-20 px-6 flex flex-col justify-center border-b border-border">
          <span className="font-mono text-[10px] text-accent tracking-[0.25em] uppercase mb-1">
            Inspector
          </span>
          <span className="font-serif text-lg text-primary">
            {activeFrame ? 'Cuts & Patches' : 'No frame loaded'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!activeFrame && (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary leading-relaxed">
              Load a frame to start cutting. Drag a region with the{' '}
              <span className="text-accent">Crop</span> tool, then drop another
              image into the hole.
            </p>
          )}

          {activeFrame?.cuts.length === 0 && (
            <div className="border border-dashed border-border p-5 text-center space-y-3">
              <CropIcon size={22} className="text-secondary/60 mx-auto" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-secondary leading-relaxed">
                Press <span className="text-accent">C</span> and drag on the
                frame to define a cut.
              </p>
            </div>
          )}

          {activeFrame?.cuts.map((cut, i) => {
            const isSelected = cut.id === selectedCutId;
            const isFilled = !!cut.fillSrc;
            return (
              <div
                key={cut.id}
                onClick={() => setSelectedCutId(cut.id)}
                className={`p-3 border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex-shrink-0 w-12 h-12 border border-border overflow-hidden bg-surface relative"
                    style={{
                      background: !isFilled
                        ? 'repeating-conic-gradient(rgba(255,85,46,0.15) 0% 25%, transparent 0% 50%) 50% / 8px 8px'
                        : undefined,
                    }}
                  >
                    {isFilled && (
                      <img
                        src={cut.fillSrc}
                        alt="fill"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 ${
                          isFilled
                            ? 'bg-accent text-white'
                            : 'bg-inverse text-inverseText'
                        }`}
                      >
                        {isFilled ? 'PATCH' : 'CUT'} {(i + 1).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] text-secondary mt-1 truncate">
                      {isFilled ? cut.fillName : 'empty — will punch through'}
                    </div>
                    <div className="font-mono text-[9px] text-secondary">
                      {Math.round(cut.width * 100)}×
                      {Math.round(cut.height * 100)}%
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="flex gap-1.5 mt-3 animate-fade-in">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFillForCut(cut.id);
                      }}
                      className="flex-1 bg-inverse text-inverseText hover:bg-accent hover:text-white font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-1.5 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isFilled ? <Replace size={10} /> : <ImagePlus size={10} />}
                      {isFilled ? 'Replace' : 'Fill'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCut(cut.id);
                      }}
                      className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Frame reset */}
        {activeFrame && (
          <div className="border-t border-border p-5 space-y-2">
            <button
              onClick={() => {
                updateActiveFrame((f) => ({ ...f, cuts: [] }));
                setSelectedCutId(null);
              }}
              disabled={!hasCuts}
              className="w-full bg-surface hover:bg-border text-primary px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw size={12} />
              Discard cuts
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const ShortcutRow: React.FC<{ keys: string; label: string }> = ({
  keys,
  label,
}) => (
  <div className="flex items-center justify-between">
    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-secondary">
      {label}
    </span>
    <span className="font-mono text-[10px] text-primary bg-surface border border-border px-1.5 py-0.5 min-w-[20px] text-center">
      {keys}
    </span>
  </div>
);

interface ToolDockProps {
  tool: Tool;
  setTool: (t: Tool) => void;
  disabled: boolean;
}

const ToolDock: React.FC<ToolDockProps> = ({ tool, setTool, disabled }) => {
  const tools: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
    { id: 'select', icon: <MousePointer2 size={18} />, label: 'Select', key: 'V' },
    { id: 'crop', icon: <CropIcon size={18} />, label: 'Crop', key: 'C' },
    { id: 'fill', icon: <ImagePlus size={18} />, label: 'Fill', key: 'F' },
    { id: 'pan', icon: <Hand size={18} />, label: 'Pan', key: 'H' },
  ];

  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-6 z-30">
      <div className="bg-background border border-border shadow-elevated flex flex-col">
        <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-secondary text-center py-1.5 border-b border-border bg-surface/40">
          TOOLS
        </div>
        {tools.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              disabled={disabled}
              className={`group relative w-12 h-12 flex items-center justify-center border-b border-border last:border-b-0 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                active
                  ? 'bg-accent text-white'
                  : 'text-secondary hover:text-primary hover:bg-surface'
              }`}
              title={`${t.label} (${t.key})`}
            >
              {t.icon}
              {/* hotkey badge */}
              <span
                className={`absolute bottom-0.5 right-0.5 font-mono text-[7px] tracking-wider ${
                  active ? 'text-white/80' : 'text-secondary/60'
                }`}
              >
                {t.key}
              </span>
              {/* tooltip */}
              <span className="absolute left-14 px-2.5 py-1 bg-inverse text-inverseText text-[10px] font-mono uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface ZoomControlsProps {
  zoom: number;
  setZoom: (z: number) => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, setZoom }) => (
  <div className="flex items-center gap-1 border border-border bg-background">
    <button
      onClick={() => setZoom(clamp(zoom - 0.1, 0.3, 2))}
      className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors cursor-pointer"
      title="Zoom out"
    >
      <ZoomOut size={14} />
    </button>
    <button
      onClick={() => setZoom(1)}
      className="px-2 h-8 font-mono text-[10px] uppercase tracking-[0.15em] text-secondary hover:text-primary transition-colors cursor-pointer min-w-[44px]"
      title="Reset zoom"
    >
      {Math.round(zoom * 100)}%
    </button>
    <button
      onClick={() => setZoom(clamp(zoom + 0.1, 0.3, 2))}
      className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors cursor-pointer"
      title="Zoom in"
    >
      <ZoomIn size={14} />
    </button>
    <button
      onClick={() => setZoom(1)}
      className="w-8 h-8 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors cursor-pointer border-l border-border"
      title="Fit"
    >
      <Maximize2 size={12} />
    </button>
  </div>
);

const EmptyState: React.FC<{ onUpload: () => void }> = ({ onUpload }) => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="text-center space-y-8 max-w-md">
      <div className="relative inline-block">
        <CornerBrackets />
        <div className="w-32 h-32 bg-surface flex items-center justify-center mx-auto">
          <Clapperboard size={40} className="text-secondary/40" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-accent" />
          <span className="font-mono text-[10px] text-accent tracking-[0.3em] uppercase">
            Empty Bench
          </span>
          <span className="h-px w-8 bg-accent" />
        </div>
        <h3 className="font-serif text-4xl text-primary leading-tight">
          Cut. Patch.
          <br />
          Stitch.
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-secondary leading-relaxed">
          Load a frame to start.
          <br />
          Carve regions. Slot in new imagery. Seal it.
        </p>
      </div>

      <button
        onClick={onUpload}
        className="bg-inverse text-inverseText hover:bg-accent hover:text-white font-mono text-xs uppercase tracking-[0.3em] px-6 py-3.5 inline-flex items-center gap-3 transition-colors cursor-pointer shadow-elevated"
      >
        <Upload size={14} />
        Load Frame
      </button>

      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
        <Step n="01" label="Drag Cut" icon={<CropIcon size={14} />} />
        <Step n="02" label="Drop Image" icon={<ImagePlus size={14} />} />
        <Step n="03" label="Seal" icon={<Scissors size={14} />} />
      </div>
    </div>
  </div>
);

const Step: React.FC<{ n: string; label: string; icon: React.ReactNode }> = ({
  n,
  label,
  icon,
}) => (
  <div className="flex flex-col items-center gap-2 py-3 border border-border">
    <span className="font-mono text-[10px] text-accent tracking-[0.2em]">
      {n}
    </span>
    <span className="text-primary">{icon}</span>
    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-secondary">
      {label}
    </span>
  </div>
);

export default StoryboardView;

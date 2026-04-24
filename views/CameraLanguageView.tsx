import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  Copy,
  Check,
  X,
  Camera,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Film,
  Play,
} from 'lucide-react';
import { CameraMove, CameraMoveCategory } from '../types';
import {
  CAMERA_CATEGORIES,
  CAMERA_MOVES,
  filterCameraMoves,
  formatCameraMoveForCopy,
  getCameraCategoryMeta,
  getCameraPreviewVideoUrl,
  getCameraPreviewPosterUrl,
} from '../utils/cameraLanguage';

const CATEGORY_COLORS: Record<CameraMoveCategory, { bg: string; text: string; ring: string }> = {
  push_pull: { bg: 'bg-accent/10', text: 'text-accent', ring: 'ring-accent/30' },
  orbit: { bg: 'bg-sky-500/10', text: 'text-sky-500', ring: 'ring-sky-500/30' },
  vertical: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', ring: 'ring-emerald-500/30' },
  lateral: { bg: 'bg-amber-500/10', text: 'text-amber-500', ring: 'ring-amber-500/30' },
  lens_focus: { bg: 'bg-violet-500/10', text: 'text-violet-500', ring: 'ring-violet-500/30' },
  creative: { bg: 'bg-rose-500/10', text: 'text-rose-500', ring: 'ring-rose-500/30' },
};

function CategoryChip({
  category,
  size = 'sm',
}: {
  category: CameraMoveCategory;
  size?: 'sm' | 'xs';
}) {
  const meta = getCameraCategoryMeta(category);
  const colors = CATEGORY_COLORS[category];
  const sizing =
    size === 'xs'
      ? 'text-[9px] px-1.5 py-0.5 tracking-wider'
      : 'text-[10px] px-2 py-0.5 tracking-wider';
  return (
    <span
      className={`font-mono font-semibold uppercase rounded-full ${colors.bg} ${colors.text} ${sizing}`}
    >
      {meta.shortLabel}
    </span>
  );
}

function IntentTag({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-surface text-[10px] font-medium text-secondary">
      {tag}
    </span>
  );
}

/**
 * Shows a preview frame for a camera move. Tries poster image first, falls
 * back to an empty-slot placeholder if the asset is missing. In "video" mode
 * the <video> element sits on top and plays on demand (hover for cards,
 * autoplay for detail).
 */
function CameraPreview({
  move,
  mode,
  active,
  className,
}: {
  move: CameraMove;
  mode: 'thumb' | 'detail';
  active?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [posterOk, setPosterOk] = useState(true);
  const [videoOk, setVideoOk] = useState(true);

  const posterUrl = getCameraPreviewPosterUrl(move);
  const videoUrl = getCameraPreviewVideoUrl(move);
  const shouldPlay = mode === 'detail' ? true : !!active;

  useEffect(() => {
    setPosterOk(true);
    setVideoOk(true);
  }, [move.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (shouldPlay) {
      v.play().catch(() => {
        /* autoplay can fail silently; harmless */
      });
    } else {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [shouldPlay]);

  const hasAnyAsset = posterOk || videoOk;

  return (
    <div
      className={`absolute inset-0 w-full h-full overflow-hidden ${className ?? ''}`}
      style={{ background: 'radial-gradient(circle at 30% 20%, #1f1f22, #09090b 70%)' }}
    >
      {posterOk && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setPosterOk(false)}
          draggable={false}
        />
      )}

      {videoOk && (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterOk ? posterUrl : undefined}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            shouldPlay ? 'opacity-100' : 'opacity-0'
          }`}
          muted
          loop
          playsInline
          preload={mode === 'detail' ? 'auto' : 'metadata'}
          onError={() => setVideoOk(false)}
        />
      )}

      {!hasAnyAsset && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Film size={mode === 'detail' ? 26 : 22} className="text-white/30" strokeWidth={1.5} />
          <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">
            Preview soon
          </span>
        </div>
      )}
    </div>
  );
}

function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  return Promise.resolve(false);
}

export default function CameraLanguageView() {
  const [query, setQuery] = useState('');
  const [activeCategories, setActiveCategories] = useState<CameraMoveCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailCopied, setDetailCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filterCameraMoves(CAMERA_MOVES, {
        query,
        categories: activeCategories,
      }),
    [query, activeCategories],
  );

  const selected: CameraMove | null = useMemo(() => {
    if (!selectedId) return null;
    return CAMERA_MOVES.find((m) => m.id === selectedId) ?? null;
  }, [selectedId]);

  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(t);
  }, [copiedId]);

  useEffect(() => {
    if (!detailCopied) return;
    const t = setTimeout(() => setDetailCopied(false), 1500);
    return () => clearTimeout(t);
  }, [detailCopied]);

  const toggleCategory = (cat: CameraMoveCategory) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleCopy = useCallback(async (move: CameraMove) => {
    const text = formatCameraMoveForCopy(move);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(move.id);
      setClipboardError(null);
    } else {
      setClipboardError(
        'Clipboard unavailable — open the term and select the description text manually.',
      );
    }
  }, []);

  const handleDetailCopy = useCallback(async (move: CameraMove) => {
    const text = formatCameraMoveForCopy(move);
    const ok = await copyToClipboard(text);
    if (ok) {
      setDetailCopied(true);
      setClipboardError(null);
    } else {
      setClipboardError(
        'Clipboard unavailable — select the description text below manually.',
      );
    }
  }, []);

  const resetFilters = () => {
    setQuery('');
    setActiveCategories([]);
  };

  return (
    <div className="w-full h-full overflow-hidden relative animate-fade-in flex flex-col">
      <div className="absolute inset-0 grid-bg pointer-events-none z-0" />

      {/* Header */}
      <div className="relative z-10 px-6 md:px-10 pt-8 pb-4 border-b border-border bg-background/70 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">
                  05 — Camera
                </span>
                <div className="h-px w-8 bg-accent" />
              </div>
              <h2 className="font-serif text-3xl md:text-4xl text-primary mt-1">
                Camera Language Library
              </h2>
              <p className="text-sm text-secondary mt-2 max-w-xl leading-relaxed">
                Pick the shot by what you want the viewer to feel. Copy the ready description. Paste
                it into Seedance, Kling, Runway, or Higgsfield.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-secondary">
              <Sparkles size={12} className="text-accent" />
              {filtered.length} / {CAMERA_MOVES.length} moves
            </div>
          </div>

          {/* Search + Filters */}
          <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1 max-w-xl">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/70 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dolly, tension, POV, reveal…"
                className="w-full pl-10 pr-10 py-2.5 bg-surface border border-border rounded-lg text-sm text-primary placeholder:text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {CAMERA_CATEGORIES.map((cat) => {
                const active = activeCategories.includes(cat.id);
                const colors = CATEGORY_COLORS[cat.id];
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    title={cat.description}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider transition-all border ${
                      active
                        ? `${colors.bg} ${colors.text} border-transparent ring-2 ${colors.ring}`
                        : 'bg-surface text-secondary border-border hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                );
              })}
              {(query || activeCategories.length > 0) && (
                <button
                  onClick={resetFilters}
                  className="px-2.5 py-1.5 rounded-full text-[11px] font-medium text-secondary hover:text-primary transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {clipboardError && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} />
              {clipboardError}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full flex">
          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
                  <Camera size={24} className="text-secondary/60" />
                </div>
                <p className="font-serif text-xl text-primary">No camera terms match this filter.</p>
                <p className="text-sm text-secondary mt-2">
                  Try clearing the search or toggling a category.
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-4 text-xs font-mono uppercase tracking-widest text-accent hover:underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map((move) => {
                  const isActive = selected?.id === move.id;
                  const isCopied = copiedId === move.id;
                  return (
                    <button
                      key={move.id}
                      onClick={() => setSelectedId(move.id)}
                      onMouseEnter={() => setHoveredId(move.id)}
                      onMouseLeave={() => setHoveredId((prev) => (prev === move.id ? null : prev))}
                      onFocus={() => setHoveredId(move.id)}
                      onBlur={() => setHoveredId((prev) => (prev === move.id ? null : prev))}
                      className={`group text-left relative overflow-hidden rounded-xl transition-all ${
                        isActive
                          ? 'ring-2 ring-accent shadow-elevated'
                          : 'ring-1 ring-border/60 hover:ring-primary/40 hover:shadow-elevated'
                      }`}
                      style={{ aspectRatio: '4 / 5' }}
                    >
                      <CameraPreview
                        move={move}
                        mode="thumb"
                        active={hoveredId === move.id}
                      />

                      {/* Top gradient + category + copy */}
                      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none" />
                      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 z-10">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15">
                          <CategoryChip category={move.category} size="xs" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(move);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCopy(move);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider cursor-pointer transition-all backdrop-blur-md ${
                            isCopied
                              ? 'bg-emerald-500/90 text-white border border-emerald-400/60'
                              : 'bg-black/55 text-white border border-white/20 hover:bg-accent hover:border-accent'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check size={11} /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={11} /> Copy
                            </>
                          )}
                        </span>
                      </div>

                      {/* Hover play hint */}
                      <div
                        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/30 flex items-center justify-center transition-all duration-300 pointer-events-none ${
                          hoveredId === move.id
                            ? 'opacity-0 scale-90'
                            : 'opacity-0 group-hover:opacity-100 scale-100'
                        }`}
                      >
                        <Play size={16} className="text-white translate-x-[1px]" fill="white" />
                      </div>

                      {/* Bottom gradient + text */}
                      <div className="absolute inset-x-0 bottom-0 pt-20 pb-4 px-4 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
                        <h3 className="font-serif text-xl md:text-2xl text-white leading-tight drop-shadow-md">
                          {move.name}
                        </h3>
                        {move.aliases && move.aliases.length > 0 && (
                          <p className="text-[11px] text-white/60 mt-1 truncate">
                            aka {move.aliases.join(' · ')}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {move.intentTags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-[10px] font-medium text-white/90"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/70 group-hover:text-accent transition-colors">
                          Details <ChevronRight size={10} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <aside
            className={`hidden lg:flex flex-col w-[420px] border-l border-border bg-background/60 backdrop-blur-sm transition-all ${
              selected ? '' : 'opacity-100'
            }`}
          >
            {selected ? (
              <DetailPanel
                move={selected}
                onClose={() => setSelectedId(null)}
                onCopy={() => handleDetailCopy(selected)}
                copied={detailCopied}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                  <Camera size={22} className="text-accent" />
                </div>
                <p className="font-serif text-xl text-primary">Pick a shot.</p>
                <p className="text-sm text-secondary mt-2 max-w-xs leading-relaxed">
                  Click any camera move to see definition, emotional effect, use-when guidance, and
                  the copy-ready prompt.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Mobile / narrow detail drawer */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end md:items-center md:justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full md:max-w-xl max-h-[85vh] overflow-y-auto bg-background border-t md:border border-border md:rounded-2xl shadow-elevated">
            <DetailPanel
              move={selected}
              onClose={() => setSelectedId(null)}
              onCopy={() => handleDetailCopy(selected)}
              copied={detailCopied}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  move,
  onClose,
  onCopy,
  copied,
}: {
  move: CameraMove;
  onClose: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const meta = getCameraCategoryMeta(move.category);
  const formatted = formatCameraMoveForCopy(move);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CategoryChip category={move.category} />
              <span className="font-mono text-[10px] uppercase tracking-widest text-secondary truncate">
                {meta.label}
              </span>
            </div>
            <h3 className="font-serif text-2xl text-primary leading-tight">{move.name}</h3>
            {move.aliases && move.aliases.length > 0 && (
              <p className="text-xs text-secondary mt-1">aka {move.aliases.join(' · ')}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface text-secondary hover:text-primary flex items-center justify-center transition-all flex-shrink-0"
            aria-label="Close detail"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-6 flex-1">
        <div
          className="relative w-full overflow-hidden rounded-lg border border-border"
          style={{ aspectRatio: '16 / 9' }}
        >
          <CameraPreview move={move} mode="detail" />
        </div>

        <section>
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-secondary mb-2">
            Definition
          </h4>
          <p className="text-sm text-primary leading-relaxed">{move.definition}</p>
        </section>

        <section>
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-secondary mb-2">
            Emotional effect
          </h4>
          <p className="text-sm text-primary leading-relaxed italic font-serif">
            {move.emotionalEffect}
          </p>
        </section>

        <section>
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-secondary mb-2">
            Use when
          </h4>
          <ul className="space-y-1.5">
            {move.bestFor.map((item) => (
              <li key={item} className="text-sm text-primary flex gap-2">
                <span className="text-accent mt-0.5">→</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {move.risk && (
          <section>
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              Avoid when
            </h4>
            <p className="text-sm text-primary leading-relaxed">{move.risk}</p>
          </section>
        )}

        <section>
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-secondary mb-2">
            Intent
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {move.intentTags.map((tag) => (
              <IntentTag key={tag} tag={tag} />
            ))}
          </div>
        </section>

        {move.modelNotes && (
          <section className="bg-surface border border-border rounded-lg p-4">
            <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-accent mb-2 flex items-center gap-1.5">
              <Sparkles size={11} />
              Model notes
            </h4>
            <p className="text-xs text-primary leading-relaxed">{move.modelNotes}</p>
          </section>
        )}

        <section>
          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-secondary mb-2">
            Copy-ready prompt
          </h4>
          <pre className="bg-surface border border-border rounded-lg p-4 text-xs font-mono text-primary whitespace-pre-wrap leading-relaxed select-text">
{formatted}
          </pre>
        </section>
      </div>

      {/* Sticky footer CTA */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border px-6 py-4">
        <button
          onClick={onCopy}
          className={`w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium rounded-lg shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 ${
            copied
              ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-accent text-white'
          }`}
        >
          {copied ? (
            <>
              <Check size={16} /> Description copied
            </>
          ) : (
            <>
              <Copy size={16} /> Copy description
            </>
          )}
        </button>
      </div>
    </div>
  );
}

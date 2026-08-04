/**
 * Auto-stitch layout — justified rows of WHOLE images.
 *
 * Layer Studio's existing "Fill" auto layout tiles the artboard with equal cells
 * and crops each image to cover its cell. This module does the opposite: every
 * image keeps its full frame and its native aspect, and the rows are justified
 * so the block reads as one composed sheet (the Smart Stitch look).
 *
 * The engine is pure — no DOM, no canvas — so the row math is unit-testable and
 * shared by the "fit inside the artboard" and "size the artboard to the stitch"
 * paths.
 *
 * Geometry, for a partition of n items into r contiguous rows:
 *   A_i  = sum of aspect ratios in row i
 *   h_i  = (W - (n_i - 1) * gap) / A_i        (every row justified to width W)
 *   H    = sum(h_i) + (r - 1) * gap
 *        = W * S - gap * G + (r - 1) * gap    with S = sum(1/A_i), G = sum((n_i-1)/A_i)
 * H is linear in W, so fitting a box is a single solve rather than a search.
 */

export interface StitchInput {
  id: string;
  width: number;
  height: number;
}

export interface StitchPlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StitchLayout {
  /** Item count per row, in input order. */
  rows: number[];
  /** Block extent including the outer margin. */
  width: number;
  height: number;
  items: StitchPlacement[];
  /**
   * Extra scale this layout would need for every image to sit at full native
   * resolution. 1 = already lossless; 1.5 = a pixel cap held it 1.5x short, so
   * export at 1.5x to get the source detail back.
   */
  nativeScale: number;
}

/** Above this count the partition space is too large to enumerate; even rows win. */
const MAX_ENUMERATED = 12;

const aspectOf = (it: StitchInput) => {
  const w = it.width > 0 ? it.width : 1;
  const h = it.height > 0 ? it.height : 1;
  return w / h;
};

/** Aspect of the block a partition produces, ignoring gaps (gap-free is a good proxy). */
const blockAspectFor = (aspects: number[], counts: number[]): number => {
  let s = 0;
  let idx = 0;
  for (const n of counts) {
    let a = 0;
    for (let k = 0; k < n; k++) a += aspects[idx++];
    s += 1 / a;
  }
  return s > 0 ? 1 / s : 1;
};

/** Even split of n items across r contiguous rows (leftovers go to the top rows). */
const evenCounts = (n: number, r: number): number[] => {
  const base = Math.floor(n / r);
  const extra = n % r;
  const out: number[] = [];
  for (let i = 0; i < r; i++) out.push(base + (i < extra ? 1 : 0));
  return out;
};

/** Every partition of n into contiguous, non-empty runs. 2^(n-1) of them. */
const allCounts = (n: number): number[][] => {
  const out: number[][] = [];
  const walk = (left: number, acc: number[]) => {
    if (left === 0) { out.push(acc.slice()); return; }
    for (let take = 1; take <= left; take++) {
      acc.push(take);
      walk(left - take, acc);
      acc.pop();
    }
  };
  walk(n, []);
  return out;
};

/**
 * Pick the row split whose block aspect lands closest to `targetAspect`.
 * Item order is preserved (rows are contiguous), so the result stays predictable
 * as the user reorders layers. Ties prefer fewer rows.
 */
export const chooseStitchRows = (items: StitchInput[], targetAspect: number): number[] => {
  const n = items.length;
  if (n <= 1) return n === 1 ? [1] : [];
  const aspects = items.map(aspectOf);
  const target = targetAspect > 0 ? targetAspect : 1;

  const candidates = n <= MAX_ENUMERATED
    ? allCounts(n)
    : Array.from({ length: n }, (_, i) => evenCounts(n, i + 1));

  let best = candidates[0];
  let bestCost = Infinity;
  for (const counts of candidates) {
    const ar = blockAspectFor(aspects, counts);
    // Log-ratio: a 2x-too-wide block costs the same as a 2x-too-tall one.
    const cost = Math.abs(Math.log(ar / target)) + counts.length * 1e-6;
    if (cost < bestCost) { bestCost = cost; best = counts; }
  }
  return best;
};

/** Places rows at width `W` with `gap` between items and as an outer margin. */
const buildRows = (
  items: StitchInput[],
  counts: number[],
  W: number,
  gap: number
): StitchLayout => {
  const placements: StitchPlacement[] = [];
  let idx = 0;
  let y = gap;
  for (const n of counts) {
    const row = items.slice(idx, idx + n);
    idx += n;
    const A = row.reduce((s, it) => s + aspectOf(it), 0) || 1;
    const rowH = Math.max(1, (W - (n - 1) * gap) / A);
    let x = gap;
    for (const it of row) {
      const w = rowH * aspectOf(it);
      placements.push({ id: it.id, x, y, width: w, height: rowH });
      x += w + gap;
    }
    y += rowH + gap;
  }
  return { rows: counts, width: W + gap * 2, height: y, items: placements, nativeScale: 1 };
};

export interface FitStitchOptions {
  boxWidth: number;
  boxHeight: number;
  /** Space between items and around the block, in box units. */
  gap?: number;
  /** Row-split hint; defaults to the box aspect. */
  targetAspect?: number;
  /** Pre-chosen row split (skips the search). */
  rows?: number[];
}

/**
 * Fit the stitch inside a fixed box (the current artboard), centered. The block
 * grows until it hits whichever edge binds first, so nothing is ever cropped and
 * nothing overflows.
 */
export const fitStitchInBox = (items: StitchInput[], opts: FitStitchOptions): StitchLayout => {
  const boxW = Math.max(1, opts.boxWidth);
  const boxH = Math.max(1, opts.boxHeight);
  if (items.length === 0) return { rows: [], width: 0, height: 0, items: [], nativeScale: 1 };

  // A gap larger than the box would invert the available area.
  const gap = Math.max(0, Math.min(opts.gap ?? 0, boxW / 4, boxH / 4));
  const availW = Math.max(1, boxW - gap * 2);
  const availH = Math.max(1, boxH - gap * 2);

  const counts = opts.rows?.length ? opts.rows : chooseStitchRows(items, opts.targetAspect ?? boxW / boxH);
  const aspects = items.map(aspectOf);

  // Solve for the width at which the block is exactly `availH` tall, then take
  // whichever of that and `availW` binds.
  let S = 0;
  let G = 0;
  let idx = 0;
  for (const n of counts) {
    let a = 0;
    for (let k = 0; k < n; k++) a += aspects[idx++];
    a = a || 1;
    S += 1 / a;
    G += (n - 1) / a;
  }
  const widthFromHeight = (availH + gap * G - (counts.length - 1) * gap) / (S || 1);
  const W = Math.max(1, Math.min(availW, widthFromHeight));

  const laid = buildRows(items, counts, W, gap);
  // Center the block in the box (buildRows already applied the outer margin).
  const dx = (boxW - laid.width) / 2;
  const dy = (boxH - laid.height) / 2;
  // Fitting a fixed box almost always shrinks the sources — report by how much so
  // the export can render at full detail.
  let nativeScale = 1;
  for (const p of laid.items) {
    const src = items.find(it => it.id === p.id);
    if (src && p.width > 0) nativeScale = Math.max(nativeScale, src.width / p.width);
  }
  return {
    rows: laid.rows,
    width: laid.width,
    height: laid.height,
    items: laid.items.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })),
    nativeScale,
  };
};

/**
 * Scale at which to render a document so a stitch that the artboard's pixel
 * budget had to shrink comes back out at full source resolution.
 *
 * The working canvas is deliberately capped (a 40MP artboard would make painting
 * and panning crawl), so a dense stitch is laid out smaller than its sources.
 * Export is transient and can afford far more, so it renders at `wanted` — the
 * factor the layout was short by — under its own, looser caps.
 */
export const exportScaleForDoc = (opts: {
  docW: number;
  docH: number;
  /** Scale the composition wants; 1 means the doc is already at full detail. */
  wanted: number;
  /** Floor on the output long edge, so small artboards still export usefully big. */
  minLongEdge?: number;
  maxSide?: number;
  maxPixels?: number;
}): number => {
  const dw = Math.max(1, opts.docW);
  const dh = Math.max(1, opts.docH);
  const long = Math.max(dw, dh);
  const floor = opts.minLongEdge ? Math.max(1, opts.minLongEdge / long) : 1;
  const wanted = Math.max(1, floor, Number.isFinite(opts.wanted) ? opts.wanted : 1);
  const maxSide = opts.maxSide ?? 16384;
  const maxPixels = opts.maxPixels ?? 8192 * 8192;
  const cap = Math.min(maxSide / long, Math.sqrt(maxPixels / (dw * dh)));
  // A doc already past the caps still exports at 1:1 — never below its own pixels.
  return Math.max(1, Math.min(wanted, cap));
};

export interface NativeStitchOptions {
  /** Gap as a fraction of the block width (0.02 = 2%). */
  gapRatio?: number;
  /** Row-split hint — usually the artboard aspect the user picked. */
  targetAspect?: number;
  /** Pre-chosen row split (skips the search). */
  rows?: number[];
  /** Hard caps on the resulting canvas. */
  maxSide?: number;
  maxPixels?: number;
}

/**
 * Size the canvas to the stitch, at a resolution where no image is downscaled.
 *
 * The block is laid out normalized, then scaled up until the most-shrunk image
 * sits at (at least) its native pixel size — the same trick Smart Stitch uses to
 * avoid baking a permanent downscale into the composite. The result is clamped
 * to the caller's pixel budget, preserving the block's shape.
 */
export const stitchAtNativeResolution = (
  items: StitchInput[],
  opts: NativeStitchOptions = {}
): StitchLayout => {
  if (items.length === 0) return { rows: [], width: 0, height: 0, items: [], nativeScale: 1 };
  const gapRatio = Math.max(0, Math.min(opts.gapRatio ?? 0, 0.25));
  const maxSide = opts.maxSide ?? 8192;
  const maxPixels = opts.maxPixels ?? 8192 * 8192;

  const counts = opts.rows?.length ? opts.rows : chooseStitchRows(items, opts.targetAspect ?? 1);

  // Normalized pass — only the shape matters here.
  const BASE = 1000;
  const laid = buildRows(items, counts, BASE, BASE * gapRatio);

  // Scale so every image draws at or above its native resolution.
  let k = 1;
  for (const p of laid.items) {
    const src = items.find(it => it.id === p.id)!;
    if (p.width > 0) k = Math.max(k, src.width / p.width);
  }

  let w = laid.width * k;
  let h = laid.height * k;
  // Clamp both edges by the same factor so the layout keeps its shape. Whatever
  // the clamp takes away is what the export has to put back.
  const clamp = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  if (clamp < 1) k *= clamp;
  w = laid.width * k;
  h = laid.height * k;

  return {
    rows: laid.rows,
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    items: laid.items.map(p => ({
      id: p.id,
      x: p.x * k,
      y: p.y * k,
      width: p.width * k,
      height: p.height * k,
    })),
    nativeScale: clamp < 1 ? 1 / clamp : 1,
  };
};

import { describe, expect, it } from 'vitest';
import {
  chooseStitchRows,
  exportScaleForDoc,
  fitStitchInBox,
  stitchAtNativeResolution,
  type StitchInput,
} from './stitchLayout';

const img = (id: string, width: number, height: number): StitchInput => ({ id, width, height });
const wide = (id: string) => img(id, 1920, 1080);
const tall = (id: string) => img(id, 1080, 1920);

const aspect = (w: number, h: number) => w / h;

describe('chooseStitchRows', () => {
  it('splits four 16:9 frames into two rows of two for a 16:9 artboard', () => {
    expect(chooseStitchRows([wide('a'), wide('b'), wide('c'), wide('d')], aspect(16, 9))).toEqual([2, 2]);
  });

  it('keeps three portraits on one row for a wide artboard', () => {
    expect(chooseStitchRows([tall('a'), tall('b'), tall('c')], aspect(16, 9))).toEqual([3]);
  });

  it('stacks two landscape frames for a portrait artboard', () => {
    expect(chooseStitchRows([wide('a'), wide('b')], aspect(9, 16))).toEqual([1, 1]);
  });

  it('preserves input order — rows are contiguous runs', () => {
    const items = [wide('a'), tall('b'), wide('c'), tall('d'), wide('e')];
    const rows = chooseStitchRows(items, aspect(4, 3));
    expect(rows.reduce((s, n) => s + n, 0)).toBe(items.length);
  });

  it('handles the trivial counts', () => {
    expect(chooseStitchRows([], 1)).toEqual([]);
    expect(chooseStitchRows([wide('a')], 1)).toEqual([1]);
  });

  it('falls back to even rows past the enumeration limit', () => {
    const items = Array.from({ length: 20 }, (_, i) => wide(`i${i}`));
    const rows = chooseStitchRows(items, aspect(16, 9));
    expect(rows.reduce((s, n) => s + n, 0)).toBe(20);
    // Even split → row counts differ by at most one.
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
  });
});

describe('fitStitchInBox', () => {
  const items = [wide('a'), wide('b'), wide('c'), wide('d')];

  it('keeps every image inside the box and at its native aspect', () => {
    const layout = fitStitchInBox(items, { boxWidth: 2048, boxHeight: 1152, gap: 24 });
    expect(layout.items).toHaveLength(4);
    for (const p of layout.items) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(2048 + 0.001);
      expect(p.y + p.height).toBeLessThanOrEqual(1152 + 0.001);
      expect(p.width / p.height).toBeCloseTo(16 / 9, 4);
    }
  });

  it('never overlaps items', () => {
    const layout = fitStitchInBox([wide('a'), tall('b'), wide('c'), tall('d'), wide('e')], {
      boxWidth: 2048,
      boxHeight: 1152,
      gap: 16,
    });
    for (let i = 0; i < layout.items.length; i++) {
      for (let j = i + 1; j < layout.items.length; j++) {
        const a = layout.items[i];
        const b = layout.items[j];
        const overlap =
          a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 &&
          a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
        expect(overlap).toBe(false);
      }
    }
  });

  it('justifies each row to the same width', () => {
    const layout = fitStitchInBox(items, { boxWidth: 2048, boxHeight: 1152, gap: 20 });
    expect(layout.rows).toEqual([2, 2]);
    const rowWidth = (from: number, to: number) =>
      layout.items[to - 1].x + layout.items[to - 1].width - layout.items[from].x;
    expect(rowWidth(0, 2)).toBeCloseTo(rowWidth(2, 4), 3);
  });

  it('centers the block in the box', () => {
    const layout = fitStitchInBox([wide('a')], { boxWidth: 2000, boxHeight: 2000, gap: 0 });
    const p = layout.items[0];
    expect(p.x + p.width / 2).toBeCloseTo(1000, 3);
    expect(p.y + p.height / 2).toBeCloseTo(1000, 3);
  });

  it('honours the gap between items', () => {
    const layout = fitStitchInBox([wide('a'), wide('b')], {
      boxWidth: 2048, boxHeight: 1152, gap: 40, rows: [2],
    });
    const [a, b] = layout.items;
    expect(b.x - (a.x + a.width)).toBeCloseTo(40, 3);
  });

  it('does not invert the layout when the gap dwarfs the box', () => {
    const layout = fitStitchInBox([wide('a'), wide('b')], { boxWidth: 100, boxHeight: 100, gap: 900 });
    for (const p of layout.items) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it('returns an empty layout for no items', () => {
    expect(fitStitchInBox([], { boxWidth: 100, boxHeight: 100 })).toEqual({
      rows: [], width: 0, height: 0, items: [], nativeScale: 1,
    });
  });
});

describe('stitchAtNativeResolution', () => {
  it('sizes the canvas so no image is downscaled', () => {
    const layout = stitchAtNativeResolution([wide('a'), wide('b')], {
      targetAspect: aspect(32, 9), gapRatio: 0,
    });
    for (const p of layout.items) {
      expect(p.width).toBeGreaterThanOrEqual(1920 - 1);
    }
    expect(layout.width).toBeGreaterThanOrEqual(3840 - 2);
    expect(layout.height).toBeGreaterThanOrEqual(1080 - 2);
  });

  it('upscales the whole block uniformly for a mixed-resolution set', () => {
    // The 4000px-wide source is the binding one; the small frame rides along.
    const layout = stitchAtNativeResolution([img('big', 4000, 2000), img('small', 800, 400)], {
      targetAspect: aspect(4, 1), gapRatio: 0, rows: [2],
    });
    const big = layout.items.find(p => p.id === 'big')!;
    const small = layout.items.find(p => p.id === 'small')!;
    expect(big.width).toBeCloseTo(4000, 0);
    expect(small.width).toBeCloseTo(4000, 0); // same aspect → same justified width
  });

  it('clamps to the pixel budget while keeping the block shape', () => {
    const items = Array.from({ length: 6 }, (_, i) => img(`i${i}`, 6000, 4000));
    const layout = stitchAtNativeResolution(items, {
      targetAspect: aspect(3, 2), gapRatio: 0.01, maxSide: 4096, maxPixels: 4096 * 4096,
    });
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(4096);
    expect(layout.width * layout.height).toBeLessThanOrEqual(4096 * 4096 + 4096);
    for (const p of layout.items) {
      expect(p.width / p.height).toBeCloseTo(1.5, 3);
    }
  });

  it('scales the gap with the canvas', () => {
    const layout = stitchAtNativeResolution([wide('a'), wide('b')], {
      gapRatio: 0.02, rows: [2], targetAspect: aspect(32, 9),
    });
    const [a, b] = layout.items;
    const gap = b.x - (a.x + a.width);
    expect(gap).toBeGreaterThan(0);
    // Outer margin matches the inner gap.
    expect(a.x).toBeCloseTo(gap, 1);
  });

  it('returns an empty layout for no items', () => {
    expect(stitchAtNativeResolution([])).toEqual({ rows: [], width: 0, height: 0, items: [], nativeScale: 1 });
  });

  it('reports nativeScale 1 when the budget allows full resolution', () => {
    const layout = stitchAtNativeResolution([wide('a'), wide('b')], {
      targetAspect: aspect(32, 9), maxSide: 8192, maxPixels: 8192 * 8192,
    });
    expect(layout.nativeScale).toBe(1);
  });

  it('reports the shortfall when a pixel cap clamps the block', () => {
    const items = Array.from({ length: 6 }, (_, i) => img(`i${i}`, 6000, 4000));
    const layout = stitchAtNativeResolution(items, {
      targetAspect: aspect(3, 2), maxSide: 4096, maxPixels: 4096 * 4096,
    });
    expect(layout.nativeScale).toBeGreaterThan(1);
    // Rendering at nativeScale restores at least native size for every image.
    for (const p of layout.items) {
      expect(p.width * layout.nativeScale).toBeGreaterThanOrEqual(6000 - 1);
    }
  });
});

describe('fitStitchInBox nativeScale', () => {
  it('reports how much the box shrank the sources', () => {
    const layout = fitStitchInBox([img('a', 4000, 2000)], { boxWidth: 2000, boxHeight: 1000, gap: 0 });
    expect(layout.nativeScale).toBeCloseTo(2, 2);
    expect(layout.items[0].width * layout.nativeScale).toBeCloseTo(4000, 0);
  });
});

describe('exportScaleForDoc', () => {
  it('never returns less than 1 — a doc always exports at its own resolution', () => {
    expect(exportScaleForDoc({ docW: 8192, docH: 8192, wanted: 3, maxSide: 8192, maxPixels: 8192 * 8192 })).toBe(1);
    expect(exportScaleForDoc({ docW: 4000, docH: 3000, wanted: 0.2 })).toBe(1);
  });

  it('lifts small artboards to the minimum long edge', () => {
    expect(exportScaleForDoc({ docW: 1024, docH: 512, wanted: 1, minLongEdge: 2048 })).toBeCloseTo(2, 5);
  });

  it('honours the wanted scale when it exceeds the minimum', () => {
    expect(exportScaleForDoc({
      docW: 4096, docH: 2304, wanted: 1.5, minLongEdge: 2048, maxSide: 16384, maxPixels: 8192 * 8192,
    })).toBeCloseTo(1.5, 5);
  });

  it('clamps to the export pixel budget', () => {
    const k = exportScaleForDoc({
      docW: 5276, docH: 3180, wanted: 4, minLongEdge: 2048, maxSide: 16384, maxPixels: 8192 * 8192,
    });
    expect(5276 * k * 3180 * k).toBeLessThanOrEqual(8192 * 8192 + 1);
    expect(k).toBeGreaterThan(1);
  });

  it('clamps to the max side', () => {
    const k = exportScaleForDoc({
      docW: 8000, docH: 1000, wanted: 10, minLongEdge: 2048, maxSide: 16384, maxPixels: 8192 * 8192,
    });
    expect(8000 * k).toBeLessThanOrEqual(16384);
  });

  it('holds a stitch of large sources to a 4K deliverable, canvas and export', () => {
    // Six 6000px sources: full native would want ~8K+. The stitch canvas caps at
    // 4096, and the export renders no larger.
    const items = Array.from({ length: 6 }, (_, i) => img(`i${i}`, 6000, 4000));
    const layout = stitchAtNativeResolution(items, {
      targetAspect: aspect(3, 2), gapRatio: 0.015, maxSide: 4096, maxPixels: 4096 * 4096,
    });
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(4096);

    const k = exportScaleForDoc({
      docW: layout.width, docH: layout.height, wanted: layout.nativeScale,
      minLongEdge: 2048, maxSide: 4096, maxPixels: 4096 * 4096,
    });
    expect(Math.max(layout.width, layout.height) * k).toBeLessThanOrEqual(4096);
  });

  it('guards against a non-finite wanted scale', () => {
    expect(exportScaleForDoc({ docW: 2048, docH: 1152, wanted: Number.NaN })).toBe(1);
  });
});

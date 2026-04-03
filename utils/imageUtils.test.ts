import { describe, expect, it } from 'vitest';
import {
  calculateHorizontalStitchLayout,
  calculateScaledDimensions,
  calculateSmartStitchLayout,
  clampExportScale,
} from './imageUtils';

describe('calculateHorizontalStitchLayout', () => {
  it('preserves native image dimensions by default instead of upscaling shorter images', () => {
    const layout = calculateHorizontalStitchLayout([
      { width: 1200, height: 900 },
      { width: 600, height: 400 },
    ]);

    expect(layout.width).toBe(1800);
    expect(layout.height).toBe(900);
    expect(layout.items).toEqual([
      { x: 0, y: 0, width: 1200, height: 900 },
      { x: 1200, y: 250, width: 600, height: 400 },
    ]);
  });

  it('scales the full stitched output down uniformly when exportScale is provided', () => {
    const layout = calculateHorizontalStitchLayout(
      [
        { width: 1200, height: 900 },
        { width: 600, height: 400 },
      ],
      { exportScale: 0.5 }
    );

    expect(layout.width).toBe(900);
    expect(layout.height).toBe(450);
    expect(layout.items).toEqual([
      { x: 0, y: 0, width: 600, height: 450 },
      { x: 600, y: 125, width: 300, height: 200 },
    ]);
  });
});

describe('calculateSmartStitchLayout', () => {
  it('returns deterministic canvas dimensions for a justified layout', () => {
    const layout = calculateSmartStitchLayout(
      [
        { id: 'a', file: {} as File, dataUrl: 'a', width: 1200, height: 800 },
        { id: 'b', file: {} as File, dataUrl: 'b', width: 1200, height: 800 },
      ],
      {
        containerWidth: 1200,
        targetRowHeight: 300,
        spacing: 12,
      }
    );

    expect(layout.width).toBe(1200);
    expect(layout.height).toBe(412);
    expect(layout.layout).toHaveLength(2);
    expect(layout.layout[0]).toMatchObject({ x: 12, y: 12, width: 582, height: 388 });
    expect(layout.layout[1]).toMatchObject({ x: 606, y: 12, width: 582, height: 388 });
  });
});

describe('export scaling helpers', () => {
  it('clamps invalid export scale values into a safe range', () => {
    expect(clampExportScale(Number.NaN)).toBe(1);
    expect(clampExportScale(4)).toBe(1);
    expect(clampExportScale(0.01)).toBe(0.1);
  });

  it('calculates scaled pixel dimensions deterministically', () => {
    expect(calculateScaledDimensions(1600, 900, 0.5)).toEqual({ width: 800, height: 450 });
    expect(calculateScaledDimensions(1601, 901, 0.25)).toEqual({ width: 400, height: 225 });
  });
});

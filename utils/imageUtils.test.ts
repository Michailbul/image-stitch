import { describe, expect, it } from 'vitest';
import {
  calculateHorizontalStitchLayout,
  calculateScaledDimensions,
  calculateSmartStitchLayout,
  clampExportScale,
  computeFrameExportScale,
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

describe('computeFrameExportScale', () => {
  // 16:9 frame in world units
  const frame = { width: 800, height: 450 };

  it('auto mode scales so the densest image keeps its native resolution', () => {
    // 9:16 portrait (1080×1920 native) shown at 200×356, 4:3 (2048×1536) shown at 300×225
    const items = [
      { x: 0, y: 0, width: 200, height: 356, nativeWidth: 1080, nativeHeight: 1920 },
      { x: 220, y: 0, width: 300, height: 225, nativeWidth: 2048, nativeHeight: 1536 },
    ];
    const scale = computeFrameExportScale(items, frame, 'auto');
    // per-item binding density (cover): min(1080/200, 1920/356)=5.39…, min(2048/300, 1536/225)=6.826…
    expect(scale).toBeCloseTo(2048 / 300, 5);
    // resulting export comfortably above 2K wide for this layout
    expect(Math.round(frame.width * scale)).toBe(5461);
  });

  it('auto mode never downscales below world units when images are small', () => {
    const items = [
      { x: 0, y: 0, width: 400, height: 300, nativeWidth: 100, nativeHeight: 75 },
    ];
    expect(computeFrameExportScale(items, frame, 'auto')).toBe(1);
  });

  it('fixed resolution targets the long edge of the frame', () => {
    expect(computeFrameExportScale([], frame, 2560)).toBeCloseTo(3.2, 5);
    // portrait frame: long edge is the height
    const portrait = { width: 450, height: 800 };
    const scale = computeFrameExportScale([], portrait, 1920);
    expect(Math.round(portrait.height * scale)).toBe(1920);
    expect(Math.round(portrait.width * scale)).toBe(1080);
  });

  it('caps output at maxDimension in both modes', () => {
    const dense = [
      { x: 0, y: 0, width: 10, height: 10, nativeWidth: 4000, nativeHeight: 4000 },
    ];
    const capped = computeFrameExportScale(dense, frame, 'auto', 8192);
    expect(frame.width * capped).toBeLessThanOrEqual(8192);
    expect(computeFrameExportScale([], frame, 100000, 8192)).toBeCloseTo(8192 / 800, 5);
  });

  it('handles an empty frame without dividing by zero', () => {
    expect(computeFrameExportScale([], { width: 0, height: 0 }, 'auto')).toBe(1);
  });
});

import { CropRegion, ImageLayer, SmartStitchImage, SmartStitchLayoutItem } from '../types';

export interface ExportScaleOption {
  label: string;
  value: number;
}

export const EXPORT_SCALE_OPTIONS: ExportScaleOption[] = [
  { label: '100%', value: 1 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
  { label: '25%', value: 0.25 },
];

interface HorizontalStitchLayoutItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HorizontalStitchLayout {
  width: number;
  height: number;
  items: HorizontalStitchLayoutItem[];
}

export const clampExportScale = (scale = 1): number => {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(1, Math.max(0.1, scale));
};

const prepareCanvasContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
};

export const calculateHorizontalStitchLayout = (
  imageSizes: Array<{ width: number; height: number }>,
  options?: { exportScale?: number }
): HorizontalStitchLayout => {
  if (imageSizes.length === 0) {
    return { width: 0, height: 0, items: [] };
  }

  const exportScale = clampExportScale(options?.exportScale);
  const baseHeight = Math.max(...imageSizes.map((image) => image.height));
  const height = Math.max(1, Math.ceil(baseHeight * exportScale));

  let totalWidth = 0;
  const items = imageSizes.map((image) => {
    const width = image.width * exportScale;
    const itemHeight = image.height * exportScale;
    const item: HorizontalStitchLayoutItem = {
      x: totalWidth,
      y: (height - itemHeight) / 2,
      width,
      height: itemHeight,
    };
    totalWidth += width;
    return item;
  });

  return {
    width: Math.max(1, Math.ceil(totalWidth)),
    height,
    items,
  };
};

export const calculateScaledDimensions = (
  width: number,
  height: number,
  scale = 1
): { width: number; height: number } => {
  const exportScale = clampExportScale(scale);
  return {
    width: Math.max(1, Math.round(width * exportScale)),
    height: Math.max(1, Math.round(height * exportScale)),
  };
};

export const calculateSmartStitchLayout = (
  images: SmartStitchImage[],
  settings: { containerWidth: number; targetRowHeight: number; spacing: number }
): { layout: SmartStitchLayoutItem[]; width: number; height: number } => {
  if (images.length === 0) {
    return { layout: [], width: 0, height: 0 };
  }

  const { containerWidth, targetRowHeight, spacing } = settings;

  let rows: { img: SmartStitchImage; aspectRatio: number; scaledWidth: number }[][] = [];
  let currentRow: { img: SmartStitchImage; aspectRatio: number; scaledWidth: number }[] = [];
  let currentWidth = 0;

  for (const image of images) {
    const aspectRatio = image.width / image.height;
    const scaledWidth = targetRowHeight * aspectRatio;

    currentRow.push({ img: image, aspectRatio, scaledWidth });
    currentWidth += scaledWidth;

    const totalWidthWithSpacing = currentWidth + (currentRow.length - 1) * spacing;
    if (totalWidthWithSpacing >= containerWidth) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  const layout: SmartStitchLayoutItem[] = [];
  let y = spacing;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const isLastRow = i === rows.length - 1;
    const rowAspectRatio = row.reduce((sum, item) => sum + item.aspectRatio, 0);
    const availableWidth = containerWidth - spacing * 2 - (row.length - 1) * spacing;

    let rowHeight: number;
    if (isLastRow && row.length > 0 && rowAspectRatio < (availableWidth / targetRowHeight) * 0.6) {
      rowHeight = targetRowHeight;
    } else {
      rowHeight = availableWidth / rowAspectRatio;
    }

    let x = spacing;
    for (const item of row) {
      const width = rowHeight * item.aspectRatio;
      layout.push({ img: item.img, x, y, width, height: rowHeight });
      x += width + spacing;
    }
    y += rowHeight + spacing;
  }

  return {
    layout,
    width: Math.max(1, Math.ceil(containerWidth)),
    height: Math.max(1, Math.ceil(y)),
  };
};

export const resizeImageSource = async (
  imageSrc: string,
  scale = 1
): Promise<string> => {
  const exportScale = clampExportScale(scale);
  if (exportScale === 1) return imageSrc;

  const img = await loadImage(imageSrc);
  const dimensions = calculateScaledDimensions(img.width, img.height, exportScale);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = prepareCanvasContext(canvas);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

/**
 * Loads an image from a source string.
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * Crops an image based on percentage coordinates.
 * Returns a Data URL.
 */
export const cropImage = async (
  imageSrc: string,
  crop: CropRegion,
  originalWidth: number,
  originalHeight: number
): Promise<string> => {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  
  // Calculate pixel values
  const pxX = (crop.x / 100) * originalWidth;
  const pxY = (crop.y / 100) * originalHeight;
  const pxW = (crop.width / 100) * originalWidth;
  const pxH = (crop.height / 100) * originalHeight;

  // Canvas dimensions must be integers
  canvas.width = Math.max(1, Math.round(pxW));
  canvas.height = Math.max(1, Math.round(pxH));
  
  const ctx = prepareCanvasContext(canvas);

  // Draw the portion of the image
  ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

/**
 * Merges the original image with any replaced crop regions.
 */
export const generateCompositeImage = async (layer: ImageLayer): Promise<string> => {
  const baseImg = await loadImage(layer.src);
  const canvas = document.createElement('canvas');
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = prepareCanvasContext(canvas);

  // Draw base
  ctx.drawImage(baseImg, 0, 0);

  // Draw replacements
  for (const crop of layer.crops) {
    if (crop.replacementSrc) {
      const replacementImg = await loadImage(crop.replacementSrc);
      const pxX = (crop.x / 100) * layer.width;
      const pxY = (crop.y / 100) * layer.height;
      const pxW = (crop.width / 100) * layer.width;
      const pxH = (crop.height / 100) * layer.height;

      ctx.drawImage(replacementImg, pxX, pxY, pxW, pxH);
    }
  }

  return canvas.toDataURL('image/png');
};

/**
 * Loads a File object and returns a SmartStitchImage with dataUrl + dimensions.
 */
export const loadImageFile = (file: File): Promise<SmartStitchImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        resolve({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          dataUrl,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Generates a justified-row layout stitch (Google Photos style).
 * Returns a PNG data URL.
 */
export const generateSmartStitch = async (
  images: SmartStitchImage[],
  settings: {
    containerWidth: number;
    targetRowHeight: number;
    spacing: number;
    backgroundColor: string;
    exportScale?: number;
  }
): Promise<string> => {
  if (images.length === 0) return '';

  const { backgroundColor } = settings;
  const exportScale = clampExportScale(settings.exportScale);
  const { layout, width, height } = calculateSmartStitchLayout(images, settings);

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * exportScale));
  canvas.height = Math.max(1, Math.ceil(height * exportScale));
  const ctx = prepareCanvasContext(canvas);

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawPromises = layout.map(
    (item) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(
            img,
            item.x * exportScale,
            item.y * exportScale,
            item.width * exportScale,
            item.height * exportScale
          );
          resolve();
        };
        img.src = item.img.dataUrl;
      })
  );

  await Promise.all(drawPromises);
  return canvas.toDataURL('image/png');
};

/**
 * Computes justified-row layout positions for a set of items with intrinsic aspect ratios.
 * Returns positions with (0,0) at the top-left (includes spacing as padding).
 */
export const computeJustifiedLayout = (
  items: { id: string; width: number; height: number }[],
  settings: { containerWidth: number; targetRowHeight: number; spacing: number }
): { id: string; x: number; y: number; width: number; height: number }[] => {
  if (items.length === 0) return [];
  const { containerWidth, targetRowHeight, spacing } = settings;

  const rows: { id: string; aspectRatio: number; scaledWidth: number }[][] = [];
  let row: { id: string; aspectRatio: number; scaledWidth: number }[] = [];
  let currentWidth = 0;
  for (const item of items) {
    const aspectRatio = item.width / item.height;
    const scaledWidth = targetRowHeight * aspectRatio;
    row.push({ id: item.id, aspectRatio, scaledWidth });
    currentWidth += scaledWidth;
    const total = currentWidth + (row.length - 1) * spacing;
    if (total >= containerWidth) {
      rows.push(row);
      row = [];
      currentWidth = 0;
    }
  }
  if (row.length > 0) rows.push(row);

  const result: { id: string; x: number; y: number; width: number; height: number }[] = [];
  let y = spacing;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const isLast = i === rows.length - 1;
    const ar = r.reduce((s, it) => s + it.aspectRatio, 0);
    const avail = containerWidth - spacing * 2 - (r.length - 1) * spacing;
    const rowH = (isLast && r.length > 0 && ar < (avail / targetRowHeight) * 0.6)
      ? targetRowHeight : avail / ar;
    let x = spacing;
    for (const it of r) {
      const w = rowH * it.aspectRatio;
      result.push({ id: it.id, x, y, width: w, height: rowH });
      x += w + spacing;
    }
    y += rowH + spacing;
  }
  return result;
};

/**
 * Draws an image into a destination rect with CSS `object-fit: cover` semantics
 * (fill the rect preserving the source aspect, clip the overflow). Matches how
 * canvas items are displayed on screen, so exports never distort.
 */
const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void => {
  const scale = Math.max(width / img.width, height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(img, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
  ctx.restore();
};

/**
 * Manual stitch: respects each item's exact canvas position and size.
 * Output bitmap = bounding box of all items. Items drawn at (item.x - minX, item.y - minY).
 */
export const generateManualStitch = async (
  items: { dataUrl: string; x: number; y: number; width: number; height: number }[],
  backgroundColor: string
): Promise<string> => {
  if (items.length === 0) return '';
  const minX = Math.min(...items.map(i => i.x));
  const minY = Math.min(...items.map(i => i.y));
  const maxX = Math.max(...items.map(i => i.x + i.width));
  const maxY = Math.max(...items.map(i => i.y + i.height));
  const width = Math.max(1, Math.ceil(maxX - minX));
  const height = Math.max(1, Math.ceil(maxY - minY));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = prepareCanvasContext(canvas);

  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  for (const item of items) {
    const img = await loadImage(item.dataUrl);
    drawImageCover(ctx, img, item.x - minX, item.y - minY, item.width, item.height);
  }
  return canvas.toDataURL('image/png');
};

// --- Frame stitch (fixed-aspect export) ---

export const MAX_EXPORT_DIMENSION = 8192;

export interface FrameExportItem {
  x: number;
  y: number;
  width: number;   // world units on canvas
  height: number;
  nativeWidth: number;  // source pixel dims
  nativeHeight: number;
}

/**
 * Pixels-per-world-unit needed so no source image inside the frame is rendered
 * below its native resolution. Items display as object-cover, so the binding
 * axis per item is min(nativeW / w, nativeH / h) — the visible crop's density.
 *
 * resolution 'auto' → quality-preserving scale from native pixels.
 * resolution <n>    → exact long-edge pixel target for the frame.
 * Result is always capped so neither output edge exceeds maxDimension.
 */
export const computeFrameExportScale = (
  items: FrameExportItem[],
  frame: { width: number; height: number },
  resolution: 'auto' | number,
  maxDimension = MAX_EXPORT_DIMENSION
): number => {
  const longEdge = Math.max(frame.width, frame.height);
  if (longEdge <= 0) return 1;

  let scale: number;
  if (resolution === 'auto') {
    scale = Math.max(
      1,
      ...items
        .filter((i) => i.width > 0 && i.height > 0)
        .map((i) => Math.min(i.nativeWidth / i.width, i.nativeHeight / i.height))
    );
  } else {
    scale = resolution / longEdge;
  }

  return Math.min(scale, maxDimension / longEdge);
};

/** Annotation payload for export — world coordinates (output pixels). */
export type FrameAnnotation =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; size: number };

const drawAnnotation = (
  ctx: CanvasRenderingContext2D,
  ann: FrameAnnotation,
  frame: { x: number; y: number },
  scale: number
): void => {
  if (ann.type === 'line') {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = Math.max(1, ann.width * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo((ann.x1 - frame.x) * scale, (ann.y1 - frame.y) * scale);
    ctx.lineTo((ann.x2 - frame.x) * scale, (ann.y2 - frame.y) * scale);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = ann.color;
    ctx.textBaseline = 'top';
    ctx.font = `${ann.size * scale}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.fillText(ann.text, (ann.x - frame.x) * scale, (ann.y - frame.y) * scale);
    ctx.restore();
  }
};

/**
 * Renders exactly the frame region: each item drawn cover-fit at its canvas
 * position, scaled so the export meets the requested resolution, clipped to
 * the frame bounds. Single resample from native pixels — no quality loss.
 * Per-item layer masks and vector annotations are baked in at the same scale.
 */
export const generateFrameStitch = async (
  items: Array<FrameExportItem & { dataUrl: string; maskDataUrl?: string }>,
  frame: { x: number; y: number; width: number; height: number },
  backgroundColor: string,
  options?: { resolution?: 'auto' | number; maxDimension?: number; annotations?: FrameAnnotation[] }
): Promise<{ dataUrl: string; width: number; height: number }> => {
  const resolution = options?.resolution ?? 'auto';
  const scale = computeFrameExportScale(
    items,
    frame,
    resolution,
    options?.maxDimension ?? MAX_EXPORT_DIMENSION
  );

  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = prepareCanvasContext(canvas);

  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  for (const item of items) {
    const img = await loadImage(item.dataUrl);
    const dx = (item.x - frame.x) * scale;
    const dy = (item.y - frame.y) * scale;
    const dw = item.width * scale;
    const dh = item.height * scale;

    if (item.maskDataUrl) {
      // Composite image + mask off-screen, then blit — keeps the mask's
      // destination-in from clipping neighbouring layers.
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(dw));
      tmp.height = Math.max(1, Math.round(dh));
      const tctx = prepareCanvasContext(tmp);
      drawImageCover(tctx, img, 0, 0, tmp.width, tmp.height);
      const mask = await loadImage(item.maskDataUrl);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(mask, 0, 0, tmp.width, tmp.height);
      tctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, dx, dy);
    } else {
      drawImageCover(ctx, img, dx, dy, dw, dh);
    }
  }

  for (const ann of options?.annotations ?? []) {
    drawAnnotation(ctx, ann, frame, scale);
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
};

/**
 * Automatically stitches images horizontally.
 * Scales all images to the height of the tallest image to ensure perfect alignment.
 */
export const generateStitchedCanvas = async (
  items: string[],
  options?: { exportScale?: number }
): Promise<string> => {
  if (items.length === 0) return '';

  const loadedImages = await Promise.all(items.map(src => loadImage(src)));
  const layout = calculateHorizontalStitchLayout(
    loadedImages.map((img) => ({ width: img.width, height: img.height })),
    options
  );

  // 3. Create Canvas
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = prepareCanvasContext(canvas);

  // 4. Draw Images
  for (let index = 0; index < loadedImages.length; index += 1) {
    const item = layout.items[index];
    const img = loadedImages[index];
    ctx.drawImage(img, item.x, item.y, item.width, item.height);
  }

  return canvas.toDataURL('image/png');
};

export type StitchLayout = 'row' | 'column' | 'grid';

export interface LayoutStitchOptions {
  layout: StitchLayout;
  columns?: number;
  spacing?: number;
  backgroundColor?: string; // 'transparent' skips the fill
  exportScale?: number;
}

/**
 * Reassembles a set of images into a row, column, or grid composition.
 * Row matches a common height, column a common width, grid uses uniform
 * cells (object-contain) sized to the largest panel.
 */
export const generateLayoutStitch = async (
  sources: string[],
  options: LayoutStitchOptions
): Promise<string> => {
  if (sources.length === 0) return '';

  const { layout, spacing = 0 } = options;
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const exportScale = clampExportScale(options.exportScale);
  const imgs = await Promise.all(sources.map((src) => loadImage(src)));

  const canvas = document.createElement('canvas');

  const setup = (logicalWidth: number, logicalHeight: number): CanvasRenderingContext2D => {
    canvas.width = Math.max(1, Math.ceil(logicalWidth * exportScale));
    canvas.height = Math.max(1, Math.ceil(logicalHeight * exportScale));
    const context = prepareCanvasContext(canvas);
    context.scale(exportScale, exportScale);
    if (backgroundColor !== 'transparent') {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, logicalWidth, logicalHeight);
    }
    return context;
  };

  if (layout === 'row') {
    const rowHeight = Math.max(...imgs.map((img) => img.height));
    const placed = imgs.map((img) => ({
      img,
      width: img.width * (rowHeight / img.height),
      height: rowHeight,
    }));
    const totalWidth =
      placed.reduce((sum, p) => sum + p.width, 0) + spacing * (placed.length + 1);
    const ctx = setup(totalWidth, rowHeight + spacing * 2);
    let x = spacing;
    for (const p of placed) {
      ctx.drawImage(p.img, x, spacing, p.width, p.height);
      x += p.width + spacing;
    }
    return canvas.toDataURL('image/png');
  }

  if (layout === 'column') {
    const colWidth = Math.max(...imgs.map((img) => img.width));
    const placed = imgs.map((img) => ({
      img,
      width: colWidth,
      height: img.height * (colWidth / img.width),
    }));
    const totalHeight =
      placed.reduce((sum, p) => sum + p.height, 0) + spacing * (placed.length + 1);
    const ctx = setup(colWidth + spacing * 2, totalHeight);
    let y = spacing;
    for (const p of placed) {
      ctx.drawImage(p.img, spacing, y, p.width, p.height);
      y += p.height + spacing;
    }
    return canvas.toDataURL('image/png');
  }

  // grid
  const columns = Math.max(1, options.columns ?? 3);
  const rows = Math.ceil(imgs.length / columns);
  const cellWidth = Math.max(...imgs.map((img) => img.width));
  const cellHeight = Math.max(...imgs.map((img) => img.height));
  const totalWidth = columns * cellWidth + spacing * (columns + 1);
  const totalHeight = rows * cellHeight + spacing * (rows + 1);
  const ctx = setup(totalWidth, totalHeight);

  imgs.forEach((img, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = spacing + col * (cellWidth + spacing);
    const cellY = spacing + row * (cellHeight + spacing);
    const fit = Math.min(cellWidth / img.width, cellHeight / img.height);
    const drawWidth = img.width * fit;
    const drawHeight = img.height * fit;
    ctx.drawImage(
      img,
      cellX + (cellWidth - drawWidth) / 2,
      cellY + (cellHeight - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  });

  return canvas.toDataURL('image/png');
};

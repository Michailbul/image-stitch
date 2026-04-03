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

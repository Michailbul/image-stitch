export interface CropRegion {
  id: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  width: number; // Percentage 0-100
  height: number; // Percentage 0-100
  isLocked: boolean;
  replacementSrc: string | null; // DataURL of the external edit
  isStitched: boolean;
}

export interface ImageLayer {
  id: string;
  groupId?: string; // If present, this layer belongs to a group
  name: string;
  src: string; // Original Image DataURL
  width: number; // Original pixel width
  height: number; // Original pixel height
  crops: CropRegion[];
}

export interface AssetGroup {
  id: string;
  name: string;
  layerIds: string[]; // Ordered list of layers in this group
  crops: CropRegion[]; // Crops applied to the stitched result
  parentGroupId?: string; // For nested subgroups
}

export interface StitchItem {
  id: string;
  layerId: string; // Can be Layer ID or Group ID
  cropId: string;
}

export interface SmartStitchImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface SmartStitchSettings {
  containerWidth: number;
  targetRowHeight: number;
  spacing: number;
  backgroundColor: string;
  exportScale: number;
}

export interface SmartStitchSession {
  id: string;
  name: string;
  images: SmartStitchImage[];
  settings: SmartStitchSettings;
  createdAt: string;
  updatedAt: string;
}

export interface SmartStitchLayoutItem {
  img: SmartStitchImage;
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Auto-Stitch: persistent threads + canvas ---

export interface StoredImage {
  id: string;
  threadId: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface CanvasItem {
  id: string;
  type?: 'image' | 'stitch'; // undefined = 'image' (legacy)
  imageId?: string;          // for 'image'
  dataUrl?: string;          // for 'stitch' (inline result)
  stitchMode?: 'auto' | 'manual';
  nativeWidth?: number;      // source pixel dims for 'stitch' items (quality math)
  nativeHeight?: number;
  /** Layer mask (alpha): opaque = visible, transparent = erased. Stretched to the item box. */
  maskDataUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Vector overlay drawn on the canvas in world coordinates (output pixels). */
export type Annotation =
  | {
      id: string;
      type: 'line';
      x1: number; y1: number; x2: number; y2: number;
      color: string;
      width: number; // world units
    }
  | {
      id: string;
      type: 'text';
      x: number; y: number; // top-left anchor
      text: string;
      color: string;
      size: number; // world units (px in output)
    };

/**
 * Fixed-aspect export frame on the canvas. Height is derived:
 * height = width * aspectH / aspectW.
 */
export interface FrameSpec {
  x: number;
  y: number;
  width: number;       // world units
  aspectW: number;
  aspectH: number;
  resolution: 'auto' | number; // 'auto' = max quality from native pixels; number = long-edge px
  transparent?: boolean;
}

export interface StitchSettings {
  containerWidth: number;
  targetRowHeight: number;
  spacing: number;
  backgroundColor: string;
}

export interface Thread {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  canvasItems: CanvasItem[];
  settings: StitchSettings;
  frame?: FrameSpec | null;
  annotations?: Annotation[];
}

// --- Camera Language Library ---

export type CameraMoveCategory =
  | 'push_pull'
  | 'orbit'
  | 'vertical'
  | 'lateral'
  | 'lens_focus'
  | 'creative';

export interface CameraMove {
  id: string;
  name: string;
  aliases?: string[];
  category: CameraMoveCategory;
  intentTags: string[];
  definition: string;
  emotionalEffect: string;
  bestFor: string[];
  copyPrompt: string;
  modelNotes?: string;
  risk?: string;
  previewVideoUrl?: string;
  previewPoster?: string;
}

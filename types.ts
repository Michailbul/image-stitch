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

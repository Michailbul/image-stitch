import { fal } from '@fal-ai/client';

// The fal API key is provided by the user and stored locally in the browser.
// It is never bundled or sent anywhere except directly to fal. This keeps the
// public landing-page embed safe: visitors use their own key (or none).
const KEY_STORAGE = 'laniameda:fal-key';
let configuredFor: string | null = null;

export const getFalKey = (): string => {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
};

export const setFalKey = (k: string) => {
  try {
    if (k.trim()) localStorage.setItem(KEY_STORAGE, k.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch { /* ignore */ }
  configuredFor = null;
};

export const hasFalKey = (): boolean => !!getFalKey();

const ensureConfigured = () => {
  const key = getFalKey();
  if (!key) throw new Error('No fal API key set');
  if (configuredFor !== key) {
    fal.config({ credentials: key });
    configuredFor = key;
  }
};

export interface Sam3Result {
  maskUrl: string | null; // data URI (sync_mode) of the segmentation mask
  count: number;
}

/**
 * Run Meta SAM 3 segmentation on fal (fal-ai/sam-3/image).
 * Provide either a text `prompt` (concept) or a `point` (click, in image pixels).
 * Returns the mask as a data URI so it can be drawn to canvas without tainting.
 * Cost: ~$0.005 per request.
 */
export async function sam3Segment(opts: {
  imageBlob: Blob;
  prompt?: string;
  point?: { x: number; y: number };
}): Promise<Sam3Result> {
  ensureConfigured();
  const image_url = await fal.storage.upload(opts.imageBlob);
  const input: Record<string, unknown> = {
    image_url,
    apply_mask: false,       // return the raw mask, not the mask painted onto the image
    sync_mode: true,         // return media as data URIs (canvas-safe, no CORS taint)
    output_format: 'png',
    return_multiple_masks: false,
  };
  if (opts.point) {
    input.point_prompts = [{ x: Math.round(opts.point.x), y: Math.round(opts.point.y), label: 1 }];
  } else if (opts.prompt && opts.prompt.trim()) {
    input.prompt = opts.prompt.trim();
  } else {
    throw new Error('Provide a click point or a text prompt');
  }
  const res = await fal.subscribe('fal-ai/sam-3/image', { input }) as any;
  const data = res?.data ?? res;
  const masks: any[] = data?.masks || [];
  const maskUrl: string | null = masks[0]?.url || data?.image?.url || null;
  return { maskUrl, count: masks.length };
}

/**
 * FLUX.1 [pro] Fill inpainting on fal (fal-ai/flux-pro/v1/fill).
 * `maskBlob` white = region to regenerate, black = keep. Returns the result as
 * a data URL (canvas-safe) so it can be composited/exported/persisted.
 * Cost: ~$0.05 per image.
 */
export async function fluxFill(opts: {
  imageBlob: Blob;
  maskBlob: Blob;
  prompt: string;
}): Promise<string> {
  ensureConfigured();
  const [image_url, mask_url] = await Promise.all([
    fal.storage.upload(opts.imageBlob),
    fal.storage.upload(opts.maskBlob),
  ]);
  const res = await fal.subscribe('fal-ai/flux-pro/v1/fill', {
    input: { image_url, mask_url, prompt: opts.prompt, sync_mode: true },
  }) as any;
  const data = res?.data ?? res;
  const url: string | undefined = data?.images?.[0]?.url || data?.image?.url;
  if (!url) throw new Error('FLUX Fill returned no image');
  if (url.startsWith('data:')) return url;
  // Fetch the hosted result and inline it so the canvas isn't tainted.
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

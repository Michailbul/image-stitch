/**
 * Browser download helpers.
 *
 * Two things reliably break a canvas download, and both are easy to reintroduce:
 *
 *  1. Clicking an anchor that was never added to the document. Chrome tolerates
 *     it; Firefox and Safari do not.
 *  2. Awaiting something (e.g. `canvas.toBlob`) before the click. That moves the
 *     click out of the task the user's gesture started, and Safari blocks the
 *     download. So a canvas small enough for a data URL is encoded
 *     *synchronously* and downloaded inside the gesture; only genuinely large
 *     canvases pay the async path, where a blob is the only sane option anyway
 *     (base64 of a 40MP PNG is a ~100MB string).
 */

/** Pixel count above which a data URL is too big to hold as a string. */
const ASYNC_BLOB_THRESHOLD = 24_000_000; // ~24MP

/** Click a download link the way every browser accepts: attached, then removed. */
export const triggerDownload = (url: string, filename: string): void => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Download a data URL (or any URL) as `filename`. */
export const downloadUrl = triggerDownload;

/**
 * Download a canvas as a PNG. Returns once the download has been handed to the
 * browser. Small canvases never leave the calling task, so a click handler that
 * calls this without awaiting still downloads in Safari.
 */
export const downloadCanvasPng = async (
  canvas: HTMLCanvasElement,
  filename: string
): Promise<void> => {
  if (canvas.width * canvas.height <= ASYNC_BLOB_THRESHOLD) {
    triggerDownload(canvas.toDataURL('image/png'), filename);
    return;
  }
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) {
    // toBlob can fail on an oversized canvas — a data URL is the last resort.
    triggerDownload(canvas.toDataURL('image/png'), filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  // Revoking immediately can cancel the download in progress.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

/**
 * Download an existing PNG data URL. Large data URLs are converted to a blob
 * first — Chrome and Safari both fail to download very long data: URLs.
 */
export const downloadPngDataUrl = (dataUrl: string, filename: string): void => {
  const LARGE = 2_000_000; // ~2MB of base64
  if (dataUrl.length <= LARGE || !dataUrl.startsWith('data:')) {
    triggerDownload(dataUrl, filename);
    return;
  }
  try {
    const comma = dataUrl.indexOf(',');
    const bytes = atob(dataUrl.slice(comma + 1));
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
    triggerDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch {
    triggerDownload(dataUrl, filename); // decoding failed — try it raw
  }
};

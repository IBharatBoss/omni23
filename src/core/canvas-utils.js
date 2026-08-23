// src/core/canvas-utils.js
/**
 * Shared Canvas Utility Functions
 * Eliminates duplicate patterns across image tools.
 */

/**
 * Fill a canvas with white background (prevents black artifacts on JPEG/BMP).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
export function fillWhiteMatte(ctx, width, height) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
}

/**
 * Configure high-quality image smoothing on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 */
export function setupSmoothCanvas(ctx) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

/**
 * Get file extension string from MIME type.
 * @param {string} mime
 * @returns {string} e.g. '.jpg', '.png', '.webp'
 */
export function getExtFromMime(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/bmp': '.bmp',
    'image/gif': '.gif',
    'image/tiff': '.tiff',
    'image/svg+xml': '.svg'
  };
  return map[mime] || '.bin';
}

/**
 * Test if a MIME type is supported for canvas.toBlob() export.
 * Useful for AVIF fallback detection.
 * @param {string} mimeType
 * @returns {Promise<boolean>}
 */
export async function isMimeSupported(mimeType) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.5));
    canvas.width = 0;
    canvas.height = 0;
    return blob !== null && blob.type === mimeType;
  } catch {
    return false;
  }
}

/**
 * Resolve an output MIME type with AVIF fallback.
 * If AVIF is requested but unsupported, falls back to WebP, then JPEG.
 * @param {string} requestedMime
 * @returns {Promise<string>}
 */
export async function resolveOutputMime(requestedMime) {
  if (requestedMime !== 'image/avif') return requestedMime;
  if (await isMimeSupported('image/avif')) return 'image/avif';
  if (await isMimeSupported('image/webp')) return 'image/webp';
  return 'image/jpeg';
}

// src/core/image-utils.js
/**
 * Shared Image Processing Pipeline
 * Single source of truth for: load → rotate → crop → memory cleanup
 * Used by image processing and compression tools.
 */

/**
 * Load a File into an HTMLImageElement with proper Object URL lifecycle.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to decode image: ${file.name}`));
    };

    img.src = url;
  });
}

/**
 * Apply rotation and cropping transformations to a loaded image.
 * Returns a canvas with the transformed result and its dimensions.
 *
 * @param {HTMLImageElement} img - The loaded image element
 * @param {object} options - Tool options (may contain rotation, crop)
 * @param {File} file - Original file (may have _customRotation, _customCrop)
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number, origWidth: number, origHeight: number }}
 */
export function applyTransform(img, options, file) {
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  const rotation = Number((options && options.rotation) || file._customRotation || 0);
  const crop = (options && options.crop) || file._customCrop;

  const isRotated90or270 = rotation === 90 || rotation === 270;
  const rotatedW = isRotated90or270 ? origHeight : origWidth;
  const rotatedH = isRotated90or270 ? origWidth : origHeight;

  // Step 1: Rotation canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = rotatedW;
  tempCanvas.height = rotatedH;
  const tCtx = tempCanvas.getContext('2d');
  tCtx.translate(rotatedW / 2, rotatedH / 2);
  if (rotation !== 0) tCtx.rotate((rotation * Math.PI) / 180);
  tCtx.drawImage(img, -origWidth / 2, -origHeight / 2);

  // Step 2: Crop region
  const cropX = crop ? crop.x : 0;
  const cropY = crop ? crop.y : 0;
  const cropW = crop ? crop.width : rotatedW;
  const cropH = crop ? crop.height : rotatedH;

  // Step 3: Final output canvas
  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Cleanup temp canvas memory
  tempCanvas.width = 1;
  tempCanvas.height = 1;

  return {
    canvas,
    width: cropW,
    height: cropH,
    origWidth,
    origHeight
  };
}

/**
 * Free a canvas's GPU/memory buffer by shrinking it to 1x1.
 * @param {HTMLCanvasElement} canvas
 */
export function freeCanvas(canvas) {
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
}


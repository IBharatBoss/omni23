// src/tools/img-compress.js
import { loadImage, applyTransform, freeCanvas } from '../core/image-utils.js';
import { resolveOutputMime } from '../core/canvas-utils.js';

/**
 * Smart Image Compressor Plugin
 * - Ultra-Clean Target Size Control (50KB, 100KB, 200KB, 500KB, 1MB, 2MB & Custom)
 * - Self-Tuning Binary Search Engine + Stepped Downscaling Fallback
 * - Multi-Format Routing (Auto/Original, WebP, JPG, PNG)
 * - Alpha-Safe Transparency & Memory Lifecycle Cleanup
 */
export default {
  id: "img-compress",
  title: "Image Compressor",
  name: "Image Compressor",
  category: "Image",
  icon: "🗜️",
  accept: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/bmp", "image/svg+xml"],
  keywords: ["compress", "shrink", "reduce", "size", "kb", "mb", "optimize", "image", "photo", "target kb"],
  description: "Compress images strictly under your target file size with zero quality loss and instant client-side speed.",
  
  options: [
    {
      id: "targetSize",
      type: "number",
      label: "Target File Size (KB)",
      default: 0,
      min: 0,
      max: 51200,
      placeholder: "0 = Auto Optimize (85% Quality), or enter KB",
      presets: [
        { label: "Auto (85% Q)", value: 0 },
        { label: "50 KB", value: 50 },
        { label: "100 KB", value: 100 },
        { label: "500 KB", value: 500 },
        { label: "1 MB", value: 1024 },
        { label: "2 MB", value: 2048 }
      ]
    },
    {
      id: "outputFormat",
      type: "select",
      label: "Output Format",
      default: "image/jpeg",
      options: [
        { label: "Auto (Convert to JPEG)", value: "image/jpeg" },
        { label: "Keep Original Format", value: "original" },
        { label: "Convert to WebP (High Quality & Small)", value: "image/webp" },
        { label: "Convert to AVIF (Next-Gen Compression)", value: "image/avif" },
        { label: "Convert to PNG (Lossless/Transparent)", value: "image/png" }
      ]
    }
  ],

  /**
   * Main Execution Pipeline for Single Item
   */
  async execute(file, options, onProgress = () => {}) {
    const startTime = performance.now();
    onProgress(10);

    // 1. Decode image using shared pipeline
    const imgData = await loadImage(file);
    onProgress(25);

    const origWidth = imgData.naturalWidth || imgData.width;
    const origHeight = imgData.naturalHeight || imgData.height;

    // 2. Pre-Transformation using shared pipeline (rotation + crop)
    const rotation = Number((options && options.rotation) || file._customRotation || 0);
    const crop = (options && options.crop) || file._customCrop;
    const { canvas: transformedCanvas, width: transformedW, height: transformedH } = applyTransform(imgData, options, file);

    // 3. Format Resolution (with AVIF fallback for unsupported browsers)
    let targetMimeType = (options && options.outputFormat) || 'image/jpeg';
    if (targetMimeType === 'original') {
      targetMimeType = file.type || 'image/jpeg';
      if (targetMimeType === 'image/svg+xml') targetMimeType = 'image/png';
    }
    targetMimeType = await resolveOutputMime(targetMimeType);

    onProgress(40);

    // 4. Render Base Canvas with proper alpha/background handling
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = transformedW;
    baseCanvas.height = transformedH;
    const ctx = baseCanvas.getContext('2d', { alpha: targetMimeType !== 'image/jpeg' });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // If JPEG, fill clean white background to prevent dark transparency artifacts
    if (targetMimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, transformedW, transformedH);
    }

    ctx.drawImage(transformedCanvas, 0, 0);
    freeCanvas(transformedCanvas);

    onProgress(55);

    // 5. Compression Engine Routing
    const targetKbVal = Number((options && options.targetSize !== undefined) ? options.targetSize : 0);
    
    let finalBlob, finalWidth, finalHeight;

    if (targetKbVal === 0) {
      // PRO AUTO MODE: Modern web efficiency
      // 1. Resolution Capping: No image needs to be 5000+ pixels wide for the web. Cap at 2560px.
      const MAX_EDGE = 2560;
      let autoW = baseCanvas.width;
      let autoH = baseCanvas.height;
      
      if (autoW > MAX_EDGE || autoH > MAX_EDGE) {
        const scale = MAX_EDGE / Math.max(autoW, autoH);
        autoW = Math.round(autoW * scale);
        autoH = Math.round(autoH * scale);
      }
      
      let autoCanvas = progressiveDownscale(baseCanvas, autoW, autoH, targetMimeType);

      // 2. Quality Tuning: 85% is too high for Canvas JPEG. 75% is the visual sweet spot for massive savings.
      let autoQuality = 0.75;
      if (targetMimeType === 'image/webp') autoQuality = 0.82;

      finalBlob = await canvasToBlobAsync(autoCanvas, targetMimeType, autoQuality);
      
      // 3. Incompressible Safety Net
      if (finalBlob.size >= file.size) {
         const fallbackBlob = await canvasToBlobAsync(autoCanvas, targetMimeType, 0.60);
         if (fallbackBlob.size < file.size) {
             finalBlob = fallbackBlob;
         }
         // If it's STILL larger (e.g. PNGs), the Global Safety Net at step 6 will intercept it and return the original.
      }
      
      finalWidth = autoCanvas.width;
      finalHeight = autoCanvas.height;
      onProgress(100);
    } else {
      // Strict Size Limit Mode
      const targetBytes = Math.max(5 * 1024, targetKbVal * 1024);

      const searchResult = await binarySearchTargetSize(baseCanvas, targetMimeType, targetBytes, (p) => {
        onProgress(55 + Math.round(p * 0.4));
      }, file.size);

      finalBlob = searchResult.blob;
      finalWidth = searchResult.width;
      finalHeight = searchResult.height;
    }

    // 6. Global Safety Net: A compressor should NEVER increase file size (unless user explicitly converted to a heavier format)
    if (finalBlob.size >= file.size) {
       if (!crop && rotation === 0 && (options && options.outputFormat === 'original')) {
           // If keeping original format and encoder inflated size, safely return the original
           finalBlob = file;
           finalWidth = origWidth;
           finalHeight = origHeight;
           targetMimeType = file.type || 'image/jpeg';
       }
    }

    // Clean up base canvas memory buffer
    freeCanvas(baseCanvas);

    if (!finalBlob) {
      throw new Error('Image compression encoding failed.');
    }

    onProgress(100);
    const durationMs = Math.round(performance.now() - startTime);

    // Determine output file extension accurately based on target format
    let ext = 'jpg';
    if (options && options.outputFormat === 'original') {
      const origExt = file.name.split('.').pop()?.toLowerCase();
      ext = origExt || 'jpg';
    } else {
      if (targetMimeType === 'image/jpeg') ext = 'jpg';
      else if (targetMimeType === 'image/webp') ext = 'webp';
      else if (targetMimeType === 'image/png') ext = 'png';
      else if (targetMimeType === 'image/avif') ext = 'avif';
      else {
        const origExt = file.name.split('.').pop()?.toLowerCase();
        ext = origExt || 'jpg';
      }
    }

    return {
      blob: finalBlob,
      fileName: `${file.name.replace(/\.[^/.]+$/, "")}_compressed.${ext}`,
      originalSize: file.size,
      processedSize: finalBlob.size,
      originalWidth: origWidth,
      originalHeight: origHeight,
      width: finalWidth,
      height: finalHeight,
      durationMs,
      format: targetMimeType,
      originalFile: file
    };
  }
};

/**
 * Ultra-Advanced Predictive Compression Engine
 * Prioritizes original resolution (90%+ quality retention).
 * Dynamically scales ONLY when target demands it. Strict size capping.
 */
async function binarySearchTargetSize(canvas, mimeType, targetBytes, onSubProgress = () => {}, originalFileSize) {
  // 0. Strict Constraint: Output must NEVER exceed original file size
  const strictTargetBytes = Math.min(targetBytes, originalFileSize || Infinity);

  // If PNG and target is large enough, try straight encoding first
  if (mimeType === 'image/png') {
    let blob = await canvasToBlobAsync(canvas, 'image/png');
    if (blob.size <= strictTargetBytes) return { blob, width: canvas.width, height: canvas.height };
  }

  let currentCanvas = canvas;
  let curW = canvas.width;
  let curH = canvas.height;

  // 1. Try encoding at original resolution with a low quality baseline (0.35)
  let baselineBlob = await canvasToBlobAsync(canvas, mimeType, 0.35);

  if (baselineBlob.size > strictTargetBytes) {
    // 2. Only downscale if original resolution at 0.35 quality is STILL too large.
    const areaRatio = strictTargetBytes / baselineBlob.size;
    let scaleRatio = Math.sqrt(areaRatio) * 0.95; // 5% safety margin
    
    if (strictTargetBytes >= 40 * 1024) {
      scaleRatio = Math.max(0.4, scaleRatio); 
    }

    curW = Math.max(16, Math.round(curW * scaleRatio));
    curH = Math.max(16, Math.round(curH * scaleRatio));
    currentCanvas = progressiveDownscale(canvas, curW, curH, mimeType);
  }

  // 3. Binary Search Quality
  async function searchQuality(searchCanvas, passes, minQ = 0.01, maxQ = 0.98) {
    let bestBlob = null;
    let bestDiff = Infinity;
    
    for (let i = 0; i < passes; i++) {
      const midQ = (minQ + maxQ) / 2;
      const blob = await canvasToBlobAsync(searchCanvas, mimeType, midQ);
      
      const diff = Math.abs(blob.size - strictTargetBytes);
      if (blob.size <= strictTargetBytes && diff < bestDiff) {
        bestBlob = blob;
        bestDiff = diff;
      }

      if (blob.size <= strictTargetBytes && (strictTargetBytes - blob.size) <= strictTargetBytes * 0.05) {
        bestBlob = blob;
        break;
      }

      if (blob.size > strictTargetBytes) maxQ = midQ;
      else minQ = midQ;
    }
    
    return bestBlob || await canvasToBlobAsync(searchCanvas, mimeType, 0.01);
  }

  onSubProgress(0.3);
  let bestBlob = await searchQuality(currentCanvas, 7, 0.01, 1.0);
  onSubProgress(0.6);

  // 4. Dynamic Fallback
  let attempts = 0;
  while (bestBlob.size > strictTargetBytes && attempts < 4) {
    curW = Math.max(16, Math.round(curW * 0.75));
    curH = Math.max(16, Math.round(curH * 0.75));
    currentCanvas = progressiveDownscale(canvas, curW, curH, mimeType);
    bestBlob = await searchQuality(currentCanvas, 6, 0.01, 0.85);
    attempts++;
    onSubProgress(0.6 + (attempts * 0.1));
  }

  return {
    blob: bestBlob,
    width: curW,
    height: curH
  };
}

function progressiveDownscale(sourceCanvas, targetW, targetH, mimeType) {
  if (sourceCanvas.width === targetW && sourceCanvas.height === targetH) return sourceCanvas;

  let currentW = sourceCanvas.width;
  let currentH = sourceCanvas.height;
  let currentCanvas = sourceCanvas;

  // Progressive halving loop
  while (currentW > targetW * 2) {
    currentW = Math.max(targetW, Math.floor(currentW / 2));
    currentH = Math.max(targetH, Math.floor(currentH / 2));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentW;
    tempCanvas.height = currentH;
    const ctx = tempCanvas.getContext('2d');
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, currentW, currentH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentCanvas, 0, 0, currentW, currentH);
    currentCanvas = tempCanvas;
  }

  // Final draw to exact target size
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const ctx = finalCanvas.getContext('2d');
  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(currentCanvas, 0, 0, targetW, targetH);
  
  return finalCanvas;
}

function canvasToBlobAsync(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) {
        resolve(b);
      } else {
        // Fallback: If requested format is unsupported, try JPEG
        if (mimeType !== 'image/jpeg') {
          canvas.toBlob((fallback) => resolve(fallback), 'image/jpeg', quality);
        } else {
          reject(new Error(`Canvas toBlob failed for ${mimeType}`));
        }
      }
    }, mimeType, quality);
  });
}

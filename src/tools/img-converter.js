// src/tools/img-converter.js
import { detectFormat } from '../core/format-detector.js';
import { bus } from '../core/bus.js';

export default {
  id: 'img-converter',
  title: 'Universal Image Converter',
  category: 'Image',
  icon: '🔄',
  accept: ['image/*'],
  keywords: ['convert', 'jpg', 'png', 'webp', 'svg', 'bmp', 'tiff'],
  description: 'Fast, secure client-side universal image conversion.',
  maxFiles: 10,
  options: [
    {
      id: 'targetFormat',
      type: 'select',
      label: 'Target Format',
      default: 'image/jpeg',
      options: [
        { label: 'JPEG (Standard)', value: 'image/jpeg' },
        { label: 'PNG (Lossless)', value: 'image/png' },
        { label: 'WebP (Modern)', value: 'image/webp' },
        { label: 'BMP (Legacy)', value: 'image/bmp' },
        { label: 'AVIF (Next-Gen)', value: 'image/avif' },
        { label: 'GIF (Animation)', value: 'image/gif' },
        { label: 'TIFF (Print)', value: 'image/tiff' }
      ]
    },
    {
      id: 'svgScale',
      type: 'select',
      label: 'SVG Raster Scale',
      default: '2',
      options: [
        { label: '1x (Standard)', value: '1' },
        { label: '2x (Retina HD)', value: '2' },
        { label: '4x (Ultra HD)', value: '4' }
      ],
      dependsOn: { inputType: ['image/svg+xml'] }
    },
    {
      id: 'multiFrameAction',
      type: 'select',
      label: 'Animation / Multi-Page Mode',
      default: 'first-frame',
      options: [
        { label: 'First Frame / Page Only', value: 'first-frame' },
        { label: 'Extract All Pages as ZIP', value: 'extract-all' }
      ],
      dependsOn: { inputType: ['image/gif', 'image/tiff'] }
    }
  ],

  async execute(file, options, onProgress = () => {}) {
    try {
      onProgress(10);
      const detectedMime = await detectFormat(file);

      // Emit processing event so UI can display detected mime type or update dependsOn if needed
      bus.emit('item:status', { fileName: file.name, status: 'processing', detectedMime });

      const targetFormat = options.targetFormat || 'image/jpeg';

      // Vector SVG Rasterization
      if (detectedMime === 'image/svg+xml') {
        onProgress(40);
        const svgText = await file.text();
        const result = await renderSvgToRaster(svgText, Number(options.svgScale || 2), targetFormat, 1.0);
        onProgress(100);
        return result;
      }

      onProgress(30);
      // Standard & Specialized Bitmap Pipeline
      let imageSource;
      if (detectedMime === 'image/heic') {
        const { decodeHeicToBitmap } = await import('../core/heic-bridge.js');
        imageSource = await decodeHeicToBitmap(file);
      } else {
        // Handle standard formats using native ImageBitmap
        imageSource = await createImageBitmap(file);
      }

      onProgress(60);
      const canvas = new OffscreenCanvas(imageSource.width, imageSource.height);
      const ctx = canvas.getContext('2d');

      // Alpha Matte handling to prevent black artifacts on transparent inputs
      if (targetFormat === 'image/jpeg' || targetFormat === 'image/bmp') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(imageSource, 0, 0);

      onProgress(80);
      const blob = await canvas.convertToBlob({
        type: targetFormat,
        quality: 1.0 // Fixed 100% quality
      });

      // Explicit GPU Memory Cleanup
      if (imageSource.close) imageSource.close();

      onProgress(100);
      const extension = getExtensionFromMime(targetFormat);
      return {
        blob,
        fileName: file.name.replace(/\.[^/.]+$/, '') + extension,
        originalSize: file.size,
        processedSize: blob.size,
        width: canvas.width,
        height: canvas.height,
        mimeType: targetFormat
      };
    } catch (error) {
      console.error('[Universal Image Converter] Execution failed:', error);
      throw error;
    }
  }
};

async function renderSvgToRaster(svgText, scale, outputType, quality) {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = (img.width || 800) * scale;
      canvas.height = (img.height || 600) * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((resultBlob) => {
        if (!resultBlob) return reject(new Error('SVG rasterization failed'));
        resolve({
          blob: resultBlob,
          fileName: 'vector-rendered' + getExtensionFromMime(outputType),
          originalSize: svgText.length,
          processedSize: resultBlob.size,
          width: canvas.width,
          height: canvas.height,
          mimeType: outputType
        });
      }, outputType, quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getExtensionFromMime(mime) {
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

// src/tools/img-bg-remove.js
// Uses @imgly/background-removal — a purpose-built, battle-tested library
// for client-side AI background removal. No server needed.
import { loadImage, freeCanvas } from '../core/image-utils.js';

let removeBackground = null;

/**
 * Lazy-load the @imgly/background-removal library from CDN
 */
async function ensureBgRemovalLib() {
  if (removeBackground) return removeBackground;
  
  const module = await import(
    /* webpackIgnore: true */
    'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm'
  );
  removeBackground = module.default || module.removeBackground;
  return removeBackground;
}

export default {
  id: "img-bg-remove",
  title: "Remove Background",
  category: "Image",
  icon: "✨",
  accept: ["image/*"],
  maxFiles: 1,
  keywords: ["remove", "background", "transparent", "cutout", "ai", "magic", "eraser"],
  description: "Magically remove image backgrounds entirely in your browser using AI. 100% Private — no data leaves your device.",
  
  options: [
    {
      id: "bgColor",
      type: "color",
      label: "Background",
      default: "transparent",
      presets: [
        { value: "transparent", label: "Transparent" },
        { value: "#ffffff", label: "White" },
        { value: "#000000", label: "Black" },
        { value: "#ffeb3b", label: "Yellow" },
        { value: "#f44336", label: "Red" }
      ]
    }
  ],

  async execute(file, options, onProgress = () => {}) {
    onProgress(5);
    const bgColor = options?.bgColor || 'transparent';
    
    // Step 1: Load the AI library
    onProgress(8);
    const removeBg = await ensureBgRemovalLib();
    
    onProgress(15);
    
    // Step 2: Run AI background removal
    // @imgly/background-removal accepts a Blob/File directly and returns a Blob
    const resultBlob = await removeBg(file, {
      progress: (key, current, total) => {
        // Map download/compute progress to our 15-85 range
        if (key === 'fetch:model') {
          const pct = total > 0 ? (current / total) : 0;
          onProgress(15 + Math.round(pct * 35));
        } else if (key === 'compute:inference') {
          const pct = total > 0 ? (current / total) : 0;
          onProgress(50 + Math.round(pct * 35));
        }
      }
    });
    
    onProgress(88);
    
    // Step 3: Apply background color if needed
    if (bgColor === 'transparent') {
      // Result is already a transparent PNG blob
      onProgress(100);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      return {
        blob: resultBlob,
        fileName: `${baseName}_bg_removed.png`,
        originalSize: file.size,
        processedSize: resultBlob.size
      };
    }
    
    // User wants a solid color background — composite it
    const img = await loadImage(resultBlob);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    
    // Fill with chosen color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the transparent subject on top
    ctx.drawImage(img, 0, 0);
    
    const outBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
    
    freeCanvas(canvas);
    onProgress(100);
    
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    return {
      blob: outBlob,
      fileName: `${baseName}_bg_removed.jpg`,
      originalSize: file.size,
      processedSize: outBlob.size
    };
  }
};

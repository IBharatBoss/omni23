// src/core/heic-bridge.js

let heic2anyPromise = null;

async function loadHeic2Any() {
  if (window.heic2any) return window.heic2any;
  
  if (!heic2anyPromise) {
    heic2anyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      script.onload = () => resolve(window.heic2any);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return heic2anyPromise;
}

export async function decodeHeicToBitmap(file) {
  try {
    const heic2any = await loadHeic2Any();
    
    // Convert HEIC blob to PNG blob
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/png',
      quality: 1 // maximum quality for intermediate conversion
    });
    
    // Handle array of blobs if it was a multi-frame HEIC
    const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    
    return await createImageBitmap(finalBlob);
  } catch (error) {
    console.error('[HEIC Bridge] Error decoding HEIC:', error);
    throw new Error('Failed to decode HEIC file. Make sure you are online.');
  }
}

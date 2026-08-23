// src/core/download.js
/**
 * Cross-Platform Download Engine
 * Handles iOS Safari, Android Chrome, and Desktop browsers.
 *
 * iOS Safari does NOT support <a download>.click() for blob URLs.
 * This module provides platform-aware fallbacks:
 *   1. navigator.share() — iOS native Share Sheet (best UX)
 *   2. window.open(blobUrl) — opens blob in new tab for manual save
 *   3. <a download>.click() — standard desktop download
 */

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/**
 * Download a Blob file with cross-platform support.
 * @param {Blob} blob - The file blob to download
 * @param {string} fileName - The desired file name
 */
export async function downloadFile(blob, fileName) {
  if (!blob || !fileName) return;

  // iOS: Try Web Share API first (best native UX)
  if (isIOS && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      const shareData = { files: [file] };
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return; // Success — user saved via Share Sheet
      }
    } catch (err) {
      // User cancelled share or Share API failed — fall through to next method
      if (err.name === 'AbortError') return; // User intentionally cancelled
      console.warn('[Download] Share API fallback:', err.message);
    }
  }

  // iOS Safari fallback: Open blob URL in new tab
  if (isIOS && isSafari) {
    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, '_blank');
    if (newTab) {
      // Auto-revoke after a delay to prevent memory leak
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    // If popup was blocked, fall through to <a> method
    URL.revokeObjectURL(url);
  }

  // Desktop & Android: Standard <a download> click
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 150);
}

/**
 * Download multiple blobs sequentially with staggered timing.
 * @param {Array<{blob: Blob, fileName: string}>} items
 */
export async function downloadMultipleFiles(items) {
  if (!items || items.length === 0) return;

  // iOS: Use Share API for multi-file if supported
  if (isIOS && navigator.share && navigator.canShare) {
    try {
      const files = items.map(item =>
        new File([item.blob], item.fileName, { type: item.blob.type || 'application/octet-stream' })
      );
      const shareData = { files };
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[Download] Multi-file Share fallback:', err.message);
    }
  }

  // Sequential download for desktop/Android
  for (let i = 0; i < items.length; i++) {
    await new Promise(resolve => {
      setTimeout(() => {
        downloadFile(items[i].blob, items[i].fileName);
        resolve();
      }, i * 250);
    });
  }
}

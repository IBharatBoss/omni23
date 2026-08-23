// src/core/memory.js
import { bus } from './bus.js';

/**
 * Hardened Memory Manager & Blob URL Lifecycle Engine
 * Uses WeakMap caching to reuse existing object URLs for the same Blob.
 */
class MemoryManager {
  constructor() {
    this.registry = new Set();
    this.blobCache = new WeakMap();
    
    bus.on('queue:cleared', () => this.flush());
  }

  createObjectURL(blob) {
    if (!blob) return '';
    if (this.blobCache.has(blob)) {
      return this.blobCache.get(blob);
    }
    try {
      const url = URL.createObjectURL(blob);
      this.registry.add(url);
      this.blobCache.set(blob, url);
      return url;
    } catch (e) {
      console.error('[MemoryManager] Failed to create object URL:', e);
      return '';
    }
  }

  revoke(url) {
    if (url && this.registry.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // ignore
      }
      this.registry.delete(url);
    }
  }

  revokeBlob(blob) {
    if (blob && this.blobCache.has(blob)) {
      const url = this.blobCache.get(blob);
      this.revoke(url);
      this.blobCache.delete(blob);
    }
  }

  flush() {
    if (this.registry.size === 0) return;
    const count = this.registry.size;
    for (const url of this.registry) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // ignore
      }
    }
    this.registry.clear();
    this.blobCache = new WeakMap();
    console.log(`[MemoryManager] Auto-garbage collected ${count} Object URLs.`);
  }
}

export const memory = new MemoryManager();

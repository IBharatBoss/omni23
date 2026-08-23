// sw.js - High-Performance Offline Cache & Stale-While-Revalidate Engine
const CACHE_NAME = 'omnitools-v16-cache';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.webp',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/command-bar.css',
  './src/main.js',
  './src/core/bus.js',
  './src/core/state.js',
  './src/core/memory.js',
  './src/core/scroll-lock.js',
  './src/core/worker-pool.js',
  './src/core/image-utils.js',
  './src/core/format-utils.js',
  './src/core/format-detector.js',
  './src/core/heic-bridge.js',
  './src/core/pdf-loader.js',
  './src/core/download.js',
  './src/core/canvas-utils.js',
  './src/core/toast.js',
  './src/engine/registry.js',
  './src/engine/ingest.js',
  './src/engine/orchestrator.js',
  './src/services/rtdb.js',
  './src/services/ai-copilot.js',
  './src/ui/router.js',
  './src/ui/home-view.js',
  './src/ui/studio-view.js',
  './src/ui/options-panel.js',
  './src/ui/dropzone.js',
  './src/ui/command-bar.js',
  './src/ui/chat-copilot.js',
  './src/ui/inspector-modal.js',
  './src/ui/resizer-workspace.js',
  './src/tools/img-converter.js',
  './src/tools/img-compress.js',
  './src/tools/img-resize.js',
  './src/tools/img-to-pdf.js',
  './src/tools/pdf-to-img.js',
  './src/tools/pdf-compress.js',
  './src/tools/img-bg-remove.js',
  './src/tools/pdf-merge.js',
  './src/tools/pdf-split.js'
];

// Install: Pre-cache all local application shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for local assets, Network-First for dynamic/API requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET or chrome-extension requests
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Helper: Inject COOP/COEP headers for crossOriginIsolated support (needed for WASM threading)
  const injectIsolationHeaders = (response) => {
    // Only inject on same-origin navigations and same-origin resources
    if (url.origin === self.location.origin && response && response.status === 200) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Cross-Origin-Embedder-Policy', 'credentialless');
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
    return response;
  };

  // Stale-While-Revalidate Strategy
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return injectIsolationHeaders(networkResponse);
      }).catch(() => cachedResponse ? injectIsolationHeaders(cachedResponse) : cachedResponse);

      return cachedResponse ? injectIsolationHeaders(cachedResponse) : fetchPromise;
    })
  );
});

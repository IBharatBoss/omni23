// src/main.js
import { registry } from './engine/registry.js';
import { initIngestEngine } from './engine/ingest.js';
import { initOrchestrator } from './engine/orchestrator.js';
import { initRouter } from './ui/router.js';
import { initDropzoneUI } from './ui/dropzone.js';
import { initCommandBar } from './ui/command-bar.js';
import { initChatCopilot } from './ui/chat-copilot.js';
import { initAICopilot } from './services/ai-copilot.js';
import { bus } from './core/bus.js';
import { state } from './core/state.js';
import { toast } from './core/toast.js';

// ============================================================================
// 0. Global Error Boundary
// ============================================================================
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Error]', event.reason);
  toast.show(event.reason?.message || 'An unexpected error occurred.', 'error', 4000);
});

window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
  toast.show(event.error?.message || 'An unexpected error occurred.', 'error', 4000);
});

// ============================================================================
// 1. Scalable Tool Registration Manifest
//    Adding a new tool = 1 new file + 1 line here. No other files need changes.
// ============================================================================
const TOOL_MODULES = [
  () => import('./tools/img-converter.js'),
  () => import('./tools/img-compress.js'),
  () => import('./tools/img-resize.js'),
  () => import('./tools/img-to-pdf.js'),
  () => import('./tools/pdf-to-img.js'),
  () => import('./tools/pdf-compress.js'),
  () => import('./tools/img-bg-remove.js'),
  () => import('./tools/pdf-split.js'),
  () => import('./tools/pdf-merge.js'),
  // ↓ Add new tools here — one line each ↓
];

async function registerAllTools() {
  const modules = await Promise.all(TOOL_MODULES.map(fn => fn()));
  modules.forEach(m => registry.register(m.default));
}

// ============================================================================
// 2. Mobile Gesture Zoom Prevention
// ============================================================================
function initMobileViewportFixes() {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
}

// ============================================================================
// 3. Refresh Protection
// ============================================================================
window.addEventListener('beforeunload', (e) => {
  if (state.get('batchQueue') && state.get('batchQueue').length > 0) {
    e.preventDefault();
    e.returnValue = 'You have uploaded files. If you refresh, all data will be lost. Proceed?';
    return e.returnValue;
  }
});

// Custom UI Modal for Keyboard Refresh (F5 / Ctrl+R / Cmd+R)
window.addEventListener('keydown', (e) => {
  const isRefreshKey = (e.key === 'F5') || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'));

  if (isRefreshKey && state.get('batchQueue') && state.get('batchQueue').length > 0) {
    e.preventDefault(); // Stop native refresh to show our custom UI

    // Check if modal already exists
    if (document.getElementById('custom-refresh-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'custom-refresh-modal';
    modal.className = 'overlay';
    modal.style.zIndex = '10000';
    modal.style.alignItems = 'center';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 360px; text-align: center; padding: 32px 24px; border-radius: var(--radius-xl); background: rgba(23, 107, 116, 0.4); border: 1px solid rgba(152, 203, 184, 0.3); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 24px 48px rgba(0,0,0,0.4);">
        <div style="font-size: 3.5rem; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(255,77,79,0.3));">⚠️</div>
        <h2 style="color: #FFFFFF; margin-bottom: 12px; font-weight: 700; font-size: 1.4rem;">Data Loss Warning</h2>
        <p style="color: rgba(255, 255, 255, 0.85); font-size: 0.95rem; margin-bottom: 28px; line-height: 1.5;">
          You have uploaded files. If you refresh, all your data will be permanently lost. Are you sure you want to remove your data and refresh?
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-direction: column;">
          <button id="btn-confirm-refresh" class="primary-btn danger-btn" style="width: 100%; background: #FF4D4F; border-color: #FF4D4F; color: #FFFFFF; padding: 12px; border-radius: var(--radius-md); font-weight: 600;">Yes, Remove Data & Refresh</button>
          <button id="btn-cancel-refresh" class="secondary-btn glass-btn" style="width: 100%; padding: 12px; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #FFFFFF; font-weight: 500;">No, Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-cancel-refresh').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('btn-confirm-refresh').addEventListener('click', () => {
      state.set('batchQueue', []); // Clear queue so beforeunload doesn't trigger
      window.location.reload();
    });
  }
});

// ============================================================================
// 4. Application Boot Lifecycle
// ============================================================================
async function bootOmniTools() {
  initMobileViewportFixes();

  // Register all tool plugins (parallel loading for speed)
  await registerAllTools();

  // Initialize core systems
  initRouter();
  initDropzoneUI();
  initCommandBar();
  initChatCopilot();
  initIngestEngine();
  initOrchestrator();
  initMobileDock();

  // Initialize AI Copilot (Graceful non-blocking downgrade if offline or unconfigured)
  initAICopilot().catch(console.error);

  console.log('[OmniTools] Clean Decoupled Application Loaded Successfully.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootOmniTools);
} else {
  bootOmniTools();
}

// ============================================================================
// 5. Mobile Dock Navigation & Header Actions
// ============================================================================
function initMobileDock() {
  const homeBtn = document.getElementById('dock-home-btn');
  const uploadBtn = document.getElementById('dock-upload-btn');
  const searchBtn = document.getElementById('dock-search-btn');
  const aiBtn = document.getElementById('dock-ai-btn');
  const topAiBtn = document.getElementById('btn-open-ai');

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      bus.emit('route:navigate', null);
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      const activeToolId = state.get('activeTool');
      const tool = activeToolId ? registry.getTool(activeToolId) : null;
      bus.emit('ingest:open-picker', { accept: tool ? tool.accept : '*/*' });
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      bus.emit('commandbar:open');
    });
  }

  if (aiBtn) {
    aiBtn.addEventListener('click', () => {
      bus.emit('chat:toggle');
    });
  }

  if (topAiBtn) {
    topAiBtn.addEventListener('click', () => {
      bus.emit('chat:toggle');
    });
  }

  // Update active dock indicator on view changes
  bus.on('view:change', ({ view }) => {
    if (homeBtn) {
      if (view === 'home') {
        homeBtn.classList.add('active');
      } else {
        homeBtn.classList.remove('active');
      }
    }
  });
}

// ============================================================================
// 6. Offline PWA Service Worker Registration
// ============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('[PWA] Service Worker registered in scope:', reg.scope);
    }).catch((err) => {
      console.log('[PWA] Service Worker registration failed:', err);
    });
  });
}

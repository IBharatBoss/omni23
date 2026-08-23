// src/ui/router.js
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { registry } from '../engine/registry.js';

/**
 * Decoupled Hash-based View Router
 * Uses lazy dynamic imports for view isolation:
 * - home-view.js is only loaded when navigating to home
 * - studio-view.js is only loaded when navigating to a tool
 * - Changes in one view CANNOT break the other at import time
 */
export function initRouter() {
  // Listen for programmatic navigation events
  bus.on('route:navigate', (toolId) => {
    if (toolId) {
      window.location.hash = `#/tool/${toolId}`;
    } else {
      window.location.hash = '#/';
    }
  });

  // Handle browser popstate / hashchange (Back/Forward buttons)
  window.addEventListener('hashchange', () => {
    handleRoute(window.location.hash);
  });

  // Initial route on boot
  handleRoute(window.location.hash || '#/');
}

async function handleRoute(hash) {
  const homeContainer = document.getElementById('home-view');
  const studioContainer = document.getElementById('studio-view');
  
  if (!homeContainer || !studioContainer) return;

  const toolMatch = hash.match(/^#\/tool\/([a-zA-Z0-9_-]+)/);

  if (toolMatch) {
    const toolId = toolMatch[1];
    const tool = registry.getTool(toolId);

    if (tool) {
      state.syncQueueForTool(tool);
      state.set('activeTool', toolId);
      state.set('currentView', 'studio');

      homeContainer.classList.add('hidden');
      studioContainer.classList.remove('hidden');

      // Lazy load studio-view — isolated from home-view
      const { renderStudioView } = await import('./studio-view.js');
      renderStudioView(tool);
      bus.emit('view:change', { view: 'studio', toolId });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }

  // Default: Home View
  state.set('activeTool', null);
  state.set('currentView', 'home');

  studioContainer.classList.add('hidden');
  homeContainer.classList.remove('hidden');

  // Lazy load home-view — isolated from studio-view
  const { renderHomeView } = await import('./home-view.js');
  renderHomeView();
  bus.emit('view:change', { view: 'home' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

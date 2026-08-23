// src/ui/command-bar.js
import { registry } from '../engine/registry.js';
import { bus } from '../core/bus.js';
import { askCopilot } from '../services/ai-copilot.js';
import { lockBackgroundScroll, unlockBackgroundScroll } from '../core/scroll-lock.js';

/**
 * Mobile-Friendly Spotlight Command Bar (Cmd+K)
 * Locks background scroll and closes exclusively via cut (✕) button.
 */
export function initCommandBar() {
  const overlay = document.getElementById('command-bar-overlay');
  const input = document.getElementById('cmd-input');
  const results = document.getElementById('cmd-results');
  const openBtn = document.getElementById('btn-cmd-k');
  const closeBtn = document.getElementById('close-cmd-bar');

  function open() {
    if (!overlay) return;
    overlay.classList.remove('hidden');
    lockBackgroundScroll();
    if (input) {
      input.value = '';
      renderResults();
      setTimeout(() => input.focus(), 60);
    }
  }

  function close() {
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
      unlockBackgroundScroll();
    }
  }

  function toggle() {
    if (overlay?.classList.contains('hidden')) {
      open();
    } else {
      close();
    }
  }

  // Keyboard shortcut to open/close (Esc / Cmd+K)
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
      close();
    }
  });

  // UI button triggers
  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  bus.on('commandbar:open', open);
  bus.on('commandbar:close', close);

  if (input) {
    input.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (!val) return;

        const matched = registry.matchToolByKeyword(val);
        if (matched.length > 0) {
          close();
          bus.emit('route:navigate', matched[0].id);
        } else {
          // Pass to AI Copilot
          close();
          bus.emit('chat:open');
          await askCopilot(val);
        }
      }
    });
  }

  function renderResults(query = '') {
    if (!results) return;
    results.innerHTML = '';

    const tools = query ? registry.matchToolByKeyword(query) : registry.getAllTools();

    tools.forEach(tool => {
      const item = document.createElement('div');
      item.className = 'cmd-result-item';

      item.innerHTML = `
        <div class="cmd-item-icon">${tool.icon || '⚡'}</div>
        <div class="cmd-item-text">
          <div class="cmd-result-title">${tool.title}</div>
          <div class="cmd-result-desc">${tool.description}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        close();
        bus.emit('route:navigate', tool.id);
      });

      results.appendChild(item);
    });

    // If query returned 0 tool matches (e.g. 'xyz'), render structured fallback tiles
    if (tools.length === 0 && query) {
      const aiItem = document.createElement('div');
      aiItem.className = 'cmd-result-item';
      aiItem.style.background = 'rgba(23, 107, 116, 0.2)';
      aiItem.style.borderColor = 'rgba(23, 107, 116, 0.4)';

      aiItem.innerHTML = `
        <div class="cmd-item-icon" style="background: #176B74; color: #FFFFFF;">✨</div>
        <div class="cmd-item-text">
          <div class="cmd-result-title">Ask AI Copilot for "${query}"</div>
          <div class="cmd-result-desc">Tap or press Enter to ask AI to help with this task</div>
        </div>
      `;

      aiItem.addEventListener('click', async () => {
        close();
        bus.emit('chat:open');
        await askCopilot(query);
      });

      results.appendChild(aiItem);

      const emptyBox = document.createElement('div');
      emptyBox.className = 'cmd-empty-box';
      emptyBox.innerHTML = `
        <span style="font-size: 1.6rem; opacity: 0.7;">🔍</span>
        <strong style="font-size: 0.95rem; color: #1E232A;">No direct tool found for "${query}"</strong>
        <p style="font-size: 0.8rem; color: #334442;">Try searching for "compress", "pdf", "webp", "convert", or ask AI Copilot above.</p>
      `;
      results.appendChild(emptyBox);
    }
  }
}

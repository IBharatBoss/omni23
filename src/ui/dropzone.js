// src/ui/dropzone.js
import { state } from '../core/state.js';
import { bus } from '../core/bus.js';
import { memory } from '../core/memory.js';
import { formatBytes } from '../core/format-utils.js';
import { downloadFile, downloadMultipleFiles } from '../core/download.js';
import { openInspectorModal } from './inspector-modal.js';

let lastRenderedQueueKey = '';

/**
 * Universal Batch Queue & Results Manager
 * High Performance & Stable DOM updates (Zero vibration / Zero flickering)
 */
export function initDropzoneUI() {
  bus.on('state:change', (s) => {
    const queueContainer = document.getElementById('studio-queue-area');
    if (queueContainer && s.currentView === 'studio') {
      renderBatchQueue(queueContainer, s.batchQueue, s.processedFiles, s.isProcessing);
    }
  });
}

export function renderBatchQueue(container, queue, processedFiles, isProcessing) {
  if (!queue || queue.length === 0) {
    container.innerHTML = '';
    lastRenderedQueueKey = '';
    return;
  }

  // Create a unique key for the queue structure
  const currentQueueKey = queue.map(f => `${f.name}_${f.size}`).join('|');

  // If queue structure changed, do a full render
  if (currentQueueKey !== lastRenderedQueueKey || !container.querySelector('.batch-queue-list')) {
    container.innerHTML = '';
    lastRenderedQueueKey = currentQueueKey;

    const section = document.createElement('div');
    section.className = 'batch-section';

    // 1. Batch Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'batch-toolbar';

    const stats = document.createElement('div');
    stats.className = 'batch-stats';
    toolbar.appendChild(stats);

    const actions = document.createElement('div');
    actions.className = 'batch-actions';

    const dlAllBtn = document.createElement('button');
    dlAllBtn.className = 'primary-btn btn-small batch-dl-all-btn hidden';
    dlAllBtn.innerHTML = `<span>⬇️</span> Download All`;
    dlAllBtn.addEventListener('click', () => {
      downloadAllSequentially(state.get('processedFiles'));
    });
    actions.appendChild(dlAllBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'glass-btn btn-small';
    clearBtn.innerHTML = `<span>🗑️</span> Clear`;
    clearBtn.addEventListener('click', () => {
      state.clearQueue();
    });
    actions.appendChild(clearBtn);

    toolbar.appendChild(actions);
    section.appendChild(toolbar);

    // 2. Queue Cards List
    const list = document.createElement('div');
    list.className = 'batch-queue-list';

    queue.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'glass-card queue-card';
      card.dataset.index = index;

      const topRow = document.createElement('div');
      topRow.className = 'queue-card-top';

      if (queue.length > 1) {
        const numBadge = document.createElement('div');
        numBadge.className = 'queue-num-badge';
        numBadge.textContent = `#${index + 1}`;
        topRow.appendChild(numBadge);
      }

      const thumb = document.createElement('div');
      thumb.className = 'queue-thumb';
      thumb.title = 'Click to inspect & crop/rotate';

      const isImage = file.type && file.type.startsWith('image/');
      if (isImage) {
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', () => {
          const p = state.get('processedFiles').find(item => item.index === index);
          openInspectorModal(file, p ? p.result : null, index);
        });
        const img = document.createElement('img');
        img.src = memory.createObjectURL(file);
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = 'var(--radius-sm)';
        thumb.appendChild(img);
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        thumb.textContent = '📄';
      } else {
        thumb.textContent = '📁';
      }

      topRow.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'queue-info';

      const name = document.createElement('div');
      name.className = 'queue-filename';
      name.title = file.name;
      name.textContent = file.name;
      info.appendChild(name);

      const sizeFlow = document.createElement('div');
      sizeFlow.className = 'queue-size-flow';
      sizeFlow.dataset.fileSize = file.size;
      info.appendChild(sizeFlow);

      topRow.appendChild(info);
      card.appendChild(topRow);

      const progressBg = document.createElement('div');
      progressBg.className = 'queue-progress hidden';
      const fill = document.createElement('div');
      fill.className = 'queue-progress-bar';
      progressBg.appendChild(fill);
      card.appendChild(progressBg);

      const cardActions = document.createElement('div');
      cardActions.className = 'queue-card-actions';

      if (isImage) {
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'icon-btn eye-inspect-btn';
        eyeBtn.innerHTML = '👁️';
        eyeBtn.title = 'Inspect & Crop / Rotate';
        eyeBtn.addEventListener('click', () => {
          const p = state.get('processedFiles').find(item => item.index === index);
          openInspectorModal(file, p ? p.result : null, index);
        });
        cardActions.appendChild(eyeBtn);
      }

      const dlSingleBtn = document.createElement('button');
      dlSingleBtn.className = 'primary-btn btn-small queue-dl-single hidden';
      dlSingleBtn.innerHTML = `<span>⬇</span> Download`;
      cardActions.appendChild(dlSingleBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn queue-remove-btn';
      removeBtn.style.width = '32px';
      removeBtn.style.height = '32px';
      removeBtn.style.fontSize = '0.85rem';
      removeBtn.title = 'Remove file';
      removeBtn.innerHTML = '✕';
      removeBtn.addEventListener('click', () => {
        state.removeQueueItem(index);
      });
      cardActions.appendChild(removeBtn);

      card.appendChild(cardActions);
      list.appendChild(card);
    });

    section.appendChild(list);
    container.appendChild(section);

    // Scroll smoothly to queue area once on attach
    setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }

  // 3. Fast In-Place Reactive Update (No DOM destroying = Zero Vibration!)
  const doneCount = processedFiles.filter(p => p.status === 'done').length;
  const statsEl = container.querySelector('.batch-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="queue-count-badge">📑 ${queue.length} Attached</span>
      ${doneCount > 0 ? `<span class="queue-done-badge">✓ Ready</span>` : ''}
    `;
  }

  const dlAllBtn = container.querySelector('.batch-dl-all-btn');
  if (dlAllBtn) {
    dlAllBtn.classList.toggle('hidden', doneCount < 2);
    dlAllBtn.innerHTML = `<span>⬇️</span> Download All (${doneCount})`;
  }

  queue.forEach((file, index) => {
    const card = container.querySelector(`.queue-card[data-index="${index}"]`);
    if (!card) return;

    const processed = processedFiles.find(p => p.index === index) || { progress: 0, status: 'pending' };
    const sizeFlow = card.querySelector('.queue-size-flow');
    const progressBg = card.querySelector('.queue-progress');
    const progressBar = card.querySelector('.queue-progress-bar');
    const dlBtn = card.querySelector('.queue-dl-single');
    const removeBtn = card.querySelector('.queue-remove-btn');

    if (removeBtn) removeBtn.classList.toggle('hidden', isProcessing);

    if (processed.status === 'done' && processed.result) {
      if (progressBg) progressBg.classList.add('hidden');
      const origFormatted = formatBytes(file.size);
      const procFormatted = formatBytes(processed.result.processedSize);
      const savings = file.size > 0 ? ((file.size - processed.result.processedSize) / file.size) * 100 : 0;
      
      let delta = `${origFormatted} → <strong>${procFormatted}</strong> `;
      if (processed.result.totalPages) {
        delta += `<span class="dim-chip">${processed.result.totalPages} Pages</span> `;
      }
      if (processed.result.mergedCount) {
        delta += `<span class="savings-chip">Merged ${processed.result.mergedCount} PDFs</span> `;
      } else if (savings > 0) {
        delta += `<span class="savings-chip">-${savings.toFixed(1)}%</span> `;
      }
      if (processed.result.width && processed.result.height) {
        delta += `<span class="dim-chip">${processed.result.width}×${processed.result.height}</span>`;
      }
      if (sizeFlow) sizeFlow.innerHTML = delta;

      if (dlBtn) {
        dlBtn.classList.remove('hidden');
        dlBtn.onclick = async () => {
          await downloadFile(processed.result.blob, processed.result.fileName || file.name);
          state.removeQueueItem(index);
        };
      }
    } else if (processed.status === 'processing') {
      if (progressBg) progressBg.classList.remove('hidden');
      if (progressBar) progressBar.style.width = `${processed.progress || 10}%`;
      if (sizeFlow) sizeFlow.textContent = `Compressing... ${processed.progress || 0}%`;
      if (dlBtn) dlBtn.classList.add('hidden');
    } else if (processed.status === 'error') {
      if (progressBg) progressBg.classList.add('hidden');
      if (sizeFlow) sizeFlow.innerHTML = `<span style="color: var(--color-danger)">Processing failed</span>`;
      if (dlBtn) dlBtn.classList.add('hidden');
    } else {
      if (progressBg) progressBg.classList.add('hidden');
      if (sizeFlow) sizeFlow.innerHTML = `<span style="color: #17423D;">Attached • <strong>${formatBytes(file.size)}</strong></span>`;
      if (dlBtn) dlBtn.classList.add('hidden');
    }
  });
}

async function downloadAllSequentially(processedFiles) {
  const completed = processedFiles.filter(p => p.status === 'done' && p.result?.blob);
  if (completed.length === 0) return;

  await downloadMultipleFiles(
    completed.map(item => ({ blob: item.result.blob, fileName: item.result.fileName }))
  );

  setTimeout(() => {
    state.clearQueue();
  }, 400);
}


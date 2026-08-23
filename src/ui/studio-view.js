// src/ui/studio-view.js
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { renderOptionsPanel } from './options-panel.js';
import { renderBatchQueue } from './dropzone.js';
import { renderResizerWorkspace } from './resizer-workspace.js';

/**
 * Decoupled Tool Studio View Component
 * Provides a dedicated workspace for the active tool.
 */
export function renderStudioView(tool) {
  const container = document.getElementById('studio-view');
  if (!container) return;

  container.innerHTML = '';
  container.className = 'studio-view animate-fade-in';

  // 1. Studio Header Card
  const headerCard = document.createElement('div');
  headerCard.className = 'glass-card studio-header-card';

  headerCard.innerHTML = `
    <div class="studio-title-area">
      <button class="icon-btn" id="studio-back-btn" title="Back to All Tools" style="margin-right: 4px;">
        ←
      </button>
      <div class="studio-tool-icon">${tool.icon || '⚡'}</div>
      <div class="studio-meta">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2>${tool.title}</h2>
          <span class="tool-card-category">${tool.category}</span>
        </div>
        <p>${tool.description}</p>
      </div>
    </div>
  `;

  const backBtn = headerCard.querySelector('#studio-back-btn');
  backBtn.addEventListener('click', () => {
    bus.emit('route:navigate', null); // Navigate back to Home
  });

  container.appendChild(headerCard);

  // 2. Options Panel (if tool has options and is not custom resizer)
  if (tool.id !== 'img-resize' && tool.options && tool.options.length > 0) {
    const optionsPanel = renderOptionsPanel(tool);
    container.appendChild(optionsPanel);
  }

  // 3. Studio Upload Box (Dropzone + Tap-to-Upload)
  const dropzoneBox = document.createElement('div');
  dropzoneBox.className = 'studio-dropzone-box';
  dropzoneBox.id = 'studio-dropzone';

  const acceptText = tool.accept.includes('*/*') ? 'any file' : tool.accept.map(a => a.replace('image/', '').replace('application/', '').toUpperCase()).join(', ');

  dropzoneBox.innerHTML = `
    <div class="dropzone-upload-icon">⬆</div>
    <div class="dropzone-text-main">Tap to Choose or Drop ${tool.category} ${tool.maxFiles === 1 ? 'Image' : 'Files'}</div>
    <div class="dropzone-text-sub">Supports ${acceptText} • 100% Client-Side Processing</div>
    <button class="primary-btn" style="margin-top: 4px; pointer-events: none;">Select File</button>
  `;

  // Trigger file input on click
  dropzoneBox.addEventListener('click', () => {
    bus.emit('ingest:open-picker', { accept: tool.accept });
  });

  // Local drag & drop
  dropzoneBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneBox.classList.add('drag-over');
  });

  dropzoneBox.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzoneBox.classList.remove('drag-over');
  });

  dropzoneBox.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneBox.classList.remove('drag-over');
    if (e.dataTransfer?.files?.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      state.updateBatchQueue(files);
    }
  });

  container.appendChild(dropzoneBox);

  // 4. Batch Queue & Results Container
  const queueArea = document.createElement('div');
  queueArea.id = 'studio-queue-area';
  container.appendChild(queueArea);

  // 5. Sticky Action Footer / Execute Button
  const actionArea = document.createElement('div');
  actionArea.id = 'studio-action-area';
  actionArea.style.display = 'flex';
  actionArea.style.justifyContent = 'center';
  actionArea.style.marginTop = '10px';
  container.appendChild(actionArea);

  // Initial Queue render & Button sync
  updateStudioState(tool);
}

export function updateStudioState(tool) {
  const queueArea = document.getElementById('studio-queue-area');
  const actionArea = document.getElementById('studio-action-area');
  const dropzoneBox = document.getElementById('studio-dropzone');
  if (!queueArea || !actionArea) return;

  const queue = state.get('batchQueue') || [];
  const processed = state.get('processedFiles');
  const isProcessing = state.get('isProcessing');

  // Custom Direct Workspace for Image Resizer
  if (tool.id === 'img-resize') {
    if (queue.length > 0) {
      if (dropzoneBox) dropzoneBox.classList.add('hidden');
      actionArea.innerHTML = '';
      renderResizerWorkspace(queueArea, queue[0]);
    } else {
      if (dropzoneBox) dropzoneBox.classList.remove('hidden');
      queueArea.innerHTML = '';
      actionArea.innerHTML = '';
    }
    return;
  }

  // Standard Batch Tools
  if (dropzoneBox) dropzoneBox.classList.remove('hidden');
  renderBatchQueue(queueArea, queue, processed, isProcessing);

  actionArea.innerHTML = '';

  if (queue.length > 0) {
    const execBtn = document.createElement('button');
    execBtn.className = 'primary-btn';
    execBtn.style.padding = '14px 36px';
    execBtn.style.fontSize = '1.05rem';
    execBtn.disabled = isProcessing;

    const actionVerb = tool.batchExecute ? 'Merge & Process' : 'Process';
    execBtn.innerHTML = isProcessing
      ? `<span>⏳</span> Processing...`
      : `<span>⚡</span> ${actionVerb} ${queue.length} File${queue.length > 1 ? 's' : ''}`;

    execBtn.addEventListener('click', () => {
      const options = state.get('activeToolOptions') || {};
      bus.emit('batch:start', { toolId: tool.id, queue, options });
    });

    actionArea.appendChild(execBtn);
  }
}


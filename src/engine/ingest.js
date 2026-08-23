// src/engine/ingest.js
import { registry } from './registry.js';
import { state } from '../core/state.js';
import { bus } from '../core/bus.js';
import { lockBackgroundScroll, unlockBackgroundScroll } from '../core/scroll-lock.js';

/**
 * Universal Ingestion Engine:
 * - Mobile & Desktop <input type="file"> support
 * - Fullscreen & In-Studio Drag-and-Drop
 * - Global Clipboard Paste (Ctrl+V)
 * - Smart Tool Action Picker (No forced auto-routing)
 */
export function initIngestEngine() {
  const fullscreenDropzone = document.getElementById('app-dropzone');
  const globalFileInput = document.getElementById('global-file-input');

  // 1. Global Clipboard Paste (Ctrl + V)
  window.addEventListener('paste', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    const filesToProcess = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) filesToProcess.push(file);
      }
    }

    if (filesToProcess.length > 0) {
      e.preventDefault();
      handleIngestedFiles(filesToProcess);
    }
  });

  // 2. Global Drag and Drop
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      dragCounter++;
      if (fullscreenDropzone) fullscreenDropzone.classList.remove('hidden');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    
    // Safety check: if mouse leaves the actual browser window, reset entirely
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      dragCounter = 0;
    } else {
      dragCounter--;
    }

    if (dragCounter <= 0) {
      dragCounter = 0;
      if (fullscreenDropzone) fullscreenDropzone.classList.add('hidden');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (fullscreenDropzone) fullscreenDropzone.classList.add('hidden');

    if (e.dataTransfer?.files?.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      handleIngestedFiles(files);
    }
  });

  // 3. Global Hidden File Input (Mobile tap-to-upload)
  if (globalFileInput) {
    globalFileInput.addEventListener('change', (e) => {
      if (e.target.files?.length > 0) {
        const files = Array.from(e.target.files);
        handleIngestedFiles(files);
        e.target.value = '';
      }
    });
  }

  // 4. Programmatic trigger to open file picker
  bus.on('ingest:open-picker', ({ accept = '*/*' } = {}) => {
    if (globalFileInput) {
      globalFileInput.accept = Array.isArray(accept) ? accept.join(',') : accept;

      // Toggle multiple attribute based on active tool's maxFiles
      const activeToolId = state.get('activeTool');
      const activeTool = activeToolId ? registry.getTool(activeToolId) : null;
      if (activeTool && activeTool.maxFiles === 1) {
        globalFileInput.removeAttribute('multiple');
      } else {
        globalFileInput.setAttribute('multiple', '');
      }

      globalFileInput.click();
    }
  });
}

/**
 * Universal file handler:
 * - If inside a tool studio: adds files directly to active tool queue.
 * - If on home screen: opens Smart Tool Action Picker so user chooses what to do!
 */
export function handleIngestedFiles(files) {
  if (!files || files.length === 0) return;

  const MAX_GLOBAL_FILES = 10;
  if (files.length > MAX_GLOBAL_FILES) {
    console.warn(`[Ingest Engine] Dropping ${files.length - MAX_GLOBAL_FILES} files. Global queue ceiling is ${MAX_GLOBAL_FILES}.`);
    files = files.slice(0, MAX_GLOBAL_FILES);
  }

  const currentToolId = state.get('activeTool');

  // Case A: User is already inside a specific Tool Studio
  if (currentToolId) {
    const activeTool = registry.getTool(currentToolId);
    if (activeTool) {
      // Add all files to queue
      state.updateBatchQueue(files);
      return;
    }
  }

  // Case B: User uploaded from Home Screen or Global Upload Button
  // Show the Smart Action Tool Picker Sheet so user chooses their desired tool
  openToolPickerModal(files);
}

/**
 * Renders an interactive modal allowing the user to select which tool to use
 * for their uploaded files (handles images, PDFs, SVGs, or mixed uploads seamlessly).
 */
function openToolPickerModal(files) {
  const overlay = document.getElementById('ingest-picker-overlay');
  const fileCountEl = document.getElementById('ingest-file-count');
  const toolsListEl = document.getElementById('ingest-tools-list');
  const closeBtn = document.getElementById('close-ingest-picker');

  if (!overlay || !toolsListEl) {
    // Fallback: If modal DOM missing, route to image compressor or first match
    state.set('activeTool', 'img-compress');
    state.clearQueue();
    state.updateBatchQueue(files);
    bus.emit('route:navigate', 'img-compress');
    return;
  }

  // Count file categories
  let imageCount = 0;
  let pdfCount = 0;
  let svgCount = 0;
  let otherCount = 0;

  files.forEach(f => {
    const type = f.type || '';
    const name = f.name.toLowerCase();
    if (type.startsWith('image/') && !name.endsWith('.svg')) imageCount++;
    else if (type === 'application/pdf' || name.endsWith('.pdf')) pdfCount++;
    else if (type === 'image/svg+xml' || name.endsWith('.svg')) svgCount++;
    else otherCount++;
  });

  const summaryParts = [];
  if (imageCount > 0) summaryParts.push(`${imageCount} Image${imageCount > 1 ? 's' : ''}`);
  if (pdfCount > 0) summaryParts.push(`${pdfCount} PDF${pdfCount > 1 ? 's' : ''}`);
  if (svgCount > 0) summaryParts.push(`${svgCount} SVG${svgCount > 1 ? 's' : ''}`);
  if (otherCount > 0) summaryParts.push(`${otherCount} Other File${otherCount > 1 ? 's' : ''}`);

  if (fileCountEl) {
    fileCountEl.textContent = `${files.length} File${files.length > 1 ? 's' : ''} Selected (${summaryParts.join(', ')})`;
  }

  // Populate candidate tools
  toolsListEl.innerHTML = '';
  const allTools = registry.getAllTools();

  // Sort tools so matching tools for the uploaded types appear on top
  const matchedTools = allTools.filter(t => {
    if (imageCount > 0 && t.category === 'Image') return true;
    if (pdfCount > 0 && t.category === 'PDF') return true;
    if (svgCount > 0 && t.category === 'Vector') return true;
    return false;
  });

  const displayTools = matchedTools.length > 0 ? matchedTools : allTools;

  displayTools.forEach(tool => {
    const item = document.createElement('div');
    item.className = 'ingest-tool-option';
    item.innerHTML = `
      <div class="ingest-tool-icon">${tool.icon || '⚡'}</div>
      <div class="ingest-tool-info">
        <div class="ingest-tool-header">
          <span class="ingest-tool-title">${tool.title}</span>
          <span class="ingest-tool-badge">${tool.category}</span>
        </div>
        <span class="ingest-tool-desc">${tool.description}</span>
      </div>
      <div class="ingest-tool-arrow">→</div>
    `;

    item.addEventListener('click', () => {
      // Filter files accepted by this tool if user uploaded mixed files
      const acceptedFiles = files.filter(file => {
        if (tool.accept.includes('*/*')) return true;
        const type = file.type;
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return tool.accept.some(acc => acc === type || acc === ext || (acc.endsWith('/*') && type.startsWith(acc.replace('/*', ''))));
      });

      const filesToQueue = acceptedFiles.length > 0 ? acceptedFiles : files;

      // Close modal
      overlay.classList.add('hidden');
      unlockBackgroundScroll();

      // Pre-set active tool so the router doesn't treat it as an external navigation
      state.set('activeTool', tool.id);
      state.clearQueue();
      state.updateBatchQueue(filesToQueue);
      bus.emit('route:navigate', tool.id);
    });

    toolsListEl.appendChild(item);
  });

  // Open modal & lock body scroll
  overlay.classList.remove('hidden');
  lockBackgroundScroll();

  const closeModal = () => {
    overlay.classList.add('hidden');
    unlockBackgroundScroll();
  };

  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }
}

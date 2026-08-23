// src/ui/resizer-workspace.js
import { state } from '../core/state.js';
import { memory } from '../core/memory.js';
import { downloadFile } from '../core/download.js';
import { fillWhiteMatte, setupSmoothCanvas, getExtFromMime } from '../core/canvas-utils.js';

/**
 * Direct Live Interactive Resizer Workspace (Single-Image Fast Flow)
 * - Zero popups / Zero modals
 * - Direct on-screen interactive drag box with live dimension badge
 * - 2-way real-time reactive sync between Width/Height inputs and on-screen drag box
 * - Aspect Ratio lock & Quick presets (1:1, 16:9, 9:16, 4:3, 100%)
 * - 1-Click direct high-res export and download
 */
export function renderResizerWorkspace(container, file) {
  if (!container || !file) return;

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'resizer-workspace animate-fade-in';

  // Read file as object URL
  const imgUrl = memory.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    const natW = img.naturalWidth || 800;
    const natH = img.naturalHeight || 600;

    let isAspectLocked = true;
    let currentAspect = natW / natH;

    // Crop box coordinates in percentages [0 to 100]
    let cropRect = { x: 0, y: 0, w: 100, h: 100 };

    wrapper.innerHTML = `
      <!-- 1. Top Control Bar (Inputs & Presets) -->
      <div class="resizer-control-bar glass-panel-subtle">
        <div class="resizer-inputs-group">
          <div class="resizer-input-field">
            <label for="resizer-w-input">Width (px)</label>
            <input type="number" id="resizer-w-input" class="resizer-num-input" value="${natW}" min="1" max="16384">
          </div>

          <button id="resizer-aspect-btn" class="resizer-aspect-btn active" title="Toggle Aspect Ratio Lock">
            🔒
          </button>

          <div class="resizer-input-field">
            <label for="resizer-h-input">Height (px)</label>
            <input type="number" id="resizer-h-input" class="resizer-num-input" value="${natH}" min="1" max="16384">
          </div>

          <div class="resizer-input-field">
            <label for="resizer-fmt-select">Format</label>
            <select id="resizer-fmt-select" class="resizer-select-input">
              <option value="image/jpeg">JPEG (.jpg)</option>
              <option value="image/png">PNG (.png)</option>
              <option value="image/webp">WebP (.webp)</option>
              <option value="original">Original</option>
            </select>
          </div>
        </div>

        <!-- Quick Ratio Presets -->
        <div class="resizer-presets-row">
          <span class="resizer-presets-label">Presets:</span>
          <button class="resizer-chip active" data-preset="full">100% Original</button>
          <button class="resizer-chip" data-preset="1:1">1:1 Square</button>
          <button class="resizer-chip" data-preset="16:9">16:9 Landscape</button>
          <button class="resizer-chip" data-preset="9:16">9:16 Story</button>
          <button class="resizer-chip" data-preset="4:3">4:3 Standard</button>
        </div>
      </div>

      <!-- 2. Interactive Image Stage Viewport -->
      <div class="resizer-stage-container">
        <div class="resizer-img-wrapper" id="resizer-img-wrapper">
          <img src="${imgUrl}" alt="${file.name}" class="resizer-base-img" id="resizer-base-img">

          <!-- Interactive Bounding Box Overlay -->
          <div class="resizer-overlay" id="resizer-overlay">
            <div class="resizer-crop-box" id="resizer-crop-box">
              <div class="resizer-handle resizer-handle-tl" data-handle="tl"></div>
              <div class="resizer-handle resizer-handle-tr" data-handle="tr"></div>
              <div class="resizer-handle resizer-handle-br" data-handle="br"></div>
              <div class="resizer-handle resizer-handle-bl" data-handle="bl"></div>
              <div class="resizer-dim-badge" id="resizer-dim-badge">${natW} × ${natH} px</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Bottom Action Bar -->
      <div class="resizer-action-bar">
        <button class="glass-btn btn-small" id="resizer-change-img-btn">
          <span>🗑️</span> Change Image
        </button>

        <button class="primary-btn" id="resizer-download-btn" style="padding: 12px 32px; font-size: 1rem; font-weight: 700;">
          <span>⚡</span> Resize & Download Image
        </button>
      </div>
    `;

    const inputW = wrapper.querySelector('#resizer-w-input');
    const inputH = wrapper.querySelector('#resizer-h-input');
    const aspectBtn = wrapper.querySelector('#resizer-aspect-btn');
    const formatSelect = wrapper.querySelector('#resizer-fmt-select');
    const cropBox = wrapper.querySelector('#resizer-crop-box');
    const dimBadge = wrapper.querySelector('#resizer-dim-badge');
    const overlay = wrapper.querySelector('#resizer-overlay');
    const downloadBtn = wrapper.querySelector('#resizer-download-btn');
    const changeImgBtn = wrapper.querySelector('#resizer-change-img-btn');
    const presetChips = wrapper.querySelectorAll('.resizer-chip');

    // Helper: calculate ratio string for badge (e.g., 16:9 or 1:1)
    const getRatioString = (w, h) => {
      const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
      const d = gcd(w, h);
      if (d > 1 && (w / d) <= 32 && (h / d) <= 32) {
        return `${w / d}:${h / d}`;
      }
      return (w / h).toFixed(2) + ':1';
    };

    // Update UI Elements based on cropRect
    const updateUIFromCropRect = () => {
      cropBox.style.left = `${cropRect.x}%`;
      cropBox.style.top = `${cropRect.y}%`;
      cropBox.style.width = `${cropRect.w}%`;
      cropBox.style.height = `${cropRect.h}%`;

      const curW = Math.max(1, Math.round((cropRect.w / 100) * natW));
      const curH = Math.max(1, Math.round((cropRect.h / 100) * natH));

      inputW.value = curW;
      inputH.value = curH;
      currentAspect = curW / curH;

      dimBadge.textContent = `${curW} × ${curH} px (${getRatioString(curW, curH)})`;
    };

    // Update Crop Rect from Input dimensions
    const updateCropRectFromInputs = (source = 'w') => {
      let targetW = parseInt(inputW.value, 10) || natW;
      let targetH = parseInt(inputH.value, 10) || natH;

      if (isAspectLocked) {
        if (source === 'w') {
          targetH = Math.max(1, Math.round(targetW / currentAspect));
          inputH.value = targetH;
        } else {
          targetW = Math.max(1, Math.round(targetH * currentAspect));
          inputW.value = targetW;
        }
      }

      const percentW = Math.min(100, Math.max(5, (targetW / natW) * 100));
      const percentH = Math.min(100, Math.max(5, (targetH / natH) * 100));

      // Center the box if it goes out of bounds
      const x = Math.max(0, Math.min(100 - percentW, (100 - percentW) / 2));
      const y = Math.max(0, Math.min(100 - percentH, (100 - percentH) / 2));

      cropRect = { x, y, w: percentW, h: percentH };

      cropBox.style.left = `${cropRect.x}%`;
      cropBox.style.top = `${cropRect.y}%`;
      cropBox.style.width = `${cropRect.w}%`;
      cropBox.style.height = `${cropRect.h}%`;

      dimBadge.textContent = `${targetW} × ${targetH} px (${getRatioString(targetW, targetH)})`;
    };

    // Input event listeners
    inputW.addEventListener('input', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      updateCropRectFromInputs('w');
    });

    inputH.addEventListener('input', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      updateCropRectFromInputs('h');
    });

    // Aspect Ratio Lock Toggle
    aspectBtn.addEventListener('click', () => {
      isAspectLocked = !isAspectLocked;
      aspectBtn.classList.toggle('active', isAspectLocked);
      aspectBtn.innerHTML = isAspectLocked ? '🔒' : '🔓';
      if (isAspectLocked) {
        const curW = parseInt(inputW.value, 10) || natW;
        const curH = parseInt(inputH.value, 10) || natH;
        currentAspect = curW / curH;
      }
    });

    // Quick Presets
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const preset = chip.dataset.preset;
        if (preset === 'full') {
          cropRect = { x: 0, y: 0, w: 100, h: 100 };
          currentAspect = natW / natH;
        } else {
          let ratio = 1;
          if (preset === '1:1') ratio = 1;
          else if (preset === '16:9') ratio = 16 / 9;
          else if (preset === '9:16') ratio = 9 / 16;
          else if (preset === '4:3') ratio = 4 / 3;

          currentAspect = ratio;
          isAspectLocked = true;
          aspectBtn.classList.add('active');
          aspectBtn.innerHTML = '🔒';

          const imageAspect = natW / natH;
          let wPct = 100;
          let hPct = 100;

          if (ratio > imageAspect) {
            // Target is wider than image
            wPct = 100;
            hPct = Math.min(100, (wPct * imageAspect) / ratio);
          } else {
            // Target is taller than image
            hPct = 100;
            wPct = Math.min(100, (hPct * ratio) / imageAspect);
          }

          const x = (100 - wPct) / 2;
          const y = (100 - hPct) / 2;
          cropRect = { x, y, w: wPct, h: hPct };
        }
        updateUIFromCropRect();
      });
    });

    // Interactive Dragging on Box and Corner Handles
    let activeHandle = null;
    let startX = 0, startY = 0;
    let initialCrop = { ...cropRect };

    const onPointerDown = (e) => {
      const handleEl = e.target.closest('.resizer-handle');
      const isBox = e.target.closest('#resizer-crop-box');

      if (handleEl) {
        activeHandle = handleEl.dataset.handle;
      } else if (isBox) {
        activeHandle = 'move';
      } else {
        return;
      }

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX;
      startY = clientY;
      initialCrop = { ...cropRect };

      presetChips.forEach(c => c.classList.remove('active'));

      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e) => {
      if (!activeHandle) return;

      const overlayRect = overlay.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const dx = ((clientX - startX) / overlayRect.width) * 100;
      const dy = ((clientY - startY) / overlayRect.height) * 100;

      let { x, y, w, h } = initialCrop;

      if (activeHandle === 'move') {
        x = Math.max(0, Math.min(100 - w, x + dx));
        y = Math.max(0, Math.min(100 - h, y + dy));
      } else if (activeHandle === 'br') {
        w = Math.max(5, Math.min(100 - x, w + dx));
        if (isAspectLocked) {
          const pxW = (w / 100) * natW;
          const pxH = pxW / currentAspect;
          h = Math.min(100 - y, (pxH / natH) * 100);
        } else {
          h = Math.max(5, Math.min(100 - y, h + dy));
        }
      } else if (activeHandle === 'tr') {
        w = Math.max(5, Math.min(100 - x, w + dx));
        const newH = Math.max(5, h - dy);
        const newY = y + (h - newH);
        if (newY >= 0) {
          y = newY;
          h = newH;
        }
      } else if (activeHandle === 'bl') {
        const newW = Math.max(5, w - dx);
        const newX = x + (w - newW);
        if (newX >= 0) {
          x = newX;
          w = newW;
        }
        h = Math.max(5, Math.min(100 - y, h + dy));
      } else if (activeHandle === 'tl') {
        const newW = Math.max(5, w - dx);
        const newH = Math.max(5, h - dy);
        const newX = x + (w - newW);
        const newY = y + (h - newH);
        if (newX >= 0 && newY >= 0) {
          x = newX;
          w = newW;
          y = newY;
          h = newH;
        }
      }

      cropRect = { x, y, w, h };
      updateUIFromCropRect();
    };

    const onPointerUp = () => {
      activeHandle = null;
    };

    overlay.addEventListener('mousedown', onPointerDown);
    overlay.addEventListener('touchstart', onPointerDown, { passive: false });

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    // Cleanup function to remove window-level listeners (prevents memory leak)
    const cleanupListeners = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchend', onPointerUp);
    };

    // Change Image button — also cleanup listeners
    changeImgBtn.addEventListener('click', () => {
      cleanupListeners();
      state.clearQueue();
    });

    // Auto-cleanup when container is cleared (e.g. navigating away)
    const observer = new MutationObserver(() => {
      if (!document.body.contains(wrapper)) {
        cleanupListeners();
        observer.disconnect();
      }
    });
    observer.observe(container.parentNode || document.body, { childList: true, subtree: true });

    // Resize & Download Direct Execution
    downloadBtn.addEventListener('click', async () => {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = `<span>⏳</span> Resizing...`;

      try {
        const targetW = Math.max(1, parseInt(inputW.value, 10) || natW);
        const targetH = Math.max(1, parseInt(inputH.value, 10) || natH);

        // Crop pixel coordinates on raw image
        const cropX = Math.round((cropRect.x / 100) * natW);
        const cropY = Math.round((cropRect.y / 100) * natH);
        const cropW = Math.max(1, Math.round((cropRect.w / 100) * natW));
        const cropH = Math.max(1, Math.round((cropRect.h / 100) * natH));

        // Create high-res canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = targetW;
        exportCanvas.height = targetH;
        const ctx = exportCanvas.getContext('2d');
        setupSmoothCanvas(ctx);

        let targetMime = formatSelect.value || 'image/jpeg';
        if (targetMime === 'original') {
          targetMime = file.type || 'image/jpeg';
        }

        // Background matte fill for JPEG to prevent black artifacts
        if (targetMime === 'image/jpeg') {
          fillWhiteMatte(ctx, targetW, targetH);
        }

        // Draw cropped and scaled image onto canvas
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

        const quality = targetMime === 'image/png' ? 1.0 : 0.92;
        const ext = getExtFromMime(targetMime).replace('.', '');
        const outName = `${file.name.replace(/\.[^/.]+$/, '')}_${targetW}x${targetH}.${ext}`;

        exportCanvas.toBlob(async (blob) => {
          // Free canvas GPU memory immediately
          exportCanvas.width = 1;
          exportCanvas.height = 1;

          if (!blob) {
            alert('Failed to resize image.');
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = `<span>⚡</span> Resize & Download Image`;
            return;
          }

          // Cross-platform download (iOS Safari compatible)
          await downloadFile(blob, outName);

          downloadBtn.disabled = false;
          downloadBtn.innerHTML = `<span>⚡</span> Resize & Download Image`;
        }, targetMime, quality);
      } catch (err) {
        console.error('[Resizer] Export failed:', err);
        alert('An error occurred while resizing the image.');
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `<span>⚡</span> Resize & Download Image`;
      }
    });

    // Initial positioning
    updateUIFromCropRect();
  };

  img.src = imgUrl;
  container.appendChild(wrapper);
}

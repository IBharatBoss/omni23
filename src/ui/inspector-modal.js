// src/ui/inspector-modal.js
import { memory } from '../core/memory.js';
import { lockBackgroundScroll, unlockBackgroundScroll } from '../core/scroll-lock.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { formatBytes } from '../core/format-utils.js';
let modalEl = null;
let _cleanupFns = []; // Track window listeners for proper cleanup

/**
 * OmniTools Cohesive Graphic Lightbox & Studio Inspector
 * Features:
 * - 100% Theme Matched (Sage Mint #98CBB8 & Deep Petrol Teal #176B74)
 * - Mobile-First Layout: Zero text collision / Zero button overlap
 * - Touch & Mouse Freeform Cropper
 * - Draggable Before vs After Split Slider
 */
export function openInspectorModal(file, result = null, fileIndex = 0) {
  if (!file) return;

  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'inspector-modal-overlay';
    modalEl.className = 'overlay hidden';
    document.body.appendChild(modalEl);
  }

  const isProcessed = Boolean(result && result.blob);
  const origUrl = memory.createObjectURL(file);
  const compUrl = isProcessed ? memory.createObjectURL(result.blob) : origUrl;

  const origSize = formatBytes(file.size);
  const compSize = isProcessed ? formatBytes(result.processedSize) : origSize;
  const savings = isProcessed && file.size > 0 ? (((file.size - result.processedSize) / file.size) * 100).toFixed(1) : '0';

  let currentRotation = file._customRotation || 0;
  let isCropping = false;
  let isSplitCompare = isProcessed;

  // Crop percentage coordinates [0 to 100]
  let cropRect = file._customCropPercent || { x: 10, y: 10, w: 80, h: 80 };
  let pendingCropRect = { ...cropRect };

  modalEl.innerHTML = `
    <div class="omni-inspector-wrapper animate-fade-in">
      <!-- 1. Unified Petrol Teal Topbar -->
      <div class="omni-insp-topbar">
        <div class="omni-insp-meta">
          <span class="omni-insp-icon">👁️</span>
          <div class="omni-insp-titles">
            <span class="omni-insp-name" title="${file.name}">${file.name}</span>
            <span class="omni-insp-size-badge">
              ${origSize} ${isProcessed ? `→ <strong>${compSize} (-${savings}%)</strong>` : ''}
            </span>
          </div>
        </div>

        <button class="omni-insp-close-btn" id="close-inspector-btn" title="Close">✕</button>
      </div>

      <!-- 2. Middle Viewport Stage -->
      <div class="omni-insp-stage" id="insp-viewport">
        <!-- Floating Tool Palette (Rotate, Crop, Compare) -->
        <div class="omni-insp-floating-tools">
          ${!isProcessed ? `
            <button class="omni-tool-chip" id="btn-insp-rotate" title="Rotate +90°">
              <span>🔄</span> Rotate
            </button>

            <button class="omni-tool-chip ${isCropping ? 'active' : ''}" id="btn-insp-crop" title="Crop Image">
              <span>✂️</span> Crop
            </button>
          ` : `
            <button class="omni-tool-chip ${isSplitCompare ? 'active' : ''}" id="btn-insp-split" title="Compare Before/After">
              <span>👁️</span> Compare
            </button>
          `}
        </div>

        <!-- Centered Bounded Image Box -->
        <div class="omni-insp-img-box" id="insp-img-box">
          <img src="${origUrl}" alt="${file.name}" class="omni-preview-img" id="insp-orig-img">

          <!-- Split Layer -->
          <div class="omni-split-layer ${isSplitCompare ? '' : 'hidden'}" id="insp-split-wrap">
            <img src="${compUrl}" alt="Compressed" class="omni-preview-img omni-split-img" id="insp-comp-img">
          </div>

          <!-- Split Line Divider -->
          <div class="omni-split-line ${isSplitCompare ? '' : 'hidden'}" id="insp-split-line">
            <div class="omni-split-handle">‹ ›</div>
          </div>

          <!-- Comparison Badges -->
          <div class="omni-compare-badge badge-before ${isSplitCompare ? '' : 'hidden'}" id="badge-before">Before</div>
          <div class="omni-compare-badge badge-after ${isSplitCompare ? '' : 'hidden'}" id="badge-after">After</div>

          <!-- Freeform Crop Overlay -->
          <div class="omni-crop-overlay hidden" id="insp-crop-overlay">
            <div class="omni-crop-box" id="insp-crop-box">
              <div class="omni-handle handle-tl" data-handle="tl"></div>
              <div class="omni-handle handle-tr" data-handle="tr"></div>
              <div class="omni-handle handle-br" data-handle="br"></div>
              <div class="omni-handle handle-bl" data-handle="bl"></div>
              <div class="omni-crop-badge" id="insp-crop-badge">Crop</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Unified Bottom Action Bar -->
      <div class="omni-insp-bottombar">
        <div class="omni-insp-status-text" id="insp-footer-info">
          ${isCropping ? 'Drag corners to crop (Touch/Mouse)' : isProcessed ? 'Slide to compare Before vs After' : 'Rotate or crop, then tap Save'}
        </div>

        <div class="omni-insp-actions" id="insp-actions-normal">
          ${isProcessed ? `
            <button class="primary-btn btn-small" id="btn-insp-download">
              <span>⬇</span> Download
            </button>
          ` : `
            <button class="primary-btn btn-small" id="btn-insp-apply">
              <span>💾</span> Save & Compress
            </button>
          `}
        </div>
        
        <div class="omni-insp-actions hidden" id="insp-actions-cropping">
          <button class="primary-btn btn-small" id="btn-insp-verify-rotate" style="display: none; background: #0b4549; border-color: #0b4549;">
            <span>🔄</span> Verify Rotate
          </button>
          <button class="primary-btn btn-small" id="btn-insp-verify">
            <span>✅</span> Verify Crop
          </button>
        </div>
      </div>
    </div>
  `;

  modalEl.classList.remove('hidden');
  lockBackgroundScroll();

  const origImg = modalEl.querySelector('#insp-orig-img');
  const compImg = modalEl.querySelector('#insp-comp-img');
  const splitWrap = modalEl.querySelector('#insp-split-wrap');
  const splitLine = modalEl.querySelector('#insp-split-line');
  const badgeBefore = modalEl.querySelector('#badge-before');
  const badgeAfter = modalEl.querySelector('#badge-after');
  const cropOverlay = modalEl.querySelector('#insp-crop-overlay');
  const cropBox = modalEl.querySelector('#insp-crop-box');
  const cropBadge = modalEl.querySelector('#insp-crop-badge');
  const footerInfo = modalEl.querySelector('#insp-footer-info');

  const btnRotate = modalEl.querySelector('#btn-insp-rotate');
  const btnCrop = modalEl.querySelector('#btn-insp-crop');
  const btnSplit = modalEl.querySelector('#btn-insp-split');

  // Preload Image to calculate aspect-fit rotation
  const rawImage = new Image();
  rawImage.onload = () => {
    updateImageOrientation();
  };
  rawImage.src = origUrl;

  // Helper: Rotate crop percentage bounding box 90 degrees clockwise
  function rotateCropRectClockwise90(r) {
    return {
      x: Math.max(0, Math.min(100, 100 - (r.y + r.h))),
      y: Math.max(0, Math.min(100, r.x)),
      w: Math.max(5, Math.min(100, r.h)),
      h: Math.max(5, Math.min(100, r.w))
    };
  }

  function updateImageOrientation(displayRotation = currentRotation) {
    if (!rawImage.naturalWidth) return;

    // PREVIEW DOWNSCALING: Prevent lag on 15MP+ photos by capping preview resolution
    const MAX_PREVIEW = 1280;
    let origW = rawImage.naturalWidth;
    let origH = rawImage.naturalHeight;
    let scale = 1;

    if (origW > MAX_PREVIEW || origH > MAX_PREVIEW) {
      scale = MAX_PREVIEW / Math.max(origW, origH);
      origW = Math.round(origW * scale);
      origH = Math.round(origH * scale);
    }

    const isRot90 = displayRotation === 90 || displayRotation === 270;
    const rotatedW = isRot90 ? origH : origW;
    const rotatedH = isRot90 ? origW : origH;

    // Determine active crop region
    let activeCropPercent = null;
    if (isCropping) {
      // While actively adjusting crop, show the full rotated image so user can freely drag handles
      activeCropPercent = null;
    } else if (isRotating) {
      // While previewing rotation, use the rotated crop box so the cropped region rotates cleanly
      if (file._customCropPercent) {
        activeCropPercent = pendingCropRect;
      }
    } else if (file._customCropPercent) {
      activeCropPercent = cropRect;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rotatedW;
    tempCanvas.height = rotatedH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.translate(rotatedW / 2, rotatedH / 2);
    if (displayRotation !== 0) tCtx.rotate((displayRotation * Math.PI) / 180);
    tCtx.drawImage(rawImage, -origW / 2, -origH / 2, origW, origH);

    const cropX = activeCropPercent ? Math.round((activeCropPercent.x / 100) * rotatedW) : 0;
    const cropY = activeCropPercent ? Math.round((activeCropPercent.y / 100) * rotatedH) : 0;
    const cropW = activeCropPercent ? Math.max(1, Math.round((activeCropPercent.w / 100) * rotatedW)) : rotatedW;
    const cropH = activeCropPercent ? Math.max(1, Math.round((activeCropPercent.h / 100) * rotatedH)) : rotatedH;

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Use WebP to preserve transparency, preventing dark/black backgrounds
    origImg.src = canvas.toDataURL('image/webp', 0.90);
    tempCanvas.width = 1;
    tempCanvas.height = 1;
    canvas.width = 1;
    canvas.height = 1;

    // The compressed image (compUrl) is ALREADY rotated and cropped by the background worker.
    // We just display it as-is. Double-processing it causes misalignment and dark boxes.
    if (isProcessed && compImg) {
      compImg.src = compUrl;
    }

    if (isCropping) renderCropUI();
  }

  // Close handler — properly cleans up ALL window-level event listeners
  const closeModal = () => {
    modalEl.classList.add('hidden');
    unlockBackgroundScroll();
    // Remove all window-level listeners to prevent memory leaks
    _cleanupFns.forEach(fn => fn());
    _cleanupFns = [];
  };
  modalEl.querySelector('#close-inspector-btn')?.addEventListener('click', closeModal);

  // Crop and Rotate States
  let isRotating = false;
  let pendingRotation = currentRotation;

  // Rotate Button (+90° on each click)
  btnRotate?.addEventListener('click', () => {
    isRotating = true;
    if (isCropping) {
      isCropping = false; // exit crop mode if active
    }
    pendingRotation = (pendingRotation + 90) % 360;
    if (file._customCropPercent) {
      pendingCropRect = rotateCropRectClockwise90(pendingCropRect);
    }
    updateCropState();
  });

  const actionsNormal = modalEl.querySelector('#insp-actions-normal');
  const actionsCropping = modalEl.querySelector('#insp-actions-cropping');
  const btnVerifyCrop = modalEl.querySelector('#btn-insp-verify');
  const btnVerifyRotate = modalEl.querySelector('#btn-insp-verify-rotate');

  // Unified State Updater
  function updateCropState() {
    const displayRotation = isRotating ? pendingRotation : currentRotation;
    updateImageOrientation(displayRotation); // Redraw image based on new state

    if (isCropping || isRotating) {
      actionsNormal.classList.add('hidden');
      actionsCropping.classList.remove('hidden');

      if (splitWrap) splitWrap.classList.add('hidden');
      if (splitLine) splitLine.classList.add('hidden');
      if (badgeBefore) badgeBefore.classList.add('hidden');
      if (badgeAfter) badgeAfter.classList.add('hidden');

      if (isCropping) {
        cropOverlay.classList.remove('hidden');
        btnCrop?.classList.add('active');
        btnRotate?.classList.remove('active');
        btnVerifyCrop.style.display = 'inline-flex';
        if (btnVerifyRotate) btnVerifyRotate.style.display = 'none';
        pendingCropRect = { ...cropRect }; // Reset pending to last verified state
        renderCropUI();
        if (footerInfo) footerInfo.textContent = 'Drag corners freely, then Verify Crop';
      } else if (isRotating) {
        cropOverlay.classList.add('hidden');
        btnCrop?.classList.remove('active');
        btnRotate?.classList.add('active');
        btnVerifyCrop.style.display = 'none';
        if (btnVerifyRotate) btnVerifyRotate.style.display = 'inline-flex';
        if (footerInfo) footerInfo.textContent = 'Preview rotation, then Verify Rotate';
      }
    } else {
      cropOverlay.classList.add('hidden');
      btnCrop?.classList.remove('active');
      btnRotate?.classList.remove('active');
      actionsNormal.classList.remove('hidden');
      actionsCropping.classList.add('hidden');

      if (isSplitCompare && isProcessed) {
        if (splitWrap) splitWrap.classList.remove('hidden');
        if (splitLine) splitLine.classList.remove('hidden');
        if (badgeBefore) badgeBefore.classList.remove('hidden');
        if (badgeAfter) badgeAfter.classList.remove('hidden');
      }
      if (footerInfo) footerInfo.textContent = isProcessed ? 'Slide to compare Before vs After' : 'Rotate or crop, then tap Save';
    }
  }

  btnCrop?.addEventListener('click', () => {
    if (isRotating) isRotating = false;
    isCropping = !isCropping;
    updateCropState();
  });

  if (btnVerifyRotate) {
    btnVerifyRotate.addEventListener('click', () => {
      currentRotation = pendingRotation;
      file._customRotation = currentRotation;
      if (file._customCropPercent) {
        cropRect = { ...pendingCropRect };
        file._customCropPercent = { ...cropRect };

        const natW = rawImage.naturalWidth || 800;
        const natH = rawImage.naturalHeight || 600;
        const isRot90 = currentRotation === 90 || currentRotation === 270;
        const srcW = isRot90 ? natH : natW;
        const srcH = isRot90 ? natW : natH;
        file._customCrop = {
          x: Math.round((cropRect.x / 100) * srcW),
          y: Math.round((cropRect.y / 100) * srcH),
          width: Math.max(1, Math.round((cropRect.w / 100) * srcW)),
          height: Math.max(1, Math.round((cropRect.h / 100) * srcH))
        };
      }
      isRotating = false;
      updateCropState();
    });
  }

  if (btnVerifyCrop) {
    btnVerifyCrop.addEventListener('click', () => {
      // Save pending to actual
      cropRect = { ...pendingCropRect };

      const natW = rawImage.naturalWidth || 800;
      const natH = rawImage.naturalHeight || 600;
      const isRot90 = currentRotation === 90 || currentRotation === 270;
      const srcW = isRot90 ? natH : natW;
      const srcH = isRot90 ? natW : natH;
      const pxW = Math.round((cropRect.w / 100) * srcW);
      const pxH = Math.round((cropRect.h / 100) * srcH);

      file._customCropPercent = { ...cropRect };
      file._customCrop = {
        x: Math.round((cropRect.x / 100) * srcW),
        y: Math.round((cropRect.y / 100) * srcH),
        width: pxW,
        height: pxH
      };

      // Exit crop mode
      isCropping = false;
      updateCropState();
    });
  }

  // Split Compare Toggle
  if (btnSplit) {
    btnSplit.addEventListener('click', () => {
      isSplitCompare = !isSplitCompare;
      btnSplit.classList.toggle('active', isSplitCompare);
      if (splitWrap) splitWrap.classList.toggle('hidden', !isSplitCompare);
      if (splitLine) splitLine.classList.toggle('hidden', !isSplitCompare);
      if (badgeBefore) badgeBefore.classList.toggle('hidden', !isSplitCompare);
      if (badgeAfter) badgeAfter.classList.toggle('hidden', !isSplitCompare);
      if (isCropping || isRotating) {
        isCropping = false;
        isRotating = false;
        updateCropState();
      }
    });
  }

  // Render Crop UI Box
  function renderCropUI() {
    cropBox.style.left = `${pendingCropRect.x}%`;
    cropBox.style.top = `${pendingCropRect.y}%`;
    cropBox.style.width = `${pendingCropRect.w}%`;
    cropBox.style.height = `${pendingCropRect.h}%`;

    const natW = rawImage.naturalWidth || 800;
    const natH = rawImage.naturalHeight || 600;
    const displayRotation = isRotating ? pendingRotation : currentRotation;
    const isRot90 = displayRotation === 90 || displayRotation === 270;
    const srcW = isRot90 ? natH : natW;
    const srcH = isRot90 ? natW : natH;

    const pxW = Math.round((pendingCropRect.w / 100) * srcW);
    const pxH = Math.round((pendingCropRect.h / 100) * srcH);
    if (cropBadge) cropBadge.textContent = `${pxW} × ${pxH} px`;
  }

  // Interactive Touch & Mouse Drag on Crop Box
  let activeHandle = null;
  let startX = 0, startY = 0;
  let initCrop = { ...cropRect };

  function onCropDown(e) {
    const hEl = e.target.closest('.omni-handle');
    const isB = e.target.closest('#insp-crop-box');
    if (hEl) activeHandle = hEl.dataset.handle;
    else if (isB) activeHandle = 'box';
    else return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    initCrop = { ...pendingCropRect };
    e.preventDefault();
    e.stopPropagation();
  }

  function onCropMove(e) {
    if (!activeHandle) return;
    const rect = cropOverlay.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = ((clientX - startX) / rect.width) * 100;
    const dy = ((clientY - startY) / rect.height) * 100;

    let { x, y, w, h } = initCrop;

    if (activeHandle === 'box') {
      x = Math.max(0, Math.min(100 - w, x + dx));
      y = Math.max(0, Math.min(100 - h, y + dy));
    } else {
      if (activeHandle === 'br') {
        w = Math.max(10, Math.min(100 - x, w + dx));
        h = Math.max(10, Math.min(100 - y, h + dy));
      } else if (activeHandle === 'tr') {
        w = Math.max(10, Math.min(100 - x, w + dx));
        const newH = Math.max(10, h - dy);
        const newY = y + (h - newH);
        if (newY >= 0) { y = newY; h = newH; }
      } else if (activeHandle === 'bl') {
        h = Math.max(10, Math.min(100 - y, h + dy));
        const newW = Math.max(10, w - dx);
        const newX = x + (w - newW);
        if (newX >= 0) { x = newX; w = newW; }
      } else if (activeHandle === 'tl') {
        const newW = Math.max(10, w - dx);
        const newH = Math.max(10, h - dy);
        const newX = x + (w - newW);
        const newY = y + (h - newH);
        if (newX >= 0) { x = newX; w = newW; }
        if (newY >= 0) { y = newY; h = newH; }
      }
    }

    pendingCropRect = { x, y, w, h };
    renderCropUI();
  }

  function onCropUp() {
    activeHandle = null;
  }

  cropOverlay.addEventListener('mousedown', onCropDown);

  // Store all window-level listeners for proper cleanup on close
  const addWindowListener = (event, handler, options) => {
    window.addEventListener(event, handler, options);
    _cleanupFns.push(() => window.removeEventListener(event, handler, options));
  };

  addWindowListener('mousemove', onCropMove);
  addWindowListener('mouseup', onCropUp);

  cropOverlay.addEventListener('touchstart', onCropDown, { passive: false });
  addWindowListener('touchmove', onCropMove, { passive: false });
  addWindowListener('touchend', onCropUp);

  // Keyboard Crop Nudge
  function handleKeyCrop(e) {
    if (!isCropping) return;
    const step = e.shiftKey ? 3 : 1;
    let changed = false;
    if (e.key === 'ArrowLeft') { pendingCropRect.x = Math.max(0, pendingCropRect.x - step); changed = true; }
    if (e.key === 'ArrowRight') { pendingCropRect.x = Math.min(100 - pendingCropRect.w, pendingCropRect.x + step); changed = true; }
    if (e.key === 'ArrowUp') { pendingCropRect.y = Math.max(0, pendingCropRect.y - step); changed = true; }
    if (e.key === 'ArrowDown') { pendingCropRect.y = Math.min(100 - pendingCropRect.h, pendingCropRect.y + step); changed = true; }
    if (changed) { renderCropUI(); e.preventDefault(); }
  }
  addWindowListener('keydown', handleKeyCrop);

  // Setup Split Slider Dragging
  if (isProcessed) {
    setupSplitDrag(modalEl, addWindowListener);
  }

  // Save / Apply Handlers
  const saveAndCompress = () => {
    closeModal();
    const activeToolId = state.get('activeTool');
    const queue = state.get('batchQueue');
    const options = state.get('activeToolOptions') || {};
    bus.emit('batch:start', { toolId: activeToolId, queue, options });
  };

  modalEl.querySelector('#btn-insp-apply')?.addEventListener('click', saveAndCompress);

  // Download Handler
  modalEl.querySelector('#btn-insp-download')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = compUrl;
    a.download = (result && result.fileName) || file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Close modal and remove from queue
    closeModal();
    state.removeQueueItem(fileIndex);
  });
}

function setupSplitDrag(modal, addWindowListener) {
  const stage = modal.querySelector('#insp-img-box');
  const clipLayer = modal.querySelector('#insp-split-wrap');
  const divider = modal.querySelector('#insp-split-line');
  if (!stage || !clipLayer || !divider) return;

  let isDragging = false;

  function setSlider(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    divider.style.left = `${clamped}%`;
    clipLayer.style.clipPath = `polygon(${clamped}% 0, 100% 0, 100% 100%, ${clamped}% 100%)`;
  }
  setSlider(50);

  function handleDrag(e) {
    if (!isDragging) return;
    const rect = stage.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setSlider(percent);
  }

  stage.addEventListener('mousedown', (e) => {
    if (e.target.closest('#insp-crop-overlay')) return;
    isDragging = true;
    handleDrag(e);
  });
  addWindowListener('mousemove', handleDrag);
  addWindowListener('mouseup', () => { isDragging = false; });

  stage.addEventListener('touchstart', (e) => {
    if (e.target.closest('#insp-crop-overlay')) return;
    isDragging = true;
    handleDrag(e);
  }, { passive: true });
  addWindowListener('touchmove', handleDrag, { passive: true });
  addWindowListener('touchend', () => { isDragging = false; });
}

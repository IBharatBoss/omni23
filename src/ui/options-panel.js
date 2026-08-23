// src/ui/options-panel.js
import { state } from '../core/state.js';
import { bus } from '../core/bus.js';

/**
 * Simple debounce to prevent rapid state emissions
 */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Ultra-Compact Schema-Driven Options Bar
 * Supports: number, select, range, text, checkbox
 * Features reactive conditional visibility (visibleWhen) and bidirectional state sync.
 */
export function renderOptionsPanel(tool) {
  const container = document.createElement('div');
  container.className = 'glass-panel-subtle compact-options-bar';

  const schema = tool.optionsSchema || tool.options || [];

  if (schema.length === 0) {
    state.set('activeToolOptions', {});
    return container;
  }

  const currentOptions = { ...(state.get('activeToolOptions') || {}) };
  const row = document.createElement('div');
  row.className = 'compact-options-row';

  const itemElements = new Map(); // Store ref to elements for visibility updates
  const inputElements = new Map(); // Store ref to inputs for external sync

  const updateVisibility = () => {
    // Determine detected input mime from the first item in the batch queue (if any)
    const queue = state.get('batchQueue') || [];
    const activeFile = queue[0];
    const detectedInputMime = activeFile ? (activeFile.detectedMime || activeFile.type || '') : '';

    schema.forEach(opt => {
      const el = itemElements.get(opt.id);
      if (!el) return;
      
      let isVisible = true;

      if (typeof opt.visibleWhen === 'function') {
        isVisible = opt.visibleWhen(currentOptions);
      } else if (opt.dependsOn) {
        if (opt.dependsOn.targetFormat && !opt.dependsOn.targetFormat.includes(currentOptions.targetFormat)) {
          isVisible = false;
        }
        if (opt.dependsOn.inputType && detectedInputMime) {
          const match = opt.dependsOn.inputType.some(t => detectedInputMime.includes(t) || detectedInputMime === t);
          if (!match) isVisible = false;
        } else if (opt.dependsOn.inputType && !detectedInputMime) {
          // If inputType dependency exists but no file is selected yet, optionally hide it
          isVisible = false;
        }
      }

      el.style.display = isVisible ? '' : 'none';
    });
  };

  bus.on('item:status', (info) => {
    if (info && info.detectedMime) {
      // Temporarily store it on the first queue item to let updateVisibility find it
      const queue = state.get('batchQueue') || [];
      if (queue.length > 0 && queue[0].name === info.fileName) {
        queue[0].detectedMime = info.detectedMime;
        updateVisibility();
      }
    }
  });

  schema.forEach(opt => {
    if (currentOptions[opt.id] === undefined) {
      currentOptions[opt.id] = opt.default !== undefined ? opt.default : '';
    }

    const item = document.createElement('div');
    item.className = 'compact-option-item';
    item.dataset.optionId = opt.id;
    itemElements.set(opt.id, item);

    // 1. NUMBER TYPE
    if (opt.type === 'number') {
      const label = document.createElement('span');
      label.className = 'compact-opt-label';
      label.textContent = opt.label.replace(/\s*\(.*?\)/, '');

      const controlWrap = document.createElement('div');
      controlWrap.className = 'compact-num-wrap';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'compact-num-input';
      input.value = currentOptions[opt.id];
      if (opt.min !== undefined) input.min = opt.min;
      if (opt.max !== undefined) input.max = opt.max;
      inputElements.set(opt.id, input);

      const debouncedSetState = debounce((val) => {
        currentOptions[opt.id] = val;
        state.set('activeToolOptions', { ...currentOptions });
        updateVisibility();
      }, 150);

      input.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        debouncedSetState(val);
      });

      const unit = document.createElement('span');
      unit.className = 'compact-unit-badge';
      unit.textContent = opt.unit || 'KB';

      controlWrap.appendChild(input);
      controlWrap.appendChild(unit);

      item.appendChild(label);
      item.appendChild(controlWrap);

      // Render mini presets if present
      if (opt.presets && Array.isArray(opt.presets)) {
        const presetsWrap = document.createElement('div');
        presetsWrap.className = 'compact-presets';
        opt.presets.forEach(p => {
          const pVal = typeof p === 'object' ? p.value : p;
          const pLabel = typeof p === 'object' ? p.label : `${p}K`;

          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `compact-preset-chip ${currentOptions[opt.id] === pVal ? 'active' : ''}`;
          chip.textContent = pLabel;
          chip.addEventListener('click', () => {
            input.value = pVal;
            currentOptions[opt.id] = pVal;
            presetsWrap.querySelectorAll('.compact-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.set('activeToolOptions', { ...currentOptions });
            updateVisibility();
          });
          presetsWrap.appendChild(chip);
        });
        item.appendChild(presetsWrap);
      }
    } 
    // 2. TEXT TYPE (e.g. Page Range e.g. "1-3, 5, 8")
    else if (opt.type === 'text') {
      const label = document.createElement('span');
      label.className = 'compact-opt-label';
      label.textContent = opt.label;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'compact-text-input';
      input.value = currentOptions[opt.id] || '';
      input.placeholder = opt.placeholder || '';
      inputElements.set(opt.id, input);

      const debouncedText = debounce((val) => {
        currentOptions[opt.id] = val;
        state.set('activeToolOptions', { ...currentOptions });
        bus.emit('options:range-change', val);
      }, 200);

      input.addEventListener('input', (e) => {
        debouncedText(e.target.value);
      });

      item.appendChild(label);
      item.appendChild(input);
    }
    // 3. CHECKBOX / TOGGLE TYPE
    else if (opt.type === 'checkbox') {
      const labelWrap = document.createElement('label');
      labelWrap.className = 'compact-toggle-wrap';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'compact-toggle-input';
      checkbox.checked = Boolean(currentOptions[opt.id]);
      inputElements.set(opt.id, checkbox);

      checkbox.addEventListener('change', (e) => {
        currentOptions[opt.id] = e.target.checked;
        state.set('activeToolOptions', { ...currentOptions });
        updateVisibility();
      });

      const toggleVisual = document.createElement('span');
      toggleVisual.className = 'compact-toggle-switch';

      const textLabel = document.createElement('span');
      textLabel.className = 'compact-toggle-text';
      textLabel.textContent = opt.label;

      labelWrap.appendChild(checkbox);
      labelWrap.appendChild(toggleVisual);
      labelWrap.appendChild(textLabel);

      item.appendChild(labelWrap);
    }
    // 4. SELECT TYPE
    else if (opt.type === 'select') {
      const label = document.createElement('span');
      label.className = 'compact-opt-label';
      label.textContent = opt.label;

      const selectWrap = document.createElement('div');
      selectWrap.className = 'custom-select-wrapper';

      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';

      const triggerText = document.createElement('span');
      const arrow = document.createElement('span');
      arrow.className = 'custom-select-arrow';
      arrow.textContent = '▼';

      trigger.appendChild(triggerText);
      trigger.appendChild(arrow);

      const dropdown = document.createElement('div');
      dropdown.className = 'custom-select-dropdown';

      const choices = opt.choices || opt.options || [];
      
      const updateTriggerText = (val) => {
        const found = choices.find(c => (typeof c === 'object' ? c.value : c) === val);
        triggerText.textContent = found ? (typeof found === 'object' ? found.label : found) : val;
      };
      
      updateTriggerText(currentOptions[opt.id]);

      choices.forEach(choice => {
        const val = typeof choice === 'object' ? choice.value : choice;
        const text = typeof choice === 'object' ? choice.label : choice;
        
        const optEl = document.createElement('div');
        optEl.className = 'custom-select-option';
        if (val === currentOptions[opt.id]) optEl.classList.add('selected');
        optEl.textContent = text;
        
        optEl.addEventListener('click', (e) => {
          e.stopPropagation();
          currentOptions[opt.id] = val;
          state.set('activeToolOptions', { ...currentOptions });
          updateTriggerText(val);
          updateVisibility();
          
          Array.from(dropdown.children).forEach(c => c.classList.remove('selected'));
          optEl.classList.add('selected');
          
          selectWrap.classList.remove('open');
        });
        
        dropdown.appendChild(optEl);
      });

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = selectWrap.classList.contains('open');
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
        if (!isOpen) {
          selectWrap.classList.add('open');
        }
      });

      selectWrap.appendChild(trigger);
      selectWrap.appendChild(dropdown);

      item.appendChild(label);
      item.appendChild(selectWrap);
    } 
    // 5. RANGE SLIDER TYPE
    else if (opt.type === 'range') {
      const label = document.createElement('span');
      label.className = 'compact-opt-label';
      label.textContent = `${opt.label}: ${currentOptions[opt.id]}${opt.unit || ''}`;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'option-slider';
      slider.min = opt.min ?? 1;
      slider.max = opt.max ?? 100;
      slider.step = opt.step ?? 1;
      slider.value = currentOptions[opt.id];
      inputElements.set(opt.id, slider);

      slider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        label.textContent = `${opt.label}: ${val}${opt.unit || ''}`;
        currentOptions[opt.id] = val;
        state.set('activeToolOptions', { ...currentOptions });
        updateVisibility();
      });

      item.appendChild(label);
      item.appendChild(slider);
    }
    // 6. COLOR PICKER TYPE
    else if (opt.type === 'color') {
      const label = document.createElement('span');
      label.className = 'compact-opt-label';
      label.textContent = opt.label;

      const controlWrap = document.createElement('div');
      controlWrap.className = 'compact-color-wrap';
      controlWrap.style.display = 'flex';
      controlWrap.style.alignItems = 'center';
      controlWrap.style.gap = '8px';

      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'compact-color-input';
      input.value = currentOptions[opt.id] && currentOptions[opt.id] !== 'transparent' ? currentOptions[opt.id] : '#000000';
      input.style.border = 'none';
      input.style.padding = '0';
      input.style.width = '24px';
      input.style.height = '24px';
      input.style.borderRadius = '4px';
      input.style.cursor = 'pointer';
      input.style.background = 'transparent';
      
      const updateVisibility = () => {
        const isVisible = true;
      }; // debounce uses this but we don't need real visibility sync inside loop

      const debouncedSetState = debounce((val) => {
        currentOptions[opt.id] = val;
        state.set('activeToolOptions', { ...currentOptions });
      }, 150);

      input.addEventListener('input', (e) => {
        // When color picker is used, ensure we unselect presets
        const presets = controlWrap.querySelectorAll('.compact-preset-chip');
        presets.forEach(c => c.classList.remove('active'));
        debouncedSetState(e.target.value);
      });

      controlWrap.appendChild(input);

      // Render mini presets if present
      if (opt.presets && Array.isArray(opt.presets)) {
        const presetsWrap = document.createElement('div');
        presetsWrap.className = 'compact-presets';
        opt.presets.forEach(p => {
          const pVal = typeof p === 'object' ? p.value : p;
          const pLabel = typeof p === 'object' ? p.label : p;

          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `compact-preset-chip ${currentOptions[opt.id] === pVal ? 'active' : ''}`;
          chip.textContent = pLabel;
          
          if (pVal === 'transparent') {
            chip.style.background = 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 8px 8px';
            chip.style.color = '#333';
            chip.style.border = '1px solid #ccc';
          } else {
            chip.style.borderLeft = `12px solid ${pVal}`;
          }

          chip.addEventListener('click', () => {
            currentOptions[opt.id] = pVal;
            if (pVal !== 'transparent') {
               input.value = pVal;
            }
            presetsWrap.querySelectorAll('.compact-preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.set('activeToolOptions', { ...currentOptions });
          });
          presetsWrap.appendChild(chip);
        });
        controlWrap.appendChild(presetsWrap);
      }

      item.appendChild(label);
      item.appendChild(controlWrap);
    }
    row.appendChild(item);
  });

  container.appendChild(row);
  updateVisibility();
  state.set('activeToolOptions', currentOptions);

  // Sync external changes (e.g. from visual page grid into pageRange input)
  const unsubscribe = bus.on('state:activeToolOptions', (newOpts) => {
    if (!newOpts) return;
    schema.forEach(opt => {
      if (newOpts[opt.id] !== undefined && newOpts[opt.id] !== currentOptions[opt.id]) {
        currentOptions[opt.id] = newOpts[opt.id];
        const input = inputElements.get(opt.id);
        if (input && opt.type === 'text') {
          input.value = newOpts[opt.id];
        }
      }
    });
    updateVisibility();
  });

  return container;
}

// Global click listener to close custom dropdowns when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
});

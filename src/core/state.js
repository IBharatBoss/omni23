import { bus } from './bus.js';
import { memory } from './memory.js';
import { registry } from '../engine/registry.js';
import { toast } from './toast.js';

class StateManager {
  constructor() {
    this.state = {
      currentView: 'home', // 'home' | 'studio'
      activeTool: null, // Tool ID string or null
      lastActiveTool: null, // Tracks the last tool used to preserve state
      activeCategory: 'All',
      searchQuery: '',
      batchQueue: [], // Array of File objects
      processedFiles: [], // Array of { index, result, progress, status: 'pending'|'processing'|'done'|'error', error }
      isProcessing: false,
      activeToolOptions: {}, // Form state dynamically populated
      vault: {
        image: [],
        pdf: [],
        other: []
      }
    };

    // Throttle control for progress updates during processing
    this._progressDirty = false;
    this._progressRafId = null;
    this._lastEmitTime = 0;
  }

  get(key) {
    return this.state[key];
  }

  getAll() {
    return { ...this.state };
  }

  set(key, value) {
    this.state[key] = value;
    bus.emit(`state:${key}`, value);
    bus.emit('state:change', this.state);
  }

  updateBatchQueue(newFiles) {
    if (!newFiles || newFiles.length === 0) return;
    
    const activeToolId = this.state.activeTool;
    const activeTool = activeToolId ? registry.getTool(activeToolId) : null;
    const maxAllowed = activeTool && activeTool.maxFiles !== undefined ? activeTool.maxFiles : 20;

    let currentQueue = [...this.state.batchQueue];
    
    // Validate files against active tool's accept list
    let filesToAdd = [];
    let rejectedCount = 0;
    
    Array.from(newFiles).forEach(file => {
      if (!activeTool || !activeTool.accept || activeTool.accept.includes('*/*')) {
        filesToAdd.push(file);
        return;
      }
      
      const type = file.type || '';
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isValid = activeTool.accept.some(acc => {
        if (acc === type || acc === ext) return true;
        if (acc.endsWith('/*') && type.startsWith(acc.replace('/*', ''))) return true;
        if (acc.startsWith('image/') && type.startsWith('image/')) return true;
        return false;
      });
      
      if (isValid) filesToAdd.push(file);
      else rejectedCount++;
    });

    if (rejectedCount > 0) {
      toast.show(`Skipped ${rejectedCount} unsupported file(s).`, 'warning');
    }

    if (filesToAdd.length === 0) return;

    // Single-file mode enforcement (e.g. PDF Splitter)
    if (maxAllowed === 1) {
      if (currentQueue.length > 0) {
        this.clearQueue();
        currentQueue = [];
      }
      filesToAdd = [filesToAdd[0]]; // Take the first file only
    } else {
      // Multi-file batch mode (cap at maxAllowed, default 20)
      if (currentQueue.length >= maxAllowed) {
        this.clearQueue();
        currentQueue = [];
        toast.show(`Queue cleared. New files added (Limit: ${maxAllowed}).`, 'info');
      }

      if (currentQueue.length + filesToAdd.length > maxAllowed) {
        const spaceLeft = maxAllowed - currentQueue.length;
        if (spaceLeft > 0) {
           filesToAdd = filesToAdd.slice(0, spaceLeft);
           toast.show(`Added ${spaceLeft} file(s). Limit of ${maxAllowed} reached.`, 'warning');
        } else {
           this.clearQueue();
           currentQueue = [];
           filesToAdd = filesToAdd.slice(0, maxAllowed);
           toast.show(`Queue cleared. Added ${filesToAdd.length} file(s) (Limit: ${maxAllowed}).`, 'info');
        }
      }
    }

    const startIndex = currentQueue.length;
    const validFiles = filesToAdd;
    const updatedQueue = [...currentQueue, ...validFiles];
    
    // Initialize processing slots
    const updatedProcessed = [...this.state.processedFiles];
    validFiles.forEach((_, i) => {
      updatedProcessed.push({
        index: startIndex + i,
        result: null,
        progress: 0,
        status: 'pending',
        error: null
      });
    });

    this.state.batchQueue = updatedQueue;
    this.state.processedFiles = updatedProcessed;
    
    bus.emit('state:batchQueue', updatedQueue);
    bus.emit('state:processedFiles', updatedProcessed);
    bus.emit('state:change', this.state);
  }

  removeQueueItem(index) {
    const itemToRemove = this.state.processedFiles.find(p => p.index === index);
    if (itemToRemove && itemToRemove.result && itemToRemove.result.blob) {
      memory.revokeBlob(itemToRemove.result.blob);
    }

    const updatedQueue = this.state.batchQueue.filter((_, i) => i !== index);
    const updatedProcessed = this.state.processedFiles.filter((_, i) => i !== index).map((item, i) => ({
      ...item,
      index: i
    }));

    this.state.batchQueue = updatedQueue;
    this.state.processedFiles = updatedProcessed;
    
    bus.emit('state:batchQueue', updatedQueue);
    bus.emit('state:processedFiles', updatedProcessed);
    bus.emit('state:change', this.state);
  }

  /**
   * Throttled progress update — batches rapid emissions during processing
   * to max once per 100ms via requestAnimationFrame, preventing layout thrashing.
   */
  updateProgress(index, progress, status = 'processing') {
    const processed = [...this.state.processedFiles];
    const target = processed.find(p => p.index === index);
    if (target) {
      target.progress = progress;
      target.status = status;
      this.state.processedFiles = processed;

      // Mark dirty and schedule throttled emission
      this._progressDirty = true;
      this._scheduleProgressEmit();
    }
  }

  /** @private */
  _scheduleProgressEmit() {
    if (this._progressRafId) return; // Already scheduled

    this._progressRafId = requestAnimationFrame(() => {
      const now = performance.now();
      const elapsed = now - this._lastEmitTime;

      if (elapsed >= 100 && this._progressDirty) {
        this._progressDirty = false;
        this._lastEmitTime = now;
        bus.emit('state:processedFiles', this.state.processedFiles);
        bus.emit('state:change', this.state);
      } else if (this._progressDirty) {
        // Not enough time has passed, reschedule
        this._progressRafId = null;
        setTimeout(() => this._scheduleProgressEmit(), 100 - elapsed);
        return;
      }

      this._progressRafId = null;
    });
  }

  setResult(index, result) {
    const processed = [...this.state.processedFiles];
    const target = processed.find(p => p.index === index);
    if (target) {
      target.result = result;
      target.progress = 100;
      target.status = 'done';
      this.state.processedFiles = processed;
      // Result is important — emit immediately (no throttle)
      bus.emit('state:processedFiles', processed);
      bus.emit('state:change', this.state);
    }
  }

  setError(index, error) {
    const processed = [...this.state.processedFiles];
    const target = processed.find(p => p.index === index);
    if (target) {
      target.error = error;
      target.status = 'error';
      this.state.processedFiles = processed;
      // Error is important — emit immediately (no throttle)
      bus.emit('state:processedFiles', processed);
      bus.emit('state:change', this.state);
    }
  }

  resetFileStatus(index) {
    const processed = [...this.state.processedFiles];
    const target = processed.find(p => p.index === index);
    if (target) {
      target.result = null;
      target.progress = 0;
      target.status = 'pending';
      target.error = null;
      this.state.processedFiles = processed;
      bus.emit('state:processedFiles', processed);
      bus.emit('state:change', this.state);
    }
  }

  syncQueueForTool(tool) {
    if (!tool) return;

    if (this.state.lastActiveTool === tool.id && this.state.batchQueue.length > 0) {
      // Returning to the same tool, preserve the state!
      return;
    }

    // 1. Save current queue to vault based on its active type
    if (this.state.batchQueue.length > 0) {
      const firstType = this.state.batchQueue[0].type || '';
      if (firstType.startsWith('image/')) {
        this.state.vault.image = [...this.state.batchQueue];
      } else if (firstType === 'application/pdf' || this.state.batchQueue[0].name.endsWith('.pdf')) {
        this.state.vault.pdf = [...this.state.batchQueue];
      } else {
        this.state.vault.other = [...this.state.batchQueue];
      }
    }

    // 2. Determine target category for the new tool
    let targetCategory = 'other';
    if (tool.accept && (tool.accept.includes('image/*') || tool.accept.includes('image/jpeg'))) {
      targetCategory = 'image';
    } else if (tool.accept && tool.accept.includes('application/pdf')) {
      targetCategory = 'pdf';
    }

    // 3. Retrieve files from vault
    const potentialFiles = this.state.vault[targetCategory] || [];

    // 4. Filter against tool strictly
    const compatibleFiles = potentialFiles.filter(file => {
      if (!tool.accept || tool.accept.includes('*/*')) return true;
      const type = file.type || '';
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      return tool.accept.some(acc => {
        if (acc === type || acc === ext) return true;
        if (acc.endsWith('/*') && type.startsWith(acc.replace('/*', ''))) return true;
        if (acc.startsWith('image/') && type.startsWith('image/')) return true;
        return false;
      });
    });

    if (compatibleFiles.length === 0) {
      this.state.batchQueue = [];
      this.state.processedFiles = [];
      this.state.isProcessing = false;
      this.state.lastActiveTool = tool.id;
      bus.emit('state:batchQueue', []);
      bus.emit('state:processedFiles', []);
      bus.emit('state:change', this.state);
    } else {
      this.state.batchQueue = compatibleFiles;
      this.state.processedFiles = compatibleFiles.map((_, i) => ({
        index: i,
        result: null,
        progress: 0,
        status: 'pending',
        error: null
      }));
      this.state.isProcessing = false;
      this.state.lastActiveTool = tool.id;
      bus.emit('state:batchQueue', this.state.batchQueue);
      bus.emit('state:processedFiles', this.state.processedFiles);
      bus.emit('state:change', this.state);
    }
  }

  clearQueue() {
    this.state.batchQueue = [];
    this.state.processedFiles = [];
    this.state.isProcessing = false;
    this.state.lastActiveTool = null;
    this.state.vault = { image: [], pdf: [], other: [] };
    bus.emit('state:batchQueue', []);
    bus.emit('state:processedFiles', []);
    bus.emit('queue:cleared');
    bus.emit('state:change', this.state);
  }
}

export const state = new StateManager();



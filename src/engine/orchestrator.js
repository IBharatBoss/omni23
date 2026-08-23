// src/engine/orchestrator.js
/**
 * Batch Processing Orchestrator Engine
 * Extracted from main.js for clean separation of concerns.
 *
 * Handles:
 * - Multi-worker concurrency throttling
 * - Batch vs single-item execution routing
 * - Progress/result/error state management
 * - Studio view sync on state changes
 */
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';
import { registry } from './registry.js';

let _updateStudioState = null;

/**
 * Initialize the orchestrator — connects to bus events.
 * Must be called after registry and studio-view are available.
 */
export function initOrchestrator() {
  // Lazy-load studio-view updater to avoid circular imports
  // and keep studio-view decoupled
  bus.on('batch:start', handleBatchStart);
  bus.on('state:change', handleStateChange);
}

async function getStudioUpdater() {
  if (!_updateStudioState) {
    const mod = await import('../ui/studio-view.js');
    _updateStudioState = mod.updateStudioState;
  }
  return _updateStudioState;
}

async function handleBatchStart({ toolId, queue, options }) {
  const tool = registry.getTool(toolId);
  if (!tool || !queue || queue.length === 0) return;

  const updateStudio = await getStudioUpdater();

  state.set('isProcessing', true);
  updateStudio(tool);

  try {
    if (tool.batchExecute && typeof tool.executeBatch === 'function') {
      // Batch mode (e.g. PDF Merge)
      queue.forEach((_, idx) => state.updateProgress(idx, 10, 'processing'));
      
      const result = await tool.executeBatch(queue, options, (progress) => {
        queue.forEach((_, idx) => state.updateProgress(idx, progress, 'processing'));
      });

      // Automatically replace raw input queue with the single combined PDF document
      const mergedFile = new File([result.blob], result.fileName, { type: 'application/pdf' });
      state.state.batchQueue = [mergedFile];
      state.state.processedFiles = [{
        index: 0,
        result: result,
        progress: 100,
        status: 'done',
        error: null
      }];
      bus.emit('state:batchQueue', state.state.batchQueue);
      bus.emit('state:processedFiles', state.state.processedFiles);
      bus.emit('state:change', state.state);
    } else if (typeof tool.execute === 'function' || typeof tool.processItem === 'function') {
      const execFn = tool.execute ? tool.execute.bind(tool) : tool.processItem.bind(tool);

      // Concurrency Pool: Process up to 4 items concurrently
      const concurrency = Math.min(navigator.hardwareConcurrency || 4, 4);
      const pendingIndices = queue.map((_, idx) => idx).filter(idx => {
        const p = state.get('processedFiles').find(item => item.index === idx);
        return !p || p.status !== 'done';
      });

      async function workerLoop() {
        while (pendingIndices.length > 0) {
          const i = pendingIndices.shift();
          const file = queue[i];
          try {
            state.updateProgress(i, 15, 'processing');
            const result = await execFn(file, options, (progress) => {
              state.updateProgress(i, progress, 'processing');
            });
            state.setResult(i, result);
          } catch (err) {
            console.error(`[Orchestrator] Error processing ${file.name}:`, err);
            state.setError(i, err.message || 'Execution error');
          }
        }
      }

      const workers = Array.from({ length: concurrency }, () => workerLoop());
      await Promise.all(workers);
    }
  } catch (globalErr) {
    console.error('[Orchestrator] Batch execution error:', globalErr);
    alert('Batch error: ' + (globalErr.message || 'Unknown processing failure'));
  } finally {
    state.set('isProcessing', false);
    updateStudio(tool);
  }
}

async function handleStateChange(s) {
  if (s.currentView === 'studio' && s.activeTool) {
    const tool = registry.getTool(s.activeTool);
    if (tool) {
      const updateStudio = await getStudioUpdater();
      updateStudio(tool);
    }
  }
}

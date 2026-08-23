// src/core/worker-pool.js
// Non-blocking Web Worker execution engine

export class WorkerPool {
  constructor(size = navigator.hardwareConcurrency || 4) {
    this.size = size;
  }

  async run(workerScript, data) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      
      // Revoke URL immediately after worker bootstrap to prevent memory leaks
      URL.revokeObjectURL(workerUrl);
      
      worker.onmessage = (e) => {
        resolve(e.data);
        worker.terminate();
      };
      
      worker.onerror = (err) => {
        reject(err);
        worker.terminate();
      };
      
      worker.postMessage(data);
    });
  }
}

export const workerPool = new WorkerPool();

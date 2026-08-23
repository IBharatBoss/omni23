// src/core/pdf-loader.js
/**
 * Lazy-loads heavy PDF dependencies (pdf-lib and pdf.js) only when required.
 * This prevents blocking the initial page load for users who only want image tools.
 */

import { toast } from './toast.js';

let loadPromise = null;
const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * Loads heavy PDF & ZIP dependencies dynamically.
 * Implements timeout and toast notifications for better UX on slow networks.
 */
export async function ensurePDFLibraries() {
  if (window.PDFLib && window.JSZip && window.pdfjsLib) {
    return { PDFLib: window.PDFLib, JSZip: window.JSZip, pdfjsLib: window.pdfjsLib };
  }

  if (loadPromise) {
    return loadPromise;
  }

  const timeoutMs = 15000;
  
  loadPromise = new Promise((resolve, reject) => {
    let loadedCount = 0;
    let toastId = null;

    const timeoutId = setTimeout(() => {
      loadPromise = null;
      reject(new Error('Network timeout: Failed to load PDF tools. Please check your connection.'));
    }, timeoutMs);

    // If it takes more than 500ms, show a loading toast
    const slowTimer = setTimeout(() => {
      toast.show('Downloading PDF tools... Please wait.', 'info', timeoutMs);
    }, 500);

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount === 3) {
        clearTimeout(timeoutId);
        clearTimeout(slowTimer);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        }
        resolve({ PDFLib: window.PDFLib, JSZip: window.JSZip, pdfjsLib: window.pdfjsLib });
      }
    };

    const handleError = () => {
      clearTimeout(timeoutId);
      clearTimeout(slowTimer);
      loadPromise = null;
      reject(new Error('Failed to load required libraries from CDN.'));
    };

    const loadScript = (src) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = checkComplete;
      script.onerror = handleError;
      document.head.appendChild(script);
    };

    loadScript(PDF_LIB_URL);
    loadScript(JSZIP_URL);
    loadScript(PDFJS_URL);
  });

  return loadPromise;
}

// src/tools/pdf-to-img.js
import { ensurePDFLibraries } from '../core/pdf-loader.js';
import { freeCanvas } from '../core/image-utils.js';
import { fillWhiteMatte, setupSmoothCanvas } from '../core/canvas-utils.js';

export default {
  id: "pdf-to-img",
  title: "PDF to Image",
  category: "PDF",
  icon: "🔄",
  accept: ["application/pdf", ".pdf"],
  maxFiles: 1, // Process one PDF at a time
  keywords: ["convert", "pdf to image", "pdf to jpg", "pdf to png", "extract", "zip"],
  description: "Extract all pages from a PDF into high-quality images. Single pages download directly, multiple pages download as a ZIP archive.",
  
  options: [],

  async execute(file, options, onProgress = () => {}) {
    onProgress(10);
    const { JSZip, pdfjsLib } = await ensurePDFLibraries();
    
    onProgress(20);
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF using pdf.js
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    if (numPages === 0) {
      throw new Error("The selected PDF file contains no pages.");
    }
    
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    let zip = null;
    let singleBlob = null;
    
    if (numPages > 1) {
      zip = new JSZip();
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    setupSmoothCanvas(ctx);
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      // Use scale 2.0 for higher quality export
      const viewport = page.getViewport({ scale: 2.0 });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      fillWhiteMatte(ctx, canvas.width, canvas.height);
      
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      
      // Render page to canvas
      await page.render(renderContext).promise;
      
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.95);
      });
      
      if (numPages === 1) {
        singleBlob = blob;
      } else {
        zip.file(`${baseName}_page_${i}.jpg`, blob);
      }
      
      // Memory cleanup for pdf.js page
      page.cleanup();
      
      const percent = 20 + Math.round((i / numPages) * 70);
      onProgress(percent);
    }
    
    // Cleanup canvas memory
    freeCanvas(canvas);
    
    onProgress(95);
    
    if (numPages === 1) {
      return {
        blob: singleBlob,
        fileName: `${baseName}.jpg`,
        originalSize: file.size,
        processedSize: singleBlob.size
      };
    } else {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      return {
        blob: zipBlob,
        fileName: `${baseName}_images.zip`,
        originalSize: file.size,
        processedSize: zipBlob.size
      };
    }
  }
};

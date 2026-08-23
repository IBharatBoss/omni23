// src/tools/pdf-compress.js
import { ensurePDFLibraries } from '../core/pdf-loader.js';
import { freeCanvas } from '../core/image-utils.js';
import { fillWhiteMatte, setupSmoothCanvas } from '../core/canvas-utils.js';

export default {
  id: "pdf-compress",
  title: "Compress PDF",
  category: "PDF",
  icon: "🗜️",
  accept: ["application/pdf", ".pdf"],
  maxFiles: 1, // Only 1 PDF at a time
  keywords: ["compress", "reduce", "shrink", "pdf", "size", "optimizer"],
  description: "Dramatically reduce PDF file size by smartly flattening and optimizing its pages. 100% Secure & Offline.",
  
  options: [
    {
      id: "compressionLevel",
      type: "select",
      label: "Compression Power",
      default: "balanced",
      options: [
        { value: "high_quality", label: "Print Quality (Less Compression)" },
        { value: "balanced", label: "Balanced (Recommended)" },
        { value: "max_compress", label: "Screen / Email (Max Compression)" }
      ]
    }
  ],

  async execute(file, options, onProgress = () => {}) {
    onProgress(5);
    const { PDFLib, pdfjsLib } = await ensurePDFLibraries();
    const PDFDocument = PDFLib.PDFDocument;
    
    onProgress(15);
    const arrayBuffer = await file.arrayBuffer();
    
    // Load source PDF with pdf.js to render pages
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const srcPdf = await loadingTask.promise;
    const numPages = srcPdf.numPages;
    
    if (numPages === 0) {
      throw new Error("The selected PDF file contains no pages.");
    }
    
    // Create new PDF with pdf-lib
    const destPdf = await PDFDocument.create();
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    setupSmoothCanvas(ctx);
    
    // Configure settings based on user selection
    const mode = options?.compressionLevel || 'balanced';
    let scale = 1.5;
    let jpegQuality = 0.65;
    
    if (mode === 'high_quality') {
      scale = 2.0;
      jpegQuality = 0.85;
    } else if (mode === 'max_compress') {
      scale = 1.0;
      jpegQuality = 0.40;
    }
    
    for (let i = 1; i <= numPages; i++) {
      const page = await srcPdf.getPage(i);
      
      // Calculate optimized viewport
      const viewport = page.getViewport({ scale: scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      fillWhiteMatte(ctx, canvas.width, canvas.height);
      
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      
      // Render PDF page to canvas
      await page.render(renderContext).promise;
      
      // Convert canvas to optimized JPEG
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', jpegQuality);
      });
      
      const imgArrayBuffer = await blob.arrayBuffer();
      const pdfImage = await destPdf.embedJpg(imgArrayBuffer);
      
      // Calculate original points dimensions to keep PDF size physical mapping correct
      const originalViewport = page.getViewport({ scale: 1.0 });
      const destPage = destPdf.addPage([originalViewport.width, originalViewport.height]);
      
      destPage.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: originalViewport.width,
        height: originalViewport.height,
      });
      
      // Free page memory from pdf.js
      page.cleanup();
      
      const percent = 15 + Math.round((i / numPages) * 75);
      onProgress(percent);
    }
    
    freeCanvas(canvas);
    
    onProgress(92);
    const pdfBytes = await destPdf.save();
    const outBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    onProgress(100);

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    
    return {
      blob: outBlob,
      fileName: `${baseName}_compressed.pdf`,
      originalSize: file.size,
      processedSize: outBlob.size
    };
  }
};

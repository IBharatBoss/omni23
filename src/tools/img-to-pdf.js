// src/tools/img-to-pdf.js
import { ensurePDFLibraries } from '../core/pdf-loader.js';
import { loadImage, applyTransform, freeCanvas } from '../core/image-utils.js';
import { fillWhiteMatte } from '../core/canvas-utils.js';

export default {
  id: "img-to-pdf",
  title: "Image to PDF",
  category: "PDF",
  icon: "🖼️",
  accept: ["image/*"],
  maxFiles: 10, // Maximum 10 images
  keywords: ["convert", "image", "pdf", "combine", "join", "jpg to pdf", "png to pdf", "album"],
  description: "Convert and combine up to 10 images into a single, high-quality PDF document. Works entirely offline.",
  
  options: [],
  batchExecute: true,

  async executeBatch(files, options, onProgress = () => {}) {
    if (!files || files.length === 0) {
      throw new Error("Please add at least 1 image to convert.");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 images can be converted at a time.");
    }
    
    onProgress(5);
    const { PDFLib } = await ensurePDFLibraries();
    const PDFDocument = PDFLib.PDFDocument;
    
    onProgress(10);
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const img = await loadImage(file);
        const { canvas, width, height } = applyTransform(img, options, file);
        
        // We must ensure the background is white for transparency (like PNG)
        // since we are exporting as JPEG for PDF compatibility
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = width;
        jpegCanvas.height = height;
        const ctx = jpegCanvas.getContext('2d');
        fillWhiteMatte(ctx, width, height);
        ctx.drawImage(canvas, 0, 0);
        
        const blob = await new Promise(resolve => {
          jpegCanvas.toBlob(resolve, 'image/jpeg', 0.95); // High quality JPEG
        });
        
        const arrayBuffer = await blob.arrayBuffer();
        
        // Clean up memory
        freeCanvas(canvas);
        freeCanvas(jpegCanvas);
        
        // Embed and draw on PDF
        const pdfImage = await pdfDoc.embedJpg(arrayBuffer);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(pdfImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        });

      } catch (err) {
        console.error(`[ImgToPdf] Error processing file ${file.name}:`, err);
        throw new Error(`Failed to process image "${file.name}".`);
      }
      
      const percent = 10 + Math.round(((i + 1) / files.length) * 80);
      onProgress(percent);
    }
    
    onProgress(92);
    const pdfBytes = await pdfDoc.save();
    const outBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    onProgress(100);

    const firstBase = files[0].name.replace(/\.[^/.]+$/, "");
    const fileName = files.length === 1 
      ? `${firstBase}.pdf` 
      : `${firstBase}_and_${files.length - 1}_others.pdf`;
    
    return {
      blob: outBlob,
      fileName: fileName,
      originalSize: files.reduce((acc, f) => acc + f.size, 0),
      processedSize: outBlob.size,
      totalPages: files.length,
      mergedCount: files.length
    };
  }
};

// src/tools/pdf-merge.js
import { ensurePDFLibraries } from '../core/pdf-loader.js';

export default {
  id: "pdf-merge",
  title: "PDF Merger",
  category: "PDF",
  icon: "📑",
  accept: ["application/pdf", ".pdf"],
  maxFiles: 10, // Maximum 10 PDF files upload per merge batch
  keywords: ["merge", "combine", "join", "pdf", "document", "stitch", "unite", "bundle"],
  description: "Merge up to 10 PDF files into a single structured document directly in your browser with zero server upload.",
  
  options: [],
  batchExecute: true,

  async executeBatch(files, options, onProgress = () => {}) {
    if (!files || files.length < 2) {
      throw new Error("Please add at least 2 PDF files to merge.");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 PDF files can be merged at a time.");
    }
    
    onProgress(5);
    const { PDFLib } = await ensurePDFLibraries();
    const PDFDocument = PDFLib.PDFDocument;
    
    onProgress(15);
    const mergedPdf = await PDFDocument.create();
    let totalPagesCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageIndices = pdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(pdf, pageIndices);
        
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });

        totalPagesCount += pageIndices.length;
      } catch (err) {
        console.error(`[PDFMerge] Error reading file ${file.name}:`, err);
        throw new Error(`Failed to read "${file.name}". Ensure it is a valid, unencrypted PDF.`);
      }
      
      const percent = 15 + Math.round(((i + 1) / files.length) * 75);
      onProgress(percent);
    }
    
    onProgress(92);
    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    onProgress(100);

    const firstBase = files[0].name.replace(/\.[^/.]+$/, "");
    
    return {
      blob: blob,
      fileName: `${firstBase}_merged_${files.length}files.pdf`,
      originalSize: files.reduce((acc, f) => acc + f.size, 0),
      processedSize: blob.size,
      totalPages: totalPagesCount,
      mergedCount: files.length
    };
  }
};

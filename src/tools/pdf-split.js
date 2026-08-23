// src/tools/pdf-split.js
import { ensurePDFLibraries } from '../core/pdf-loader.js';

/**
 * Parses user range strings (e.g., "1-3, 5, 8, 10-12") into a Set of 0-based page indices.
 */
export function parseRangeToIndices(rangeStr, totalPages) {
  if (!rangeStr || typeof rangeStr !== 'string') return new Set();
  const indices = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      let start = parseInt(startStr, 10);
      let end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) continue;
      start = Math.max(1, Math.min(start, totalPages));
      end = Math.max(1, Math.min(end, totalPages));
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i++) {
        indices.add(i - 1); // 0-based
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        indices.add(pageNum - 1); // 0-based
      }
    }
  }
  return indices;
}

export default {
  id: "pdf-split",
  title: "PDF Splitter",
  category: "PDF",
  icon: "✂️",
  accept: ["application/pdf", ".pdf"],
  maxFiles: 1, // Enforce single PDF file at a time
  hasPageGrid: true, // Enable visual interactive page selector
  keywords: ["split", "extract", "separate", "pdf", "document", "pages", "delete page", "remove page", "unbundle"],
  description: "Split PDF pages into separate documents, extract custom ranges, or delete unwanted pages locally.",

  options: [
    {
      id: "splitMode",
      label: "Split Mode",
      type: "select",
      default: "range",
      options: [
        { label: "Extract Specific Pages / Range", value: "range" },
        { label: "Delete Selected Pages (Single PDF)", value: "delete_pages" },
        { label: "Split All Pages (ZIP Package)", value: "all_pages" },
        { label: "Split Every N Pages (ZIP Package)", value: "interval" }
      ]
    },
    {
      id: "pageRange",
      label: "Page Selection / Range",
      type: "text",
      default: "",
      placeholder: "e.g. 1-3, 5, 8",
      visibleWhen: (opts) => opts.splitMode === 'range' || opts.splitMode === 'delete_pages'
    },
    {
      id: "mergeRangeResult",
      label: "Merge extracted pages into 1 PDF",
      type: "checkbox",
      default: true,
      visibleWhen: (opts) => opts.splitMode === 'range'
    },
    {
      id: "pageInterval",
      label: "Split Every (Pages)",
      type: "number",
      default: 2,
      min: 1,
      max: 100,
      unit: "pages",
      visibleWhen: (opts) => opts.splitMode === 'interval'
    }
  ],

  async execute(file, options, onProgress = () => { }) {
    onProgress(10);
    const { PDFLib, JSZip } = await ensurePDFLibraries();
    const PDFDocument = PDFLib.PDFDocument;

    onProgress(20);
    const arrayBuffer = await file.arrayBuffer();
    const originalPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = originalPdf.getPageCount();

    if (pageCount === 0) {
      throw new Error("The selected PDF file contains no pages.");
    }

    const splitMode = (options && options.splitMode) || 'all_pages';
    const baseName = file.name.replace(/\.[^/.]+$/, "");

    // -------------------------------------------------------------
    // MODE 1: DELETE PAGES (Remove selected pages, output 1 clean PDF)
    // -------------------------------------------------------------
    if (splitMode === 'delete_pages') {
      const deleteIndices = parseRangeToIndices(options.pageRange, pageCount);
      if (deleteIndices.size === 0) {
        throw new Error("Please specify at least 1 page to delete (e.g. 2, 4 or click page cards).");
      }
      if (deleteIndices.size >= pageCount) {
        throw new Error("Cannot delete all pages of the document. Keep at least 1 page.");
      }

      const keepIndices = [];
      for (let i = 0; i < pageCount; i++) {
        if (!deleteIndices.has(i)) {
          keepIndices.push(i);
        }
      }

      onProgress(40);
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(originalPdf, keepIndices);
      copiedPages.forEach(p => newPdf.addPage(p));

      onProgress(80);
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      onProgress(100);

      return {
        blob: blob,
        fileName: `${baseName}_deleted_pages.pdf`,
        originalSize: file.size,
        processedSize: blob.size
      };
    }

    // -------------------------------------------------------------
    // MODE 2: EXTRACT SPECIFIC PAGES / RANGE
    // -------------------------------------------------------------
    if (splitMode === 'range') {
      const targetIndices = Array.from(parseRangeToIndices(options.pageRange, pageCount)).sort((a, b) => a - b);
      if (targetIndices.length === 0) {
        throw new Error("Please specify valid page numbers or ranges (e.g. 1-3, 5).");
      }

      const shouldMerge = options.mergeRangeResult !== false;

      if (shouldMerge) {
        // Output single merged PDF with selected pages
        onProgress(40);
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(originalPdf, targetIndices);
        copiedPages.forEach(p => newPdf.addPage(p));

        onProgress(85);
        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        onProgress(100);

        return {
          blob: blob,
          fileName: `${baseName}_extracted_pages.pdf`,
          originalSize: file.size,
          processedSize: blob.size
        };
      } else {
        // Output each extracted page as separate PDF in a ZIP
        // Use the already loaded JSZip
        const zip = new JSZip();

        for (let i = 0; i < targetIndices.length; i++) {
          const pageIdx = targetIndices[i];
          const singlePdf = await PDFDocument.create();
          const [copiedPage] = await singlePdf.copyPages(originalPdf, [pageIdx]);
          singlePdf.addPage(copiedPage);

          const pdfBytes = await singlePdf.save();
          zip.file(`${baseName}_page_${pageIdx + 1}.pdf`, pdfBytes);

          const progress = 30 + Math.round(((i + 1) / targetIndices.length) * 55);
          onProgress(progress);
        }

        onProgress(90);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        onProgress(100);

        return {
          blob: zipBlob,
          fileName: `${baseName}_extracted_pages.zip`,
          originalSize: file.size,
          processedSize: zipBlob.size
        };
      }
    }

    // -------------------------------------------------------------
    // MODE 3: SPLIT BY FIXED INTERVAL (Every N pages)
    // -------------------------------------------------------------
    if (splitMode === 'interval') {
      const interval = Math.max(1, parseInt(options.pageInterval, 10) || 2);
      // Use the already loaded JSZip
      const zip = new JSZip();

      let partIndex = 1;
      for (let i = 0; i < pageCount; i += interval) {
        const chunkIndices = [];
        for (let j = i; j < Math.min(i + interval, pageCount); j++) {
          chunkIndices.push(j);
        }

        const chunkPdf = await PDFDocument.create();
        const copiedPages = await chunkPdf.copyPages(originalPdf, chunkIndices);
        copiedPages.forEach(p => chunkPdf.addPage(p));

        const pdfBytes = await chunkPdf.save();
        const startPg = i + 1;
        const endPg = Math.min(i + interval, pageCount);
        zip.file(`${baseName}_part${partIndex}_pages_${startPg}-${endPg}.pdf`, pdfBytes);
        partIndex++;

        const progress = 20 + Math.round(((i + chunkIndices.length) / pageCount) * 65);
        onProgress(progress);
      }

      onProgress(90);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      onProgress(100);

      return {
        blob: zipBlob,
        fileName: `${baseName}_split_interval.zip`,
        originalSize: file.size,
        processedSize: zipBlob.size
      };
    }

    // -------------------------------------------------------------
    // MODE 4: SPLIT ALL PAGES (Default: 1 PDF per page in ZIP)
    // -------------------------------------------------------------
    // Use the already loaded JSZip
    const zip = new JSZip();

    for (let i = 0; i < pageCount; i++) {
      const singlePdf = await PDFDocument.create();
      const [copiedPage] = await singlePdf.copyPages(originalPdf, [i]);
      singlePdf.addPage(copiedPage);

      const pdfBytes = await singlePdf.save();
      zip.file(`${baseName}_page_${i + 1}.pdf`, pdfBytes);

      const progress = 20 + Math.round(((i + 1) / pageCount) * 65);
      onProgress(progress);
    }

    onProgress(90);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    onProgress(100);

    return {
      blob: zipBlob,
      fileName: `${baseName}_split_pages.zip`,
      originalSize: file.size,
      processedSize: zipBlob.size
    };
  }
};

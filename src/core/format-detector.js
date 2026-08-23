// src/core/format-detector.js

/**
 * Reads the first 16 bytes of a file to detect its true MIME type using magic numbers.
 * Extremely fast, happens 100% on the client side.
 * @param {File|Blob} file 
 * @returns {Promise<string>} The detected MIME type, or the original file.type if unknown
 */
export async function detectFormat(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    // Fallback if reader fails or gets stuck
    const timeout = setTimeout(() => {
      resolve(file.type || 'application/octet-stream');
    }, 500);

    reader.onload = function(e) {
      clearTimeout(timeout);
      
      try {
        const arr = new Uint8Array(e.target.result);
        const header = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        
        let detectedMime = null;

        // Magic numbers mappings
        if (header.startsWith('ffd8ff')) {
          detectedMime = 'image/jpeg';
        } else if (header.startsWith('89504e470d0a1a0a')) {
          detectedMime = 'image/png';
        } else if (header.startsWith('474946383761') || header.startsWith('474946383961')) {
          detectedMime = 'image/gif';
        } else if (header.startsWith('52494646') && header.slice(16, 24) === '57454250') {
          detectedMime = 'image/webp';
        } else if (header.startsWith('424d')) {
          detectedMime = 'image/bmp';
        } else if (header.startsWith('49492a00') || header.startsWith('4d4d002a')) {
          detectedMime = 'image/tiff';
        } else if (header.startsWith('255044462d')) {
          detectedMime = 'application/pdf';
        } else if (header.includes('6674797068656963') || header.includes('6674797068656978')) {
          detectedMime = 'image/heic';
        } else if (header.includes('6674797061766966')) {
          detectedMime = 'image/avif';
        }
        
        // Handle SVG strings which may start with <svg or <?xml
        if (!detectedMime && (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'))) {
          const textReader = new FileReader();
          textReader.onload = function(eText) {
            const textHeader = eText.target.result.trim().toLowerCase();
            if (textHeader.startsWith('<svg') || textHeader.startsWith('<?xml')) {
              resolve('image/svg+xml');
            } else {
              resolve(file.type || 'application/octet-stream');
            }
          };
          textReader.onerror = () => resolve(file.type || 'application/octet-stream');
          textReader.readAsText(file.slice(0, 50));
          return;
        }

        resolve(detectedMime || file.type || 'application/octet-stream');
      } catch (err) {
        console.error('[FormatDetector] error:', err);
        resolve(file.type || 'application/octet-stream');
      }
    };
    
    reader.onerror = function() {
      clearTimeout(timeout);
      resolve(file.type || 'application/octet-stream');
    };
    
    // Read only first 16 bytes for ultra-fast matching
    reader.readAsArrayBuffer(file.slice(0, 16));
  });
}

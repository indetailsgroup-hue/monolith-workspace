/**
 * downloadZipBundle.ts - Browser Download Helper for Export Bundles
 *
 * Utility functions for downloading export bundles in the browser.
 */

// ============================================
// DOWNLOAD FUNCTIONS
// ============================================

/**
 * Download zip bundle in browser
 */
export function downloadZipBundle(args: {
  filename: string;
  zipBlob: Blob;
}): void {
  const { filename, zipBlob } = args;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download zip bundle from Uint8Array
 */
export function downloadZipBundleBytes(args: {
  filename: string;
  zipBytes: Uint8Array;
}): void {
  const { filename, zipBytes } = args;

  // Create fresh copy for Blob compatibility
  const bytes = new Uint8Array(zipBytes.length);
  bytes.set(zipBytes);
  const blob = new Blob([bytes], { type: 'application/zip' });
  downloadZipBundle({ filename, zipBlob: blob });
}

/**
 * Generate filename for export bundle
 */
export function generateBundleFilename(jobId: string, suffix?: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  const safeJobId = jobId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const suffixStr = suffix ? `_${suffix}` : '';

  return `export_${safeJobId}${suffixStr}_${timestamp}.zip`;
}

// ============================================
// FILE INPUT HELPERS
// ============================================

/**
 * Read file from input as Blob
 */
export function readFileAsBlob(file: File): Promise<Blob> {
  return Promise.resolve(file);
}

/**
 * Read file from input as Uint8Array
 */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read file as ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Create file input and trigger click
 */
export function selectFile(options?: {
  accept?: string;
  multiple?: boolean;
}): Promise<File | null> {
  const { accept = '.zip', multiple = false } = options ?? {};

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };

    input.oncancel = () => {
      resolve(null);
    };

    input.click();
  });
}

/**
 * Select and read zip file
 */
export async function selectAndReadZipFile(): Promise<{
  file: File;
  blob: Blob;
} | null> {
  const file = await selectFile({ accept: '.zip' });
  if (!file) return null;

  return { file, blob: file };
}

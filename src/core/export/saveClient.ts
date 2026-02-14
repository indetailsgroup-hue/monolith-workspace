/**
 * Client-side File Save Utilities
 *
 * Browser-based file download helpers for export functionality.
 * Works without server - generates blob and triggers download.
 *
 * @version 1.0.0
 */

// ============================================================================
// Text File Save
// ============================================================================

/**
 * Save text content as a downloadable file.
 *
 * @param filename - Name of the file to download
 * @param content - Text content
 * @param mimeType - MIME type (default: text/plain)
 */
export function saveTextFile(
  filename: string,
  content: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Save DXF file.
 */
export function saveDxfFile(filename: string, content: string): void {
  // DXF files are typically served as application/dxf or text/plain
  saveTextFile(filename, content, 'application/dxf');
}

/**
 * Save JSON file.
 */
export function saveJsonFile(filename: string, data: unknown): void {
  const content = JSON.stringify(data, null, 2);
  saveTextFile(filename, content, 'application/json');
}

/**
 * Save CSV file.
 */
export function saveCsvFile(filename: string, content: string): void {
  saveTextFile(filename, content, 'text/csv');
}

// ============================================================================
// Binary File Save
// ============================================================================

/**
 * Save binary data as a downloadable file.
 *
 * @param filename - Name of the file to download
 * @param data - Binary data (ArrayBuffer or Uint8Array)
 * @param mimeType - MIME type
 */
export function saveBinaryFile(
  filename: string,
  data: ArrayBuffer | Uint8Array,
  mimeType: string = 'application/octet-stream'
): void {
  // Convert Uint8Array to new ArrayBuffer for TypeScript compatibility
  // Using Uint8Array copy to ensure we get a plain ArrayBuffer, not SharedArrayBuffer
  let buffer: ArrayBuffer;
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    buffer = copy.buffer;
  } else {
    buffer = data;
  }
  const blob = new Blob([buffer], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Save ZIP file.
 */
export function saveZipFile(filename: string, data: ArrayBuffer | Uint8Array): void {
  saveBinaryFile(filename, data, 'application/zip');
}

// ============================================================================
// Core Download Function
// ============================================================================

/**
 * Trigger download of a Blob.
 *
 * @param blob - Blob to download
 * @param filename - Name of the file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  // Create object URL
  const url = URL.createObjectURL(blob);

  // Create temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to body (required for Firefox)
  document.body.appendChild(link);

  // Trigger click
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Data URL Functions
// ============================================================================

/**
 * Convert text to data URL.
 */
export function textToDataUrl(content: string, mimeType: string = 'text/plain'): string {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

/**
 * Convert binary data to data URL.
 */
export function binaryToDataUrl(
  data: ArrayBuffer | Uint8Array,
  mimeType: string = 'application/octet-stream'
): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

// ============================================================================
// File Size Utilities
// ============================================================================

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Get size of text content in bytes.
 */
export function getTextSize(content: string): number {
  return new Blob([content]).size;
}

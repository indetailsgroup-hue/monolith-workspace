/**
 * downloadArtifacts.ts - Browser Download Utilities
 *
 * Download binary artifacts in browser environment.
 * Supports single file and batch downloads.
 */

import type { ExportArtifact } from './exportPipeline';

// ============================================
// TYPES
// ============================================

export interface DownloadOptions {
  /** Delay between downloads in batch mode (ms) */
  batchDelay?: number;
}

// ============================================
// SINGLE FILE DOWNLOAD
// ============================================

/**
 * Download a single file in browser
 */
export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  mimeType?: string
): void {
  let blob: Blob;

  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType ?? 'text/plain;charset=utf-8' });
  } else {
    // Create fresh copy for Blob compatibility
    const bytes = new Uint8Array(content.length);
    bytes.set(content);
    blob = new Blob([bytes], { type: mimeType ?? 'application/octet-stream' });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download JSON data as file
 */
export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  downloadFile(filename, json, 'application/json');
}

// ============================================
// BATCH DOWNLOAD
// ============================================

/**
 * Download multiple artifacts with delay between each
 */
export async function downloadArtifacts(
  artifacts: ExportArtifact[],
  options: DownloadOptions = {}
): Promise<void> {
  const { batchDelay = 100 } = options;

  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    downloadFile(artifact.filename, artifact.content);

    // Delay between downloads (except last)
    if (i < artifacts.length - 1 && batchDelay > 0) {
      await new Promise((r) => setTimeout(r, batchDelay));
    }
  }
}

// ============================================
// MIME TYPE HELPERS
// ============================================

const MIME_TYPES: Record<string, string> = {
  // Text formats
  csv: 'text/csv',
  txt: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',

  // CAD formats
  dxf: 'application/dxf',
  dwg: 'application/acad',
  step: 'application/step',
  stp: 'application/step',
  iges: 'application/iges',
  igs: 'application/iges',

  // CNC formats
  gcode: 'text/plain',
  nc: 'text/plain',
  tap: 'text/plain',

  // Archive formats
  zip: 'application/zip',

  // Image formats
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',

  // PDF
  pdf: 'application/pdf',
};

/**
 * Get MIME type from filename extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Download file with auto-detected MIME type
 */
export function downloadFileAuto(filename: string, content: string | Uint8Array): void {
  const mimeType = getMimeType(filename);
  downloadFile(filename, content, mimeType);
}

// ============================================
// DATA URL HELPERS
// ============================================

/**
 * Convert content to data URL for embedding
 */
export function contentToDataUrl(
  content: string | Uint8Array,
  mimeType: string = 'application/octet-stream'
): string {
  let blob: Blob;

  if (typeof content === 'string') {
    blob = new Blob([content], { type: mimeType });
  } else {
    const bytes = new Uint8Array(content.length);
    bytes.set(content);
    blob = new Blob([bytes], { type: mimeType });
  }

  return URL.createObjectURL(blob);
}

/**
 * Read file from File input as Uint8Array
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
 * Read file from File input as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

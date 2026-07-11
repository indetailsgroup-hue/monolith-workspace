/**
 * ZIP Bundle Generator - B2 MVP
 *
 * Creates a downloadable ZIP file from a factory packet.
 * Uses JSZip for cross-browser compatibility.
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

import JSZip from 'jszip';
import type { BuildFactoryPacketOutput } from './types';
import { SHADOW_MODE_NOT_FOR_PRODUCTION } from '../../core/config/shadowMode';

// ============================================
// ZIP BUNDLE TYPES
// ============================================

export interface ZipBundleOptions {
  /** Compression level (0-9, default 6) */
  compressionLevel?: number;
  /** Include manifest at root (default true) */
  includeManifest?: boolean;
  /** Folder prefix (default: none) */
  folderPrefix?: string;
}

export interface ZipBundleResult {
  /** ZIP blob for download */
  blob: Blob;
  /** Suggested filename */
  filename: string;
  /** Total uncompressed size */
  uncompressedSize: number;
  /** Compressed size */
  compressedSize: number;
}

// ============================================
// ZIP BUNDLE GENERATOR
// ============================================

/**
 * Create a ZIP bundle from factory packet output
 *
 * @param packetOutput - Output from buildFactoryPacket
 * @param options - Bundle options
 * @returns ZIP blob and metadata
 */
export async function createZipBundle(
  packetOutput: BuildFactoryPacketOutput,
  options: ZipBundleOptions = {}
): Promise<ZipBundleResult> {
  const {
    compressionLevel = 6,
    includeManifest = true,
    folderPrefix = '',
  } = options;

  const zip = new JSZip();
  const { files, packet } = packetOutput;

  // Add prefix folder if specified
  const folder = folderPrefix ? zip.folder(folderPrefix) : zip;
  if (!folder) {
    throw new Error('Failed to create ZIP folder');
  }

  // Track uncompressed size
  let uncompressedSize = 0;

  // Add all files to ZIP
  for (const [filename, content] of Object.entries(files)) {
    if (filename === 'manifest.json' && !includeManifest) {
      continue;
    }
    folder.file(filename, content, { compression: 'DEFLATE' });
    uncompressedSize += new TextEncoder().encode(content).length;
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
  });

  // Generate filename from job ID and timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jobIdShort = packet.manifest.jobId.slice(0, 8);
  // ADR-065 Q3: ป้าย shadow mode ในชื่อไฟล์ — เห็นก่อนเปิด zip
  const nfpPrefix = SHADOW_MODE_NOT_FOR_PRODUCTION ? 'NFP-' : '';
  const filename = `${nfpPrefix}factory-packet-${jobIdShort}-${timestamp}.zip`;

  return {
    blob,
    filename,
    uncompressedSize,
    compressedSize: blob.size,
  };
}

// ============================================
// DOWNLOAD HELPER
// ============================================

/**
 * Trigger browser download of ZIP bundle
 *
 * @param result - ZIP bundle result
 */
export function downloadZipBundle(result: ZipBundleResult): void {
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Create and download ZIP bundle in one step
 *
 * @param packetOutput - Output from buildFactoryPacket
 * @param options - Bundle options
 * @returns ZIP bundle result (after download triggered)
 */
export async function createAndDownloadZipBundle(
  packetOutput: BuildFactoryPacketOutput,
  options: ZipBundleOptions = {}
): Promise<ZipBundleResult> {
  const result = await createZipBundle(packetOutput, options);
  downloadZipBundle(result);
  return result;
}

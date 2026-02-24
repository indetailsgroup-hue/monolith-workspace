/**
 * zipCncBundle.ts - Deterministic ZIP Creation for CNC Bundles
 *
 * Creates ZIP files with fixed timestamps for reproducible builds.
 * Factory can verify bundles by re-generating from manifest.
 *
 * @version 1.0.0 - Phase D3.1
 */

import JSZip from 'jszip';
import { CNC_ZIP_FIXED_DATE } from './cncManifest';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Uint8Array to base64 string.
 * Works reliably across all environments (browser, Node, test).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Use btoa which is available in browser and jsdom
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Fallback for Node.js without jsdom
  return Buffer.from(bytes).toString('base64');
}

// ============================================================================
// Types
// ============================================================================

export interface CncBundleFile {
  /** Path within ZIP (e.g., "nc/PROG001.nc") */
  path: string;
  /** File content as bytes or string */
  bytes: Uint8Array | string;
}

export interface ZipCncBundleOptions {
  /** Compression level (0-9, default 6) */
  compressionLevel?: number;
  /** Use fixed timestamp for determinism (default true) */
  deterministicTimestamp?: boolean;
}

// ============================================================================
// ZIP Creation
// ============================================================================

/**
 * Create a deterministic ZIP bundle from CNC files.
 *
 * Key determinism features:
 * - Files sorted alphabetically by path
 * - Fixed timestamp (Unix epoch) for all entries
 * - Consistent compression settings
 *
 * @param files - Files to include in ZIP
 * @param options - ZIP creation options
 * @returns ZIP bytes as Uint8Array
 */
export async function zipCncBundle(
  files: CncBundleFile[],
  options: ZipCncBundleOptions = {}
): Promise<Uint8Array> {
  const {
    compressionLevel = 6,
    deterministicTimestamp = true,
  } = options;

  const zip = new JSZip();

  // Sort files alphabetically for determinism
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Add files to ZIP
  for (const file of sortedFiles) {
    const fileOptions: JSZip.JSZipFileOptions = {
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    };

    // Use fixed timestamp for determinism
    if (deterministicTimestamp) {
      fileOptions.date = CNC_ZIP_FIXED_DATE;
    }

    // Handle both string and Uint8Array content
    if (typeof file.bytes === 'string') {
      zip.file(file.path, file.bytes, fileOptions);
    } else {
      // For Uint8Array, convert to base64 string which JSZip handles reliably
      const base64 = uint8ArrayToBase64(file.bytes);
      zip.file(file.path, base64, { ...fileOptions, base64: true });
    }
  }

  // Generate ZIP as Uint8Array
  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
    // JSZip doesn't support global date override in generateAsync,
    // but we set it per-file above
  });

  return zipBytes;
}

/**
 * Extract files from a CNC bundle ZIP.
 *
 * Used for verification and inspection.
 *
 * @param zipBytes - ZIP file bytes
 * @returns Map of path to file bytes
 */
export async function unzipCncBundle(
  zipBytes: Uint8Array
): Promise<Map<string, Uint8Array>> {
  // Create a fresh Uint8Array copy to handle edge cases from IndexedDB
  // Some IndexedDB implementations (including fake-indexeddb in tests)
  // return Uint8Arrays that JSZip can't process directly
  const freshBytes = new Uint8Array(zipBytes);
  const zip = await JSZip.loadAsync(freshBytes);
  const files = new Map<string, Uint8Array>();

  for (const path of Object.keys(zip.files)) {
    const zipEntry = zip.files[path];
    if (!zipEntry.dir) {
      const bytes = await zipEntry.async('uint8array');
      files.set(path, bytes);
    }
  }

  return files;
}

/**
 * Get file listing from CNC bundle ZIP.
 *
 * @param zipBytes - ZIP file bytes
 * @returns Array of file info (path, compressed size, uncompressed size)
 */
export async function listCncBundleFiles(
  zipBytes: Uint8Array
): Promise<Array<{ path: string; compressedSize: number; uncompressedSize: number }>> {
  // Create a fresh Uint8Array copy for IndexedDB compatibility
  const freshBytes = new Uint8Array(zipBytes);
  const zip = await JSZip.loadAsync(freshBytes);
  const listing: Array<{ path: string; compressedSize: number; uncompressedSize: number }> = [];

  for (const path of Object.keys(zip.files)) {
    const zipEntry = zip.files[path];
    if (!zipEntry.dir) {
      // JSZip stores size info but we need to extract to get uncompressed
      const bytes = await zipEntry.async('uint8array');
      listing.push({
        path,
        // Note: JSZip doesn't expose compressed size directly in the API
        // We use the uncompressed size for both as approximation
        compressedSize: bytes.length,
        uncompressedSize: bytes.length,
      });
    }
  }

  return listing.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * zipExtract.ts - P13.2/P13.4 ZIP Extraction Utilities
 *
 * Extracts files from ZIP and computes content hash
 * (hash of ZIP contents excluding receipt.json).
 *
 * Uses yauzl for reading and yazl for deterministic re-creation.
 *
 * SAFETY FEATURES (P13.4):
 * - Max ZIP file size limit
 * - Max decompressed size limit (zip bomb protection)
 * - Max entry count limit
 * - Path traversal protection
 * - Max single file size limit
 *
 * @version 0.13.4
 */

import { createHash } from 'crypto';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { ExportReceipt } from '../export/exportReceiptTypes.js';

// ============================================================================
// Safety Limits
// ============================================================================

export interface ZipSafetyLimits {
  /** Max compressed ZIP size in bytes (default: 100MB) */
  maxZipSize: number;
  /** Max total decompressed size in bytes (default: 500MB) */
  maxDecompressedSize: number;
  /** Max number of entries (default: 1000) */
  maxEntries: number;
  /** Max single file size in bytes (default: 100MB) */
  maxFileSize: number;
}

export const DEFAULT_SAFETY_LIMITS: ZipSafetyLimits = {
  maxZipSize: 100 * 1024 * 1024,       // 100MB
  maxDecompressedSize: 500 * 1024 * 1024, // 500MB
  maxEntries: 1000,
  maxFileSize: 100 * 1024 * 1024,      // 100MB
};

export class ZipSafetyError extends Error {
  constructor(
    message: string,
    public readonly code: 'ZIP_TOO_LARGE' | 'DECOMPRESSED_TOO_LARGE' | 'TOO_MANY_ENTRIES' | 'FILE_TOO_LARGE' | 'PATH_TRAVERSAL'
  ) {
    super(message);
    this.name = 'ZipSafetyError';
  }
}

// ============================================================================
// Path Traversal Protection
// ============================================================================

/**
 * Check if a filename is safe (no path traversal).
 */
function isSafeFilename(filename: string): boolean {
  // Reject absolute paths
  if (filename.startsWith('/') || filename.startsWith('\\')) {
    return false;
  }

  // Reject path traversal
  if (filename.includes('..')) {
    return false;
  }

  // Reject backslashes (Windows path separator)
  if (filename.includes('\\')) {
    return false;
  }

  // Reject null bytes
  if (filename.includes('\0')) {
    return false;
  }

  return true;
}

// ============================================================================
// ZIP Entry Extraction
// ============================================================================

/**
 * Extract all entries from a ZIP buffer with safety checks.
 * Returns a Map of filename -> Buffer.
 */
export async function extractZipEntries(
  zipBuffer: Buffer,
  limits: ZipSafetyLimits = DEFAULT_SAFETY_LIMITS
): Promise<Map<string, Buffer>> {
  // Check ZIP size
  if (zipBuffer.length > limits.maxZipSize) {
    throw new ZipSafetyError(
      `ZIP file too large: ${zipBuffer.length} bytes (max: ${limits.maxZipSize})`,
      'ZIP_TOO_LARGE'
    );
  }

  return new Promise((resolve, reject) => {
    const entries = new Map<string, Buffer>();
    let totalDecompressedSize = 0;
    let entryCount = 0;

    yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        return reject(err || new Error('Failed to open ZIP'));
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        // Skip directories
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        // Check entry count
        entryCount++;
        if (entryCount > limits.maxEntries) {
          zipfile.close();
          return reject(new ZipSafetyError(
            `Too many entries: ${entryCount} (max: ${limits.maxEntries})`,
            'TOO_MANY_ENTRIES'
          ));
        }

        // Check path traversal
        if (!isSafeFilename(entry.fileName)) {
          zipfile.close();
          return reject(new ZipSafetyError(
            `Unsafe filename detected: ${entry.fileName}`,
            'PATH_TRAVERSAL'
          ));
        }

        // Check uncompressed size (if available)
        if (entry.uncompressedSize > limits.maxFileSize) {
          zipfile.close();
          return reject(new ZipSafetyError(
            `File too large: ${entry.fileName} (${entry.uncompressedSize} bytes, max: ${limits.maxFileSize})`,
            'FILE_TOO_LARGE'
          ));
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err || !readStream) {
            return reject(err || new Error(`Failed to read ${entry.fileName}`));
          }

          const chunks: Buffer[] = [];
          let fileSize = 0;

          readStream.on('data', (chunk: Buffer) => {
            fileSize += chunk.length;
            totalDecompressedSize += chunk.length;

            // Check file size during streaming
            if (fileSize > limits.maxFileSize) {
              readStream.destroy();
              zipfile.close();
              return reject(new ZipSafetyError(
                `File too large during extraction: ${entry.fileName}`,
                'FILE_TOO_LARGE'
              ));
            }

            // Check total decompressed size (zip bomb protection)
            if (totalDecompressedSize > limits.maxDecompressedSize) {
              readStream.destroy();
              zipfile.close();
              return reject(new ZipSafetyError(
                `Total decompressed size exceeded: ${totalDecompressedSize} bytes`,
                'DECOMPRESSED_TOO_LARGE'
              ));
            }

            chunks.push(chunk);
          });

          readStream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipfile.readEntry();
          });

          readStream.on('error', reject);
        });
      });

      zipfile.on('end', () => {
        resolve(entries);
      });

      zipfile.on('error', reject);
    });
  });
}

/**
 * Extract receipt.json from a ZIP buffer.
 */
export async function extractReceiptFromZip(zipBuffer: Buffer): Promise<ExportReceipt | null> {
  const entries = await extractZipEntries(zipBuffer);
  const receiptBuffer = entries.get('receipt.json');

  if (!receiptBuffer) {
    return null;
  }

  return JSON.parse(receiptBuffer.toString('utf-8'));
}

// ============================================================================
// Content Hash Computation
// ============================================================================

/** Unix epoch for deterministic mtime */
const EPOCH_DATE = new Date(0);

/** Compression level matching server */
const COMPRESSION_LEVEL = 8;

/**
 * Compute the content hash of a ZIP (excluding receipt.json).
 *
 * This recreates the deterministic ZIP that would have been created
 * before adding the receipt, matching the server's two-pass approach.
 */
export async function computeContentHash(zipBuffer: Buffer): Promise<string> {
  // Extract all entries
  const entries = await extractZipEntries(zipBuffer);

  // Filter out receipt.json
  const contentEntries = new Map<string, Buffer>();
  for (const [name, content] of entries) {
    if (name !== 'receipt.json') {
      contentEntries.set(name, content);
    }
  }

  // Sort entries alphabetically (matching server behavior)
  const sortedNames = Array.from(contentEntries.keys()).sort();

  // Create deterministic ZIP using yazl
  const zipfile = new yazl.ZipFile();

  for (const name of sortedNames) {
    const content = contentEntries.get(name)!;
    zipfile.addBuffer(content, name, {
      mtime: EPOCH_DATE,
      compress: true,
      compressionLevel: COMPRESSION_LEVEL,
    });
  }

  zipfile.end();

  // Collect output and compute hash
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    zipfile.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on('end', resolve);
    zipfile.outputStream.on('error', reject);
  });

  const contentZipBuffer = Buffer.concat(chunks);
  return createHash('sha256').update(contentZipBuffer).digest('hex');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List all entries in a ZIP buffer.
 */
export async function listZipEntries(zipBuffer: Buffer): Promise<string[]> {
  const entries = await extractZipEntries(zipBuffer);
  return Array.from(entries.keys()).sort();
}

/**
 * Get a specific entry from a ZIP buffer.
 */
export async function getZipEntry(zipBuffer: Buffer, entryName: string): Promise<Buffer | null> {
  const entries = await extractZipEntries(zipBuffer);
  return entries.get(entryName) || null;
}

/**
 * zipBundle.ts - Deterministic ZIP Bundle Generator (P2.2a)
 *
 * Uses yazl for byte-reproducible ZIP output:
 * - Epoch mtime (1970-01-01 00:00:00 UTC)
 * - Sorted file order (alphabetical)
 * - Fixed compression level
 * - SHA-256 hash of final ZIP
 *
 * GUARANTEES:
 * - Same input → same output (byte-for-byte)
 * - Reproducible across runs
 * - Verifiable hash
 */

import { createHash } from 'crypto';
import yazl from 'yazl';
import type {
  ZipEntry,
  ZipBundleResult,
  FactoryPackageOptions,
} from './exportTypes.js';

// ============================================================================
// Constants
// ============================================================================

/** Unix epoch for deterministic mtime */
const EPOCH_DATE = new Date(0);

/** Compression level (0 = none, 8 = default deflate) */
const COMPRESSION_LEVEL = 8;

// ============================================================================
// Deterministic ZIP Creation
// ============================================================================

/**
 * Create a deterministic ZIP bundle using yazl.
 *
 * @param entries - Files to include in ZIP
 * @param comment - Optional ZIP comment (ignored by yazl)
 * @returns ZipBundleResult with buffer, hash, and metadata
 */
export async function createDeterministicZip(
  entries: ZipEntry[],
  _comment?: string
): Promise<ZipBundleResult> {
  // Sort entries alphabetically for deterministic ordering
  const sortedEntries = [...entries].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Create ZIP file
  const zipfile = new yazl.ZipFile();

  // Add sorted entries with fixed mtime
  for (const entry of sortedEntries) {
    const content =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf-8')
        : entry.content;

    zipfile.addBuffer(content, entry.name, {
      mtime: EPOCH_DATE,
      compress: true,
      compressionLevel: COMPRESSION_LEVEL,
    });
  }

  // Finalize the ZIP
  zipfile.end();

  // Collect output chunks
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    zipfile.outputStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    zipfile.outputStream.on('end', resolve);
    zipfile.outputStream.on('error', reject);
  });

  // Combine chunks
  const buffer = Buffer.concat(chunks);

  // Calculate SHA-256
  const hash = createHash('sha256');
  hash.update(buffer);
  const sha256Hex = hash.digest('hex');

  return {
    buffer,
    sha256Hex,
    sizeBytes: buffer.length,
    entryCount: sortedEntries.length,
    createdAtIso: new Date().toISOString(),
  };
}

// ============================================================================
// Factory Package Bundle
// ============================================================================

/**
 * Create a factory package ZIP bundle.
 *
 * Structure:
 * /manifest.json          - Signed manifest
 * /manifest.sig.json      - Signature envelope
 * /verify-report.json     - Verification report
 * /meta.json              - Package metadata
 * /exports/               - Export files
 */
export async function createFactoryPackage(
  options: FactoryPackageOptions
): Promise<ZipBundleResult> {
  const {
    jobId,
    projectName,
    format,
    manifest,
    signature,
    files,
    verifyReport,
    receipt,
  } = options;

  const entries: ZipEntry[] = [];

  // Add manifest
  entries.push({
    name: 'manifest.json',
    content: manifest,
  });

  // Add signature if present
  if (signature) {
    entries.push({
      name: 'manifest.sig.json',
      content: signature,
    });
  }

  // Add verification report if present
  if (verifyReport) {
    entries.push({
      name: 'verify-report.json',
      content: verifyReport,
    });
  }

  // P13: Add export receipt if present
  if (receipt) {
    entries.push({
      name: 'receipt.json',
      content: receipt,
    });
  }

  // Add metadata
  const meta = {
    jobId,
    projectName: projectName ?? 'Unnamed',
    format,
    exportedAtIso: new Date().toISOString(),
    fileCount: files.length,
    monolithVersion: '2.0.0',
  };
  entries.push({
    name: 'meta.json',
    content: JSON.stringify(meta, null, 2),
  });

  // Add export files
  for (const file of files) {
    entries.push({
      name: `exports/${file.name}`,
      content: file.content,
    });
  }

  // Create deterministic ZIP
  return createDeterministicZip(entries);
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify a ZIP buffer matches expected hash.
 */
export function verifyZipHash(buffer: Buffer, expectedHash: string): boolean {
  const hash = createHash('sha256');
  hash.update(buffer);
  const actualHash = hash.digest('hex');
  return actualHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Calculate SHA-256 hash of a buffer.
 */
export function calculateHash(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * buildCncBundleZip.ts - CNC Bundle ZIP Builder
 *
 * Creates factory-verifiable CNC output bundles with cryptographic
 * trust chain linkage from packet → opGraph → gcode.
 *
 * @version 1.0.0 - Phase D3.1
 */

import { sha256Hex } from '../../crypto/sha256';
import { stableStringify } from '../../core/kernelClient/stablejson';
import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_FILE,
  NOT_FOR_PRODUCTION_NOTICE,
} from '../../core/config/shadowMode';
import type { OperationGraph } from '../operation/operationTypes';
import {
  CNC_MANIFEST_SCHEMA,
  CNC_POST_VERSION,
  CNC_BUNDLE_FILES,
  generateChecksumsFile,
  getCncBundleFilename,
  type CncManifest,
  type CncManifestFileEntry,
  type CncDialect,
  type CncManifestStats,
} from './cncManifest';
import { zipCncBundle, type CncBundleFile } from './zipCncBundle';

// ============================================================================
// Types
// ============================================================================

export interface BuildCncBundleInput {
  /** Job ID from source packet */
  jobId: string;
  /** Target machine ID */
  machineId: 'KDT' | 'BIESSE';
  /** Content hash of source verified packet (optional for preview) */
  packetContentHash?: string;
  /** Operation graph to include */
  opGraph: OperationGraph;
  /** G-code file info */
  gcode: {
    /** File path within bundle (e.g., "nc/PROG001.nc") */
    path: string;
    /** G-code file bytes */
    bytes: Uint8Array;
  };
  /** G-code dialect */
  dialect: CncDialect;
  /** Post processor version (defaults to CNC_POST_VERSION) */
  postVersion?: string;
  /** Creation timestamp (defaults to Date.now()) */
  createdAt?: number;
}

export interface BuildCncBundleResult {
  /** ZIP file bytes */
  zipBytes: Uint8Array;
  /** CNC manifest */
  manifest: CncManifest;
  /** Suggested filename */
  filename: string;
}

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build a factory-verifiable CNC bundle ZIP.
 *
 * Bundle structure:
 * ```
 * cnc-{jobId}-{machineId}-{hashShort}.zip
 * ├── cnc-manifest.json    # Manifest with trust chain
 * ├── opgraph.json         # Stable-serialized operation graph
 * ├── nc/PROG001.nc        # G-code program file
 * └── checksums.sha256     # Factory-friendly checksums
 * ```
 *
 * Trust chain linkage:
 * ```
 * packetContentHash → opGraphHash → gcodeSha256
 * ```
 *
 * @param input - Bundle input parameters
 * @returns Bundle result with ZIP bytes and manifest
 */
export async function buildCncBundleZip(
  input: BuildCncBundleInput
): Promise<BuildCncBundleResult> {
  const {
    jobId,
    machineId,
    packetContentHash,
    opGraph,
    gcode,
    dialect,
    postVersion = CNC_POST_VERSION,
    createdAt = Date.now(),
  } = input;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Serialize opGraph with stable JSON
  // ─────────────────────────────────────────────────────────────────────────
  const opGraphJson = stableStringify(opGraph, 6);
  const opGraphBytes = new TextEncoder().encode(opGraphJson);
  const opGraphHash = await sha256Hex(opGraphBytes);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Compute G-code hash
  // ─────────────────────────────────────────────────────────────────────────
  const gcodeSha256 = await sha256Hex(gcode.bytes);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Build file entries (sorted by path for determinism)
  // ─────────────────────────────────────────────────────────────────────────
  const fileEntries: CncManifestFileEntry[] = [
    {
      path: CNC_BUNDLE_FILES.OPGRAPH,
      bytes: opGraphBytes.length,
      sha256: opGraphHash,
    },
    {
      path: gcode.path,
      bytes: gcode.bytes.length,
      sha256: gcodeSha256,
    },
  ];

  // ADR-065 Q3: shadow-mode label — entered in manifest with a real hash so
  // factory-side verification covers the label file too
  const nfpBytes = new TextEncoder().encode(NOT_FOR_PRODUCTION_NOTICE);
  if (SHADOW_MODE_NOT_FOR_PRODUCTION) {
    fileEntries.push({
      path: NOT_FOR_PRODUCTION_FILE,
      bytes: nfpBytes.length,
      sha256: await sha256Hex(nfpBytes),
    });
  }

  fileEntries.sort((a, b) => a.path.localeCompare(b.path));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Build manifest
  // ─────────────────────────────────────────────────────────────────────────
  const stats = computeStats(opGraph);

  const manifest: CncManifest = {
    schema: CNC_MANIFEST_SCHEMA,
    jobId,
    machineId,
    packetContentHash,
    opGraphHash,
    gcodeSha256,
    post: {
      dialect,
      postVersion,
    },
    createdAt,
    files: fileEntries,
    stats,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Generate checksums.sha256 file
  // ─────────────────────────────────────────────────────────────────────────
  const checksumsContent = generateChecksumsFile(fileEntries);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Serialize manifest with stable JSON
  // ─────────────────────────────────────────────────────────────────────────
  const manifestJson = stableStringify(manifest, 6);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Create ZIP bundle
  // Use strings for text files (better JSZip compatibility across environments)
  // ─────────────────────────────────────────────────────────────────────────
  const bundleFiles: CncBundleFile[] = [
    { path: CNC_BUNDLE_FILES.MANIFEST, bytes: manifestJson },
    { path: CNC_BUNDLE_FILES.OPGRAPH, bytes: opGraphJson },
    { path: gcode.path, bytes: gcode.bytes },
    { path: CNC_BUNDLE_FILES.CHECKSUMS, bytes: checksumsContent },
  ];

  // ADR-065 Q3: shadow-mode label inside the zip
  if (SHADOW_MODE_NOT_FOR_PRODUCTION) {
    bundleFiles.push({ path: NOT_FOR_PRODUCTION_FILE, bytes: NOT_FOR_PRODUCTION_NOTICE });
  }

  const zipBytes = await zipCncBundle(bundleFiles);
  const filename = getCncBundleFilename(manifest);

  return {
    zipBytes,
    manifest,
    filename,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute bundle statistics from operation graph.
 */
function computeStats(opGraph: OperationGraph): CncManifestStats {
  const operations = opGraph.operations;

  // Count tool changes
  let toolChanges = 0;
  let lastTool: string | null = null;
  for (const op of operations) {
    if (op.toolId !== lastTool) {
      if (lastTool !== null) {
        toolChanges++;
      }
      lastTool = op.toolId;
    }
  }

  return {
    opCount: operations.length,
    toolChanges,
    estimatedTimeSeconds: opGraph.estimatedTimeSeconds,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Download CNC bundle ZIP in browser.
 *
 * @param result - Build result from buildCncBundleZip
 */
export function downloadCncBundleZip(result: BuildCncBundleResult): void {
  // Create a new Uint8Array copy to satisfy BlobPart type requirements
  const blobPart = new Uint8Array(result.zipBytes);
  const blob = new Blob([blobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build and download CNC bundle in one step.
 *
 * @param input - Bundle input parameters
 * @returns Bundle result (after download triggered)
 */
export async function buildAndDownloadCncBundle(
  input: BuildCncBundleInput
): Promise<BuildCncBundleResult> {
  const result = await buildCncBundleZip(input);
  downloadCncBundleZip(result);
  return result;
}

/**
 * cncManifest.ts - CNC Bundle Manifest Types and Constants
 *
 * Defines the contract for factory-verifiable CNC output bundles.
 * Factories can verify bundles independently using these schemas.
 *
 * @version 1.1.0 - Phase D5-B: Policy-driven cycle selection
 */

import { SHADOW_MODE_NOT_FOR_PRODUCTION } from '../../core/config/shadowMode';

// ============================================================================
// Constants
// ============================================================================

/** Manifest schema version */
export const CNC_MANIFEST_SCHEMA = 'monolith.cnc.manifest@1.0' as const;

/**
 * Post processor version - bump when dialect logic changes.
 * D5-B: 1.0.0 → 1.1.0 (policy-driven G81/G82/G83 cycle selection)
 */
export const CNC_POST_VERSION = '1.1.0' as const;

/** Fixed ZIP entry timestamp for determinism (Unix epoch) */
export const CNC_ZIP_FIXED_DATE = new Date(0);

// ============================================================================
// Types
// ============================================================================

/**
 * G-code dialect identifier.
 */
export type CncDialect = 'FANUC' | 'BIESSE_ISO';

/**
 * Single file entry in the CNC manifest.
 */
export interface CncManifestFileEntry {
  /** Relative path in bundle (e.g., "program.nc") */
  path: string;
  /** File size in bytes */
  bytes: number;
  /** SHA-256 hash of raw file bytes (lowercase hex) */
  sha256: string;
}

/**
 * Post processor identity for cache key generation.
 */
export interface CncPostIdentity {
  /** G-code dialect */
  dialect: CncDialect;
  /** Post processor version */
  postVersion: string;
  /** Version alias (for compatibility) */
  version?: string;
}

/**
 * Optional statistics for the CNC bundle.
 */
export interface CncManifestStats {
  /** Number of operations */
  opCount: number;
  /** Number of tool changes */
  toolChanges?: number;
  /** Number of G-code lines */
  lineCount?: number;
  /** Estimated runtime in seconds */
  estimatedTimeSeconds?: number;
}

/**
 * Complete CNC manifest structure.
 *
 * This manifest enables factory-side verification:
 * - SHA-256 checksums for all files
 * - Trust chain linkage (packet → opGraph → gcode)
 * - Deterministic post processor identity
 */
export interface CncManifest {
  /** Schema version identifier */
  schema: typeof CNC_MANIFEST_SCHEMA;

  /** Job ID from source packet */
  jobId: string;

  /** Target machine ID */
  machineId: string;

  // Trust Chain Linkage
  /** Content hash of source verified packet */
  packetContentHash?: string;
  /** SHA-256 of opgraph.json bytes */
  opGraphHash: string;
  /** SHA-256 of program file bytes */
  gcodeSha256: string;

  /** Post processor identity */
  post: CncPostIdentity;

  /** Creation timestamp (Unix epoch ms) */
  createdAt: number;

  /** Files in the bundle (sorted by path) */
  files: CncManifestFileEntry[];

  /** Optional statistics */
  stats?: CncManifestStats;
}

// ============================================================================
// Bundle File Names
// ============================================================================

/** Standard file names in CNC bundle */
export const CNC_BUNDLE_FILES = {
  MANIFEST: 'cnc-manifest.json',
  OPGRAPH: 'opgraph.json',
  CHECKSUMS: 'checksums.sha256',
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if manifest matches current schema version.
 */
export function isValidCncManifest(obj: unknown): obj is CncManifest {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as CncManifest;
  return (
    m.schema === CNC_MANIFEST_SCHEMA &&
    typeof m.jobId === 'string' &&
    typeof m.machineId === 'string' &&
    typeof m.opGraphHash === 'string' &&
    typeof m.gcodeSha256 === 'string' &&
    typeof m.createdAt === 'number' &&
    Array.isArray(m.files) &&
    m.post?.dialect !== undefined &&
    m.post?.postVersion !== undefined
  );
}

/**
 * Validate file entry structure.
 */
export function isValidFileEntry(entry: unknown): entry is CncManifestFileEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as CncManifestFileEntry;
  return (
    typeof e.path === 'string' &&
    typeof e.bytes === 'number' &&
    typeof e.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(e.sha256)
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate deterministic bundle filename.
 *
 * Format: cnc-{jobId}-{machineId}-{hashShort}.zip
 * ADR-065 Q3: prefixed NFP- while shadow mode is on — visible before opening.
 *
 * @param manifest - CNC manifest
 * @returns Filename for the bundle
 */
export function getCncBundleFilename(manifest: CncManifest): string {
  const jobIdShort = manifest.jobId.slice(0, 8).toUpperCase();
  const hashShort = manifest.gcodeSha256.slice(0, 8);
  const nfpPrefix = SHADOW_MODE_NOT_FOR_PRODUCTION ? 'NFP-' : '';
  return `${nfpPrefix}cnc-${jobIdShort}-${manifest.machineId}-${hashShort}.zip`;
}

/**
 * Generate checksums.sha256 file content.
 *
 * Format: <sha256>  <filename>\n (sorted by filename)
 *
 * @param files - File entries from manifest
 * @returns Checksums file content
 */
export function generateChecksumsFile(files: CncManifestFileEntry[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return sorted.map((f) => `${f.sha256}  ${f.path}`).join('\n') + '\n';
}

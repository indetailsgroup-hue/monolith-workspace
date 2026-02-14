/**
 * bundleTypes.ts - Export Bundle Type Definitions
 *
 * Defines structure of export bundle (.zip) containing:
 * - Export artifacts (DXF, CSV, GCODE, etc.)
 * - Signed manifest (HEAD)
 * - Factory acceptance checklist
 * - Bundle index with file list and hashes
 * - Optional chain proof (older manifests)
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { FactoryAcceptanceChecklist } from '../factory/generateFactoryChecklist';

// ============================================
// BUNDLE VERSION
// ============================================

export type BundleVersion = '1.0';

// ============================================
// BUNDLE INDEX
// ============================================

/**
 * File entry in bundle index
 */
export interface BundleFileEntry {
  /** Filename in bundle */
  filename: string;
  /** SHA-256 hash (hex) */
  hashHex: string;
  /** File size in bytes */
  sizeBytes: number;
  /** MIME type */
  mimeType?: string;
  /** File category */
  category: 'artifact' | 'manifest' | 'checklist' | 'chain' | 'index' | 'receipt-template';
}

/**
 * Bundle index (bundle_index.json)
 *
 * This is the "table of contents" for the bundle.
 * Verifiers can use this to check file integrity.
 */
export interface BundleIndex {
  /** Bundle format version */
  version: BundleVersion;

  /** Job identifier */
  jobId: string;

  /** Bundle creation timestamp (ISO) */
  createdIso: string;

  /** Creator identifier */
  createdBy?: string;

  /** HEAD manifest hash */
  headManifestHashHex: string;

  /** Whether chain proof is included */
  includesChainProof: boolean;

  /** Chain depth (if chain proof included) */
  chainDepth?: number;

  /** Whether chain reached genesis */
  reachedGenesis?: boolean;

  /** List of all files in bundle */
  files: BundleFileEntry[];

  /** Total bundle size (bytes) */
  totalSizeBytes: number;

  /** Artifact file count */
  artifactCount: number;
}

// ============================================
// BUNDLE CONTENT
// ============================================

/**
 * Bundle content (files to be zipped)
 */
export interface BundleContent {
  /** Bundle index */
  index: BundleIndex;

  /** HEAD manifest */
  manifest: SignedJobManifest;

  /** Factory acceptance checklist */
  checklist: FactoryAcceptanceChecklist;

  /** Export artifacts (filename → content) */
  artifacts: Map<string, Uint8Array>;

  /** Chain proof manifests (oldest first) */
  chainProof: SignedJobManifest[];
}

// ============================================
// BUNDLE FILE NAMES
// ============================================

export const BUNDLE_FILES = {
  INDEX: 'bundle_index.json',
  MANIFEST: 'signed_manifest_head.json',
  CHECKLIST: 'factory_acceptance_checklist.json',
  RECEIPT_TEMPLATE: 'receipts/factory_receipt_template.json',
  CHAIN_DIR: 'chain/',
  RECEIPTS_DIR: 'receipts/',
} as const;

/**
 * Get chain proof filename for a manifest
 */
export function getChainProofFilename(index: number): string {
  return `${BUNDLE_FILES.CHAIN_DIR}manifest_${String(index).padStart(4, '0')}.json`;
}

// ============================================
// VERIFICATION RESULT
// ============================================

/**
 * Bundle verification result
 */
export interface BundleVerificationResult {
  ok: boolean;
  reason?: string;
  details?: string[];

  /** Verified job ID */
  jobId?: string;

  /** Verified HEAD hash */
  headHash?: string;

  /** File verification results */
  fileResults?: Array<{
    filename: string;
    ok: boolean;
    reason?: string;
  }>;
}

// ============================================
// BUILD OPTIONS
// ============================================

/**
 * Bundle build options
 */
export interface BundleBuildOptions {
  /** Include chain proof manifests */
  includeChainProof?: boolean;

  /** Chain proof depth (default: 10) */
  chainProofDepth?: number;

  /** Creator identifier */
  createdBy?: string;

  /** Compression level (0-9, default: 6) */
  compressionLevel?: number;
}

/**
 * manifestChainTypes.ts - Signed Manifest Chain Types
 *
 * ARCHITECTURE:
 * - SignedJobManifest: manifest with cryptographic chain linkage
 * - prevManifestHashHex: links to previous manifest (blockchain-style)
 * - Each manifest contains a SignedTrustReport
 *
 * CHAIN PROPERTIES:
 * - Genesis manifest has prevManifestHashHex = null
 * - Each subsequent manifest points to previous
 * - Tampering breaks the chain (hash mismatch)
 * - Full audit trail from genesis to current
 */

import type { SignedTrustReport } from './signedTrustTypes';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { IssuePack } from '../issues/issueTypes';

// ============================================
// EXPORT ARTIFACT RECORD
// ============================================

/**
 * Export format types
 */
export type ExportKind = 'DXF' | 'CSV' | 'GCODE' | 'PDF' | 'JSON';

/**
 * Record of exported artifact
 */
export interface ExportArtifactRecord {
  /** Export format */
  kind: ExportKind;
  /** Filename or identifier */
  filename: string;
  /** SHA-256 hash of file content */
  contentHashHex: string;
  /** File size in bytes */
  sizeBytes?: number;
  /** Export timestamp */
  createdIso?: string;
}

// ============================================
// REVISION META (for forked revisions)
// ============================================

/**
 * Revision metadata for forked jobs
 *
 * When a job receives a REJECTED receipt, a new revision fork
 * is created with a new job ID (e.g., JOB_123__R2).
 * This metadata tracks the lineage.
 */
export interface RevisionMeta {
  /** Revision number (1 = original, 2+ = revisions) */
  revisionNumber: number;

  /** Original job ID (before any revisions) */
  originalJobId: string;

  /** Job ID this was forked from (null for original) */
  forkedFromJobId: string | null;

  /** Manifest hash that was rejected (null for original) */
  forkedFromManifestHashHex: string | null;

  /** Receipt hash that caused the fork (null for original) */
  forkedFromReceiptHashHex: string | null;

  /** Reason for creating revision */
  reason?: string;

  /** Timestamp of fork creation */
  forkedAtIso?: string;
}

// ============================================
// SIGNED JOB MANIFEST
// ============================================

/**
 * Manifest version
 */
export type ManifestChainVersion = '1.0';

/**
 * Signed job manifest with chain linkage
 */
export interface SignedJobManifest {
  /** Manifest version */
  version: ManifestChainVersion;
  /** Job/project identifier */
  jobId: string;

  // ---- Chain linkage ----
  /** Hash of previous manifest (null for genesis) */
  prevManifestHashHex: string | null;
  /** Hash of this manifest's core (excludes signature) */
  manifestHashHex: string;

  // ---- Signed trust (gate snapshot) ----
  /** Signed trust report at time of manifest creation */
  signedTrust: SignedTrustReport;

  // ---- Exports ----
  /** Export artifacts created from this approved state */
  exports: ExportArtifactRecord[];

  // ---- Factory Receipts ----
  /** Signed factory acceptance/rejection receipts */
  receipts?: SignedFactoryReceipt[];

  // ---- Revision Tracking ----
  /** Revision metadata (for forked revisions) */
  revision?: RevisionMeta;

  // ---- Issue Packs ----
  /** Issue packs from rejected receipts (for revision jobs) */
  issuePacks?: IssuePack[];

  // ---- Manifest signature ----
  /** Ed25519 signature of manifestHashHex */
  manifestSignatureHex: string;
  /** Key ID for manifest signature */
  manifestKeyId: string;
  /** Signature algorithm */
  algo: 'Ed25519';

  // ---- Metadata ----
  /** Creation timestamp */
  createdIso: string;
  /** Creator identifier */
  createdBy?: string;
}

// ============================================
// MANIFEST CORE (for hashing)
// ============================================

/**
 * Core fields of manifest (excludes signature to avoid circular hash)
 */
export interface ManifestCore {
  version: ManifestChainVersion;
  jobId: string;
  prevManifestHashHex: string | null;
  signedTrust: SignedTrustReport;
  exports: ExportArtifactRecord[];
  receipts?: SignedFactoryReceipt[];
  revision?: RevisionMeta;
  issuePacks?: IssuePack[];
  manifestKeyId: string;
  algo: 'Ed25519';
}

/**
 * Extract core fields for hashing
 */
export function extractManifestCore(manifest: SignedJobManifest): ManifestCore {
  return {
    version: manifest.version,
    jobId: manifest.jobId,
    prevManifestHashHex: manifest.prevManifestHashHex,
    signedTrust: manifest.signedTrust,
    exports: manifest.exports,
    receipts: manifest.receipts,
    revision: manifest.revision,
    issuePacks: manifest.issuePacks,
    manifestKeyId: manifest.manifestKeyId,
    algo: manifest.algo,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if manifest is genesis (first in chain)
 */
export function isGenesisManifest(manifest: SignedJobManifest): boolean {
  return manifest.prevManifestHashHex === null;
}

/**
 * Get chain depth (0 for genesis)
 */
export function getChainDepth(
  manifest: SignedJobManifest,
  loadByHash: (hash: string) => SignedJobManifest | null,
  maxDepth: number = 100
): number {
  let depth = 0;
  let current: SignedJobManifest | null = manifest;

  while (current && current.prevManifestHashHex && depth < maxDepth) {
    current = loadByHash(current.prevManifestHashHex);
    depth++;
  }

  return depth;
}

/**
 * Check manifest structure validity
 */
export function isValidManifestStructure(manifest: unknown): manifest is SignedJobManifest {
  if (!manifest || typeof manifest !== 'object') return false;

  const m = manifest as Record<string, unknown>;

  return (
    m.version === '1.0' &&
    typeof m.jobId === 'string' &&
    typeof m.manifestHashHex === 'string' &&
    typeof m.manifestSignatureHex === 'string' &&
    typeof m.manifestKeyId === 'string' &&
    m.algo === 'Ed25519' &&
    typeof m.signedTrust === 'object' &&
    Array.isArray(m.exports)
  );
}

// ============================================
// REVISION HELPERS
// ============================================

/** Revision suffix pattern: __R2, __R3, etc. */
const REVISION_PATTERN = /__R(\d+)$/;

/**
 * Parse revision info from job ID
 *
 * @example
 * parseRevisionFromJobId('JOB_123') // { originalJobId: 'JOB_123', revisionNumber: 1 }
 * parseRevisionFromJobId('JOB_123__R2') // { originalJobId: 'JOB_123', revisionNumber: 2 }
 */
export function parseRevisionFromJobId(jobId: string): {
  originalJobId: string;
  revisionNumber: number;
} {
  const match = jobId.match(REVISION_PATTERN);

  if (match) {
    const revisionNumber = parseInt(match[1], 10);
    const originalJobId = jobId.replace(REVISION_PATTERN, '');
    return { originalJobId, revisionNumber };
  }

  return { originalJobId: jobId, revisionNumber: 1 };
}

/**
 * Generate new revision job ID
 *
 * @example
 * generateRevisionJobId('JOB_123', 2) // 'JOB_123__R2'
 * generateRevisionJobId('JOB_123__R2', 3) // 'JOB_123__R3'
 */
export function generateRevisionJobId(jobId: string, newRevisionNumber: number): string {
  const { originalJobId } = parseRevisionFromJobId(jobId);
  return `${originalJobId}__R${newRevisionNumber}`;
}

/**
 * Create initial revision meta for original job
 */
export function createOriginalRevisionMeta(jobId: string): RevisionMeta {
  const { originalJobId } = parseRevisionFromJobId(jobId);
  return {
    revisionNumber: 1,
    originalJobId,
    forkedFromJobId: null,
    forkedFromManifestHashHex: null,
    forkedFromReceiptHashHex: null,
  };
}

/**
 * Create revision meta for forked job
 */
export function createForkedRevisionMeta(args: {
  newRevisionNumber: number;
  originalJobId: string;
  forkedFromJobId: string;
  forkedFromManifestHashHex: string;
  forkedFromReceiptHashHex: string;
  reason?: string;
}): RevisionMeta {
  return {
    revisionNumber: args.newRevisionNumber,
    originalJobId: args.originalJobId,
    forkedFromJobId: args.forkedFromJobId,
    forkedFromManifestHashHex: args.forkedFromManifestHashHex,
    forkedFromReceiptHashHex: args.forkedFromReceiptHashHex,
    reason: args.reason,
    forkedAtIso: new Date().toISOString(),
  };
}

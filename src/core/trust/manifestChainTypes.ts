/**
 * manifestChainTypes.ts - Manifest Chain Core Types
 *
 * SignedJobManifest is the CENTRAL data type of the trust chain.
 * Every state change (commit, freeze, release, export, receipt)
 * produces a new manifest linked to its predecessor.
 *
 * @version 1.0.0
 */

import type { SignedTrustReport } from './trustReportTypes';
import type { SignedFactoryReceipt } from '../receipt/factoryReceiptTypes';
import type { IssuePack } from '../issues/issueTypes';

// ============================================
// EXPORT ARTIFACT RECORD (legacy format)
// ============================================

/**
 * Export kind identifier
 */
export type ExportKind = 'DXF' | 'CSV' | 'JSON' | 'CNC' | 'REPORT' | 'FACTORY_PACKAGE';

/**
 * Export artifact record (used in manifest.exports[])
 * This is the legacy per-file format used by exportPipeline.ts
 */
export interface ExportArtifactRecord {
  /** Export kind */
  kind: ExportKind;
  /** Filename */
  filename: string;
  /** SHA-256 hash of content */
  contentHashHex: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Creation timestamp */
  createdIso: string;
}

// ============================================
// REVISION META
// ============================================

/**
 * Revision metadata for forked jobs
 *
 * When a factory receipt is REJECTED, a revision fork is created
 * to resolve the issues without affecting the original job.
 */
export interface RevisionMeta {
  /** Revision number (1, 2, 3...) */
  revisionNumber: number;
  /** Original (root) job ID */
  originalJobId: string;
  /** Job ID we forked from */
  forkedFromJobId: string;
  /** Manifest hash at fork point */
  forkedFromManifestHashHex: string;
  /** Receipt hash that triggered fork */
  forkedFromReceiptHashHex: string;
  /** Reason for revision */
  reason: string;
}

// ============================================
// SIGNED JOB MANIFEST
// ============================================

/**
 * Signed job manifest - the core unit of the trust chain
 *
 * Each manifest is:
 * 1. Content-addressed (manifestHashHex)
 * 2. Linked to predecessor (prevManifestHashHex)
 * 3. Contains a signed trust report
 * 4. Optionally contains exports, receipts, and issue packs
 */
export interface SignedJobManifest {
  /** Job identifier */
  jobId: string;
  /** SHA-256 hash of this manifest's canonical content */
  manifestHashHex: string;
  /** Previous manifest hash (null for genesis) */
  prevManifestHashHex: string | null;
  /** Signed trust report */
  signedTrust: SignedTrustReport | null;
  /** Export artifact records */
  exports?: ExportArtifactRecord[];
  /** Creation timestamp */
  createdIso: string;
  /** Creator identifier */
  createdBy?: string;
  /** Manifest signature */
  manifestSignature?: {
    keyId: string;
    signatureHex: string;
    algorithm: string;
  };
  /** Revision metadata (if this is a forked revision) */
  revision?: RevisionMeta;
  /** Factory receipts attached to this manifest */
  receipts?: SignedFactoryReceipt[];
  /** Issue packs attached to this manifest */
  issuePacks?: IssuePack[];
}

// ============================================
// REVISION HELPERS
// ============================================

/**
 * Parse revision info from a job ID
 *
 * Job IDs follow the pattern: `JOB_abc123` or `JOB_abc123_REV2`
 *
 * @returns Original job ID and revision number
 */
export function parseRevisionFromJobId(jobId: string): {
  originalJobId: string;
  revisionNumber: number;
} {
  const revMatch = jobId.match(/^(.+)_REV(\d+)$/);
  if (revMatch) {
    return {
      originalJobId: revMatch[1],
      revisionNumber: parseInt(revMatch[2], 10),
    };
  }
  return {
    originalJobId: jobId,
    revisionNumber: 0,
  };
}

/**
 * Generate a revision job ID
 *
 * @example generateRevisionJobId('JOB_abc123', 2) → 'JOB_abc123_REV2'
 */
export function generateRevisionJobId(jobId: string, revision: number): string {
  // Strip existing revision suffix
  const { originalJobId } = parseRevisionFromJobId(jobId);
  return `${originalJobId}_REV${revision}`;
}

/**
 * Create revision metadata for a fork
 */
export function createForkedRevisionMeta(args: {
  newRevisionNumber: number;
  originalJobId: string;
  forkedFromJobId: string;
  forkedFromManifestHashHex: string;
  forkedFromReceiptHashHex: string;
  reason: string;
}): RevisionMeta {
  return {
    revisionNumber: args.newRevisionNumber,
    originalJobId: args.originalJobId,
    forkedFromJobId: args.forkedFromJobId,
    forkedFromManifestHashHex: args.forkedFromManifestHashHex,
    forkedFromReceiptHashHex: args.forkedFromReceiptHashHex,
    reason: args.reason,
  };
}

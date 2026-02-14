/**
 * exportReceiptTypes.ts - P13 Export Receipt Types
 *
 * Receipt is an offline-verifiable proof bundle embedded in the export ZIP.
 * It contains the P12 proof snapshot at the moment of export.
 *
 * @version 0.13.0
 */

import type { JobProof } from '../proof/proofTypes.js';

// ============================================================================
// Version Constant
// ============================================================================

export const RECEIPT_VERSION = 'MONOLITH_EXPORT_RECEIPT_V1' as const;

export type ReceiptVersion = typeof RECEIPT_VERSION;

// ============================================================================
// Receipt Types
// ============================================================================

export interface ExportReceiptExportParams {
  target: string;
  dialect: string;
  profileId?: string;
  mode?: string;
  artifactName: string;
}

export interface ExportReceiptSignature {
  /** Signature algorithm: 'none' for P13, 'ed25519' reserved for P13.1 */
  alg: 'none' | 'ed25519';
  /** Key identifier (reserved for P13.1) */
  keyId?: string;
  /** Base64 signature (reserved for P13.1) */
  sig?: string;
}

/**
 * P13 Export Receipt
 *
 * A deterministic, self-describing proof bundle embedded in the export ZIP.
 * Can be used for offline verification and dispute resolution.
 */
export interface ExportReceipt {
  /** Schema version for forward compatibility */
  version: ReceiptVersion;

  /** Job identifier */
  jobId: string;

  /** Receipt ID: SHA-256 of canonical receipt payload (without receiptId itself) */
  receiptId: string;

  /** Content SHA-256: hash of ZIP without receipt (deterministic, reproducible) */
  contentSha256: string;

  /** ZIP SHA-256: hash of final ZIP including receipt (for download verification) */
  zipSha256?: string;

  /** Export parameters (server authoritative) */
  export: ExportReceiptExportParams;

  /** P12 Proof bundle snapshot at the moment of export */
  proof: JobProof;

  /** Timestamp when receipt was generated */
  generatedAt: string;

  /** Signature envelope (P13.1: Ed25519) */
  signature: ExportReceiptSignature;
}

// ============================================================================
// Build Input Types
// ============================================================================

export interface BuildReceiptInput {
  jobId: string;
  contentSha256: string;
  export: ExportReceiptExportParams;
  proof: JobProof;
}

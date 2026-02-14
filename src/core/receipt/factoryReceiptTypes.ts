/**
 * factoryReceiptTypes.ts - Factory Receipt Types for Closed-Loop Verification
 *
 * ARCHITECTURE:
 * - FactoryReceipt: factory acceptance record
 * - SignedFactoryReceipt: receipt with Ed25519 signature
 * - Links back to manifest chain via headManifestHashHex
 *
 * CLOSED-LOOP:
 * 1. Designer releases bundle (RELEASED state)
 * 2. Factory receives bundle, verifies integrity
 * 3. Factory signs receipt (ACCEPTED/REJECTED)
 * 4. Receipt is appended to manifest chain
 * 5. Full audit trail from design to factory acceptance
 */

// ============================================
// FACTORY RECEIPT
// ============================================

/**
 * Factory receipt version
 */
export type FactoryReceiptVersion = '1.0';

/**
 * Factory verdict
 */
export type FactoryVerdict = 'ACCEPTED' | 'REJECTED';

/**
 * Factory receipt for bundle acceptance
 *
 * Created by factory QC after verifying export bundle.
 * References the manifest chain and snapshot hash for traceability.
 */
export interface FactoryReceipt {
  /** Receipt version */
  version: FactoryReceiptVersion;

  /** Job/project identifier */
  jobId: string;

  // ---- What was accepted ----
  /**
   * Hash of the HEAD manifest at acceptance time
   * Links receipt to specific manifest in chain
   */
  headManifestHashHex: string;

  /**
   * Snapshot hash from TrustReport
   * Proves factory accepted same data that was signed
   */
  snapshotHashHex: string;

  /**
   * SHA-256 hash of the bundle zip file
   * Proves integrity of received bundle
   */
  bundleZipSha256Hex: string;

  // ---- Acceptance metadata ----
  /** ISO timestamp of acceptance */
  acceptedAtIso: string;

  /** Factory station identifier (e.g., "STATION_CNC_01") */
  stationId: string;

  /** Inspector identifier (non-sensitive, e.g., "QC-A") */
  inspector: string;

  /** Optional note */
  note?: string;

  // ---- Verdict ----
  /** Accept or reject verdict */
  verdict: FactoryVerdict;

  /** Rejection reasons (if verdict is REJECTED) */
  rejectReasons?: string[];
}

// ============================================
// SIGNED FACTORY RECEIPT
// ============================================

/**
 * Signed factory receipt
 *
 * Contains the receipt plus Ed25519 signature.
 * Factory's public key must be in keyring for verification.
 */
export interface SignedFactoryReceipt {
  /** The receipt data */
  receipt: FactoryReceipt;

  /** SHA-256 hash of canonical JSON receipt */
  receiptHashHex: string;

  /** Ed25519 signature of receiptHashHex */
  signatureHex: string;

  /** Factory key ID (must be in keyring) */
  keyId: string;

  /** Signature algorithm */
  algo: 'Ed25519';
}

// ============================================
// CREATION HELPERS
// ============================================

/**
 * Create receipt template from bundle verification
 *
 * Used to pre-fill receipt fields after bundle verification.
 * Factory QC can edit before signing.
 */
export function createReceiptTemplate(args: {
  jobId: string;
  headManifestHashHex: string;
  snapshotHashHex: string;
  bundleZipSha256Hex: string;
  stationId?: string;
  inspector?: string;
}): FactoryReceipt {
  return {
    version: '1.0',
    jobId: args.jobId,
    headManifestHashHex: args.headManifestHashHex,
    snapshotHashHex: args.snapshotHashHex,
    bundleZipSha256Hex: args.bundleZipSha256Hex,
    acceptedAtIso: new Date().toISOString(),
    stationId: args.stationId ?? 'FACTORY_STATION_1',
    inspector: args.inspector ?? 'QC-A',
    verdict: 'ACCEPTED',
  };
}

/**
 * Create rejection receipt
 */
export function createRejectionReceipt(args: {
  template: FactoryReceipt;
  reasons: string[];
  note?: string;
}): FactoryReceipt {
  return {
    ...args.template,
    verdict: 'REJECTED',
    rejectReasons: args.reasons,
    note: args.note,
    acceptedAtIso: new Date().toISOString(),
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate receipt structure
 */
export function validateReceiptStructure(
  receipt: unknown
): { ok: true; receipt: FactoryReceipt } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!receipt || typeof receipt !== 'object') {
    return { ok: false, errors: ['Receipt must be an object'] };
  }

  const r = receipt as Record<string, unknown>;

  if (r.version !== '1.0') {
    errors.push('Receipt version must be "1.0"');
  }

  if (typeof r.jobId !== 'string' || !r.jobId) {
    errors.push('Receipt jobId is required');
  }

  if (typeof r.headManifestHashHex !== 'string' || r.headManifestHashHex.length !== 64) {
    errors.push('Receipt headManifestHashHex must be 64-char hex');
  }

  if (typeof r.snapshotHashHex !== 'string') {
    errors.push('Receipt snapshotHashHex is required');
  }

  if (typeof r.bundleZipSha256Hex !== 'string' || r.bundleZipSha256Hex.length !== 64) {
    errors.push('Receipt bundleZipSha256Hex must be 64-char hex');
  }

  if (typeof r.acceptedAtIso !== 'string') {
    errors.push('Receipt acceptedAtIso is required');
  }

  if (typeof r.stationId !== 'string') {
    errors.push('Receipt stationId is required');
  }

  if (typeof r.inspector !== 'string') {
    errors.push('Receipt inspector is required');
  }

  if (r.verdict !== 'ACCEPTED' && r.verdict !== 'REJECTED') {
    errors.push('Receipt verdict must be "ACCEPTED" or "REJECTED"');
  }

  if (r.verdict === 'REJECTED' && !Array.isArray(r.rejectReasons)) {
    errors.push('Receipt rejectReasons required when verdict is REJECTED');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, receipt: r as unknown as FactoryReceipt };
}

/**
 * Validate signed receipt structure
 */
export function validateSignedReceiptStructure(
  signed: unknown
): { ok: true; signed: SignedFactoryReceipt } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!signed || typeof signed !== 'object') {
    return { ok: false, errors: ['SignedReceipt must be an object'] };
  }

  const s = signed as Record<string, unknown>;

  // Validate receipt
  const receiptResult = validateReceiptStructure(s.receipt);
  if (!receiptResult.ok) {
    errors.push(...receiptResult.errors.map((e) => `receipt.${e}`));
  }

  if (typeof s.receiptHashHex !== 'string' || s.receiptHashHex.length !== 64) {
    errors.push('SignedReceipt receiptHashHex must be 64-char hex');
  }

  if (typeof s.signatureHex !== 'string' || s.signatureHex.length !== 128) {
    errors.push('SignedReceipt signatureHex must be 128-char hex');
  }

  if (typeof s.keyId !== 'string' || !s.keyId) {
    errors.push('SignedReceipt keyId is required');
  }

  if (s.algo !== 'Ed25519') {
    errors.push('SignedReceipt algo must be "Ed25519"');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, signed: s as unknown as SignedFactoryReceipt };
}

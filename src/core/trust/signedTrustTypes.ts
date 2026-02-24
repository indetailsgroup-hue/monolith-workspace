/**
 * signedTrustTypes.ts - Signed Trust Report Types
 *
 * ARCHITECTURE:
 * - SignedTrustReport wraps TrustReport with cryptographic signature
 * - Uses canonical JSON hash for deterministic verification
 * - Ed25519 signature for tamper detection
 *
 * SECURITY:
 * - trustHashHex: SHA-256(canonicalJson(trust))
 * - signatureHex: Ed25519.sign(trustHashBytes, privateKey)
 * - keyId identifies which public key verifies the signature
 */

import type { TrustReport } from './trustReportTypes';

// ============================================
// SIGNED TRUST REPORT
// ============================================

/**
 * Supported signature algorithm
 */
export type SignatureAlgorithm = 'Ed25519';

/**
 * Trust report with cryptographic signature
 */
export interface SignedTrustReport {
  /** Original trust report (unsigned) */
  trust: TrustReport;

  /** SHA-256 hash of canonical JSON trust report */
  trustHashHex: string;

  /** Ed25519 signature of trustHashHex */
  signatureHex: string;

  /** Key ID that can verify this signature */
  keyId: string;

  /** Signature algorithm */
  algo: SignatureAlgorithm;

  /** Signature timestamp (ISO) */
  signedAtIso?: string;
}

// ============================================
// VERIFICATION RESULT
// ============================================

/**
 * Result of signature verification
 */
export interface TrustVerificationResult {
  /** Whether verification passed */
  ok: boolean;
  /** Reason for failure (if not ok) */
  reason?: string;
  /** Verified key ID (if ok) */
  keyId?: string;
  /** Hash that was verified (if ok) */
  hashHex?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if signed trust report structure is valid
 */
export function isValidSignedTrustStructure(signed: unknown): signed is SignedTrustReport {
  if (!signed || typeof signed !== 'object') return false;

  const s = signed as Record<string, unknown>;

  return (
    typeof s.trust === 'object' &&
    typeof s.trustHashHex === 'string' &&
    typeof s.signatureHex === 'string' &&
    typeof s.keyId === 'string' &&
    s.algo === 'Ed25519'
  );
}

/**
 * Extract trust from signed wrapper (unsafe - does not verify)
 */
export function extractTrustUnsafe(signed: SignedTrustReport): TrustReport {
  return signed.trust;
}

/**
 * Check if trust report is approved (gate.ok && signature present)
 */
export function isApprovedTrust(signed: SignedTrustReport): boolean {
  return signed.trust.gate.ok && signed.signatureHex.length > 0;
}

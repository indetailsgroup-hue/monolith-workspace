/**
 * verifyTrustReport.ts - Verify Signed Trust Report
 *
 * VERIFICATION STEPS:
 * 1. Look up public key by keyId from keyring
 * 2. Recompute canonical hash from trust object
 * 3. Verify hash matches trustHashHex
 * 4. Verify Ed25519 signature
 *
 * SECURITY:
 * - Only trusted public keys in keyring can verify
 * - Hash verification prevents tampering
 * - Signature verification proves authenticity
 */

import type { SignedTrustReport, TrustVerificationResult } from './signedTrustTypes';
import type { Keyring } from '../crypto/keyring';
import { sha256CanonicalHex } from '../crypto/sha256';
import { verifyHashHex } from '../crypto/ed25519';

// ============================================
// VERIFY SIGNED TRUST REPORT
// ============================================

/**
 * Verify a SignedTrustReport
 *
 * @param args.signed - SignedTrustReport to verify
 * @param args.keyring - Keyring containing trusted public keys
 * @returns Verification result
 *
 * @example
 * const result = await verifySignedTrustReport({
 *   signed: signedTrust,
 *   keyring: pinnedKeyring,
 * });
 *
 * if (!result.ok) {
 *   console.error('Verification failed:', result.reason);
 * }
 */
export async function verifySignedTrustReport(args: {
  signed: SignedTrustReport;
  keyring: Keyring;
}): Promise<TrustVerificationResult> {
  const { signed, keyring } = args;

  // 1. Look up public key
  const keyInfo = keyring.getPublicKey(signed.keyId);
  if (!keyInfo) {
    return {
      ok: false,
      reason: `Unknown keyId: ${signed.keyId}`,
    };
  }

  // 2. Recompute canonical hash
  const computedHashHex = await sha256CanonicalHex(signed.trust);

  // 3. Verify hash matches
  if (computedHashHex !== signed.trustHashHex) {
    return {
      ok: false,
      reason: 'Trust hash mismatch - content may have been modified',
    };
  }

  // 4. Verify Ed25519 signature
  const signatureValid = await verifyHashHex({
    hashHex: signed.trustHashHex,
    signatureHex: signed.signatureHex,
    publicKeyHex: keyInfo.publicKeyHex,
  });

  if (!signatureValid) {
    return {
      ok: false,
      reason: 'Invalid signature',
    };
  }

  // All checks passed
  return {
    ok: true,
    keyId: signed.keyId,
    hashHex: computedHashHex,
  };
}

/**
 * Verify signed trust and check gate status
 */
export async function verifySignedTrustWithGate(args: {
  signed: SignedTrustReport;
  keyring: Keyring;
}): Promise<TrustVerificationResult & { gateOk: boolean }> {
  const result = await verifySignedTrustReport(args);

  return {
    ...result,
    gateOk: args.signed.trust.gate.ok,
  };
}

/**
 * Quick check if signed trust is valid (throws on failure)
 */
export async function assertSignedTrustValid(args: {
  signed: SignedTrustReport;
  keyring: Keyring;
}): Promise<void> {
  const result = await verifySignedTrustReport(args);

  if (!result.ok) {
    throw new Error(`Trust verification failed: ${result.reason}`);
  }
}

/**
 * Check if signed trust can be used for export
 * (verified signature + gate.ok)
 */
export async function canUseForExport(args: {
  signed: SignedTrustReport;
  keyring: Keyring;
}): Promise<boolean> {
  const result = await verifySignedTrustReport(args);

  if (!result.ok) return false;
  if (!args.signed.trust.gate.ok) return false;
  if (args.signed.trust.collision.blocked) return false;

  return true;
}

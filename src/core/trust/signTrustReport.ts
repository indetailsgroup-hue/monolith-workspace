/**
 * signTrustReport.ts - Sign Trust Report with Ed25519
 *
 * PROCESS:
 * 1. Serialize TrustReport to canonical JSON
 * 2. Compute SHA-256 hash
 * 3. Sign hash with Ed25519 private key
 * 4. Return SignedTrustReport envelope
 *
 * SECURITY:
 * - Private key should come from secure storage
 * - Never log or expose private key
 */

import type { TrustReport } from './trustReportTypes';
import type { SignedTrustReport } from './signedTrustTypes';
import { sha256CanonicalHex } from '../crypto/sha256';
import { signHashHex } from '../crypto/ed25519';

// ============================================
// SIGN TRUST REPORT
// ============================================

/**
 * Sign a TrustReport with Ed25519
 *
 * @param args.trust - TrustReport to sign
 * @param args.keyId - Key identifier for verification
 * @param args.privateKeyHex - Ed25519 private key (64 hex chars)
 * @returns SignedTrustReport with signature
 *
 * @example
 * const signed = await signTrustReport({
 *   trust: trustReport,
 *   keyId: 'approval-key-001',
 *   privateKeyHex: process.env.APPROVAL_PRIVATE_KEY,
 * });
 */
export async function signTrustReport(args: {
  trust: TrustReport;
  keyId: string;
  privateKeyHex: string;
}): Promise<SignedTrustReport> {
  // 1. Compute canonical hash
  const trustHashHex = await sha256CanonicalHex(args.trust);

  // 2. Sign the hash
  const signatureHex = await signHashHex({
    hashHex: trustHashHex,
    privateKeyHex: args.privateKeyHex,
  });

  // 3. Return signed envelope
  return {
    trust: args.trust,
    trustHashHex,
    signatureHex,
    keyId: args.keyId,
    algo: 'Ed25519',
    signedAtIso: new Date().toISOString(),
  };
}

/**
 * Re-sign an existing signed trust report with a new key
 * (Useful for key rotation or multi-signature)
 */
export async function reSignTrustReport(args: {
  signed: SignedTrustReport;
  newKeyId: string;
  newPrivateKeyHex: string;
}): Promise<SignedTrustReport> {
  // Recompute hash (should match original)
  const trustHashHex = await sha256CanonicalHex(args.signed.trust);

  // Sign with new key
  const signatureHex = await signHashHex({
    hashHex: trustHashHex,
    privateKeyHex: args.newPrivateKeyHex,
  });

  return {
    trust: args.signed.trust,
    trustHashHex,
    signatureHex,
    keyId: args.newKeyId,
    algo: 'Ed25519',
    signedAtIso: new Date().toISOString(),
  };
}

/**
 * Create unsigned trust envelope (for testing or deferred signing)
 */
export async function createUnsignedTrustEnvelope(
  trust: TrustReport
): Promise<Omit<SignedTrustReport, 'signatureHex' | 'keyId'>> {
  const trustHashHex = await sha256CanonicalHex(trust);

  return {
    trust,
    trustHashHex,
    algo: 'Ed25519',
  };
}

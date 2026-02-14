/**
 * signFactoryReceipt.ts - Sign Factory Receipt with Ed25519
 *
 * PROCESS:
 * 1. Compute SHA-256 hash of canonical JSON receipt
 * 2. Sign the hash with factory private key
 * 3. Return SignedFactoryReceipt
 *
 * SECURITY:
 * - Factory private key should be stored securely (HSM, KMS)
 * - Only factory QC stations should have access to signing keys
 */

import type { FactoryReceipt, SignedFactoryReceipt } from './factoryReceiptTypes';
import { sha256CanonicalHex } from '../crypto/sha256';
import { signHashHex } from '../crypto/ed25519';

// ============================================
// SIGN RECEIPT
// ============================================

/**
 * Sign factory receipt with Ed25519 key
 *
 * @param args.receipt - Receipt to sign
 * @param args.keyId - Factory key ID
 * @param args.privateKeyHex - Factory private key (hex)
 * @returns SignedFactoryReceipt
 *
 * @example
 * const signed = await signFactoryReceipt({
 *   receipt,
 *   keyId: 'factory-qc-001',
 *   privateKeyHex: process.env.FACTORY_PRIVATE_KEY,
 * });
 */
export async function signFactoryReceipt(args: {
  receipt: FactoryReceipt;
  keyId: string;
  privateKeyHex: string;
}): Promise<SignedFactoryReceipt> {
  const { receipt, keyId, privateKeyHex } = args;

  // 1. Compute canonical hash of receipt
  const receiptHashHex = await sha256CanonicalHex(receipt);

  // 2. Sign the hash
  const signatureHex = await signHashHex({
    hashHex: receiptHashHex,
    privateKeyHex,
  });

  // 3. Return signed receipt
  return {
    receipt,
    receiptHashHex,
    signatureHex,
    keyId,
    algo: 'Ed25519',
  };
}

/**
 * Sign receipt from template
 *
 * Convenience function that creates receipt from template and signs.
 */
export async function signReceiptFromTemplate(args: {
  jobId: string;
  headManifestHashHex: string;
  snapshotHashHex: string;
  bundleZipSha256Hex: string;
  stationId: string;
  inspector: string;
  verdict: 'ACCEPTED' | 'REJECTED';
  rejectReasons?: string[];
  note?: string;
  keyId: string;
  privateKeyHex: string;
}): Promise<SignedFactoryReceipt> {
  const receipt: FactoryReceipt = {
    version: '1.0',
    jobId: args.jobId,
    headManifestHashHex: args.headManifestHashHex,
    snapshotHashHex: args.snapshotHashHex,
    bundleZipSha256Hex: args.bundleZipSha256Hex,
    acceptedAtIso: new Date().toISOString(),
    stationId: args.stationId,
    inspector: args.inspector,
    verdict: args.verdict,
    rejectReasons: args.rejectReasons,
    note: args.note,
  };

  return signFactoryReceipt({
    receipt,
    keyId: args.keyId,
    privateKeyHex: args.privateKeyHex,
  });
}

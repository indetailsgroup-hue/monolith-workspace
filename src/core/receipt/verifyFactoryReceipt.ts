/**
 * verifyFactoryReceipt.ts - Verify Factory Receipt Signature
 *
 * VERIFICATION:
 * 1. Lookup factory public key from keyring
 * 2. Recompute receipt hash from canonical JSON
 * 3. Verify Ed25519 signature
 *
 * KEYRING REQUIREMENTS:
 * - Factory public keys must be in keyring with purpose: 'FACTORY'
 * - Key must be active and not expired
 */

import type { SignedFactoryReceipt } from './factoryReceiptTypes';
import type { Keyring } from '../crypto/keyring';
import { sha256CanonicalHex } from '../crypto/sha256';
import { verifyHashHex } from '../crypto/ed25519';

// ============================================
// VERIFICATION RESULT
// ============================================

/**
 * Factory receipt verification result
 */
export interface ReceiptVerificationResult {
  /** Whether verification passed */
  ok: boolean;

  /** Failure reason (if !ok) */
  reason?: string;

  /** Verified receipt (if ok) */
  receipt?: SignedFactoryReceipt;

  /** Key ID used for verification */
  keyId?: string;
}

// ============================================
// VERIFY RECEIPT
// ============================================

/**
 * Verify signed factory receipt
 *
 * @param args.signed - Signed receipt to verify
 * @param args.keyring - Keyring with factory public keys
 * @returns Verification result
 *
 * @example
 * const result = await verifySignedFactoryReceipt({
 *   signed: signedReceipt,
 *   keyring: factoryKeyring,
 * });
 *
 * if (result.ok) {
 *   console.log('Receipt verified!');
 * } else {
 *   console.error('Verification failed:', result.reason);
 * }
 */
export async function verifySignedFactoryReceipt(args: {
  signed: SignedFactoryReceipt;
  keyring: Keyring;
}): Promise<ReceiptVerificationResult> {
  const { signed, keyring } = args;

  // 1. Lookup factory public key
  const keyInfo = keyring.getPublicKey(signed.keyId);
  if (!keyInfo) {
    return {
      ok: false,
      reason: `Unknown factory keyId: ${signed.keyId}`,
    };
  }

  // 2. Check key purpose
  if (keyInfo.purpose !== 'FACTORY') {
    return {
      ok: false,
      reason: `Key ${signed.keyId} is not a FACTORY key (purpose: ${keyInfo.purpose})`,
    };
  }

  // 3. Recompute receipt hash
  const computedHash = await sha256CanonicalHex(signed.receipt);
  if (computedHash !== signed.receiptHashHex) {
    return {
      ok: false,
      reason: 'Receipt hash mismatch - receipt may have been tampered',
    };
  }

  // 4. Verify signature
  const signatureValid = await verifyHashHex({
    hashHex: signed.receiptHashHex,
    signatureHex: signed.signatureHex,
    publicKeyHex: keyInfo.publicKeyHex,
  });

  if (!signatureValid) {
    return {
      ok: false,
      reason: 'Invalid receipt signature',
    };
  }

  return {
    ok: true,
    receipt: signed,
    keyId: signed.keyId,
  };
}

// ============================================
// BATCH VERIFICATION
// ============================================

/**
 * Verify multiple receipts
 */
export async function verifyReceiptBatch(args: {
  receipts: SignedFactoryReceipt[];
  keyring: Keyring;
}): Promise<{
  allOk: boolean;
  results: ReceiptVerificationResult[];
}> {
  const results = await Promise.all(
    args.receipts.map((signed) =>
      verifySignedFactoryReceipt({ signed, keyring: args.keyring })
    )
  );

  return {
    allOk: results.every((r) => r.ok),
    results,
  };
}

// ============================================
// CHAIN VERIFICATION
// ============================================

/**
 * Verify receipt references correct manifest
 *
 * Checks that receipt's headManifestHashHex matches expected manifest.
 */
export function verifyReceiptManifestLink(args: {
  signed: SignedFactoryReceipt;
  expectedManifestHashHex: string;
}): { ok: boolean; reason?: string } {
  if (args.signed.receipt.headManifestHashHex !== args.expectedManifestHashHex) {
    return {
      ok: false,
      reason: `Receipt references manifest ${args.signed.receipt.headManifestHashHex}, expected ${args.expectedManifestHashHex}`,
    };
  }

  return { ok: true };
}

/**
 * Verify receipt snapshot hash matches trust report
 *
 * Ensures factory accepted the same snapshot that was signed.
 */
export function verifyReceiptSnapshotLink(args: {
  signed: SignedFactoryReceipt;
  expectedSnapshotHashHex: string;
}): { ok: boolean; reason?: string } {
  if (args.signed.receipt.snapshotHashHex !== args.expectedSnapshotHashHex) {
    return {
      ok: false,
      reason: `Receipt snapshot hash ${args.signed.receipt.snapshotHashHex} does not match expected ${args.expectedSnapshotHashHex}`,
    };
  }

  return { ok: true };
}

/**
 * verifyFactoryReceipt.ts - Verify Factory Receipt
 *
 * Verifies the cryptographic integrity of a signed factory receipt.
 *
 * @version 1.0.0
 */

import type { SignedFactoryReceipt } from './factoryReceiptTypes';
import type { Keyring } from '../crypto/keyring';
import { sha256CanonicalHex } from '../../crypto/sha256';

/**
 * Receipt verification result
 */
export interface ReceiptVerificationResult {
  /** Whether the receipt is valid */
  ok: boolean;
  /** Reason for failure */
  reason?: string;
}

/**
 * Verify a signed factory receipt
 *
 * Checks:
 * 1. Receipt hash matches content
 * 2. Signature is valid (using keyring)
 */
export async function verifySignedFactoryReceipt(args: {
  signed: SignedFactoryReceipt;
  keyring: Keyring;
}): Promise<ReceiptVerificationResult> {
  const { signed, keyring } = args;

  try {
    // 1. Verify receipt hash
    const computedHash = await sha256CanonicalHex(signed.receipt);
    if (computedHash !== signed.receiptHashHex) {
      return {
        ok: false,
        reason: `Receipt hash mismatch: expected ${signed.receiptHashHex}, got ${computedHash}`,
      };
    }

    // 2. Verify signature (if key ID is provided)
    if (signed.keyId) {
      const hasKey = await keyring.hasKey(signed.keyId);
      if (hasKey) {
        const valid = await keyring.verifySignature({
          message: signed.receiptHashHex,
          signatureHex: signed.signatureHex,
          keyId: signed.keyId,
        });

        if (!valid) {
          return { ok: false, reason: 'Receipt signature verification failed' };
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: `Receipt verification error: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }
}

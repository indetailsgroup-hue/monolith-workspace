/**
 * verifyReceiptSig.ts - P13.1 Receipt Signature Verification
 *
 * Verifies Ed25519 signatures on export receipts using pinned public keys.
 * Supports key rotation via keyId lookup.
 *
 * @version 0.13.1
 */

import { verify, createPublicKey } from 'crypto';
import { getPinnedPublicKey, isKeyValid } from './receiptKeyStore.js';
import type { ExportReceipt } from '../export/exportReceiptTypes.js';

// ============================================================================
// Types
// ============================================================================

export interface ReceiptVerifyResult {
  ok: boolean;
  /** Verification passed */
  verified: boolean;
  /** Key ID used for verification */
  keyId?: string;
  /** Error code if verification failed */
  error?: ReceiptVerifyError;
  /** Human-readable message */
  message: string;
}

export type ReceiptVerifyError =
  | 'NO_SIGNATURE'
  | 'UNSIGNED'
  | 'UNKNOWN_KEY'
  | 'KEY_REVOKED'
  | 'KEY_EXPIRED'
  | 'INVALID_SIGNATURE'
  | 'VERIFY_ERROR';

// ============================================================================
// Canonical Serialization
// ============================================================================

/**
 * Recursively sort object keys for deterministic JSON.
 * Must match the stableStringify in signReceipt.ts exactly.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => stableStringify(item));
    return '[' + items.join(',') + ']';
  }

  const keys = Object.keys(obj as object).sort();
  const pairs = keys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + stableStringify(value);
  });
  return '{' + pairs.join(',') + '}';
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify a receipt's Ed25519 signature.
 *
 * @param receipt - The receipt to verify
 * @param options - Verification options
 * @returns Verification result
 */
export function verifyReceiptSignature(
  receipt: ExportReceipt,
  options?: {
    /** Date to check key validity against (default: now) */
    asOfDate?: Date;
    /** Allow unsigned receipts (alg: 'none') */
    allowUnsigned?: boolean;
  }
): ReceiptVerifyResult {
  const { asOfDate, allowUnsigned = false } = options || {};

  // Check signature exists
  if (!receipt.signature) {
    return {
      ok: false,
      verified: false,
      error: 'NO_SIGNATURE',
      message: 'Receipt has no signature field',
    };
  }

  // Handle unsigned receipts
  if (receipt.signature.alg === 'none') {
    if (allowUnsigned) {
      return {
        ok: true,
        verified: false,
        message: 'Receipt is unsigned (alg: none)',
      };
    }
    return {
      ok: false,
      verified: false,
      error: 'UNSIGNED',
      message: 'Receipt is unsigned and unsigned receipts are not allowed',
    };
  }

  // Must be ed25519 from here
  if (receipt.signature.alg !== 'ed25519') {
    return {
      ok: false,
      verified: false,
      error: 'VERIFY_ERROR',
      message: `Unsupported signature algorithm: ${receipt.signature.alg}`,
    };
  }

  const { keyId, sig } = receipt.signature;

  if (!keyId || !sig) {
    return {
      ok: false,
      verified: false,
      error: 'INVALID_SIGNATURE',
      message: 'Signature missing keyId or sig field',
    };
  }

  // Look up pinned public key
  const pinnedKey = getPinnedPublicKey(keyId);
  if (!pinnedKey) {
    return {
      ok: false,
      verified: false,
      keyId,
      error: 'UNKNOWN_KEY',
      message: `Unknown signing key: ${keyId}`,
    };
  }

  // Check key validity
  if (!isKeyValid(keyId, asOfDate)) {
    if (pinnedKey.revoked) {
      return {
        ok: false,
        verified: false,
        keyId,
        error: 'KEY_REVOKED',
        message: `Signing key ${keyId} has been revoked: ${pinnedKey.revokedReason || 'no reason given'}`,
      };
    }
    return {
      ok: false,
      verified: false,
      keyId,
      error: 'KEY_EXPIRED',
      message: `Signing key ${keyId} is not valid for the given date`,
    };
  }

  // Reconstruct public key
  let publicKey;
  try {
    const publicKeyBuffer = Buffer.from(pinnedKey.publicKeyBase64, 'base64');
    publicKey = createPublicKey({
      key: publicKeyBuffer,
      format: 'der',
      type: 'spki',
    });
  } catch (err) {
    return {
      ok: false,
      verified: false,
      keyId,
      error: 'VERIFY_ERROR',
      message: `Failed to reconstruct public key: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  // Build canonical payload (receipt without signature)
  const { signature, ...signablePayload } = receipt;
  const canonical = stableStringify(signablePayload);
  const canonicalBuffer = Buffer.from(canonical, 'utf-8');

  // Decode signature
  const signatureBuffer = Buffer.from(sig, 'base64');

  // Verify
  try {
    const isValid = verify(null, canonicalBuffer, publicKey, signatureBuffer);

    if (isValid) {
      return {
        ok: true,
        verified: true,
        keyId,
        message: `Signature verified with key ${keyId}`,
      };
    } else {
      return {
        ok: false,
        verified: false,
        keyId,
        error: 'INVALID_SIGNATURE',
        message: 'Signature verification failed',
      };
    }
  } catch (err) {
    return {
      ok: false,
      verified: false,
      keyId,
      error: 'VERIFY_ERROR',
      message: `Verification error: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/**
 * Quick check if a receipt has a valid signature structure.
 * Does not verify the signature cryptographically.
 */
export function hasValidSignatureStructure(receipt: ExportReceipt): boolean {
  if (!receipt.signature) return false;
  if (receipt.signature.alg === 'none') return true;
  if (receipt.signature.alg === 'ed25519') {
    return !!(receipt.signature.keyId && receipt.signature.sig);
  }
  return false;
}

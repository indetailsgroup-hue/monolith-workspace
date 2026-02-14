/**
 * signReceipt.ts - P13.1 Receipt Signing
 *
 * Signs export receipts with Ed25519 using the server's signing key.
 * The signature covers the canonical JSON representation of the receipt
 * (excluding the signature field itself).
 *
 * @version 0.13.1
 */

import { sign } from 'crypto';
import { getSigningKey, isSigningAvailable } from './receiptKeyStore.js';
import type { ExportReceipt, ExportReceiptSignature } from '../export/exportReceiptTypes.js';

// ============================================================================
// Canonical Serialization
// ============================================================================

/**
 * Recursively sort object keys for deterministic JSON.
 * Must match the stableStringify in exportReceipt.ts exactly.
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
// Signing
// ============================================================================

/**
 * Sign a receipt with Ed25519.
 *
 * The signed payload is the canonical JSON of the receipt WITHOUT the signature field.
 * This ensures the signature can be verified by recomputing the canonical form.
 *
 * @param receipt - The receipt to sign (signature field will be updated)
 * @returns The signed receipt with populated signature field
 */
export function signReceipt(receipt: ExportReceipt): ExportReceipt {
  if (!isSigningAvailable()) {
    // No signing key - return receipt with alg: 'none'
    return {
      ...receipt,
      signature: { alg: 'none' },
    };
  }

  const signingKey = getSigningKey()!;

  // Build the signable payload (receipt without signature)
  const { signature, ...signablePayload } = receipt;
  const canonical = stableStringify(signablePayload);
  const canonicalBuffer = Buffer.from(canonical, 'utf-8');

  // Sign with Ed25519
  const signatureBuffer = sign(null, canonicalBuffer, signingKey.privateKey);
  const signatureBase64 = signatureBuffer.toString('base64');

  // Build signature envelope
  const signatureEnvelope: ExportReceiptSignature = {
    alg: 'ed25519',
    keyId: signingKey.keyId,
    sig: signatureBase64,
  };

  return {
    ...receipt,
    signature: signatureEnvelope,
  };
}

/**
 * Check if signing is available.
 */
export { isSigningAvailable };

/**
 * Get the canonical payload that was/will be signed.
 * Useful for debugging and verification.
 */
export function getSignablePayload(receipt: ExportReceipt): string {
  const { signature, ...signablePayload } = receipt;
  return stableStringify(signablePayload);
}

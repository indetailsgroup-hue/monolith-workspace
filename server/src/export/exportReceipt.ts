/**
 * exportReceipt.ts - P13/P13.1 Export Receipt Builder
 *
 * Builds a deterministic, canonicalized receipt for export artifacts.
 * The receiptId is a SHA-256 hash of the canonical payload (excluding receiptId itself).
 * P13.1 adds Ed25519 signing support.
 *
 * @version 0.13.1
 */

import { createHash } from 'crypto';
import type { ExportReceipt, BuildReceiptInput } from './exportReceiptTypes.js';
import { RECEIPT_VERSION } from './exportReceiptTypes.js';
import { signReceipt, isSigningAvailable } from '../crypto/signReceipt.js';

// ============================================================================
// Deterministic JSON Serialization
// ============================================================================

/**
 * Recursively sort object keys and stringify to produce deterministic JSON.
 * This ensures the same input always produces the same output.
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

  // Object: sort keys alphabetically
  const keys = Object.keys(obj as object).sort();
  const pairs = keys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + stableStringify(value);
  });
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 hash of a string and return as hex.
 */
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

// ============================================================================
// Receipt Builder
// ============================================================================

/**
 * Build an export receipt with deterministic receiptId.
 *
 * The receiptId is computed from the canonical representation of the receipt
 * WITHOUT the receiptId field itself (to avoid circular dependency).
 *
 * @param input - Receipt input parameters
 * @returns Complete ExportReceipt with computed receiptId
 */
export function buildExportReceipt(input: BuildReceiptInput): ExportReceipt {
  const generatedAt = new Date().toISOString();

  // Build base receipt WITHOUT receiptId (for canonical hash)
  const baseReceipt = {
    version: RECEIPT_VERSION,
    jobId: input.jobId,
    contentSha256: input.contentSha256,
    export: input.export,
    proof: input.proof,
    generatedAt,
    signature: { alg: 'none' as const },
  };

  // Compute receiptId from canonical representation.
  // EXCLUDE the signature field: the signature is applied AFTER the receiptId
  // (see signReceipt), so it must not be part of the canonical id content —
  // otherwise a signed receipt's id never matches on verification.
  const { signature: _sigForId, ...idBase } = baseReceipt;
  const canonical = stableStringify(idBase);
  const receiptId = sha256Hex(canonical);

  // Return complete receipt
  return {
    ...baseReceipt,
    receiptId,
  };
}

/**
 * Serialize receipt to pretty-printed JSON with trailing newline.
 * Uses standard JSON.stringify (not stableStringify) for readability.
 */
export function serializeReceipt(receipt: ExportReceipt): string {
  return JSON.stringify(receipt, null, 2) + '\n';
}

/**
 * Verify a receipt's receiptId matches its canonical content.
 */
export function verifyReceiptId(receipt: ExportReceipt): boolean {
  // Reconstruct base without receiptId AND without signature.
  // The signature is applied after the receiptId is computed (see signReceipt),
  // so it is excluded from the canonical id content on both build and verify.
  const { receiptId, signature: _sigForId, ...base } = receipt;

  // Compute expected receiptId
  const canonical = stableStringify(base);
  const expectedId = sha256Hex(canonical);

  return receiptId === expectedId;
}

// ============================================================================
// P13.1 Signed Receipt Builder
// ============================================================================

/**
 * Build and sign an export receipt.
 *
 * If signing keys are available, the receipt will be signed with Ed25519.
 * Otherwise, it will be created with alg: 'none'.
 *
 * @param input - Receipt input parameters
 * @returns Signed ExportReceipt
 */
export function buildSignedReceipt(input: BuildReceiptInput): ExportReceipt {
  // Build unsigned receipt first
  const unsignedReceipt = buildExportReceipt(input);

  // Sign if available
  if (isSigningAvailable()) {
    return signReceipt(unsignedReceipt);
  }

  return unsignedReceipt;
}

/**
 * Add zipSha256 to an existing receipt.
 * Called after the final ZIP is created to record the full ZIP hash.
 */
export function addZipHash(receipt: ExportReceipt, zipSha256: string): ExportReceipt {
  return {
    ...receipt,
    zipSha256,
  };
}

/**
 * Check if receipt signing is available.
 */
export { isSigningAvailable };

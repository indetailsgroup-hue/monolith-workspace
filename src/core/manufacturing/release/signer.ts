/**
 * Release Signer - Mock Signing for MVP
 *
 * Mock signing contract that can be swapped for Ed25519/WebCrypto later.
 * Uses FNV-1a hash for development; replace with crypto.subtle for production.
 *
 * v1.0: Initial mock signer
 */

import type { ApprovalSignature, ApprovalRole } from './types';

/**
 * FNV-1a hash (fast, non-cryptographic).
 * Good for development; replace with SHA-256 for production.
 */
export function fnv1aHash(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Get current ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Mock sign a payload.
 * Returns signature = hash(keyId + timestamp + payload).
 */
export function signPayloadMock(input: {
  payload: string;
  keyId: string;
}): { signature: string; signedAtIso: string } {
  const signedAtIso = nowIso();
  const toSign = `${input.keyId}::${signedAtIso}::${input.payload}`;
  const signature = fnv1aHash(toSign);

  return { signature, signedAtIso };
}

/**
 * Create an approval signature.
 */
export function createApprovalSignature(input: {
  approverId: string;
  role: ApprovalRole;
  message: string;
  keyId: string;
}): ApprovalSignature {
  const payload = JSON.stringify({
    approverId: input.approverId,
    role: input.role,
    message: input.message,
    timestamp: nowIso(),
  });

  const { signature, signedAtIso } = signPayloadMock({
    payload,
    keyId: input.keyId,
  });

  return {
    approverId: input.approverId,
    role: input.role,
    message: input.message,
    signedAtIso,
    signature,
    keyId: input.keyId,
  };
}

/**
 * Verify an approval signature (mock).
 * In production, would verify against stored public key.
 */
export function verifyApprovalSignature(
  approval: ApprovalSignature
): { valid: boolean; reason?: string } {
  // Mock verification: check signature format
  if (!approval.signature || approval.signature.length < 8) {
    return { valid: false, reason: 'Invalid signature format' };
  }

  if (!approval.approverId) {
    return { valid: false, reason: 'Missing approver ID' };
  }

  if (!approval.signedAtIso) {
    return { valid: false, reason: 'Missing signature timestamp' };
  }

  // MVP: accept all well-formed signatures
  return { valid: true };
}

/**
 * Sign manifest content.
 */
export function signManifest(input: {
  manifestJson: string;
  keyId: string;
}): { alg: string; keyId: string; signedAtIso: string; signature: string } {
  const { signature, signedAtIso } = signPayloadMock({
    payload: input.manifestJson,
    keyId: input.keyId,
  });

  return {
    alg: 'MOCK-FNV1A',
    keyId: input.keyId,
    signedAtIso,
    signature,
  };
}

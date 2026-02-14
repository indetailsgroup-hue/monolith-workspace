/**
 * Key Trust Policy
 *
 * Policy rules for signing and verification with Ed25519 keys.
 * Factory safety: Only TRUSTED + ACTIVE keys can sign/verify factory exports.
 */

import type { PublicKeyRecord } from './types';

/**
 * Key trust policy configuration
 */
export type KeyPolicy = {
  /** Require ACTIVE key status for signing (recommended: true) */
  requireActiveKeyForSigning: boolean;
  /** Require TRUSTED trust status for verification (recommended: true for factory) */
  requireTrustedKeyForVerify: boolean;
  /** Allow verification with REVOKED keys (recommended: false for factory) */
  allowVerifyWithRevokedKey: boolean;
  /** Allow verification with EXPIRED keys (recommended: false) */
  allowVerifyWithExpiredKey: boolean;
};

/**
 * Default factory-safe key policy
 *
 * - Only ACTIVE keys can sign
 * - Only TRUSTED keys can verify (multi-machine trust workflow)
 * - Revoked keys cannot verify (prevents use of compromised keys)
 * - Expired keys cannot verify
 */
export const DEFAULT_KEY_POLICY: KeyPolicy = {
  requireActiveKeyForSigning: true,
  requireTrustedKeyForVerify: true,
  allowVerifyWithRevokedKey: false,
  allowVerifyWithExpiredKey: false,
};

/**
 * Check if key is expired based on expiresAtIso
 */
export function isExpired(k: PublicKeyRecord, nowIso: string): boolean {
  if (!k.expiresAtIso) return false;
  return k.expiresAtIso < nowIso;
}

/**
 * Check if key is currently active (ACTIVE status and not expired)
 */
export function isActiveNow(k: PublicKeyRecord, nowIso: string): boolean {
  if (k.status !== 'ACTIVE') return false;
  if (isExpired(k, nowIso)) return false;
  return true;
}

/**
 * Check if key is trusted on this machine
 */
export function isTrusted(k: PublicKeyRecord): boolean {
  return k.trust === 'TRUSTED';
}

/**
 * Check if key is quarantined (pending approval)
 */
export function isQuarantined(k: PublicKeyRecord): boolean {
  return k.trust === 'QUARANTINED';
}

/**
 * Check if key is rejected
 */
export function isRejected(k: PublicKeyRecord): boolean {
  return k.trust === 'REJECTED';
}

/**
 * Check if key can be used for signing according to policy
 *
 * Signing requires:
 * - Key must be TRUSTED (locally generated or explicitly trusted)
 * - Key must be ACTIVE (if requireActiveKeyForSigning)
 */
export function canSign(
  k: PublicKeyRecord,
  nowIso: string,
  policy: KeyPolicy = DEFAULT_KEY_POLICY
): boolean {
  // Must be trusted
  if (!isTrusted(k)) {
    return false;
  }

  if (policy.requireActiveKeyForSigning) {
    return isActiveNow(k, nowIso);
  }

  // If not requiring active, at least don't allow revoked
  return k.status !== 'REVOKED';
}

/**
 * Check if key can be used for verification according to policy
 *
 * Verification requires:
 * - Key must be TRUSTED (if requireTrustedKeyForVerify)
 * - Key must not be REVOKED (unless allowVerifyWithRevokedKey)
 * - Key must not be EXPIRED (unless allowVerifyWithExpiredKey)
 */
export function canVerify(
  k: PublicKeyRecord,
  nowIso: string,
  policy: KeyPolicy = DEFAULT_KEY_POLICY
): boolean {
  // Check trust status
  if (policy.requireTrustedKeyForVerify && !isTrusted(k)) {
    return false;
  }

  // Check revoked
  if (k.status === 'REVOKED' && !policy.allowVerifyWithRevokedKey) {
    return false;
  }

  // Check expired
  if (isExpired(k, nowIso) && !policy.allowVerifyWithExpiredKey) {
    return false;
  }

  // Must be ACTIVE for strict factory verification
  if (!policy.allowVerifyWithRevokedKey && !policy.allowVerifyWithExpiredKey) {
    return isActiveNow(k, nowIso);
  }

  return true;
}

/**
 * Get human-readable reason why key cannot be used
 */
export function getKeyStatusReason(k: PublicKeyRecord, nowIso: string): string {
  // Trust issues
  if (k.trust === 'QUARANTINED') {
    return 'Key is QUARANTINED and pending approval';
  }
  if (k.trust === 'REJECTED') {
    return 'Key was REJECTED and cannot be used';
  }

  // Status issues
  if (k.status === 'REVOKED') {
    return `Key was revoked${k.revokedAtIso ? ` on ${k.revokedAtIso}` : ''}${k.revokedReason ? `: ${k.revokedReason}` : ''}`;
  }
  if (isExpired(k, nowIso)) {
    return `Key expired on ${k.expiresAtIso}`;
  }

  // Valid
  if (k.status === 'ACTIVE' && k.trust === 'TRUSTED') {
    return 'Key is TRUSTED and ACTIVE';
  }

  return `Key status: ${k.status}, trust: ${k.trust}`;
}

/**
 * Get trust status color for UI
 */
export function getTrustColor(trust: string): string {
  switch (trust) {
    case 'TRUSTED':
      return '#22c55e'; // green
    case 'QUARANTINED':
      return '#f59e0b'; // amber
    case 'REJECTED':
      return '#ef4444'; // red
    default:
      return '#6b7280'; // gray
  }
}

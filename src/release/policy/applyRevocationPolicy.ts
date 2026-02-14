/**
 * Apply Revocation Policy (v0.7)
 *
 * Check if keys are revoked by a signed revocation policy.
 * Used during artifact verification to reject revoked signing keys.
 */

import type { RevocationRule, SignedRevocationPolicy } from './revocationPolicyTypes';

/**
 * Result of a revocation check.
 */
export interface RevocationCheckResult {
  revoked: boolean;
  reason?: string;
}

/**
 * Check if a key is revoked by the given policy.
 *
 * A key is considered revoked if:
 * - The policy contains a rule for the key ID
 * - The asOfIso (manifest creation time) is at or after revokedAtIso
 *
 * @param policy - Signed revocation policy
 * @param keyId - Key ID to check
 * @param asOfIso - Timestamp to check against (e.g., manifest creation time)
 */
export function isKeyRevokedByPolicy(
  policy: SignedRevocationPolicy,
  keyId: string,
  asOfIso?: string
): RevocationCheckResult {
  const rule = policy.rules.find((r) => r.keyId === keyId);
  if (!rule) {
    return { revoked: false };
  }

  // If no asOfIso provided, the key is revoked regardless
  if (!asOfIso) {
    return { revoked: true, reason: `Key revoked: ${rule.reason}` };
  }

  // Check if manifest was created at or after revocation time
  if (asOfIso >= rule.revokedAtIso) {
    return {
      revoked: true,
      reason: `Key revoked at ${rule.revokedAtIso}: ${rule.reason}`,
    };
  }

  return { revoked: false };
}

/**
 * Get all revoked key IDs from policy.
 */
export function getRevokedKeyIds(policy: SignedRevocationPolicy): string[] {
  return policy.rules.map((r) => r.keyId);
}

/**
 * Get revocation rule for a specific key.
 */
export function getRevocationRuleFromPolicy(
  keyId: string,
  policy: SignedRevocationPolicy
): RevocationRule | null {
  return policy.rules.find((r) => r.keyId === keyId) ?? null;
}

/**
 * Check if policy has any revocation rules.
 */
export function hasRevocationRules(policy: SignedRevocationPolicy): boolean {
  return policy.rules.length > 0;
}

/**
 * Validate policy internal consistency.
 */
export function validatePolicyConsistency(policy: SignedRevocationPolicy): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (policy.policyType !== 'revocation-policy') {
    errors.push(`Invalid policyType: ${policy.policyType}`);
  }

  if (!policy.rules || !Array.isArray(policy.rules)) {
    errors.push('Missing or invalid rules array.');
  } else {
    const keyIds = new Set<string>();
    for (const rule of policy.rules) {
      if (!rule.keyId) errors.push('Rule missing keyId.');
      if (!rule.revokedAtIso) errors.push(`Rule ${rule.keyId}: missing revokedAtIso.`);
      if (keyIds.has(rule.keyId)) errors.push(`Duplicate keyId: ${rule.keyId}`);
      keyIds.add(rule.keyId);
    }
  }

  if (!policy.signature) {
    errors.push('Missing signature.');
  }

  return { valid: errors.length === 0, errors };
}

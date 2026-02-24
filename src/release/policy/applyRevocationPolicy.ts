/**
 * Apply Revocation Policy (v0.7)
 *
 * Helper functions to check if a key is revoked according to policy rules.
 * Used during bundle verification to enforce time-based revocation.
 *
 * Key Concept:
 * - If manifest was created AFTER a key's revocation time → blocked
 * - If manifest was created BEFORE revocation time → allowed
 * - This enables retroactive-safe revocation (old manifests remain valid)
 */

import type { SignedRevocationPolicy, RevocationRule } from './revocationPolicyTypes';

/**
 * Result of revocation check
 */
export type RevocationCheckResult = {
  /** Whether the key is revoked for the given timestamp */
  revoked: boolean;
  /** The matching revocation rule (if any) */
  rule?: RevocationRule;
  /** Human-readable reason */
  reason?: string;
};

/**
 * Check if a key is revoked by policy for a specific manifest creation time
 *
 * @param policy - Signed revocation policy
 * @param keyId - Key ID to check
 * @param manifestCreatedAtIso - When the manifest was created (ISO timestamp)
 * @returns Revocation check result
 */
export function isKeyRevokedByPolicy(
  policy: SignedRevocationPolicy,
  keyId: string,
  manifestCreatedAtIso: string
): RevocationCheckResult {
  const rule = policy.rules.find((r) => r.keyId === keyId);

  if (!rule) {
    return { revoked: false };
  }

  // If manifest was created at or after revocation time, it's revoked
  if (manifestCreatedAtIso >= rule.revokedAtIso) {
    return {
      revoked: true,
      rule,
      reason: `Key "${keyId}" was revoked at ${rule.revokedAtIso}. Manifest created at ${manifestCreatedAtIso} is after revocation time. Reason: ${rule.reason}`,
    };
  }

  // Manifest was created before revocation - still valid
  return {
    revoked: false,
    rule,
    reason: `Key has revocation rule but manifest was created before revocation time.`,
  };
}

/**
 * Get all revoked keys from policy
 *
 * @param policy - Signed revocation policy
 * @returns List of revoked key IDs
 */
export function getRevokedKeyIds(policy: SignedRevocationPolicy): string[] {
  return policy.rules.map((r) => r.keyId);
}

/**
 * Get revocation rule for a specific key
 *
 * @param policy - Signed revocation policy
 * @param keyId - Key ID to look up
 * @returns Revocation rule or null
 */
export function getRevocationRuleFromPolicy(
  policy: SignedRevocationPolicy,
  keyId: string
): RevocationRule | null {
  return policy.rules.find((r) => r.keyId === keyId) ?? null;
}

/**
 * Check if policy has any revocation rules
 *
 * @param policy - Signed revocation policy
 * @returns True if policy has rules
 */
export function hasRevocationRules(policy: SignedRevocationPolicy): boolean {
  return policy.rules.length > 0;
}

/**
 * Validate policy consistency
 *
 * Checks for issues like:
 * - Duplicate key entries
 * - Invalid timestamps
 *
 * @param policy - Signed revocation policy
 * @returns Validation issues (empty if valid)
 */
export function validatePolicyConsistency(
  policy: SignedRevocationPolicy
): string[] {
  const issues: string[] = [];

  // Check for duplicate keys
  const keyIds = policy.rules.map((r) => r.keyId);
  const uniqueKeyIds = new Set(keyIds);
  if (keyIds.length !== uniqueKeyIds.size) {
    issues.push('Policy contains duplicate key entries.');
  }

  // Check timestamp format
  for (const rule of policy.rules) {
    const date = new Date(rule.revokedAtIso);
    if (isNaN(date.getTime())) {
      issues.push(`Invalid revocation timestamp for key ${rule.keyId}: ${rule.revokedAtIso}`);
    }
  }

  return issues;
}

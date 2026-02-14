/**
 * Revocation Policy
 *
 * Defines which keys are revoked and effective revocation times.
 * Used for offline-friendly revocation propagation.
 *
 * If a manifest was created AFTER a key's revocation time,
 * verification will fail even if the signature is valid.
 *
 * This enables:
 * - Factory devices to enforce revocation without constant server connection
 * - Time-based revocation (block releases signed after compromise date)
 */

const LS_REVOKE_POLICY = 'monolith.keys.revocationPolicy.v1';

/**
 * A single revocation rule
 */
export type RevocationRule = {
  /** Key ID being revoked */
  keyId: string;
  /** Effective revocation time (ISO) */
  revokedAtIso: string;
  /** Reason for revocation */
  reason: string;
  /** Who set this rule */
  setBy: string;
  /** When this rule was set (ISO) */
  setAtIso: string;
};

/**
 * Full revocation policy
 */
export type RevocationPolicy = {
  /** Policy version */
  version: string;
  /** Last update time (ISO) */
  updatedAtIso: string;
  /** Revocation rules */
  rules: RevocationRule[];
};

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Load revocation policy from storage
 */
function load(): RevocationPolicy {
  const raw = localStorage.getItem(LS_REVOKE_POLICY);
  if (!raw) {
    return {
      version: 'revpol-0.1',
      updatedAtIso: nowIso(),
      rules: [],
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.rules || !Array.isArray(parsed.rules)) {
      throw new Error('Invalid policy format');
    }
    return parsed as RevocationPolicy;
  } catch {
    return {
      version: 'revpol-0.1',
      updatedAtIso: nowIso(),
      rules: [],
    };
  }
}

/**
 * Save revocation policy to storage
 */
function save(policy: RevocationPolicy): void {
  localStorage.setItem(LS_REVOKE_POLICY, JSON.stringify(policy, null, 2));
}

/**
 * Get current revocation policy
 */
export function getRevocationPolicy(): RevocationPolicy {
  return load();
}

/**
 * Set or update a revocation rule
 *
 * @param rule - Revocation rule to set
 */
export function setRevocationRule(rule: Omit<RevocationRule, 'setAtIso'>): void {
  const policy = load();

  // Remove existing rule for this keyId if any
  const filteredRules = policy.rules.filter((r) => r.keyId !== rule.keyId);

  // Add new rule with timestamp
  const newRule: RevocationRule = {
    ...rule,
    setAtIso: nowIso(),
  };

  const nextPolicy: RevocationPolicy = {
    ...policy,
    updatedAtIso: nowIso(),
    rules: [...filteredRules, newRule],
  };

  save(nextPolicy);
}

/**
 * Clear a revocation rule
 *
 * @param keyId - Key ID to clear revocation for
 */
export function clearRevocationRule(keyId: string): void {
  const policy = load();
  const nextPolicy: RevocationPolicy = {
    ...policy,
    updatedAtIso: nowIso(),
    rules: policy.rules.filter((r) => r.keyId !== keyId),
  };
  save(nextPolicy);
}

/**
 * Get revocation rule for a specific key
 *
 * @param keyId - Key ID to look up
 * @returns Revocation rule or null
 */
export function getRevocationRule(keyId: string): RevocationRule | null {
  const policy = load();
  return policy.rules.find((r) => r.keyId === keyId) ?? null;
}

/**
 * Check if a key is revoked for a manifest created at a specific time
 *
 * @param keyId - Key ID to check
 * @param manifestCreatedAtIso - When the manifest was created
 * @returns Revocation status and rule
 */
export function isKeyRevokedForManifest(
  keyId: string,
  manifestCreatedAtIso: string
): { revoked: boolean; rule?: RevocationRule; reason?: string } {
  const policy = load();
  const rule = policy.rules.find((r) => r.keyId === keyId);

  if (!rule) {
    return { revoked: false };
  }

  // If manifest was created at or after revocation time, it's revoked
  if (manifestCreatedAtIso >= rule.revokedAtIso) {
    return {
      revoked: true,
      rule,
      reason: `Key was revoked at ${rule.revokedAtIso}. Manifest created at ${manifestCreatedAtIso} is after revocation time.`,
    };
  }

  // Manifest was created before revocation - still valid
  return {
    revoked: false,
    rule,
  };
}

/**
 * Check if a key has any revocation rule (regardless of time)
 *
 * @param keyId - Key ID to check
 * @returns True if key has a revocation rule
 */
export function hasRevocationRule(keyId: string): boolean {
  return getRevocationRule(keyId) !== null;
}

/**
 * List all revocation rules
 */
export function listRevocationRules(): RevocationRule[] {
  return load().rules;
}

/**
 * Clear all revocation rules (use with caution)
 */
export function clearAllRevocationRules(): void {
  localStorage.removeItem(LS_REVOKE_POLICY);
}

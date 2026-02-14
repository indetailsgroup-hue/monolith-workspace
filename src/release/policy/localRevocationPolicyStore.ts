/**
 * Local Revocation Policy Store (v0.7)
 *
 * In-memory + localStorage store for editing revocation rules
 * before exporting as a signed artifact.
 *
 * Uses localStorage with 'iimos.policy.local.' prefix.
 */

import type { RevocationRule } from './revocationPolicyTypes';

const LS_KEY = 'iimos.policy.local.v1';

/**
 * Local policy state (editable, unsigned).
 */
export interface LocalRevocationPolicy {
  scope: 'ORG' | 'FACTORY';
  scopeId?: string;
  rules: RevocationRule[];
  updatedBy: string;
  updatedAtIso: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultPolicy(): LocalRevocationPolicy {
  return {
    scope: 'ORG',
    rules: [],
    updatedBy: 'system',
    updatedAtIso: nowIso(),
  };
}

function load(): LocalRevocationPolicy {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultPolicy();
    return JSON.parse(raw) as LocalRevocationPolicy;
  } catch {
    return defaultPolicy();
  }
}

function save(policy: LocalRevocationPolicy): void {
  localStorage.setItem(LS_KEY, JSON.stringify(policy, null, 2));
}

/**
 * Get current local revocation policy.
 */
export function getLocalRevocationPolicy(): LocalRevocationPolicy {
  return load();
}

/**
 * Set policy scope.
 */
export function setLocalPolicyScope(scope: 'ORG' | 'FACTORY', scopeId?: string): void {
  const policy = load();
  policy.scope = scope;
  policy.scopeId = scopeId;
  policy.updatedAtIso = nowIso();
  save(policy);
}

/**
 * Add or update a revocation rule.
 */
export function upsertLocalRevocationRule(input: {
  keyId: string;
  revokedAtIso: string;
  reason: string;
  by: string;
}): void {
  const policy = load();
  const existing = policy.rules.findIndex((r) => r.keyId === input.keyId);
  const rule: RevocationRule = {
    keyId: input.keyId,
    revokedAtIso: input.revokedAtIso,
    reason: input.reason,
    by: input.by,
  };

  if (existing >= 0) {
    policy.rules[existing] = rule;
  } else {
    policy.rules.push(rule);
  }

  policy.updatedBy = input.by;
  policy.updatedAtIso = nowIso();
  save(policy);
}

/**
 * Remove a revocation rule by key ID.
 */
export function removeLocalRevocationRule(keyId: string, _by: string): void {
  const policy = load();
  policy.rules = policy.rules.filter((r) => r.keyId !== keyId);
  policy.updatedAtIso = nowIso();
  save(policy);
}

/**
 * Clear all local rules.
 */
export function clearLocalRevocationRules(): void {
  const policy = load();
  policy.rules = [];
  policy.updatedAtIso = nowIso();
  save(policy);
}

/**
 * Clear entire local policy store.
 */
export function clearLocalRevocationPolicyStore(): void {
  localStorage.removeItem(LS_KEY);
}

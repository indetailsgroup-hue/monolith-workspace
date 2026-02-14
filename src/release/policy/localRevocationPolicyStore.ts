/**
 * Local Revocation Policy Store (v0.7)
 *
 * This is the "policy source" that admin edits locally.
 * When releasing, this gets "frozen" into an immutable signed artifact.
 *
 * Storage: localStorage (MVP) - production should use secure storage.
 *
 * G9 COMPLIANCE: Uses unsafeStorage boundary for localStorage access.
 */

import type { RevocationRule } from './revocationPolicyTypes';
import {
  readValidatedSafe,
  writeJson,
  remove,
} from '../../core/persistence/unsafeStorage';
import { z } from 'zod';

const LS_LOCAL_REV = 'monolith.local.revocation.rules.v1';

/**
 * Local (editable) revocation policy
 */
export type LocalRevocationPolicy = {
  /** Scope for the policy */
  scope: 'ORG' | 'FACTORY' | 'PROJECT';
  /** Scope ID (required for FACTORY scope) */
  scopeId?: string;
  /** Last update time (ISO) */
  updatedAtIso: string;
  /** Who updated */
  updatedBy: string;
  /** Revocation rules */
  rules: RevocationRule[];
};

/**
 * Zod schema for LocalRevocationPolicy validation
 */
const LocalRevocationPolicySchema = z.object({
  scope: z.enum(['ORG', 'FACTORY', 'PROJECT']),
  scopeId: z.string().optional(),
  updatedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
  updatedBy: z.string(),
  rules: z.array(z.object({
    keyId: z.string(),
    revokedAtIso: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'Invalid ISO timestamp' }),
    reason: z.string(),
  })),
});

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Default empty policy
 */
function defaultPolicy(): LocalRevocationPolicy {
  return {
    scope: 'ORG',
    updatedAtIso: nowIso(),
    updatedBy: 'local-admin',
    rules: [],
  };
}

/**
 * Load local policy from storage
 */
function load(): LocalRevocationPolicy {
  const result = readValidatedSafe(LS_LOCAL_REV, LocalRevocationPolicySchema);
  if (!result.ok) {
    return defaultPolicy();
  }
  return result.data;
}

/**
 * Save local policy to storage
 */
function save(p: LocalRevocationPolicy): void {
  writeJson(LS_LOCAL_REV, p);
}

/**
 * Get local revocation policy
 */
export function getLocalRevocationPolicy(): LocalRevocationPolicy {
  return load();
}

/**
 * Set local policy scope
 */
export function setLocalPolicyScope(
  scope: 'ORG' | 'FACTORY' | 'PROJECT',
  scopeId: string | undefined,
  by: string
): void {
  const p = load();
  save({
    ...p,
    scope,
    scopeId,
    updatedAtIso: nowIso(),
    updatedBy: by,
  });
}

/**
 * Add or update a revocation rule
 */
export function upsertLocalRevocationRule(input: {
  keyId: string;
  revokedAtIso: string;
  reason: string;
  by: string;
}): void {
  const p = load();
  const rules = p.rules
    .filter((r) => r.keyId !== input.keyId)
    .concat({
      keyId: input.keyId,
      revokedAtIso: input.revokedAtIso,
      reason: input.reason,
    });
  save({
    ...p,
    updatedAtIso: nowIso(),
    updatedBy: input.by,
    rules,
  });
}

/**
 * Remove a revocation rule
 */
export function removeLocalRevocationRule(keyId: string, by: string): void {
  const p = load();
  save({
    ...p,
    updatedAtIso: nowIso(),
    updatedBy: by,
    rules: p.rules.filter((r) => r.keyId !== keyId),
  });
}

/**
 * Clear all local revocation rules
 */
export function clearLocalRevocationRules(by: string): void {
  const p = load();
  save({
    ...p,
    updatedAtIso: nowIso(),
    updatedBy: by,
    rules: [],
  });
}

/**
 * Clear entire local policy store
 */
export function clearLocalRevocationPolicyStore(): void {
  remove(LS_LOCAL_REV);
}

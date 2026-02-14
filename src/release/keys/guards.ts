/**
 * Key Scope Guards
 *
 * Import and verification guards for scope enforcement.
 * Ensures factory devices only accept keys bound to their factoryId.
 *
 * Factory Safety:
 * - FACTORY mode requires FACTORY-scoped keys
 * - Key scopeId must match device factoryId
 * - Prevents cross-factory key misuse
 */

import type { ExportedPublicKeyJson } from './importExport';
import type { PublicKeyRecord } from './types';
import { DEFAULT_KEY_POLICY, isActiveNow, isTrusted } from './policy';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Guard decision result
 */
export type GuardDecision =
  | { ok: true }
  | { ok: false; reason: string; severity: 'HARD_REJECT' | 'QUARANTINE' };

/**
 * Guard for key import
 *
 * In FACTORY mode:
 * - Only accepts FACTORY-scoped keys
 * - Key scopeId must match this device's factoryId
 *
 * In DESIGNER mode:
 * - Accepts all scopes (no restrictions)
 *
 * @param payload - Parsed public key JSON to import
 * @returns Guard decision
 */
export function guardImportKey(payload: ExportedPublicKeyJson): GuardDecision {
  const mode = getRuntimeMode();

  // Designer mode: no restrictions
  if (mode !== 'FACTORY') {
    return { ok: true };
  }

  // Factory mode: strict scope enforcement
  const localFactoryId = getFactoryId();

  if (!localFactoryId) {
    return {
      ok: false,
      reason: 'This device is in FACTORY mode but factoryId is not configured. Configure device settings first.',
      severity: 'HARD_REJECT',
    };
  }

  // Factory mode only accepts FACTORY-scoped keys
  if (payload.scope !== 'FACTORY') {
    return {
      ok: false,
      reason: `Factory devices only accept FACTORY-scoped keys. This key has scope: ${payload.scope}`,
      severity: 'HARD_REJECT',
    };
  }

  // Key must be bound to this factory
  // Scope mismatch allows QUARANTINE for admin override
  const keyScopeId = payload.scopeId ?? '';
  if (keyScopeId !== localFactoryId) {
    return {
      ok: false,
      reason: `scopeId mismatch: key(${keyScopeId || 'none'}) vs device(${localFactoryId}). Admin override available.`,
      severity: 'QUARANTINE',
    };
  }

  return { ok: true };
}

/**
 * Guard for signature verification
 *
 * Checks:
 * 1. Key must be TRUSTED (if policy requires)
 * 2. Key must be ACTIVE and not expired
 * 3. In FACTORY mode: key must be FACTORY-scoped and bound to this factoryId
 *
 * @param record - Public key record from registry
 * @returns Guard decision
 */
export function guardVerifyKey(record: PublicKeyRecord): GuardDecision {
  const mode = getRuntimeMode();
  const now = nowIso();

  // Check trust policy
  if (DEFAULT_KEY_POLICY.requireTrustedKeyForVerify && !isTrusted(record)) {
    return {
      ok: false,
      reason: `Key is not TRUSTED (current trust: ${record.trust}).`,
      severity: 'HARD_REJECT',
    };
  }

  // Check active status
  if (!isActiveNow(record, now)) {
    return {
      ok: false,
      reason: `Key is not ACTIVE or has expired (status: ${record.status}).`,
      severity: 'HARD_REJECT',
    };
  }

  // Factory mode: strict scope enforcement
  if (mode === 'FACTORY') {
    const localFactoryId = getFactoryId();

    if (!localFactoryId) {
      return {
        ok: false,
        reason: 'This device is in FACTORY mode but factoryId is not configured.',
        severity: 'HARD_REJECT',
      };
    }

    // Factory verification requires FACTORY-scoped keys
    if (record.scope !== 'FACTORY') {
      return {
        ok: false,
        reason: `Factory verification requires FACTORY-scoped keys. This key has scope: ${record.scope}`,
        severity: 'HARD_REJECT',
      };
    }

    // Key must be bound to this factory
    // Scope mismatch allows QUARANTINE for admin override
    const keyScopeId = record.scopeId ?? '';
    if (keyScopeId !== localFactoryId) {
      return {
        ok: false,
        reason: `scopeId mismatch: key(${keyScopeId || 'none'}) vs device(${localFactoryId}). Admin override available.`,
        severity: 'QUARANTINE',
      };
    }
  }

  return { ok: true };
}

/**
 * Get human-readable guard rejection message
 */
export function formatGuardRejection(decision: GuardDecision): string {
  if (decision.ok) return '';
  const prefix = decision.severity === 'HARD_REJECT' ? 'BLOCKED' : 'QUARANTINED';
  return `${prefix}: ${decision.reason}`;
}

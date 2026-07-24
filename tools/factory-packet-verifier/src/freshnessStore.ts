/**
 * freshnessStore.ts - Persistent freshness state + sequence/staleness rules (design §11.3)
 *
 * The verifier "certifies status only within valid-as-of bundle sequence/issuedAt."
 * This module owns the persistent-state semantics (plan Task 10 Step 4):
 *
 *   - state keys are `${bundleType}:${trustScope}`
 *   - first use requires a pinned bootstrap-checkpoint minimum sequence
 *     (else TRUST_CHECKPOINT_REQUIRED)
 *   - a sequence below the pinned floor or below an already-accepted high-water
 *     mark is a TRUST_SEQUENCE_ROLLBACK
 *   - `maxOfflineStaleness` (and a bundle-age ceiling) are enforced against an
 *     explicit clock; a clock behind issuance or past the window is
 *     TRUST_FRESHNESS_UNPROVEN; expiry is TRUST_BUNDLE_EXPIRED
 *   - high-water marks advance ONLY after a full PASS
 *
 * Pure: the clock is always an explicit argument, never `Date.now()`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import {
  vok,
  verr,
  type VResult,
  type TenantScopeV1,
  type TrustBundleType,
  type VerifierPolicyV1,
  type VerifierStateV1,
} from './types.js';

/** State key for a (bundleType, trustScope). */
export function stateKey(bundleType: TrustBundleType, scope: TenantScopeV1): string {
  return `${bundleType}:${scope.tenantId}|${scope.orgId}|${scope.siteId}|${scope.policyVersion}`;
}

/** Parse an ISO-8601 instant to epoch ms, or null when it is not a valid instant. */
export function parseInstantMs(iso: unknown): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

interface BootstrapCheckpointDoc {
  trustScope: TenantScopeV1;
  minimumSequences?: Record<string, number>;
}

/**
 * Build an initial verifier state from a trusted bootstrap-checkpoint document
 * (`checkpoint.json`). The pinned minimum sequences become the first-use floor.
 */
export function bootstrapStateFromCheckpoint(doc: unknown): VerifierStateV1 {
  const d = doc as BootstrapCheckpointDoc;
  const bootstrapCheckpoint: Record<string, number> = {};
  const mins = d?.minimumSequences ?? {};
  for (const bt of ['TRUST', 'RELEASE_STATUS'] as TrustBundleType[]) {
    const min = mins[bt];
    if (typeof min === 'number' && Number.isFinite(min)) {
      bootstrapCheckpoint[stateKey(bt, d.trustScope)] = min;
    }
  }
  return { bootstrapCheckpoint, highWaterMarks: {} };
}

/** Expiry (hard) + staleness (freshness window), against an explicit clock. */
export function checkExpiryAndStaleness(params: {
  nowMs: number;
  issuedAtMs: number;
  expiresAtMs: number;
  maxOfflineStalenessSeconds: number;
  maxBundleAgeSeconds: number;
}): VResult<void> {
  const { nowMs, issuedAtMs, expiresAtMs, maxOfflineStalenessSeconds, maxBundleAgeSeconds } = params;
  if (nowMs > expiresAtMs) {
    return verr('TRUST_BUNDLE_EXPIRED', { now: String(nowMs), expiresAt: String(expiresAtMs) });
  }
  const ageSeconds = (nowMs - issuedAtMs) / 1000;
  if (ageSeconds < 0) {
    return verr('TRUST_FRESHNESS_UNPROVEN', { reason: 'clock is behind bundle issuance' });
  }
  if (ageSeconds > maxOfflineStalenessSeconds) {
    return verr('TRUST_FRESHNESS_UNPROVEN', { reason: 'offline staleness exceeded', ageSeconds: String(ageSeconds) });
  }
  if (ageSeconds > maxBundleAgeSeconds) {
    return verr('TRUST_FRESHNESS_UNPROVEN', { reason: 'bundle age exceeded', ageSeconds: String(ageSeconds) });
  }
  return vok(undefined);
}

/** First-use checkpoint requirement + rollback protection. */
export function checkSequence(params: {
  bundleType: TrustBundleType;
  scope: TenantScopeV1;
  sequence: number;
  policy: VerifierPolicyV1;
  state: VerifierStateV1;
}): VResult<void> {
  const { bundleType, scope, sequence, policy, state } = params;
  const key = stateKey(bundleType, scope);
  const hw = state.highWaterMarks[key];
  const cp = state.bootstrapCheckpoint[key];

  if (hw === undefined) {
    // First use of this (bundleType, scope): a pinned checkpoint floor is required.
    if (cp === undefined) {
      if (policy.archive.requireBootstrapCheckpoint) {
        return verr('TRUST_CHECKPOINT_REQUIRED', { key });
      }
      return vok(undefined);
    }
    if (sequence < cp) {
      return verr('TRUST_SEQUENCE_ROLLBACK', { key, sequence: String(sequence), floor: String(cp) });
    }
    return vok(undefined);
  }

  const floor = cp === undefined ? hw : Math.max(cp, hw);
  if (sequence < floor) {
    return verr('TRUST_SEQUENCE_ROLLBACK', { key, sequence: String(sequence), floor: String(floor) });
  }
  return vok(undefined);
}

/** Return a new state whose high-water marks are advanced (never lowered). */
export function advanceHighWater(
  state: VerifierStateV1,
  updates: ReadonlyArray<{ bundleType: TrustBundleType; scope: TenantScopeV1; sequence: number }>,
): VerifierStateV1 {
  const next: Record<string, number> = { ...state.highWaterMarks };
  for (const u of updates) {
    const key = stateKey(u.bundleType, u.scope);
    next[key] = Math.max(next[key] ?? Number.NEGATIVE_INFINITY, u.sequence);
  }
  return { bootstrapCheckpoint: state.bootstrapCheckpoint, highWaterMarks: next };
}

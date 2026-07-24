/**
 * metrics.ts — the approved trust/release metric + alert catalogue (design §18).
 *
 * Metrics and alerts cover authentication denials, SoD violations, stale candidates,
 * capability blockers, signer/store failures, VOID artifacts, verifier failures,
 * stale trust bundles, revoked-release access, and blocked-legacy-route attempts.
 * Each rule names the category it covers, the stable §13 reason codes that increment
 * it, its kind (counter/gauge), an alert threshold, and the accountable owner.
 *
 * `validateMetricRules` is the contract test surface: the catalogue must cover every
 * required category and every trigger code must be a stable §13 registry code.
 *
 * Phase: NOT_FOR_PRODUCTION. Declarative catalogue only; no I/O.
 */
import { isTrustReasonCode, type TrustReasonCode } from '../reasonCodes.js';
import { ACCOUNTABLE_OWNERS, type AccountableOwner } from './ownership.js';

/** The required security/release metric categories (design §18). */
export const REQUIRED_METRIC_CATEGORIES = [
  'AUTH_DENIALS',
  'SOD_VIOLATIONS',
  'STALE_CANDIDATES',
  'CAPABILITY_BLOCKERS',
  'SIGNER_STORE_FAILURES',
  'VOID_ARTIFACTS',
  'VERIFIER_FAILURES',
  'STALE_TRUST_BUNDLES',
  'REVOKED_RELEASE_ACCESS',
  'BLOCKED_LEGACY_ROUTE',
] as const;

export type MetricCategory = (typeof REQUIRED_METRIC_CATEGORIES)[number];

export interface MetricRule {
  id: string;
  category: MetricCategory;
  title: string;
  description: string;
  kind: 'counter' | 'gauge';
  triggerReasonCodes: readonly TrustReasonCode[];
  /** Alert when the rolling count/level crosses this threshold. */
  alertThreshold: number;
  owner: AccountableOwner;
}

/** The shipped catalogue — one or more rules per required category. */
export const TRUST_METRIC_RULES: readonly MetricRule[] = [
  {
    id: 'auth.denials',
    category: 'AUTH_DENIALS',
    title: 'Authentication / authorization denials',
    description: 'Denied JWT, anon, membership, scope, or action-context authority.',
    kind: 'counter',
    triggerReasonCodes: [
      'AUTH_REQUIRED',
      'AUTH_ANON_NOT_ALLOWED',
      'AUTH_MEMBERSHIP_REVOKED',
      'AUTH_SCOPE_DENIED',
      'AUTH_ACTION_CONTEXT_INVALID',
      'AUTH_ACTION_CONTEXT_EXPIRED',
    ],
    alertThreshold: 25,
    owner: 'Security/IAM',
  },
  {
    id: 'auth.sod',
    category: 'SOD_VIOLATIONS',
    title: 'Separation-of-duties violations',
    description: 'Same-identity freeze+approve, or approver reused as freeze actor.',
    kind: 'counter',
    triggerReasonCodes: ['AUTH_SOD_VIOLATION'],
    alertThreshold: 1,
    owner: 'Release Governance',
  },
  {
    id: 'state.staleCandidate',
    category: 'STALE_CANDIDATES',
    title: 'Stale candidate / authorization',
    description: 'Freeze/authorization no longer current at release time.',
    kind: 'counter',
    triggerReasonCodes: ['STATE_CANDIDATE_STALE', 'STATE_RELEASE_AUTHORIZATION_STALE'],
    alertThreshold: 10,
    owner: 'Release Governance',
  },
  {
    id: 'cap.blockers',
    category: 'CAPABILITY_BLOCKERS',
    title: 'Capability / hard-gate blockers',
    description: 'Hard blockers, unknown tools, unsupported ops, range or profile failures.',
    kind: 'counter',
    triggerReasonCodes: [
      'GATE_HARD_BLOCKER',
      'GATE_WARNING_EXCEPTION_EXPIRED',
      'GATE_WARNING_EXCEPTION_MISMATCH',
      'CAP_UNKNOWN_TOOL',
      'CAP_UNSUPPORTED_OPERATION',
      'CAP_PROFILE_MISMATCH',
      'CAP_PROFILE_ATTESTATION_INVALID',
      'CAP_PROFILE_ATTESTATION_EXPIRED',
      'CAP_PARAMETER_RANGE',
    ],
    alertThreshold: 15,
    owner: 'Manufacturing Engineering',
  },
  {
    id: 'store.signerFailures',
    category: 'SIGNER_STORE_FAILURES',
    title: 'Signer / quarantine-store failures',
    description: 'Managed signer unavailable, algorithm denied, or quarantine store failure.',
    kind: 'counter',
    triggerReasonCodes: [
      'CRYPTO_SIGNER_UNAVAILABLE',
      'CRYPTO_ALGORITHM_DENIED',
      'STORE_QUARANTINE_FAILED',
      'STORE_ARTIFACT_UNAVAILABLE',
    ],
    alertThreshold: 1,
    owner: 'Platform Engineering',
  },
  {
    id: 'artifact.void',
    category: 'VOID_ARTIFACTS',
    title: 'VOID attempts / artifacts',
    description: 'A release attempt or artifact voided after a post-write hash mismatch.',
    kind: 'counter',
    triggerReasonCodes: ['STORE_HASH_MISMATCH', 'PACKET_HASH_MISMATCH'],
    alertThreshold: 1,
    owner: 'Platform Engineering',
  },
  {
    id: 'verifier.failures',
    category: 'VERIFIER_FAILURES',
    title: 'Independent verifier failures',
    description: 'Packet/schema/resource-limit rejections and signature invalidations from the verifier.',
    kind: 'counter',
    triggerReasonCodes: [
      'PACKET_SCHEMA_UNSUPPORTED',
      'PACKET_EXTRA_FILE',
      'PACKET_RESOURCE_LIMIT',
      'CRYPTO_SIGNATURE_INVALID',
    ],
    alertThreshold: 1,
    owner: 'Independent QA/Safety',
  },
  {
    id: 'trust.staleBundle',
    category: 'STALE_TRUST_BUNDLES',
    title: 'Stale / unprovable trust bundles',
    description: 'Expired bundle, sequence rollback, untrusted clock, missing checkpoint, or unproven freshness.',
    kind: 'gauge',
    triggerReasonCodes: [
      'TRUST_BUNDLE_EXPIRED',
      'TRUST_SEQUENCE_ROLLBACK',
      'TRUST_SCOPE_MISMATCH',
      'TRUST_CLOCK_UNAVAILABLE',
      'TRUST_CHECKPOINT_REQUIRED',
      'TRUST_FRESHNESS_UNPROVEN',
    ],
    alertThreshold: 1,
    owner: 'Security/IAM',
  },
  {
    id: 'release.revokedAccess',
    category: 'REVOKED_RELEASE_ACCESS',
    title: 'Revoked-release access attempts',
    description: 'An attempt to read/stream a revoked release, or human P2 plaintext access.',
    kind: 'counter',
    triggerReasonCodes: ['STATE_RELEASE_REVOKED', 'STORE_PLAINTEXT_ACCESS_DENIED'],
    alertThreshold: 1,
    owner: 'Release Governance',
  },
  {
    id: 'legacy.blockedRoute',
    category: 'BLOCKED_LEGACY_ROUTE',
    title: 'Blocked legacy-route attempts',
    description: 'A client hit a contained legacy authority/export route (route disposition ledger).',
    kind: 'counter',
    triggerReasonCodes: ['STATE_CONFLICT', 'STATE_IDEMPOTENCY_MISMATCH', 'STORE_PLAINTEXT_ACCESS_DENIED'],
    alertThreshold: 5,
    owner: 'Platform Engineering',
  },
];

export type ValidateMetricRulesResult = { ok: true } | { ok: false; violations: string[] };

/** Contract check: every required category covered, every trigger code a §13 code. */
export function validateMetricRules(rules: readonly MetricRule[]): ValidateMetricRulesResult {
  const violations: string[] = [];
  const covered = new Set(rules.map((r) => r.category));
  for (const cat of REQUIRED_METRIC_CATEGORIES) {
    if (!covered.has(cat)) violations.push(`uncovered metric category: ${cat}`);
  }
  for (const r of rules) {
    if (!r.id) violations.push('a rule is missing an id');
    if (!ACCOUNTABLE_OWNERS.includes(r.owner)) violations.push(`rule "${r.id}" has a non-accountable owner: ${r.owner}`);
    if (!Array.isArray(r.triggerReasonCodes) || r.triggerReasonCodes.length === 0) {
      violations.push(`rule "${r.id}" has no trigger reason codes`);
    }
    for (const c of r.triggerReasonCodes ?? []) {
      if (!isTrustReasonCode(c)) violations.push(`rule "${r.id}" references a non-registry reason code: ${String(c)}`);
    }
    if (!Number.isFinite(r.alertThreshold) || r.alertThreshold < 0) {
      violations.push(`rule "${r.id}" has an invalid alert threshold`);
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

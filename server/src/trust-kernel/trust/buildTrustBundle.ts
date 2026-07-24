/**
 * buildTrustBundle.ts - Unsigned TrustBundleV1 construction + revocation semantics
 *
 * Builds the unsigned `TrustBundleV1` snapshot (design §11.3) that the trust
 * authority signs through `issueSignedBundle`. It is a pure, deterministic
 * function: given the same effective entries it yields byte-identical canonical
 * bytes (arrays are sorted so caller ordering never changes the signed bytes).
 *
 * TRUST-ROOT PINNING (critical soundness property, §11.3): the public key that
 * AUTHENTICATES a TrustBundleV1 is pinned in the verifier POLICY, OUTSIDE the
 * bundle. A bundle can NEVER introduce or authorize its own signing key. This
 * builder rejects any trusted key that (a) carries the trust-bundle signing key
 * id, or (b) declares a purpose outside the three DOWNSTREAM purposes — either
 * would let the bundle self-authorize its trust root.
 *
 * The module also owns the key-revocation-mode semantics: the explicit mode is
 * the sole source of meaning (§11.3), and a profile/grant revocation applies once
 * the query time reaches its `effectiveAt`.
 *
 * KeyPurpose delta (carried from Task 1): the trust-bundle signing purpose
 * `TRUST_BUNDLE` is NOT part of Task 1's exported 3-valued `KeyPurpose`; the
 * widening is owned by Tasks 9/12. It is defined LOCALLY here rather than by
 * editing the contract (reported as a spec delta).
 *
 * Phase: NOT_FOR_PRODUCTION. Pure functions only; no I/O, no crypto, no keys.
 */

import type {
  TenantScopeV1,
  TrustBundleV1,
  TrustedKeyV1,
  KeyRevocationV1,
  RevocationEntryV1,
  KeyPurpose,
  RevocationMode,
  SignatureAlgorithm,
  Iso8601,
} from '../contracts/protocolV3.js';
import type { TrustReasonCode } from '../reasonCodes.js';

// ---------------------------------------------------------------------------
// Local KeyPurpose widening (Task-1 contract delta owned by Tasks 9/12)
// ---------------------------------------------------------------------------

/** The trust-bundle SIGNING key purpose. Pinned in verifier policy OUTSIDE any bundle. */
export const TRUST_BUNDLE_KEY_PURPOSE = 'TRUST_BUNDLE' as const;

/** Task 1's 3-valued `KeyPurpose` widened locally with the trust-bundle purpose. */
export type TrustAuthorityKeyPurpose = KeyPurpose | typeof TRUST_BUNDLE_KEY_PURPOSE;

/** The three purposes a bundle's trusted (downstream) keys may declare (§11.3). */
export const DOWNSTREAM_KEY_PURPOSES: readonly KeyPurpose[] = [
  'RELEASE',
  'PROFILE_ATTESTATION',
  'WARNING_EXCEPTION',
];

const ED25519: SignatureAlgorithm = 'ed25519';
const REVOCATION_MODES: readonly RevocationMode[] = [
  'ALL_SIGNATURES',
  'SIGNED_AT_OR_AFTER',
  'ISSUANCE_DISABLED',
];

/** A `TrustBundleV1` before the trust authority binds its signature. */
export type UnsignedTrustBundleV1 = Omit<TrustBundleV1, 'signature'>;

/** Stable-reason-coded error for invalid or self-authorizing bundle construction. */
export class TrustBundleError extends Error {
  readonly code: TrustReasonCode;
  constructor(code: TrustReasonCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'TrustBundleError';
    this.code = code;
  }
}

export interface BuildTrustBundleInput {
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  /** The pinned trust-bundle SIGNING key id (never a member of `trustedKeys`). */
  trustBundleKeyId: string;
  trustedKeys: readonly TrustedKeyV1[];
  keyRevocations?: readonly KeyRevocationV1[];
  profileAttestationRevocations?: readonly RevocationEntryV1[];
  warningExceptionGrantRevocations?: readonly RevocationEntryV1[];
}

// ---------------------------------------------------------------------------
// Shared validation helpers (also consumed by buildReleaseStatusBundle)
// ---------------------------------------------------------------------------

export function assertTrustScope(scope: TenantScopeV1): void {
  for (const field of ['tenantId', 'orgId', 'siteId', 'policyVersion'] as const) {
    if (typeof scope?.[field] !== 'string' || scope[field].length === 0) {
      throw new TrustBundleError('TRUST_SCOPE_MISMATCH', `trust scope is missing ${field}`);
    }
  }
}

export function assertSequence(sequence: number): void {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new TrustBundleError('TRUST_SEQUENCE_ROLLBACK', 'sequence must be a positive integer');
  }
}

export function assertWindow(issuedAt: Iso8601, expiresAt: Iso8601): void {
  const i = Date.parse(issuedAt);
  const e = Date.parse(expiresAt);
  if (Number.isNaN(i) || Number.isNaN(e)) {
    throw new TrustBundleError('TRUST_BUNDLE_EXPIRED', 'issuedAt/expiresAt must be ISO-8601 timestamps');
  }
  if (e <= i) {
    throw new TrustBundleError('TRUST_BUNDLE_EXPIRED', 'expiresAt must be after issuedAt');
  }
}

function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pick exactly the five `TrustedKeyV1` fields so no extra prop leaks into the signed bytes. */
function normalizeKey(k: TrustedKeyV1): TrustedKeyV1 {
  return {
    keyId: k.keyId,
    purpose: k.purpose,
    algorithm: k.algorithm,
    validFrom: k.validFrom,
    validUntil: k.validUntil,
  };
}

// ---------------------------------------------------------------------------
// buildTrustBundle
// ---------------------------------------------------------------------------

export function buildTrustBundle(input: BuildTrustBundleInput): UnsignedTrustBundleV1 {
  assertTrustScope(input.trustScope);
  assertSequence(input.sequence);
  assertWindow(input.issuedAt, input.expiresAt);

  if (typeof input.trustBundleKeyId !== 'string' || input.trustBundleKeyId.length === 0) {
    throw new TrustBundleError('CRYPTO_ALGORITHM_DENIED', 'trustBundleKeyId is required');
  }

  const seen = new Set<string>();
  for (const key of input.trustedKeys) {
    // Trust-root pinning: a trusted key can never BE the signing key...
    if (key.keyId === input.trustBundleKeyId) {
      throw new TrustBundleError(
        'CRYPTO_ALGORITHM_DENIED',
        `trusted key ${key.keyId} is the bundle's own signing key; a bundle can never authorize its own trust root`,
      );
    }
    // ...nor carry a non-downstream purpose (in particular, TRUST_BUNDLE).
    if (!DOWNSTREAM_KEY_PURPOSES.includes(key.purpose)) {
      throw new TrustBundleError(
        'CRYPTO_ALGORITHM_DENIED',
        `trusted key ${key.keyId} has a non-downstream purpose ${String(key.purpose)}; the trust-bundle key is pinned OUTSIDE the bundle`,
      );
    }
    if (key.algorithm !== ED25519) {
      throw new TrustBundleError('CRYPTO_ALGORITHM_DENIED', `trusted key ${key.keyId} is not ${ED25519}`);
    }
    if (seen.has(key.keyId)) {
      throw new TrustBundleError('CRYPTO_ALGORITHM_DENIED', `duplicate trusted key id ${key.keyId}`);
    }
    seen.add(key.keyId);
  }

  for (const rev of input.keyRevocations ?? []) {
    if (!REVOCATION_MODES.includes(rev.revocationMode)) {
      throw new TrustBundleError('CRYPTO_ALGORITHM_DENIED', `unknown key revocation mode ${String(rev.revocationMode)}`);
    }
  }

  return {
    bundleType: 'TRUST',
    trustScope: input.trustScope,
    sequence: input.sequence,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    trustedKeys: [...input.trustedKeys].map(normalizeKey).sort((a, b) => compareStr(a.keyId, b.keyId)),
    keyRevocations: [...(input.keyRevocations ?? [])].sort(
      (a, b) => compareStr(a.keyId, b.keyId) || compareStr(a.effectiveAt, b.effectiveAt),
    ),
    profileAttestationRevocations: [...(input.profileAttestationRevocations ?? [])].sort((a, b) =>
      compareStr(a.id, b.id),
    ),
    warningExceptionGrantRevocations: [...(input.warningExceptionGrantRevocations ?? [])].sort((a, b) =>
      compareStr(a.id, b.id),
    ),
  };
}

// ---------------------------------------------------------------------------
// Revocation semantics — the explicit mode is the sole source of meaning (§11.3)
// ---------------------------------------------------------------------------

export interface KeyRevocationResolution {
  revoked: boolean;
  mode?: RevocationMode;
  effectiveAt?: Iso8601;
}

/**
 * Resolve whether a signature made at `signedAt` by `keyId` is invalidated by the
 * bundle's key revocations. The mode is authoritative:
 *   - ALL_SIGNATURES     — every signature is invalid, even one made before effectiveAt.
 *   - SIGNED_AT_OR_AFTER — only signatures at/after effectiveAt are invalid.
 *   - ISSUANCE_DISABLED  — no NEW bundle issuance after effectiveAt; already-issued
 *                          signatures remain valid, so this does not revoke them.
 */
export function resolveKeyRevocation(
  keyRevocations: readonly KeyRevocationV1[],
  keyId: string,
  signedAt: Iso8601,
): KeyRevocationResolution {
  const signedMs = Date.parse(signedAt);
  for (const rev of keyRevocations) {
    if (rev.keyId !== keyId) {
      continue;
    }
    const effMs = Date.parse(rev.effectiveAt);
    if (rev.revocationMode === 'ALL_SIGNATURES') {
      return { revoked: true, mode: rev.revocationMode, effectiveAt: rev.effectiveAt };
    }
    if (rev.revocationMode === 'SIGNED_AT_OR_AFTER' && signedMs >= effMs) {
      return { revoked: true, mode: rev.revocationMode, effectiveAt: rev.effectiveAt };
    }
    // ISSUANCE_DISABLED never invalidates an already-issued signature.
  }
  return { revoked: false };
}

/**
 * A profile-attestation or warning-exception-grant revocation applies once the
 * query time reaches its `effectiveAt` (§11.3). Used to answer "is this entity
 * revoked as of asOf?".
 */
export function revocationApplies(entry: RevocationEntryV1, asOf: Iso8601): boolean {
  return Date.parse(asOf) >= Date.parse(entry.effectiveAt);
}

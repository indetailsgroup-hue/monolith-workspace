/**
 * profileGovernance.ts - Machine-profile attestation + warning-exception verification
 *
 * The TypeScript authority boundary for the MONOLITH Production Trust Kernel's
 * governance records (approved design 2026-07-22 §§8-9 component contracts /
 * artifact matrix, §12 capability safety, §13 error model). It consumes the
 * signed `MachineProfileAttestationV1` and `WarningExceptionGrantV1` contracts
 * from Task 1 and returns a typed `TrustResult` carrying a stable reason code.
 *
 * Verification canonicalizes the unsigned record, checks Ed25519 through an
 * INJECTED public-key verifier port (no crypto library here — see
 * `../governance/verifyGovernanceSignature`), and checks scope / time / sequence
 * / revocation / key purpose. The database functions
 * `assert_profile_attestation_current` and `assert_warning_grants_current`
 * (migration 0181) repeat scope/time/status/eligibility checks at release commit.
 *
 * Hard invariant: a capability/hard blocker can NEVER be excepted. Every `CAP_*`
 * code — and any warning the catalogue does not mark exception-eligible —
 * resolves to `GATE_HARD_BLOCKER`, regardless of how a grant was signed.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type { TrustReasonCode } from '../reasonCodes.js';
import type {
  MachineProfileAttestationV1,
  WarningExceptionGrantV1,
  TrustedKeyV1,
  RevocationEntryV1,
} from './protocolV3.js';
import {
  verifyGovernanceSignature,
  type PublicKeyVerifier,
} from '../governance/verifyGovernanceSignature.js';

export type { MachineProfileAttestationV1, WarningExceptionGrantV1 } from './protocolV3.js';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * External trust state a verifier consults, mirroring the fields of a
 * `TrustBundleV1` (design §11.3) plus the injected verifier port, the current
 * verification time, and the expected scope. `exceptionEligible` mirrors the
 * warning catalogue's `exception_eligible` column (the DB owns the catalogue).
 */
export interface GovernanceTrust {
  /** The verification-time clock (never affects canonical output). */
  now: Date;
  /** Trusted signing keys, with declared purpose and validity window. */
  trustedKeys: readonly TrustedKeyV1[];
  /** The injected Ed25519 public-key verifier port. */
  verifySignature: PublicKeyVerifier;
  /** Profile-attestation revocations from the trust bundle. */
  profileAttestationRevocations: readonly RevocationEntryV1[];
  /** Warning-exception-grant revocations from the trust bundle. */
  warningExceptionGrantRevocations: readonly RevocationEntryV1[];
  /** Catalogue mirror: is this warning code exception-eligible at all? */
  exceptionEligible: (warningCode: string) => boolean;
  /** Expected attestation scope (tenant/site/machine), if scope is pinned. */
  expectedProfileScope?: { tenantId: string; siteId: string; machineId: string };
  /** Expected grant scope (tenant/site), if scope is pinned. */
  expectedGrantScope?: { tenantId: string; siteId: string };
  /** Minimum accepted attestation sequence per machine (rollback protection). */
  minAttestationSequenceByMachine?: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Internal helpers (pure)
// ---------------------------------------------------------------------------

function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

/**
 * Re-wrap a signature-verification failure for a differently-typed result.
 * The failure variant of `TrustResult` is generic-independent, but this package
 * compiles with `strictNullChecks:false`, under which TypeScript does not narrow
 * a boolean-discriminated union — so the failure is propagated explicitly rather
 * than by control-flow narrowing.
 */
function propagateSignatureFailure<T>(result: TrustResult<TrustedKeyV1>): TrustResult<T> {
  const failure = result as { code: TrustReasonCode; detail?: Readonly<Record<string, string>> };
  return err(failure.code, failure.detail);
}

/**
 * A hard blocker can never be excepted (design §12). Every capability code
 * (`CAP_*`) and the explicit hard-gate code are structurally hard blockers,
 * independent of any catalogue state.
 */
export function isHardBlockerCode(warningCode: string): boolean {
  return warningCode.startsWith('CAP_') || warningCode === 'GATE_HARD_BLOCKER';
}

function isSortedAscending(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) {
      return false;
    }
  }
  return true;
}

/** True iff `id` has an effective revocation at or before `now`. */
function isRevoked(id: string, revocations: readonly RevocationEntryV1[], now: Date): boolean {
  const n = now.getTime();
  return revocations.some((r) => {
    if (r.id !== id) {
      return false;
    }
    const effective = Date.parse(r.effectiveAt);
    // An unparseable effective time is treated as already effective (fail safe).
    return Number.isNaN(effective) || effective <= n;
  });
}

// ---------------------------------------------------------------------------
// verifyProfileAttestation (design §12)
// ---------------------------------------------------------------------------

/**
 * Verify a machine-profile attestation against external trust state. On success
 * the attestation may lend authority to a candidate, compiler, or verifier.
 */
export function verifyProfileAttestation(
  attestation: MachineProfileAttestationV1,
  trust: GovernanceTrust,
): TrustResult<MachineProfileAttestationV1> {
  // 1. Structural hash shape (a malformed hash can never be a valid attestation).
  const hashFields: ReadonlyArray<[string, string]> = [
    ['profileHash', attestation.profileHash],
    ['toolLibraryHash', attestation.toolLibraryHash],
    ['postprocessorBinaryHash', attestation.postprocessorBinaryHash],
  ];
  for (const [field, value] of hashFields) {
    if (!isSha256Hex(value)) {
      return err('CAP_PROFILE_ATTESTATION_INVALID', { field, reason: 'not a sha256 hash' });
    }
  }

  // 2. Status must be ACTIVE.
  if (attestation.status !== 'ACTIVE') {
    return err('CAP_PROFILE_ATTESTATION_INVALID', { status: attestation.status });
  }

  // 3. Scope (tenant/site/machine).
  const scope = trust.expectedProfileScope;
  if (
    scope !== undefined &&
    (attestation.tenantId !== scope.tenantId ||
      attestation.siteId !== scope.siteId ||
      attestation.machineId !== scope.machineId)
  ) {
    return err('CAP_PROFILE_ATTESTATION_INVALID', { reason: 'scope mismatch' });
  }

  // 4. Sequence rollback protection.
  const minByMachine = trust.minAttestationSequenceByMachine;
  if (minByMachine !== undefined) {
    const min = minByMachine[attestation.machineId];
    if (typeof min === 'number' && attestation.attestationSequence < min) {
      return err('CAP_PROFILE_ATTESTATION_INVALID', {
        reason: 'attestation sequence rollback',
        min: String(min),
        actual: String(attestation.attestationSequence),
      });
    }
  }

  // 5. Revocation.
  if (isRevoked(attestation.attestationId, trust.profileAttestationRevocations, trust.now)) {
    return err('CAP_PROFILE_ATTESTATION_INVALID', { reason: 'attestation revoked' });
  }

  // 6. Validity window (before validFrom or at/after validUntil).
  const windowCode = attestationWindowCode(attestation.validFrom, attestation.validUntil, trust.now);
  if (windowCode !== null) {
    return err(windowCode, { reason: 'attestation outside its validity window' });
  }

  // 7. Signature + key purpose (Ed25519 via the injected port).
  const signature = verifyGovernanceSignature(attestation, {
    purpose: 'PROFILE_ATTESTATION',
    trustedKeys: trust.trustedKeys,
    verifySignature: trust.verifySignature,
  });
  if (!signature.ok) {
    return propagateSignatureFailure<MachineProfileAttestationV1>(signature);
  }

  return ok(attestation);
}

function attestationWindowCode(
  validFrom: string,
  validUntil: string,
  now: Date,
): TrustReasonCode | null {
  const from = Date.parse(validFrom);
  const until = Date.parse(validUntil);
  if (Number.isNaN(from) || Number.isNaN(until)) {
    return 'CAP_PROFILE_ATTESTATION_INVALID';
  }
  const n = now.getTime();
  if (n < from || n >= until) {
    return 'CAP_PROFILE_ATTESTATION_EXPIRED';
  }
  return null;
}

// ---------------------------------------------------------------------------
// verifyWarningGrant (design §12)
// ---------------------------------------------------------------------------

/**
 * Verify a warning-exception grant against external trust state and the exact
 * candidate hash it must be bound to. A hard blocker is rejected before any
 * other check: it can never be excepted.
 */
export function verifyWarningGrant(
  grant: WarningExceptionGrantV1,
  candidateHash: string,
  trust: GovernanceTrust,
): TrustResult<WarningExceptionGrantV1> {
  // 1. Eligibility: a hard/capability blocker, or a warning the catalogue does
  //    not mark eligible, can NEVER be excepted.
  if (isHardBlockerCode(grant.warningCode) || !trust.exceptionEligible(grant.warningCode)) {
    return err('GATE_HARD_BLOCKER', { warningCode: grant.warningCode });
  }

  // 2. Two distinct approvers (four-eyes on the exception).
  if (grant.approverUserIds.length !== 2 || grant.approverUserIds[0] === grant.approverUserIds[1]) {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', { reason: 'two distinct approvers required' });
  }

  // 3. Candidate binding.
  if (!isSha256Hex(candidateHash) || grant.candidateHash !== candidateHash) {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', { reason: 'candidate hash mismatch' });
  }

  // 4. Scope (tenant/site).
  const scope = trust.expectedGrantScope;
  if (
    scope !== undefined &&
    (grant.tenantId !== scope.tenantId || grant.siteId !== scope.siteId)
  ) {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', { reason: 'scope mismatch' });
  }

  // 5. Entity ids: non-empty and sorted (the exact scope the grant covers).
  if (grant.entityIds.length === 0 || !isSortedAscending(grant.entityIds)) {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', {
      reason: 'entity ids must be non-empty and sorted',
    });
  }

  // 6. Revocation.
  if (isRevoked(grant.grantId, trust.warningExceptionGrantRevocations, trust.now)) {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', { reason: 'grant revoked' });
  }

  // 7. Validity window.
  const window = grantWindowState(grant.issuedAt, grant.expiresAt, trust.now);
  if (window === 'expired') {
    return err('GATE_WARNING_EXCEPTION_EXPIRED', { reason: 'grant has expired' });
  }
  if (window === 'invalid') {
    return err('GATE_WARNING_EXCEPTION_MISMATCH', { reason: 'grant outside its validity window' });
  }

  // 8. Signature + key purpose (Ed25519 via the injected port).
  const signature = verifyGovernanceSignature(grant, {
    purpose: 'WARNING_EXCEPTION',
    trustedKeys: trust.trustedKeys,
    verifySignature: trust.verifySignature,
  });
  if (!signature.ok) {
    return propagateSignatureFailure<WarningExceptionGrantV1>(signature);
  }

  return ok(grant);
}

function grantWindowState(
  issuedAt: string,
  expiresAt: string,
  now: Date,
): 'ok' | 'expired' | 'invalid' {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires)) {
    return 'invalid';
  }
  const n = now.getTime();
  if (n >= expires) {
    return 'expired';
  }
  if (n < issued) {
    return 'invalid';
  }
  return 'ok';
}

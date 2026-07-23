/**
 * profileGovernance.test.ts - Task 3 governance verification tests
 *
 * Machine-profile attestation and warning-exception grant verification for the
 * MONOLITH Production Trust Kernel (approved design 2026-07-22 §§8-9 component
 * contracts, §12 capability safety, §13 error model). Signature checking runs
 * through an INJECTED public-key verifier port; these tests use a deterministic
 * fake signer/verifier over the canonical bytes, so NO real crypto library and
 * NO private key material is present anywhere. The application stores key IDs
 * only.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import type {
  MachineProfileAttestationV1,
  WarningExceptionGrantV1,
  TrustedKeyV1,
  SignatureEnvelopeV1,
} from '../contracts/protocolV3.js';
import {
  verifyProfileAttestation,
  verifyWarningGrant,
  type GovernanceTrust,
} from '../contracts/profileGovernance.js';
import {
  requireKeyPurpose,
  verifyGovernanceSignature,
  type PublicKeyVerifier,
} from '../governance/verifyGovernanceSignature.js';

// ---------------------------------------------------------------------------
// Deterministic fake signer / verifier (stands in for managed Ed25519; no keys)
// ---------------------------------------------------------------------------

const hex = (c: string): string => c.repeat(64);
const PROFILE_KEY = 'dev-profile-attestation-key';
const GRANT_KEY = 'dev-warning-exception-key';
const CANDIDATE = hex('d');

/** Deterministic stand-in for an Ed25519 signature over canonical message bytes. */
function fakeSig(message: Uint8Array, keyId: string): string {
  return sha256Hex(Buffer.concat([Buffer.from(`${keyId}|`, 'utf-8'), Buffer.from(message)]));
}

/** The injected verifier port: recompute the fake signature and compare bytes. */
const fakeVerify: PublicKeyVerifier = ({ keyId, message, signature, algorithm }) =>
  algorithm === 'ed25519' && signature === fakeSig(message, keyId);

/** Sign the canonical form of an unsigned record with the fake signer. */
function signRecord(unsigned: Record<string, unknown>, keyId: string): SignatureEnvelopeV1 {
  const message = new TextEncoder().encode(canonicalJson(unsigned));
  return { alg: 'ed25519', keyId, sig: fakeSig(message, keyId) };
}

// ---------------------------------------------------------------------------
// Trusted keys and trust context
// ---------------------------------------------------------------------------

const NOW = new Date('2026-07-24T00:00:00.000Z');

const profileKey: TrustedKeyV1 = {
  keyId: PROFILE_KEY,
  purpose: 'PROFILE_ATTESTATION',
  algorithm: 'ed25519',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: '2026-08-01T00:00:00.000Z',
};
const grantKey: TrustedKeyV1 = {
  keyId: GRANT_KEY,
  purpose: 'WARNING_EXCEPTION',
  algorithm: 'ed25519',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: '2026-08-01T00:00:00.000Z',
};

const ELIGIBLE = new Set(['WARN_DEEP_POCKET_ADVISORY']);

function makeTrust(overrides: Partial<GovernanceTrust> = {}): GovernanceTrust {
  return {
    now: NOW,
    trustedKeys: [profileKey, grantKey],
    verifySignature: fakeVerify,
    profileAttestationRevocations: [],
    warningExceptionGrantRevocations: [],
    exceptionEligible: (code) => ELIGIBLE.has(code),
    expectedProfileScope: { tenantId: 'tenant-001', siteId: 'site-001', machineId: 'CNC-001' },
    expectedGrantScope: { tenantId: 'tenant-001', siteId: 'site-001' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Record builders (sign AFTER applying overrides unless a signature override
// is supplied, so a supplied signature is a deliberate tamper).
// ---------------------------------------------------------------------------

function attestation(
  overrides: Partial<MachineProfileAttestationV1> = {},
): MachineProfileAttestationV1 {
  const unsigned: Omit<MachineProfileAttestationV1, 'signature'> = {
    attestationId: '11111111-1111-1111-1111-111111111111',
    tenantId: 'tenant-001',
    siteId: 'site-001',
    machineId: 'CNC-001',
    profileHash: hex('a'),
    toolLibraryHash: hex('b'),
    postprocessorId: 'pp-nc-1000',
    postprocessorVersion: '1.2.3',
    postprocessorBinaryHash: hex('c'),
    approverUserId: 'user-me-approver',
    issuedAt: '2026-07-23T00:00:00.000Z',
    validFrom: '2026-07-23T00:00:00.000Z',
    validUntil: '2026-07-25T00:00:00.000Z',
    status: 'ACTIVE',
    attestationSequence: 7,
  };
  const { signature: sigOverride, ...unsignedOverrides } = overrides;
  const merged = { ...unsigned, ...unsignedOverrides };
  const signature = sigOverride ?? signRecord(merged, PROFILE_KEY);
  return { ...merged, signature };
}

function grant(overrides: Partial<WarningExceptionGrantV1> = {}): WarningExceptionGrantV1 {
  const unsigned: Omit<WarningExceptionGrantV1, 'signature'> = {
    grantId: '22222222-2222-2222-2222-222222222222',
    warningCode: 'WARN_DEEP_POCKET_ADVISORY',
    entityIds: ['op-0001', 'op-0002'],
    tenantId: 'tenant-001',
    siteId: 'site-001',
    candidateHash: CANDIDATE,
    reason: 'Reviewed deep pocket; within verified jig envelope',
    policyVersion: 'policy-2026-07',
    approverUserIds: ['user-a', 'user-b'],
    issuedAt: '2026-07-23T12:00:00.000Z',
    expiresAt: '2026-07-25T12:00:00.000Z',
  };
  const { signature: sigOverride, ...unsignedOverrides } = overrides;
  const merged = { ...unsigned, ...unsignedOverrides };
  const signature = sigOverride ?? signRecord(merged, GRANT_KEY);
  return { ...merged, signature };
}

// ===========================================================================
// requireKeyPurpose (plan Task 3 Step 4)
// ===========================================================================

describe('requireKeyPurpose', () => {
  it('accepts a key whose purpose matches', () => {
    expect(requireKeyPurpose(profileKey, 'PROFILE_ATTESTATION')).toEqual({
      ok: true,
      value: profileKey,
    });
  });

  it('denies a key whose purpose does not match with CRYPTO_ALGORITHM_DENIED', () => {
    expect(requireKeyPurpose(profileKey, 'WARNING_EXCEPTION')).toMatchObject({
      ok: false,
      code: 'CRYPTO_ALGORITHM_DENIED',
      detail: { expected: 'WARNING_EXCEPTION', actual: 'PROFILE_ATTESTATION' },
    });
  });
});

// ===========================================================================
// verifyGovernanceSignature
// ===========================================================================

describe('verifyGovernanceSignature', () => {
  it('returns the trusted key for a valid signature over the canonical unsigned record', () => {
    const a = attestation();
    const result = verifyGovernanceSignature(a, {
      purpose: 'PROFILE_ATTESTATION',
      trustedKeys: [profileKey],
      verifySignature: fakeVerify,
    });
    expect(result).toEqual({ ok: true, value: profileKey });
  });

  it('rejects a non-ed25519 signature algorithm with CRYPTO_ALGORITHM_DENIED', () => {
    const a = attestation();
    const tampered = { ...a, signature: { ...a.signature, alg: 'rsa' as never } };
    expect(verifyGovernanceSignature(tampered, {
      purpose: 'PROFILE_ATTESTATION',
      trustedKeys: [profileKey],
      verifySignature: fakeVerify,
    })).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
  });

  it('rejects an unknown/untrusted key id with CRYPTO_SIGNATURE_INVALID', () => {
    const a = attestation();
    expect(verifyGovernanceSignature(a, {
      purpose: 'PROFILE_ATTESTATION',
      trustedKeys: [], // key not trusted
      verifySignature: fakeVerify,
    })).toMatchObject({ ok: false, code: 'CRYPTO_SIGNATURE_INVALID' });
  });

  it('reports CRYPTO_SIGNER_UNAVAILABLE when the verifier port throws', () => {
    const a = attestation();
    const throwing: PublicKeyVerifier = () => {
      throw new Error('signer offline');
    };
    expect(verifyGovernanceSignature(a, {
      purpose: 'PROFILE_ATTESTATION',
      trustedKeys: [profileKey],
      verifySignature: throwing,
    })).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
  });
});

// ===========================================================================
// verifyProfileAttestation (design §12)
// ===========================================================================

describe('verifyProfileAttestation', () => {
  it('accepts a valid, in-scope, in-window, correctly signed attestation', () => {
    const result = verifyProfileAttestation(attestation(), makeTrust());
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed tool-library hash (plan RED)', () => {
    const badHash = 'not-a-valid-sha256';
    expect(verifyProfileAttestation(attestation({ toolLibraryHash: badHash }), makeTrust()).ok).toBe(
      false,
    );
  });

  it('rejects a tampered signed field with CRYPTO_SIGNATURE_INVALID', () => {
    const a = attestation();
    const tampered = { ...a, profileHash: hex('9') }; // signed over hex('a')
    expect(verifyProfileAttestation(tampered, makeTrust())).toMatchObject({
      ok: false,
      code: 'CRYPTO_SIGNATURE_INVALID',
    });
  });

  it('rejects a signature from a key with the wrong purpose (CRYPTO_ALGORITHM_DENIED)', () => {
    const a = attestation();
    const { signature: _drop, ...unsigned } = a;
    const wrong: MachineProfileAttestationV1 = {
      ...unsigned,
      signature: signRecord(unsigned, GRANT_KEY), // warning-exception key signs a profile
    };
    expect(verifyProfileAttestation(wrong, makeTrust())).toMatchObject({
      ok: false,
      code: 'CRYPTO_ALGORITHM_DENIED',
    });
  });

  it('rejects an expired attestation with CAP_PROFILE_ATTESTATION_EXPIRED', () => {
    expect(
      verifyProfileAttestation(
        attestation({ validUntil: '2026-07-23T23:00:00.000Z' }),
        makeTrust(),
      ),
    ).toMatchObject({ ok: false, code: 'CAP_PROFILE_ATTESTATION_EXPIRED' });
  });

  it('rejects a revoked (non-ACTIVE) attestation with CAP_PROFILE_ATTESTATION_INVALID', () => {
    expect(verifyProfileAttestation(attestation({ status: 'REVOKED' }), makeTrust())).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_ATTESTATION_INVALID',
    });
  });

  it('rejects an out-of-scope attestation (cross-machine) with CAP_PROFILE_ATTESTATION_INVALID', () => {
    expect(verifyProfileAttestation(attestation({ machineId: 'CNC-999' }), makeTrust())).toMatchObject(
      { ok: false, code: 'CAP_PROFILE_ATTESTATION_INVALID' },
    );
  });

  it('rejects a revoked-by-bundle attestation with CAP_PROFILE_ATTESTATION_INVALID', () => {
    const a = attestation();
    const trust = makeTrust({
      profileAttestationRevocations: [
        {
          id: a.attestationId,
          hash: hex('0'),
          effectiveAt: '2026-07-23T00:00:00.000Z',
          reason: 'profile compromised',
        },
      ],
    });
    expect(verifyProfileAttestation(a, trust)).toMatchObject({
      ok: false,
      code: 'CAP_PROFILE_ATTESTATION_INVALID',
    });
  });
});

// ===========================================================================
// verifyWarningGrant (design §12)
// ===========================================================================

describe('verifyWarningGrant', () => {
  it('accepts a valid, eligible, two-approver, in-window grant bound to the candidate', () => {
    expect(verifyWarningGrant(grant(), CANDIDATE, makeTrust()).ok).toBe(true);
  });

  it('rejects duplicate approvers with GATE_WARNING_EXCEPTION_MISMATCH (plan RED)', () => {
    expect(
      verifyWarningGrant(grant({ approverUserIds: ['user-a', 'user-a'] }), CANDIDATE, makeTrust()),
    ).toMatchObject({ ok: false, code: 'GATE_WARNING_EXCEPTION_MISMATCH' });
  });

  it('rejects a hard-blocker (CAP_*) warning code with GATE_HARD_BLOCKER (plan RED)', () => {
    expect(
      verifyWarningGrant(grant({ warningCode: 'CAP_UNKNOWN_TOOL' }), CANDIDATE, makeTrust()),
    ).toMatchObject({ ok: false, code: 'GATE_HARD_BLOCKER' });
  });

  it('rejects a warning code that is not exception-eligible with GATE_HARD_BLOCKER', () => {
    expect(
      verifyWarningGrant(grant({ warningCode: 'WARN_NOT_ELIGIBLE' }), CANDIDATE, makeTrust()),
    ).toMatchObject({ ok: false, code: 'GATE_HARD_BLOCKER' });
  });

  it('rejects a candidate-hash mismatch with GATE_WARNING_EXCEPTION_MISMATCH', () => {
    expect(verifyWarningGrant(grant(), hex('e'), makeTrust())).toMatchObject({
      ok: false,
      code: 'GATE_WARNING_EXCEPTION_MISMATCH',
    });
  });

  it('rejects unsorted entity ids with GATE_WARNING_EXCEPTION_MISMATCH', () => {
    expect(
      verifyWarningGrant(grant({ entityIds: ['op-0002', 'op-0001'] }), CANDIDATE, makeTrust()),
    ).toMatchObject({ ok: false, code: 'GATE_WARNING_EXCEPTION_MISMATCH' });
  });

  it('rejects an expired grant with GATE_WARNING_EXCEPTION_EXPIRED', () => {
    expect(
      verifyWarningGrant(
        grant({ issuedAt: '2026-07-20T00:00:00.000Z', expiresAt: '2026-07-22T00:00:00.000Z' }),
        CANDIDATE,
        makeTrust(),
      ),
    ).toMatchObject({ ok: false, code: 'GATE_WARNING_EXCEPTION_EXPIRED' });
  });

  it('rejects a tampered signed field with CRYPTO_SIGNATURE_INVALID', () => {
    const g = grant();
    const tampered = { ...g, reason: 'silently widened scope' };
    expect(verifyWarningGrant(tampered, CANDIDATE, makeTrust())).toMatchObject({
      ok: false,
      code: 'CRYPTO_SIGNATURE_INVALID',
    });
  });

  it('rejects a grant revoked by the trust bundle with GATE_WARNING_EXCEPTION_MISMATCH', () => {
    const g = grant();
    const trust = makeTrust({
      warningExceptionGrantRevocations: [
        {
          id: g.grantId,
          hash: hex('0'),
          effectiveAt: '2026-07-23T13:00:00.000Z',
          reason: 'exception withdrawn',
        },
      ],
    });
    expect(verifyWarningGrant(g, CANDIDATE, trust)).toMatchObject({
      ok: false,
      code: 'GATE_WARNING_EXCEPTION_MISMATCH',
    });
  });
});

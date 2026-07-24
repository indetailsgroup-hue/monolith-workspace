/**
 * trustBundles.test.ts - Trust and release-status bundle issuance (Task 9)
 *
 * Closes Phase B: signed `TrustBundleV1` and `ReleaseStatusBundleV1` with an
 * INDEPENDENT `(bundleType, trustScope)` monotonic sequence (design §11.3).
 *
 * The binding behaviours proven here:
 *  - `buildReleaseStatusBundle` NEVER includes a VOID attempt; the revoked set is
 *    exactly the REVOKED release-revision ids (the recall unit is the revision id).
 *  - Key revocation modes are exactly ALL_SIGNATURES / SIGNED_AT_OR_AFTER /
 *    ISSUANCE_DISABLED and the explicit mode is the sole source of semantics.
 *  - TRUST-ROOT PINNING: the public key that authenticates a TrustBundleV1 is
 *    pinned in verifier policy OUTSIDE the bundle and can NEVER be introduced or
 *    authorized by that same bundle. A self-authorizing bundle is rejected.
 *  - `issueSignedBundle` signs the canonical bytes through the ManagedSignerPort
 *    (never a private key), persists exact bytes+signature, and is idempotent: a
 *    retry returns the persisted bundle and never mints a second sequence.
 *  - The valid-minimal trust/status bundles, the pinned-root policy, and the
 *    bootstrap checkpoint are exported to the shared corpus; regeneration is
 *    opt-in (UPDATE_TRUST_VECTORS=1) and a normal run byte-compares.
 *
 * Phase: NOT_FOR_PRODUCTION. No private key material anywhere; the fake signer
 * returns a deterministic value over the digest only.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { ok, type TrustResult } from '../result.js';
import type {
  TenantScopeV1,
  TrustedKeyV1,
  KeyRevocationV1,
  RevocationEntryV1,
  KeyPurpose,
  TrustBundleV1,
  ReleaseStatusBundleV1,
} from '../contracts/protocolV3.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import type {
  ManagedSignerPort,
  ManagedSignerSignInput,
} from '../signing/managedSignerPort.js';
import { requireKeyPurpose } from '../governance/verifyGovernanceSignature.js';

import {
  buildTrustBundle,
  TrustBundleError,
  TRUST_BUNDLE_KEY_PURPOSE,
  resolveKeyRevocation,
  revocationApplies,
  type UnsignedTrustBundleV1,
} from '../trust/buildTrustBundle.js';
import {
  buildReleaseStatusBundle,
  type ReleaseRevocationRow,
} from '../trust/buildReleaseStatusBundle.js';
import {
  issueSignedBundle,
  type BundlePublicationPort,
  type PersistedBundle,
} from '../trust/issueSignedBundle.js';

// ---------------------------------------------------------------------------
// Fixed fixtures (pinned so the exported vectors are byte-stable)
// ---------------------------------------------------------------------------

const TRUST_SCOPE: TenantScopeV1 = {
  tenantId: 'tenant-001',
  orgId: 'org-monolith',
  siteId: 'site-001',
  policyVersion: 'policy-2026.07',
};

const OTHER_SCOPE: TenantScopeV1 = { ...TRUST_SCOPE, siteId: 'site-002' };

const ISSUED_AT = '2026-07-24T00:00:00.000Z';
const EXPIRES_AT = '2026-08-23T00:00:00.000Z';

// The trust-bundle SIGNING key. Pinned in verifier policy OUTSIDE the bundle;
// it is never a member of the bundle's own trustedKeys.
const TRUST_BUNDLE_KEY_ID = 'monolith-trust-bundle-ed25519-0001';

const RELEASE_KEY: TrustedKeyV1 = {
  keyId: 'monolith-release-ed25519-0001',
  purpose: 'RELEASE',
  algorithm: 'ed25519',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
};
const PROFILE_KEY: TrustedKeyV1 = {
  keyId: 'monolith-profile-attestation-ed25519-0001',
  purpose: 'PROFILE_ATTESTATION',
  algorithm: 'ed25519',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
};
const WARNING_KEY: TrustedKeyV1 = {
  keyId: 'monolith-warning-exception-ed25519-0001',
  purpose: 'WARNING_EXCEPTION',
  algorithm: 'ed25519',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '2027-01-01T00:00:00.000Z',
};

const KEY_REVOCATION: KeyRevocationV1 = {
  keyId: 'monolith-release-ed25519-0000',
  revocationMode: 'SIGNED_AT_OR_AFTER',
  effectiveAt: '2026-06-01T00:00:00.000Z',
  reason: 'COMPROMISE',
};

const PROFILE_REVOCATION: RevocationEntryV1 = {
  id: 'att-9000',
  hash: sha256Hex('MONOLITH/fixture/attestation/att-9000'),
  effectiveAt: '2026-07-01T00:00:00.000Z',
  reason: 'PROFILE_SUPERSEDED',
};
const GRANT_REVOCATION: RevocationEntryV1 = {
  id: 'grant-9000',
  hash: sha256Hex('MONOLITH/fixture/grant/grant-9000'),
  effectiveAt: '2026-07-10T00:00:00.000Z',
  reason: 'GRANT_WITHDRAWN',
};

function trustInput() {
  return {
    trustScope: TRUST_SCOPE,
    sequence: 1,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    // Deliberately UNSORTED so the builder's own ordering is exercised.
    trustedKeys: [WARNING_KEY, RELEASE_KEY, PROFILE_KEY],
    keyRevocations: [KEY_REVOCATION],
    profileAttestationRevocations: [PROFILE_REVOCATION],
    warningExceptionGrantRevocations: [GRANT_REVOCATION],
  };
}

// Release lifecycle rows: one ACTIVE, one REVOKED, and a VOID attempt that must
// never surface in the status bundle.
const REVOKED_ID = 'rr-000000000000000000000002';
const RELEASE_ROWS: ReleaseRevocationRow[] = [
  { releaseRevisionId: 'rr-000000000000000000000001', status: 'ACTIVE' },
  { releaseRevisionId: REVOKED_ID, status: 'REVOKED' },
  { releaseRevisionId: 'attempt-void-0003', status: 'VOID' },
];

function statusMeta() {
  return {
    trustScope: TRUST_SCOPE,
    sequence: 1,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  };
}

// ---------------------------------------------------------------------------
// Deterministic fake managed signer (digest-only; NEVER a private key)
// ---------------------------------------------------------------------------

function makeSigner(): ManagedSignerPort & { calls: ManagedSignerSignInput[] } {
  const calls: ManagedSignerSignInput[] = [];
  return {
    calls,
    async sign(input) {
      calls.push({ ...input });
      const sig = createHash('sha256')
        .update(`${input.digestSha256}|${input.keyId}|${input.purpose}`)
        .digest('base64');
      return ok({ algorithm: 'Ed25519', keyId: input.keyId, signatureBase64: sig });
    },
  };
}

const failingSigner: ManagedSignerPort = {
  async sign() {
    return { ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' } as TrustResult<never>;
  },
};

// ---------------------------------------------------------------------------
// In-memory publication store (fake of migration 0183's allocate/commit).
// Enforces per-(bundleType,trustScope) monotonic sequence + immutability.
// ---------------------------------------------------------------------------

function scopeKey(bundleType: string, scope: TenantScopeV1): string {
  return `${bundleType}:${canonicalJson(scope)}`;
}

function makeStore(): BundlePublicationPort & { rows: Map<string, PersistedBundle> } {
  const rows = new Map<string, PersistedBundle>();
  return {
    rows,
    async findPublished(bundleType, scope, sequence) {
      return rows.get(`${scopeKey(bundleType, scope)}:${sequence}`) ?? null;
    },
    async maxSequence(bundleType, scope) {
      let max = 0;
      const prefix = `${scopeKey(bundleType, scope)}:`;
      for (const key of rows.keys()) {
        if (key.startsWith(prefix)) {
          const seq = Number(key.slice(prefix.length));
          if (seq > max) max = seq;
        }
      }
      return max;
    },
    async persist(record) {
      const persisted: PersistedBundle = {
        canonicalHash: record.canonicalHash,
        signerKeyId: record.signerKeyId,
        signature: record.signature,
        bundle: record.bundle,
      };
      rows.set(
        `${scopeKey(record.bundle.bundleType, record.bundle.trustScope)}:${record.bundle.sequence}`,
        persisted,
      );
      return persisted;
    },
  };
}

function unwrap<T>(r: TrustResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${(r as { code: string }).code}`);
  return r.value;
}

// ===========================================================================
// 1. buildReleaseStatusBundle — VOID excluded; revoked set = REVOKED revisions
// ===========================================================================

describe('buildReleaseStatusBundle', () => {
  it('never includes a VOID attempt', () => {
    const bundle = buildReleaseStatusBundle(RELEASE_ROWS, statusMeta());
    expect(bundle.revokedReleaseRevisionIds).not.toContain('attempt-void-0003');
    expect(canonicalJson(bundle)).not.toContain('VOID');
  });

  it('sets revokedReleaseRevisionIds to exactly the REVOKED revision ids', () => {
    const bundle = buildReleaseStatusBundle(RELEASE_ROWS, statusMeta());
    expect(bundle.revokedReleaseRevisionIds).toEqual([REVOKED_ID]);
    expect(bundle.bundleType).toBe('RELEASE_STATUS');
    expect(bundle.trustScope).toEqual(TRUST_SCOPE);
  });

  it('sorts and de-duplicates the revoked set deterministically', () => {
    const rows: ReleaseRevocationRow[] = [
      { releaseRevisionId: 'rr-c', status: 'REVOKED' },
      { releaseRevisionId: 'rr-a', status: 'REVOKED' },
      { releaseRevisionId: 'rr-a', status: 'REVOKED' },
      { releaseRevisionId: 'rr-b', status: 'ACTIVE' },
    ];
    const bundle = buildReleaseStatusBundle(rows, statusMeta());
    expect(bundle.revokedReleaseRevisionIds).toEqual(['rr-a', 'rr-c']);
  });

  it('produces an empty revoked set when nothing is revoked', () => {
    const rows: ReleaseRevocationRow[] = [{ releaseRevisionId: 'rr-a', status: 'ACTIVE' }];
    const bundle = buildReleaseStatusBundle(rows, statusMeta());
    expect(bundle.revokedReleaseRevisionIds).toEqual([]);
  });
});

// ===========================================================================
// 2. buildTrustBundle — structure, revocation modes, deterministic order
// ===========================================================================

describe('buildTrustBundle', () => {
  it('carries the key revocation mode verbatim', () => {
    const bundle = buildTrustBundle(trustInput());
    expect(bundle.keyRevocations[0]).toMatchObject({
      keyId: 'monolith-release-ed25519-0000',
      revocationMode: 'SIGNED_AT_OR_AFTER',
      effectiveAt: '2026-06-01T00:00:00.000Z',
      reason: 'COMPROMISE',
    });
  });

  it('sorts trustedKeys by keyId for deterministic canonical bytes', () => {
    const bundle = buildTrustBundle(trustInput());
    const ids = bundle.trustedKeys.map((k) => k.keyId);
    expect(ids).toEqual([...ids].sort());
    expect(bundle.bundleType).toBe('TRUST');
  });

  it('rejects a trusted key that is not one of the three downstream purposes', () => {
    const input = trustInput();
    input.trustedKeys = [{ ...RELEASE_KEY, purpose: 'NONSENSE' as unknown as KeyPurpose }];
    expect(() => buildTrustBundle(input)).toThrowError(TrustBundleError);
  });
});

// ===========================================================================
// 3. TRUST-ROOT PINNING — a self-authorizing bundle is rejected (both layers)
// ===========================================================================

describe('trust-root pinning', () => {
  it('rejects a bundle whose trustedKeys include its own signing key id', () => {
    const input = trustInput();
    input.trustedKeys = [
      { ...RELEASE_KEY, keyId: TRUST_BUNDLE_KEY_ID }, // self-authorize the signer
    ];
    let code = '';
    try {
      buildTrustBundle(input);
    } catch (e) {
      code = (e as TrustBundleError).code;
    }
    expect(code).toBe('CRYPTO_ALGORITHM_DENIED');
  });

  it('rejects a trusted key carrying the TRUST_BUNDLE purpose', () => {
    const input = trustInput();
    input.trustedKeys = [
      { ...RELEASE_KEY, purpose: TRUST_BUNDLE_KEY_PURPOSE as unknown as KeyPurpose },
    ];
    expect(() => buildTrustBundle(input)).toThrowError(TrustBundleError);
  });

  it('issueSignedBundle refuses to sign a self-authorizing bundle and never calls the signer', async () => {
    // Hand-craft an unsigned bundle that bypassed the builder guard.
    const unsigned: UnsignedTrustBundleV1 = {
      bundleType: 'TRUST',
      trustScope: TRUST_SCOPE,
      sequence: 1,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
      trustedKeys: [{ ...RELEASE_KEY, keyId: TRUST_BUNDLE_KEY_ID }],
      keyRevocations: [],
      profileAttestationRevocations: [],
      warningExceptionGrantRevocations: [],
    };
    const signer = makeSigner();
    const r = await issueSignedBundle(unsigned, {
      signer,
      store: makeStore(),
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('CRYPTO_ALGORITHM_DENIED');
    expect(signer.calls).toHaveLength(0);
  });
});

// ===========================================================================
// 4. issueSignedBundle — sign, persist, idempotency, immutability, scope
// ===========================================================================

describe('issueSignedBundle', () => {
  it('signs the canonical digest through the managed signer with the TRUST_BUNDLE purpose', async () => {
    const unsigned = buildTrustBundle(trustInput());
    const signer = makeSigner();
    const store = makeStore();
    const signed = unwrap(
      await issueSignedBundle(unsigned, { signer, store, trustBundleKeyId: TRUST_BUNDLE_KEY_ID }),
    ) as TrustBundleV1;

    const expectedDigest = sha256Hex(canonicalJson(unsigned));
    expect(signer.calls).toHaveLength(1);
    expect(signer.calls[0]).toEqual({
      keyId: TRUST_BUNDLE_KEY_ID,
      purpose: TRUST_BUNDLE_KEY_PURPOSE,
      digestSha256: expectedDigest,
    });
    expect(signed.signature.alg).toBe('ed25519');
    expect(signed.signature.keyId).toBe(TRUST_BUNDLE_KEY_ID);
    expect(signed.signature.sig.length).toBeGreaterThan(0);
    // The signed bundle is the unsigned bundle plus exactly the signature field.
    const { signature, ...rest } = signed;
    expect(canonicalJson(rest)).toBe(canonicalJson(unsigned));
  });

  it('is idempotent: a retry returns the persisted bundle and never re-signs', async () => {
    const unsigned = buildTrustBundle(trustInput());
    const signer = makeSigner();
    const store = makeStore();
    const first = unwrap(
      await issueSignedBundle(unsigned, { signer, store, trustBundleKeyId: TRUST_BUNDLE_KEY_ID }),
    );
    const second = unwrap(
      await issueSignedBundle(unsigned, { signer, store, trustBundleKeyId: TRUST_BUNDLE_KEY_ID }),
    );
    expect(signer.calls).toHaveLength(1); // no second signature
    expect(store.rows.size).toBe(1); // no second sequence
    expect(canonicalJson(second)).toBe(canonicalJson(first));
  });

  it('rejects a different bundle re-using an existing (bundleType,trustScope,sequence)', async () => {
    const store = makeStore();
    const signer = makeSigner();
    await issueSignedBundle(buildTrustBundle(trustInput()), {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    // Same sequence, different content (an extra revocation).
    const mutated = buildTrustBundle({
      ...trustInput(),
      keyRevocations: [KEY_REVOCATION, { ...KEY_REVOCATION, keyId: 'monolith-release-ed25519-0002' }],
    });
    const r = await issueSignedBundle(mutated, {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('STATE_CONFLICT');
  });

  it('rejects a sequence rollback below the current high-water mark', async () => {
    const store = makeStore();
    const signer = makeSigner();
    await issueSignedBundle(buildTrustBundle({ ...trustInput(), sequence: 2 }), {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    const older = buildTrustBundle({ ...trustInput(), sequence: 1 });
    const r = await issueSignedBundle(older, {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('TRUST_SEQUENCE_ROLLBACK');
  });

  it('rejects a bundle whose trustScope is outside the permitted trust scope', async () => {
    const unsigned = buildTrustBundle({ ...trustInput(), trustScope: OTHER_SCOPE });
    const r = await issueSignedBundle(unsigned, {
      signer: makeSigner(),
      store: makeStore(),
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
      permittedTrustScope: TRUST_SCOPE,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('TRUST_SCOPE_MISMATCH');
  });

  it('propagates a signer failure as a stable reason code', async () => {
    const unsigned = buildTrustBundle(trustInput());
    const r = await issueSignedBundle(unsigned, {
      signer: failingSigner,
      store: makeStore(),
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('CRYPTO_SIGNER_UNAVAILABLE');
  });

  it('gives TRUST and RELEASE_STATUS independent per-scope sequences', async () => {
    const store = makeStore();
    const signer = makeSigner();
    await issueSignedBundle(buildTrustBundle({ ...trustInput(), sequence: 1 }), {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    // A RELEASE_STATUS bundle at sequence 1 coexists — its sequence is independent.
    const status = buildReleaseStatusBundle(RELEASE_ROWS, statusMeta());
    const r = await issueSignedBundle(status, {
      signer,
      store,
      trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
    });
    expect(r.ok).toBe(true);
    expect(store.rows.size).toBe(2);
  });
});

// ===========================================================================
// 5. Key revocation modes — the explicit mode is the sole source of semantics
// ===========================================================================

describe('resolveKeyRevocation', () => {
  const at = (iso: string) => iso;
  const revs = (mode: KeyRevocationV1['revocationMode']): KeyRevocationV1[] => [
    { keyId: 'k1', revocationMode: mode, effectiveAt: '2026-06-01T00:00:00.000Z', reason: 'COMPROMISE' },
  ];

  it('ALL_SIGNATURES invalidates a signature made even before effectiveAt', () => {
    const r = resolveKeyRevocation(revs('ALL_SIGNATURES'), 'k1', at('2026-01-01T00:00:00.000Z'));
    expect(r.revoked).toBe(true);
    expect(r.mode).toBe('ALL_SIGNATURES');
  });

  it('SIGNED_AT_OR_AFTER invalidates only at/after effectiveAt', () => {
    expect(resolveKeyRevocation(revs('SIGNED_AT_OR_AFTER'), 'k1', at('2026-05-31T23:59:59.000Z')).revoked).toBe(false);
    expect(resolveKeyRevocation(revs('SIGNED_AT_OR_AFTER'), 'k1', at('2026-06-01T00:00:00.000Z')).revoked).toBe(true);
  });

  it('ISSUANCE_DISABLED does not invalidate an already-issued signature', () => {
    expect(resolveKeyRevocation(revs('ISSUANCE_DISABLED'), 'k1', at('2027-01-01T00:00:00.000Z')).revoked).toBe(false);
  });

  it('an unrevoked key is never revoked', () => {
    expect(resolveKeyRevocation(revs('ALL_SIGNATURES'), 'other', at('2027-01-01T00:00:00.000Z')).revoked).toBe(false);
  });
});

// ===========================================================================
// 6. Entity revocation as-of — expired attestation / grant revocation
// ===========================================================================

describe('revocationApplies', () => {
  it('an attestation/grant is revoked once asOf reaches effectiveAt', () => {
    expect(revocationApplies(PROFILE_REVOCATION, '2026-07-01T00:00:00.000Z')).toBe(true);
    expect(revocationApplies(PROFILE_REVOCATION, '2026-07-02T00:00:00.000Z')).toBe(true);
  });

  it('is not yet in force before effectiveAt', () => {
    expect(revocationApplies(GRANT_REVOCATION, '2026-07-09T23:59:59.000Z')).toBe(false);
  });
});

// ===========================================================================
// 7. Wrong signer-purpose — purpose binding over the bundle's trusted set
// ===========================================================================

describe('trusted-key purpose binding', () => {
  it('a RELEASE key cannot stand in for a PROFILE_ATTESTATION signer', () => {
    const bundle = buildTrustBundle(trustInput());
    const releaseKey = bundle.trustedKeys.find((k) => k.purpose === 'RELEASE')!;
    const r = requireKeyPurpose(releaseKey, 'PROFILE_ATTESTATION');
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('CRYPTO_ALGORITHM_DENIED');
  });

  it('the matching purpose is accepted', () => {
    const bundle = buildTrustBundle(trustInput());
    const profileKey = bundle.trustedKeys.find((k) => k.purpose === 'PROFILE_ATTESTATION')!;
    expect(requireKeyPurpose(profileKey, 'PROFILE_ATTESTATION').ok).toBe(true);
  });
});

// ===========================================================================
// 8. Golden vectors — export to the shared corpus; normal run byte-compares
// ===========================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALID_MINIMAL = join(__dirname, '..', '..', '..', '..', 'test-vectors', 'factory-packet-v3', 'valid-minimal');
const TRUST_BUNDLE_JSON = join(VALID_MINIMAL, 'trust-bundle.json');
const RELEASE_STATUS_BUNDLE_JSON = join(VALID_MINIMAL, 'release-status-bundle.json');
const POLICY_JSON = join(VALID_MINIMAL, 'policy.json');
const CHECKPOINT_JSON = join(VALID_MINIMAL, 'checkpoint.json');
const UPDATE = process.env.UPDATE_TRUST_VECTORS === '1';

// The pinned-root verifier policy: it pins the trust-bundle public key OUTSIDE
// any bundle, names the permitted trust scope, and carries freshness/archive
// limits. A TrustBundleV1 can never introduce or authorize this key.
const POLICY = {
  schema: 'monolith.trust.verifier-policy.v1',
  permittedTrustScope: TRUST_SCOPE,
  pinnedTrustBundleKey: {
    keyId: TRUST_BUNDLE_KEY_ID,
    algorithm: 'ed25519',
    purpose: TRUST_BUNDLE_KEY_PURPOSE,
    note: 'pinned OUTSIDE any bundle; a TrustBundleV1 can never introduce or authorize this key',
  },
  freshness: {
    maxOfflineStalenessSeconds: 86400,
    maxBundleAgeSeconds: 2592000,
  },
  archive: {
    maxArchiveAgeSeconds: 31536000,
    requireBootstrapCheckpoint: true,
  },
};

// First-use bootstrap floor: the verifier rejects any bundle sequence below the
// per-(bundleType,trustScope) minimum.
const CHECKPOINT = {
  schema: 'monolith.trust.bootstrap-checkpoint.v1',
  trustScope: TRUST_SCOPE,
  minimumSequences: { TRUST: 1, RELEASE_STATUS: 1 },
  issuedAt: ISSUED_AT,
  note: 'first-use bootstrap floor; the verifier rejects any bundle sequence below these per (bundleType, trustScope)',
};

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

describe('trust corpus vectors', () => {
  it('materializes or byte-compares trust-bundle / release-status / policy / checkpoint', async () => {
    const signer = makeSigner();
    const store = makeStore();
    const trustBundle = unwrap(
      await issueSignedBundle(buildTrustBundle(trustInput()), {
        signer,
        store,
        trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
      }),
    ) as TrustBundleV1;
    const statusBundle = unwrap(
      await issueSignedBundle(buildReleaseStatusBundle(RELEASE_ROWS, statusMeta()), {
        signer,
        store,
        trustBundleKeyId: TRUST_BUNDLE_KEY_ID,
      }),
    ) as ReleaseStatusBundleV1;

    if (UPDATE) {
      mkdirSync(VALID_MINIMAL, { recursive: true });
      writeFileSync(TRUST_BUNDLE_JSON, serialize(trustBundle));
      writeFileSync(RELEASE_STATUS_BUNDLE_JSON, serialize(statusBundle));
      writeFileSync(POLICY_JSON, serialize(POLICY));
      writeFileSync(CHECKPOINT_JSON, serialize(CHECKPOINT));
      return;
    }

    for (const p of [TRUST_BUNDLE_JSON, RELEASE_STATUS_BUNDLE_JSON, POLICY_JSON, CHECKPOINT_JSON]) {
      expect(existsSync(p)).toBe(true);
    }
    expect(serialize(trustBundle)).toBe(readFileSync(TRUST_BUNDLE_JSON, 'utf-8'));
    expect(serialize(statusBundle)).toBe(readFileSync(RELEASE_STATUS_BUNDLE_JSON, 'utf-8'));
    expect(serialize(POLICY)).toBe(readFileSync(POLICY_JSON, 'utf-8'));
    expect(serialize(CHECKPOINT)).toBe(readFileSync(CHECKPOINT_JSON, 'utf-8'));

    // The exported policy pins the signer OUTSIDE the bundle: the pinned key id is
    // never a member of the bundle's own trustedKeys (the soundness property).
    const committed: TrustBundleV1 = JSON.parse(readFileSync(TRUST_BUNDLE_JSON, 'utf-8'));
    expect(committed.trustedKeys.some((k) => k.keyId === POLICY.pinnedTrustBundleKey.keyId)).toBe(false);
    expect(committed.signature.keyId).toBe(POLICY.pinnedTrustBundleKey.keyId);
  });
});

/**
 * evidenceAttestation.test.ts — Task 12 signed evidence bundle (design §16.4).
 *
 * Proves both directions:
 *   HAPPY PATH — a complete evidence manifest is signed by a SEPARATE evidence key
 *     (purpose EVIDENCE), the attestation binds both Git roots, exact command/report
 *     digests, CI run/workflow identity, builder+verifier binary hashes, the evidence
 *     root hash, issuedAt, retention, and keyId, and it self-verifies.
 *   FAIL-CLOSED — with the signer config absent, or the signature verifier
 *     unavailable, or the evidence key equal to a release key, or the evidence
 *     incomplete (a failure/skip/empty suite), issuance REFUSES. CI cannot claim a
 *     pass without a verifiable signature over complete evidence.
 *
 * No private key is stored or exercised: the signer is the digest-only managed
 * signer port (Task 8), and verification runs through an injected verifier port.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  buildEvidenceManifest,
  checkEvidenceComplete,
  verifyEvidenceRootHash,
  type EvidenceManifestInput,
  type DigestRef,
} from '../evidence/buildEvidenceManifest.js';
import {
  issueEvidenceAttestation,
  verifyEvidenceAttestation,
  EVIDENCE_KEY_PURPOSE,
  type EvidenceSignatureVerifier,
} from '../evidence/issueEvidenceAttestation.js';
import type { ManagedSignerPort, ManagedSignerSignInput } from '../signing/managedSignerPort.js';
import { ok, err } from '../result.js';

// --- deterministic closed-loop signer + verifier (no private key; shadow scheme) ---
// The fake signer computes a signature = base64( sha256(digest | ':' | keyId | ':' | purpose) )
// and the fake verifier recomputes it. This exercises the digest-only boundary and the
// separate-evidence-key contract WITHOUT any private-key material (mirrors Task 10's
// keyless committed scheme: integrity-by-hash, authority-by-pinning).
function shadowSig(digest: string, keyId: string, purpose: string): string {
  return createHash('sha256').update(`${digest}:${keyId}:${purpose}`).digest('base64');
}
function makeSigner(purposeSeen: { value?: string }): ManagedSignerPort {
  return {
    async sign(input: Readonly<ManagedSignerSignInput>) {
      purposeSeen.value = String(input.purpose);
      // A real managed signer holds the private key remotely; this fake never sees one.
      if ('privateKey' in (input as Record<string, unknown>)) {
        return err('CRYPTO_ALGORITHM_DENIED', { reason: 'no key material at the port' });
      }
      return ok({
        algorithm: 'Ed25519' as const,
        keyId: input.keyId,
        signatureBase64: shadowSig(input.digestSha256, input.keyId, String(input.purpose)),
      });
    },
  };
}
const shadowVerifier: EvidenceSignatureVerifier = {
  async verify({ digestSha256, keyId, signatureBase64 }) {
    return ok(signatureBase64 === shadowSig(digestSha256, keyId, EVIDENCE_KEY_PURPOSE));
  },
};
const unavailableSigner: ManagedSignerPort = {
  async sign() {
    return err('CRYPTO_SIGNER_UNAVAILABLE', { reason: 'signer endpoint unreachable' });
  },
};

const HEX = (c: string) => c.repeat(64);
const COMMIT = (c: string) => c.repeat(40);

function digestRef(over: Partial<DigestRef> = {}): DigestRef {
  return {
    name: 'server-suite',
    command: 'npm --prefix server test -- --run',
    exitCode: 0,
    passed: 178,
    failed: 0,
    skipped: 0,
    sha256: HEX('a'),
    ...over,
  };
}

function manifestInput(over: Partial<EvidenceManifestInput> = {}): EvidenceManifestInput {
  return {
    parentGit: { root: 'parent', commit: COMMIT('1'), branch: 'main', dirtyFiles: [] },
    productGit: { root: 'product', commit: COMMIT('2'), branch: 'trust-kernel/shadow-e0', dirtyFiles: [] },
    layers: [digestRef(), digestRef({ name: 'verifier-suite', command: 'npm -w tools/factory-packet-verifier test', sha256: HEX('b') })],
    dependencyLockHashes: { 'package-lock.json': HEX('c') },
    environmentProfile: { os: 'ubuntu-24.04', node: 'v22.21.1' },
    builderBinaryHash: HEX('d'),
    verifierBinaryHash: HEX('e'),
    goldenPacketHash: 'ac31db34' + 'f'.repeat(56),
    ciRunId: 'gha-run-12345',
    workflowIdentity: 'monolith/.github/workflows/trust-kernel-verify.yml@refs/heads/main',
    retentionDays: 3650,
    evidenceKeyId: 'monolith-evidence-key-0001',
    issuedAt: '2026-07-24T00:00:00.000Z',
    ...over,
  };
}

describe('buildEvidenceManifest — binds both roots, digests, binaries, and a root hash', () => {
  it('produces a manifest whose evidenceRootHash is deterministic and self-consistent', () => {
    const m = buildEvidenceManifest(manifestInput());
    expect(m.schema).toBe('EvidenceManifestV1');
    expect(m.phase).toBe('NOT_FOR_PRODUCTION');
    expect(m.parentGit.commit).toBe(COMMIT('1'));
    expect(m.productGit.branch).toBe('trust-kernel/shadow-e0');
    expect(m.evidenceRootHash).toMatch(/^[0-9a-f]{64}$/);
    // recompute independently -> identical
    expect(buildEvidenceManifest(manifestInput()).evidenceRootHash).toBe(m.evidenceRootHash);
    expect(verifyEvidenceRootHash(m)).toBe(true);
  });
  it('a mutated manifest field breaks the root hash (tamper-evident)', () => {
    const m = buildEvidenceManifest(manifestInput());
    const tampered = { ...m, ciRunId: 'gha-run-99999' };
    expect(verifyEvidenceRootHash(tampered)).toBe(false);
  });
  it('rejects a structurally invalid manifest input (non-hex commit)', () => {
    expect(() => buildEvidenceManifest(manifestInput({ parentGit: { root: 'parent', commit: 'nope', branch: 'x', dirtyFiles: [] } }))).toThrow();
  });
});

describe('checkEvidenceComplete — a truncated/skipped/failed suite cannot support a pass', () => {
  it('a complete all-green manifest is complete', () => {
    expect(checkEvidenceComplete(buildEvidenceManifest(manifestInput())).ok).toBe(true);
  });
  it('any failure present is incomplete', () => {
    const m = buildEvidenceManifest(manifestInput({ layers: [digestRef({ failed: 1 })] }));
    const r = checkEvidenceComplete(m);
    expect(r).toMatchObject({ ok: false, reason: 'FAILURE_PRESENT' });
  });
  it('any skip present is incomplete', () => {
    const m = buildEvidenceManifest(manifestInput({ layers: [digestRef({ skipped: 3 })] }));
    expect(checkEvidenceComplete(m)).toMatchObject({ ok: false, reason: 'SKIP_PRESENT' });
  });
  it('an empty suite (zero passed) is incomplete', () => {
    const m = buildEvidenceManifest(manifestInput({ layers: [digestRef({ passed: 0 })] }));
    expect(checkEvidenceComplete(m)).toMatchObject({ ok: false, reason: 'EMPTY_SUITE' });
  });
  it('a non-zero exit code is incomplete', () => {
    const m = buildEvidenceManifest(manifestInput({ layers: [digestRef({ exitCode: 1 })] }));
    expect(checkEvidenceComplete(m)).toMatchObject({ ok: false, reason: 'NONZERO_EXIT' });
  });
});

describe('issueEvidenceAttestation — signs complete evidence with a SEPARATE evidence key', () => {
  it('happy path: signs via purpose EVIDENCE and self-verifies', async () => {
    const purposeSeen: { value?: string } = {};
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner(purposeSeen),
      verifier: shadowVerifier,
      config: { signerUrl: 'https://signer.internal/evidence', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: ['monolith-release-key-0001'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const att = res.attestation;
    expect(att.schema).toBe('EvidenceAttestationV1');
    expect(att.keyId).toBe('monolith-evidence-key-0001');
    expect(att.evidenceRootHash).toBe(m.evidenceRootHash);
    expect(att.commandReportDigests).toHaveLength(2);
    expect(att.parentGit.commit).toBe(COMMIT('1'));
    expect(att.verifierBinaryHash).toBe(HEX('e'));
    expect(att.signatureBase64).toBeTruthy();
    expect(purposeSeen.value).toBe('EVIDENCE');
    // self-verification passes
    const v = await verifyEvidenceAttestation(att, shadowVerifier);
    expect(v).toMatchObject({ ok: true, value: true });
  });

  it('FAIL-CLOSED: missing signer config refuses (CRYPTO_SIGNER_UNAVAILABLE)', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: shadowVerifier,
      config: { signerUrl: undefined, keyId: undefined },
      releaseKeyIds: [],
    });
    expect(res).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
  });

  it('FAIL-CLOSED: verifier unavailable refuses (CRYPTO_SIGNATURE_INVALID)', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: undefined, // verification unavailable
      config: { signerUrl: 'https://signer.internal/evidence', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: [],
    });
    expect(res).toMatchObject({ ok: false, code: 'CRYPTO_SIGNATURE_INVALID' });
  });

  it('FAIL-CLOSED: a verifier that rejects the signature refuses', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const rejectingVerifier: EvidenceSignatureVerifier = { async verify() { return ok(false); } };
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: rejectingVerifier,
      config: { signerUrl: 'https://s', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: [],
    });
    expect(res).toMatchObject({ ok: false, code: 'CRYPTO_SIGNATURE_INVALID' });
  });

  it('FAIL-CLOSED: signer endpoint unreachable propagates CRYPTO_SIGNER_UNAVAILABLE', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: unavailableSigner,
      verifier: shadowVerifier,
      config: { signerUrl: 'https://s', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: [],
    });
    expect(res).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
  });

  it('SEPARATION: the evidence key must not equal a release key (CRYPTO_ALGORITHM_DENIED)', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: shadowVerifier,
      config: { signerUrl: 'https://s', keyId: 'shared-key' },
      releaseKeyIds: ['shared-key'], // evidence key collides with the release key
    });
    expect(res).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
  });

  it('FAIL-CLOSED: an incomplete manifest is never signed (EVIDENCE_INCOMPLETE)', async () => {
    const m = buildEvidenceManifest(manifestInput({ layers: [digestRef({ skipped: 1 })] }));
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: shadowVerifier,
      config: { signerUrl: 'https://s', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: [],
    });
    expect(res).toMatchObject({ ok: false, code: 'EVIDENCE_INCOMPLETE' });
  });

  it('self-verification fails on a tampered signature', async () => {
    const m = buildEvidenceManifest(manifestInput());
    const res = await issueEvidenceAttestation(m, {
      signer: makeSigner({}),
      verifier: shadowVerifier,
      config: { signerUrl: 'https://s', keyId: 'monolith-evidence-key-0001' },
      releaseKeyIds: [],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const tampered = { ...res.attestation, signatureBase64: 'AAAA' };
    const v = await verifyEvidenceAttestation(tampered, shadowVerifier);
    expect(v).toMatchObject({ ok: true, value: false });
  });
});

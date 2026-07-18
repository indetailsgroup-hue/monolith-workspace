// S17 Track B — official black-box interop gate (Full-System Scrutiny B2-02).
//
// The fixture ZIP in ./fixtures was produced by the FROZEN S17-4 generator —
// commit eeed1ce6b4388db5c661932a419e5d2c61267712 (tree da717b31…), handoff
// anchor 3ebdbfb7… — running its golden input with a real-crypto KMS mock
// (DER ECDSA over the digest, MessageType=DIGEST semantics). No generator
// source crosses this boundary: the verifier judges exact artifact BYTES, the
// way it will in production. interop-meta.json carries the deployment-config
// analog (trusted key SPKI, authority allowlist values, run binding) plus the
// generator's identity claims, which this test cross-checks against the
// verifier's own audit output.
//
// Expected: exactly {VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY} — and FAILED on a
// single flipped byte (non-vacuous).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyPacket, type VerifierDeps, type AuditRecord } from '../verifyPacket';
import { NFP_FILENAME_REGEX } from '../codes';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** provenance pins — a re-generated fixture MUST update these deliberately */
const GENERATOR_COMMIT = 'eeed1ce6b4388db5c661932a419e5d2c61267712';
const ZIP_SHA256 = '8a40f975c9712baca03a9b441736671c17484528a8f40daac4adc40cbf990ddb';

interface InteropMeta {
  generatorCommit: string;
  generatorTree: string;
  inputSha256: string;
  zipFilename: string;
  zipSha256: string;
  zipBytes: number;
  kmsSignCalls: number;
  packetContentId: string;
  manifestSha256: string;
  machineProfileSha256: string;
  run: {
    jobRunId: string;
    issuedAt: string;
    actorSubjectId: string;
    authorizationContextId: string;
    idempotencyFingerprint: string;
  };
  signingIdentity: { keyId: string; registryVersion: string };
  spkiDerBase64: string;
  releasedRevision: { projectId: string; revisionId: string; state: string };
  exporter: { id: string; version: string; buildCommit: string; artifactSha256: string };
  gatePolicyVersion: string;
}

function loadFixture(): { meta: InteropMeta; zip: Uint8Array } {
  const meta = JSON.parse(readFileSync(join(FIXTURES, 'interop-meta.json'), 'utf8')) as InteropMeta;
  const zip = new Uint8Array(readFileSync(join(FIXTURES, meta.zipFilename)));
  return { meta, zip };
}

function depsFromMeta(meta: InteropMeta): { deps: VerifierDeps; audits: AuditRecord[] } {
  const spkiDer = new Uint8Array(Buffer.from(meta.spkiDerBase64, 'base64'));
  const audits: AuditRecord[] = [];
  const deps: VerifierDeps = {
    keyRegistry: {
      async lookup(keyId, registryVersion) {
        if (keyId !== meta.signingIdentity.keyId || registryVersion !== meta.signingIdentity.registryVersion) {
          return 'unknown';
        }
        return {
          keyId,
          state: 'ACTIVE',
          spkiDer,
          notBefore: '2026-01-01T00:00:00.000Z',
          notAfter: '2027-01-01T00:00:00.000Z',
        };
      },
    },
    authority: {
      async revisionState(projectId, revisionId) {
        return projectId === meta.releasedRevision.projectId && revisionId === meta.releasedRevision.revisionId
          ? 'RELEASED'
          : 'NOT_RELEASED';
      },
      async machineProfileAllowed(id, version, sha256) {
        return id === 'kdt_mvp_v1' && version === '1.0.0' && sha256 === meta.machineProfileSha256;
      },
      async exporterAllowed(id, version, buildCommit, artifactSha256) {
        const e = meta.exporter;
        return id === e.id && version === e.version && buildCommit === e.buildCommit && artifactSha256 === e.artifactSha256;
      },
      async registryVersionCurrent(registryVersion) {
        return registryVersion === meta.signingIdentity.registryVersion;
      },
      async gatePolicySupported(policyVersion) {
        return policyVersion === meta.gatePolicyVersion;
      },
    },
    runRegistry: {
      async bindingForRun(jobRunId) {
        return jobRunId === meta.run.jobRunId ? { packetContentId: meta.packetContentId } : null;
      },
      async bindingForFingerprint(fingerprint) {
        return fingerprint === meta.run.idempotencyFingerprint ? { jobRunId: meta.run.jobRunId } : null;
      },
    },
    governance: { shadowMode: true },
    auditSink: { async append(r) { audits.push(r); } },
    now: () => '2026-07-18T10:00:00.000Z',
  };
  return { deps, audits };
}

describe('S17 Track B black-box interop — frozen S17-4 artifact → S17-5 verifier', () => {
  it('fixture bytes are the pinned frozen-generator artifact', () => {
    const { meta, zip } = loadFixture();
    expect(meta.generatorCommit).toBe(GENERATOR_COMMIT);
    const actual = createHash('sha256').update(zip).digest('hex');
    expect(actual).toBe(ZIP_SHA256);
    expect(actual).toBe(meta.zipSha256);
    expect(zip.length).toBe(meta.zipBytes);
    expect(meta.kmsSignCalls).toBe(1);
    expect(meta.zipFilename).toMatch(NFP_FILENAME_REGEX);
  });

  it('verifies as exactly {VERIFIED, NO_CUT, PKT_OK_SHADOW_ONLY}', async () => {
    const { meta, zip } = loadFixture();
    const { deps, audits } = depsFromMeta(meta);
    const { result, audit } = await verifyPacket(zip, meta.zipFilename, deps);

    expect(result).toEqual({
      integrityStatus: 'VERIFIED',
      operationalDisposition: 'NO_CUT',
      code: 'PKT_OK_SHADOW_ONLY',
      diagnostics: [],
    });
    expect(result.failedCheck).toBeUndefined();

    // the verifier's own reading of the packet must agree with the generator's
    // identity claims — cross-implementation agreement, not trust in meta
    expect(audit.packetContentId).toBe(meta.packetContentId);
    expect(audit.manifestSha256).toBe(meta.manifestSha256);
    expect(audit.jobRunId).toBe(meta.run.jobRunId);
    expect(audits).toHaveLength(1);
  });

  it('is non-vacuous: one flipped payload byte fails closed at NO_CUT', async () => {
    const { meta, zip } = loadFixture();
    const { deps } = depsFromMeta(meta);
    const tampered = new Uint8Array(zip);
    // flip one byte inside stored (STORE) payload data, past the first local header
    tampered[200] ^= 0x01;
    const { result } = await verifyPacket(tampered, meta.zipFilename, deps);
    expect(result.integrityStatus).toBe('FAILED');
    expect(result.operationalDisposition).toBe('NO_CUT');
    expect(result.failedCheck).toBeDefined();
  });
});

// Feature: production-trust-kernel — Task 11 P2 quarantine + client projection +
// legacy-route containment (design §9 Artifact Class Matrix, §15 legacy migration).
//
// Invariant under test: a human/client can never reach P2 plaintext, a raw storage
// locator, or a reusable signed URL, and the client authority path never carries an
// actor role/name. The client sees server PROJECTIONS only (status + references).
import { describe, it, expect } from 'vitest';
import {
  projectFactoryPacketStatus,
  requestLegacyManufacturingDownload,
  requestShadowP2AsHuman,
  requestShadowP2AsIsolatedRunner,
  isProductionShapedArtifact,
  assertNotProductionShaped,
  routeLedgerCoverage,
  SAFE_PROJECTION_FIELDS,
} from '../trustKernelProjection';
import { buildIntentRequest } from '../../../core/api/trustKernelApi';
import { downloadTextFile } from '../../../export/cutList/download';
import { downloadFile } from '../../../core/export/downloadArtifacts';
import ledger from '../../../../docs/governance/trust-kernel-route-disposition.json';

const HASH = 'a'.repeat(64);
const AUTHZ = 'b'.repeat(64);
const activeRelease = { status: 'ACTIVE', releaseRevisionId: 'RR-1' };
const revokedRelease = { status: 'REVOKED', releaseRevisionId: 'RR-2' };

describe('client projection — never leaks a raw locator / signed URL / plaintext', () => {
  it('projectFactoryPacketStatus keeps status + references and DROPS locator/url/bytes/plaintext', () => {
    const raw = {
      candidateHash: HASH,
      releaseStatus: 'ACTIVE',
      artifactStatus: 'AVAILABLE',
      artifactClass: 'P2_MANUFACTURING',
      contentHash: HASH,
      expectedPacketHash: HASH,
      reportRef: 'report://RR-1',
      evidenceRef: 'evidence://RR-1',
      // forbidden fields that must never survive the projection:
      objectLocator: 'T/S/RR-1/' + HASH,
      object_locator: 'T/S/RR-1/' + HASH,
      signedUrl: 'https://store/sign?token=xyz',
      url: 'https://store/sign?token=xyz',
      storagePath: 'JOB-1/deadbeef.zip',
      plaintext: 'G0 X0 Y0',
      bytes: [1, 2, 3],
      zipBase64: 'UEsDBBQ',
    };
    const projected = projectFactoryPacketStatus(raw);
    expect(projected.releaseStatus).toBe('ACTIVE');
    expect(projected.artifactStatus).toBe('AVAILABLE');
    expect(projected.reportRef).toBe('report://RR-1');
    // No forbidden key survives, under any casing/spelling.
    const serialized = JSON.stringify(projected).toLowerCase();
    for (const banned of ['locator', 'signedurl', 'storagepath', 'plaintext', 'bytes', 'zipbase64', 'sign?token']) {
      expect(serialized).not.toContain(banned);
    }
    // Every surviving key is on the allow-list.
    for (const key of Object.keys(projected)) {
      expect(SAFE_PROJECTION_FIELDS).toContain(key);
    }
  });
});

describe('legacy manufacturing download — client is never a P2 authority', () => {
  it('a FROZEN client candidate cannot pull a manufacturing artifact (STATE_CANDIDATE_STALE)', async () => {
    expect(await requestLegacyManufacturingDownload('FROZEN')).toMatchObject({
      ok: false,
      code: 'STATE_CANDIDATE_STALE',
    });
  });
  it('a DRAFT client state is likewise denied a production-shaped artifact', async () => {
    expect((await requestLegacyManufacturingDownload('DRAFT')).ok).toBe(false);
  });
});

describe('shadow P2 read — human/client denied, only the isolated workload streams', () => {
  it('a human is denied P2 plaintext (STORE_PLAINTEXT_ACCESS_DENIED)', async () => {
    expect(await requestShadowP2AsHuman(activeRelease)).toMatchObject({
      ok: false,
      code: 'STORE_PLAINTEXT_ACCESS_DENIED',
    });
  });
  it('the isolated workload runner streams bytes (WORKLOAD_STREAM) — never returns a URL/locator', async () => {
    const res = await requestShadowP2AsIsolatedRunner(activeRelease);
    expect(res).toMatchObject({ ok: true, value: { mode: 'WORKLOAD_STREAM' } });
    if (res.ok) {
      expect(JSON.stringify(res.value).toLowerCase()).not.toContain('url');
      expect(JSON.stringify(res.value).toLowerCase()).not.toContain('locator');
    }
  });
  it('the isolated runner rechecks revocation: a REVOKED release cannot be streamed', async () => {
    expect((await requestShadowP2AsIsolatedRunner(revokedRelease)).ok).toBe(false);
  });
});

describe('download primitives — P2 manufacturing egress is contained', () => {
  it('classifies unambiguous P2 manufacturing artifacts', () => {
    for (const f of ['cutlist_ab12.csv', 'panel.dxf', 'job.nc', 'prog.gcode', 'part.cix', 'NFP-factory-packet-x.zip']) {
      expect(isProductionShapedArtifact(f)).toBe(true);
    }
  });
  it('allows P0/P1 review + proof artifacts', () => {
    for (const f of ['manifest.json', 'release_RR-1_evidence.json', 'cost-breakdown.pdf', 'thumb.png']) {
      expect(isProductionShapedArtifact(f)).toBe(false);
      expect(() => assertNotProductionShaped(f)).not.toThrow();
    }
  });
  it('downloadTextFile refuses a cut-list CSV before any browser egress', () => {
    expect(() => downloadTextFile('cutlist_ab12.csv', 'ROW\n1')).toThrow(/NOT_FOR_PRODUCTION/);
  });
  it('downloadFile refuses a DXF/CNC artifact before any browser egress', () => {
    expect(() => downloadFile('panel.dxf', 'DXF')).toThrow(/NOT_FOR_PRODUCTION/);
    expect(() => downloadFile('job.nc', new Uint8Array([1, 2]))).toThrow(/NOT_FOR_PRODUCTION/);
  });
});

describe('client authority intents — no actor role/name ever leaves the client', () => {
  it('buildIntentRequest targets the V3 authority and carries only allow-listed hashes', () => {
    const built = buildIntentRequest(
      'release',
      'JOB-1',
      {
        candidateHash: HASH,
        releaseAuthorizationHash: AUTHZ,
        idempotencyKey: 'idem-1',
        requestHash: 'c'.repeat(64),
        // spoof attempts that must be dropped:
        role: 'ADMIN',
        name: 'mallory',
        tenantId: 'T-EVIL',
        siteId: 'S-EVIL',
        actorRole: 'ADMIN',
      } as Record<string, unknown>,
      { bearer: 'Bearer user-jwt', apikey: 'anon-key' },
    );
    expect(built.url).toContain('/v3/factory/jobs/JOB-1/release');
    expect(built.method).toBe('POST');
    // Headers never carry a client actor identity.
    const headerKeys = Object.keys(built.headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('x-actor-role');
    expect(headerKeys).not.toContain('x-actor-name');
    expect(built.headers.Authorization ?? built.headers.authorization).toBe('Bearer user-jwt');
    // Body carries only the release hashes — no role/name/tenant/site.
    const body = JSON.parse(built.body);
    expect(body).toEqual({
      candidateHash: HASH,
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: 'idem-1',
      requestHash: 'c'.repeat(64),
    });
    const serialized = JSON.stringify(built).toLowerCase();
    expect(serialized).not.toContain('admin');
    expect(serialized).not.toContain('mallory');
    expect(serialized).not.toContain('t-evil');
  });

  it('a freeze intent carries only the frozen candidate hashes', () => {
    const built = buildIntentRequest(
      'freeze',
      'WR-1',
      { candidateHash: HASH, snapshotHash: HASH, role: 'DESIGNER' } as Record<string, unknown>,
      { bearer: 'Bearer u', apikey: 'a' },
    );
    expect(built.url).toContain('/v3/factory/jobs/WR-1/freeze');
    expect(JSON.parse(built.body)).not.toHaveProperty('role');
  });
});

describe('route disposition ledger — discovered surfaces are complete and authority is single', () => {
  it('every enforced ledger file is covered and mutable release authority is not duplicated', () => {
    const enforcedFiles = ledger.routes.filter((r) => r.enforced).map((r) => r.file);
    expect(routeLedgerCoverage(enforcedFiles, ledger)).toEqual({ missing: [], duplicateAuthority: [] });
  });
  it('a reachable surface with no ledger entry is reported missing', () => {
    const cov = routeLedgerCoverage(['src/some/unledgered/surface.ts'], ledger);
    expect(cov.missing).toContain('src/some/unledgered/surface.ts');
  });
  it('exactly one enforced route holds the mutable release authority', () => {
    const mutable = ledger.routes.filter((r) => r.enforced && r.authority === 'RELEASE_MUTABLE');
    expect(mutable).toHaveLength(1);
  });
  it('every ledger route declares an owner, disposition, and negative test', () => {
    for (const r of ledger.routes) {
      expect(r.owner).toBeTruthy();
      expect(['REUSE', 'ADAPT', 'READ_ONLY', 'BLOCK']).toContain(r.disposition);
      expect(r.negativeTestId).toBeTruthy();
    }
  });
});

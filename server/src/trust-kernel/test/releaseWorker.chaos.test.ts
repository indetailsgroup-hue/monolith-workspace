/**
 * releaseWorker.chaos.test.ts - Task 8 managed signer + release worker chaos suite
 *
 * The release worker's ONE non-negotiable invariant: no private key material ever
 * touches the tree. Signing happens only through the `ManagedSignerPort`, which
 * takes a SHA-256 digest and returns a signature - never a seed, PEM, or raw key
 * (approved design 2026-07-22 §8, §10.2, §11.2). This suite injects fakes for the
 * signer, the private store, and the release authority (the DB) so the exact
 * sign -> assemble -> hash -> commit -> materialize order and every failure branch
 * are exercised without a live stack.
 *
 * Transaction chaos coverage (design §16.3, plan Task 8 Step 1): signer timeout,
 * store failure, DB commit loss, crash after commit / before materialization,
 * hash mismatch, outbox duplicate, and membership revoked before the final commit.
 * Every case asserts the SAFETY outcome: a stable reason code, no downloadable
 * orphan, no second certificate, and no second signature.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { describe, it, expect, vi } from 'vitest';

import { ok, err, type TrustResult } from '../result.js';
import { sha256Hex, computeReleaseAuthorizationHash } from '../canonical/hash.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { canonicalProfileHash } from '../capability/canonicalProfile.js';
import { buildReleaseSnapshot } from '../snapshot/buildReleaseSnapshot.js';
import type {
  Sha256Hex,
  TenantScopeV1,
  ReleaseSnapshotV3,
  ReleaseCertificateV1,
  MachineProfileAttestationV1,
  ArtifactStatus,
} from '../contracts/protocolV3.js';
import type {
  CanonicalMachineProfileV1,
  CapabilitySnapshotV1,
} from '../contracts/capability.js';
import type {
  ReleaseAuthorityPort,
  CommitReleaseRequest,
  CommitReleaseResult,
  MarkArtifactAvailableRequest,
  MarkArtifactAvailableResult,
  VoidArtifactRequest,
  VoidArtifactResult,
  FreezeRequest,
  FreezeResult,
  BeginReleaseRequest,
  BeginReleaseResult,
  RevokeReleaseRequest,
  RevokeReleaseResult,
} from '../contracts/releasePorts.js';

import {
  type ManagedSignerPort,
  type ManagedSignature,
  type ManagedSignerSignInput,
} from '../signing/managedSignerPort.js';
import {
  HttpManagedSignerClient,
  type FetchLike,
} from '../signing/httpManagedSignerClient.js';
import {
  InMemoryPrivateArtifactRepository,
  type ArtifactStorePort,
} from '../artifacts/artifactRepository.js';
import {
  executeReleaseAttempt,
  EXPECTED_PACKET_HASH_SENTINEL,
  type ReleaseAllocationV1,
  type AllocationReaderPort,
  type ReleaseWorkerPorts,
} from '../worker/releaseWorker.js';
import {
  materializeArtifact,
  type MaterializeOutboxEventV1,
  type MaterializePorts,
} from '../worker/materializeArtifact.js';
import { SupabaseReleaseAuthority } from '../authority/supabaseReleaseAuthority.js';

// ===========================================================================
// Deterministic fixtures
// ===========================================================================

const TENANT_SCOPE: TenantScopeV1 = {
  tenantId: 'tenant-001',
  orgId: 'org-monolith',
  siteId: 'site-001',
  policyVersion: 'policy-2026.07',
};

const SIGNER_KEY_ID = 'dev-release-ed25519-0001';

function baseProfile(): CanonicalMachineProfileV1 {
  return {
    machineId: 'CNC-001',
    machineVersion: '1.0.0',
    dialectVersion: 'CIX-4.2',
    operationCatalogue: ['DRILL', 'ROUTE', 'BORE'],
    tools: [
      { toolId: 'T_DRILL_8', machineNumber: 2 },
      { toolId: 'T_ROUTE_6', machineNumber: 5 },
      { toolId: 'T_BORE_35', machineNumber: 4 },
    ],
    ranges: [
      { parameter: 'depth', min: 0, max: 40, unit: 'mm' },
      { parameter: 'diameter', min: 1, max: 20, unit: 'mm' },
    ],
    faces: ['TOP', 'BOTTOM'],
    units: 'mm',
    coordinateConvention: 'ISO-TOP-LEFT',
    postprocessorId: 'pp-nc-1000',
    postprocessorVersion: '1.2.3',
    postprocessorBinaryHash: 'c'.repeat(64),
  };
}

function attestationFor(profile: CanonicalMachineProfileV1): MachineProfileAttestationV1 {
  return {
    attestationId: '11111111-1111-1111-1111-111111111111',
    tenantId: 'tenant-001',
    siteId: 'site-001',
    machineId: profile.machineId,
    profileHash: canonicalProfileHash(profile),
    toolLibraryHash: 'b'.repeat(64),
    postprocessorId: profile.postprocessorId,
    postprocessorVersion: profile.postprocessorVersion,
    postprocessorBinaryHash: profile.postprocessorBinaryHash,
    approverUserId: 'user-approver',
    issuedAt: '2026-07-23T00:00:00.000Z',
    validFrom: '2026-07-23T00:00:00.000Z',
    validUntil: '2026-07-25T00:00:00.000Z',
    status: 'ACTIVE',
    attestationSequence: 1,
    signature: { alg: 'ed25519', keyId: 'dev-profile-attestation-key', sig: '0'.repeat(64) },
  };
}

function unwrap<T>(r: TrustResult<T>): T {
  if (!r.ok) {
    throw new Error(`expected ok result, received failure ${(r as { code: string }).code}`);
  }
  return r.value;
}

function buildAllocation(): ReleaseAllocationV1 {
  const profile = baseProfile();
  const profileHash = canonicalProfileHash(profile);
  const candidateHash = sha256Hex('MONOLITH/fixture/candidate/wr-0001');
  const snapshot: ReleaseSnapshotV3 = unwrap(
    buildReleaseSnapshot({
      tenantScope: TENANT_SCOPE,
      workingRevisionId: 'wr-0001',
      candidateHash,
      contentRefs: ['operation/drill/op-1', 'entity/panel/P-001'],
      machineProfileHash: profileHash,
      policyVersion: 'policy-2026.07',
      profileVersion: 'profile-cnc-01-v3',
    }),
  );
  const capabilitySnapshot: CapabilitySnapshotV1 = {
    machineProfileHash: profileHash,
    operations: [
      { operationId: 'op-1', operationType: 'DRILL', toolId: 'T_DRILL_8', face: 'TOP', parameters: { depth: 10, diameter: 8 } },
    ],
  };
  const attestation = attestationFor(profile);
  return {
    attemptId: 'attempt-0001',
    status: 'PENDING',
    releaseRevisionId: 'rr-000000000000000000000001',
    releaseSequence: 1,
    releasedAt: '1980-01-01T00:00:00.000Z',
    signerKeyId: SIGNER_KEY_ID,
    artifactId: 'artifact-0001',
    objectLocator: 'tenant-001/site-001/rr-000000000000000000000001/packet.zip',
    artifactClass: 'P2_MANUFACTURING',
    tenantScope: TENANT_SCOPE,
    candidateHash,
    releaseAuthorizationHash: computeReleaseAuthorizationHash(candidateHash, []),
    sortedGrantHashes: [],
    attestationId: attestation.attestationId,
    attestationHash: sha256Hex('MONOLITH/fixture/attestation/att-0001'),
    snapshot,
    capabilitySnapshot,
    machineProfile: profile,
    attestation,
  };
}

// ===========================================================================
// Fake managed signer (NEVER receives private key material)
// ===========================================================================

interface FakeSignerOptions {
  mode?: 'ok' | 'timeout' | 'algorithmDenied';
}

function makeFakeSigner(opts: FakeSignerOptions = {}) {
  const mode = opts.mode ?? 'ok';
  const capturedInputs: ManagedSignerSignInput[] = [];
  const sign = vi.fn(
    async (input: Readonly<ManagedSignerSignInput>): Promise<TrustResult<Readonly<ManagedSignature>>> => {
      capturedInputs.push({ ...input });
      if (mode === 'timeout') {
        return err('CRYPTO_SIGNER_UNAVAILABLE', { reason: 'timeout' });
      }
      if (mode === 'algorithmDenied') {
        return err('CRYPTO_ALGORITHM_DENIED', { reason: 'wrong purpose' });
      }
      // Deterministic, digest-derived signature (Ed25519 is deterministic per RFC 8032).
      const sig = Buffer.from(
        sha256Hex('ED25519|' + input.keyId + '|' + input.digestSha256) +
          sha256Hex('ED25519B|' + input.digestSha256),
        'hex',
      ).toString('base64');
      return ok({ algorithm: 'Ed25519', keyId: input.keyId, signatureBase64: sig });
    },
  );
  return { sign, capturedInputs, port: { sign } as ManagedSignerPort };
}

// ===========================================================================
// Fake private artifact store (+ an exposeUrl spy that MUST never be called)
// ===========================================================================

interface FakeStoreOptions {
  failQuarantine?: boolean;
  failMaterialize?: boolean;
  corruptMaterialize?: boolean;
}

function makeFakeStore(opts: FakeStoreOptions = {}) {
  const quarantine = new Map<string, Uint8Array>();
  const materialized = new Map<string, Uint8Array>();
  const voided = new Set<string>();

  const writeQuarantined = vi.fn(async (input: { locator: string; bytes: Uint8Array }): Promise<TrustResult<void>> => {
    if (opts.failQuarantine) return err('STORE_QUARANTINE_FAILED', { reason: 'injected' });
    quarantine.set(input.locator, input.bytes);
    return ok(undefined);
  });
  const readQuarantined = vi.fn(async (locator: string): Promise<TrustResult<Uint8Array>> => {
    const bytes = quarantine.get(locator);
    return bytes === undefined ? err('STORE_ARTIFACT_UNAVAILABLE', { locator }) : ok(bytes);
  });
  const writeMaterialized = vi.fn(async (input: { locator: string; bytes: Uint8Array }): Promise<TrustResult<void>> => {
    if (opts.failMaterialize) return err('STORE_ARTIFACT_UNAVAILABLE', { reason: 'injected' });
    // Corruption flips one byte so the stored hash diverges from the expected hash.
    const stored = opts.corruptMaterialize
      ? (() => {
          const copy = Buffer.from(input.bytes);
          copy[0] = copy[0] ^ 0xff;
          return new Uint8Array(copy);
        })()
      : input.bytes;
    materialized.set(input.locator, stored);
    return ok(undefined);
  });
  const readStoredHash = vi.fn(async (locator: string): Promise<TrustResult<Sha256Hex>> => {
    const bytes = materialized.get(locator);
    return bytes === undefined ? err('STORE_ARTIFACT_UNAVAILABLE', { locator }) : ok(sha256Hex(bytes));
  });
  const markVoid = vi.fn(async (locator: string): Promise<TrustResult<void>> => {
    voided.add(locator);
    quarantine.delete(locator);
    // Voiding drops any materialized bytes too, so a post-write abort leaves no
    // orphan under the internal locator (PGB-2).
    materialized.delete(locator);
    return ok(undefined);
  });
  // The publication method that belongs to Task 11. Task 8 must NEVER call it.
  const exposeUrl = vi.fn(async (): Promise<string> => 'https://leak.invalid/should-never-happen');

  const port: ArtifactStorePort = { writeQuarantined, readQuarantined, writeMaterialized, readStoredHash, markVoid };
  return {
    port,
    exposeUrl,
    writeQuarantined,
    readQuarantined,
    writeMaterialized,
    readStoredHash,
    markVoid,
    quarantine,
    materialized,
    voided,
  };
}

// ===========================================================================
// Fake release authority (the DB) implementing ReleaseAuthorityPort + reads
// ===========================================================================

interface FakeDbOptions {
  commitError?: 'STATE_CONFLICT' | 'AUTH_MEMBERSHIP_REVOKED' | 'STORE_HASH_MISMATCH';
}

function makeFakeDb(allocation: ReleaseAllocationV1, opts: FakeDbOptions = {}) {
  const revisions = new Map<string, { certificate: ReleaseCertificateV1; expectedPacketHash: Sha256Hex; contentHash: Sha256Hex }>();
  const artifactStatus = new Map<string, ArtifactStatus>([[allocation.artifactId, 'QUARANTINED']]);
  const outbox: MaterializeOutboxEventV1[] = [];
  const attemptStatus = new Map<string, string>([[allocation.attemptId, allocation.status]]);

  const readAllocation = vi.fn(async (attemptId: string): Promise<TrustResult<ReleaseAllocationV1>> => {
    if (attemptId !== allocation.attemptId) return err('STATE_CONFLICT', { attemptId });
    if (attemptStatus.get(attemptId) !== 'PENDING') return err('STATE_CONFLICT', { attemptId });
    return ok(allocation);
  });
  const getArtifactStatus = vi.fn(async (artifactId: string): Promise<TrustResult<ArtifactStatus>> => {
    const s = artifactStatus.get(artifactId);
    return s === undefined ? err('STORE_ARTIFACT_UNAVAILABLE', { artifactId }) : ok(s);
  });

  const commitRelease = vi.fn(async (request: CommitReleaseRequest): Promise<TrustResult<CommitReleaseResult>> => {
    if (opts.commitError) return err(opts.commitError, { reason: 'injected' });
    revisions.set(allocation.releaseRevisionId, {
      certificate: request.certificate,
      expectedPacketHash: request.expectedPacketHash,
      contentHash: request.contentHash,
    });
    artifactStatus.set(allocation.artifactId, 'MATERIALIZING');
    attemptStatus.set(allocation.attemptId, 'PENDING'); // published only after materialize
    outbox.push({
      attemptId: allocation.attemptId,
      releaseRevisionId: allocation.releaseRevisionId,
      artifactId: allocation.artifactId,
      objectLocator: allocation.objectLocator,
      contentHash: request.contentHash,
      expectedPacketHash: request.expectedPacketHash,
      certificate: request.certificate,
      tenantScope: allocation.tenantScope,
      artifactClass: allocation.artifactClass,
    });
    return ok({ releaseRevisionId: allocation.releaseRevisionId });
  });

  const markArtifactAvailable = vi.fn(async (request: MarkArtifactAvailableRequest): Promise<TrustResult<MarkArtifactAvailableResult>> => {
    // Idempotent: MATERIALIZING -> AVAILABLE, and AVAILABLE -> AVAILABLE (recovery replays).
    artifactStatus.set(request.artifactId, 'AVAILABLE');
    attemptStatus.set(allocation.attemptId, 'PUBLISHED');
    return ok({ artifactId: request.artifactId, status: 'AVAILABLE' });
  });

  const voidArtifact = vi.fn(async (request: VoidArtifactRequest): Promise<TrustResult<VoidArtifactResult>> => {
    attemptStatus.set(request.attemptId, 'VOID');
    artifactStatus.set(allocation.artifactId, 'VOID');
    return ok({ attemptId: request.attemptId, status: 'VOID' });
  });

  // Unused-by-Task-8 authority methods (present to satisfy the port shape).
  const freeze = vi.fn(async (_r: FreezeRequest): Promise<TrustResult<FreezeResult>> => err('STATE_CONFLICT'));
  const beginRelease = vi.fn(async (_r: BeginReleaseRequest): Promise<TrustResult<BeginReleaseResult>> => err('STATE_CONFLICT'));
  const revoke = vi.fn(async (_r: RevokeReleaseRequest): Promise<TrustResult<RevokeReleaseResult>> => err('STATE_CONFLICT'));

  const db: ReleaseAuthorityPort & AllocationReaderPort = {
    freeze,
    beginRelease,
    commitRelease,
    markArtifactAvailable,
    voidArtifact,
    revoke,
    readAllocation,
    getArtifactStatus,
  };
  return { db, revisions, artifactStatus, attemptStatus, outbox, commitRelease, markArtifactAvailable, voidArtifact, readAllocation, getArtifactStatus };
}

// ===========================================================================
// Scenario harness
// ===========================================================================

async function runAttempt(overrides: {
  signer?: ReturnType<typeof makeFakeSigner>;
  store?: ReturnType<typeof makeFakeStore>;
  db?: ReturnType<typeof makeFakeDb>;
  allocation?: ReleaseAllocationV1;
}) {
  const allocation = overrides.allocation ?? buildAllocation();
  const signer = overrides.signer ?? makeFakeSigner();
  const store = overrides.store ?? makeFakeStore();
  const db = overrides.db ?? makeFakeDb(allocation);
  const ports: ReleaseWorkerPorts = { db: db.db, signer: signer.port, store: store.port };
  const result = await executeReleaseAttempt(allocation.attemptId, ports);
  return { result, allocation, signer, store, db, ports };
}

// ===========================================================================
// 1. Signer timeout -> CRYPTO_SIGNER_UNAVAILABLE, NO commit, quarantine voided
// ===========================================================================

describe('release worker: signer timeout (design §10.3)', () => {
  it('returns CRYPTO_SIGNER_UNAVAILABLE, never commits, and voids the quarantine', async () => {
    const signer = makeFakeSigner({ mode: 'timeout' });
    const { result, store, db } = await runAttempt({ signer });

    expect(result).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
    expect(db.commitRelease).not.toHaveBeenCalled();
    expect(store.markVoid).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect(db.revisions.size).toBe(0);
    expect(store.materialized.size).toBe(0);
  });
});

// ===========================================================================
// 2. Wrong-purpose / algorithm-denied signer -> CRYPTO_ALGORITHM_DENIED
// ===========================================================================

describe('release worker: signer algorithm/purpose denied', () => {
  it('returns CRYPTO_ALGORITHM_DENIED, never commits, and voids the quarantine', async () => {
    const signer = makeFakeSigner({ mode: 'algorithmDenied' });
    const { result, store, db } = await runAttempt({ signer });

    expect(result).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
    expect(db.commitRelease).not.toHaveBeenCalled();
    expect(store.markVoid).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect(db.revisions.size).toBe(0);
  });
});

// ===========================================================================
// 3. Store (quarantine) failure -> artifact VOID, no commit, no exposed URL
// ===========================================================================

describe('release worker: private-store quarantine failure (design §10.3)', () => {
  it('ends the attempt at VOID with STORE_QUARANTINE_FAILED and never signs or commits', async () => {
    const store = makeFakeStore({ failQuarantine: true });
    const signer = makeFakeSigner();
    const { result, db } = await runAttempt({ store, signer });

    expect(result).toMatchObject({ ok: false, code: 'STORE_QUARANTINE_FAILED' });
    expect(signer.sign).not.toHaveBeenCalled();
    expect(db.commitRelease).not.toHaveBeenCalled();
    expect(db.voidArtifact).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect(db.revisions.size).toBe(0);
  });
});

// ===========================================================================
// 4. DB commit loss -> store.markVoid once, no revision, no exposed URL
// ===========================================================================

describe('release worker: DB commit failure (design §10.3 store-success + db-fail)', () => {
  it('discards the in-memory bytes, marks the private artifact void, and creates no revision', async () => {
    const allocation = buildAllocation();
    const db = makeFakeDb(allocation, { commitError: 'STATE_CONFLICT' });
    const { result, store } = await runAttempt({ allocation, db });

    expect(result).toMatchObject({ ok: false, code: 'STATE_CONFLICT' });
    expect(store.markVoid).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect(db.revisions.size).toBe(0);
    expect(store.materialized.size).toBe(0);
  });
});

// ===========================================================================
// 5. Membership revoked before the final commit -> rejected, no revision
// ===========================================================================

describe('release worker: membership revoked before final commit (design §10.2 step 7)', () => {
  it('is rejected at commit with AUTH_MEMBERSHIP_REVOKED and produces no release revision', async () => {
    const allocation = buildAllocation();
    const db = makeFakeDb(allocation, { commitError: 'AUTH_MEMBERSHIP_REVOKED' });
    const signer = makeFakeSigner();
    const { result, store } = await runAttempt({ allocation, db, signer });

    expect(result).toMatchObject({ ok: false, code: 'AUTH_MEMBERSHIP_REVOKED' });
    expect(signer.sign).toHaveBeenCalledTimes(1); // signed in memory, but the commit rejected it
    expect(store.markVoid).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect(db.revisions.size).toBe(0);
  });
});

// ===========================================================================
// 6. Happy path -> exact order, one signature, one certificate, expected hash
// ===========================================================================

describe('release worker: successful attempt (design §10.2)', () => {
  it('signs a digest, commits ONE certificate, and returns the sha256 of the final bytes', async () => {
    const { result, allocation, signer, store, db } = await runAttempt({});

    expect(result.ok).toBe(true);
    const value = unwrap(result);
    expect(value.releaseRevisionId).toBe(allocation.releaseRevisionId);
    expect(value.expectedPacketHash).toMatch(/^[0-9a-f]{64}$/);

    // Exactly one signature and one certificate.
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(db.commitRelease).toHaveBeenCalledTimes(1);
    expect(db.revisions.size).toBe(1);

    // The committed expected hash is the sha256 of the assembled final bytes.
    const committed = db.revisions.get(allocation.releaseRevisionId)!;
    expect(committed.expectedPacketHash).toBe(value.expectedPacketHash);

    // The embedded certificate carries the NON-circular sentinel, not the packet hash.
    expect(committed.certificate.expectedPacketHash).toBe(EXPECTED_PACKET_HASH_SENTINEL);
    expect(committed.certificate.expectedPacketHash).not.toBe(value.expectedPacketHash);

    // Quarantine was written; nothing was ever exposed as a URL.
    expect(store.writeQuarantined).toHaveBeenCalledTimes(1);
    expect(store.markVoid).not.toHaveBeenCalled();
    expect(store.exposeUrl).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. Digest-only boundary: the signer sees ONLY { keyId, purpose, digestSha256 }
// ===========================================================================

describe('release worker: digest-only signing boundary (design §11.2)', () => {
  it('passes the signer a 64-hex digest and NO private key material', async () => {
    const { signer } = await runAttempt({});
    expect(signer.capturedInputs).toHaveLength(1);
    const input = signer.capturedInputs[0];
    expect(Object.keys(input).sort()).toEqual(['digestSha256', 'keyId', 'purpose']);
    expect(input.digestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(input.keyId).toBe(SIGNER_KEY_ID);
    expect(input.purpose).toBe('RELEASE');
    // No seed / private / pem / secret smuggled through the port input.
    for (const forbidden of ['privateKey', 'seed', 'pem', 'secret', 'key', 'd', 'keyMaterial']) {
      expect(forbidden in input).toBe(false);
    }
  });
});

// ===========================================================================
// 8. Materialize after commit: reconstructs identical bytes, marks AVAILABLE
// ===========================================================================

async function commitThenOutbox() {
  const allocation = buildAllocation();
  const signer = makeFakeSigner();
  const store = makeFakeStore();
  const db = makeFakeDb(allocation);
  const ports: ReleaseWorkerPorts = { db: db.db, signer: signer.port, store: store.port };
  const attemptResult = await executeReleaseAttempt(allocation.attemptId, ports);
  expect(attemptResult.ok).toBe(true);
  const event = db.outbox[0];
  const materializePorts: MaterializePorts = { db: db.db, store: store.port };
  return { allocation, signer, store, db, event, materializePorts, attemptResult };
}

describe('release worker: post-commit materialization (design §10.2 step 9)', () => {
  it('reconstructs identical bytes from the persisted payload+certificate and marks AVAILABLE', async () => {
    const { store, db, event, materializePorts } = await commitThenOutbox();
    const r = await materializeArtifact(event, materializePorts);
    const record = unwrap(r);

    expect(record.status).toBe('AVAILABLE');
    expect(record.expectedPacketHash).toBe(event.expectedPacketHash);
    expect(db.markArtifactAvailable).toHaveBeenCalledTimes(1);
    expect(store.materialized.size).toBe(1);
    // The stored bytes hash to the committed expected packet hash.
    expect(sha256Hex(store.materialized.get(event.objectLocator)!)).toBe(event.expectedPacketHash);
    // Containment: no raw URL, no signed URL on the returned record; internal locator only.
    expect(store.exposeUrl).not.toHaveBeenCalled();
    expect('url' in record).toBe(false);
    expect('signedUrl' in record).toBe(false);
    expect(record.objectLocator).toBe(event.objectLocator);
    expect(record.objectLocator.startsWith('http')).toBe(false);
  });
});

// ===========================================================================
// 9. Crash after commit / before materialization -> retry: same bytes, ONE record
// ===========================================================================

describe('release worker: crash after commit, retry materialization (design §10.3)', () => {
  it('materializes the SAME bytes twice with ONE artifact record and ONE certificate/signature', async () => {
    const { signer, store, db, event, materializePorts } = await commitThenOutbox();

    const first = unwrap(await materializeArtifact(event, materializePorts));
    const second = unwrap(await materializeArtifact(event, materializePorts));

    expect(first.expectedPacketHash).toBe(second.expectedPacketHash);
    expect(store.materialized.size).toBe(1); // one record for the locator
    expect(db.revisions.size).toBe(1); // one certificate
    expect(signer.sign).toHaveBeenCalledTimes(1); // NO second signature
    expect(db.commitRelease).toHaveBeenCalledTimes(1); // NO second certificate
    // The recovery replay marks-available at most once (idempotent short-circuit).
    expect(db.markArtifactAvailable).toHaveBeenCalledTimes(1);
    expect(store.exposeUrl).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 10. Outbox duplicate -> idempotent
// ===========================================================================

describe('release worker: duplicate outbox delivery (design §10.3)', () => {
  it('is idempotent: a duplicate event yields the same record and no second write path', async () => {
    const { store, db, event, materializePorts } = await commitThenOutbox();
    const a = unwrap(await materializeArtifact(event, materializePorts));
    const b = unwrap(await materializeArtifact({ ...event }, materializePorts));
    expect(a.expectedPacketHash).toBe(b.expectedPacketHash);
    expect(a.status).toBe('AVAILABLE');
    expect(b.status).toBe('AVAILABLE');
    expect(store.materialized.size).toBe(1);
    expect(db.markArtifactAvailable).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 11. Hash mismatch: stored != expected -> STORE_HASH_MISMATCH, not AVAILABLE
// ===========================================================================

describe('release worker: stored-hash mismatch (design §10.2 step 9)', () => {
  it('returns STORE_HASH_MISMATCH and does not mark the artifact AVAILABLE', async () => {
    const allocation = buildAllocation();
    const signer = makeFakeSigner();
    const store = makeFakeStore({ corruptMaterialize: true });
    const db = makeFakeDb(allocation);
    const ports: ReleaseWorkerPorts = { db: db.db, signer: signer.port, store: store.port };
    expect((await executeReleaseAttempt(allocation.attemptId, ports)).ok).toBe(true);
    const event = db.outbox[0];

    const r = await materializeArtifact(event, { db: db.db, store: store.port });
    expect(r).toMatchObject({ ok: false, code: 'STORE_HASH_MISMATCH' });
    expect(db.markArtifactAvailable).not.toHaveBeenCalled();
    expect(db.artifactStatus.get(allocation.artifactId)).not.toBe('AVAILABLE');
    expect(store.exposeUrl).not.toHaveBeenCalled();
  });

  // PGB-2 cleanup: on a post-write hash mismatch the just-written bytes must be
  // voided so no orphan remains under the internal locator.
  it('voids the just-written bytes on a stored-hash mismatch (no orphan under the locator)', async () => {
    const allocation = buildAllocation();
    const signer = makeFakeSigner();
    const store = makeFakeStore({ corruptMaterialize: true });
    const db = makeFakeDb(allocation);
    const ports: ReleaseWorkerPorts = { db: db.db, signer: signer.port, store: store.port };
    expect((await executeReleaseAttempt(allocation.attemptId, ports)).ok).toBe(true);
    const event = db.outbox[0];

    const r = await materializeArtifact(event, { db: db.db, store: store.port });
    expect(r).toMatchObject({ ok: false, code: 'STORE_HASH_MISMATCH' });
    // The orphaned bytes are cleaned up: markVoid was called for the locator and
    // the store no longer holds any materialized bytes for it.
    expect(store.markVoid).toHaveBeenCalledWith(event.objectLocator);
    expect(store.voided.has(event.objectLocator)).toBe(true);
    expect(store.materialized.has(event.objectLocator)).toBe(false);
    expect(store.exposeUrl).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 12. Materialize store-write failure -> STORE_ARTIFACT_UNAVAILABLE, not AVAILABLE
// ===========================================================================

describe('release worker: materialization store failure', () => {
  it('returns STORE_ARTIFACT_UNAVAILABLE and does not mark AVAILABLE', async () => {
    const allocation = buildAllocation();
    const signer = makeFakeSigner();
    const okStore = makeFakeStore();
    const db = makeFakeDb(allocation);
    const ports: ReleaseWorkerPorts = { db: db.db, signer: signer.port, store: okStore.port };
    expect((await executeReleaseAttempt(allocation.attemptId, ports)).ok).toBe(true);
    const event = db.outbox[0];

    // Second store fails the materialized write but still holds the quarantined payload.
    const failing = makeFakeStore({ failMaterialize: true });
    failing.quarantine.set(event.objectLocator, okStore.quarantine.get(event.objectLocator)!);
    const r = await materializeArtifact(event, { db: db.db, store: failing.port });
    expect(r).toMatchObject({ ok: false, code: 'STORE_ARTIFACT_UNAVAILABLE' });
    expect(db.markArtifactAvailable).not.toHaveBeenCalled();
    expect(failing.exposeUrl).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 13. HttpManagedSignerClient: digest-only, private-key rejection, timeout
// ===========================================================================

describe('HttpManagedSignerClient (design §11.2)', () => {
  const DIGEST = sha256Hex('some-certificate-bytes');

  function client(fetchImpl: FetchLike) {
    return new HttpManagedSignerClient({
      endpoint: 'https://signer.internal/sign',
      keyId: SIGNER_KEY_ID,
      keyPurpose: 'RELEASE',
      credentialProvider: async () => 'workload-identity-token',
      timeoutMs: 1000,
      fetch: fetchImpl,
    });
  }

  it('sends only { keyId, purpose, digestSha256 } and returns an Ed25519 signature', async () => {
    let capturedBody: any = null;
    let capturedAuth: string | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'];
      return {
        ok: true,
        status: 200,
        json: async () => ({ algorithm: 'Ed25519', keyId: SIGNER_KEY_ID, signatureBase64: Buffer.alloc(64, 7).toString('base64') }),
      };
    };
    const r = await client(fetchImpl).sign({ keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: DIGEST });
    expect(r.ok).toBe(true);
    expect(unwrap(r).algorithm).toBe('Ed25519');
    expect(Object.keys(capturedBody).sort()).toEqual(['digestSha256', 'keyId', 'purpose']);
    expect(capturedBody.digestSha256).toBe(DIGEST);
    expect(capturedAuth).toBe('Bearer workload-identity-token');
  });

  it('rejects any attempt to pass private key material with CRYPTO_ALGORITHM_DENIED', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('fetch must not be reached when private key material is present');
    };
    const smuggled = { keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: DIGEST, privateKey: 'MC4CAQAwBQYDK2VwBCIEI...' } as any;
    const r = await client(fetchImpl).sign(smuggled);
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
  });

  it('maps a wrong key id to CRYPTO_ALGORITHM_DENIED without calling fetch', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const r = await client(fetchImpl as unknown as FetchLike).sign({ keyId: 'other-key', purpose: 'RELEASE', digestSha256: DIGEST });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a wrong purpose to CRYPTO_ALGORITHM_DENIED', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const r = await client(fetchImpl as unknown as FetchLike).sign({ keyId: SIGNER_KEY_ID, purpose: 'PROFILE_ATTESTATION', digestSha256: DIGEST });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-64-hex digest with CRYPTO_ALGORITHM_DENIED', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const r = await client(fetchImpl as unknown as FetchLike).sign({ keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: 'not-a-digest' });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a timeout/abort to CRYPTO_SIGNER_UNAVAILABLE', async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      return await new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) reject(makeAbortError());
          signal.addEventListener('abort', () => reject(makeAbortError()));
        }
      });
    };
    const c = new HttpManagedSignerClient({
      endpoint: 'https://signer.internal/sign',
      keyId: SIGNER_KEY_ID,
      keyPurpose: 'RELEASE',
      credentialProvider: async () => 'workload-identity-token',
      timeoutMs: 20,
      fetch: fetchImpl,
    });
    const r = await c.sign({ keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: DIGEST });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
  });

  it('maps a non-2xx signer response to CRYPTO_SIGNER_UNAVAILABLE', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const r = await client(fetchImpl).sign({ keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: DIGEST });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_SIGNER_UNAVAILABLE' });
  });

  it('rejects a non-Ed25519 signer response with CRYPTO_ALGORITHM_DENIED', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ algorithm: 'RSA', keyId: SIGNER_KEY_ID, signatureBase64: 'AAAA' }),
    });
    const r = await client(fetchImpl).sign({ keyId: SIGNER_KEY_ID, purpose: 'RELEASE', digestSha256: DIGEST });
    expect(r).toMatchObject({ ok: false, code: 'CRYPTO_ALGORITHM_DENIED' });
  });
});

function makeAbortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

// ===========================================================================
// 14. InMemoryPrivateArtifactRepository: real store, hash verify, no URL surface
// ===========================================================================

describe('InMemoryPrivateArtifactRepository (design §6.5, §9 P2 containment)', () => {
  it('quarantines, materializes, verifies its own stored hash, and exposes no URL method', async () => {
    const repo = new InMemoryPrivateArtifactRepository();
    const locator = 'tenant-001/site-001/rr-1/packet.zip';
    const bytes = new Uint8Array(Buffer.from('final-packet-bytes', 'utf-8'));

    expect((await repo.writeQuarantined({ locator, bytes: new Uint8Array(Buffer.from('payload')) })).ok).toBe(true);
    expect((await repo.writeMaterialized({ locator, bytes })).ok).toBe(true);
    const h = unwrap(await repo.readStoredHash(locator));
    expect(h).toBe(sha256Hex(bytes));

    // The private store surface has NO URL/expose method (that is Task 11).
    expect('exposeUrl' in repo).toBe(false);
    expect('signedUrl' in repo).toBe(false);
    expect('getUrl' in repo).toBe(false);
  });
});

// ===========================================================================
// 15. SupabaseReleaseAuthority: structural adapter (key IDs only, error mapping)
// ===========================================================================

describe('SupabaseReleaseAuthority (structural)', () => {
  it('maps a domain reason code echoed by an RPC to a stable TrustResult failure', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'AUTH_MEMBERSHIP_REVOKED: membership version changed' } }));
    const authority = new SupabaseReleaseAuthority({ rpc } as any);
    const r = await authority.commitRelease({
      attemptId: 'attempt-1',
      contentHash: 'a'.repeat(64),
      expectedPacketHash: 'b'.repeat(64),
      certificate: { signerKeyId: SIGNER_KEY_ID } as any,
      signerKeyId: SIGNER_KEY_ID,
    });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('AUTH_MEMBERSHIP_REVOKED');
  });

  it('returns the RPC payload on success', async () => {
    const rpc = vi.fn(async () => ({ data: { releaseRevisionId: 'rr-1' }, error: null }));
    const authority = new SupabaseReleaseAuthority({ rpc } as any);
    const r = await authority.commitRelease({
      attemptId: 'attempt-1',
      contentHash: 'a'.repeat(64),
      expectedPacketHash: 'b'.repeat(64),
      certificate: { signerKeyId: SIGNER_KEY_ID } as any,
      signerKeyId: SIGNER_KEY_ID,
    });
    expect(unwrap(r).releaseRevisionId).toBe('rr-1');
  });
});

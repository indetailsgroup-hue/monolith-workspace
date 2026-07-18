import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileExportRunStore } from '../fileRunStore.js';
import {
  buildCanonicalPacketContentV2,
  computeIdempotencyFingerprint,
  PacketExportServiceV2,
} from '../generator.js';
import type { ExportRunClaimInput } from '../types.js';
import {
  encodeDerSignature,
  GOLDEN_SIGNING_IDENTITY,
  loadGoldenInput,
  SequenceSigner,
} from './fixtures.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryStoreRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'monolith-s17-4-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('S17-4 durable export-run store', () => {
  it('survives restart and returns the exact accepted artifact without signing again', async () => {
    const root = await temporaryStoreRoot();
    const firstSigner = new SequenceSigner([encodeDerSignature(31n, 41n)]);
    const firstService = new PacketExportServiceV2(
      new FileExportRunStore(
        root,
        () => '77777777-7777-4777-8777-777777777777',
        () => '2026-07-17T14:00:00.000Z',
      ),
      firstSigner,
    );
    const request = {
      idempotencyKey: 'durable-request-001',
      authorized: {
        actorSubjectId: 'actor-owner',
        authorizationContextId: 'auth-context-1',
        content: loadGoldenInput(),
      },
      signingIdentity: GOLDEN_SIGNING_IDENTITY,
    };
    const first = await firstService.export(request);
    expect(firstSigner.requests).toHaveLength(1);

    const restartSigner = new SequenceSigner([encodeDerSignature(32n, 42n)]);
    const restartedService = new PacketExportServiceV2(
      new FileExportRunStore(
        root,
        () => {
          throw new Error('restart must not allocate another jobRunId');
        },
        () => {
          throw new Error('restart must not allocate another issuedAt');
        },
      ),
      restartSigner,
    );
    const retry = await restartedService.export(request);
    expect(retry.attestation.jobRunId).toBe(first.attestation.jobRunId);
    expect(Buffer.from(retry.zipBytes)).toEqual(Buffer.from(first.zipBytes));
    expect(restartSigner.requests).toHaveLength(0);

    const changed = loadGoldenInput();
    changed.payloads.cutlist.parts[0].quantity = 2;
    await expect(
      restartedService.export({
        ...request,
        authorized: { ...request.authorized, content: changed },
      }),
    ).rejects.toThrow(/PKT_IDEMPOTENCY_CONFLICT/);
  });

  it('keeps a failed jobRunId reserved and reuses it on retry after restart', async () => {
    const root = await temporaryStoreRoot();
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const actor = {
      actorSubjectId: 'actor-owner',
      authorizationContextId: 'auth-context-1',
    };
    const input: ExportRunClaimInput = {
      idempotencyKey: 'durable-request-failed',
      idempotencyFingerprint: computeIdempotencyFingerprint(actor, content),
      packetContentId: content.packetContentId,
      ...actor,
      releasedRevision: content.manifest.releasedRevision,
      machineProfile: content.manifest.machineProfile,
      exporter: content.manifest.exporter,
    };
    const firstStore = new FileExportRunStore(
      root,
      () => '88888888-8888-4888-8888-888888888888',
      () => '2026-07-17T14:15:00.000Z',
    );
    const firstClaim = await firstStore.claim(input);
    await firstStore.fail(firstClaim.record.jobRunId);

    const restartedStore = new FileExportRunStore(root, () => {
      throw new Error('failed reservation must not allocate a new ID');
    });
    const retryClaim = await restartedStore.claim(input);
    expect(retryClaim.kind).toBe('REUSED');
    expect(retryClaim.record.jobRunId).toBe(firstClaim.record.jobRunId);
    expect(retryClaim.record.state).toBe('FAILED');
  });
});

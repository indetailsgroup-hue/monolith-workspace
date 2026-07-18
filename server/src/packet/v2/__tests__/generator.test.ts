import { describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { asJsonValue, concatBytes, jcsBytes, sha256Hex, utf8 } from '../canonical.js';
import {
  buildCanonicalPacketContentV2,
  computeIdempotencyFingerprint,
  generateFactoryPacketV2,
  InMemoryExportRunStore,
  PacketExportServiceV2,
} from '../generator.js';
import type { ExportRunClaimInput, PacketAttestationV2 } from '../types.js';
import { ATTESTATION_SIGNATURE_DOMAIN, ZIP_PROFILE } from '../constants.js';
import {
  encodeDerSignature,
  GOLDEN_RUN,
  GOLDEN_SIGNING_IDENTITY,
  loadGoldenExpected,
  loadGoldenInput,
  SequenceSigner,
} from './fixtures.js';

function stableAttestationFields(attestation: PacketAttestationV2) {
  const { jobRunId, issuedAt, actorSubjectId, signature, ...stable } = attestation;
  return { ...stable, protected: signature.protected };
}

function extractLocalEntries(zip: Uint8Array) {
  const entries: Array<{
    path: string;
    flags: number;
    method: number;
    time: number;
    date: number;
    extraLength: number;
  }> = [];
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const time = view.getUint16(offset + 10, true);
    const date = view.getUint16(offset + 12, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const path = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    entries.push({ path, flags, method, time, date, extraLength });
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return { entries, centralOffset: offset };
}

function extractWithIndependentZipReader(zipBytes: Uint8Array): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(zipBytes),
      { lazyEntries: true, validateEntrySizes: true, decodeStrings: true },
      (openError, zip) => {
        if (openError || !zip) return reject(openError ?? new Error('ZIP did not open'));
        const files = new Map<string, Buffer>();
        zip.on('error', reject);
        zip.on('end', () => resolve(files));
        zip.on('entry', (entry) => {
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return reject(streamError ?? new Error('ZIP entry did not open'));
            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('error', reject);
            stream.on('end', () => {
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}

describe('S17-4 deterministic packet generator', () => {
  it('keeps content bytes identical across accepted runs and changes only run-specific attestation fields', async () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const fingerprint = computeIdempotencyFingerprint(
      { actorSubjectId: GOLDEN_RUN.actorSubjectId, authorizationContextId: GOLDEN_RUN.authorizationContextId },
      content,
    );
    const signer = new SequenceSigner([
      encodeDerSignature(1n, 2n),
      encodeDerSignature(3n, 4n),
    ]);
    const first = await generateFactoryPacketV2(
      content,
      { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
      GOLDEN_SIGNING_IDENTITY,
      signer,
    );
    const second = await generateFactoryPacketV2(
      content,
      {
        ...GOLDEN_RUN,
        jobRunId: '22222222-2222-4222-8222-222222222222',
        issuedAt: '2026-07-17T12:00:01.000Z',
        idempotencyFingerprint: fingerprint,
      },
      GOLDEN_SIGNING_IDENTITY,
      signer,
    );

    expect(first.packetContentId).toBe(second.packetContentId);
    expect(Buffer.from(first.manifestBytes)).toEqual(Buffer.from(second.manifestBytes));
    for (const [path, bytes] of first.payloadBytes) {
      expect(Buffer.from(bytes), path).toEqual(Buffer.from(second.payloadBytes.get(path)!));
    }
    expect(stableAttestationFields(first.attestation)).toEqual(stableAttestationFields(second.attestation));
    expect(first.attestation.signature.valueBase64).not.toBe(second.attestation.signature.valueBase64);
    expect(first.filename).not.toBe(second.filename);
    expect(Buffer.from(first.zipBytes)).not.toEqual(Buffer.from(second.zipBytes));
    expect(signer.requests).toHaveLength(2);
    for (const request of signer.requests) {
      expect(request.keySpec).toBe('ECC_NIST_P256');
      expect(request.signingAlgorithm).toBe('ECDSA_SHA_256');
      expect(request.messageType).toBe('DIGEST');
      expect(request.messageDigest).toHaveLength(32);
    }
    const { valueBase64: omittedSignature, ...unsignedSignature } = first.attestation.signature;
    const unsignedAttestation = { ...first.attestation, signature: unsignedSignature };
    expect(omittedSignature).toHaveLength(88);
    expect(Buffer.from(signer.requests[0].messageDigest).toString('hex')).toBe(
      sha256Hex(
        concatBytes(
          utf8(ATTESTATION_SIGNATURE_DOMAIN),
          jcsBytes(asJsonValue(unsignedAttestation)),
        ),
      ),
    );
  });

  it('writes the exact method-0 deterministic ZIP profile and root-entry order', async () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const fingerprint = computeIdempotencyFingerprint(
      { actorSubjectId: GOLDEN_RUN.actorSubjectId, authorizationContextId: GOLDEN_RUN.authorizationContextId },
      content,
    );
    const signer = new SequenceSigner([encodeDerSignature(1n, 2n)]);
    const first = await generateFactoryPacketV2(
      content,
      { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
      GOLDEN_SIGNING_IDENTITY,
      signer,
    );
    const second = await generateFactoryPacketV2(
      content,
      { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
      GOLDEN_SIGNING_IDENTITY,
      new SequenceSigner([encodeDerSignature(1n, 2n)]),
    );
    expect(Buffer.from(first.zipBytes)).toEqual(Buffer.from(second.zipBytes));
    const parsed = extractLocalEntries(first.zipBytes);
    expect(parsed.entries.map((entry) => entry.path)).toEqual([
      'manifest.json',
      'NOT_FOR_PRODUCTION.txt',
      'connector-ops.json',
      'connectors.minifix.json',
      'cutlist.json',
      'drillmap.json',
      'gate-result.json',
      'attestation.json',
    ]);
    for (const entry of parsed.entries) {
      expect(entry.flags).toBe(ZIP_PROFILE.utf8Flag);
      expect(entry.method).toBe(0);
      expect(entry.time).toBe(ZIP_PROFILE.dosTime);
      expect(entry.date).toBe(ZIP_PROFILE.dosDate);
      expect(entry.extraLength).toBe(0);
    }
    const central = new DataView(
      first.zipBytes.buffer,
      first.zipBytes.byteOffset + parsed.centralOffset,
      first.zipBytes.byteLength - parsed.centralOffset,
    );
    expect(central.getUint32(0, true)).toBe(0x02014b50);
    expect(central.getUint16(4, true)).toBe(ZIP_PROFILE.versionMadeBy);
    expect(central.getUint32(38, true)).toBe(ZIP_PROFILE.externalAttributes);
    const independentlyExtracted = await extractWithIndependentZipReader(first.zipBytes);
    expect([...independentlyExtracted.keys()]).toEqual(parsed.entries.map((entry) => entry.path));
    expect(independentlyExtracted.get('manifest.json')).toEqual(Buffer.from(first.manifestBytes));
    expect(independentlyExtracted.get('attestation.json')).toEqual(Buffer.from(first.attestationBytes));
    expect(independentlyExtracted.get('NOT_FOR_PRODUCTION.txt')).toEqual(
      Buffer.from(first.payloadBytes.get('NOT_FOR_PRODUCTION.txt')!),
    );
  });

  it('reuses the accepted artifact for a retry and rejects idempotency-key drift', async () => {
    const jobRunIds = [
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ];
    const store = new InMemoryExportRunStore(
      () => jobRunIds.shift()!,
      () => '2026-07-17T13:00:00.000Z',
    );
    const signer = new SequenceSigner([encodeDerSignature(10n, 20n), encodeDerSignature(11n, 21n)]);
    const service = new PacketExportServiceV2(store, signer);
    const authorized = {
      actorSubjectId: 'actor-owner',
      authorizationContextId: 'auth-context-1',
      content: loadGoldenInput(),
    };
    const request = {
      idempotencyKey: 'request-001',
      authorized,
      signingIdentity: GOLDEN_SIGNING_IDENTITY,
    };
    const first = await service.export(request);
    const retry = await service.export(request);
    expect(retry).toBe(first);
    expect(signer.requests).toHaveLength(1);

    const changed = loadGoldenInput();
    changed.payloads.cutlist.parts[0].quantity = 2;
    await expect(
      service.export({
        ...request,
        authorized: { ...authorized, content: changed },
      }),
    ).rejects.toThrow(/PKT_IDEMPOTENCY_CONFLICT/);

    const rebuild = await service.export({ ...request, idempotencyKey: 'request-002' });
    expect(rebuild.packetContentId).toBe(first.packetContentId);
    expect(rebuild.attestation.jobRunId).not.toBe(first.attestation.jobRunId);
    expect(signer.requests).toHaveLength(2);
  });

  it('coalesces concurrent retries so one jobRunId is signed exactly once', async () => {
    const store = new InMemoryExportRunStore(
      () => '55555555-5555-4555-8555-555555555555',
      () => '2026-07-17T13:30:00.000Z',
    );
    let releaseSigner!: () => void;
    const signerStarted = new Promise<void>((resolve) => {
      releaseSigner = resolve;
    });
    let calls = 0;
    const signer = {
      async signDigest() {
        calls += 1;
        await signerStarted;
        return encodeDerSignature(12n, 22n);
      },
    };
    const service = new PacketExportServiceV2(store, signer);
    const request = {
      idempotencyKey: 'request-concurrent',
      authorized: {
        actorSubjectId: 'actor-owner',
        authorizationContextId: 'auth-context-1',
        content: loadGoldenInput(),
      },
      signingIdentity: GOLDEN_SIGNING_IDENTITY,
    };
    const firstPromise = service.export(request);
    const retryPromise = service.export(request);
    await Promise.resolve();
    expect(calls).toBe(1);
    releaseSigner();
    const [first, retry] = await Promise.all([firstPromise, retryPromise]);
    expect(retry).toBe(first);
    expect(calls).toBe(1);
  });

  it('fails closed when the run store returns a corrupted identity binding', async () => {
    const badStore = {
      async claim(input: ExportRunClaimInput) {
        return {
          kind: 'ALLOCATED' as const,
          record: {
            ...input,
            actorSubjectId: 'different-actor',
            jobRunId: '66666666-6666-4666-8666-666666666666',
            issuedAt: '2026-07-17T13:45:00.000Z',
            state: 'ALLOCATED' as const,
          },
        };
      },
      async complete() {},
      async fail() {},
    };
    const signer = new SequenceSigner([encodeDerSignature(13n, 23n)]);
    const service = new PacketExportServiceV2(badStore, signer);
    await expect(
      service.export({
        idempotencyKey: 'request-corrupted-store',
        authorized: {
          actorSubjectId: 'actor-owner',
          authorizationContextId: 'auth-context-1',
          content: loadGoldenInput(),
        },
        signingIdentity: GOLDEN_SIGNING_IDENTITY,
      }),
    ).rejects.toThrow(/run store returned a mismatched binding/);
    expect(signer.requests).toHaveLength(0);
  });

  it('rechecks canonical content integrity immediately before signing', async () => {
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const mutablePayloads = content.payloadBytes as Map<string, Uint8Array>;
    const marker = new Uint8Array(mutablePayloads.get('NOT_FOR_PRODUCTION.txt')!);
    marker[0] ^= 0x01;
    mutablePayloads.set('NOT_FOR_PRODUCTION.txt', marker);
    const fingerprint = computeIdempotencyFingerprint(
      { actorSubjectId: GOLDEN_RUN.actorSubjectId, authorizationContextId: GOLDEN_RUN.authorizationContextId },
      content,
    );
    const signer = new SequenceSigner([encodeDerSignature(14n, 24n)]);
    await expect(
      generateFactoryPacketV2(
        content,
        { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
        GOLDEN_SIGNING_IDENTITY,
        signer,
      ),
    ).rejects.toThrow(/payload bytes were mutated: NOT_FOR_PRODUCTION\.txt/);
    expect(signer.requests).toHaveLength(0);
  });

  it('matches the committed golden content, attestation, and ZIP digests', async () => {
    const expected = loadGoldenExpected();
    const content = buildCanonicalPacketContentV2(loadGoldenInput());
    const fingerprint = computeIdempotencyFingerprint(
      { actorSubjectId: GOLDEN_RUN.actorSubjectId, authorizationContextId: GOLDEN_RUN.authorizationContextId },
      content,
    );
    const packet = await generateFactoryPacketV2(
      content,
      { ...GOLDEN_RUN, idempotencyFingerprint: fingerprint },
      GOLDEN_SIGNING_IDENTITY,
      new SequenceSigner([encodeDerSignature(1n, 2n)]),
    );
    expect({
      packetContentId: packet.packetContentId,
      machineProfileSha256: content.machineProfileSha256,
      manifestSha256: packet.manifestSha256,
      manifestSizeBytes: packet.manifestBytes.byteLength,
      attestationSizeBytes: packet.attestationBytes.byteLength,
      zipSizeBytes: packet.zipBytes.byteLength,
      zipSha256: sha256Hex(packet.zipBytes),
    }).toEqual(expected);
  });
});

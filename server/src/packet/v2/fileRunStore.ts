import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  asJsonValue,
  assertCanonicalPath,
  assertTimestampMsUtc,
  assertUuidV4,
  compareUtf8,
  jcs,
  PacketGenerationError,
  sha256Hex,
  utf8,
} from './canonical.js';
import type {
  ExportRunClaim,
  ExportRunClaimInput,
  ExportRunRecord,
  ExportRunStore,
  GeneratedFactoryPacketV2,
  PacketAttestationV2,
  PacketManifestV2,
} from './types.js';

interface StoredArtifactIndex {
  schema: 'monolith.factory.packet-artifact-index@1.0';
  filename: string;
  packetContentId: string;
  manifestSha256: string;
  payloadPaths: string[];
  zipSha256: string;
}

/**
 * Durable E0/dogfood run store.
 *
 * Run reservations and idempotency bindings are append-only files created with
 * `wx`. A failed process therefore cannot release a UUID for reuse. Completed
 * artifacts are assembled in a temporary directory and published with one
 * directory rename, so readers see either no artifact or the complete set.
 */
export class FileExportRunStore implements ExportRunStore {
  constructor(
    private readonly rootDirectory: string,
    private readonly createJobRunId: () => string = () => randomUUID().toLowerCase(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async claim(input: ExportRunClaimInput): Promise<ExportRunClaim> {
    await this.initialize();
    const bindingPath = this.bindingPath(input.idempotencyKey);
    const existing = await readJsonIfPresent<ExportRunRecord>(bindingPath);
    if (existing) return this.claimFromExisting(existing, input);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const jobRunId = this.createJobRunId();
      const issuedAt = this.now();
      assertUuidV4(jobRunId, 'allocated jobRunId');
      assertTimestampMsUtc(issuedAt, 'allocated issuedAt');
      const record: ExportRunRecord = {
        ...input,
        jobRunId,
        issuedAt,
        state: 'ALLOCATED',
      };
      try {
        await writeFile(this.runPath(jobRunId), jcs(asJsonValue(record)), {
          encoding: 'utf8',
          flag: 'wx',
        });
      } catch (error) {
        if (isAlreadyExists(error)) continue;
        throw error;
      }

      try {
        await writeFile(bindingPath, jcs(asJsonValue(record)), {
          encoding: 'utf8',
          flag: 'wx',
        });
        return { kind: 'ALLOCATED', record };
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const winner = await readJsonIfPresent<ExportRunRecord>(bindingPath);
        if (!winner) {
          throw new PacketGenerationError(
            'PKT_IDEMPOTENCY_CONFLICT',
            'idempotency binding appeared but could not be read',
          );
        }
        return this.claimFromExisting(winner, input);
      }
    }
    throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'jobRunId allocator collided repeatedly');
  }

  async complete(jobRunId: string, packet: GeneratedFactoryPacketV2): Promise<void> {
    assertUuidV4(jobRunId, 'jobRunId');
    await this.initialize();
    const record = await readJsonIfPresent<ExportRunRecord>(this.runPath(jobRunId));
    if (!record || record.packetContentId !== packet.packetContentId) {
      throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'cannot complete unknown or mismatched run');
    }
    const finalDirectory = this.artifactDirectory(jobRunId);
    const existing = await this.loadCompleted(jobRunId);
    if (existing) {
      if (sha256Hex(existing.zipBytes) !== sha256Hex(packet.zipBytes)) {
        throw new PacketGenerationError(
          'PKT_IDEMPOTENCY_CONFLICT',
          'completed run already has a different packet artifact',
        );
      }
      return;
    }

    const tempDirectory = path.join(
      this.rootDirectory,
      'artifacts',
      `.tmp-${jobRunId}-${randomUUID().toLowerCase()}`,
    );
    await mkdir(tempDirectory, { recursive: false });
    try {
      const payloadPaths = [...packet.payloadBytes.keys()].sort(compareUtf8);
      for (const payloadPath of payloadPaths) {
        assertCanonicalPath(payloadPath);
        if (payloadPath.includes('/')) {
          throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', 'artifact payload must be at root');
        }
        await writeFile(path.join(tempDirectory, payloadPath), packet.payloadBytes.get(payloadPath)!);
      }
      await writeFile(path.join(tempDirectory, 'manifest.json'), packet.manifestBytes);
      await writeFile(path.join(tempDirectory, 'attestation.json'), packet.attestationBytes);
      await writeFile(path.join(tempDirectory, 'packet.zip'), packet.zipBytes);
      const index: StoredArtifactIndex = {
        schema: 'monolith.factory.packet-artifact-index@1.0',
        filename: packet.filename,
        packetContentId: packet.packetContentId,
        manifestSha256: packet.manifestSha256,
        payloadPaths,
        zipSha256: sha256Hex(packet.zipBytes),
      };
      await writeFile(path.join(tempDirectory, 'artifact-index.json'), jcs(asJsonValue(index)), 'utf8');
      try {
        await rename(tempDirectory, finalDirectory);
      } catch (error) {
        const winner = await this.loadCompleted(jobRunId);
        if (!winner) throw error;
        if (sha256Hex(winner.zipBytes) !== sha256Hex(packet.zipBytes)) {
          throw new PacketGenerationError(
            'PKT_IDEMPOTENCY_CONFLICT',
            'concurrent completion published a different packet artifact',
          );
        }
      }
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  async fail(jobRunId: string): Promise<void> {
    assertUuidV4(jobRunId, 'jobRunId');
    await this.initialize();
    try {
      await writeFile(this.failurePath(jobRunId), '', { flag: 'wx' });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }

  private async initialize(): Promise<void> {
    await Promise.all([
      mkdir(path.join(this.rootDirectory, 'runs'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'idempotency'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'artifacts'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'failures'), { recursive: true }),
    ]);
  }

  private async claimFromExisting(
    existing: ExportRunRecord,
    requested: ExportRunClaimInput,
  ): Promise<ExportRunClaim> {
    if (
      existing.idempotencyFingerprint !== requested.idempotencyFingerprint ||
      existing.packetContentId !== requested.packetContentId
    ) {
      throw new PacketGenerationError(
        'PKT_IDEMPOTENCY_CONFLICT',
        'idempotency key was already bound to different authorized content',
      );
    }
    const completedPacket = await this.loadCompleted(existing.jobRunId);
    const failed = await fileExists(this.failurePath(existing.jobRunId));
    return {
      kind: 'REUSED',
      record: {
        ...existing,
        state: completedPacket ? 'COMPLETED' : failed ? 'FAILED' : 'ALLOCATED',
      },
      completedPacket,
    };
  }

  private async loadCompleted(jobRunId: string): Promise<GeneratedFactoryPacketV2 | undefined> {
    const directory = this.artifactDirectory(jobRunId);
    const index = await readJsonIfPresent<StoredArtifactIndex>(path.join(directory, 'artifact-index.json'));
    if (!index) return undefined;
    const [manifestBytes, attestationBytes, zipBytes] = await Promise.all([
      readFile(path.join(directory, 'manifest.json')),
      readFile(path.join(directory, 'attestation.json')),
      readFile(path.join(directory, 'packet.zip')),
    ]);
    if (sha256Hex(zipBytes) !== index.zipSha256) {
      throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'stored packet ZIP digest is corrupt');
    }
    const payloadBytes = new Map<string, Uint8Array>();
    for (const payloadPath of index.payloadPaths) {
      assertCanonicalPath(payloadPath);
      if (payloadPath.includes('/')) {
        throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'stored payload path is not at root');
      }
      payloadBytes.set(payloadPath, await readFile(path.join(directory, payloadPath)));
    }
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as PacketManifestV2;
    const attestation = JSON.parse(attestationBytes.toString('utf8')) as PacketAttestationV2;
    return {
      filename: index.filename,
      packetContentId: index.packetContentId,
      manifestSha256: index.manifestSha256,
      manifest,
      attestation,
      manifestBytes,
      attestationBytes,
      payloadBytes,
      zipBytes,
    };
  }

  private bindingPath(idempotencyKey: string): string {
    return path.join(this.rootDirectory, 'idempotency', `${sha256Hex(utf8(idempotencyKey))}.json`);
  }

  private runPath(jobRunId: string): string {
    return path.join(this.rootDirectory, 'runs', `${jobRunId}.json`);
  }

  private failurePath(jobRunId: string): string {
    return path.join(this.rootDirectory, 'failures', jobRunId);
  }

  private artifactDirectory(jobRunId: string): string {
    return path.join(this.rootDirectory, 'artifacts', jobRunId);
  }
}

async function readJsonIfPresent<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

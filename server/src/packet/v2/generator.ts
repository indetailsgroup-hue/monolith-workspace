import { randomUUID } from 'node:crypto';
import {
  asJsonValue,
  assertOpaqueId,
  assertSemver,
  assertSha256Id,
  assertString,
  assertTimestampMsUtc,
  assertUuidV4,
  compareUtf8,
  concatBytes,
  jcsBytes,
  PacketGenerationError,
  sha256Hex,
  sha256Id,
  utf8,
} from './canonical.js';
import {
  ATTESTATION_SCHEMA,
  EXPORT_REQUEST_DIGEST_DOMAIN,
  MACHINE_PROFILE_DIGEST_DOMAIN,
  MANIFEST_VERSION,
  NOT_FOR_PRODUCTION_NOTICE,
  NOT_FOR_PRODUCTION_PATH,
  NOT_FOR_PRODUCTION_SHA256,
  NOT_FOR_PRODUCTION_SIZE_BYTES,
  PACKET_SCHEMA,
  PAYLOAD_METADATA,
} from './constants.js';
import {
  normalizeExporter,
  normalizeMachineProfile,
  normalizePayloads,
  normalizeReleasedRevision,
} from './payloads.js';
import { signAttestation } from './signature.js';
import type {
  AuthorizedPacketExport,
  CanonicalPacketContent,
  CanonicalPacketContentInput,
  ExportRunClaim,
  ExportRunClaimInput,
  ExportRunRecord,
  ExportRunStore,
  GeneratedFactoryPacketV2,
  ManifestFileEntryV2,
  PacketAttestationV2,
  PacketExportRequest,
  PacketManifestDescriptorV2,
  PacketManifestV2,
  PacketSignerAdapter,
  PacketSigningIdentity,
  ServerRunContext,
  UnsignedPacketAttestationV2,
} from './types.js';
import { createDeterministicZip } from './zip.js';

function normalizeContentInput(input: CanonicalPacketContentInput): {
  releasedRevision: ReturnType<typeof normalizeReleasedRevision>;
  machineProfile: ReturnType<typeof normalizeMachineProfile>;
  exporter: ReturnType<typeof normalizeExporter>;
  payloads: ReturnType<typeof normalizePayloads>;
} {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'content input must be an object');
  }
  const keys = Object.keys(input).sort();
  if (keys.join(',') !== 'exporter,machineProfile,payloads,releasedRevision') {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'content input has missing or unknown fields');
  }
  return {
    releasedRevision: normalizeReleasedRevision(input.releasedRevision),
    machineProfile: normalizeMachineProfile(input.machineProfile),
    exporter: normalizeExporter(input.exporter),
    payloads: normalizePayloads(input.payloads),
  };
}

export function buildCanonicalPacketContentV2(input: CanonicalPacketContentInput): CanonicalPacketContent {
  const normalized = normalizeContentInput(input);
  const machineProfileSha256 = sha256Id(
    concatBytes(
      utf8(MACHINE_PROFILE_DIGEST_DOMAIN),
      jcsBytes(asJsonValue(normalized.machineProfile)),
    ),
  );

  const payloadBytes = new Map<string, Uint8Array>([
    ['connector-ops.json', jcsBytes(asJsonValue(normalized.payloads.connectorOps))],
    ['connectors.minifix.json', jcsBytes(asJsonValue(normalized.payloads.connectorsMinifix))],
    ['cutlist.json', jcsBytes(asJsonValue(normalized.payloads.cutlist))],
    ['drillmap.json', jcsBytes(asJsonValue(normalized.payloads.drillmap))],
    ['gate-result.json', jcsBytes(asJsonValue(normalized.payloads.gateResult))],
    [NOT_FOR_PRODUCTION_PATH, utf8(NOT_FOR_PRODUCTION_NOTICE)],
  ]);

  const markerBytes = payloadBytes.get(NOT_FOR_PRODUCTION_PATH)!;
  if (
    markerBytes.byteLength !== NOT_FOR_PRODUCTION_SIZE_BYTES ||
    sha256Hex(markerBytes) !== NOT_FOR_PRODUCTION_SHA256
  ) {
    throw new PacketGenerationError(
      'PKT_SCHEMA_UNSUPPORTED',
      'NFP marker constant does not match the approved byte contract',
    );
  }

  const paths = [...payloadBytes.keys()].sort(compareUtf8);
  const fileEntries: ManifestFileEntryV2[] = paths.map((path) => {
    const bytes = payloadBytes.get(path)!;
    const metadata = PAYLOAD_METADATA[path as keyof typeof PAYLOAD_METADATA];
    if (!metadata) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `payload metadata is missing for ${path}`);
    }
    return {
      path,
      mediaType: metadata.mediaType,
      contentSchema: metadata.contentSchema,
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
    };
  });

  const manifestDescriptor: PacketManifestDescriptorV2 = {
    schema: PACKET_SCHEMA,
    manifestVersion: MANIFEST_VERSION,
    releasedRevision: normalized.releasedRevision,
    machineProfile: {
      id: normalized.machineProfile.id,
      version: normalized.machineProfile.version,
      sha256: machineProfileSha256,
    },
    exporter: normalized.exporter,
    files: fileEntries,
  };
  const packetContentId = sha256Id(jcsBytes(asJsonValue(manifestDescriptor)));
  const manifest: PacketManifestV2 = {
    ...manifestDescriptor,
    packetContentId,
  };
  const manifestBytes = jcsBytes(asJsonValue(manifest));
  return {
    manifest,
    manifestBytes,
    manifestSha256: sha256Id(manifestBytes),
    machineProfileSha256,
    packetContentId,
    payloadBytes,
    fileEntries,
  };
}

export function computeIdempotencyFingerprint(
  authorized: Pick<AuthorizedPacketExport, 'actorSubjectId' | 'authorizationContextId'>,
  content: CanonicalPacketContent,
): string {
  assertOpaqueId(authorized.actorSubjectId, 'actorSubjectId');
  assertOpaqueId(authorized.authorizationContextId, 'authorizationContextId');
  const canonicalAuthorizedRequest = {
    actorSubjectId: authorized.actorSubjectId,
    authorizationContextId: authorized.authorizationContextId,
    releasedRevision: content.manifest.releasedRevision,
    machineProfile: content.manifest.machineProfile,
    exporter: content.manifest.exporter,
    packetContentId: content.packetContentId,
  };
  return sha256Id(
    concatBytes(
      utf8(EXPORT_REQUEST_DIGEST_DOMAIN),
      jcsBytes(asJsonValue(canonicalAuthorizedRequest)),
    ),
  );
}

function normalizeRunContext(run: ServerRunContext): ServerRunContext {
  const keys = Object.keys(run).sort();
  if (
    keys.join(',') !==
    'actorSubjectId,authorizationContextId,idempotencyFingerprint,issuedAt,jobRunId'
  ) {
    throw new PacketGenerationError('PKT_ATTESTATION_INVALID', 'run context has missing or unknown fields');
  }
  assertUuidV4(run.jobRunId, 'jobRunId');
  assertTimestampMsUtc(run.issuedAt, 'issuedAt');
  assertOpaqueId(run.actorSubjectId, 'actorSubjectId');
  assertOpaqueId(run.authorizationContextId, 'authorizationContextId');
  assertSha256Id(run.idempotencyFingerprint, 'idempotencyFingerprint');
  return { ...run };
}

function normalizeSigningIdentity(identity: PacketSigningIdentity): PacketSigningIdentity {
  const keys = Object.keys(identity).sort();
  if (keys.join(',') !== 'keyId,registryVersion') {
    throw new PacketGenerationError('PKT_ATTESTATION_INVALID', 'signing identity has unknown fields');
  }
  assertOpaqueId(identity.keyId, 'signature.protected.keyId');
  assertSemver(identity.registryVersion, 'signature.protected.registryVersion');
  return { ...identity };
}

export async function generateFactoryPacketV2(
  content: CanonicalPacketContent,
  runInput: ServerRunContext,
  signingIdentityInput: PacketSigningIdentity,
  signer: PacketSignerAdapter,
): Promise<GeneratedFactoryPacketV2> {
  assertCanonicalContentIntegrity(content);
  const run = normalizeRunContext(runInput);
  const signingIdentity = normalizeSigningIdentity(signingIdentityInput);
  const gateEntry = content.fileEntries.find((entry) => entry.path === 'gate-result.json');
  if (!gateEntry) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'gate-result.json is missing');
  }
  const gateResult = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(content.payloadBytes.get('gate-result.json')),
  ) as { result: 'PASS'; policyVersion: string };

  const unsignedAttestation: UnsignedPacketAttestationV2 = {
    schema: ATTESTATION_SCHEMA,
    jobRunId: run.jobRunId,
    packetContentId: content.packetContentId,
    manifestSha256: content.manifestSha256,
    issuedAt: run.issuedAt,
    actorSubjectId: run.actorSubjectId,
    authorizationContextId: run.authorizationContextId,
    idempotencyFingerprint: run.idempotencyFingerprint,
    releasedRevision: content.manifest.releasedRevision,
    machineProfile: content.manifest.machineProfile,
    exporter: content.manifest.exporter,
    packetSchema: PACKET_SCHEMA,
    gate: {
      result: gateResult.result,
      policyVersion: gateResult.policyVersion,
      evidenceFile: 'gate-result.json',
      evidenceSha256: `sha256:${gateEntry.sha256}`,
    },
    signature: {
      protected: {
        algorithm: 'ECDSA_P256_SHA256',
        keyId: signingIdentity.keyId,
        registryVersion: signingIdentity.registryVersion,
      },
    },
  };
  const { attestation } = await signAttestation(unsignedAttestation, signer);
  const attestationBytes = jcsBytes(asJsonValue(attestation));
  const payloadEntries = [...content.payloadBytes.entries()]
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([path, bytes]) => ({ path, bytes }));
  const zipBytes = createDeterministicZip([
    { path: 'manifest.json', bytes: content.manifestBytes },
    ...payloadEntries,
    { path: 'attestation.json', bytes: attestationBytes },
  ]);
  const contentHexPrefix = content.packetContentId.slice('sha256:'.length, 'sha256:'.length + 12);
  const filename = `NFP-factory-packet-${run.jobRunId}-${contentHexPrefix}.zip`;
  if (
    !/^NFP-factory-packet-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{12}\.zip$/.test(
      filename,
    )
  ) {
    throw new PacketGenerationError('PKT_ZIP_PROFILE_INVALID', 'generated NFP filename is invalid');
  }
  return {
    filename,
    packetContentId: content.packetContentId,
    manifestSha256: content.manifestSha256,
    manifest: content.manifest,
    attestation,
    manifestBytes: new Uint8Array(content.manifestBytes),
    attestationBytes,
    payloadBytes: new Map(
      [...content.payloadBytes].map(([path, bytes]) => [path, new Uint8Array(bytes)]),
    ),
    zipBytes,
  };
}

function assertCanonicalContentIntegrity(content: CanonicalPacketContent): void {
  const canonicalManifestBytes = jcsBytes(asJsonValue(content.manifest));
  if (!Buffer.from(canonicalManifestBytes).equals(Buffer.from(content.manifestBytes))) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'manifest bytes were mutated after content build');
  }
  const { packetContentId: omittedPacketContentId, ...descriptor } = content.manifest;
  const recomputedPacketContentId = sha256Id(jcsBytes(asJsonValue(descriptor)));
  if (
    omittedPacketContentId !== content.packetContentId ||
    recomputedPacketContentId !== content.packetContentId ||
    sha256Id(content.manifestBytes) !== content.manifestSha256
  ) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'content or manifest identity was mutated');
  }
  if (
    Buffer.from(jcsBytes(asJsonValue(content.manifest.files))).compare(
      Buffer.from(jcsBytes(asJsonValue(content.fileEntries))),
    ) !== 0
  ) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'manifest files and file entries diverged');
  }
  if (content.payloadBytes.size !== content.fileEntries.length) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'payload set size diverged from manifest');
  }
  for (const entry of content.fileEntries) {
    const bytes = content.payloadBytes.get(entry.path);
    if (!bytes || bytes.byteLength !== entry.sizeBytes || sha256Hex(bytes) !== entry.sha256) {
      throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', `payload bytes were mutated: ${entry.path}`);
    }
  }
  const marker = content.payloadBytes.get(NOT_FOR_PRODUCTION_PATH);
  if (
    !marker ||
    marker.byteLength !== NOT_FOR_PRODUCTION_SIZE_BYTES ||
    sha256Hex(marker) !== NOT_FOR_PRODUCTION_SHA256
  ) {
    throw new PacketGenerationError('PKT_SCHEMA_UNSUPPORTED', 'approved NFP marker is missing or mutated');
  }
}

export class PacketExportServiceV2 {
  private readonly inFlight = new Map<
    string,
    { fingerprint: string; promise: Promise<GeneratedFactoryPacketV2> }
  >();

  constructor(
    private readonly runStore: ExportRunStore,
    private readonly signer: PacketSignerAdapter,
  ) {}

  async export(request: PacketExportRequest): Promise<GeneratedFactoryPacketV2> {
    assertString(request.idempotencyKey, 'idempotencyKey', {
      min: 1,
      max: 128,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    });
    const content = buildCanonicalPacketContentV2(request.authorized.content);
    const fingerprint = computeIdempotencyFingerprint(request.authorized, content);
    const pending = this.inFlight.get(request.idempotencyKey);
    if (pending) {
      if (pending.fingerprint !== fingerprint) {
        throw new PacketGenerationError(
          'PKT_IDEMPOTENCY_CONFLICT',
          'idempotency key is already in flight for different authorized content',
        );
      }
      return pending.promise;
    }
    const promise = this.executeClaimed(request, content, fingerprint);
    this.inFlight.set(request.idempotencyKey, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      const current = this.inFlight.get(request.idempotencyKey);
      if (current?.promise === promise) this.inFlight.delete(request.idempotencyKey);
    }
  }

  private async executeClaimed(
    request: PacketExportRequest,
    content: CanonicalPacketContent,
    fingerprint: string,
  ): Promise<GeneratedFactoryPacketV2> {
    const claimInput: ExportRunClaimInput = {
      idempotencyKey: request.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      packetContentId: content.packetContentId,
      actorSubjectId: request.authorized.actorSubjectId,
      authorizationContextId: request.authorized.authorizationContextId,
      releasedRevision: content.manifest.releasedRevision,
      machineProfile: content.manifest.machineProfile,
      exporter: content.manifest.exporter,
    };
    const claim = await this.runStore.claim(claimInput);
    assertClaimMatches(claim, claimInput);
    if (claim.completedPacket) {
      assertCompletedPacketMatches(claim.completedPacket, content);
      return claim.completedPacket;
    }
    const run: ServerRunContext = {
      jobRunId: claim.record.jobRunId,
      issuedAt: claim.record.issuedAt,
      actorSubjectId: claim.record.actorSubjectId,
      authorizationContextId: claim.record.authorizationContextId,
      idempotencyFingerprint: claim.record.idempotencyFingerprint,
    };
    try {
      const packet = await generateFactoryPacketV2(
        content,
        run,
        request.signingIdentity,
        this.signer,
      );
      await this.runStore.complete(run.jobRunId, packet);
      return packet;
    } catch (error) {
      await this.runStore.fail(run.jobRunId);
      throw error;
    }
  }
}

function assertClaimMatches(
  claim: ExportRunClaim,
  expected: ExportRunClaimInput,
): void {
  const actualBinding = {
    idempotencyKey: claim.record.idempotencyKey,
    idempotencyFingerprint: claim.record.idempotencyFingerprint,
    packetContentId: claim.record.packetContentId,
    actorSubjectId: claim.record.actorSubjectId,
    authorizationContextId: claim.record.authorizationContextId,
    releasedRevision: claim.record.releasedRevision,
    machineProfile: claim.record.machineProfile,
    exporter: claim.record.exporter,
  };
  if (Buffer.from(jcsBytes(asJsonValue(actualBinding))).compare(Buffer.from(jcsBytes(asJsonValue(expected)))) !== 0) {
    throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'run store returned a mismatched binding');
  }
}

function assertCompletedPacketMatches(
  packet: GeneratedFactoryPacketV2,
  content: CanonicalPacketContent,
): void {
  if (
    packet.packetContentId !== content.packetContentId ||
    packet.manifestSha256 !== content.manifestSha256 ||
    !Buffer.from(packet.manifestBytes).equals(Buffer.from(content.manifestBytes))
  ) {
    throw new PacketGenerationError(
      'PKT_IDEMPOTENCY_CONFLICT',
      'stored completed packet does not match the current canonical content',
    );
  }
}

export class InMemoryExportRunStore implements ExportRunStore {
  private readonly byIdempotencyKey = new Map<string, ExportRunRecord>();
  private readonly byJobRunId = new Map<string, ExportRunRecord>();
  private readonly completed = new Map<string, GeneratedFactoryPacketV2>();

  constructor(
    private readonly createJobRunId: () => string = () => randomUUID().toLowerCase(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async claim(input: ExportRunClaimInput): Promise<ExportRunClaim> {
    const existing = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      if (
        existing.idempotencyFingerprint !== input.idempotencyFingerprint ||
        existing.packetContentId !== input.packetContentId
      ) {
        throw new PacketGenerationError(
          'PKT_IDEMPOTENCY_CONFLICT',
          'idempotency key was already bound to different authorized content',
        );
      }
      return {
        kind: 'REUSED',
        record: { ...existing },
        completedPacket: this.completed.get(existing.jobRunId),
      };
    }

    let jobRunId = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = this.createJobRunId();
      assertUuidV4(candidate, 'allocated jobRunId');
      if (!this.byJobRunId.has(candidate)) {
        jobRunId = candidate;
        break;
      }
    }
    if (!jobRunId) {
      throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'jobRunId allocator collided repeatedly');
    }
    const issuedAt = this.now();
    assertTimestampMsUtc(issuedAt, 'allocated issuedAt');
    const record: ExportRunRecord = {
      ...input,
      jobRunId,
      issuedAt,
      state: 'ALLOCATED',
    };
    this.byIdempotencyKey.set(input.idempotencyKey, record);
    this.byJobRunId.set(jobRunId, record);
    return { kind: 'ALLOCATED', record: { ...record } };
  }

  async complete(jobRunId: string, packet: GeneratedFactoryPacketV2): Promise<void> {
    const record = this.byJobRunId.get(jobRunId);
    if (!record || record.packetContentId !== packet.packetContentId) {
      throw new PacketGenerationError('PKT_IDEMPOTENCY_CONFLICT', 'cannot complete an unknown or mismatched run');
    }
    record.state = 'COMPLETED';
    this.completed.set(jobRunId, packet);
  }

  async fail(jobRunId: string): Promise<void> {
    const record = this.byJobRunId.get(jobRunId);
    if (record && record.state !== 'COMPLETED') record.state = 'FAILED';
  }
}

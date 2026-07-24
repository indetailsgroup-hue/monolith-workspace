/**
 * releaseWorker.ts - Deterministic release attempt executor (design §10.2, §10.3)
 *
 * `executeReleaseAttempt` runs the exact release choreography for one immutable
 * allocation, in the ONE order the design mandates (design §10.2 steps 4-8):
 *
 *   1. read the immutable attempt allocation (must be PENDING)
 *   2. compile capabilities  (any blocker fails the whole attempt)
 *   3. build the canonical unsigned payload
 *   4. write the payload to the private store as QUARANTINED
 *   5. build the release certificate and request a managed Ed25519 signature
 *      over its DIGEST ONLY (no key material ever leaves the signer)
 *   6. assemble the final packet bytes IN MEMORY
 *   7. compute the expected FINAL packet hash = sha256(final bytes)
 *   8. THEN call the atomic commit (ReleaseAuthorityPort.commitRelease)
 *
 * Any PRE-COMMIT failure ends the attempt at VOID and produces NO release
 * revision, NO signed downloadable object, and NO exposed URL. The in-memory
 * signature and final bytes are discarded on a failed commit. Materialization of
 * the committed bytes is a separate, post-commit, idempotent step
 * (`materializeArtifact`) driven by the outbox.
 *
 * NO private key material exists in this module or anywhere it touches: signing is
 * only ever `signer.sign({ keyId, purpose, digestSha256 })`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type { TrustReasonCode } from '../reasonCodes.js';
import { propagateFailure } from '../signing/managedSignerPort.js';
import { sha256Hex } from '../canonical/hash.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { compileCapabilities } from '../capability/compileCapabilities.js';
import { buildUnsignedPayloadV3 } from '../packet/buildUnsignedPayloadV3.js';
import { packageFactoryPacketV3 } from '../packet/packageFactoryPacketV3.js';
import type {
  Sha256Hex,
  Iso8601,
  TenantScopeV1,
  ArtifactClass,
  ReleaseSnapshotV3,
  ReleaseCertificateV1,
  MachineProfileAttestationV1,
  ArtifactStatus,
} from '../contracts/protocolV3.js';
import type {
  CanonicalMachineProfileV1,
  CapabilitySnapshotV1,
} from '../contracts/capability.js';
import type { ReleaseAttemptStatus } from '../result.js';
import type { ReleaseAuthorityPort } from '../contracts/releasePorts.js';
import type { ManagedSignerPort } from '../signing/managedSignerPort.js';
import type { ArtifactStorePort } from '../artifacts/artifactRepository.js';

/** Domain separator for the release-certificate signing digest. */
export const CERTIFICATE_SIGNING_DOMAIN = 'MONOLITH/ReleaseCertificateSigning/V1';

/**
 * The certificate's `expectedPacketHash` is a NON-circular sentinel: the real
 * final packet hash cannot live inside the packet that embeds the certificate
 * (design §10.2 step 6). The authoritative expected hash is computed over the
 * assembled bytes and stored in the DB/artifact record instead. This value is
 * byte-identical to the Task 7 golden certificate sentinel.
 */
export const EXPECTED_PACKET_HASH_SENTINEL: Sha256Hex = sha256Hex(
  'MONOLITH/NOT_FOR_PRODUCTION/expectedPacketHash-set-by-task8-worker',
);

/**
 * The immutable allocation the authority created before signing (design §10.2
 * step 3). It carries the authority fields the certificate binds plus the build
 * inputs, and the DB-provided internal object locator. The worker never mints any
 * of these from client randomness.
 */
export interface ReleaseAllocationV1 {
  attemptId: string;
  status: ReleaseAttemptStatus;
  releaseRevisionId: string;
  releaseSequence: number;
  releasedAt: Iso8601;
  signerKeyId: string;
  artifactId: string;
  objectLocator: string;
  artifactClass: ArtifactClass;
  tenantScope: TenantScopeV1;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  sortedGrantHashes: Sha256Hex[];
  attestationId: string;
  attestationHash: Sha256Hex;
  snapshot: ReleaseSnapshotV3;
  capabilitySnapshot: CapabilitySnapshotV1;
  machineProfile: CanonicalMachineProfileV1;
  attestation: MachineProfileAttestationV1;
}

/** Reads the immutable allocation and artifact status (mirrors DB reads). */
export interface AllocationReaderPort {
  readAllocation(attemptId: string): Promise<TrustResult<ReleaseAllocationV1>>;
  getArtifactStatus(artifactId: string): Promise<TrustResult<ArtifactStatus>>;
}

/** The ports the release worker drives. `db` is the sole release authority. */
export interface ReleaseWorkerPorts {
  db: ReleaseAuthorityPort & AllocationReaderPort;
  signer: ManagedSignerPort;
  store: ArtifactStorePort;
}

/** The successful result of a committed release attempt (pre-materialization). */
export interface ReleaseWorkerResult {
  attemptId: string;
  releaseRevisionId: string;
  contentHash: Sha256Hex;
  /** sha256 of the assembled final packet bytes (the authoritative expected hash). */
  expectedPacketHash: Sha256Hex;
  committed: true;
}

/**
 * The digest the managed signer signs: a domain-separated SHA-256 over the
 * canonical JSON of the certificate WITHOUT its signature. The signer receives
 * only this digest - never the bytes, never a key.
 */
export function computeCertificateSigningDigest(
  certificateWithoutSignature: Omit<ReleaseCertificateV1, 'signature'>,
): Sha256Hex {
  return sha256Hex(
    canonicalJson({ domain: CERTIFICATE_SIGNING_DOMAIN, certificate: certificateWithoutSignature }),
  );
}

/** Void the private bytes and the DB attempt after a post-quarantine abort. */
async function abortAfterQuarantine(
  ports: ReleaseWorkerPorts,
  allocation: ReleaseAllocationV1,
  reason: string,
): Promise<void> {
  await ports.store.markVoid(allocation.objectLocator);
  await ports.db.voidArtifact({ attemptId: allocation.attemptId, reason });
}

export async function executeReleaseAttempt(
  attemptId: string,
  ports: ReleaseWorkerPorts,
): Promise<TrustResult<ReleaseWorkerResult>> {
  // 1. Read the immutable allocation. It must be a PENDING attempt.
  const allocationResult = await ports.db.readAllocation(attemptId);
  if (!allocationResult.ok) return propagateFailure(allocationResult);
  const allocation = allocationResult.value;
  if (allocation.status !== 'PENDING') {
    return err('STATE_CONFLICT', { attemptId, status: String(allocation.status) });
  }

  // 2. Compile capabilities. Any blocker fails the whole attempt (deterministic).
  const capabilityResult = compileCapabilities(
    allocation.capabilitySnapshot,
    allocation.machineProfile,
    allocation.attestation,
  );
  if (!capabilityResult.ok) {
    const code = (capabilityResult as { code: TrustReasonCode }).code;
    await ports.db.voidArtifact({ attemptId, reason: `capability blocker ${code}` });
    return propagateFailure(capabilityResult);
  }
  const capabilityReport = capabilityResult.value;

  // 3. Build the canonical unsigned payload (pure, deterministic).
  const unsignedResult = buildUnsignedPayloadV3(allocation.snapshot, capabilityReport);
  if (!unsignedResult.ok) {
    const code = (unsignedResult as { code: TrustReasonCode }).code;
    await ports.db.voidArtifact({ attemptId, reason: `payload build ${code}` });
    return propagateFailure(unsignedResult);
  }
  const unsigned = unsignedResult.value;

  // 4. Quarantine the canonical payload in the private store BEFORE signing.
  const quarantineBytes = new Uint8Array(Buffer.from(canonicalJson(unsigned), 'utf-8'));
  const quarantineResult = await ports.store.writeQuarantined({
    locator: allocation.objectLocator,
    bytes: quarantineBytes,
  });
  if (!quarantineResult.ok) {
    // Nothing durable in the store; end the attempt at VOID.
    const code = (quarantineResult as { code: TrustReasonCode }).code;
    await ports.db.voidArtifact({ attemptId, reason: `quarantine ${code}` });
    return propagateFailure(quarantineResult);
  }

  // 5. Build the release certificate (unsigned) and request a managed signature
  //    over its DIGEST ONLY. The sentinel keeps the embedded cert non-circular.
  const certificateWithoutSignature: Omit<ReleaseCertificateV1, 'signature'> = {
    releaseRevisionId: allocation.releaseRevisionId,
    tenantScope: allocation.tenantScope,
    candidateHash: allocation.candidateHash,
    releaseAuthorizationHash: allocation.releaseAuthorizationHash,
    sortedGrantHashes: allocation.sortedGrantHashes,
    attestationId: allocation.attestationId,
    attestationHash: allocation.attestationHash,
    contentHash: unsigned.contentHash,
    expectedPacketHash: EXPECTED_PACKET_HASH_SENTINEL,
    signerKeyId: allocation.signerKeyId,
    algorithm: 'ed25519',
    releaseSequence: allocation.releaseSequence,
    releasedAt: allocation.releasedAt,
  };
  const signingDigest = computeCertificateSigningDigest(certificateWithoutSignature);
  const signatureResult = await ports.signer.sign({
    keyId: allocation.signerKeyId,
    purpose: 'RELEASE',
    digestSha256: signingDigest,
  });
  if (!signatureResult.ok) {
    const code = (signatureResult as { code: TrustReasonCode }).code;
    await abortAfterQuarantine(ports, allocation, `signer ${code}`);
    return propagateFailure(signatureResult);
  }
  const signature = signatureResult.value;

  const certificate: ReleaseCertificateV1 = {
    ...certificateWithoutSignature,
    signature: { alg: 'ed25519', keyId: signature.keyId, sig: signature.signatureBase64 },
  };

  // 6. Assemble the final packet bytes IN MEMORY (pure, deterministic).
  let finalBytes: Uint8Array;
  try {
    finalBytes = await packageFactoryPacketV3(unsigned, certificate);
  } catch (cause) {
    await abortAfterQuarantine(ports, allocation, 'packaging failed');
    return err('PACKET_HASH_MISMATCH', {
      reason: cause instanceof Error ? cause.message : 'packaging failed',
    });
  }

  // 7. Compute the authoritative expected FINAL packet hash.
  const expectedPacketHash = sha256Hex(finalBytes);

  // 8. Atomic commit. On failure, discard the in-memory bytes and void the flow;
  //    no release revision or signed downloadable object exists.
  const commitResult = await ports.db.commitRelease({
    attemptId: allocation.attemptId,
    contentHash: unsigned.contentHash,
    expectedPacketHash,
    certificate,
    signerKeyId: allocation.signerKeyId,
  });
  if (!commitResult.ok) {
    const code = (commitResult as { code: TrustReasonCode }).code;
    await abortAfterQuarantine(ports, allocation, `commit ${code}`);
    return propagateFailure(commitResult);
  }

  return ok({
    attemptId: allocation.attemptId,
    releaseRevisionId: commitResult.value.releaseRevisionId,
    contentHash: unsigned.contentHash,
    expectedPacketHash,
    committed: true,
  });
}

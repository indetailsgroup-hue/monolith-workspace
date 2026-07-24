/**
 * materializeArtifact.ts - Post-commit artifact materialization (design §10.2 step 9)
 *
 * AFTER the atomic commit, the outbox drives materialization: reconstruct the
 * EXACT final packet bytes reproducible from the PERSISTED canonical payload and
 * the PERSISTED certificate, store them under the DB-provided internal locator,
 * verify the stored hash equals the authority's expected packet hash, and only
 * then mark the artifact AVAILABLE (design §10.2 step 9, §10.3).
 *
 * Idempotent by artifact/revision id: a duplicate outbox delivery or a crash-and-
 * retry produces the SAME bytes and NEVER a second certificate or a second
 * signature (this function creates neither - it only reconstructs and stores). A
 * store corruption (stored != expected) yields STORE_HASH_MISMATCH and the
 * artifact is NOT marked AVAILABLE.
 *
 * P2 CONTAINMENT: this function stores under the internal locator only. It returns
 * an `ArtifactRecordV1` (which by type carries no URL) and NEVER produces a raw
 * object locator as a URL or a reusable signed URL. Publication is Task 11.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import { sha256Hex } from '../canonical/hash.js';
import { packageFactoryPacketV3 } from '../packet/packageFactoryPacketV3.js';
import type { UnsignedPacketV3 } from '../packet/buildUnsignedPayloadV3.js';
import type {
  Sha256Hex,
  TenantScopeV1,
  ArtifactClass,
  ArtifactRecordV1,
  ReleaseCertificateV1,
} from '../contracts/protocolV3.js';
import type { ReleaseAuthorityPort } from '../contracts/releasePorts.js';
import { propagateFailure } from '../signing/managedSignerPort.js';
import type { AllocationReaderPort } from './releaseWorker.js';
import type { ArtifactStorePort } from '../artifacts/artifactRepository.js';

/**
 * The outbox event the commit transaction emitted (design §10.2 step 7). It
 * carries everything needed to reconstruct and verify the final bytes: the
 * DB-provided internal locator, the persisted certificate, and the authoritative
 * expected packet hash.
 */
export interface MaterializeOutboxEventV1 {
  attemptId: string;
  releaseRevisionId: string;
  artifactId: string;
  objectLocator: string;
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  certificate: ReleaseCertificateV1;
  tenantScope: TenantScopeV1;
  artifactClass: ArtifactClass;
}

/** The ports the materializer needs: mark-available authority and the private store. */
export interface MaterializePorts {
  db: Pick<AllocationReaderPort, 'getArtifactStatus'> &
    Pick<ReleaseAuthorityPort, 'markArtifactAvailable'>;
  store: ArtifactStorePort;
}

function buildRecord(
  event: MaterializeOutboxEventV1,
  status: ArtifactRecordV1['status'],
): ArtifactRecordV1 {
  // Timestamps are authority-derived (the certificate's canonical releasedAt), never
  // a runtime clock - determinism and idempotency require identical fields on retry.
  const at = event.certificate.releasedAt;
  return {
    artifactId: event.artifactId,
    tenantScope: event.tenantScope,
    artifactClass: event.artifactClass,
    releaseAttemptId: event.attemptId,
    releaseRevisionId: event.releaseRevisionId,
    status,
    contentHash: event.contentHash,
    expectedPacketHash: event.expectedPacketHash,
    objectLocator: event.objectLocator,
    createdAt: at,
    updatedAt: at,
  };
}

export async function materializeArtifact(
  event: MaterializeOutboxEventV1,
  ports: MaterializePorts,
): Promise<TrustResult<ArtifactRecordV1>> {
  // Idempotency: if the artifact is already AVAILABLE, this is a duplicate/retry.
  // Return the existing record without re-marking or re-writing a second time.
  const statusResult = await ports.db.getArtifactStatus(event.artifactId);
  if (statusResult.ok && statusResult.value === 'AVAILABLE') {
    return ok(buildRecord(event, 'AVAILABLE'));
  }

  // Reconstruct the canonical payload from the PERSISTED quarantined bytes.
  const payloadResult = await ports.store.readQuarantined(event.objectLocator);
  if (!payloadResult.ok) return propagateFailure(payloadResult);

  let unsigned: UnsignedPacketV3;
  try {
    unsigned = JSON.parse(Buffer.from(payloadResult.value).toString('utf-8')) as UnsignedPacketV3;
  } catch (cause) {
    return err('STORE_ARTIFACT_UNAVAILABLE', {
      reason: 'persisted payload is not valid canonical JSON',
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  // Re-assemble the EXACT final bytes from the persisted payload + certificate.
  let finalBytes: Uint8Array;
  try {
    finalBytes = await packageFactoryPacketV3(unsigned, event.certificate);
  } catch (cause) {
    return err('STORE_HASH_MISMATCH', {
      reason: cause instanceof Error ? cause.message : 'reconstruction failed',
    });
  }

  // The reconstruction must reproduce the authority's expected packet hash.
  const reconstructedHash: Sha256Hex = sha256Hex(finalBytes);
  if (reconstructedHash !== event.expectedPacketHash) {
    return err('STORE_HASH_MISMATCH', {
      reason: 'reconstructed bytes do not match the expected packet hash',
      expected: event.expectedPacketHash,
      actual: reconstructedHash,
    });
  }

  // Store the final bytes under the internal locator (private write, no URL).
  const writeResult = await ports.store.writeMaterialized({
    locator: event.objectLocator,
    bytes: finalBytes,
  });
  if (!writeResult.ok) return propagateFailure(writeResult);

  // Verify what was ACTUALLY stored - a corrupt write is caught here.
  const storedHashResult = await ports.store.readStoredHash(event.objectLocator);
  if (!storedHashResult.ok) return propagateFailure(storedHashResult);
  if (storedHashResult.value !== event.expectedPacketHash) {
    return err('STORE_HASH_MISMATCH', {
      reason: 'stored bytes do not match the expected packet hash',
      expected: event.expectedPacketHash,
      actual: storedHashResult.value,
    });
  }

  // Only now: MATERIALIZING -> AVAILABLE.
  const availableResult = await ports.db.markArtifactAvailable({
    artifactId: event.artifactId,
    contentHash: event.contentHash,
  });
  if (!availableResult.ok) return propagateFailure(availableResult);

  return ok(buildRecord(event, 'AVAILABLE'));
}

/**
 * artifactRepository.ts - Private tenant artifact store port (design §8, §6.5, §9)
 *
 * The `ArtifactRepository` component (design §8): a tenant-scoped PRIVATE store
 * that quarantines the canonical payload, materializes final bytes, verifies its
 * own stored hash, and marks bytes void - and holds NO release authority. It has
 * NO method that returns a raw object locator as a URL or a reusable signed URL to
 * a caller: shadow P2 containment forbids exposing plaintext to a human path
 * (design §9). Publication of an opaque reference is a separate concern (Task 11);
 * this port deliberately cannot leak.
 *
 * `InMemoryPrivateArtifactRepository` is the reference in-process implementation
 * used by structural tests and shadow runs. A real object-store binding (isolated
 * workload identity) is Phase-C integration; it must implement this exact surface
 * and add no URL-returning method.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import { sha256Hex } from '../canonical/hash.js';
import type { Sha256Hex } from '../contracts/protocolV3.js';

/** A private-store write: the internal DB-provided locator and the exact bytes. */
export interface ArtifactWriteInput {
  locator: string;
  bytes: Uint8Array;
}

/**
 * The private artifact store surface. Every method returns a stable reason code on
 * failure and never throws for a domain error. There is intentionally NO method
 * that returns a URL or signed URL - containment is enforced by the port shape.
 */
export interface ArtifactStorePort {
  /** Write the canonical unsigned payload to the private store as QUARANTINED bytes. */
  writeQuarantined(input: Readonly<ArtifactWriteInput>): Promise<TrustResult<void>>;
  /** Read the persisted quarantined payload bytes for reconstruction. */
  readQuarantined(locator: string): Promise<TrustResult<Uint8Array>>;
  /** Write the assembled final packet bytes to the private store (materialization). */
  writeMaterialized(input: Readonly<ArtifactWriteInput>): Promise<TrustResult<void>>;
  /** SHA-256 of the bytes ACTUALLY persisted under the locator (store-integrity check). */
  readStoredHash(locator: string): Promise<TrustResult<Sha256Hex>>;
  /** Mark the private artifact bytes void on a pre-commit abort; never deletes history, never exposes. */
  markVoid(locator: string): Promise<TrustResult<void>>;
}

type Phase = 'QUARANTINED' | 'MATERIALIZED' | 'VOID';
interface StoredBlob {
  phase: Phase;
  quarantine?: Uint8Array;
  materialized?: Uint8Array;
}

/**
 * In-process private store. Bytes live only in a module-private Map keyed by the
 * internal locator; nothing is ever surfaced as a URL. The stored hash is computed
 * from the bytes actually held, so a corrupted or missing blob is detectable.
 */
export class InMemoryPrivateArtifactRepository implements ArtifactStorePort {
  private readonly blobs = new Map<string, StoredBlob>();

  async writeQuarantined(input: Readonly<ArtifactWriteInput>): Promise<TrustResult<void>> {
    if (!input || typeof input.locator !== 'string' || input.locator.length === 0) {
      return err('STORE_QUARANTINE_FAILED', { reason: 'invalid locator' });
    }
    this.blobs.set(input.locator, { phase: 'QUARANTINED', quarantine: input.bytes });
    return ok(undefined);
  }

  async readQuarantined(locator: string): Promise<TrustResult<Uint8Array>> {
    const blob = this.blobs.get(locator);
    if (blob === undefined || blob.quarantine === undefined || blob.phase === 'VOID') {
      return err('STORE_ARTIFACT_UNAVAILABLE', { locator });
    }
    return ok(blob.quarantine);
  }

  async writeMaterialized(input: Readonly<ArtifactWriteInput>): Promise<TrustResult<void>> {
    const blob = this.blobs.get(input.locator);
    if (blob === undefined || blob.phase === 'VOID') {
      return err('STORE_ARTIFACT_UNAVAILABLE', { locator: input.locator });
    }
    blob.phase = 'MATERIALIZED';
    blob.materialized = input.bytes;
    return ok(undefined);
  }

  async readStoredHash(locator: string): Promise<TrustResult<Sha256Hex>> {
    const blob = this.blobs.get(locator);
    if (blob === undefined || blob.materialized === undefined || blob.phase !== 'MATERIALIZED') {
      return err('STORE_ARTIFACT_UNAVAILABLE', { locator });
    }
    return ok(sha256Hex(blob.materialized));
  }

  async markVoid(locator: string): Promise<TrustResult<void>> {
    const blob = this.blobs.get(locator);
    // Idempotent: voiding an unknown or already-void locator is a no-op success.
    this.blobs.set(locator, { phase: 'VOID', quarantine: undefined, materialized: blob?.materialized });
    return ok(undefined);
  }
}

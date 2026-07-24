/**
 * issueSignedBundle.ts - Sign + persist a trust / release-status bundle (§11.3)
 *
 * The single issuance boundary for `TrustBundleV1` and `ReleaseStatusBundleV1`.
 * It canonicalizes the unsigned bundle, hashes it, signs the DIGEST through the
 * `ManagedSignerPort` with the configured trust-bundle key (purpose TRUST_BUNDLE),
 * and persists the exact bytes + signature through a `BundlePublicationPort`.
 *
 * The port never receives a private key: the signer is digest-only (Task 8), and
 * the application "stores signer key IDs only" (design §11.2).
 *
 * Guarantees enforced here:
 *   - TRUST-ROOT PINNING: a TRUST bundle can never list its own signing key among
 *     its trusted keys (defense in depth beside `buildTrustBundle`).
 *   - Scope pinning: with a `permittedTrustScope`, the issuer signs ONLY for that
 *     scope (TRUST_SCOPE_MISMATCH otherwise).
 *   - Immutability + idempotency: an existing publication at this
 *     (bundleType, trustScope, sequence) with the SAME canonical hash is returned
 *     unchanged (no second signature, no second sequence); a DIFFERENT hash at an
 *     existing sequence is STATE_CONFLICT.
 *   - Monotonicity: a sequence at/below the current high-water mark is a
 *     TRUST_SEQUENCE_ROLLBACK.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import { ok, err, type TrustResult } from '../result.js';
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import type {
  TenantScopeV1,
  TrustBundleV1,
  ReleaseStatusBundleV1,
  SignatureEnvelopeV1,
  SignatureAlgorithm,
  KeyPurpose,
} from '../contracts/protocolV3.js';
import { type ManagedSignerPort, propagateFailure } from '../signing/managedSignerPort.js';
import { TRUST_BUNDLE_KEY_PURPOSE, type UnsignedTrustBundleV1 } from './buildTrustBundle.js';
import type { UnsignedReleaseStatusBundleV1 } from './buildReleaseStatusBundle.js';

export type UnsignedBundle = UnsignedTrustBundleV1 | UnsignedReleaseStatusBundleV1;
export type SignedBundle = TrustBundleV1 | ReleaseStatusBundleV1;
export type BundleType = SignedBundle['bundleType'];

/** A persisted bundle: the exact signed bundle plus the bytes it was signed over. */
export interface PersistedBundle {
  canonicalHash: string;
  signerKeyId: string;
  signature: SignatureEnvelopeV1;
  bundle: SignedBundle;
}

/**
 * The persistence surface. Migration 0183 (`rpc_trust_bundle_allocate` /
 * `rpc_trust_bundle_commit`) is the production implementation; tests use an
 * in-memory fake. It enforces per-(bundleType, trustScope) monotonic sequences and
 * immutability of a published sequence.
 */
export interface BundlePublicationPort {
  findPublished(
    bundleType: BundleType,
    trustScope: TenantScopeV1,
    sequence: number,
  ): Promise<PersistedBundle | null>;
  maxSequence(bundleType: BundleType, trustScope: TenantScopeV1): Promise<number>;
  persist(record: {
    canonicalHash: string;
    signerKeyId: string;
    signature: SignatureEnvelopeV1;
    bundle: SignedBundle;
  }): Promise<PersistedBundle>;
}

export interface IssueSignedBundleOptions {
  signer: ManagedSignerPort;
  store: BundlePublicationPort;
  /** The pinned trust-bundle SIGNING key id (lives OUTSIDE the bundle). */
  trustBundleKeyId: string;
  /** If set, the bundle's trustScope MUST equal this permitted scope. */
  permittedTrustScope?: TenantScopeV1;
}

const ED25519: SignatureAlgorithm = 'ed25519';

export async function issueSignedBundle(
  unsigned: UnsignedBundle,
  opts: IssueSignedBundleOptions,
): Promise<TrustResult<SignedBundle>> {
  const { signer, store, trustBundleKeyId, permittedTrustScope } = opts;

  // Scope pinning: the issuer signs only for its permitted trust scope.
  if (
    permittedTrustScope !== undefined &&
    canonicalJson(unsigned.trustScope) !== canonicalJson(permittedTrustScope)
  ) {
    return err('TRUST_SCOPE_MISMATCH', { reason: 'bundle trust scope is outside the permitted scope' });
  }

  // Trust-root pinning (defense in depth beside buildTrustBundle): a TRUST bundle
  // can never list its own signing key among its trusted (downstream) keys.
  if (unsigned.bundleType === 'TRUST') {
    for (const key of unsigned.trustedKeys) {
      if (key.keyId === trustBundleKeyId) {
        return err('CRYPTO_ALGORITHM_DENIED', {
          reason: 'a trust bundle cannot authorize its own signing key',
          keyId: key.keyId,
        });
      }
    }
  }

  const canonicalHash = sha256Hex(canonicalJson(unsigned));

  // Immutability + idempotency at this (bundleType, trustScope, sequence).
  const existing = await store.findPublished(unsigned.bundleType, unsigned.trustScope, unsigned.sequence);
  if (existing !== null) {
    return existing.canonicalHash === canonicalHash
      ? ok(existing.bundle)
      : err('STATE_CONFLICT', { reason: 'an issued bundle sequence is immutable' });
  }

  // Monotonicity: a sequence at/below the current high-water mark is a rollback.
  const highWater = await store.maxSequence(unsigned.bundleType, unsigned.trustScope);
  if (unsigned.sequence <= highWater) {
    return err('TRUST_SEQUENCE_ROLLBACK', {
      reason: 'bundle sequence is not above the current high-water mark',
      sequence: String(unsigned.sequence),
      highWater: String(highWater),
    });
  }

  // Sign the DIGEST only, through the managed signer port. The trust-bundle key
  // purpose is a Task-1 contract widening owned by Task 9; the port's `purpose`
  // field is typed to Task 1's 3-valued KeyPurpose, so the widened value crosses
  // this boundary with a single documented cast (reported as a spec delta).
  const signResult = await signer.sign({
    keyId: trustBundleKeyId,
    purpose: TRUST_BUNDLE_KEY_PURPOSE as unknown as KeyPurpose,
    digestSha256: canonicalHash,
  });
  if (!signResult.ok) {
    return propagateFailure<SignedBundle>(signResult);
  }

  const signature: SignatureEnvelopeV1 = {
    alg: ED25519,
    keyId: trustBundleKeyId,
    sig: signResult.value.signatureBase64,
  };
  const bundle = { ...unsigned, signature } as SignedBundle;
  const persisted = await store.persist({
    canonicalHash,
    signerKeyId: trustBundleKeyId,
    signature,
    bundle,
  });
  return ok(persisted.bundle);
}

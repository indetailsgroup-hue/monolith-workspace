/**
 * managedSignerPort.ts - The digest-only managed signing boundary (design §8, §11.2)
 *
 * The single cryptographic boundary of the release worker. `ManagedSignerPort.sign`
 * takes a SHA-256 DIGEST and a public key ID and returns an Ed25519 signature. It
 * NEVER receives private key bytes, seed material, or a PEM, and no implementation
 * of this port may hold one: the application "stores signer key IDs only" and the
 * "release ... private keys remain behind managed signer ports" (design §11.2,
 * global constraint). The private key lives only in the remote managed signer.
 *
 * This module carries no cryptography library. It defines the port, the signature
 * shape, and the fail-closed input guard (`guardDigestOnlyInput`) that rejects a
 * non-digest request or any attempt to smuggle key material through the port
 * surface. Purpose binding reuses Task 3's `requireKeyPurpose`.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type { TrustReasonCode } from '../reasonCodes.js';
import type { KeyPurpose } from '../contracts/protocolV3.js';

/** The pinned managed signing algorithm identifier returned by the signer (design §11.2). */
export type ManagedSignerAlgorithm = 'Ed25519';

/** The managed signer's response: an Ed25519 signature bound to a public key ID. */
export interface ManagedSignature {
  algorithm: ManagedSignerAlgorithm;
  keyId: string;
  signatureBase64: string;
}

/**
 * The ONLY input a managed signer ever receives: a public key ID, a bound purpose,
 * and a 64-hex SHA-256 digest. There is deliberately no field for key material.
 */
export interface ManagedSignerSignInput {
  keyId: string;
  purpose: KeyPurpose;
  digestSha256: string;
}

/**
 * The managed signing port. `sign` is total: it returns a stable reason code on
 * failure and never throws for a domain error. It never receives, and no
 * implementation ever holds, a private key.
 */
export interface ManagedSignerPort {
  sign(
    input: Readonly<ManagedSignerSignInput>,
  ): Promise<TrustResult<Readonly<ManagedSignature>>>;
}

/** The pinned algorithm constant. */
export const MANAGED_SIGNER_ALGORITHM: ManagedSignerAlgorithm = 'Ed25519';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Re-type a FAILED `TrustResult<X>` as a `TrustResult<T>` without a structural
 * mismatch. `strictNullChecks` is off in this package, so `!r.ok` does not narrow
 * the discriminated union; a failed result has no `value`, so reconstructing it
 * through `err` is sound and matches the codebase's cast idiom.
 */
export function propagateFailure<T>(result: TrustResult<unknown>): TrustResult<T> {
  const e = result as { code: TrustReasonCode; detail?: Readonly<Record<string, string>> };
  return e.detail === undefined ? err<T>(e.code) : err<T>(e.code, e.detail);
}

/**
 * Any of these keys appearing on a sign input is treated as an attempt to pass
 * private key material and is rejected fail-closed. The port takes a digest only.
 */
export const FORBIDDEN_KEY_MATERIAL_FIELDS = [
  'privateKey',
  'private',
  'seed',
  'pem',
  'secret',
  'secretKey',
  'key',
  'keyBytes',
  'keyMaterial',
  'd', // JWK Ed25519 private scalar
  'privateJwk',
] as const;

/**
 * Fail-closed guard on the sign input. Rejects (a) any private-key-shaped field
 * smuggled onto the input object and (b) a request whose `digestSha256` is not a
 * 64-character lowercase-hex SHA-256 digest. A caller therefore cannot pass raw
 * bytes disguised as a "digest", and cannot attach a key. On success it returns a
 * normalized input carrying ONLY `{ keyId, purpose, digestSha256 }`.
 */
export function guardDigestOnlyInput(
  input: Readonly<ManagedSignerSignInput>,
): TrustResult<ManagedSignerSignInput> {
  if (input === null || typeof input !== 'object') {
    return err('CRYPTO_ALGORITHM_DENIED', { reason: 'sign input is not an object' });
  }
  for (const field of FORBIDDEN_KEY_MATERIAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      return err('CRYPTO_ALGORITHM_DENIED', {
        reason: 'private key material is not accepted by the managed signer port',
        field,
      });
    }
  }
  if (typeof input.digestSha256 !== 'string' || !SHA256_HEX.test(input.digestSha256)) {
    return err('CRYPTO_ALGORITHM_DENIED', {
      reason: 'digestSha256 must be a 64-character lowercase-hex SHA-256 digest',
    });
  }
  if (typeof input.keyId !== 'string' || input.keyId.length === 0) {
    return err('CRYPTO_ALGORITHM_DENIED', { reason: 'keyId is required' });
  }
  return ok({ keyId: input.keyId, purpose: input.purpose, digestSha256: input.digestSha256 });
}

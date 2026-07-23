/**
 * verifyGovernanceSignature.ts - Managed-key-purpose + Ed25519 signature port
 *
 * The signature-verification boundary for governance records (machine-profile
 * attestations and warning-exception grants) in the MONOLITH Production Trust
 * Kernel (approved design 2026-07-22 §11.2 signing profile, §11.3 trust bundles,
 * §12 capability safety, §13 error model).
 *
 * The application stores signer KEY IDs only. This module adds NO cryptography
 * library: Ed25519 verification is performed through an INJECTED public-key
 * verifier port (a function parameter). Production wires a managed-signer-backed
 * verifier; tests wire a deterministic fake over the canonical bytes. No private
 * key material is ever present.
 *
 * The verifier canonicalizes the unsigned record (Task 1 `canonicalJson`, RFC
 * 8785-style), pins the signature algorithm to Ed25519, resolves the signing key
 * from the trusted set, enforces the key's declared purpose, and finally checks
 * the signature bytes through the injected port.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { canonicalJson } from '../canonical/canonicalJson.js';
import { ok, err, type TrustResult } from '../result.js';
import type {
  KeyPurpose,
  SignatureAlgorithm,
  SignatureEnvelopeV1,
  TrustedKeyV1,
} from '../contracts/protocolV3.js';

export type { KeyPurpose } from '../contracts/protocolV3.js';

/** The pinned managed signing algorithm (design §11.2). */
const ED25519: SignatureAlgorithm = 'ed25519';

/**
 * Injected public-key verifier port. Returns `true` iff `signature` is a valid
 * `algorithm` signature over `message` for the key identified by `keyId`. Never
 * receives or returns private key material. May throw to signal signer
 * unavailability, which surfaces as `CRYPTO_SIGNER_UNAVAILABLE`.
 */
export type PublicKeyVerifier = (input: {
  keyId: string;
  message: Uint8Array;
  signature: string;
  algorithm: SignatureAlgorithm;
}) => boolean;

/** A signed governance record: any object carrying a `SignatureEnvelopeV1`. */
export type SignedRecord = { signature: SignatureEnvelopeV1 };

export interface GovernanceSignatureOptions {
  /** The purpose the signing key MUST declare (design §11.3). */
  purpose: KeyPurpose;
  /** The trusted signing keys (from an external trust bundle). */
  trustedKeys: readonly TrustedKeyV1[];
  /** The injected Ed25519 verifier port. */
  verifySignature: PublicKeyVerifier;
}

/**
 * Enforce that a trusted key was minted for the expected purpose (plan Task 3
 * Step 4). A purpose mismatch is an algorithm/policy denial, never a soft warning.
 */
export function requireKeyPurpose(
  key: TrustedKeyV1,
  expected: KeyPurpose,
): TrustResult<TrustedKeyV1> {
  return key.purpose === expected
    ? ok(key)
    : err('CRYPTO_ALGORITHM_DENIED', { expected, actual: key.purpose });
}

/**
 * Verify a governance record's Ed25519 signature over its canonical unsigned
 * form, returning the trusted key on success. Order of denial:
 *   1. non-Ed25519 signature algorithm  -> CRYPTO_ALGORITHM_DENIED
 *   2. unknown / untrusted key id        -> CRYPTO_SIGNATURE_INVALID
 *   3. wrong key purpose                 -> CRYPTO_ALGORITHM_DENIED
 *   4. non-Ed25519 key algorithm         -> CRYPTO_ALGORITHM_DENIED
 *   5. verifier port throws              -> CRYPTO_SIGNER_UNAVAILABLE
 *   6. signature does not verify         -> CRYPTO_SIGNATURE_INVALID
 */
export function verifyGovernanceSignature<T extends SignedRecord>(
  record: T,
  options: GovernanceSignatureOptions,
): TrustResult<TrustedKeyV1> {
  const { signature } = record;

  if (signature.alg !== ED25519) {
    return err('CRYPTO_ALGORITHM_DENIED', { expected: ED25519, actual: String(signature.alg) });
  }

  const key = options.trustedKeys.find((k) => k.keyId === signature.keyId);
  if (key === undefined) {
    return err('CRYPTO_SIGNATURE_INVALID', { keyId: signature.keyId, reason: 'untrusted key id' });
  }

  const purposeResult = requireKeyPurpose(key, options.purpose);
  if (!purposeResult.ok) {
    return purposeResult;
  }

  if (key.algorithm !== ED25519) {
    return err('CRYPTO_ALGORITHM_DENIED', { expected: ED25519, actual: key.algorithm });
  }

  // Canonicalize the record WITHOUT its signature: this is the exact byte string
  // the managed signer signed.
  const { signature: _signature, ...unsigned } = record;
  const message = new TextEncoder().encode(canonicalJson(unsigned));

  let valid: boolean;
  try {
    valid = options.verifySignature({
      keyId: signature.keyId,
      message,
      signature: signature.sig,
      algorithm: signature.alg,
    });
  } catch (cause) {
    return err('CRYPTO_SIGNER_UNAVAILABLE', {
      keyId: signature.keyId,
      reason: cause instanceof Error ? cause.message : 'verifier port unavailable',
    });
  }

  return valid ? ok(key) : err('CRYPTO_SIGNATURE_INVALID', { keyId: signature.keyId });
}

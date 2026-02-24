/**
 * Signer Types - Algorithm-agnostic signing interface
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - Abstract interface for signing/verification
 * - Supports swapping algorithms (Ed25519, ECDSA P-256)
 *
 * v1.0: Initial signer types
 */

/** Supported signature algorithms */
export type SigAlg = 'ECDSA_P256_SHA256' | 'ED25519';

/**
 * Signature envelope containing signature and metadata.
 */
export interface SignatureEnvelope {
  /** Algorithm used */
  alg: SigAlg;
  /** Key identifier */
  keyId: string;
  /** ISO timestamp when signed */
  signedAtIso: string;
  /** Base64-encoded signature */
  signatureB64: string;
}

/**
 * Signer interface for algorithm-agnostic signing.
 * Implement this for each algorithm.
 */
export interface Signer {
  /** Algorithm this signer uses */
  alg: SigAlg;
  /** Sign payload and return envelope */
  sign(payload: string, keyId: string): Promise<SignatureEnvelope>;
  /** Verify payload against envelope */
  verify(payload: string, env: SignatureEnvelope): Promise<boolean>;
}

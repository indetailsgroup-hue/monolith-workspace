/**
 * keyring.ts - Cryptographic Keyring Interface
 *
 * Abstract interface for signature verification.
 * The keyring manages public keys and verifies signatures
 * without exposing private key material.
 *
 * @version 1.0.0
 */

/**
 * Keyring interface for signature verification
 *
 * Used throughout the trust chain to verify manifests,
 * trust reports, and factory receipts.
 */
export interface Keyring {
  /** Verify an Ed25519/HMAC signature */
  verifySignature(args: {
    /** The signed data (canonical JSON or raw bytes) */
    message: string | Uint8Array;
    /** Hex-encoded signature */
    signatureHex: string;
    /** Key ID of the signer */
    keyId: string;
  }): Promise<boolean>;

  /** Get public key hex for a key ID (null if not found) */
  getPublicKeyHex(keyId: string): Promise<string | null>;

  /** Check if a key ID is known */
  hasKey(keyId: string): Promise<boolean>;
}

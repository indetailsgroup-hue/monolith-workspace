/**
 * Release Manifest Types (v0.10)
 *
 * Type definitions for signed release manifests.
 * Used during artifact verification to check file integrity
 * and signature validity.
 */

/**
 * File entry in a signed manifest.
 */
export interface ManifestFileEntry {
  /** File path in bundle */
  path: string;
  /** SHA-256 hash of file content (hex) */
  sha256: string;
  /** File size in bytes */
  bytes: number;
}

/**
 * Manifest signature metadata.
 */
export interface ManifestSignature {
  /** Signature algorithm (e.g., 'ed25519', 'ECDSA_P256_SHA256') */
  alg: string;
  /** Public key identifier */
  publicKeyId: string;
  /** Base64-encoded signature */
  sigBase64: string;
}

/**
 * Signed release manifest.
 *
 * Contains file hashes and optional cryptographic signature
 * for verifying artifact bundle integrity.
 */
export interface SignedManifest {
  /** Manifest version (e.g., 'release-manifest.v1') */
  version: string;
  /** Creation timestamp (ISO 8601) */
  createdAtIso: string;
  /** Files in the manifest with integrity data */
  files: ManifestFileEntry[];
  /** Optional cryptographic signature */
  signature?: ManifestSignature;
}

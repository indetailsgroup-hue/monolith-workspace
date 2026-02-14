/**
 * Release Manifest Types
 *
 * Defines the structure for signed manifests that track
 * factory artifacts with integrity hashes.
 */

/**
 * Single file entry in the manifest
 */
export type ManifestFile = {
  /** File path (e.g., "cutlist.csv", "manifest.json") */
  path: string;
  /** MIME type (e.g., "text/csv", "application/json") */
  mime: string;
  /** Content length in bytes (UTF-8 encoded) */
  bytes: number;
  /** SHA-256 hash in hex format */
  sha256: string;
};

/**
 * Signed manifest for a release package
 *
 * Contains provenance information and file hashes for verification.
 */
export type SignedManifest = {
  /** Manifest version for compatibility */
  manifestVersion: string; // "release-manifest-0.1.0"

  // ========== Identity / Provenance ==========

  /** Project identifier */
  projectId: string;
  /** Immutable snapshot identifier */
  snapshotId: string;
  /** Gate report identifier (must have 0 blockers) */
  gateReportId: string;
  /** Release identifier */
  releaseId: string;

  // ========== Policy & Determinism ==========

  /** Gate policy version used for validation */
  policyVersion: string;
  /** Canonical hash from snapshot (if present) */
  canonicalHash?: string;

  // ========== Timestamps ==========

  /** ISO timestamp when manifest was created */
  createdAtIso: string;
  /** User who created the release */
  createdBy: string;

  // ========== Artifacts ==========

  /** List of files with integrity hashes */
  files: ManifestFile[];

  // ========== Signature (reserved for future) ==========

  /** Optional cryptographic signature */
  signature?: {
    /** Signing algorithm */
    alg: 'ed25519' | 'rsa-pss' | 'none';
    /** Public key identifier (for key lookup) */
    publicKeyId?: string;
    /** Base64-encoded signature */
    sigBase64?: string;
  };
};

/**
 * Artifact content for storage
 */
export type ArtifactContent = {
  /** File path */
  path: string;
  /** MIME type */
  mime: string;
  /** UTF-8 content */
  content: string;
};

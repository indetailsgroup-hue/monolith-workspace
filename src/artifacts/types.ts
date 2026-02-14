/**
 * Artifact Store Types
 *
 * Defines immutable artifact storage for released factory packages.
 * Artifacts are stored ONCE at release time and never regenerated.
 */

export type ArtifactPath = string;

/**
 * Single artifact record with integrity data
 */
export type ArtifactRecord = {
  /** File path (e.g., "cutlist.csv", "manifest.json") */
  path: ArtifactPath;
  /** MIME type with charset */
  mime: string;
  /** UTF-8 content */
  content: string;
  /** Byte length (computed from UTF-8 encoding at write time) */
  bytes: number;
  /** SHA-256 hash in hex format */
  sha256: string;
};

/**
 * Immutable bundle of artifacts for a release
 */
export type ArtifactBundle = {
  /** Bundle identifier (e.g., "bundle_rel_000123") */
  bundleId: string;
  /** Associated release ID */
  releaseId: string;
  /** Associated snapshot ID */
  snapshotId: string;
  /** Creation timestamp */
  createdAtIso: string;
  /** User who created the bundle */
  createdBy: string;
  /** Immutable artifact records */
  items: ArtifactRecord[];
};

/**
 * Artifact storage interface
 *
 * In-memory for dev/mock, replace with object storage for production.
 */
export interface ArtifactStore {
  /** Store a bundle (immutable after write) */
  putBundle(bundle: ArtifactBundle): void;

  /** Retrieve a bundle by ID */
  getBundle(bundleId: string): ArtifactBundle | undefined;

  /** Convenience: get single artifact from bundle */
  getArtifact(bundleId: string, path: ArtifactPath): ArtifactRecord | undefined;

  /** List all bundle IDs (for debugging) */
  listBundleIds(): string[];
}

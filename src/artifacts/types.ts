/**
 * Artifact Bundle Types
 *
 * Type definitions for artifact bundles used in verification.
 */

/**
 * Single item in an artifact bundle.
 */
export interface ArtifactBundleItem {
  /** File path within the bundle */
  path: string;
  /** UTF-8 text content */
  content: string;
}

/**
 * Artifact bundle — a collection of files for verification.
 */
export interface ArtifactBundle {
  /** Bundle items (files) */
  items: ArtifactBundleItem[];
}

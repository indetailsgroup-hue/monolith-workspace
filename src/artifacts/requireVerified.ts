/**
 * Strict Verified Release Enforcement
 *
 * Use this helper in any export entrypoint (DXF/CSV/GCode) to ensure
 * artifacts are verified before any factory export.
 */

import type { SignedManifest } from '../release/manifest/types';
import { artifactStore } from './store';
import { verifyBundleAgainstManifest } from './verify';
import type { ArtifactBundle } from './types';

/**
 * Require verified release before any factory export
 *
 * Throws if:
 * - Bundle not found
 * - Verification fails (hash mismatch, missing files, etc.)
 *
 * @param bundleId - Artifact bundle ID from release
 * @param manifest - Signed manifest with expected hashes
 * @returns Verified artifact bundle
 * @throws Error if verification fails
 *
 * @example
 * ```ts
 * // In any export function
 * const bundle = await requireVerifiedRelease(
 *   release.artifactBundleId,
 *   release.signedManifest
 * );
 * const cutlist = bundle.items.find(i => i.path === 'cutlist.csv');
 * ```
 */
export async function requireVerifiedRelease(
  bundleId: string,
  manifest: SignedManifest
): Promise<ArtifactBundle> {
  const bundle = artifactStore.getBundle(bundleId);

  if (!bundle) {
    throw new Error(
      `Artifact bundle "${bundleId}" not found. Cannot export unverified release.`
    );
  }

  const result = await verifyBundleAgainstManifest(bundle, manifest);

  if (!result.ok) {
    const firstError = result.errors[0];
    throw new Error(
      `Release verification failed: ${firstError.path}: ${firstError.message}`
    );
  }

  return bundle;
}

/**
 * Get artifact content from verified bundle
 *
 * Combines verification and content retrieval in one call.
 *
 * @param bundleId - Artifact bundle ID
 * @param manifest - Signed manifest
 * @param path - Artifact path to retrieve
 * @returns Artifact content string
 * @throws Error if verification fails or artifact not found
 */
export async function getVerifiedArtifact(
  bundleId: string,
  manifest: SignedManifest,
  path: string
): Promise<string> {
  const bundle = await requireVerifiedRelease(bundleId, manifest);

  const item = bundle.items.find((i) => i.path === path);
  if (!item) {
    throw new Error(`Artifact "${path}" not found in verified bundle.`);
  }

  return item.content;
}

/**
 * buildExportBundle.ts - Build Export Bundle
 *
 * Creates a factory-verifiable export bundle containing:
 * - Artifact content (DXF, CSV, CNC, etc.)
 * - Manifest chain proof
 * - Bundle index with content hashes
 *
 * @version 1.0.0
 */

import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { Keyring } from '../crypto/keyring';
import { loadChainProof } from '../manifest/loadManifestChain';
import { sha256Hex, sha256CanonicalHex } from '../../crypto/sha256';

/**
 * Bundle build options
 */
interface BuildExportBundleOptions {
  /** Include chain proof in bundle */
  includeChainProof: boolean;
  /** Chain proof depth */
  chainProofDepth: number;
  /** Creator identifier */
  createdBy?: string;
}

/**
 * Bundle index (stored as JSON in the bundle)
 */
interface BundleIndex {
  /** Job ID */
  jobId: string;
  /** Head manifest hash at bundle time */
  headManifestHashHex: string;
  /** Bundle creation timestamp */
  createdIso: string;
  /** Creator */
  createdBy?: string;
  /** Artifact manifest (path → hash) */
  artifacts: Array<{
    path: string;
    sha256Hex: string;
    sizeBytes: number;
  }>;
  /** Chain proof (if included) */
  chainProof?: SignedJobManifest[];
  /** Bundle hash (hash of all artifact hashes sorted) */
  bundleHashHex: string;
}

/**
 * Build export bundle result
 */
type BuildExportBundleResult =
  | { ok: true; zipBlob: Blob; bundleIndex: BundleIndex }
  | { ok: false; reason: string };

/**
 * Build an export bundle
 *
 * Creates a Blob containing all artifacts with a JSON index.
 * The index includes content hashes for each artifact and
 * an optional chain proof.
 */
export async function buildExportBundle(args: {
  jobId: string;
  store: ManifestStore;
  keyring: Keyring;
  artifactContent: Map<string, Uint8Array>;
  options: BuildExportBundleOptions;
}): Promise<BuildExportBundleResult> {
  const { jobId, store, artifactContent, options } = args;

  // Load HEAD
  const headHash = await store.getHead(jobId);
  if (!headHash) {
    return { ok: false, reason: `No HEAD manifest for job: ${jobId}` };
  }

  // Hash all artifacts
  const artifactEntries: BundleIndex['artifacts'] = [];
  for (const [path, content] of artifactContent.entries()) {
    const hash = await sha256Hex(content);
    artifactEntries.push({
      path,
      sha256Hex: hash,
      sizeBytes: content.length,
    });
  }

  // Sort by path for determinism
  artifactEntries.sort((a, b) => a.path.localeCompare(b.path));

  // Compute bundle hash
  const hashInput = artifactEntries.map((a) => a.sha256Hex).join(':');
  const bundleHashHex = await sha256Hex(hashInput);

  // Load chain proof if requested
  let chainProof: SignedJobManifest[] | undefined;
  if (options.includeChainProof) {
    const proof = await loadChainProof({
      jobId,
      store,
      depth: options.chainProofDepth,
    });
    if (proof) chainProof = proof;
  }

  // Build index
  const bundleIndex: BundleIndex = {
    jobId,
    headManifestHashHex: headHash,
    createdIso: new Date().toISOString(),
    createdBy: options.createdBy,
    artifacts: artifactEntries,
    chainProof,
    bundleHashHex,
  };

  // Create blob (JSON index + binary artifacts)
  const indexJson = JSON.stringify(bundleIndex, null, 2);
  const indexBlob = new Blob([indexJson], { type: 'application/json' });

  // For now, create a simple combined blob
  // In production, this would be a proper ZIP
  const parts: BlobPart[] = [indexBlob];
  for (const [, content] of artifactContent.entries()) {
    parts.push(new Uint8Array(content));
  }

  const zipBlob = new Blob(parts, { type: 'application/octet-stream' });

  return { ok: true, zipBlob, bundleIndex };
}

/**
 * Generate a deterministic bundle filename
 */
export function generateBundleFilename(jobId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${jobId}_bundle_${date}.zip`;
}

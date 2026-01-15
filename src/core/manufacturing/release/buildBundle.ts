/**
 * Release Bundle Builder
 *
 * Creates a complete release bundle containing:
 * - snapshot.json (frozen state)
 * - opgraph.json (factory operations)
 * - manifest.json (file hashes + approvals)
 * - manifest.sig.json (signature)
 *
 * v1.0: Initial bundle builder
 */

import type { FrozenSnapshot } from '../gate/snapshot';
import type { ReleaseBundle, ReleaseFile, ApprovalSignature } from './types';
import { fnv1aHash, signManifest } from './signer';

/**
 * Get current ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Generate unique bundle ID.
 */
function generateBundleId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `bundle_${ts}_${rand}`;
}

/**
 * Create a release file from content.
 */
function createReleaseFile(
  path: string,
  content: string,
  mime: string = 'application/json'
): ReleaseFile {
  const bytes = new TextEncoder().encode(content).byteLength;
  const hash = fnv1aHash(content);

  return {
    path,
    content,
    bytes,
    hash,
    mime,
  };
}

/**
 * Build release manifest (embedded in bundle).
 */
interface ManifestContent {
  version: 'release-manifest.v1';
  createdAtIso: string;
  specState: 'RELEASED';
  snapshotId: string;
  snapshotHash: string;
  opGraphHash: string;
  files: Array<{ path: string; hash: string; bytes: number }>;
  approvals: ApprovalSignature[];
}

/**
 * Build complete release bundle.
 */
export function buildReleaseBundle(input: {
  snapshot: FrozenSnapshot;
  approvals: ApprovalSignature[];
  signerKeyId: string;
  factoryId?: string;
}): ReleaseBundle {
  const createdAtIso = nowIso();
  const bundleId = generateBundleId();

  // 1) Create core artifact files
  const snapshotJson = JSON.stringify(input.snapshot, null, 2);
  const opGraphJson = JSON.stringify(input.snapshot.gate.opGraph, null, 2);

  const fSnapshot = createReleaseFile('snapshot.json', snapshotJson);
  const fOpGraph = createReleaseFile('opgraph.json', opGraphJson);

  // 2) Build manifest (without self-reference for simplicity)
  const manifest: ManifestContent = {
    version: 'release-manifest.v1',
    createdAtIso,
    specState: 'RELEASED',
    snapshotId: input.snapshot.snapshotId,
    snapshotHash: input.snapshot.hash,
    opGraphHash: fOpGraph.hash,
    files: [
      { path: fSnapshot.path, hash: fSnapshot.hash, bytes: fSnapshot.bytes },
      { path: fOpGraph.path, hash: fOpGraph.hash, bytes: fOpGraph.bytes },
    ],
    approvals: input.approvals,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const fManifest = createReleaseFile('manifest.json', manifestJson);

  // 3) Sign manifest
  const sigData = signManifest({
    manifestJson,
    keyId: input.signerKeyId,
  });

  const sigJson = JSON.stringify(sigData, null, 2);
  const fSig = createReleaseFile('manifest.sig.json', sigJson);

  // 4) Build bundle
  const bundle: ReleaseBundle = {
    version: 'release-bundle.v1',
    factoryId: input.factoryId,
    createdAtIso,
    bundleId,
    snapshot: input.snapshot,
    opGraph: input.snapshot.gate.opGraph,
    files: [fSnapshot, fOpGraph, fManifest, fSig],
    approvals: input.approvals,
  };

  return bundle;
}

/**
 * Extract manifest from bundle.
 */
export function extractManifest(bundle: ReleaseBundle): ManifestContent | null {
  const manifestFile = bundle.files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) return null;

  try {
    return JSON.parse(manifestFile.content);
  } catch {
    return null;
  }
}

/**
 * Verify bundle file hashes match manifest.
 */
export function verifyBundleIntegrity(bundle: ReleaseBundle): {
  valid: boolean;
  failures: Array<{ path: string; expected: string; actual: string }>;
} {
  const manifest = extractManifest(bundle);
  if (!manifest) {
    return {
      valid: false,
      failures: [{ path: 'manifest.json', expected: 'valid JSON', actual: 'missing or invalid' }],
    };
  }

  const failures: Array<{ path: string; expected: string; actual: string }> = [];

  for (const mf of manifest.files) {
    const bundleFile = bundle.files.find((f) => f.path === mf.path);
    if (!bundleFile) {
      failures.push({ path: mf.path, expected: mf.hash, actual: 'MISSING' });
      continue;
    }

    const actualHash = fnv1aHash(bundleFile.content);
    if (actualHash !== mf.hash) {
      failures.push({ path: mf.path, expected: mf.hash, actual: actualHash });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

/**
 * Export bundle as downloadable JSON.
 */
export function exportBundleAsJson(bundle: ReleaseBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Download bundle as file (browser).
 */
export function downloadBundle(bundle: ReleaseBundle, filename?: string): void {
  const json = exportBundleAsJson(bundle);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${bundle.bundleId}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Download individual file from bundle.
 */
export function downloadBundleFile(file: ReleaseFile): void {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = file.path;
  a.click();

  URL.revokeObjectURL(url);
}

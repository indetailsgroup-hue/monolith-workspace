/**
 * Release Bundle Builder V2 - Real Crypto
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - SHA-256 hashes for all files
 * - ECDSA P-256 signature for manifest
 * - Async operations for WebCrypto
 *
 * v1.0: Initial v2 bundle builder with real crypto
 */

import type { FrozenSnapshot } from '../gate/snapshot';
import type { ReleaseBundle, ReleaseFile, ApprovalSignature } from './types';
import { sha256Hex } from '../../../crypto/sha256';
import { ecdsaSigner } from '../../../crypto/ecdsaP256';
import type { SignatureEnvelope } from '../../../crypto/signerTypes';

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
 * Create a release file with SHA-256 hash.
 */
async function createReleaseFile(
  path: string,
  content: string,
  mime: string = 'application/json'
): Promise<ReleaseFile> {
  const bytes = new TextEncoder().encode(content).byteLength;
  const hash = await sha256Hex(content); // Real SHA-256

  return {
    path,
    content,
    bytes,
    hash,
    mime,
  };
}

/**
 * Manifest content structure.
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
 * Build complete release bundle with real crypto (async).
 *
 * Uses:
 * - SHA-256 for all file hashes
 * - ECDSA P-256 for manifest signature
 */
export async function buildReleaseBundleV2(input: {
  snapshot: FrozenSnapshot;
  approvals: ApprovalSignature[];
  signerKeyId: string;
  factoryId?: string;
}): Promise<ReleaseBundle> {
  const createdAtIso = nowIso();
  const bundleId = generateBundleId();

  // 1) Create core artifact files with SHA-256
  const snapshotJson = JSON.stringify(input.snapshot, null, 2);
  const opGraphJson = JSON.stringify(input.snapshot.gate.opGraph, null, 2);

  const fSnapshot = await createReleaseFile('snapshot.json', snapshotJson);
  const fOpGraph = await createReleaseFile('opgraph.json', opGraphJson);

  // 2) Build manifest with SHA-256 hashes
  const manifest: ManifestContent = {
    version: 'release-manifest.v1',
    createdAtIso,
    specState: 'RELEASED',
    snapshotId: input.snapshot.snapshotId,
    snapshotHash: await sha256Hex(snapshotJson),
    opGraphHash: await sha256Hex(opGraphJson),
    files: [
      { path: fSnapshot.path, hash: fSnapshot.hash, bytes: fSnapshot.bytes },
      { path: fOpGraph.path, hash: fOpGraph.hash, bytes: fOpGraph.bytes },
    ],
    approvals: input.approvals,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const fManifest = await createReleaseFile('manifest.json', manifestJson);

  // 3) Sign manifest with ECDSA P-256
  const sigEnvelope: SignatureEnvelope = await ecdsaSigner.sign(
    manifestJson,
    input.signerKeyId
  );

  const sigJson = JSON.stringify(sigEnvelope, null, 2);
  const fSig = await createReleaseFile('manifest.sig.json', sigJson);

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
 * Verify bundle file hashes (v2 with SHA-256).
 */
export async function verifyBundleIntegrityV2(bundle: ReleaseBundle): Promise<{
  valid: boolean;
  failures: Array<{ path: string; expected: string; actual: string }>;
}> {
  const manifestFile = bundle.files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) {
    return {
      valid: false,
      failures: [{ path: 'manifest.json', expected: 'valid JSON', actual: 'missing' }],
    };
  }

  let manifest: ManifestContent;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch {
    return {
      valid: false,
      failures: [{ path: 'manifest.json', expected: 'valid JSON', actual: 'invalid' }],
    };
  }

  const failures: Array<{ path: string; expected: string; actual: string }> = [];

  // Verify each file hash
  for (const mf of manifest.files) {
    const bundleFile = bundle.files.find((f) => f.path === mf.path);
    if (!bundleFile) {
      failures.push({ path: mf.path, expected: mf.hash, actual: 'MISSING' });
      continue;
    }

    const actualHash = await sha256Hex(bundleFile.content);
    if (actualHash !== mf.hash) {
      failures.push({ path: mf.path, expected: mf.hash, actual: actualHash });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

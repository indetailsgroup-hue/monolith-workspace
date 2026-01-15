/**
 * Verify Artifact Bundle V2 - Real Crypto
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - SHA-256 hash verification for all files
 * - ECDSA P-256 signature verification
 * - Async operations for WebCrypto
 *
 * v1.0: Initial v2 bundle verification
 */

import type { ArtifactBundle } from '../types';
import type { VerifyReport, VerifyIssue } from './verifyTypes';
import { sha256Hex } from '../../crypto/sha256';
import { verifyManifestSigV2 } from './verifyManifestSigV2';

/**
 * Release manifest schema.
 */
interface ReleaseManifest {
  version: 'release-manifest.v1';
  createdAtIso: string;
  specState: string;
  snapshotId: string;
  snapshotHash: string;
  opGraphHash: string;
  files: Array<{ path: string; hash: string; bytes: number }>;
  approvals: Array<{
    approverId: string;
    role: string;
    message: string;
    signedAtIso: string;
    signature: string;
    keyId: string;
  }>;
}

/**
 * Create VerifyReport from issues.
 */
function okReport(issues: VerifyIssue[]): VerifyReport {
  return {
    ok: issues.every((i) => i.severity !== 'ERROR'),
    issues,
  };
}

/**
 * Verify artifact bundle with real crypto (async).
 *
 * Uses:
 * - SHA-256 for hash verification
 * - ECDSA P-256 for signature verification
 */
export async function verifyArtifactBundleV2(bundle: ArtifactBundle): Promise<VerifyReport> {
  const issues: VerifyIssue[] = [];

  const getFile = (path: string) => bundle.files.find((f) => f.path === path);

  // Check required files
  const fManifest = getFile('manifest.json');
  const fSig = getFile('manifest.sig.json');
  const fSnapshot = getFile('snapshot.json');
  const fOpGraph = getFile('opgraph.json');

  if (!fManifest) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_MANIFEST',
      message: 'manifest.json missing',
      path: 'manifest.json',
    });
  }
  if (!fSig) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_SIG',
      message: 'manifest.sig.json missing',
      path: 'manifest.sig.json',
    });
  }
  if (!fSnapshot) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_SNAPSHOT',
      message: 'snapshot.json missing',
      path: 'snapshot.json',
    });
  }
  if (!fOpGraph) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_OPGRAPH',
      message: 'opgraph.json missing',
      path: 'opgraph.json',
    });
  }

  // Can't continue without manifest and signature
  if (!fManifest || !fSig) {
    return okReport(issues);
  }

  // Parse manifest
  let manifest: ReleaseManifest | null = null;
  try {
    manifest = JSON.parse(String(fManifest.content));
  } catch {
    issues.push({
      severity: 'ERROR',
      code: 'MANIFEST_PARSE_FAIL',
      message: 'manifest.json is not valid JSON',
      path: 'manifest.json',
    });
    return okReport(issues);
  }

  // Validate manifest version
  if (!manifest || manifest.version !== 'release-manifest.v1') {
    issues.push({
      severity: 'ERROR',
      code: 'MANIFEST_VERSION_BAD',
      message: 'manifest.version must be release-manifest.v1',
      path: 'manifest.json',
    });
    return okReport(issues);
  }

  // Check specState is RELEASED
  if (manifest.specState !== 'RELEASED') {
    issues.push({
      severity: 'ERROR',
      code: 'MANIFEST_NOT_RELEASED',
      message: `manifest.specState must be RELEASED, got ${manifest.specState}`,
      path: 'manifest.json',
    });
  }

  // Verify signature with ECDSA P-256
  const sigRes = await verifyManifestSigV2({
    manifestJson: String(fManifest.content),
    sigJson: String(fSig.content),
  });
  issues.push(...sigRes.issues);

  if (!sigRes.ok) {
    return okReport(issues);
  }

  // Verify file hashes with SHA-256
  for (const entry of manifest.files ?? []) {
    const f = getFile(entry.path);
    if (!f) {
      issues.push({
        severity: 'ERROR',
        code: 'FILE_MISSING',
        message: `Missing file declared in manifest: ${entry.path}`,
        path: entry.path,
      });
      continue;
    }

    if (f.bytes !== entry.bytes) {
      issues.push({
        severity: 'ERROR',
        code: 'BYTES_MISMATCH',
        message: `Bytes mismatch for ${entry.path}: expected ${entry.bytes}, got ${f.bytes}`,
        path: entry.path,
      });
    }

    const actualHash = await sha256Hex(String(f.content));
    if (actualHash !== entry.hash) {
      issues.push({
        severity: 'ERROR',
        code: 'HASH_MISMATCH',
        message: `SHA-256 mismatch for ${entry.path}`,
        path: entry.path,
      });
    }
  }

  // Cross-check snapshot hash
  if (fSnapshot) {
    const snapHash = await sha256Hex(String(fSnapshot.content));
    if (snapHash !== manifest.snapshotHash) {
      issues.push({
        severity: 'ERROR',
        code: 'SNAPSHOT_HASH_MISMATCH',
        message: `snapshotHash mismatch: expected ${manifest.snapshotHash.slice(0, 16)}..., got ${snapHash.slice(0, 16)}...`,
        path: 'snapshot.json',
      });
    }
  }

  // Cross-check opgraph hash
  if (fOpGraph) {
    const opHash = await sha256Hex(String(fOpGraph.content));
    if (opHash !== manifest.opGraphHash) {
      issues.push({
        severity: 'ERROR',
        code: 'OPGRAPH_HASH_MISMATCH',
        message: `opGraphHash mismatch: expected ${manifest.opGraphHash.slice(0, 16)}..., got ${opHash.slice(0, 16)}...`,
        path: 'opgraph.json',
      });
    }
  }

  // Check approvals (MVP: at least 1)
  if (!manifest.approvals || manifest.approvals.length < 1) {
    issues.push({
      severity: 'ERROR',
      code: 'NO_APPROVALS',
      message: 'manifest.approvals must have at least 1 signature',
      path: 'manifest.json',
    });
  } else {
    issues.push({
      severity: 'INFO',
      code: 'APPROVALS_OK',
      message: `${manifest.approvals.length} approval(s) verified`,
      path: 'manifest.json',
    });
  }

  return okReport(issues);
}

/**
 * Extract manifest from artifact bundle.
 */
export function extractManifestFromArtifactV2(bundle: ArtifactBundle): ReleaseManifest | null {
  const manifestFile = bundle.files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) return null;

  try {
    return JSON.parse(String(manifestFile.content));
  } catch {
    return null;
  }
}

/**
 * Verify Artifact Bundle
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Verifies manifest.sig + hashes + required files
 * - Checks manifest schema and specState
 * - Cross-checks snapshot/opgraph hashes
 *
 * v1.0: Initial bundle verification
 */

import type { ArtifactBundle } from '../types';
import type { VerifyReport, VerifyIssue } from './verifyTypes';
import { fnv1aHash } from '../../core/manufacturing/release/signer';
import { verifyManifestSigMock } from './verifyManifestSig';

/**
 * Release manifest schema (matching buildBundle.ts).
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
 * Verify artifact bundle integrity.
 */
export function verifyArtifactBundle(bundle: ArtifactBundle): VerifyReport {
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

  // Verify signature
  const sigRes = verifyManifestSigMock({
    manifestJson: String(fManifest.content),
    sigJson: String(fSig.content),
  });
  issues.push(...sigRes.issues);

  if (!sigRes.ok) {
    return okReport(issues);
  }

  // Verify file hashes listed in manifest
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

    const actualHash = fnv1aHash(String(f.content));
    if (actualHash !== entry.hash) {
      issues.push({
        severity: 'ERROR',
        code: 'HASH_MISMATCH',
        message: `Hash mismatch for ${entry.path}: expected ${entry.hash}, got ${actualHash}`,
        path: entry.path,
      });
    }
  }

  // Cross-check snapshot hash
  if (fSnapshot) {
    const snapHash = fnv1aHash(String(fSnapshot.content));
    if (snapHash !== manifest.snapshotHash) {
      issues.push({
        severity: 'ERROR',
        code: 'SNAPSHOT_HASH_MISMATCH',
        message: `snapshotHash mismatch: expected ${manifest.snapshotHash}, got ${snapHash}`,
        path: 'snapshot.json',
      });
    }
  }

  // Cross-check opgraph hash
  if (fOpGraph) {
    const opHash = fnv1aHash(String(fOpGraph.content));
    if (opHash !== manifest.opGraphHash) {
      issues.push({
        severity: 'ERROR',
        code: 'OPGRAPH_HASH_MISMATCH',
        message: `opGraphHash mismatch: expected ${manifest.opGraphHash}, got ${opHash}`,
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
      message: `${manifest.approvals.length} approval(s) found`,
      path: 'manifest.json',
    });
  }

  return okReport(issues);
}

/**
 * Extract manifest from artifact bundle.
 */
export function extractManifestFromArtifact(bundle: ArtifactBundle): ReleaseManifest | null {
  const manifestFile = bundle.files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) return null;

  try {
    return JSON.parse(String(manifestFile.content));
  } catch {
    return null;
  }
}

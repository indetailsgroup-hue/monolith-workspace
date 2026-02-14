/**
 * Manifest Builder
 *
 * Deterministic generation of signed manifests with SHA-256 integrity hashes.
 * All artifacts are hashed to create a verifiable chain from source to factory.
 */

import type { SignedManifest, ManifestFile, ArtifactContent } from './types';
import { sha256Hex } from '../../crypto';
import { signManifestJson } from './signManifest';

// ============================================
// INPUT TYPES
// ============================================

export type ArtifactInput = {
  /** File path in the release package (e.g., "cutlist.csv") */
  path: string;
  /** MIME type (e.g., "text/csv") */
  mime: string;
  /** UTF-8 content to hash */
  content: string;
};

export type BuildManifestInput = {
  projectId: string;
  snapshotId: string;
  gateReportId: string;
  releaseId: string;
  policyVersion: string;
  createdAtIso: string;
  createdBy: string;
  canonicalHash?: string;
  artifacts: ArtifactInput[];
};

// ============================================
// MANIFEST VERSION
// ============================================

const MANIFEST_VERSION_UNSIGNED = 'release-manifest-0.1.0';
const MANIFEST_VERSION_SIGNED = 'release-manifest-0.2.0';

// ============================================
// BUILD MANIFEST
// ============================================

/**
 * Build signed manifest with SHA-256 hashes for all artifacts
 *
 * The manifest provides:
 * - Provenance tracking (project → snapshot → gate → release)
 * - Integrity verification via SHA-256 hashes
 * - Deterministic output for same input (sorted files, stable JSON)
 *
 * @param input - Manifest configuration and artifact contents
 * @returns Manifest object and deterministic JSON string
 */
export async function buildSignedManifest(
  input: BuildManifestInput
): Promise<{ manifest: SignedManifest; manifestJson: string }> {
  // Hash all artifacts in parallel
  const filesWithHashes = await Promise.all(
    input.artifacts.map(async (artifact): Promise<ManifestFile> => {
      const bytes = new TextEncoder().encode(artifact.content).length;
      const sha256 = await sha256Hex(artifact.content);

      return {
        path: artifact.path,
        mime: artifact.mime,
        bytes,
        sha256,
      };
    })
  );

  // Sort files by path for deterministic output
  const sortedFiles = [...filesWithHashes].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  // Build manifest
  const manifest: SignedManifest = {
    manifestVersion: MANIFEST_VERSION_UNSIGNED,

    // Identity / Provenance
    projectId: input.projectId,
    snapshotId: input.snapshotId,
    gateReportId: input.gateReportId,
    releaseId: input.releaseId,

    // Policy & Determinism
    policyVersion: input.policyVersion,
    ...(input.canonicalHash ? { canonicalHash: input.canonicalHash } : {}),

    // Timestamps
    createdAtIso: input.createdAtIso,
    createdBy: input.createdBy,

    // Artifacts
    files: sortedFiles,

    // Signature (placeholder for future)
    signature: {
      alg: 'none',
    },
  };

  // Deterministic JSON serialization (sorted keys, 2-space indent)
  const manifestJson = JSON.stringify(manifest, null, 2);

  return { manifest, manifestJson };
}

// ============================================
// ARTIFACT HELPERS
// ============================================

/**
 * Create artifact input from content
 */
export function createArtifact(
  path: string,
  mime: string,
  content: string
): ArtifactInput {
  return { path, mime, content };
}

/**
 * Standard artifact types for factory releases
 */
export const ARTIFACT_TYPES = {
  CUTLIST_CSV: { mime: 'text/csv', ext: '.csv' },
  MANIFEST_JSON: { mime: 'application/json', ext: '.json' },
  DRILLMAP_CSV: { mime: 'text/csv', ext: '.csv' },
  PANELS_DXF: { mime: 'application/dxf', ext: '.dxf' },
  README_TXT: { mime: 'text/plain', ext: '.txt' },
} as const;

// ============================================
// V0.2 SIGNED MANIFEST BUILDER
// ============================================

export type BuildSignedManifestWithArtifactsInput = {
  projectId: string;
  snapshotId: string;
  gateReportId: string;
  releaseId: string;
  policyVersion: string;
  createdAtIso: string;
  createdBy: string;
  canonicalHash?: string;

  /** Cut list CSV content */
  cutListCsv: string;

  /** Whether to sign with Ed25519 */
  sign?: boolean;
};

/**
 * Helper to compute UTF-8 byte length
 */
function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/**
 * Hash artifacts and sort by path
 */
async function hashArtifacts(artifacts: ArtifactInput[]): Promise<ManifestFile[]> {
  const hashed: ManifestFile[] = [];
  for (const a of artifacts) {
    const sha256 = await sha256Hex(a.content);
    hashed.push({
      path: a.path,
      mime: a.mime,
      bytes: utf8ByteLength(a.content),
      sha256,
    });
  }
  return [...hashed].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Build signed manifest v0.2 with multi-pass hashing and Ed25519 signing
 *
 * Multi-pass approach for self-consistent manifest:
 * 1. Pass A: Hash cutlist.csv and placeholder manifest.json
 * 2. Pass B: Hash manifest.json with content from A
 * 3. If signing: Pass C/D/E to ensure signature covers final content
 *
 * @param input - Manifest input including cutListCsv and sign flag
 * @returns manifest object, cutListCsv, and manifestJson
 */
export async function buildSignedManifestWithArtifacts(input: BuildSignedManifestWithArtifactsInput): Promise<{
  manifest: SignedManifest;
  cutListCsv: string;
  manifestJson: string;
}> {
  const { cutListCsv, sign = false } = input;

  // Pass A: Hash cutlist.csv and placeholder manifest.json
  const filesA = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: '' },
  ]);

  const manifestA: SignedManifest = {
    manifestVersion: sign ? MANIFEST_VERSION_SIGNED : MANIFEST_VERSION_UNSIGNED,
    projectId: input.projectId,
    snapshotId: input.snapshotId,
    gateReportId: input.gateReportId,
    releaseId: input.releaseId,
    policyVersion: input.policyVersion,
    ...(input.canonicalHash ? { canonicalHash: input.canonicalHash } : {}),
    createdAtIso: input.createdAtIso,
    createdBy: input.createdBy,
    files: filesA,
    signature: { alg: 'none' },
  };

  const manifestJsonA = JSON.stringify(manifestA, null, 2) + '\n';

  // Pass B: Hash manifest.json with content from A
  const filesB = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: manifestJsonA },
  ]);

  let manifestB: SignedManifest = { ...manifestA, files: filesB };
  let manifestJsonB = JSON.stringify(manifestB, null, 2) + '\n';

  // If not signing, return here
  if (!sign) {
    return { manifest: manifestB, cutListCsv, manifestJson: manifestJsonB };
  }

  // ============================================
  // SIGNING: Multi-pass to ensure self-consistency
  // ============================================

  // Pass C: Re-hash with Pass B content
  const filesC = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: manifestJsonB },
  ]);

  // Pass D: Build manifest with filesC, sign it
  let manifestD: SignedManifest = {
    ...manifestB,
    files: filesC,
    signature: { alg: 'none' },
  };
  let manifestJsonD = JSON.stringify(manifestD, null, 2) + '\n';

  // Sign the manifest JSON
  const { keyId, sigBase64 } = await signManifestJson(manifestJsonD);

  manifestD = {
    ...manifestD,
    signature: { alg: 'ed25519', publicKeyId: keyId, sigBase64 },
  };
  manifestJsonD = JSON.stringify(manifestD, null, 2) + '\n';

  // Pass E: Re-hash manifest.json with signature embedded
  const filesE = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: manifestJsonD },
  ]);

  // Final manifest with updated file hashes
  const manifestFinal: SignedManifest = { ...manifestD, files: filesE };
  const manifestJsonFinal = JSON.stringify(manifestFinal, null, 2) + '\n';

  return { manifest: manifestFinal, cutListCsv, manifestJson: manifestJsonFinal };
}

// ============================================
// V0.7 RELEASE PACKAGE MANIFEST BUILDER
// (with revocation-policy.json artifact)
// ============================================

const MANIFEST_VERSION_V07 = 'release-manifest-0.3.0';

export type BuildReleasePackageManifestInput = {
  projectId: string;
  snapshotId: string;
  gateReportId: string;
  releaseId: string;
  policyVersion: string;
  createdAtIso: string;
  createdBy: string;
  canonicalHash?: string;

  /** Cut list CSV content */
  cutListCsv: string;
  /** Signed revocation policy JSON content */
  revocationPolicyJson: string;
};

/**
 * Build v0.7 release package manifest with policy artifact
 *
 * Bundle includes 3 files:
 * - cutlist.csv
 * - revocation-policy.json (signed)
 * - manifest.json (signed, includes hashes of all 3 files)
 *
 * Multi-pass approach ensures self-consistency:
 * - Pass A: Hash cutlist.csv, policy.json, placeholder manifest.json
 * - Pass B: Hash manifest.json with content from A
 * - Pass C: Sign manifest
 * - Pass D: Re-hash with signature
 * - Pass E: Sign final
 */
export async function buildReleasePackageManifest(
  input: BuildReleasePackageManifestInput
): Promise<{
  manifest: SignedManifest;
  manifestJson: string;
}> {
  const { cutListCsv, revocationPolicyJson } = input;

  // Pass A: Build unsigned manifest with placeholder manifest.json hash
  const filesA = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'revocation-policy.json', mime: 'application/json;charset=utf-8', content: revocationPolicyJson },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: '' },
  ]);

  const manifestA: SignedManifest = {
    manifestVersion: MANIFEST_VERSION_V07,
    projectId: input.projectId,
    snapshotId: input.snapshotId,
    gateReportId: input.gateReportId,
    releaseId: input.releaseId,
    policyVersion: input.policyVersion,
    ...(input.canonicalHash ? { canonicalHash: input.canonicalHash } : {}),
    createdAtIso: input.createdAtIso,
    createdBy: input.createdBy,
    files: filesA,
    signature: { alg: 'none' },
  };

  const manifestJsonA = JSON.stringify(manifestA, null, 2) + '\n';

  // Pass B: Re-hash with manifest.json content from A
  const filesB = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'revocation-policy.json', mime: 'application/json;charset=utf-8', content: revocationPolicyJson },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: manifestJsonA },
  ]);

  let manifestB: SignedManifest = { ...manifestA, files: filesB };
  let manifestJsonB = JSON.stringify(manifestB, null, 2) + '\n';

  // Pass C: Sign manifestJsonB (unsigned)
  const { keyId: keyIdC, sigBase64: sigBase64C } = await signManifestJson(manifestJsonB);

  let manifestC: SignedManifest = {
    ...manifestB,
    signature: { alg: 'ed25519', publicKeyId: keyIdC, sigBase64: sigBase64C },
  };
  let manifestJsonC = JSON.stringify(manifestC, null, 2) + '\n';

  // Pass D: Re-hash manifest.json with signature included
  const filesD = await hashArtifacts([
    { path: 'cutlist.csv', mime: 'text/csv;charset=utf-8', content: cutListCsv },
    { path: 'revocation-policy.json', mime: 'application/json;charset=utf-8', content: revocationPolicyJson },
    { path: 'manifest.json', mime: 'application/json;charset=utf-8', content: manifestJsonC },
  ]);

  let manifestD: SignedManifest = {
    ...manifestC,
    files: filesD,
    signature: { alg: 'none' },
  };
  let manifestJsonD = JSON.stringify(manifestD, null, 2) + '\n';

  // Pass E: Sign final manifestJsonD
  const { keyId: keyIdE, sigBase64: sigBase64E } = await signManifestJson(manifestJsonD);

  const manifestFinal: SignedManifest = {
    ...manifestD,
    signature: { alg: 'ed25519', publicKeyId: keyIdE, sigBase64: sigBase64E },
  };
  const manifestJsonFinal = JSON.stringify(manifestFinal, null, 2) + '\n';

  return { manifest: manifestFinal, manifestJson: manifestJsonFinal };
}

// ============================================
// VERIFICATION HELPERS
// ============================================

/**
 * Verify artifact content matches manifest hash
 *
 * @param content - UTF-8 content to verify
 * @param expectedHash - SHA-256 hash from manifest
 * @returns True if hash matches
 */
export async function verifyArtifactHash(
  content: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await sha256Hex(content);
  return actualHash === expectedHash;
}

/**
 * Verify all artifacts in a manifest
 *
 * @param manifest - Signed manifest with file hashes
 * @param artifacts - Map of path → content
 * @returns Verification result with any failures
 */
export async function verifyManifestArtifacts(
  manifest: SignedManifest,
  artifacts: Map<string, string>
): Promise<{
  valid: boolean;
  failures: Array<{ path: string; expected: string; actual: string }>;
}> {
  const failures: Array<{ path: string; expected: string; actual: string }> =
    [];

  await Promise.all(
    manifest.files.map(async (file) => {
      const content = artifacts.get(file.path);
      if (!content) {
        failures.push({
          path: file.path,
          expected: file.sha256,
          actual: 'MISSING',
        });
        return;
      }

      const actualHash = await sha256Hex(content);
      if (actualHash !== file.sha256) {
        failures.push({
          path: file.path,
          expected: file.sha256,
          actual: actualHash,
        });
      }
    })
  );

  return {
    valid: failures.length === 0,
    failures,
  };
}

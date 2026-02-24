/**
 * Bundle Verification
 *
 * Step 9: Server-side bundle integrity verification
 *
 * Features:
 * - Verify all file hashes (SHA-256)
 * - Verify manifest signature
 * - Extract and parse manifest
 */

import { sha256Hex } from '../storage/cas.js';
import { verifyManifestSig } from '../crypto/verifyManifestSig.js';
import type {
  ArtifactBundle,
  ArtifactFile,
  Manifest,
  SignatureEnvelope,
  VerifyReport,
  VerifyIssue,
} from '../types.js';

// ============================================================================
// Bundle Verification
// ============================================================================

/**
 * Verify an artifact bundle:
 * 1. Check all file hashes match content
 * 2. Verify manifest signature
 * 3. Verify manifest file list matches bundle files
 */
export async function verifyBundle(bundle: ArtifactBundle): Promise<VerifyReport> {
  const issues: VerifyIssue[] = [];

  // 1. Find manifest and signature files
  const manifestFile = bundle.files.find((f) => f.name === 'manifest.json');
  const sigFile = bundle.files.find((f) => f.name === 'manifest.sig.json');

  if (!manifestFile) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'MISSING_MANIFEST',
          message: 'Bundle missing manifest.json',
        },
      ],
    };
  }

  if (!sigFile) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'MISSING_SIG',
          message: 'Bundle missing manifest.sig.json',
        },
      ],
    };
  }

  // 2. Parse manifest
  let manifest: Manifest;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'INVALID_MANIFEST',
          message: 'Failed to parse manifest.json',
        },
      ],
    };
  }

  // 3. Parse signature
  let sigEnvelope: SignatureEnvelope;
  try {
    sigEnvelope = JSON.parse(sigFile.content);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'INVALID_SIG',
          message: 'Failed to parse manifest.sig.json',
        },
      ],
    };
  }

  // 4. Verify all file hashes
  const otherFiles = bundle.files.filter(
    (f) => f.name !== 'manifest.json' && f.name !== 'manifest.sig.json'
  );

  for (const file of otherFiles) {
    const expectedHash = file.hashHex;
    const actualHash = sha256Hex(file.content);

    if (expectedHash !== actualHash) {
      issues.push({
        severity: 'ERROR',
        code: 'HASH_MISMATCH',
        message: `Hash mismatch for ${file.name}`,
        file: file.name,
      });
    }
  }

  // 5. Verify manifest lists correct files
  const manifestFileNames = new Set(manifest.files.map((f) => f.name));
  const bundleFileNames = new Set(otherFiles.map((f) => f.name));

  for (const manifestFile of manifest.files) {
    if (!bundleFileNames.has(manifestFile.name)) {
      issues.push({
        severity: 'ERROR',
        code: 'MISSING_FILE',
        message: `Manifest references missing file: ${manifestFile.name}`,
        file: manifestFile.name,
      });
    }
  }

  for (const bundleFile of otherFiles) {
    if (!manifestFileNames.has(bundleFile.name)) {
      issues.push({
        severity: 'WARNING',
        code: 'EXTRA_FILE',
        message: `Bundle contains file not in manifest: ${bundleFile.name}`,
        file: bundleFile.name,
      });
    }
  }

  // 6. Verify manifest file hashes match
  for (const manifestEntry of manifest.files) {
    const bundleFile = otherFiles.find((f) => f.name === manifestEntry.name);
    if (bundleFile) {
      const actualHash = sha256Hex(bundleFile.content);
      if (manifestEntry.hashHex !== actualHash) {
        issues.push({
          severity: 'ERROR',
          code: 'MANIFEST_HASH_MISMATCH',
          message: `Manifest hash mismatch for ${manifestEntry.name}`,
          file: manifestEntry.name,
        });
      }
    }
  }

  // 7. Verify manifest signature
  const sigResult = await verifyManifestSig(manifestFile.content, sigEnvelope);
  if (!sigResult.ok) {
    issues.push(...sigResult.issues);
  }

  // Determine overall result
  const hasErrors = issues.some((i) => i.severity === 'ERROR');

  return {
    ok: !hasErrors,
    issues,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract manifest from a verified bundle.
 */
export function extractManifest(bundle: ArtifactBundle): Manifest | null {
  const manifestFile = bundle.files.find((f) => f.name === 'manifest.json');
  if (!manifestFile) return null;

  try {
    return JSON.parse(manifestFile.content);
  } catch {
    return null;
  }
}

/**
 * Extract signature from a bundle.
 */
export function extractSignature(bundle: ArtifactBundle): SignatureEnvelope | null {
  const sigFile = bundle.files.find((f) => f.name === 'manifest.sig.json');
  if (!sigFile) return null;

  try {
    return JSON.parse(sigFile.content);
  } catch {
    return null;
  }
}

/**
 * Get bundle ID (manifest hash).
 */
export function getBundleId(bundle: ArtifactBundle): string {
  const manifestFile = bundle.files.find((f) => f.name === 'manifest.json');
  if (!manifestFile) return '';

  return sha256Hex(manifestFile.content);
}

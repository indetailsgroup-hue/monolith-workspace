/**
 * Artifact Verification
 *
 * Verify that stored artifacts match manifest hashes exactly.
 * MUST pass verification before any factory export/download.
 *
 * v0.2: Also verifies Ed25519 signature on manifest if present.
 * v0.10: Auto requirePolicy in FACTORY mode + policy precedence.
 */

import type { SignedManifest } from '../release/manifest/types';
import type { ArtifactBundle } from './types';
import { sha256Hex } from '../crypto/sha256';
import { verifyManifestJsonSignature } from '../release/manifest/signManifest';
import { shouldRequirePolicy } from '../release/policy/verifyPolicyMode';
import {
  resolvePolicyJsonByPrecedence,
  type PolicySource,
} from '../release/policy/policyPrecedence';
import { verifyRevocationPolicyArtifact } from '../release/policy/verifyRevocationPolicyArtifact';
import { isKeyRevokedByPolicy } from '../release/policy/applyRevocationPolicy';
import type { SignedRevocationPolicy } from '../release/policy/revocationPolicyTypes';

/**
 * Verification error details
 */
export type VerifyError = {
  path: string;
  expectedSha256?: string;
  actualSha256?: string;
  expectedBytes?: number;
  actualBytes?: number;
  message: string;
};

/**
 * Verification result
 */
export type VerifyResult = {
  ok: boolean;
  errors: VerifyError[];
  /** Policy source used during verification (v0.10) */
  policySource?: PolicySource;
  /** Effective policy used for revocation checks (v0.10) */
  effectivePolicy?: SignedRevocationPolicy;
};

/**
 * Verification options
 */
export type VerifyOptions = {
  /** Skip Ed25519 signature verification */
  skipSignatureVerification?: boolean;
  /** Override auto requirePolicy (default: auto based on runtime mode) */
  requirePolicy?: boolean;
};

/**
 * Compute UTF-8 byte length of a string
 */
function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/**
 * Verify artifact bundle against signed manifest
 *
 * Checks:
 * 1. Policy availability (v0.10: auto required in FACTORY mode)
 * 2. Ed25519 signature (if present)
 * 3. Revocation policy check (if policy available)
 * 4. Every file in manifest exists in bundle
 * 5. Byte lengths match
 * 6. SHA-256 hashes match
 * 7. No extra files in bundle (strict mode)
 *
 * @param bundle - Artifact bundle from store
 * @param manifest - Signed manifest with expected hashes
 * @param options - Optional verification settings
 * @returns Verification result with any errors
 */
export async function verifyBundleAgainstManifest(
  bundle: ArtifactBundle,
  manifest: SignedManifest,
  options?: VerifyOptions
): Promise<VerifyResult> {
  const errors: VerifyError[] = [];

  // Determine if policy is required (auto from runtime mode or explicit override)
  const requirePolicy = options?.requirePolicy ?? shouldRequirePolicy();

  // 0) Resolve policy by precedence (Bundle > Installed > None)
  const bundleLike = { items: bundle.items.map((i) => ({ path: i.path, content: i.content })) };
  const resolved = resolvePolicyJsonByPrecedence(bundleLike);

  let effectivePolicy: SignedRevocationPolicy | undefined;

  // Check policy availability
  if (!resolved.policyJson) {
    if (requirePolicy) {
      errors.push({
        path: 'revocation-policy.json',
        message: 'No policy available (bundle or installed). Policy required in FACTORY mode.',
      });
      // Return early - can't proceed without policy in FACTORY mode
      return { ok: false, errors, policySource: resolved.source };
    }
  } else {
    // Verify policy signature
    const policyVerifyResult = await verifyRevocationPolicyArtifact(resolved.policyJson);
    if (!policyVerifyResult.ok) {
      errors.push({
        path: 'revocation-policy.json',
        message: `Policy verification failed: ${policyVerifyResult.error}`,
      });
    } else {
      effectivePolicy = policyVerifyResult.policy;

      // Check if manifest signing key is revoked
      if (manifest.signature?.publicKeyId && effectivePolicy) {
        const revocationCheck = isKeyRevokedByPolicy(
          effectivePolicy,
          manifest.signature.publicKeyId,
          manifest.createdAtIso
        );
        if (revocationCheck.revoked) {
          errors.push({
            path: 'manifest.json',
            message: `Manifest signing key is revoked: ${revocationCheck.reason}`,
          });
        }
      }
    }
  }

  // 1) Verify Ed25519 signature if present
  if (manifest.signature?.alg === 'ed25519' && !options?.skipSignatureVerification) {
    const { publicKeyId, sigBase64 } = manifest.signature;
    if (!publicKeyId || !sigBase64) {
      errors.push({
        path: 'manifest.json',
        message: 'Ed25519 signature missing required fields (publicKeyId, sigBase64).',
      });
    } else {
      // Get manifest.json from bundle for signature verification
      const manifestItem = bundle.items.find((i) => i.path === 'manifest.json');
      if (!manifestItem) {
        errors.push({
          path: 'manifest.json',
          message: 'Cannot verify signature: manifest.json not found in bundle.',
        });
      } else {
        // Verify signature against the stored manifest JSON
        const sigValid = await verifyManifestJsonSignature({
          manifestJson: manifestItem.content,
          keyId: publicKeyId,
          sigBase64,
        });
        if (!sigValid) {
          errors.push({
            path: 'manifest.json',
            message: 'Ed25519 signature verification failed. Manifest may have been tampered with.',
          });
        }
      }
    }
  }

  // Build set of manifest paths for quick lookup
  const manifestPaths = new Set(manifest.files.map((f) => f.path));

  // 1) Verify every manifest file exists and matches
  for (const file of manifest.files) {
    const item = bundle.items.find((x) => x.path === file.path);

    if (!item) {
      errors.push({
        path: file.path,
        expectedSha256: file.sha256,
        expectedBytes: file.bytes,
        message: 'Missing artifact in bundle.',
      });
      continue;
    }

    // Check byte length
    const actualBytes = utf8ByteLength(item.content);
    if (actualBytes !== file.bytes) {
      errors.push({
        path: file.path,
        expectedBytes: file.bytes,
        actualBytes,
        message: `Byte length mismatch: expected ${file.bytes}, got ${actualBytes}.`,
      });
    }

    // Check SHA-256 hash
    const actualSha256 = await sha256Hex(item.content);
    if (actualSha256 !== file.sha256) {
      errors.push({
        path: file.path,
        expectedSha256: file.sha256,
        actualSha256,
        message: 'SHA-256 hash mismatch.',
      });
    }
  }

  // 2) No extra files in bundle (strict factory safety)
  for (const item of bundle.items) {
    if (!manifestPaths.has(item.path)) {
      errors.push({
        path: item.path,
        message: 'Bundle contains extra artifact not declared in manifest.',
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    policySource: resolved.source,
    effectivePolicy,
  };
}

/**
 * Verify single artifact content against expected hash
 *
 * @param content - UTF-8 content to verify
 * @param expectedSha256 - Expected SHA-256 hash in hex
 * @returns True if hash matches
 */
export async function verifyArtifactContent(
  content: string,
  expectedSha256: string
): Promise<boolean> {
  const actualSha256 = await sha256Hex(content);
  return actualSha256 === expectedSha256;
}

/**
 * Format verification errors for display
 */
export function formatVerifyErrors(errors: VerifyError[]): string {
  if (errors.length === 0) return 'No errors.';

  return errors
    .map((e) => {
      let msg = `${e.path}: ${e.message}`;
      if (e.expectedSha256 && e.actualSha256) {
        msg += `\n  Expected: ${e.expectedSha256.slice(0, 16)}...`;
        msg += `\n  Actual:   ${e.actualSha256.slice(0, 16)}...`;
      }
      if (e.expectedBytes !== undefined && e.actualBytes !== undefined) {
        msg += ` (${e.expectedBytes} vs ${e.actualBytes} bytes)`;
      }
      return msg;
    })
    .join('\n');
}

/**
 * Verify Manifest Signature V2 - Real Crypto
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - Verifies manifest signature using ECDSA P-256
 * - Uses same signer as buildBundleV2
 *
 * v1.0: Initial v2 manifest signature verification
 */

import type { VerifyIssue } from './verifyTypes';
import type { SignatureEnvelope } from '../../crypto/signerTypes';
import { ecdsaSigner } from '../../crypto/ecdsaP256';

/**
 * Verify manifest signature with ECDSA P-256 (async).
 */
export async function verifyManifestSigV2(input: {
  manifestJson: string;
  sigJson: string;
}): Promise<{ ok: boolean; issues: VerifyIssue[] }> {
  const issues: VerifyIssue[] = [];

  // Parse signature envelope
  let env: SignatureEnvelope | null = null;
  try {
    env = JSON.parse(input.sigJson);
  } catch {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_PARSE_FAIL',
      message: 'manifest.sig.json is not valid JSON',
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  // Validate envelope schema
  if (!env?.alg || !env?.keyId || !env?.signatureB64) {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_SCHEMA_INVALID',
      message: 'manifest.sig.json schema invalid (missing alg, keyId, or signatureB64)',
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  // Check algorithm
  if (env.alg !== 'ECDSA_P256_SHA256') {
    issues.push({
      severity: 'WARN',
      code: 'SIG_ALG_MISMATCH',
      message: `Expected ECDSA_P256_SHA256, got ${env.alg}`,
      path: 'manifest.sig.json',
    });
    // Continue anyway to try verification
  }

  // Verify signature
  try {
    const valid = await ecdsaSigner.verify(input.manifestJson, env);

    if (!valid) {
      issues.push({
        severity: 'ERROR',
        code: 'SIG_VERIFY_FAIL',
        message: 'Manifest signature verification failed',
        path: 'manifest.sig.json',
      });
      return { ok: false, issues };
    }
  } catch (err) {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_VERIFY_ERROR',
      message: `Signature verification error: ${err instanceof Error ? err.message : 'unknown'}`,
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  issues.push({
    severity: 'INFO',
    code: 'SIG_OK',
    message: `Signature verified (${env.alg}, keyId=${env.keyId})`,
    path: 'manifest.sig.json',
  });

  return { ok: true, issues };
}

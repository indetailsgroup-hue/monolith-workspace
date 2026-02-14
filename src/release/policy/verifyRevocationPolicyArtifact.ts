/**
 * Verify Revocation Policy Artifact (v0.7)
 *
 * Verifies the cryptographic signature on a signed revocation policy.
 */

import { ecdsaSigner } from '../../crypto/ecdsaP256';
import type { SignedRevocationPolicy } from './revocationPolicyTypes';

/**
 * Policy verification result.
 */
export interface PolicyVerificationResult {
  ok: boolean;
  error?: string;
  policy?: SignedRevocationPolicy;
}

/**
 * Parse policy JSON safely.
 */
export function parseRevocationPolicyJson(jsonStr: string): SignedRevocationPolicy | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.policyType === 'revocation-policy') {
      return parsed as SignedRevocationPolicy;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify signed revocation policy artifact.
 *
 * @param policyJson - The full signed policy JSON string
 * @returns Verification result with parsed policy if valid
 */
export async function verifyRevocationPolicyArtifact(
  policyJson: string
): Promise<PolicyVerificationResult> {
  const policy = parseRevocationPolicyJson(policyJson);
  if (!policy) {
    return { ok: false, error: 'Invalid policy JSON or not a revocation-policy artifact.' };
  }

  if (!policy.signature) {
    return { ok: false, error: 'Policy has no signature.' };
  }

  if (policy.signature.alg !== 'ECDSA_P256_SHA256') {
    return { ok: false, error: `Unsupported signature algorithm: ${policy.signature.alg}` };
  }

  // Reconstruct unsigned payload for verification
  const { signature: _sig, ...unsigned } = policy;
  const payloadJson = JSON.stringify(unsigned, null, 2);

  try {
    const valid = await ecdsaSigner.verify(payloadJson, {
      alg: policy.signature.alg,
      keyId: policy.signature.publicKeyId,
      signedAtIso: policy.signature.signedAtIso,
      signatureB64: policy.signature.sigBase64,
    });

    if (!valid) {
      return { ok: false, error: 'Signature verification failed.', policy };
    }

    return { ok: true, policy };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Verification error.',
      policy,
    };
  }
}

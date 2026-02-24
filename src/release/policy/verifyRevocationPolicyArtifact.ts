/**
 * Verify Revocation Policy Artifact (v0.7)
 *
 * Verifies policy.json signature and scope binding (device-level).
 * Signature covers canonical JSON WITHOUT signature field.
 *
 * Factory Safety:
 * - FACTORY device requires FACTORY-scoped policy
 * - Policy scopeId must match device factoryId
 */

import type { SignedRevocationPolicy } from './revocationPolicyTypes';
import { ed25519Verify } from '../../crypto/ed25519';
import { getVerifierCryptoKey } from '../keys/keyRegistry';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';

/**
 * Verification result for revocation policy
 */
export type PolicyVerificationResult = {
  ok: boolean;
  policy?: SignedRevocationPolicy;
  error?: string;
};

/**
 * Verify revocation policy artifact
 *
 * Checks:
 * 1. Valid JSON format
 * 2. Correct policyType
 * 3. Signature fields present
 * 4. Scope binding (FACTORY device requires FACTORY-scoped policy)
 * 5. Cryptographic signature verification
 *
 * @param policyJson - Raw JSON string of revocation-policy.json
 * @returns Verification result
 */
export async function verifyRevocationPolicyArtifact(
  policyJson: string
): Promise<PolicyVerificationResult> {
  // Parse JSON
  let parsed: SignedRevocationPolicy;
  try {
    parsed = JSON.parse(policyJson);
  } catch {
    return { ok: false, error: 'Invalid JSON for revocation-policy.json' };
  }

  // Validate policy type
  if (parsed.policyType !== 'revocation-policy') {
    return { ok: false, error: 'Not a revocation policy artifact.' };
  }

  // Validate signature fields
  if (!parsed.signature?.publicKeyId || !parsed.signature?.sigBase64) {
    return { ok: false, error: 'Missing signature fields.' };
  }

  if (parsed.signature.alg !== 'ed25519') {
    return { ok: false, error: 'Unsupported signature algorithm.' };
  }

  // Device binding enforcement
  const mode = getRuntimeMode();
  if (mode === 'FACTORY') {
    const factoryId = getFactoryId();
    if (!factoryId) {
      return { ok: false, error: 'FACTORY mode but factoryId not set on this device.' };
    }
    if (parsed.scope !== 'FACTORY') {
      return {
        ok: false,
        error: `Factory device requires FACTORY-scoped policy. This policy has scope: ${parsed.scope}`,
      };
    }
    if ((parsed.scopeId ?? '') !== factoryId) {
      return {
        ok: false,
        error: `Policy scopeId "${parsed.scopeId ?? ''}" does not match device factoryId "${factoryId}".`,
      };
    }
  }

  // Rebuild canonical unsigned JSON (remove signature)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, ...unsigned } = parsed;
  const canonicalUnsignedJson = JSON.stringify(unsigned, null, 2) + '\n';

  // Get verifier key from registry
  let publicKey: CryptoKey;
  try {
    const result = await getVerifierCryptoKey(parsed.signature.publicKeyId);
    publicKey = result.publicKey;

    // Note: getVerifierCryptoKey may apply trust/active checks depending on your policy.
    // For strictest factory safety, ensure the key is TRUSTED + ACTIVE.
    // The existing guards in keyRegistry should handle this.
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to get verifier key from registry.',
    };
  }

  // Verify signature
  const sigValid = await ed25519Verify(
    publicKey,
    canonicalUnsignedJson,
    parsed.signature.sigBase64
  );

  if (!sigValid) {
    return { ok: false, error: 'Policy signature verification failed.' };
  }

  return { ok: true, policy: parsed };
}

/**
 * Parse policy JSON without verification (for inspection)
 *
 * Use this only when you need to inspect policy content before verification.
 */
export function parseRevocationPolicyJson(
  policyJson: string
): SignedRevocationPolicy | null {
  try {
    const parsed = JSON.parse(policyJson);
    if (parsed.policyType === 'revocation-policy') {
      return parsed as SignedRevocationPolicy;
    }
    return null;
  } catch {
    return null;
  }
}

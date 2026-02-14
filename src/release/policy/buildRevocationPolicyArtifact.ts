/**
 * Build Revocation Policy Artifact (v0.7)
 *
 * Builds and signs a revocation policy artifact using ECDSA P-256.
 * The signed artifact can be distributed in bundles or installed locally.
 */

import { ecdsaSigner } from '../../crypto/ecdsaP256';
import { getLocalRevocationPolicy } from './localRevocationPolicyStore';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';
import type { RevocationRule, SignedRevocationPolicy } from './revocationPolicyTypes';

/**
 * Build signed revocation policy artifact from local store.
 */
export async function buildRevocationPolicyArtifact(input: {
  updatedBy: string;
  note?: string;
}): Promise<{ policyJson: string; policy: SignedRevocationPolicy }> {
  const local = getLocalRevocationPolicy();
  const mode = getRuntimeMode();
  const factoryId = getFactoryId();

  return buildRevocationPolicyArtifactFromRules({
    rules: local.rules,
    updatedBy: input.updatedBy,
    scope: mode === 'FACTORY' ? 'FACTORY' : 'ORG',
    scopeId: mode === 'FACTORY' ? (factoryId ?? undefined) : undefined,
  });
}

/**
 * Build signed revocation policy from raw rules.
 */
export async function buildRevocationPolicyArtifactFromRules(input: {
  rules: RevocationRule[];
  updatedBy: string;
  scope?: 'ORG' | 'FACTORY';
  scopeId?: string;
}): Promise<{ policyJson: string; policy: SignedRevocationPolicy }> {
  const now = new Date().toISOString();

  const unsigned = {
    policyType: 'revocation-policy' as const,
    policyVersion: 'revocation-policy.v1' as const,
    scope: input.scope ?? 'ORG',
    scopeId: input.scopeId,
    rules: input.rules,
    updatedBy: input.updatedBy,
    updatedAtIso: now,
  };

  const payloadJson = JSON.stringify(unsigned, null, 2);
  const keyId = 'default-ecdsa';
  const envelope = await ecdsaSigner.sign(payloadJson, keyId);

  const signed: SignedRevocationPolicy = {
    ...unsigned,
    signature: {
      alg: envelope.alg,
      publicKeyId: envelope.keyId,
      signedAtIso: envelope.signedAtIso,
      sigBase64: envelope.signatureB64,
    },
  };

  const policyJson = JSON.stringify(signed, null, 2);
  return { policyJson, policy: signed };
}

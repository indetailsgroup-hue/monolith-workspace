/**
 * Build Revocation Policy Artifact (v0.7)
 *
 * Creates signed revocation-policy.json content.
 * Signature covers canonical JSON WITHOUT signature field.
 *
 * Factory Safety:
 * - FACTORY device: scope must be FACTORY and scopeId must match factoryId
 * - DESIGNER: default ORG scope (unless you set otherwise in local policy store)
 */

import type {
  SignedRevocationPolicy,
  UnsignedRevocationPolicy,
  RevocationRule,
} from './revocationPolicyTypes';
import { signManifestJson } from '../manifest/signManifest';
import { getRuntimeMode, getFactoryId } from '../../runtime/env';
import { getLocalRevocationPolicy } from './localRevocationPolicyStore';

/**
 * Build signed revocation-policy.json content
 *
 * @param input - Build options
 * @returns Signed policy object and JSON string
 */
export async function buildRevocationPolicyArtifact(input: {
  /** Policy version (default: revpol-0.2.0) */
  policyVersion?: 'revpol-0.2.0';
  /** Who is creating/updating this policy */
  updatedBy: string;
}): Promise<{
  policy: SignedRevocationPolicy;
  policyJson: string;
}> {
  const local = getLocalRevocationPolicy();
  const mode = getRuntimeMode();
  const factoryId = getFactoryId();

  // Enforce scope binding rules for FACTORY devices
  let scope = local.scope;
  let scopeId = local.scopeId;

  if (mode === 'FACTORY') {
    if (!factoryId) {
      throw new Error('FACTORY mode requires factoryId to be set.');
    }
    // Force FACTORY scope and factoryId binding
    scope = 'FACTORY';
    scopeId = factoryId;
  }

  // Build unsigned policy
  const unsigned: UnsignedRevocationPolicy = {
    policyType: 'revocation-policy',
    policyVersion: input.policyVersion ?? 'revpol-0.2.0',
    scope,
    scopeId,
    updatedAtIso: local.updatedAtIso,
    updatedBy: input.updatedBy,
    rules: (local.rules ?? []) as RevocationRule[],
  };

  // Create canonical unsigned JSON (this is what we sign)
  const canonicalUnsignedJson = JSON.stringify(unsigned, null, 2) + '\n';

  // Sign the unsigned policy
  const { keyId, sigBase64 } = await signManifestJson(canonicalUnsignedJson);

  // Build signed policy
  const signed: SignedRevocationPolicy = {
    ...unsigned,
    signature: {
      alg: 'ed25519',
      publicKeyId: keyId,
      sigBase64,
    },
  };

  // Final JSON (includes signature)
  const policyJson = JSON.stringify(signed, null, 2) + '\n';

  return { policy: signed, policyJson };
}

/**
 * Build policy artifact from explicit rules (not from local store)
 *
 * Useful for testing or programmatic policy creation.
 */
export async function buildRevocationPolicyArtifactFromRules(input: {
  scope: 'ORG' | 'FACTORY' | 'PROJECT';
  scopeId?: string;
  rules: RevocationRule[];
  updatedBy: string;
  policyVersion?: 'revpol-0.2.0';
}): Promise<{
  policy: SignedRevocationPolicy;
  policyJson: string;
}> {
  const mode = getRuntimeMode();
  const factoryId = getFactoryId();

  // Enforce scope binding for FACTORY devices
  let scope = input.scope;
  let scopeId = input.scopeId;

  if (mode === 'FACTORY') {
    if (!factoryId) {
      throw new Error('FACTORY mode requires factoryId to be set.');
    }
    scope = 'FACTORY';
    scopeId = factoryId;
  }

  const unsigned: UnsignedRevocationPolicy = {
    policyType: 'revocation-policy',
    policyVersion: input.policyVersion ?? 'revpol-0.2.0',
    scope,
    scopeId,
    updatedAtIso: new Date().toISOString(),
    updatedBy: input.updatedBy,
    rules: input.rules,
  };

  const canonicalUnsignedJson = JSON.stringify(unsigned, null, 2) + '\n';
  const { keyId, sigBase64 } = await signManifestJson(canonicalUnsignedJson);

  const signed: SignedRevocationPolicy = {
    ...unsigned,
    signature: {
      alg: 'ed25519',
      publicKeyId: keyId,
      sigBase64,
    },
  };

  const policyJson = JSON.stringify(signed, null, 2) + '\n';

  return { policy: signed, policyJson };
}

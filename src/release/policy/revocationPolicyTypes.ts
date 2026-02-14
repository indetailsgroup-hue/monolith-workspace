/**
 * Revocation Policy Types (v0.7)
 *
 * Artifact format for signed revocation policy.
 * Policy is immutable once released - becomes part of the bundle.
 *
 * Factory Safety:
 * - Policy is signed with ed25519 (same as manifest)
 * - Scope binding enforced at verification time
 * - Offline-friendly: policy travels with bundle
 */

/**
 * Single revocation rule
 */
export type RevocationRule = {
  /** Key ID being revoked */
  keyId: string;
  /** Effective revocation time (ISO) - manifests created after this fail */
  revokedAtIso: string;
  /** Reason for revocation */
  reason: string;
};

/**
 * Signed revocation policy artifact
 *
 * This is the format for revocation-policy.json in release bundles.
 * Signature covers canonical JSON without signature field.
 */
export type SignedRevocationPolicy = {
  /** Policy type identifier */
  policyType: 'revocation-policy';
  /** Policy version for schema evolution */
  policyVersion: 'revpol-0.2.0';

  /** Scope binding (factory-safe) */
  scope: 'ORG' | 'FACTORY' | 'PROJECT';
  /** Scope ID (required for FACTORY scope) */
  scopeId?: string;

  /** When policy was last updated (ISO) */
  updatedAtIso: string;
  /** Who updated the policy */
  updatedBy: string;

  /** Revocation rules */
  rules: RevocationRule[];

  /** Ed25519 signature over canonical policy JSON (without signature) */
  signature: {
    alg: 'ed25519';
    /** Key ID used to sign the policy */
    publicKeyId: string;
    /** Base64-encoded signature */
    sigBase64: string;
  };
};

/**
 * Unsigned policy (before signing)
 */
export type UnsignedRevocationPolicy = Omit<SignedRevocationPolicy, 'signature'>;

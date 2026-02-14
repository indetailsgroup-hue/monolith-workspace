/**
 * Revocation Policy Types (v0.7)
 *
 * Type definitions for signed revocation policy artifacts.
 * Used for key revocation enforcement in factory verification.
 */

/**
 * Single revocation rule — blocks a specific key after a timestamp.
 */
export interface RevocationRule {
  /** Key ID being revoked */
  keyId: string;
  /** ISO timestamp when key was revoked */
  revokedAtIso: string;
  /** Human-readable reason for revocation */
  reason: string;
  /** Who initiated the revocation */
  by: string;
}

/**
 * Unsigned revocation policy (editable, pre-signing).
 */
export interface UnsignedRevocationPolicy {
  /** Always 'revocation-policy' */
  policyType: 'revocation-policy';
  /** Policy version identifier */
  policyVersion: 'revocation-policy.v1';
  /** Scope: 'ORG' or 'FACTORY' */
  scope: 'ORG' | 'FACTORY';
  /** Scope ID (factory ID or org ID) */
  scopeId?: string;
  /** Revocation rules */
  rules: RevocationRule[];
  /** Who last updated */
  updatedBy: string;
  /** When last updated (ISO) */
  updatedAtIso: string;
}

/**
 * Signed revocation policy artifact.
 * Extends unsigned with cryptographic signature.
 */
export interface SignedRevocationPolicy extends UnsignedRevocationPolicy {
  /** Cryptographic signature */
  signature: {
    /** Signature algorithm */
    alg: string;
    /** Public key identifier of signer */
    publicKeyId: string;
    /** ISO timestamp when signed */
    signedAtIso: string;
    /** Base64-encoded signature */
    sigBase64: string;
  };
}

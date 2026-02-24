/**
 * Key Trust Types
 *
 * Types for Ed25519 key registry with trust policy.
 *
 * Two separate concepts:
 * - KeyStatus: Lifecycle state (ACTIVE/REVOKED/EXPIRED)
 * - KeyTrust: Trust state per machine (TRUSTED/QUARANTINED/REJECTED)
 */

/**
 * Key lifecycle status
 */
export type KeyStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * Key trust state (per-machine)
 *
 * - TRUSTED: Approved for verification on this machine
 * - QUARANTINED: Imported but pending approval
 * - REJECTED: Explicitly rejected (will not verify)
 */
export type KeyTrust = 'TRUSTED' | 'QUARANTINED' | 'REJECTED';

/**
 * Key governance scope
 * - ORG: Organization-wide signing key
 * - FACTORY: Factory-specific signing key
 * - PROJECT: Project-specific signing key
 */
export type KeyScope = 'ORG' | 'FACTORY' | 'PROJECT';

/**
 * Public key record in registry
 *
 * Contains public key material + governance metadata.
 * Private keys are stored separately (HSM/OS keystore in production, localStorage in dev).
 */
export type PublicKeyRecord = {
  /** SHA-256 hash of raw public key bytes */
  keyId: string;
  /** Algorithm identifier */
  alg: 'ed25519';
  /** Export format */
  format: 'raw';
  /** Base64-encoded raw public key (32 bytes) */
  publicKeyBase64: string;

  /** Current lifecycle status */
  status: KeyStatus;

  // Trust workflow (per-machine)
  /** Trust state on this machine */
  trust: KeyTrust;
  /** ISO timestamp when key was trusted */
  trustedAtIso?: string;
  /** User ID who trusted the key */
  trustedBy?: string;
  /** Note about trust decision */
  trustNote?: string;

  // Governance
  /** Scope of key authority */
  scope: KeyScope;
  /** Scope identifier (e.g., factoryId, projectId) */
  scopeId?: string;
  /** ISO timestamp when key was created */
  createdAtIso: string;
  /** User ID who created the key */
  createdBy: string;

  // Lifecycle timestamps
  /** ISO timestamp when key was activated */
  activatedAtIso?: string;
  /** ISO timestamp when key was revoked */
  revokedAtIso?: string;
  /** User ID who revoked the key */
  revokedBy?: string;
  /** Reason for revocation */
  revokedReason?: string;
  /** ISO timestamp when key expires (optional) */
  expiresAtIso?: string;

  /** Human-readable label */
  label?: string;
};

/**
 * Exported public key for sharing between systems
 */
export type ExportedPublicKeyBundle = {
  format: 'raw';
  alg: 'ed25519';
  keyId: string;
  publicKeyBase64: string;
  createdAtIso?: string;
  scope?: KeyScope;
  scopeId?: string;
  label?: string;
};

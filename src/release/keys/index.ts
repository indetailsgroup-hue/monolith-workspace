/**
 * Key Management Module
 *
 * Ed25519 key registry with trust policy for manifest signing.
 *
 * Features:
 * - Persistent key registry (localStorage-backed for dev)
 * - Key lifecycle: ACTIVE → REVOKED/EXPIRED
 * - Key rotation with automatic activation
 * - Trust policy enforcement
 * - Multi-machine verification with public key import
 * - Trust workflow: TRUSTED | QUARANTINED | REJECTED
 * - Scope enforcement: FACTORY mode requires factoryId-bound keys (v0.5)
 * - Admin override with audit logging (v0.6)
 * - Revocation propagation for offline-friendly enforcement (v0.6)
 */

// Types
export type {
  KeyStatus,
  KeyTrust,
  KeyScope,
  PublicKeyRecord,
  ExportedPublicKeyBundle,
} from './types';

// Policy
export type { KeyPolicy } from './policy';
export {
  DEFAULT_KEY_POLICY,
  isExpired,
  isActiveNow,
  isTrusted,
  isQuarantined,
  isRejected,
  canSign,
  canVerify,
  getKeyStatusReason,
  getTrustColor,
} from './policy';

// Import/Export
export type { ExportedPublicKeyJson } from './importExport';
export {
  parseExportedPublicKeyJson,
  createExportedPublicKeyJson,
  getKeyFingerprint,
  isValidEd25519PublicKeyBase64,
} from './importExport';

// Scope Guards (v0.5)
export type { GuardDecision } from './guards';
export {
  guardImportKey,
  guardVerifyKey,
  formatGuardRejection,
} from './guards';

// Persistent Registry
export {
  PersistentKeyRegistry,
  persistentKeyRegistry,
} from './persistentRegistry';

// Key Registry (with backwards compat)
export type {
  KeyRegistryRecord,
  SigningIdentity,
  EnsureSigningIdentityInput,
} from './keyRegistry';
export {
  keyRegistry,
  ensureSigningIdentity,
  rotateSigningKey,
  getSignerCryptoKey,
  getVerifierCryptoKey,
  clearSigningIdentity,
} from './keyRegistry';

// Audit Logging (v0.6)
export type { AuditAction, AuditEvent } from './audit';
export {
  audit,
  listAudit,
  listAuditForKey,
  clearAudit,
  exportAuditLog,
} from './audit';

// Revocation Policy (v0.6)
export type { RevocationRule, RevocationPolicy } from './revocationPolicy';
export {
  getRevocationPolicy,
  setRevocationRule,
  clearRevocationRule,
  getRevocationRule,
  isKeyRevokedForManifest,
  hasRevocationRule,
  listRevocationRules,
  clearAllRevocationRules,
} from './revocationPolicy';

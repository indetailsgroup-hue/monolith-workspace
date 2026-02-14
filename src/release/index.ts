/**
 * MONOLITH Release Module
 *
 * Factory release package generation with signed manifests.
 */

// Manifest
export type {
  ManifestFile,
  SignedManifest,
  ArtifactContent,
  ArtifactInput,
  BuildManifestInput,
  BuildSignedManifestWithArtifactsInput,
  BuildReleasePackageManifestInput,
} from './manifest';

export {
  buildSignedManifest,
  buildSignedManifestWithArtifacts,
  buildReleasePackageManifest,
  createArtifact,
  ARTIFACT_TYPES,
  verifyArtifactHash,
  verifyManifestArtifacts,
  signManifestJson,
  verifyManifestJsonSignature,
} from './manifest';

// Keys - Types
export type {
  KeyStatus,
  KeyTrust,
  KeyScope,
  PublicKeyRecord,
  ExportedPublicKeyBundle,
  ExportedPublicKeyJson,
  KeyPolicy,
  KeyRegistryRecord,
  SigningIdentity,
  EnsureSigningIdentityInput,
  GuardDecision,
  AuditAction,
  AuditEvent,
  RevocationRule,
  RevocationPolicy,
} from './keys';

// Keys - Policy
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
} from './keys';

// Keys - Import/Export
export {
  parseExportedPublicKeyJson,
  createExportedPublicKeyJson,
  getKeyFingerprint,
  isValidEd25519PublicKeyBase64,
} from './keys';

// Keys - Scope Guards (v0.5)
export {
  guardImportKey,
  guardVerifyKey,
  formatGuardRejection,
} from './keys';

// Keys - Registry
export {
  persistentKeyRegistry,
  PersistentKeyRegistry,
  keyRegistry,
  ensureSigningIdentity,
  rotateSigningKey,
  getSignerCryptoKey,
  getVerifierCryptoKey,
  clearSigningIdentity,
} from './keys';

// Keys - Audit (v0.6)
export {
  audit,
  listAudit,
  listAuditForKey,
  clearAudit,
  exportAuditLog,
} from './keys';

// Keys - Revocation Policy (v0.6)
export {
  getRevocationPolicy,
  setRevocationRule,
  clearRevocationRule,
  getRevocationRule,
  isKeyRevokedForManifest,
  hasRevocationRule,
  listRevocationRules,
  clearAllRevocationRules,
} from './keys';

// Signed Revocation Policy Artifact (v0.7)
export type {
  RevocationRule as PolicyRevocationRule,
  SignedRevocationPolicy,
  UnsignedRevocationPolicy,
  LocalRevocationPolicy,
  PolicyVerificationResult,
  RevocationCheckResult,
} from './policy';

export {
  // Local Policy Store
  getLocalRevocationPolicy,
  setLocalPolicyScope,
  upsertLocalRevocationRule,
  removeLocalRevocationRule,
  clearLocalRevocationRules,
  clearLocalRevocationPolicyStore,
  // Build Policy Artifact
  buildRevocationPolicyArtifact,
  buildRevocationPolicyArtifactFromRules,
  // Verify Policy Artifact
  verifyRevocationPolicyArtifact,
  parseRevocationPolicyJson,
  // Apply Policy Rules
  isKeyRevokedByPolicy,
  getRevokedKeyIds,
  getRevocationRuleFromPolicy,
  hasRevocationRules,
  validatePolicyConsistency,
} from './policy';

/**
 * Revocation Policy Module (v0.10)
 *
 * Signed revocation policy as release artifact.
 * Enables offline-friendly factory verification.
 *
 * Features:
 * - Immutable policy artifact (signed with ed25519)
 * - Scope binding (FACTORY device requires FACTORY-scoped policy)
 * - Time-based revocation (blocks manifests created after revocation)
 * - Local policy store for admin editing
 * - Installed policy store for imported policies (v0.9)
 * - Policy precedence: Bundle > Installed > None (v0.9)
 * - Auto requirePolicy in FACTORY mode (v0.10)
 */

// Types
export type {
  RevocationRule,
  SignedRevocationPolicy,
  UnsignedRevocationPolicy,
} from './revocationPolicyTypes';

// Local Policy Store
export type { LocalRevocationPolicy } from './localRevocationPolicyStore';
export {
  getLocalRevocationPolicy,
  setLocalPolicyScope,
  upsertLocalRevocationRule,
  removeLocalRevocationRule,
  clearLocalRevocationRules,
  clearLocalRevocationPolicyStore,
} from './localRevocationPolicyStore';

// Build Policy Artifact
export {
  buildRevocationPolicyArtifact,
  buildRevocationPolicyArtifactFromRules,
} from './buildRevocationPolicyArtifact';

// Verify Policy Artifact
export type { PolicyVerificationResult } from './verifyRevocationPolicyArtifact';
export {
  verifyRevocationPolicyArtifact,
  parseRevocationPolicyJson,
} from './verifyRevocationPolicyArtifact';

// Apply Policy Rules
export type { RevocationCheckResult } from './applyRevocationPolicy';
export {
  isKeyRevokedByPolicy,
  getRevokedKeyIds,
  getRevocationRuleFromPolicy,
  hasRevocationRules,
  validatePolicyConsistency,
} from './applyRevocationPolicy';

// Installed Policy Store (v0.9)
export type { InstalledPolicyMeta } from './installedPolicyStore';
export {
  getInstalledPolicyJson,
  getInstalledPolicyMeta,
  hasInstalledPolicy,
  installPolicyJson,
  clearInstalledPolicy,
  getInstalledPolicyInfo,
} from './installedPolicyStore';

// Policy Precedence (v0.9)
export type { PolicySource, PolicyPrecedenceResult, BundleItem, BundleLike } from './policyPrecedence';
export {
  resolvePolicyJsonByPrecedence,
  hasPolicyAvailable,
  describePolicySource,
} from './policyPrecedence';

// Verify Policy Mode (v0.10)
export {
  shouldRequirePolicy,
  describePolicyRequirement,
  isFactoryMode,
} from './verifyPolicyMode';

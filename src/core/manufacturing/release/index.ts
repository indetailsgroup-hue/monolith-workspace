/**
 * Release Module - FROZEN → RELEASED Workflow
 *
 * Step 6-8 of Plasticity-Style Modeling Layer:
 * - Approval signatures (explicit, auditable)
 * - Release bundle creation
 * - Manifest with file hashes
 * - v2: Real crypto (SHA-256, ECDSA P-256)
 *
 * v1.1: Added v2 bundle builder (Step 8)
 */

// Types
export type {
  ApprovalRole,
  ApprovalSignature,
  ApprovalRequirement,
  ReleaseFile,
  ReleaseBundle,
  ReleaseBundleMeta,
} from './types';
export { DEFAULT_APPROVAL_REQUIREMENT, getBundleMeta } from './types';

// Signer (v1 mock)
export {
  fnv1aHash,
  signPayloadMock,
  createApprovalSignature,
  verifyApprovalSignature,
  signManifest,
} from './signer';

// Bundle Builder (v1 mock)
export {
  buildReleaseBundle,
  extractManifest,
  verifyBundleIntegrity,
  exportBundleAsJson,
  downloadBundle,
  downloadBundleFile,
} from './buildBundle';

// Bundle Builder V2 (real crypto - Step 8)
export { buildReleaseBundleV2, verifyBundleIntegrityV2 } from './buildBundleV2';

// Store
export {
  useReleaseStore,
  useApprovals,
  useLastBundle,
  useApprovalModalOpen,
  useCanRelease,
} from './releaseStore';

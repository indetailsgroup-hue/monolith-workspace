/**
 * Release Module - FROZEN → RELEASED Workflow
 *
 * Step 6 of Plasticity-Style Modeling Layer:
 * - Approval signatures (explicit, auditable)
 * - Release bundle creation
 * - Manifest with file hashes
 *
 * v1.0: Initial release module
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

// Signer
export {
  fnv1aHash,
  signPayloadMock,
  createApprovalSignature,
  verifyApprovalSignature,
  signManifest,
} from './signer';

// Bundle Builder
export {
  buildReleaseBundle,
  extractManifest,
  verifyBundleIntegrity,
  exportBundleAsJson,
  downloadBundle,
  downloadBundleFile,
} from './buildBundle';

// Store
export {
  useReleaseStore,
  useApprovals,
  useLastBundle,
  useApprovalModalOpen,
  useCanRelease,
} from './releaseStore';

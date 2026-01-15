/**
 * Manufacturing Module - Factory Operations & Gate System
 *
 * Step 5-6 of Plasticity-Style Modeling Layer:
 * - OperationGraph: Machine-readable operations from DesignIntent
 * - Gate: Pre-freeze validation combining Preflight + OpGraph
 * - Snapshot: Immutable frozen state with hash verification
 * - Release: FROZEN → RELEASED workflow with approval signatures
 *
 * v1.1: Added release module (Step 6)
 */

// ============================================================================
// OperationGraph
// ============================================================================

export type {
  OpId,
  OpKind,
  TargetKind,
  OpTarget,
  OpNode,
  OperationGraph,
  OpSummary,
} from './opgraph';
export {
  getOpSummary,
  buildOpGraphFromIntents,
  buildOpGraphForCabinet,
  resetOpCounter,
} from './opgraph';

// ============================================================================
// Gate
// ============================================================================

export type {
  GateStatus,
  GateReport,
  CabinetGateReport,
  GateBlocker,
} from './gate';
export {
  getBlockers,
  runGate,
  runCabinetGate,
  canFreeze,
  getGateSummary,
} from './gate';

// ============================================================================
// Snapshot
// ============================================================================

export type {
  FrozenSnapshot,
  CabinetFrozenSnapshot,
} from './gate';
export {
  createFrozenSnapshot,
  createCabinetFrozenSnapshot,
  verifySnapshot,
  exportSnapshot,
  importSnapshot,
} from './gate';

// ============================================================================
// Release (Step 6)
// ============================================================================

export type {
  ApprovalRole,
  ApprovalSignature,
  ApprovalRequirement,
  ReleaseFile,
  ReleaseBundle,
  ReleaseBundleMeta,
} from './release';
export {
  DEFAULT_APPROVAL_REQUIREMENT,
  getBundleMeta,
  fnv1aHash,
  signPayloadMock,
  createApprovalSignature,
  verifyApprovalSignature,
  signManifest,
  buildReleaseBundle,
  extractManifest,
  verifyBundleIntegrity,
  exportBundleAsJson,
  downloadBundle,
  downloadBundleFile,
  useReleaseStore,
  useApprovals,
  useLastBundle,
  useApprovalModalOpen,
  useCanRelease,
} from './release';

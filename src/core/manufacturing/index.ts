/**
 * Manufacturing Module - Factory Operations & Gate System
 *
 * Step 5 of Plasticity-Style Modeling Layer:
 * - OperationGraph: Machine-readable operations from DesignIntent
 * - Gate: Pre-freeze validation combining Preflight + OpGraph
 * - Snapshot: Immutable frozen state with hash verification
 *
 * v1.0: Initial manufacturing module
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

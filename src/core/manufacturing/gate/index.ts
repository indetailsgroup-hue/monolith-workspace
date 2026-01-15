/**
 * Gate Module - Pre-Freeze Validation
 *
 * Exports types, runner, and snapshot utilities for
 * the gate validation system.
 */

// Types
export type {
  GateStatus,
  GateReport,
  CabinetGateReport,
  GateBlocker,
} from './types';
export { getBlockers } from './types';

// Runner
export {
  runGate,
  runCabinetGate,
  canFreeze,
  getGateSummary,
} from './runGate';

// Snapshot
export type {
  FrozenSnapshot,
  CabinetFrozenSnapshot,
} from './snapshot';
export {
  createFrozenSnapshot,
  createCabinetFrozenSnapshot,
  verifySnapshot,
  exportSnapshot,
  importSnapshot,
} from './snapshot';

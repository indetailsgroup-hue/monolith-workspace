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
  // v1.1: Minifix integration
  runFullCabinetGate,
  canExport,
  getFullGateSummary,
  type CabinetGateReportWithMinifix,
} from './runGate';

// Minifix Gate (SPEC-MINIFIX-JOINT-LOGIC v1.0)
export {
  runMinifixGate,
  canExportWithMinifix,
  getMinifixGateSummary,
  minifixErrorsToBlockers,
  preflightMinifixOps,
  type MinifixGateResult,
  type MinifixGateError,
  type MinifixGateErrorCode,
} from './minifixGate';

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

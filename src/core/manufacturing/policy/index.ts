// src/core/manufacturing/policy/index.ts
/**
 * Manufacturing Policy Module.
 *
 * Material-driven policies for CNC toolpath generation.
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

// Entry/Exit Policy Types
export {
  type EntryMode,
  type ExitMode,
  type EntryExitTuning,
  type MaterialSpec,
  type GeometrySpec,
  type MachineSpec,
  type ToolClass,
  type OpKind,
  type PassKind,
  type EntryExitContext,
  type EntryConfig,
  type ExitConfig,
  type EntryExitDecision,
  type EntryExitPolicy,
  type EntryExitIssueCode,
  type EntryExitIssue,
  DEFAULT_ENTRY_EXIT_TUNING,
  hasLaminateSurface,
  determineKerfRisk,
  createMaterialSpec,
} from "./entryExitPolicy.v1";

// Entry/Exit Policy Implementations
export {
  DefaultEntryExitPolicy,
  ConservativeEntryExitPolicy,
  defaultEntryExitPolicy,
  conservativeEntryExitPolicy,
  validateEntryExitDecision,
} from "./entryExitPolicy.default";

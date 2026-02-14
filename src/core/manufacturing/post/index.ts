// src/core/manufacturing/post/index.ts
/**
 * Post-Processor Module.
 *
 * Machine profiles, feed resolution, and IR building.
 *
 * v0.10.7.2 - Post-Processor Profiles
 */

// Profile submodule
export {
  // Types
  type MachineId,
  type MaterialTag,
  type ToolClass,
  type MillMode,
  type EntryMode as ProfileEntryMode,
  type MaterialEntryTuning,
  type MachineKinematics,
  type MachinePolicies,
  type MaterialProfile,
  type ToolProfile,
  type ToolFeeds,
  type ToolRpm,
  type WorkOffset,
  type HeaderFooterContext,
  type MachineProfile,

  // Constants
  DEFAULT_MATERIAL_ENTRY,
  DEFAULT_KINEMATICS,
  DEFAULT_POLICIES,

  // Utilities
  findTool,
  requireTool,
  findMaterialByTag,
  matchMaterial,
  isLaminate,
  getToolNumber,
  validateMachineProfile,

  // Profiles
  KdtMvpProfile,
  createKdtMvpProfile,
  BiesseProfile,
  createBiesseProfile,
  HomagProfile,
  createHomagProfile,
} from "./profile";

// Feeds submodule
export {
  // Types
  type Stage,
  type ResolvedFeeds,
  type FeedResolutionContext,
  type EntryMode,
  type ExitMode,
  type EntryTuning,
  type ResolvedEntryExit,
  type EntryExitContext,

  // Constants
  DEFAULT_ENTRY_TUNING,

  // Functions
  resolveTool,
  resolveFeeds,
  resolveFeedsWithContext,
  resolvePlungeFeed,
  resolveRpm,
  getToolFeedParams,
  validateFeedRate,
  validateRpm,
  resolveEntryExit,
  getLaminateEntryMode,
  requiresSpecialEntry,
  calculateRampLength,
  calculateRampStartOffset,
  calculateArcLeadInCenter,
} from "./feeds";

// IR submodule
export {
  // Types
  type CompiledSegment,
  type CompiledPath,
  type CompiledNode,
  type BuildIrRequest,
  type SafetyIssueCode,
  type SafetyIssue,
  type SafetyVerificationResult,
  type SafetyContext,

  // Functions
  buildIrProgram,
  createEmptyCompiledNode,
  createLinearEntryMoves,
  createRampEntryMoves,
  createLeadOutMoves,
  estimateIrProgramTime,
  verifyIrSafety,
  quickVerifyIrSafety,
  createSafetyContext,
  formatSafetyIssues,
  generateSafetyAuditReport,
} from "./ir";

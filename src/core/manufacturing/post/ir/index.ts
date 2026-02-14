// src/core/manufacturing/post/ir/index.ts
/**
 * IR Module.
 *
 * IR program building, safety verification, and trace mapping.
 *
 * v0.10.8.1 - Toolpath Verifier
 */

// IR builder
export {
  // Types
  type CompiledSegment,
  type CompiledPath,
  type CompiledNode,
  type BuildIrRequest,

  // Functions
  buildIrProgram,
  createEmptyCompiledNode,
  createLinearEntryMoves,
  createRampEntryMoves,
  createLeadOutMoves,
  estimateIrProgramTime,
} from "./buildIrProgram";

// IR safety
export {
  // Types
  type SafetyIssueCode,
  type SafetyIssue,
  type SafetyVerificationResult,
  type SafetyContext,

  // Functions
  verifyIrSafety,
  quickVerifyIrSafety,
  createSafetyContext,
  formatSafetyIssues,
  generateSafetyAuditReport,
} from "./irSafety";

// Trace map
export {
  // Types
  type TraceKind,
  type TraceStage,
  type IRTrace,
  type TraceMap,

  // Builder
  TraceMapBuilder,

  // Helpers
  createEmptyTraceMap,
  validateTraceMap,
  getTracesForOp,
  getTracesForStage,
  getCutTracesWithS,
  getTraceAtIndex,
} from "./traceMap.v1";

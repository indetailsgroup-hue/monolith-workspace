// src/core/manufacturing/gcode/index.ts
/**
 * G-code Manufacturing Module.
 *
 * Complete G-code generation pipeline:
 * - Canonical IR (machine-agnostic representation)
 * - Dialects (vendor-specific formatting)
 * - Deterministic formatting
 * - Line numbering
 * - File emission with fingerprinting
 *
 * Usage:
 * ```typescript
 * import {
 *   IRProgram,
 *   irRapid,
 *   irLinear,
 *   irToolChange,
 *   KdtIsoDialect,
 *   emitNc,
 * } from './gcode';
 *
 * // Build IR program
 * const prog: IRProgram = {
 *   version: "1.0",
 *   jobId: "job123",
 *   sheetId: "sheet1",
 *   moves: [
 *     irToolChange(1, "flat6", 6),
 *     { kind: "SPINDLE_ON", rpm: 18000, cw: true },
 *     irRapid(0, 0, 10),
 *     irLinear(100, 100, undefined, 3000),
 *   ],
 *   audit: { planFp: "...", irFp: "...", generatedAt: "...", builderVersion: "..." },
 * };
 *
 * // Emit to dialect
 * const result = emitNc(prog, KdtIsoDialect);
 * console.log(result.text);
 * console.log("Fingerprint:", result.fileFp);
 * ```
 *
 * Supported dialects:
 * - KDT_ISO: KDT CNC (baseline)
 * - BIESSE_ISO: Biesse CNC
 * - HOMAG_ISO: Homag CNC
 *
 * v0.10.7.1 - G-code Dialects
 */

// =============================================================================
// IR (Intermediate Representation)
// =============================================================================

export type {
  IRUnit,
  IRPlane,
  IRSetUnits,
  IRSetAbs,
  IRSetPlane,
  IRSpindleOn,
  IRSpindleOff,
  IRToolChange,
  IRSetFeed,
  IRRapid,
  IRLinear,
  IRArcCW,
  IRArcCCW,
  IRDwell,
  IRComment,
  IRProgramEnd,
  IRCoolantOn,
  IRCoolantOff,
  IRMove,
  IRProgramAudit,
  IRProgramMeta,
  IRProgram,
} from "./ir";

export {
  irComment,
  irRapid,
  irLinear,
  irArcCW,
  irArcCCW,
  irToolChange,
  irSpindleOn,
  irSpindleOff,
  irSetFeed,
  irDwell,
  irProgramEnd,
  irStandardHeader,
  countMovesByKind,
  extractToolChanges,
  getToolSequence,
} from "./ir";

// =============================================================================
// DIALECTS
// =============================================================================

export type {
  DialectId,
  ArcMode,
  CommentStyle,
  DialectCaps,
  Dialect,
  DialectIssueCode,
  DialectIssue,
} from "./dialects";

export {
  DEFAULT_DIALECT_CAPS,
  validateDialectCapability,
  getDialectFileExtension,
  dialectSupports,
  // KDT
  KDT_ISO_CAPS,
  KdtIsoDialect,
  createKdtIsoDialect,
  // Biesse
  BIESSE_ISO_CAPS,
  BiesseIsoDialect,
  createBiesseIsoDialect,
  // Homag
  HOMAG_ISO_CAPS,
  HomagIsoDialect,
  createHomagIsoDialect,
  // Registry
  DIALECTS,
  getDialect,
  listDialectIds,
} from "./dialects";

// =============================================================================
// FORMATTING
// =============================================================================

export type {
  NumFormatOptions,
} from "./format";

export {
  DEFAULT_NUM_FORMAT,
  fmt,
  fmtNum,
  fmtCoord,
  fmtFeed,
  fmtSpindle,
  fmtTool,
  fmtArc,
  fmtDwell,
  fmtLineNumber,
  fmtAxis,
  fmtXYZ,
  fmtIJ,
  isWithinLimits,
  clampToLimits,
} from "./format";

// =============================================================================
// EMIT
// =============================================================================

export type {
  LineNumberOptions,
  EmitResult,
  EmitOptions,
} from "./emit";

export {
  DEFAULT_LINE_NUMBER_OPTIONS,
  addLineNumbers,
  addLineNumbersWithOptions,
  stripLineNumbers,
  renumberLines,
  extractLineNumbers,
  hasConsistentLineNumbers,
  DEFAULT_EMIT_OPTIONS,
  emitNc,
  emitNcAsync,
  generateNcFilename,
  splitIntoChunks,
  estimateFileSize,
  generateEmitAuditReport,
} from "./emit";

// src/core/manufacturing/gcode/ir/gcodeIr.v1.ts
/**
 * Canonical G-code Intermediate Representation.
 *
 * Machine-agnostic representation of toolpath moves.
 * Dialects convert this IR to machine-specific G-code files.
 *
 * Design principles:
 * - IR is purely semantic (move intentions, not syntax)
 * - All coordinates are in mm, absolute mode
 * - Arc centers are I/J relative to start point
 * - Dialects handle line numbers, comments, formatting
 *
 * Key concepts:
 * - IRMove: Single move/command instruction
 * - IRProgram: Complete program with moves and audit trail
 *
 * v0.10.7.1 - G-code Dialects
 */

// =============================================================================
// UNIT & PLANE
// =============================================================================

/**
 * IR unit system (always mm for wood routing).
 */
export type IRUnit = "MM";

/**
 * IR working plane (always XY for wood routing).
 */
export type IRPlane = "XY";

// =============================================================================
// MOVE TYPES
// =============================================================================

/**
 * Set units (G20/G21).
 */
export interface IRSetUnits {
  kind: "SET_UNITS";
  unit: IRUnit;
}

/**
 * Set absolute mode (G90).
 */
export interface IRSetAbs {
  kind: "SET_ABS";
  abs: true;
}

/**
 * Set working plane (G17/G18/G19).
 */
export interface IRSetPlane {
  kind: "SET_PLANE";
  plane: IRPlane;
}

/**
 * Spindle on (M3/M4).
 */
export interface IRSpindleOn {
  kind: "SPINDLE_ON";
  rpm: number;
  cw: boolean;
}

/**
 * Spindle off (M5).
 */
export interface IRSpindleOff {
  kind: "SPINDLE_OFF";
}

/**
 * Tool change (M6).
 */
export interface IRToolChange {
  kind: "TOOL_CHANGE";
  toolNumber: number;
  toolId: string;
  toolDiameterMm?: number;
}

/**
 * Set feed rate (F).
 */
export interface IRSetFeed {
  kind: "SET_FEED";
  feed: number;
}

/**
 * Rapid move (G0).
 */
export interface IRRapid {
  kind: "RAPID";
  x?: number;
  y?: number;
  z?: number;
}

/**
 * Linear interpolation (G1).
 */
export interface IRLinear {
  kind: "LINEAR";
  x?: number;
  y?: number;
  z?: number;
  feed?: number;
}

/**
 * Clockwise arc (G2).
 *
 * I/J are relative offsets from start to center.
 */
export interface IRArcCW {
  kind: "ARC_CW";
  x: number;
  y: number;
  i: number;
  j: number;
  feed?: number;
}

/**
 * Counter-clockwise arc (G3).
 *
 * I/J are relative offsets from start to center.
 */
export interface IRArcCCW {
  kind: "ARC_CCW";
  x: number;
  y: number;
  i: number;
  j: number;
  feed?: number;
}

/**
 * Dwell (G4).
 */
export interface IRDwell {
  kind: "DWELL";
  ms: number;
}

/**
 * Comment.
 */
export interface IRComment {
  kind: "COMMENT";
  text: string;
}

/**
 * Program end (M30).
 */
export interface IRProgramEnd {
  kind: "PROGRAM_END";
}

/**
 * Coolant on (M8).
 */
export interface IRCoolantOn {
  kind: "COOLANT_ON";
  type?: "FLOOD" | "MIST";
}

/**
 * Coolant off (M9).
 */
export interface IRCoolantOff {
  kind: "COOLANT_OFF";
}

/**
 * All IR move types.
 */
export type IRMove =
  | IRSetUnits
  | IRSetAbs
  | IRSetPlane
  | IRSpindleOn
  | IRSpindleOff
  | IRToolChange
  | IRSetFeed
  | IRRapid
  | IRLinear
  | IRArcCW
  | IRArcCCW
  | IRDwell
  | IRComment
  | IRProgramEnd
  | IRCoolantOn
  | IRCoolantOff;

// =============================================================================
// PROGRAM
// =============================================================================

/**
 * IR program audit trail.
 */
export interface IRProgramAudit {
  /** SHA-256 of tool-change plan + toolpath meta */
  planFp: string;

  /** SHA-256 of canonical moves (stable stringify) */
  irFp: string;

  /** Generation timestamp */
  generatedAt: string;

  /** IR builder version */
  builderVersion: string;
}

/**
 * IR program metadata.
 */
export interface IRProgramMeta {
  /** Total move count */
  moveCount: number;

  /** Tool change count */
  toolChangeCount: number;

  /** Total estimated time (seconds) */
  estimatedTimeSec?: number;

  /** Total rapid distance (mm) */
  rapidDistanceMm?: number;

  /** Total cut distance (mm) */
  cutDistanceMm?: number;
}

/**
 * Complete IR program.
 *
 * Represents a full G-code program in canonical form.
 */
export interface IRProgram {
  /** IR version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet/nest ID */
  sheetId: string;

  /** Ordered moves */
  moves: IRMove[];

  /** Audit trail */
  audit: IRProgramAudit;

  /** Program metadata */
  meta?: IRProgramMeta;
}

// =============================================================================
// IR BUILDER HELPERS
// =============================================================================

/**
 * Create a comment move.
 */
export function irComment(text: string): IRComment {
  return { kind: "COMMENT", text };
}

/**
 * Create a rapid move.
 */
export function irRapid(x?: number, y?: number, z?: number): IRRapid {
  return { kind: "RAPID", x, y, z };
}

/**
 * Create a linear move.
 */
export function irLinear(x?: number, y?: number, z?: number, feed?: number): IRLinear {
  return { kind: "LINEAR", x, y, z, feed };
}

/**
 * Create a CW arc move.
 */
export function irArcCW(x: number, y: number, i: number, j: number, feed?: number): IRArcCW {
  return { kind: "ARC_CW", x, y, i, j, feed };
}

/**
 * Create a CCW arc move.
 */
export function irArcCCW(x: number, y: number, i: number, j: number, feed?: number): IRArcCCW {
  return { kind: "ARC_CCW", x, y, i, j, feed };
}

/**
 * Create a tool change move.
 */
export function irToolChange(toolNumber: number, toolId: string, toolDiameterMm?: number): IRToolChange {
  return { kind: "TOOL_CHANGE", toolNumber, toolId, toolDiameterMm };
}

/**
 * Create spindle on move.
 */
export function irSpindleOn(rpm: number, cw: boolean = true): IRSpindleOn {
  return { kind: "SPINDLE_ON", rpm, cw };
}

/**
 * Create spindle off move.
 */
export function irSpindleOff(): IRSpindleOff {
  return { kind: "SPINDLE_OFF" };
}

/**
 * Create set feed move.
 */
export function irSetFeed(feed: number): IRSetFeed {
  return { kind: "SET_FEED", feed };
}

/**
 * Create dwell move.
 */
export function irDwell(ms: number): IRDwell {
  return { kind: "DWELL", ms };
}

/**
 * Create program end move.
 */
export function irProgramEnd(): IRProgramEnd {
  return { kind: "PROGRAM_END" };
}

/**
 * Create standard program header moves.
 */
export function irStandardHeader(): IRMove[] {
  return [
    { kind: "SET_UNITS", unit: "MM" },
    { kind: "SET_ABS", abs: true },
    { kind: "SET_PLANE", plane: "XY" },
  ];
}

// =============================================================================
// ANALYSIS HELPERS
// =============================================================================

/**
 * Count moves by kind.
 */
export function countMovesByKind(moves: IRMove[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of moves) {
    counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Extract tool changes from program.
 */
export function extractToolChanges(program: IRProgram): IRToolChange[] {
  return program.moves.filter((m): m is IRToolChange => m.kind === "TOOL_CHANGE");
}

/**
 * Get tool sequence from program.
 */
export function getToolSequence(program: IRProgram): string[] {
  return extractToolChanges(program).map((tc) => tc.toolId);
}

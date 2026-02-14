// src/core/manufacturing/gcode/format/index.ts
/**
 * G-code Formatting Module.
 *
 * Deterministic number formatting for G-code output.
 */

export type {
  NumFormatOptions,
} from "./num";

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
} from "./num";

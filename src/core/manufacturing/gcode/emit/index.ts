// src/core/manufacturing/gcode/emit/index.ts
/**
 * G-code Emit Module.
 *
 * Emits G-code from IR programs using dialects.
 */

// Line numbering
export type {
  LineNumberOptions,
} from "./addLineNumbers";

export {
  DEFAULT_LINE_NUMBER_OPTIONS,
  addLineNumbers,
  addLineNumbersWithOptions,
  stripLineNumbers,
  renumberLines,
  extractLineNumbers,
  hasConsistentLineNumbers,
} from "./addLineNumbers";

// Program emitter
export type {
  EmitResult,
  EmitOptions,
} from "./emitProgram";

export {
  DEFAULT_EMIT_OPTIONS,
  emitNc,
  emitNcAsync,
  generateNcFilename,
  splitIntoChunks,
  estimateFileSize,
  generateEmitAuditReport,
} from "./emitProgram";

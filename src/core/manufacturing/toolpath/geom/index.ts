// src/core/manufacturing/toolpath/geom/index.ts
/**
 * Toolpath Geometry Utilities.
 *
 * Geometric calculations for toolpath generation:
 * - Tangent extraction from segments
 * - Entry/exit move generation
 *
 * v0.10.6.6 - Entry/Exit Strategy per Material
 */

// Tangent Utilities
export {
  type Vec2,
  type Point2,
  vecLen,
  vecNormalize,
  vecScale,
  vecAdd,
  vecSub,
  vecNeg,
  normalLeft,
  normalRight,
  vecDot,
  lineTangentAtStart,
  lineTangentAtEnd,
  arcTangentAtStart,
  arcTangentAtEnd,
  segmentTangentAtStart,
  segmentTangentAtEnd,
  pathTangentAtStart,
  pathTangentAtEnd,
  calculateLeadInPoint,
  calculateLeadOutPoint,
  calculateArcLeadIn,
  extractSpanTangents,
} from "./tangentUtils";

// Entry/Exit Emitter
export {
  type EntryMoveContext,
  type ExitMoveContext,
  type EntryOps,
  type ExitOps,
  emitEntry,
  emitExit,
  emitEntryExit,
} from "./entryExitEmitter";

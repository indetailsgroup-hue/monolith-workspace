// src/core/cutDirection/index.ts
/**
 * Cut Direction Policy Engine.
 *
 * Material-driven climb/conventional milling direction engine
 * for CNC toolpath generation.
 *
 * Features:
 * - Material-aware direction decisions (laminate protection)
 * - Tool class overrides (compression bits)
 * - Automatic path winding adjustment
 * - Audit trail for traceability
 *
 * Usage:
 * ```ts
 * import {
 *   processOutsideProfiles,
 *   defaultCutDirectionPolicy,
 * } from '@/core/cutDirection';
 *
 * const paths = processOutsideProfiles(
 *   toolpaths,
 *   'MELAMINE',
 *   'COMPRESSION'
 * );
 * ```
 *
 * v0.10.6.4 - Climb / Conventional Policy Engine
 * v0.10.6.5 - Direction-aware Tabs (interval remapping)
 */

// Types
export type {
  MaterialTag,
  ToolClass,
  OpKind,
  CutSide,
  PassKind,
  MillMode,
  CutContext,
  DirectionDecision,
  CutDirectionPolicy,
  PathSegment,
  LineSegment,
  ArcSegment,
  ToolPath,
} from "./cutDirectionTypes";

// Constants
export {
  LAMINATE_MATERIALS,
  RAW_MATERIALS,
  DIRECTION_NEUTRAL_TOOLS,
} from "./cutDirectionTypes";

// Policy implementations
export {
  DefaultCutDirectionPolicy,
  ConservativeCutDirectionPolicy,
  defaultCutDirectionPolicy,
  conservativeCutDirectionPolicy,
} from "./cutDirectionPolicy";

// Path reversal utilities
export {
  reverseLineSegment,
  reverseArcSegment,
  reverseSegment,
  reversePath,
  reverseSegmentsInPlace,
  calculateSignedArea,
  detectWinding,
  ensureWinding,
  ensureWindingInPlace,
  reversePaths,
  ensureWindingAll,
  // v0.10.6.5 - Direction-aware Tabs interval remapping
  remapIntervalForReverse,
  remapTabsForReversedPath,
  applyDirectionWithTabs,
  calculatePathLength,
} from "./pathReverse";

// Interval remapping types (v0.10.6.5)
export type {
  RemappableInterval,
  RemappableTabsOnPath,
} from "./pathReverse";

// Integration helpers
export type {
  ProcessedToolPath,
  ToolPathInput,
  ProcessingOptions,
  ProcessingResult,
  ProcessingSummary,
} from "./applyDirectionPolicy";

export {
  applyDirectionToPath,
  processToolPaths,
  processOutsideProfiles,
  processInsideProfiles,
  processCenterline,
  generateAuditReport,
  validateProcessingResult,
} from "./applyDirectionPolicy";

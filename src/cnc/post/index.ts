/**
 * post/index.ts - G-code Post Processing Module Exports
 *
 * @version 1.3.0 - Phase D5-C.1B: Added feed-down near exit
 */

// Types
export type {
  PostProcessOptions,
  PostProcessResult,
  PostProcessStats,
  PostProcessor,
  GcodeDialect,
  GcodeFile,
  GcodeBundle,
  BuildBundleResult,
  ToolMap,
  ToolMapEntry,
  CncPolicyOptions,
  PanelFrameInfo,
  ThroughHoleSensitiveMaterial,
  ThroughHoleTuning,
} from './types';

// Policy decision helper
export {
  decideDrillParams,
  isHoleOperation,
  getDefaultDwellTime,
  getDefaultPeckDepth,
  shouldApplyThroughHoleDwell,
  DEFAULT_THROUGH_HOLE_TUNING,
  DEFAULT_FALLBACK_THICKNESS_MM,
  DEFAULT_EXIT_FEED_REDUCTION, // D5-C.1B
} from './decideDrillParams';
export type { DecideDrillParamsInput, DecideDrillParamsResult, ThroughHoleDecision } from './decideDrillParams';

// Post processor selection
export {
  getPostProcessor,
  getPostProcessorByDialect,
  getSupportedDialects,
  isDialectSupported,
  registerPostProcessor,
  registerMachineDialect,
} from './postProcessor';

// Dialect implementations
export { fanucPostProcessor } from './dialects/fanuc';
export { biesseIsoPostProcessor } from './dialects/biesseIso';

// Operation normalization
export {
  normalizeOperations,
  groupOperationsByTool,
  getToolOrder,
  countToolChanges,
  calculateTravelDistance,
} from './normalizeOperations';
export type { NormalizeOptions } from './normalizeOperations';

// G-code emit utilities
export {
  GcodeBuilder,
  formatCoord,
  calculateMoveTime,
  distance3D,
} from './emit/gcodeBuilder';
export type { GcodeBuilderOptions } from './emit/gcodeBuilder';

export {
  formatNumber,
  formatRelative,
  formatFeedRate,
  formatRpm,
  formatTool,
  sanitizeComment,
  formatProgramName,
  formatTimestamp,
  buildMoveCommand,
  buildDrillCycle,
  buildPeckCycle,
  buildBoreCycle,
} from './emit/format';

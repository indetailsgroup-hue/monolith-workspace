/**
 * T027: Cut Optimization Algorithm — Public API
 *
 * @version 2.0.0 - Phase 2: Grain direction constraints
 */

// Types
export type {
  GrainDirection,
  NestingPart,
  NestingConfig,
  NestingResult,
  Placement,
  SheetResult,
} from './types';
export { DEFAULT_NESTING_CONFIG } from './types';

// Algorithm
export { packSingleSheet, ffdhMultiSheet } from './ffdh';

// Orchestrator
export {
  runNesting,
  extractNestingParts,
  groupByMaterial,
  resolveSheetConfig,
} from './optimizer';

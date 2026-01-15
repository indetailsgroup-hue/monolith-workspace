/**
 * OperationGraph Module - Factory Operations
 *
 * Exports types and builders for converting DesignIntent
 * to machine-readable operations.
 */

// Types
export type {
  OpId,
  OpKind,
  TargetKind,
  OpTarget,
  OpNode,
  OperationGraph,
  OpSummary,
} from './types';
export { getOpSummary } from './types';

// Builder
export {
  buildOpGraphFromIntents,
  buildOpGraphForCabinet,
  resetOpCounter,
} from './buildOpGraph';

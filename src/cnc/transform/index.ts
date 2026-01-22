/**
 * CNC Transform Module
 *
 * Provides workpiece coordinate mapping and transform primitives.
 *
 * @version 1.0.0 - Phase D4.1
 */

// Types
export type {
  PanelFace,
  WorkpieceDatum,
  WorkpieceFrame,
  WorkpieceOffset,
  WorkpieceTransformContext,
  OperationWorkpieceContext,
  TransformResult,
} from './workpieceTypes';

// Constants
export {
  DEFAULT_WORKPIECE_FRAME,
  DEFAULT_WORKPIECE_OFFSET,
  createIdentityContext,
} from './workpieceTypes';

// Type guards
export {
  isPanelFace,
  isWorkpieceDatum,
  isValidWorkpieceFrame,
} from './workpieceTypes';

// Position arithmetic
export {
  addPositions,
  subtractPositions,
  scalePosition,
  negatePosition,
  positionsEqual,
} from './transformPrimitives';

// Translation transforms
export {
  applyOffset,
  removeOffset,
} from './transformPrimitives';

// Rotation transforms
export {
  rotateAroundZ,
  snapAngleTo90,
} from './transformPrimitives';

// Mirror transforms
export {
  mirrorAlongX,
  mirrorAlongY,
  mirrorAlongZ,
} from './transformPrimitives';

// Face transforms
export {
  transformForBottomFace,
  getFaceSurfaceZ,
} from './transformPrimitives';

// Datum transforms
export {
  getDatumOffset,
  transformDatum,
} from './transformPrimitives';

// Complete transforms
export {
  transformToMachine,
  transformFromMachine,
  transformBatchToMachine,
} from './transformPrimitives';

// Validation
export {
  isWithinWorkpiece,
  clampToWorkpiece,
} from './transformPrimitives';

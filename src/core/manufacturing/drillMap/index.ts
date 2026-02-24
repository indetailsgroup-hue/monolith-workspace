/**
 * DrillMap Module - v2.0 (Clean Rebuild)
 *
 * Exports for Minifix S200 drill map system.
 */

// Types & Type Guards
export * from './types';

// Drill Map Generation
export {
  generateMinifixDrillMap,
  generateDrillMap,
  createEmptyDrillMap,
  DEFAULT_MINIFIX_CONFIG,
  // Panel basis utilities
  calculatePanelAABB,
  getPanelBasisFromAABB,
  panelLocalToWorld,
  boltEdgePointFromSideAABB,
  buildSystem32PositionsAuto,
  type System32AutoParams,
  // Coordinate mapping
  cornerToLocalXY_TopBottom,
  cornerToLocalXY_Side,
  // System32 params
  SYSTEM32_PARAMS,
} from './generateDrillMap';

// Cabinet Bounds & Clamping
export type {
  Bounds3World,
  ClampRanges,
  ClampResult,
} from './cabinetBounds';
export {
  DEFAULT_BOUNDS_MARGIN_MM,
  FALLBACK_BOUNDS,
  computeCabinetBoundsWorld,
  computeBoundsFromDimensions,
  computeBoundsFromDrillMap,
  computeClampRanges,
  clampOverrideToCabinetBounds,
  positionOverrideToVec3,
  vec3ToPositionOverride,
  formatRange,
  formatBounds,
} from './cabinetBounds';

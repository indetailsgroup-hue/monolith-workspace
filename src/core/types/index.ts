/**
 * Core Types - Barrel Export
 *
 * Re-exports all core type definitions for convenient imports.
 *
 * @example
 * import { Cabinet, CabinetType, FlatPart } from '@/core/types';
 */

// ============================================================================
// Cabinet Types (Primary source for shared types)
// ============================================================================

export * from './Cabinet';

// ============================================================================
// FlatPart Types (P14A)
// ============================================================================

export * from './FlatPart';

// ============================================================================
// Snap Types (excluding CabinetDimensions - defined in Cabinet.ts)
// ============================================================================

export {
  // Vector & Math
  type Vec3,
  type Plane,
  type Transform,
  type AABB,

  // Anchors
  type AnchorKind,
  type AnchorEdge,
  type CabinetAnchor,

  // Snap
  type SnapType,
  type SnapExpectation,
  type SnapCompatibilityPair,
  type SnapConstants,
  DEFAULT_SNAP_CONSTANTS,
  type SnapCandidate,
  type SnapResult,

  // Cabinet Instance (for snap)
  // CabinetDimensions excluded - conflicts with Cabinet.ts
  type SnapCabinetInstance,

  // Alignment
  type SnapAlignment,
  type CabinetSnapParams,
} from './SnapTypes';

// ============================================================================
// Production Types (excluding GrainDirection - defined in Cabinet.ts)
// ============================================================================

export {
  type Side,
  type Face,
  // GrainDirection excluded - conflicts with Cabinet.ts
  type EdgeDetail,
  type DrillVerticalOp,
  type DrillHorizontalOp,
  type GrooveOp,
  type PocketOp,
  type ContourOp,
  type HingeCupOp,
  type MachineOperation,
  type PanelProductionData,
  LAYER_CONFIG,
  getVerticalDrillLayer,
  getHorizontalDrillLayer,
  getGrooveLayer,
  SYSTEM_32,
  CONFIRMAT,
  DOWEL,
  HINGE_PARAMS,
  DRAWER_SLIDE,
} from './Production';

/**
 * snapClearanceConfig.ts - Configuration constants for Snap & Clearance System
 *
 * ARCHITECTURE:
 * - All constants are deterministic and serializable
 * - Used by Snap Engine, Collision Detection, Gate Validation
 * - Values optimized for built-in cabinet manufacturing
 */

// ============================================
// SNAP CONSTANTS (from North Star v4.0)
// ============================================

export const SNAP_CONSTANTS = {
  /** Distance threshold for snap detection (mm) */
  snapThresholdMm: 50,

  /** Minimum gap between cabinets for manufacturing (mm) */
  minGapMm: 1,

  /** Maximum angle error for snap compatibility (degrees) */
  angleThresholdDeg: 5,
} as const;

// ============================================
// SPATIAL HASH CONFIGURATION
// ============================================

export const SPATIAL_CONFIG = {
  /** Cell size for spatial hash grid (mm) - should be >= typical cabinet width */
  cellSizeMm: 500,

  /** Padding for near-field collision queries (mm) */
  nearPaddingMm: 150,
} as const;

// ============================================
// USE ENVELOPE DEFAULTS (Door/Drawer clearance)
// ============================================

export const USE_ENVELOPE_DEFAULTS = {
  /** Default maximum door opening angle (degrees) */
  doorMaxOpenDeg: 110,

  /** Number of OBB samples for door swing envelope */
  doorSampleCount: 8,

  /** Number of OBB samples for drawer pull envelope */
  drawerSampleCount: 6,
} as const;

// ============================================
// GATE SEVERITY POLICY
// ============================================

export const GATE_SEVERITY = {
  /** Body collision = ERROR (blocks commit) */
  bodyCollision: 'ERROR',

  /** Use envelope collision = WARNING (allows commit with warning) */
  useEnvelopeCollision: 'WARNING',
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type SnapConstantsType = typeof SNAP_CONSTANTS;
export type SpatialConfigType = typeof SPATIAL_CONFIG;
export type UseEnvelopeDefaultsType = typeof USE_ENVELOPE_DEFAULTS;
export type GateSeverityType = typeof GATE_SEVERITY;

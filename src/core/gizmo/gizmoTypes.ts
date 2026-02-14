/**
 * gizmoTypes.ts - Gizmo Type Definitions
 *
 * ARCHITECTURE:
 * - GizmoSpace: WORLD (fixed X/Y/Z) vs LOCAL (cabinet's rotated axes)
 * - GizmoOp: TRANSLATE (future: ROTATE, SCALE)
 * - GizmoAxis: X, Y, Z constraint
 *
 * For cabinet work: LOCAL is default (move along cabinet's facing direction)
 * For room layout: WORLD is default (move along room walls)
 */

// ============================================
// TYPES
// ============================================

/**
 * Coordinate space for gizmo operations
 * - WORLD: X/Y/Z aligned to world axes (good for orthogonal layouts)
 * - LOCAL: X/Y/Z aligned to object's rotation (good for rotated cabinets)
 */
export type GizmoSpace = 'WORLD' | 'LOCAL';

/**
 * Gizmo operation type
 * Currently only TRANSLATE, future support for ROTATE/SCALE
 */
export type GizmoOp = 'TRANSLATE' | 'ROTATE' | 'SCALE';

/**
 * Constrained axis for single-axis movement
 */
export type GizmoAxis = 'X' | 'Y' | 'Z' | null;

/**
 * Constrained plane for two-axis movement
 */
export type GizmoPlane = 'XY' | 'XZ' | 'YZ';

/**
 * Handle type: axis (single-axis) or plane (two-axis)
 */
export type GizmoHandleKind = 'AXIS' | 'PLANE' | 'PLANE_CENTER' | 'PLANE_U' | 'PLANE_V';

/**
 * Plane movement mode for DCC-grade plane handles
 * - CENTER: Free movement in plane (u + v)
 * - U: Constrained to U axis within plane
 * - V: Constrained to V axis within plane
 */
export type GizmoPlaneMode = 'CENTER' | 'U' | 'V';

/**
 * Gizmo handle - either axis or plane constraint
 */
export type GizmoHandle =
  | { kind: 'AXIS'; axis: 'X' | 'Y' | 'Z' }
  | { kind: 'PLANE'; plane: GizmoPlane }
  | { kind: 'PLANE_CENTER'; plane: GizmoPlane }
  | { kind: 'PLANE_U'; plane: GizmoPlane }
  | { kind: 'PLANE_V'; plane: GizmoPlane };

/**
 * Get plane mode from handle kind
 */
export function getPlaneMode(handle: GizmoHandle): GizmoPlaneMode | null {
  switch (handle.kind) {
    case 'PLANE':
    case 'PLANE_CENTER':
      return 'CENTER';
    case 'PLANE_U':
      return 'U';
    case 'PLANE_V':
      return 'V';
    default:
      return null;
  }
}

/**
 * Check if handle is a plane handle (any type)
 */
export function isPlaneHandle(handle: GizmoHandle): boolean {
  return handle.kind === 'PLANE' ||
         handle.kind === 'PLANE_CENTER' ||
         handle.kind === 'PLANE_U' ||
         handle.kind === 'PLANE_V';
}

/**
 * Gizmo configuration settings
 */
export interface GizmoSettings {
  /** Current operation mode */
  op: GizmoOp;
  /** Coordinate space (WORLD or LOCAL) */
  space: GizmoSpace;
  /** Step size in mm for quantized movement, null = continuous */
  stepMm: number | null;
  /** Fine movement factor when Shift is held (e.g., 0.1 = 10% speed) */
  fineFactor: number;
}

/**
 * Default gizmo settings
 * - LOCAL space for cabinet work (intuitive for rotated objects)
 * - No step snap by default (continuous movement)
 * - Fine factor 0.1 (10% when Shift held)
 */
export const DEFAULT_GIZMO_SETTINGS: GizmoSettings = {
  op: 'TRANSLATE',
  space: 'LOCAL',
  stepMm: null,
  fineFactor: 0.1,
};

// ============================================
// HOTKEY MAPPINGS
// ============================================

/**
 * Standard DCC-style hotkeys for gizmo operations
 */
export const GIZMO_HOTKEYS = {
  toggleSpace: 'L',      // Toggle World/Local
  constrainX: 'X',       // Constrain to X axis
  constrainY: 'Y',       // Constrain to Y axis
  constrainZ: 'Z',       // Constrain to Z axis
  fineModifier: 'Shift', // Fine movement (10% speed)
  stepModifier: 'Ctrl',  // Step snap (1mm or 5mm)
} as const;

/**
 * Step sizes for Ctrl modifier
 */
export const GIZMO_STEP_SIZES = {
  fine: 1,    // 1mm when Ctrl held (precise)
  medium: 5,  // 5mm alternative
  coarse: 10, // 10mm for quick positioning
} as const;

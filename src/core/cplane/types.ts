/**
 * Construction Plane Types
 *
 * Defines the construction plane system for sketching in 3D space.
 * Supports preset planes (XZ, XY, YZ) and custom planes.
 *
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

/** Construction plane orientation */
export type CPlaneKind = 'XZ' | 'XY' | 'YZ' | 'custom';

/** Construction plane definition */
export interface CPlane {
  /** Plane type */
  kind: CPlaneKind;

  /** Origin point in world coordinates (mm) */
  origin: [number, number, number];

  /** Normal vector (unit) */
  normal: [number, number, number];

  /** U-axis direction (for coordinate mapping) */
  uAxis: [number, number, number];

  /** V-axis direction (perpendicular to U and normal) */
  vAxis: [number, number, number];

  /** Grid size (mm) */
  gridSize: number;

  /** Grid extent (mm) - half-width of grid display */
  gridExtent: number;

  /** Whether grid is visible */
  showGrid: boolean;

  /** Whether axes are visible */
  showAxes: boolean;
}

// ============================================================================
// Preset Planes
// ============================================================================

/** World XZ plane (floor) - default for cabinet layout */
export const CPLANE_WORLD_XZ: CPlane = {
  kind: 'XZ',
  origin: [0, 0, 0],
  normal: [0, 1, 0],    // Y-up
  uAxis: [1, 0, 0],     // X-right
  vAxis: [0, 0, 1],     // Z-forward
  gridSize: 100,        // 100mm grid
  gridExtent: 5000,     // 5m half-extent
  showGrid: true,
  showAxes: true,
};

/** World XY plane (front elevation) */
export const CPLANE_WORLD_XY: CPlane = {
  kind: 'XY',
  origin: [0, 0, 0],
  normal: [0, 0, 1],    // Z-forward
  uAxis: [1, 0, 0],     // X-right
  vAxis: [0, 1, 0],     // Y-up
  gridSize: 100,
  gridExtent: 5000,
  showGrid: true,
  showAxes: true,
};

/** World YZ plane (side elevation) */
export const CPLANE_WORLD_YZ: CPlane = {
  kind: 'YZ',
  origin: [0, 0, 0],
  normal: [1, 0, 0],    // X-right
  uAxis: [0, 0, 1],     // Z-forward
  vAxis: [0, 1, 0],     // Y-up
  gridSize: 100,
  gridExtent: 5000,
  showGrid: true,
  showAxes: true,
};

/** Get preset plane by kind */
export function getPresetCPlane(kind: CPlaneKind): CPlane {
  switch (kind) {
    case 'XZ':
      return { ...CPLANE_WORLD_XZ };
    case 'XY':
      return { ...CPLANE_WORLD_XY };
    case 'YZ':
      return { ...CPLANE_WORLD_YZ };
    case 'custom':
    default:
      return { ...CPLANE_WORLD_XZ };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Project a 3D world point onto the construction plane.
 * Returns [u, v] coordinates on the plane.
 */
export function projectToPlane(
  worldPoint: [number, number, number],
  plane: CPlane
): [number, number] {
  // Vector from origin to point
  const dx = worldPoint[0] - plane.origin[0];
  const dy = worldPoint[1] - plane.origin[1];
  const dz = worldPoint[2] - plane.origin[2];

  // Project onto U and V axes
  const u =
    dx * plane.uAxis[0] + dy * plane.uAxis[1] + dz * plane.uAxis[2];
  const v =
    dx * plane.vAxis[0] + dy * plane.vAxis[1] + dz * plane.vAxis[2];

  return [u, v];
}

/**
 * Convert plane coordinates [u, v] back to world coordinates.
 */
export function planeToWorld(
  planePoint: [number, number],
  plane: CPlane
): [number, number, number] {
  const [u, v] = planePoint;

  return [
    plane.origin[0] + u * plane.uAxis[0] + v * plane.vAxis[0],
    plane.origin[1] + u * plane.uAxis[1] + v * plane.vAxis[1],
    plane.origin[2] + u * plane.uAxis[2] + v * plane.vAxis[2],
  ];
}

/**
 * Snap a value to grid.
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap plane coordinates to grid.
 */
export function snapPlanePointToGrid(
  point: [number, number],
  gridSize: number
): [number, number] {
  return [snapToGrid(point[0], gridSize), snapToGrid(point[1], gridSize)];
}

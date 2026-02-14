/**
 * gridOriginOnPlane.ts - Quantized Grid Origin Utility
 *
 * PROBLEM:
 * When dragging a gizmo, the grid overlay shouldn't "float" with the object.
 * The grid should stay aligned to world coordinates so snap points are consistent.
 *
 * SOLUTION:
 * Quantize the grid origin to the nearest grid step on the plane.
 * This ensures grid lines align with world coordinates regardless of object position.
 *
 * USAGE:
 * const gridOrigin = gridOriginOnPlane({
 *   objectPosition: { x: 123.4, y: 567.8, z: 901.2 },
 *   plane: 'XZ',
 *   stepMm: 10,
 * });
 * // gridOrigin = { x: 120, y: 567.8, z: 900 }
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoPlane, GizmoSpace } from './gizmoTypes';

// ============================================
// TYPES
// ============================================

export interface GridOriginOptions {
  /** Current object position in mm */
  objectPosition: Vec3;
  /** Plane for grid alignment */
  plane: GizmoPlane;
  /** Grid step size in mm */
  stepMm: number;
  /** Coordinate space (WORLD or LOCAL) */
  space?: GizmoSpace;
  /** Local axes rotation (for LOCAL space) */
  localAxes?: {
    axisX: Vec3;
    axisY: Vec3;
    axisZ: Vec3;
  };
}

export interface GridOriginResult {
  /** Quantized origin position */
  origin: Vec3;
  /** U basis vector for plane */
  u: Vec3;
  /** V basis vector for plane */
  v: Vec3;
  /** Normal vector for plane */
  normal: Vec3;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get world-space basis vectors for a plane
 */
function getWorldPlaneBasis(plane: GizmoPlane): { u: Vec3; v: Vec3; normal: Vec3 } {
  switch (plane) {
    case 'XY':
      return {
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 1, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
      };
    case 'XZ':
      return {
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: 1 },
        normal: { x: 0, y: 1, z: 0 },
      };
    case 'YZ':
      return {
        u: { x: 0, y: 1, z: 0 },
        v: { x: 0, y: 0, z: 1 },
        normal: { x: 1, y: 0, z: 0 },
      };
  }
}

/**
 * Get local-space basis vectors for a plane
 */
function getLocalPlaneBasis(
  plane: GizmoPlane,
  localAxes: { axisX: Vec3; axisY: Vec3; axisZ: Vec3 }
): { u: Vec3; v: Vec3; normal: Vec3 } {
  switch (plane) {
    case 'XY':
      return {
        u: localAxes.axisX,
        v: localAxes.axisY,
        normal: localAxes.axisZ,
      };
    case 'XZ':
      return {
        u: localAxes.axisX,
        v: localAxes.axisZ,
        normal: localAxes.axisY,
      };
    case 'YZ':
      return {
        u: localAxes.axisY,
        v: localAxes.axisZ,
        normal: localAxes.axisX,
      };
  }
}

/**
 * Quantize a number to the nearest step
 */
function quantize(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Project position onto plane axes
 */
function projectToPlane(
  pos: Vec3,
  u: Vec3,
  v: Vec3
): { uCoord: number; vCoord: number } {
  // Dot product to get coordinates along u and v
  const uCoord = pos.x * u.x + pos.y * u.y + pos.z * u.z;
  const vCoord = pos.x * v.x + pos.y * v.y + pos.z * v.z;
  return { uCoord, vCoord };
}

/**
 * Reconstruct position from plane coordinates
 */
function fromPlaneCoords(
  uCoord: number,
  vCoord: number,
  u: Vec3,
  v: Vec3,
  normalOffset: number,
  normal: Vec3
): Vec3 {
  return {
    x: u.x * uCoord + v.x * vCoord + normal.x * normalOffset,
    y: u.y * uCoord + v.y * vCoord + normal.y * normalOffset,
    z: u.z * uCoord + v.z * vCoord + normal.z * normalOffset,
  };
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Calculate quantized grid origin on a plane
 *
 * The grid origin is quantized to the nearest step so that:
 * 1. Grid lines align with world coordinates (WORLD space)
 * 2. Grid doesn't "float" when object moves
 * 3. Snap targets are consistent across drags
 *
 * @example
 * // Object at (123.4, 567.8, 901.2), step 10mm, XZ plane
 * const result = gridOriginOnPlane({
 *   objectPosition: { x: 123.4, y: 567.8, z: 901.2 },
 *   plane: 'XZ',
 *   stepMm: 10,
 * });
 * // result.origin = { x: 120, y: 567.8, z: 900 }
 */
export function gridOriginOnPlane(options: GridOriginOptions): GridOriginResult {
  const {
    objectPosition,
    plane,
    stepMm,
    space = 'WORLD',
    localAxes,
  } = options;

  // Get plane basis vectors
  let basis: { u: Vec3; v: Vec3; normal: Vec3 };

  if (space === 'LOCAL' && localAxes) {
    basis = getLocalPlaneBasis(plane, localAxes);
  } else {
    basis = getWorldPlaneBasis(plane);
  }

  const { u, v, normal } = basis;

  if (space === 'WORLD') {
    // WORLD space: quantize world coordinates directly
    // This is simpler and more predictable

    let originX = objectPosition.x;
    let originY = objectPosition.y;
    let originZ = objectPosition.z;

    switch (plane) {
      case 'XY':
        // Quantize X and Y, keep Z (normal direction)
        originX = quantize(originX, stepMm);
        originY = quantize(originY, stepMm);
        break;
      case 'XZ':
        // Quantize X and Z, keep Y (normal direction)
        originX = quantize(originX, stepMm);
        originZ = quantize(originZ, stepMm);
        break;
      case 'YZ':
        // Quantize Y and Z, keep X (normal direction)
        originY = quantize(originY, stepMm);
        originZ = quantize(originZ, stepMm);
        break;
    }

    return {
      origin: { x: originX, y: originY, z: originZ },
      u,
      v,
      normal,
    };
  } else {
    // LOCAL space: project to plane, quantize, reconstruct
    // This handles rotated objects correctly

    // Project position to plane coordinates
    const { uCoord, vCoord } = projectToPlane(objectPosition, u, v);

    // Quantize plane coordinates
    const quantizedU = quantize(uCoord, stepMm);
    const quantizedV = quantize(vCoord, stepMm);

    // Get the normal offset (distance from origin along normal)
    const normalOffset = objectPosition.x * normal.x +
                         objectPosition.y * normal.y +
                         objectPosition.z * normal.z;

    // Reconstruct origin from quantized plane coordinates
    const origin = fromPlaneCoords(quantizedU, quantizedV, u, v, normalOffset, normal);

    return {
      origin,
      u,
      v,
      normal,
    };
  }
}

/**
 * Calculate grid extent (how far to draw grid lines)
 *
 * Returns a reasonable extent based on step size and viewport
 */
export function calculateGridExtent(args: {
  stepMm: number;
  maxLines?: number;
  minExtentMm?: number;
  maxExtentMm?: number;
}): number {
  const {
    stepMm,
    maxLines = 50,
    minExtentMm = 100,
    maxExtentMm = 2000,
  } = args;

  // Extent = step * maxLines, clamped
  const extent = stepMm * maxLines;
  return Math.max(minExtentMm, Math.min(maxExtentMm, extent));
}

/**
 * Check if a position is on a grid line
 */
export function isOnGridLine(
  position: Vec3,
  plane: GizmoPlane,
  stepMm: number,
  tolerance: number = 0.1
): { onU: boolean; onV: boolean } {
  const basis = getWorldPlaneBasis(plane);
  const { uCoord, vCoord } = projectToPlane(position, basis.u, basis.v);

  const uRemainder = Math.abs(uCoord % stepMm);
  const vRemainder = Math.abs(vCoord % stepMm);

  return {
    onU: uRemainder < tolerance || uRemainder > stepMm - tolerance,
    onV: vRemainder < tolerance || vRemainder > stepMm - tolerance,
  };
}

export default gridOriginOnPlane;

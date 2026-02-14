/**
 * obbTypes.ts - Oriented Bounding Box (OBB) Type Definitions
 *
 * ARCHITECTURE:
 * - OBB provides accurate collision for rotated cabinets
 * - Used for both body collision and use envelope (door/drawer swing)
 * - All positions in mm, world space
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// OBB (Oriented Bounding Box)
// ============================================

/**
 * Oriented Bounding Box in world space
 * - center: center point of the box
 * - axisX/Y/Z: unit vectors defining box orientation
 * - halfSize: half-extents along each axis
 */
export interface OBB {
  center: Vec3;
  axisX: Vec3;  // unit vector
  axisY: Vec3;  // unit vector
  axisZ: Vec3;  // unit vector
  halfSize: Vec3; // half-extents (mm)
}

// ============================================
// COLLISION SHAPES
// ============================================

/**
 * Cabinet collision shape (may have multiple OBBs for complex shapes)
 * Note: cabinetId is optional when building shapes, required when stored in registry
 */
export interface CabinetCollisionShape {
  cabinetId?: string;
  obbs: OBB[];
}

/**
 * World obstacle types
 */
export type ObstacleKind =
  | 'WALL'
  | 'COLUMN'
  | 'WINDOW'
  | 'DOOR'
  | 'APPLIANCE'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'unknown';

/**
 * World obstacle shape (walls, columns, appliances, etc.)
 */
export interface WorldObstacleShape {
  id: string;
  kind: ObstacleKind;
  obbs: OBB[];
}

// ============================================
// AABB (Axis-Aligned Bounding Box)
// ============================================

/**
 * Axis-Aligned Bounding Box (for broad-phase)
 */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

// ============================================
// COLLISION RESULT
// ============================================

export interface CollisionResult {
  collides: boolean;
  reason?: string;
  penetrationDepth?: number;
  separatingAxis?: Vec3;
  objectAId?: string;
  objectBId?: string;
}

// ============================================
// OBB UTILITIES
// ============================================

/**
 * Compute conservative AABB from OBB (fast broad-phase)
 */
export function obbToAabb(obb: OBB): AABB {
  const { center, axisX, axisY, axisZ, halfSize } = obb;
  const hx = halfSize.x, hy = halfSize.y, hz = halfSize.z;

  // AABB extents = sum of |axis_i| * halfSize_i
  const ex =
    Math.abs(axisX.x) * hx + Math.abs(axisY.x) * hy + Math.abs(axisZ.x) * hz;
  const ey =
    Math.abs(axisX.y) * hx + Math.abs(axisY.y) * hy + Math.abs(axisZ.y) * hz;
  const ez =
    Math.abs(axisX.z) * hx + Math.abs(axisY.z) * hy + Math.abs(axisZ.z) * hz;

  return {
    min: { x: center.x - ex, y: center.y - ey, z: center.z - ez },
    max: { x: center.x + ex, y: center.y + ey, z: center.z + ez },
  };
}

/**
 * Merge two AABBs
 */
export function mergeAabb(a: AABB, b: AABB): AABB {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

/**
 * Compute AABB for a set of OBBs
 */
export function obbsToAabb(obbs: OBB[]): AABB {
  if (obbs.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  let aabb = obbToAabb(obbs[0]);
  for (let i = 1; i < obbs.length; i++) {
    aabb = mergeAabb(aabb, obbToAabb(obbs[i]));
  }
  return aabb;
}

/**
 * Expand AABB by padding
 */
export function expandAabb(aabb: AABB, padding: number): AABB {
  return {
    min: {
      x: aabb.min.x - padding,
      y: aabb.min.y - padding,
      z: aabb.min.z - padding,
    },
    max: {
      x: aabb.max.x + padding,
      y: aabb.max.y + padding,
      z: aabb.max.z + padding,
    },
  };
}

/**
 * Check if two AABBs overlap
 */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

/**
 * Translate an OBB by a delta
 */
export function translateObb(obb: OBB, delta: Vec3): OBB {
  return {
    ...obb,
    center: {
      x: obb.center.x + delta.x,
      y: obb.center.y + delta.y,
      z: obb.center.z + delta.z,
    },
  };
}

/**
 * Translate all OBBs in a collision shape
 */
export function translateCollisionShape(
  shape: CabinetCollisionShape,
  delta: Vec3
): CabinetCollisionShape {
  return {
    ...shape,
    obbs: shape.obbs.map(obb => translateObb(obb, delta)),
  };
}

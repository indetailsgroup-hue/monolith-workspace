/**
 * obbCollision.ts - OBB-OBB Collision Detection using SAT (Separating Axis Theorem)
 *
 * ALGORITHM:
 * - Test 15 potential separating axes:
 *   - 3 axes from OBB A
 *   - 3 axes from OBB B
 *   - 9 cross products of A and B axes
 * - If separation found on ANY axis → no collision
 * - If no separation on ALL axes → collision
 *
 * REFERENCE: Real-Time Collision Detection (Christer Ericson)
 */

import type { Vec3 } from '../types/SnapTypes';
import type { OBB, CollisionResult } from './obbTypes';

// ============================================
// VECTOR UTILITIES
// ============================================

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// ============================================
// SAT IMPLEMENTATION
// ============================================

/**
 * Test if two OBBs are separated along a given axis
 * Returns the overlap amount (negative = separated, positive = overlapping)
 */
function testAxis(
  axis: Vec3,
  t: Vec3,     // center difference (B.center - A.center)
  aAxes: Vec3[],
  aHalf: Vec3,
  bAxes: Vec3[],
  bHalf: Vec3
): number {
  const axisLen = length(axis);
  if (axisLen < 1e-9) {
    // Degenerate axis (parallel edges), skip
    return Infinity;
  }

  // Project centers onto axis
  const projT = Math.abs(dot(t, axis)) / axisLen;

  // Sum of projected half-extents
  const projA =
    Math.abs(dot(aAxes[0], axis)) * aHalf.x +
    Math.abs(dot(aAxes[1], axis)) * aHalf.y +
    Math.abs(dot(aAxes[2], axis)) * aHalf.z;

  const projB =
    Math.abs(dot(bAxes[0], axis)) * bHalf.x +
    Math.abs(dot(bAxes[1], axis)) * bHalf.y +
    Math.abs(dot(bAxes[2], axis)) * bHalf.z;

  // Overlap = sum of radii - distance between centers
  const overlap = (projA + projB) / axisLen - projT;

  return overlap;
}

/**
 * OBB-OBB collision test using SAT
 *
 * @returns CollisionResult with collision status and penetration info
 */
export function obbObbCollision(a: OBB, b: OBB): CollisionResult {
  const aAxes = [a.axisX, a.axisY, a.axisZ];
  const bAxes = [b.axisX, b.axisY, b.axisZ];

  const aHalf = a.halfSize;
  const bHalf = b.halfSize;

  // Vector from A center to B center
  const t = sub(b.center, a.center);

  let minOverlap = Infinity;
  let separatingAxis: Vec3 | undefined;

  // Test 15 potential separating axes

  // 3 axes from A
  for (let i = 0; i < 3; i++) {
    const overlap = testAxis(aAxes[i], t, aAxes, aHalf, bAxes, bHalf);
    if (overlap < 0) {
      return { collides: false, separatingAxis: aAxes[i] };
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      separatingAxis = aAxes[i];
    }
  }

  // 3 axes from B
  for (let i = 0; i < 3; i++) {
    const overlap = testAxis(bAxes[i], t, aAxes, aHalf, bAxes, bHalf);
    if (overlap < 0) {
      return { collides: false, separatingAxis: bAxes[i] };
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      separatingAxis = bAxes[i];
    }
  }

  // 9 cross products (A_i x B_j)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const axis = cross(aAxes[i], bAxes[j]);
      const overlap = testAxis(axis, t, aAxes, aHalf, bAxes, bHalf);
      if (overlap < 0) {
        return { collides: false, separatingAxis: axis };
      }
      if (overlap < minOverlap && overlap !== Infinity) {
        minOverlap = overlap;
        separatingAxis = axis;
      }
    }
  }

  // No separating axis found → collision
  return {
    collides: true,
    penetrationDepth: minOverlap,
    separatingAxis,
  };
}

/**
 * Check if any OBB from set A collides with any OBB from set B
 */
export function obbSetsCollide(obbsA: OBB[], obbsB: OBB[]): CollisionResult {
  for (const a of obbsA) {
    for (const b of obbsB) {
      const result = obbObbCollision(a, b);
      if (result.collides) {
        return result;
      }
    }
  }
  return { collides: false };
}

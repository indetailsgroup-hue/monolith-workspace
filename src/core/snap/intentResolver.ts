/**
 * intentResolver.ts - Resolve Snap Intent from Drag Velocity
 *
 * ARCHITECTURE:
 * - Analyzes drag velocity to infer user intent
 * - Maps dominant axis to SnapType bias
 * - Provides axis hint for constraint locking
 *
 * MAPPING (World Axes):
 * - X (left-right) → SIDE_JOIN
 * - Y (up-down) → STACK
 * - Z (front-back) → FLUSH_FRONT
 *
 * DETERMINISTIC: Same velocity → Same intent
 */

import type { Vec3 } from '../types/SnapTypes';
import type { SnapType } from '../types/SnapTypes';
import type {
  DragKinematics,
  IntentWeights,
  SnapIntentResult,
} from './intentTypes';
import { AXIS_TO_SNAP_TYPE, SECONDARY_BIAS } from './intentTypes';
import { clamp01 } from '../math/vec3Utils';

// ============================================
// INTERNAL UTILITIES
// ============================================

/**
 * Find dominant axis from velocity vector
 */
function findDominantAxis(v: Vec3): 'X' | 'Y' | 'Z' | 'NONE' {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);

  const max = Math.max(ax, ay, az);
  if (max < 1e-6) return 'NONE';

  if (ax === max) return 'X';
  if (ay === max) return 'Y';
  return 'Z';
}

/**
 * Calculate axis dominance ratio (0-1)
 * Higher = more clearly dominant
 */
function calculateDominance(v: Vec3, axis: 'X' | 'Y' | 'Z'): number {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  const sum = ax + ay + az;

  if (sum < 1e-9) return 0;

  switch (axis) {
    case 'X': return ax / sum;
    case 'Y': return ay / sum;
    case 'Z': return az / sum;
  }
}

// ============================================
// MAIN RESOLVER
// ============================================

/**
 * Resolve snap intent from drag kinematics
 *
 * @param kin - Drag kinematics (velocity, speed)
 * @param weights - Intent configuration
 * @returns Intent result with type biases and axis hint
 */
export function resolveSnapIntent(
  kin: DragKinematics,
  weights: IntentWeights
): SnapIntentResult {
  // Below minimum speed: no intent detected
  if (kin.speed < weights.minSpeedForIntent) {
    return {
      typeBias: {},
      axisHint: 'NONE',
      confidence: 0,
    };
  }

  // Find dominant axis
  const axis = findDominantAxis(kin.velocityWorld);
  if (axis === 'NONE') {
    return {
      typeBias: {},
      axisHint: 'NONE',
      confidence: 0,
    };
  }

  // Calculate dominance (how clearly one axis dominates)
  const dominance = calculateDominance(kin.velocityWorld, axis);

  // Map to primary SnapType
  const primaryType = AXIS_TO_SNAP_TYPE[axis];

  // Build bias map
  const typeBias: Partial<Record<SnapType, number>> = {};

  // Primary bias based on dominance
  typeBias[primaryType] = clamp01(dominance);

  // Add secondary biases (e.g., FLUSH_FRONT also boosts BACK_ALIGN)
  const secondaries = SECONDARY_BIAS[primaryType];
  if (secondaries) {
    for (const secType of secondaries) {
      typeBias[secType] = clamp01(dominance * 0.5);
    }
  }

  return {
    typeBias,
    axisHint: axis,
    confidence: dominance,
  };
}

// ============================================
// VELOCITY FROM POSITIONS
// ============================================

/**
 * Calculate velocity from position delta and time
 */
export function calculateVelocity(
  positionDelta: Vec3,
  dtSec: number
): Vec3 {
  if (dtSec <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: positionDelta.x / dtSec,
    y: positionDelta.y / dtSec,
    z: positionDelta.z / dtSec,
  };
}

/**
 * Calculate speed (magnitude) from velocity
 */
export function calculateSpeed(velocity: Vec3): number {
  return Math.sqrt(
    velocity.x * velocity.x +
    velocity.y * velocity.y +
    velocity.z * velocity.z
  );
}

/**
 * Create DragKinematics from position delta and time
 */
export function createDragKinematics(
  positionDelta: Vec3,
  dtSec: number
): DragKinematics {
  const velocityWorld = calculateVelocity(positionDelta, dtSec);
  const speed = calculateSpeed(velocityWorld);

  return { velocityWorld, speed };
}

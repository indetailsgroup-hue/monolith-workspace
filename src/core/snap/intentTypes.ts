/**
 * intentTypes.ts - Types for Snap Intent Resolution
 *
 * ARCHITECTURE:
 * - Captures drag kinematics (velocity, speed)
 * - Defines intent weights for velocity-biased snap selection
 * - Maps dominant drag axis to SnapType bias
 *
 * USAGE:
 * - Drag velocity → Intent → Bias candidates → Better UX
 */

import type { Vec3 } from '../types/SnapTypes';
import type { SnapType } from '../types/SnapTypes';

// ============================================
// DRAG KINEMATICS
// ============================================

/**
 * Drag kinematics during cabinet movement
 */
export interface DragKinematics {
  /** Velocity in world space (mm/s) */
  velocityWorld: Vec3;

  /** Speed magnitude |v| (mm/s) */
  speed: number;
}

// ============================================
// INTENT WEIGHTS CONFIG
// ============================================

/**
 * Configuration for intent-based scoring
 */
export interface IntentWeights {
  /** Weight added to final score based on intent match (0-1) */
  velocityWeight: number;

  /** Minimum speed to consider intent (mm/s) */
  minSpeedForIntent: number;
}

/**
 * Default intent weights (production-ready)
 */
export const DEFAULT_INTENT_WEIGHTS: IntentWeights = {
  velocityWeight: 0.15,
  minSpeedForIntent: 10, // mm/s
};

// ============================================
// INTENT RESULT
// ============================================

/**
 * Result of intent resolution
 */
export interface SnapIntentResult {
  /** Additive bias per snap type (0-1) */
  typeBias: Partial<Record<SnapType, number>>;

  /** Dominant axis hint for axis lock */
  axisHint: 'X' | 'Y' | 'Z' | 'NONE';

  /** Confidence in the intent (0-1) */
  confidence: number;
}

// ============================================
// AXIS MAPPING
// ============================================

/**
 * Maps drag axis to primary SnapType
 *
 * - X (left-right) → SIDE_JOIN
 * - Y (up-down) → STACK
 * - Z (front-back) → FLUSH_FRONT
 */
export const AXIS_TO_SNAP_TYPE: Record<'X' | 'Y' | 'Z', SnapType> = {
  X: 'SIDE_JOIN',
  Y: 'STACK',
  Z: 'FLUSH_FRONT',
};

/**
 * Secondary bias for related snap types
 */
export const SECONDARY_BIAS: Partial<Record<SnapType, SnapType[]>> = {
  FLUSH_FRONT: ['BACK_ALIGN'],
};

/**
 * predictiveDeltaAdaptive.ts - Compute Predictive Delta with Adaptive Lookahead
 *
 * ARCHITECTURE:
 * - Uses adaptive lookahead time based on speed
 * - Clamps delta to prevent wild jumps
 * - Returns both delta and lookahead info for debugging
 *
 * FORMULA:
 * delta = velocity * adaptiveLookahead(speed)
 * delta = clamp(delta, -maxMm, +maxMm)
 */

import type { Vec3 } from '../types/SnapTypes';
import { PREDICTIVE_ADAPTIVE, type PredictiveAdaptiveConfig } from './predictiveAdaptiveConfig';
import { computeAdaptiveLookaheadMs } from './adaptiveLookahead';
import { clamp } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * Result of predictive delta computation
 */
export interface PredictiveDeltaResult {
  /** Predicted position delta (mm) */
  delta: Vec3;

  /** Lookahead time used (ms) */
  lookaheadMs: number;

  /** Whether delta was clamped */
  wasClamped: boolean;
}

// ============================================
// PREDICTIVE DELTA (ADAPTIVE)
// ============================================

/**
 * Compute predictive delta with adaptive lookahead
 *
 * @param velocityWorld - Current velocity (mm/s)
 * @param speed - Speed magnitude (mm/s)
 * @param config - Optional config override
 * @returns Predictive delta result
 */
export function computePredictiveDeltaAdaptive(args: {
  velocityWorld: Vec3;
  speed: number;
  config?: PredictiveAdaptiveConfig;
}): PredictiveDeltaResult {
  const config = args.config ?? PREDICTIVE_ADAPTIVE;
  const { velocityWorld, speed } = args;

  // Compute adaptive lookahead
  const lookaheadMs = computeAdaptiveLookaheadMs(speed, config);
  const dt = lookaheadMs / 1000;

  // Raw prediction
  const rawX = velocityWorld.x * dt;
  const rawY = velocityWorld.y * dt;
  const rawZ = velocityWorld.z * dt;

  // Clamp to max
  const maxMm = config.maxLookaheadMm;
  const clampedX = clamp(rawX, -maxMm, maxMm);
  const clampedY = clamp(rawY, -maxMm, maxMm);
  const clampedZ = clamp(rawZ, -maxMm, maxMm);

  // Check if clamped
  const wasClamped =
    clampedX !== rawX || clampedY !== rawY || clampedZ !== rawZ;

  return {
    delta: { x: clampedX, y: clampedY, z: clampedZ },
    lookaheadMs,
    wasClamped,
  };
}

// ============================================
// PREDICTED CABINET STATE
// ============================================

import type { SnapCabinetInstance } from '../types/SnapTypes';

/**
 * Create cabinet instance at predicted position
 */
export function createPredictedCabinetAdaptive(
  cabinet: SnapCabinetInstance,
  predictiveResult: PredictiveDeltaResult
): SnapCabinetInstance {
  const { delta } = predictiveResult;

  return {
    ...cabinet,
    transform: {
      ...cabinet.transform,
      position: {
        x: cabinet.transform.position.x + delta.x,
        y: cabinet.transform.position.y + delta.y,
        z: cabinet.transform.position.z + delta.z,
      },
    },
    // Update envelope if present
    envelope: cabinet.envelope
      ? {
          min: {
            x: cabinet.envelope.min.x + delta.x,
            y: cabinet.envelope.min.y + delta.y,
            z: cabinet.envelope.min.z + delta.z,
          },
          max: {
            x: cabinet.envelope.max.x + delta.x,
            y: cabinet.envelope.max.y + delta.y,
            z: cabinet.envelope.max.z + delta.z,
          },
        }
      : undefined,
  };
}

// ============================================
// UTILITY: ZERO DELTA
// ============================================

/**
 * Create zero predictive result (for disabled prediction)
 */
export function zeroPredictiveResult(): PredictiveDeltaResult {
  return {
    delta: { x: 0, y: 0, z: 0 },
    lookaheadMs: 0,
    wasClamped: false,
  };
}

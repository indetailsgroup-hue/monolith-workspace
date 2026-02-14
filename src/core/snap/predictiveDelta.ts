/**
 * predictiveDelta.ts - Compute Predictive Position Delta
 *
 * ARCHITECTURE:
 * - Uses velocity to predict future position
 * - Clamps prediction to prevent wild jumps
 * - Supports adaptive lookahead based on speed
 *
 * FORMULA:
 * predictedDelta = velocity * lookaheadTime
 * (clamped to maxLookaheadMm per axis)
 */

import type { Vec3 } from '../types/SnapTypes';
import { PREDICTIVE_CONFIG } from './predictiveConfig';
import { clamp } from '../math/vec3Utils';

// ============================================
// PREDICTIVE DELTA COMPUTATION
// ============================================

/**
 * Compute predictive delta from velocity
 *
 * @param velocityWorld - Current velocity (mm/s)
 * @param dtLookaheadSec - Lookahead time in seconds
 * @param maxLookaheadMm - Maximum delta per axis (mm)
 * @returns Predicted position delta
 */
export function computePredictiveDelta(args: {
  velocityWorld: Vec3;
  dtLookaheadSec: number;
  maxLookaheadMm: number;
}): Vec3 {
  const { velocityWorld, dtLookaheadSec, maxLookaheadMm } = args;

  // Raw prediction
  const raw = {
    x: velocityWorld.x * dtLookaheadSec,
    y: velocityWorld.y * dtLookaheadSec,
    z: velocityWorld.z * dtLookaheadSec,
  };

  // Clamp each axis independently
  return {
    x: clamp(raw.x, -maxLookaheadMm, maxLookaheadMm),
    y: clamp(raw.y, -maxLookaheadMm, maxLookaheadMm),
    z: clamp(raw.z, -maxLookaheadMm, maxLookaheadMm),
  };
}

/**
 * Compute adaptive lookahead time based on speed
 * Faster = longer lookahead (up to max)
 */
export function computeAdaptiveLookahead(
  speed: number,
  config: typeof PREDICTIVE_CONFIG = PREDICTIVE_CONFIG
): number {
  if (!config.adaptiveLookahead) {
    return config.lookaheadMs / 1000;
  }

  // Below min speed: use minimum lookahead
  if (speed < config.minSpeedForPrediction) {
    return config.minLookaheadMs / 1000;
  }

  // Scale linearly from min to max
  const t = Math.min(1, speed / config.maxSpeedForLookahead);
  const lookaheadMs = config.minLookaheadMs + t * (config.lookaheadMs - config.minLookaheadMs);

  return lookaheadMs / 1000;
}

/**
 * Compute predictive delta with adaptive lookahead
 */
export function computeAdaptivePredictiveDelta(
  velocityWorld: Vec3,
  speed: number,
  config: typeof PREDICTIVE_CONFIG = PREDICTIVE_CONFIG
): Vec3 {
  const dtSec = computeAdaptiveLookahead(speed, config);

  return computePredictiveDelta({
    velocityWorld,
    dtLookaheadSec: dtSec,
    maxLookaheadMm: config.maxLookaheadMm,
  });
}

// ============================================
// PREDICTED POSITION
// ============================================

/**
 * Compute predicted position
 */
export function computePredictedPosition(
  currentPosition: Vec3,
  predictiveDelta: Vec3
): Vec3 {
  return {
    x: currentPosition.x + predictiveDelta.x,
    y: currentPosition.y + predictiveDelta.y,
    z: currentPosition.z + predictiveDelta.z,
  };
}

// ============================================
// PREDICTED CABINET STATE
// ============================================

import type { SnapCabinetInstance, Transform } from '../types/SnapTypes';

/**
 * Create cabinet instance at predicted position
 * Only translates position, keeps all other properties
 */
export function createPredictedCabinet(
  cabinet: SnapCabinetInstance,
  predictiveDelta: Vec3
): SnapCabinetInstance {
  const predictedPosition = computePredictedPosition(
    cabinet.transform.position,
    predictiveDelta
  );

  return {
    ...cabinet,
    transform: {
      ...cabinet.transform,
      position: predictedPosition,
    },
    // Optionally update envelope if present
    envelope: cabinet.envelope ? {
      min: {
        x: cabinet.envelope.min.x + predictiveDelta.x,
        y: cabinet.envelope.min.y + predictiveDelta.y,
        z: cabinet.envelope.min.z + predictiveDelta.z,
      },
      max: {
        x: cabinet.envelope.max.x + predictiveDelta.x,
        y: cabinet.envelope.max.y + predictiveDelta.y,
        z: cabinet.envelope.max.z + predictiveDelta.z,
      },
    } : undefined,
  };
}

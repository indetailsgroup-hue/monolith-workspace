/**
 * gizmoStability.ts - Gizmo Stability Utilities
 *
 * STABILITY PACK:
 * These utilities handle edge cases that cause erratic gizmo behavior:
 *
 * 1. AXIS SCREEN-SPACE FALLBACK
 *    When the constrained axis is nearly parallel to view direction,
 *    the ray-plane intersection becomes unstable. We detect this and
 *    switch to screen-space movement as fallback.
 *
 * 2. FLIP PREVENTION
 *    When mouse crosses the drag plane, the projected delta can flip
 *    sign unexpectedly. We detect sign changes and optionally clamp
 *    or smooth them.
 *
 * 3. DEADZONE FILTERING
 *    Very small movements (< 0.1mm) are filtered to prevent jitter.
 *
 * 4. VELOCITY LIMITING
 *    Maximum velocity is capped to prevent explosion on bad frames.
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// CONSTANTS
// ============================================

/** Minimum dot product between axis and view for stable drag */
export const MIN_AXIS_VIEW_DOT = 0.1;

/** Deadzone threshold in mm */
export const DEADZONE_MM = 0.1;

/** Maximum velocity in mm per frame */
export const MAX_VELOCITY_MM = 500;

/** Smoothing factor for delta changes (0-1) */
export const DELTA_SMOOTHING = 0.3;

// ============================================
// AXIS SCREEN-SPACE FALLBACK
// ============================================

/**
 * Check if axis is nearly parallel to view direction
 * When true, the ray-plane intersection is unstable
 *
 * @param axisUnit - The constrained axis (unit vector)
 * @param viewDir - Direction from camera to gizmo (unit vector)
 * @param threshold - Minimum dot product for stability (default 0.1)
 * @returns true if axis is unstable for this view
 */
export function isAxisUnstable(
  axisUnit: Vec3,
  viewDir: Vec3,
  threshold: number = MIN_AXIS_VIEW_DOT
): boolean {
  // When axis is perpendicular to view, their dot product is 0
  // When axis is parallel to view, dot product is ±1
  // We need the axis to be somewhat perpendicular to view for good intersection
  const dot = Math.abs(
    axisUnit.x * viewDir.x + axisUnit.y * viewDir.y + axisUnit.z * viewDir.z
  );

  // If dot is CLOSE TO 1, axis is parallel to view = bad for ray-plane
  // If dot is CLOSE TO 0, axis is perpendicular to view = good for ray-plane
  // So we want to check if the perpendicular component is small

  // Cross product magnitude = sin(angle) between vectors
  const crossMag = Math.sqrt(1 - dot * dot);

  // If crossMag is small, the axis is nearly aligned with view
  return crossMag < threshold;
}

/**
 * Calculate a fallback drag plane when axis is unstable
 * Uses the view plane (screen XY) as fallback
 *
 * @param viewDir - View direction (unit vector)
 * @param viewUp - View up vector (unit vector)
 * @returns A more stable drag plane normal
 */
export function getFallbackPlaneNormal(viewDir: Vec3, viewUp: Vec3): Vec3 {
  // Use view direction as plane normal (perpendicular to screen)
  // This gives screen-space XY movement
  return viewDir;
}

// ============================================
// FLIP PREVENTION
// ============================================

/**
 * Detect if delta has flipped sign compared to previous frame
 * This happens when mouse crosses the axis plane
 *
 * @param currentDelta - Current frame delta
 * @param previousDelta - Previous frame delta
 * @param axisUnit - The constrained axis
 * @returns true if delta flipped
 */
export function hasFlipped(
  currentDelta: Vec3,
  previousDelta: Vec3,
  axisUnit: Vec3
): boolean {
  // Project both deltas onto axis
  const currentProj =
    currentDelta.x * axisUnit.x +
    currentDelta.y * axisUnit.y +
    currentDelta.z * axisUnit.z;

  const previousProj =
    previousDelta.x * axisUnit.x +
    previousDelta.y * axisUnit.y +
    previousDelta.z * axisUnit.z;

  // Check for sign change (ignoring small values in deadzone)
  if (Math.abs(currentProj) < DEADZONE_MM || Math.abs(previousProj) < DEADZONE_MM) {
    return false;
  }

  return Math.sign(currentProj) !== Math.sign(previousProj);
}

/**
 * Apply flip prevention by clamping to previous value
 *
 * @param currentDelta - Current frame delta
 * @param previousDelta - Previous frame delta
 * @param axisUnit - The constrained axis
 * @returns Corrected delta (either current or previous)
 */
export function preventFlip(
  currentDelta: Vec3,
  previousDelta: Vec3,
  axisUnit: Vec3
): Vec3 {
  if (hasFlipped(currentDelta, previousDelta, axisUnit)) {
    // Return previous delta to prevent jump
    return previousDelta;
  }
  return currentDelta;
}

// ============================================
// DEADZONE FILTERING
// ============================================

/**
 * Apply deadzone to filter tiny movements
 *
 * @param delta - Input delta
 * @param threshold - Deadzone threshold in mm
 * @returns Filtered delta (zero if below threshold)
 */
export function applyDeadzone(delta: Vec3, threshold: number = DEADZONE_MM): Vec3 {
  const magnitude = Math.sqrt(delta.x ** 2 + delta.y ** 2 + delta.z ** 2);

  if (magnitude < threshold) {
    return { x: 0, y: 0, z: 0 };
  }

  return delta;
}

// ============================================
// VELOCITY LIMITING
// ============================================

/**
 * Calculate velocity from delta and time
 *
 * @param delta - Movement delta in mm
 * @param dtMs - Time delta in milliseconds
 * @returns Velocity in mm/s
 */
export function calculateVelocity(delta: Vec3, dtMs: number): number {
  const magnitude = Math.sqrt(delta.x ** 2 + delta.y ** 2 + delta.z ** 2);
  return (magnitude / dtMs) * 1000; // Convert to mm/s
}

/**
 * Clamp delta to maximum velocity
 *
 * @param delta - Input delta in mm
 * @param dtMs - Time delta in milliseconds
 * @param maxVelocity - Maximum velocity in mm/s (default 500000)
 * @returns Clamped delta
 */
export function clampVelocity(
  delta: Vec3,
  dtMs: number,
  maxVelocity: number = MAX_VELOCITY_MM * 1000 // mm/s
): Vec3 {
  const velocity = calculateVelocity(delta, dtMs);

  if (velocity <= maxVelocity) {
    return delta;
  }

  // Scale down to max velocity
  const scale = maxVelocity / velocity;
  return {
    x: delta.x * scale,
    y: delta.y * scale,
    z: delta.z * scale,
  };
}

// ============================================
// DELTA SMOOTHING
// ============================================

/**
 * Apply exponential smoothing to delta
 *
 * @param currentDelta - Current frame delta
 * @param previousSmoothed - Previous smoothed delta
 * @param factor - Smoothing factor (0 = full previous, 1 = full current)
 * @returns Smoothed delta
 */
export function smoothDelta(
  currentDelta: Vec3,
  previousSmoothed: Vec3,
  factor: number = DELTA_SMOOTHING
): Vec3 {
  const inv = 1 - factor;
  return {
    x: currentDelta.x * factor + previousSmoothed.x * inv,
    y: currentDelta.y * factor + previousSmoothed.y * inv,
    z: currentDelta.z * factor + previousSmoothed.z * inv,
  };
}

// ============================================
// COMBINED STABILITY FILTER
// ============================================

export interface StabilityFilterState {
  previousDelta: Vec3;
  previousSmoothedDelta: Vec3;
  lastUpdateTime: number;
}

export function createStabilityFilterState(): StabilityFilterState {
  return {
    previousDelta: { x: 0, y: 0, z: 0 },
    previousSmoothedDelta: { x: 0, y: 0, z: 0 },
    lastUpdateTime: performance.now(),
  };
}

/**
 * Apply all stability filters to a delta
 *
 * @param rawDelta - Raw delta from drag calculation
 * @param axisUnit - Constrained axis (unit vector)
 * @param state - Filter state from previous frame
 * @param options - Filter options
 * @returns Filtered delta and updated state
 */
export function applyStabilityFilters(
  rawDelta: Vec3,
  axisUnit: Vec3,
  state: StabilityFilterState,
  options: {
    enableFlipPrevention?: boolean;
    enableDeadzone?: boolean;
    enableVelocityLimit?: boolean;
    enableSmoothing?: boolean;
    deadzoneThreshold?: number;
    maxVelocity?: number;
    smoothingFactor?: number;
  } = {}
): { delta: Vec3; state: StabilityFilterState } {
  const {
    enableFlipPrevention = true,
    enableDeadzone = true,
    enableVelocityLimit = true,
    enableSmoothing = false, // Disabled by default - adds latency
    deadzoneThreshold = DEADZONE_MM,
    maxVelocity = MAX_VELOCITY_MM * 1000,
    smoothingFactor = DELTA_SMOOTHING,
  } = options;

  let delta = rawDelta;
  const now = performance.now();
  const dtMs = Math.max(1, now - state.lastUpdateTime);

  // 1. Flip prevention
  if (enableFlipPrevention) {
    delta = preventFlip(delta, state.previousDelta, axisUnit);
  }

  // 2. Deadzone
  if (enableDeadzone) {
    delta = applyDeadzone(delta, deadzoneThreshold);
  }

  // 3. Velocity limiting
  if (enableVelocityLimit) {
    delta = clampVelocity(delta, dtMs, maxVelocity);
  }

  // 4. Smoothing (optional)
  if (enableSmoothing) {
    delta = smoothDelta(delta, state.previousSmoothedDelta, smoothingFactor);
  }

  // Update state
  const newState: StabilityFilterState = {
    previousDelta: rawDelta, // Store raw for flip detection
    previousSmoothedDelta: delta,
    lastUpdateTime: now,
  };

  return { delta, state: newState };
}

// ============================================
// AXIS STABILITY CHECKER
// ============================================

/**
 * Get stability status for current axis/view configuration
 *
 * @param axisUnit - Constrained axis
 * @param viewDir - View direction
 * @returns Object with stability info
 */
export function getAxisStability(
  axisUnit: Vec3,
  viewDir: Vec3
): {
  isUnstable: boolean;
  stabilityScore: number; // 0-1, higher = more stable
  recommendedFallback: boolean;
} {
  const dot = Math.abs(
    axisUnit.x * viewDir.x + axisUnit.y * viewDir.y + axisUnit.z * viewDir.z
  );

  // crossMag = sin(angle), higher = more perpendicular = more stable
  const crossMag = Math.sqrt(1 - dot * dot);

  return {
    isUnstable: crossMag < MIN_AXIS_VIEW_DOT,
    stabilityScore: crossMag,
    recommendedFallback: crossMag < MIN_AXIS_VIEW_DOT * 2, // Warn before unstable
  };
}

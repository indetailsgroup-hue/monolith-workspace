/**
 * translateAxisDrag.ts - Ray-Plane Intersection for Axis-Constrained Dragging
 *
 * ALGORITHM (Standard DCC approach):
 * 1. User starts drag on a gizmo axis (X, Y, or Z)
 * 2. Compute a drag plane that:
 *    - Is perpendicular to the axis (contains the axis)
 *    - Faces the camera (for intuitive screen-space dragging)
 * 3. Project mouse ray onto this plane
 * 4. Extract movement along the constrained axis
 *
 * PLANE NORMAL FORMULA:
 * n = normalize(cross(axis, cross(viewDir, axis)))
 * This creates a plane that contains the axis and faces the view
 *
 * STABILITY PACK:
 * - Fallback plane when ray ≈ parallel to primary plane
 * - lastHit preservation for smooth behavior when parallel
 * - signRef to prevent axis sign flip on camera angle changes
 *
 * This approach is DETERMINISTIC - output depends only on ray/plane/axis,
 * not on frame rate or other timing issues.
 */

import type { Vec3 } from '../types/SnapTypes';
import { add, sub, scale, dot, cross, normalize, len } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

/**
 * A ray from camera through mouse position
 */
export interface Ray {
  /** Ray origin (camera position) */
  origin: Vec3;
  /** Ray direction (normalized) */
  dir: Vec3;
}

/**
 * State maintained during an axis drag operation
 */
export interface AxisDragState {
  /** The constrained axis (world space unit vector) */
  axisWorld: Vec3;
  /** Plane normal for ray intersection */
  planeNormal: Vec3;
  /** A point on the plane (gizmo origin) */
  planePoint: Vec3;
  /** Ray-plane hit point at mouse down */
  startHit: Vec3;
  /** Original object position at drag start */
  startPosition: Vec3;

  // STABILITY PACK additions
  /** Sign reference to prevent flip (+1 or -1) */
  signRef: number;
  /** Last valid hit point (fallback when ray parallel) */
  lastHit: Vec3;
  /** Fallback plane normal (used when primary fails) */
  fallbackPlaneNormal: Vec3;
}

/**
 * Extended ray-plane intersection result
 */
export interface RayPlaneResult {
  /** Hit point, or null if parallel */
  hit: Vec3 | null;
  /** Denominator (dot of ray.dir and planeNormal) - useful for sign */
  denom: number;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Compute the optimal drag plane normal for an axis constraint
 *
 * The plane is perpendicular to the constrained axis AND faces the camera
 * Formula: n = normalize(cross(axis, cross(viewDir, axis)))
 *
 * @param axisWorldUnit - The constrained axis (unit vector)
 * @param viewDirUnit - Direction from camera to gizmo (unit vector)
 * @returns Plane normal (unit vector)
 */
export function computeAxisDragPlane(
  axisWorldUnit: Vec3,
  viewDirUnit: Vec3
): Vec3 {
  // cross(viewDir, axis) gives a vector perpendicular to both
  const c1 = cross(viewDirUnit, axisWorldUnit);

  // cross(axis, c1) gives the plane normal
  const n = cross(axisWorldUnit, c1);

  // Handle degenerate case (view aligned with axis)
  const length = len(n);
  if (length < 1e-6) {
    // Fallback: use a plane perpendicular to view
    return viewDirUnit;
  }

  return normalize(n);
}

/**
 * Compute a stable fallback plane normal when primary plane fails
 * Uses a helper vector that isn't parallel to the axis
 *
 * @param axisWorldUnit - The constrained axis
 * @returns Fallback plane normal
 */
export function computeFallbackPlaneNormal(axisWorldUnit: Vec3): Vec3 {
  const up1: Vec3 = { x: 0, y: 1, z: 0 };
  const up2: Vec3 = { x: 1, y: 0, z: 0 };

  // Pick helper that yields stronger cross magnitude
  const c1 = cross(axisWorldUnit, up1);
  const c2 = cross(axisWorldUnit, up2);
  const useHelper = len(c1) > len(c2) ? up1 : up2;

  // Normal must be perpendicular to axis
  return normalize(cross(axisWorldUnit, useHelper));
}

/**
 * Intersect a ray with a plane (extended version with denom)
 *
 * @param ray - The ray to test
 * @param planePoint - A point on the plane
 * @param planeNormal - The plane normal (unit vector)
 * @returns Object with hit point and denominator
 */
export function intersectRayPlaneEx(
  ray: Ray,
  planePoint: Vec3,
  planeNormal: Vec3
): RayPlaneResult {
  const denom = dot(ray.dir, planeNormal);

  // Ray is parallel to plane (or nearly so)
  if (Math.abs(denom) < 1e-7) {
    return { hit: null, denom };
  }

  // Calculate t parameter
  const toPlane = sub(planePoint, ray.origin);
  const t = dot(toPlane, planeNormal) / denom;

  // Ray goes away from plane (behind camera)
  if (t < 0) {
    return { hit: null, denom };
  }

  // Calculate intersection point
  const hit = add(ray.origin, scale(ray.dir, t));
  return { hit, denom };
}

/**
 * Intersect a ray with a plane (simple version for backwards compatibility)
 *
 * @param ray - The ray to test
 * @param planePoint - A point on the plane
 * @param planeNormal - The plane normal (unit vector)
 * @returns Intersection point, or null if ray is parallel to plane
 */
export function intersectRayPlane(
  ray: Ray,
  planePoint: Vec3,
  planeNormal: Vec3
): Vec3 | null {
  return intersectRayPlaneEx(ray, planePoint, planeNormal).hit;
}

/**
 * Begin an axis-constrained drag operation
 *
 * STABILITY: Tries primary plane first, then fallback if ray is parallel.
 * Stores signRef to prevent axis sign flip during drag.
 *
 * @param args.ray - Current mouse ray
 * @param args.gizmoOrigin - Position of the gizmo (object center)
 * @param args.axisWorldUnit - The constrained axis (unit vector in world space)
 * @param args.viewDirUnit - Direction from camera to gizmo (unit vector)
 * @param args.startPosition - Object's current position
 * @returns Drag state, or null if ray doesn't intersect any plane
 */
export function beginAxisDrag(args: {
  ray: Ray;
  gizmoOrigin: Vec3;
  axisWorldUnit: Vec3;
  viewDirUnit: Vec3;
  startPosition: Vec3;
}): AxisDragState | null {
  const axis = args.axisWorldUnit;

  // Compute primary plane normal (view-facing)
  const primaryNormal = computeAxisDragPlane(axis, args.viewDirUnit);

  // Compute fallback plane normal (stable alternative)
  const fallbackNormal = computeFallbackPlaneNormal(axis);

  // Try primary plane first
  let result = intersectRayPlaneEx(args.ray, args.gizmoOrigin, primaryNormal);
  let planeNormal = primaryNormal;

  // If primary fails, try fallback
  if (!result.hit) {
    result = intersectRayPlaneEx(args.ray, args.gizmoOrigin, fallbackNormal);
    planeNormal = fallbackNormal;
  }

  // If both fail, cannot start drag
  if (!result.hit) {
    return null;
  }

  // signRef: tie sign to initial denom to prevent flip during drag
  // This ensures consistent direction regardless of camera movement
  const signRef = result.denom >= 0 ? 1 : -1;

  return {
    axisWorld: axis,
    planeNormal,
    planePoint: args.gizmoOrigin,
    startHit: result.hit,
    startPosition: args.startPosition,
    // Stability additions
    signRef,
    lastHit: result.hit,
    fallbackPlaneNormal: fallbackNormal,
  };
}

/**
 * Update an axis drag operation with new mouse position
 *
 * STABILITY:
 * - Falls back to lastHit if ray is parallel to plane
 * - Uses signRef to prevent axis sign flip
 *
 * @param state - Current drag state (will be mutated with lastHit)
 * @param ray - New mouse ray
 * @returns Delta vector along the constrained axis (in world space), or null if catastrophic failure
 */
export function updateAxisDrag(state: AxisDragState, ray: Ray): Vec3 | null {
  // Try primary plane
  let result = intersectRayPlaneEx(ray, state.planePoint, state.planeNormal);

  // If parallel, try fallback plane
  if (!result.hit) {
    result = intersectRayPlaneEx(ray, state.planePoint, state.fallbackPlaneNormal);
  }

  // If still no hit, use lastHit for smooth behavior (no jumping)
  let hit: Vec3;
  if (!result.hit) {
    hit = state.lastHit;
  } else {
    hit = result.hit;
    // Update lastHit for next frame
    state.lastHit = hit;
  }

  // Raw delta from start hit to current hit
  const rawDelta = sub(hit, state.startHit);

  // Project onto constrained axis
  const rawDist = dot(rawDelta, state.axisWorld);

  // Apply signRef to prevent flip
  // The sign should stay consistent with the initial camera orientation
  const dist = state.signRef * Math.abs(rawDist) * Math.sign(rawDist * state.signRef || 1);

  // Return delta along axis only
  return scale(state.axisWorld, dist);
}

/**
 * Update axis drag with stability options
 *
 * @param state - Current drag state
 * @param ray - New mouse ray
 * @param options - Stability options
 * @returns Delta vector with stability applied
 */
export function updateAxisDragStable(
  state: AxisDragState,
  ray: Ray,
  options: {
    /** Enable sign flip prevention (default true) */
    preventFlip?: boolean;
    /** Apply deadzone filter in mm (default 0) */
    deadzoneMm?: number;
    /** Maximum delta magnitude per frame in mm (default Infinity) */
    maxDeltaMm?: number;
  } = {}
): Vec3 | null {
  const {
    preventFlip = true,
    deadzoneMm = 0,
    maxDeltaMm = Infinity,
  } = options;

  // Try primary plane
  let result = intersectRayPlaneEx(ray, state.planePoint, state.planeNormal);

  // If parallel, try fallback plane
  if (!result.hit) {
    result = intersectRayPlaneEx(ray, state.planePoint, state.fallbackPlaneNormal);
  }

  // If still no hit, use lastHit
  let hit: Vec3;
  if (!result.hit) {
    hit = state.lastHit;
  } else {
    hit = result.hit;
    state.lastHit = hit;
  }

  // Raw delta from start hit to current hit
  const rawDelta = sub(hit, state.startHit);

  // Project onto constrained axis
  let dist = dot(rawDelta, state.axisWorld);

  // Apply sign flip prevention
  if (preventFlip) {
    dist = state.signRef * Math.abs(dist) * Math.sign(dist * state.signRef || 1);
  }

  // Apply deadzone
  if (deadzoneMm > 0 && Math.abs(dist) < deadzoneMm) {
    dist = 0;
  }

  // Apply max delta limit
  if (Math.abs(dist) > maxDeltaMm) {
    dist = Math.sign(dist) * maxDeltaMm;
  }

  return scale(state.axisWorld, dist);
}

/**
 * Calculate new position from drag state and current ray
 *
 * @param state - Current drag state
 * @param ray - New mouse ray
 * @returns New position for the object, or null if no valid intersection
 */
export function calculateDragPosition(state: AxisDragState, ray: Ray): Vec3 | null {
  const delta = updateAxisDrag(state, ray);
  if (!delta) return null;

  return add(state.startPosition, delta);
}

// ============================================
// UTILITIES
// ============================================

/**
 * Create a ray from camera position through a screen point
 * This is a helper for creating the ray from Three.js camera/raycaster
 *
 * @param camera - Camera position
 * @param target - Point on the near plane (from raycaster)
 * @returns Ray from camera through target
 */
export function createRayFromCamera(camera: Vec3, target: Vec3): Ray {
  const dir = sub(target, camera);
  return {
    origin: camera,
    dir: normalize(dir),
  };
}

/**
 * Get the view direction from camera to a point
 *
 * @param cameraPos - Camera position
 * @param targetPos - Target point (usually gizmo origin)
 * @returns Normalized direction vector
 */
export function getViewDirection(cameraPos: Vec3, targetPos: Vec3): Vec3 {
  return normalize(sub(targetPos, cameraPos));
}

/**
 * Quantize a delta along an axis to a step size
 *
 * @param delta - Delta vector (should be along a single axis)
 * @param axisUnit - The axis unit vector
 * @param stepMm - Step size in mm
 * @returns Quantized delta vector
 */
export function quantizeDeltaAlongAxis(
  delta: Vec3,
  axisUnit: Vec3,
  stepMm: number
): Vec3 {
  const dist = dot(delta, axisUnit);
  const quantized = Math.round(dist / stepMm) * stepMm;
  return scale(axisUnit, quantized);
}

/**
 * Apply fine movement factor to a delta
 *
 * @param delta - Delta vector
 * @param factor - Factor to apply (e.g., 0.1 for 10%)
 * @param enabled - Whether fine mode is active
 * @returns Scaled delta vector
 */
export function applyFineFactor(
  delta: Vec3,
  factor: number,
  enabled: boolean
): Vec3 {
  if (!enabled) return delta;
  return scale(delta, factor);
}

/**
 * Apply deadzone to filter tiny movements
 *
 * @param delta - Input delta
 * @param thresholdMm - Deadzone threshold in mm
 * @returns Filtered delta (zero if below threshold)
 */
export function applyDeadzone(delta: Vec3, thresholdMm: number): Vec3 {
  const magnitude = len(delta);
  if (magnitude < thresholdMm) {
    return { x: 0, y: 0, z: 0 };
  }
  return delta;
}

/**
 * Clamp delta magnitude to a maximum value
 *
 * @param delta - Input delta
 * @param maxMm - Maximum magnitude in mm
 * @returns Clamped delta
 */
export function clampDeltaMagnitude(delta: Vec3, maxMm: number): Vec3 {
  const magnitude = len(delta);
  if (magnitude <= maxMm) {
    return delta;
  }
  return scale(normalize(delta), maxMm);
}

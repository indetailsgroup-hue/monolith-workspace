/**
 * translatePlaneDrag.ts - Ray-Plane Intersection for Plane-Constrained Dragging
 *
 * ALGORITHM:
 * 1. User starts drag on a plane handle (XY, XZ, or YZ square)
 * 2. Ray intersects the constraint plane directly
 * 3. Delta is computed in 2D on the plane, mapped to 3D world space
 *
 * Unlike axis drag (1D constraint), plane drag allows 2D movement:
 * - XY plane: free movement in X and Y, Z locked
 * - XZ plane: free movement in X and Z, Y locked
 * - YZ plane: free movement in Y and Z, X locked
 *
 * STABILITY:
 * - lastHit preservation for smooth behavior when ray grazes plane
 * - signRef per-axis to prevent flip on camera angle changes
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoPlane } from './gizmoTypes';
import { add, sub, scale, dot, normalize, len } from '../math/vec3Utils';
import type { Ray } from './translateAxisDrag';

// ============================================
// TYPES
// ============================================

/**
 * 2D delta on a constraint plane
 */
export interface PlaneDelta2D {
  /** Delta along first axis (e.g., X for XY plane) */
  u: number;
  /** Delta along second axis (e.g., Y for XY plane) */
  v: number;
}

/**
 * Axis lock within plane (when Shift held)
 */
export type PlaneAxisLock = 'U' | 'V' | null;

/**
 * State maintained during a plane drag operation
 */
export interface PlaneDragState {
  /** The constraint plane (XY, XZ, YZ) */
  plane: GizmoPlane;
  /** Plane normal (unit vector) */
  planeNormal: Vec3;
  /** A point on the plane (gizmo origin) */
  planePoint: Vec3;
  /** First basis axis (unit vector in world space) */
  basisU: Vec3;
  /** Second basis axis (unit vector in world space) */
  basisV: Vec3;
  /** Ray-plane hit point at mouse down */
  startHit: Vec3;
  /** Original object position at drag start */
  startPosition: Vec3;

  // STABILITY additions
  /** Sign references to prevent flip (+1 or -1 per axis) */
  signRefU: number;
  signRefV: number;
  /** Last valid hit point (fallback when ray parallel) */
  lastHit: Vec3;

  // CONSTRAINT additions (Shift = lock to U or V)
  /** Locked axis within plane (U or V), null = free movement */
  locked: PlaneAxisLock;
}

/**
 * Result of a plane drag update
 */
export interface PlaneDragResult {
  /** Delta vector in world space */
  deltaWorld: Vec3;
  /** Delta in plane's 2D coordinate system (mm) */
  delta2D: PlaneDelta2D;
  /** Whether lastHit fallback was used */
  usedFallback: boolean;
}

// ============================================
// PLANE BASIS
// ============================================

/**
 * Get the normal vector for a constraint plane
 */
export function getPlaneNormal(plane: GizmoPlane): Vec3 {
  switch (plane) {
    case 'XY':
      return { x: 0, y: 0, z: 1 }; // Z-up
    case 'XZ':
      return { x: 0, y: 1, z: 0 }; // Y-up
    case 'YZ':
      return { x: 1, y: 0, z: 0 }; // X-right
  }
}

/**
 * Get the basis vectors for a constraint plane
 * Returns U (first axis) and V (second axis) in world space
 */
export function getPlaneBasis(plane: GizmoPlane): { u: Vec3; v: Vec3 } {
  switch (plane) {
    case 'XY':
      return {
        u: { x: 1, y: 0, z: 0 }, // X
        v: { x: 0, y: 1, z: 0 }, // Y
      };
    case 'XZ':
      return {
        u: { x: 1, y: 0, z: 0 }, // X
        v: { x: 0, y: 0, z: 1 }, // Z
      };
    case 'YZ':
      return {
        u: { x: 0, y: 1, z: 0 }, // Y
        v: { x: 0, y: 0, z: 1 }, // Z
      };
  }
}

/**
 * Get plane basis in LOCAL space (rotated by object)
 * @param plane - Constraint plane
 * @param localAxes - Object's local X, Y, Z axes in world space
 */
export function getPlaneBasisLocal(
  plane: GizmoPlane,
  localAxes: { X: Vec3; Y: Vec3; Z: Vec3 }
): { u: Vec3; v: Vec3; normal: Vec3 } {
  switch (plane) {
    case 'XY':
      return {
        u: localAxes.X,
        v: localAxes.Y,
        normal: localAxes.Z,
      };
    case 'XZ':
      return {
        u: localAxes.X,
        v: localAxes.Z,
        normal: localAxes.Y,
      };
    case 'YZ':
      return {
        u: localAxes.Y,
        v: localAxes.Z,
        normal: localAxes.X,
      };
  }
}

// ============================================
// RAY-PLANE INTERSECTION
// ============================================

/**
 * Intersect ray with plane, returning hit point and denom
 */
function intersectRayPlane(
  ray: Ray,
  planePoint: Vec3,
  planeNormal: Vec3
): { hit: Vec3 | null; denom: number } {
  const denom = dot(ray.dir, planeNormal);

  // Ray is parallel to plane
  if (Math.abs(denom) < 1e-7) {
    return { hit: null, denom };
  }

  const toPlane = sub(planePoint, ray.origin);
  const t = dot(toPlane, planeNormal) / denom;

  // Behind camera
  if (t < 0) {
    return { hit: null, denom };
  }

  const hit = add(ray.origin, scale(ray.dir, t));
  return { hit, denom };
}

// ============================================
// PLANE DRAG OPERATIONS
// ============================================

/**
 * Begin a plane-constrained drag operation
 *
 * @param args.ray - Current mouse ray
 * @param args.gizmoOrigin - Position of the gizmo (object center)
 * @param args.plane - The constraint plane (XY, XZ, YZ)
 * @param args.startPosition - Object's current position
 * @param args.localAxes - Optional local axes for LOCAL space mode
 * @returns Drag state, or null if ray doesn't intersect plane
 */
export function beginPlaneDrag(args: {
  ray: Ray;
  gizmoOrigin: Vec3;
  plane: GizmoPlane;
  startPosition: Vec3;
  localAxes?: { X: Vec3; Y: Vec3; Z: Vec3 };
}): PlaneDragState | null {
  const { ray, gizmoOrigin, plane, startPosition, localAxes } = args;

  // Get basis and normal
  let basisU: Vec3, basisV: Vec3, planeNormal: Vec3;

  if (localAxes) {
    const local = getPlaneBasisLocal(plane, localAxes);
    basisU = local.u;
    basisV = local.v;
    planeNormal = local.normal;
  } else {
    const basis = getPlaneBasis(plane);
    basisU = basis.u;
    basisV = basis.v;
    planeNormal = getPlaneNormal(plane);
  }

  // Intersect ray with plane
  const result = intersectRayPlane(ray, gizmoOrigin, planeNormal);

  if (!result.hit) {
    return null;
  }

  // Compute initial delta for signRef
  const startDelta = sub(result.hit, gizmoOrigin);
  const startU = dot(startDelta, basisU);
  const startV = dot(startDelta, basisV);

  return {
    plane,
    planeNormal,
    planePoint: gizmoOrigin,
    basisU,
    basisV,
    startHit: result.hit,
    startPosition,
    // Sign refs: use initial dot products to determine reference sign
    signRefU: startU >= 0 ? 1 : -1,
    signRefV: startV >= 0 ? 1 : -1,
    lastHit: result.hit,
    // Constraint: no lock by default, set when Shift held
    locked: null,
  };
}

/**
 * Update a plane drag operation with new mouse position
 *
 * @param state - Current drag state (will be mutated with lastHit)
 * @param ray - New mouse ray
 * @returns Delta in world space and 2D plane coordinates
 */
export function updatePlaneDrag(
  state: PlaneDragState,
  ray: Ray
): PlaneDragResult {
  // Try to intersect with plane
  const result = intersectRayPlane(ray, state.planePoint, state.planeNormal);

  let hit: Vec3;
  let usedFallback = false;

  if (!result.hit) {
    // Use lastHit for smooth behavior
    hit = state.lastHit;
    usedFallback = true;
  } else {
    hit = result.hit;
    state.lastHit = hit;
  }

  // Raw delta from start hit to current hit
  const rawDelta = sub(hit, state.startHit);

  // Project onto plane basis
  const deltaU = dot(rawDelta, state.basisU);
  const deltaV = dot(rawDelta, state.basisV);

  // Reconstruct world delta from basis components
  const deltaWorld = add(
    scale(state.basisU, deltaU),
    scale(state.basisV, deltaV)
  );

  return {
    deltaWorld,
    delta2D: { u: deltaU, v: deltaV },
    usedFallback,
  };
}

/**
 * Update plane drag with stability options
 */
export function updatePlaneDragStable(
  state: PlaneDragState,
  ray: Ray,
  options: {
    /** Apply deadzone filter in mm (default 0) */
    deadzoneMm?: number;
    /** Maximum delta magnitude per frame in mm (default Infinity) */
    maxDeltaMm?: number;
  } = {}
): PlaneDragResult {
  const { deadzoneMm = 0, maxDeltaMm = Infinity } = options;

  const result = updatePlaneDrag(state, ray);

  // Apply deadzone
  if (deadzoneMm > 0) {
    const mag = len(result.deltaWorld);
    if (mag < deadzoneMm) {
      return {
        deltaWorld: { x: 0, y: 0, z: 0 },
        delta2D: { u: 0, v: 0 },
        usedFallback: result.usedFallback,
      };
    }
  }

  // Apply max delta limit
  if (maxDeltaMm < Infinity) {
    const mag = len(result.deltaWorld);
    if (mag > maxDeltaMm) {
      const scaled = scale(normalize(result.deltaWorld), maxDeltaMm);
      const scaleFactor = maxDeltaMm / mag;
      return {
        deltaWorld: scaled,
        delta2D: {
          u: result.delta2D.u * scaleFactor,
          v: result.delta2D.v * scaleFactor,
        },
        usedFallback: result.usedFallback,
      };
    }
  }

  return result;
}

/**
 * Calculate new position from plane drag state and current ray
 */
export function calculatePlaneDragPosition(
  state: PlaneDragState,
  ray: Ray
): Vec3 {
  const { deltaWorld } = updatePlaneDrag(state, ray);
  return add(state.startPosition, deltaWorld);
}

// ============================================
// QUANTIZATION (Step Snap)
// ============================================

/**
 * Quantize a 2D plane delta to step size
 */
export function quantizePlaneDelta2D(
  delta2D: PlaneDelta2D,
  stepMm: number
): PlaneDelta2D {
  return {
    u: Math.round(delta2D.u / stepMm) * stepMm,
    v: Math.round(delta2D.v / stepMm) * stepMm,
  };
}

/**
 * Convert quantized 2D delta back to world space
 */
export function planeDelta2DToWorld(
  delta2D: PlaneDelta2D,
  basisU: Vec3,
  basisV: Vec3
): Vec3 {
  return add(scale(basisU, delta2D.u), scale(basisV, delta2D.v));
}

/**
 * Quantize plane drag result to step size
 */
export function quantizePlaneDragResult(
  result: PlaneDragResult,
  state: PlaneDragState,
  stepMm: number
): PlaneDragResult {
  const quantized2D = quantizePlaneDelta2D(result.delta2D, stepMm);
  const quantizedWorld = planeDelta2DToWorld(
    quantized2D,
    state.basisU,
    state.basisV
  );

  return {
    deltaWorld: quantizedWorld,
    delta2D: quantized2D,
    usedFallback: result.usedFallback,
  };
}

// ============================================
// UTILITIES
// ============================================

/**
 * Get the axis labels for a plane
 */
export function getPlaneAxisLabels(plane: GizmoPlane): { u: string; v: string } {
  switch (plane) {
    case 'XY':
      return { u: 'X', v: 'Y' };
    case 'XZ':
      return { u: 'X', v: 'Z' };
    case 'YZ':
      return { u: 'Y', v: 'Z' };
  }
}

/**
 * Get the locked axis for a plane
 */
export function getPlaneLockedAxis(plane: GizmoPlane): 'X' | 'Y' | 'Z' {
  switch (plane) {
    case 'XY':
      return 'Z';
    case 'XZ':
      return 'Y';
    case 'YZ':
      return 'X';
  }
}

/**
 * Apply fine movement factor to plane delta
 */
export function applyPlaneFine(
  delta2D: PlaneDelta2D,
  factor: number,
  enabled: boolean
): PlaneDelta2D {
  if (!enabled) return delta2D;
  return {
    u: delta2D.u * factor,
    v: delta2D.v * factor,
  };
}

// ============================================
// AXIS LOCK WITHIN PLANE (Shift constraint)
// ============================================

/**
 * Lock delta to a single axis within the plane
 *
 * When Shift is held during plane drag, movement is constrained to
 * either the U or V axis based on the dominant movement direction.
 * Once locked, the lock persists until Shift is released.
 *
 * @param args.delta2D - Raw 2D delta on plane
 * @param args.state - Plane drag state (will be mutated to set/clear lock)
 * @param args.constrain - Whether constraint is active (Shift held)
 * @returns Constrained delta2D (only U or V component)
 */
export function lockDeltaToAxis(args: {
  delta2D: PlaneDelta2D;
  state: PlaneDragState;
  constrain: boolean;
}): PlaneDelta2D {
  const { delta2D, state, constrain } = args;

  // If constraint not active, release lock and return original
  if (!constrain) {
    state.locked = null;
    return delta2D;
  }

  // If not locked yet, choose dominant axis and lock it
  if (!state.locked) {
    state.locked = Math.abs(delta2D.u) >= Math.abs(delta2D.v) ? 'U' : 'V';
  }

  // Apply lock - zero out the non-locked axis
  if (state.locked === 'U') {
    return { u: delta2D.u, v: 0 };
  } else {
    return { u: 0, v: delta2D.v };
  }
}

/**
 * Get the current lock state label for display
 */
export function getLockLabel(state: PlaneDragState, plane: GizmoPlane): string | null {
  if (!state.locked) return null;

  const labels = getPlaneAxisLabels(plane);
  return state.locked === 'U' ? labels.u : labels.v;
}

/**
 * Check if plane drag is currently locked to an axis
 */
export function isPlaneAxisLocked(state: PlaneDragState): boolean {
  return state.locked !== null;
}

/**
 * Manually set or clear the axis lock
 */
export function setPlaneAxisLock(state: PlaneDragState, lock: PlaneAxisLock): void {
  state.locked = lock;
}

/**
 * Update plane drag with axis constraint support
 *
 * Combines ray update + axis locking in one call for convenience.
 *
 * @param state - Current drag state
 * @param ray - New mouse ray
 * @param constrain - Whether to constrain to single axis (Shift held)
 * @returns Result with constrained delta
 */
export function updatePlaneDragConstrained(
  state: PlaneDragState,
  ray: Ray,
  constrain: boolean
): PlaneDragResult {
  // Get raw delta
  const result = updatePlaneDrag(state, ray);

  // Apply axis lock if constrain is active
  const constrainedDelta2D = lockDeltaToAxis({
    delta2D: result.delta2D,
    state,
    constrain,
  });

  // Reconstruct world delta from constrained 2D
  const constrainedWorld = planeDelta2DToWorld(
    constrainedDelta2D,
    state.basisU,
    state.basisV
  );

  return {
    deltaWorld: constrainedWorld,
    delta2D: constrainedDelta2D,
    usedFallback: result.usedFallback,
  };
}

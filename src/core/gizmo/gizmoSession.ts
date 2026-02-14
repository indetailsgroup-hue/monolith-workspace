/**
 * gizmoSession.ts - Gizmo State Machine
 *
 * ARCHITECTURE:
 * This manages the complete lifecycle of a gizmo drag operation:
 * 1. IDLE -> User clicks on gizmo handle (axis or plane)
 * 2. DRAGGING -> User moves mouse, we compute deltas
 * 3. COMMITTED -> User releases mouse, final position applied
 *
 * HANDLE TYPES:
 * - AXIS: Constrained to single axis (X, Y, or Z)
 * - PLANE: Constrained to plane (XY, XZ, or YZ)
 *
 * INTEGRATION WITH SNAP SYSTEM:
 * - Gizmo provides `freeDeltaWorld` (raw delta along axis/plane)
 * - Snap system can modify this with snap offsets
 * - Final position = startPosition + freeDeltaWorld + snapDelta
 *
 * STATE MACHINE:
 * idle -> (mousedown on handle) -> dragging -> (mouseup) -> idle
 *                                     |
 *                                     v
 *                              (outputs freeDeltaWorld)
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoAxis, GizmoSettings, GizmoSpace, GizmoPlane, GizmoPlaneMode, GizmoHandle } from './gizmoTypes';
import { getPlaneMode, isPlaneHandle } from './gizmoTypes';
import type { LocalAxes } from './gizmoAxis';
import type { Ray, AxisDragState } from './translateAxisDrag';
import type { PlaneDragState, PlaneDelta2D } from './translatePlaneDrag';
import {
  beginAxisDrag,
  updateAxisDrag,
  quantizeDeltaAlongAxis,
  applyFineFactor,
} from './translateAxisDrag';
import {
  beginPlaneDrag,
  updatePlaneDrag,
  quantizePlaneDelta2D,
  planeDelta2DToWorld,
  applyPlaneFine,
  lockDeltaToAxis,
} from './translatePlaneDrag';
import { getAxisUnit, IDENTITY_LOCAL_AXES } from './gizmoAxis';
import { add, scale, len } from '../math/vec3Utils';

// ============================================
// TYPES
// ============================================

export type GizmoPhase = 'idle' | 'dragging';

/** Type of handle being dragged */
export type GizmoDragKind = 'axis' | 'plane';

/**
 * Complete state for a gizmo session
 */
export interface GizmoSession {
  /** Current phase of the gizmo operation */
  phase: GizmoPhase;

  /** Gizmo settings (space, step, fine factor) */
  settings: GizmoSettings;

  /** Currently active handle (null = none selected) */
  activeHandle: GizmoHandle | null;

  /** Currently active axis constraint (null = none or plane) - for backwards compat */
  activeAxis: GizmoAxis;

  /** Currently active plane constraint (null = none or axis) */
  activePlane: GizmoPlane | null;

  /** Plane movement mode: CENTER (free), U (constrained), V (constrained) */
  planeMode: GizmoPlaneMode | null;

  /** Kind of drag: 'axis' or 'plane' */
  dragKind: GizmoDragKind | null;

  /** Internal axis drag state (only valid when dragging axis) */
  axisDragState: AxisDragState | null;

  /** Internal plane drag state (only valid when dragging plane) */
  planeDragState: PlaneDragState | null;

  /** Object's position at drag start (mm) */
  startPosition: Vec3;

  /** Current free delta (before snap adjustment) */
  freeDeltaWorld: Vec3;

  /** Plane delta in 2D (only valid when dragging plane) */
  planeDelta2D: PlaneDelta2D | null;

  /** Preview position (startPosition + freeDeltaWorld) */
  previewPosition: Vec3;

  // Legacy alias for backwards compatibility
  /** @deprecated Use axisDragState instead */
  dragState: AxisDragState | null;
}

/**
 * Context needed to begin a drag
 */
export interface GizmoDragContext {
  /** Position of the gizmo/object in world space (mm) */
  gizmoOrigin: Vec3;
  /** Direction from camera to gizmo (unit vector) */
  viewDirUnit: Vec3;
  /** Object's local axes (from rotation) */
  localAxes: LocalAxes;
}

/**
 * Input for updating a drag
 */
export interface GizmoDragInput {
  /** Current mouse ray */
  ray: Ray;
  /** Is Shift key held (fine mode for axis, constrain for plane) */
  isFine: boolean;
  /** Is Ctrl key held (step mode) */
  isStep: boolean;
  /** Override step size (null = use settings) */
  stepMmOverride?: number;
  /**
   * Is Alt key held (fine mode for plane drag)
   * Policy: Shift = constrain (plane) OR fine (axis)
   *         Alt = fine (plane only)
   */
  isAlt?: boolean;
}

// ============================================
// FACTORY
// ============================================

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Create a new gizmo session with default state
 */
export function createGizmoSession(
  settings: GizmoSettings,
  initialPosition: Vec3 = ZERO_VEC
): GizmoSession {
  return {
    phase: 'idle',
    settings,
    activeHandle: null,
    activeAxis: null,
    activePlane: null,
    planeMode: null,
    dragKind: null,
    axisDragState: null,
    planeDragState: null,
    startPosition: initialPosition,
    freeDeltaWorld: ZERO_VEC,
    planeDelta2D: null,
    previewPosition: initialPosition,
    // Legacy alias
    dragState: null,
  };
}

// ============================================
// STATE TRANSITIONS
// ============================================

/**
 * Begin an axis-constrained drag operation
 *
 * @param session - Current session state
 * @param axis - Which axis to constrain to
 * @param ray - Initial mouse ray
 * @param ctx - Drag context (gizmo position, view direction, local axes)
 * @returns Updated session in 'dragging' phase, or unchanged if failed
 */
export function beginGizmoDrag(
  session: GizmoSession,
  axis: GizmoAxis,
  ray: Ray,
  ctx: GizmoDragContext
): GizmoSession {
  if (axis === null) {
    console.warn('[Gizmo] Cannot begin drag without axis constraint');
    return session;
  }

  // Get the axis unit vector based on space setting
  const axisWorldUnit = getAxisUnit(axis, session.settings.space, ctx.localAxes);
  if (!axisWorldUnit) {
    console.warn('[Gizmo] Failed to get axis unit vector');
    return session;
  }

  // Create drag state
  const axisDragState = beginAxisDrag({
    ray,
    gizmoOrigin: ctx.gizmoOrigin,
    axisWorldUnit,
    viewDirUnit: ctx.viewDirUnit,
    startPosition: ctx.gizmoOrigin,
  });

  if (!axisDragState) {
    console.warn('[Gizmo] Failed to begin axis drag (ray parallel to plane?)');
    return session;
  }

  console.log('[Gizmo] Drag started on axis:', axis, 'space:', session.settings.space);

  return {
    ...session,
    phase: 'dragging',
    activeHandle: { kind: 'AXIS', axis },
    activeAxis: axis,
    activePlane: null,
    planeMode: null,
    dragKind: 'axis',
    axisDragState,
    planeDragState: null,
    startPosition: ctx.gizmoOrigin,
    freeDeltaWorld: ZERO_VEC,
    planeDelta2D: null,
    previewPosition: ctx.gizmoOrigin,
    // Legacy alias
    dragState: axisDragState,
  };
}

/**
 * Begin a plane-constrained drag operation
 *
 * @param session - Current session state
 * @param plane - Which plane to constrain to (XY, XZ, YZ)
 * @param ray - Initial mouse ray
 * @param ctx - Drag context (gizmo position, view direction, local axes)
 * @param mode - Plane movement mode: CENTER (free), U (constrained), V (constrained)
 * @param handleKind - Handle kind for activeHandle (default: 'PLANE')
 * @returns Updated session in 'dragging' phase, or unchanged if failed
 */
export function beginGizmoPlainDrag(
  session: GizmoSession,
  plane: GizmoPlane,
  ray: Ray,
  ctx: GizmoDragContext,
  mode: GizmoPlaneMode = 'CENTER',
  handleKind: 'PLANE' | 'PLANE_CENTER' | 'PLANE_U' | 'PLANE_V' = 'PLANE'
): GizmoSession {
  // Get local axes for LOCAL space mode
  const localAxes = session.settings.space === 'LOCAL'
    ? { X: ctx.localAxes.axisX, Y: ctx.localAxes.axisY, Z: ctx.localAxes.axisZ }
    : undefined;

  // Create plane drag state
  const planeDragState = beginPlaneDrag({
    ray,
    gizmoOrigin: ctx.gizmoOrigin,
    plane,
    startPosition: ctx.gizmoOrigin,
    localAxes,
  });

  if (!planeDragState) {
    console.warn('[Gizmo] Failed to begin plane drag (ray parallel to plane?)');
    return session;
  }

  console.log('[Gizmo] Drag started on plane:', plane, 'mode:', mode, 'space:', session.settings.space);

  return {
    ...session,
    phase: 'dragging',
    activeHandle: { kind: handleKind, plane },
    activeAxis: null,
    activePlane: plane,
    planeMode: mode,
    dragKind: 'plane',
    axisDragState: null,
    planeDragState,
    startPosition: ctx.gizmoOrigin,
    freeDeltaWorld: ZERO_VEC,
    planeDelta2D: { u: 0, v: 0 },
    previewPosition: ctx.gizmoOrigin,
    // Legacy alias
    dragState: null,
  };
}

/**
 * Begin a drag operation with a unified handle (axis or plane)
 */
export function beginGizmoHandleDrag(
  session: GizmoSession,
  handle: GizmoHandle,
  ray: Ray,
  ctx: GizmoDragContext
): GizmoSession {
  if (handle.kind === 'AXIS') {
    return beginGizmoDrag(session, handle.axis, ray, ctx);
  }

  // All plane handle types
  if (isPlaneHandle(handle)) {
    const mode = getPlaneMode(handle) ?? 'CENTER';
    const handleKind = handle.kind as 'PLANE' | 'PLANE_CENTER' | 'PLANE_U' | 'PLANE_V';
    return beginGizmoPlainDrag(session, handle.plane, ray, ctx, mode, handleKind);
  }

  // Fallback for legacy PLANE
  return beginGizmoPlainDrag(session, (handle as any).plane, ray, ctx);
}

/**
 * Update an ongoing drag operation
 *
 * @param session - Current session state
 * @param input - Drag input (ray, modifiers)
 * @returns Updated session with new freeDeltaWorld and previewPosition
 */
export function updateGizmoDrag(
  session: GizmoSession,
  input: GizmoDragInput
): GizmoSession {
  // Only process in dragging phase
  if (session.phase !== 'dragging') {
    return session;
  }

  // Route to appropriate update based on drag kind
  if (session.dragKind === 'axis' && session.axisDragState) {
    return updateAxisDragSession(session, input);
  } else if (session.dragKind === 'plane' && session.planeDragState) {
    return updatePlaneDragSession(session, input);
  }

  // Legacy fallback for dragState
  if (session.dragState) {
    return updateAxisDragSession(session, input);
  }

  return session;
}

/**
 * Update an axis drag session
 */
function updateAxisDragSession(
  session: GizmoSession,
  input: GizmoDragInput
): GizmoSession {
  const dragState = session.axisDragState ?? session.dragState;
  if (!dragState) return session;

  // Get raw delta from axis drag
  let delta = updateAxisDrag(dragState, input.ray);
  if (!delta) {
    // Ray doesn't intersect plane - keep last known position
    return session;
  }

  // Apply fine mode (Shift = 10% speed)
  if (input.isFine) {
    delta = applyFineFactor(delta, session.settings.fineFactor, true);
  }

  // Apply step quantization (Ctrl or settings)
  const stepMm = input.isStep
    ? (input.stepMmOverride ?? 1) // Default 1mm when Ctrl held
    : session.settings.stepMm;

  if (stepMm && stepMm > 0) {
    delta = quantizeDeltaAlongAxis(delta, dragState.axisWorld, stepMm);
  }

  // Calculate preview position
  const previewPosition = add(session.startPosition, delta);

  return {
    ...session,
    freeDeltaWorld: delta,
    previewPosition,
  };
}

/**
 * Update a plane drag session
 *
 * Modifier policy for PLANE drag:
 * - planeMode = 'U' or 'V': hard constraint to that axis (no Shift needed)
 * - planeMode = 'CENTER' + Shift: auto-lock to dominant U or V axis
 * - Alt = fine mode (10% speed)
 * - Ctrl = step snap
 */
function updatePlaneDragSession(
  session: GizmoSession,
  input: GizmoDragInput
): GizmoSession {
  if (!session.planeDragState) return session;

  // Get raw delta from plane drag
  const result = updatePlaneDrag(session.planeDragState, input.ray);
  let delta2D = result.delta2D;

  // STEP 1: Apply constraint based on planeMode
  if (session.planeMode === 'U') {
    // Hard constraint to U axis (from edge handle)
    delta2D = { u: delta2D.u, v: 0 };
  } else if (session.planeMode === 'V') {
    // Hard constraint to V axis (from edge handle)
    delta2D = { u: 0, v: delta2D.v };
  } else {
    // CENTER mode: Shift = auto-lock to dominant U or V
    delta2D = lockDeltaToAxis({
      delta2D: delta2D,
      state: session.planeDragState,
      constrain: input.isFine, // Shift key = constrain for plane CENTER
    });
  }

  // STEP 2: Apply fine mode (Alt = 10% speed for plane)
  if (input.isAlt) {
    delta2D = applyPlaneFine(delta2D, session.settings.fineFactor, true);
  }

  // STEP 3: Apply step quantization (Ctrl or settings)
  const stepMm = input.isStep
    ? (input.stepMmOverride ?? 1) // Default 1mm when Ctrl held
    : session.settings.stepMm;

  if (stepMm && stepMm > 0) {
    delta2D = quantizePlaneDelta2D(delta2D, stepMm);
  }

  // Convert 2D delta back to world space
  const deltaWorld = planeDelta2DToWorld(
    delta2D,
    session.planeDragState.basisU,
    session.planeDragState.basisV
  );

  // Calculate preview position
  const previewPosition = add(session.startPosition, deltaWorld);

  return {
    ...session,
    freeDeltaWorld: deltaWorld,
    planeDelta2D: delta2D,
    previewPosition,
  };
}

/**
 * End the current drag operation
 *
 * @param session - Current session state
 * @returns Session reset to 'idle' phase with final values preserved
 */
export function endGizmoDrag(session: GizmoSession): {
  session: GizmoSession;
  finalPosition: Vec3;
  delta: Vec3;
  planeDelta2D: PlaneDelta2D | null;
} {
  const finalPosition = session.previewPosition;
  const delta = session.freeDeltaWorld;
  const planeDelta2D = session.planeDelta2D;

  console.log('[Gizmo] Drag ended, delta:', delta, 'final:', finalPosition);

  return {
    session: {
      ...session,
      phase: 'idle',
      activeHandle: null,
      activeAxis: null,
      activePlane: null,
      planeMode: null,
      dragKind: null,
      axisDragState: null,
      planeDragState: null,
      // Keep final position as new start position
      startPosition: finalPosition,
      freeDeltaWorld: ZERO_VEC,
      planeDelta2D: null,
      // Legacy alias
      dragState: null,
    },
    finalPosition,
    delta,
    planeDelta2D,
  };
}

/**
 * Cancel the current drag operation (restore original position)
 *
 * @param session - Current session state
 * @returns Session reset to 'idle' phase with original position
 */
export function cancelGizmoDrag(session: GizmoSession): GizmoSession {
  console.log('[Gizmo] Drag cancelled, restoring position:', session.startPosition);

  return {
    ...session,
    phase: 'idle',
    activeHandle: null,
    activeAxis: null,
    activePlane: null,
    planeMode: null,
    dragKind: null,
    axisDragState: null,
    planeDragState: null,
    freeDeltaWorld: ZERO_VEC,
    planeDelta2D: null,
    previewPosition: session.startPosition,
    // Legacy alias
    dragState: null,
  };
}

// ============================================
// SETTINGS UPDATES
// ============================================

/**
 * Toggle between WORLD and LOCAL space
 */
export function toggleGizmoSpace(session: GizmoSession): GizmoSession {
  const newSpace: GizmoSpace = session.settings.space === 'WORLD' ? 'LOCAL' : 'WORLD';
  console.log('[Gizmo] Space toggled to:', newSpace);

  return {
    ...session,
    settings: {
      ...session.settings,
      space: newSpace,
    },
  };
}

/**
 * Set the gizmo space mode
 */
export function setGizmoSpace(session: GizmoSession, space: GizmoSpace): GizmoSession {
  return {
    ...session,
    settings: {
      ...session.settings,
      space,
    },
  };
}

/**
 * Set the step size for quantized movement
 */
export function setGizmoStepSize(session: GizmoSession, stepMm: number | null): GizmoSession {
  return {
    ...session,
    settings: {
      ...session.settings,
      stepMm,
    },
  };
}

// ============================================
// UTILITIES
// ============================================

/**
 * Check if session is currently in a drag operation
 */
export function isDragging(session: GizmoSession): boolean {
  return session.phase === 'dragging';
}

/**
 * Check if session is dragging an axis
 */
export function isDraggingAxis(session: GizmoSession): boolean {
  return session.phase === 'dragging' && session.dragKind === 'axis';
}

/**
 * Check if session is dragging a plane
 */
export function isDraggingPlane(session: GizmoSession): boolean {
  return session.phase === 'dragging' && session.dragKind === 'plane';
}

/**
 * Get the magnitude of the current drag delta
 */
export function getDragDistance(session: GizmoSession): number {
  const d = session.freeDeltaWorld;
  return Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
}

/**
 * Get the delta component along the active axis
 */
export function getDragDistanceAlongAxis(session: GizmoSession): number {
  const dragState = session.axisDragState ?? session.dragState;
  if (!dragState) return 0;
  const d = session.freeDeltaWorld;
  const a = dragState.axisWorld;
  return d.x * a.x + d.y * a.y + d.z * a.z;
}

/**
 * Get the 2D delta for plane drag
 */
export function getPlaneDragDelta2D(session: GizmoSession): PlaneDelta2D | null {
  return session.planeDelta2D;
}

/**
 * Get the drag kind (axis or plane)
 */
export function getDragKind(session: GizmoSession): GizmoDragKind | null {
  return session.dragKind;
}

/**
 * gizmoOrchestrator.ts - Gizmo Drag + Snap Integration
 *
 * ARCHITECTURE:
 * This orchestrator bridges the deterministic gizmo drag system with
 * the snap system for cabinet-to-cabinet alignment.
 *
 * FLOW:
 * 1. User starts drag on gizmo axis -> beginDrag()
 * 2. Mouse moves -> updateDrag() returns freeDelta
 * 3. Orchestrator queries snap system for candidates
 * 4. If snap engaged: finalPosition = freePosition + snapOffset
 * 5. On release: gate check -> commit or cancel
 *
 * INTEGRATION POINTS:
 * - SnapSession: provides candidates and snap offsets
 * - GateValidator: checks constraints before commit
 * - Telemetry: records drag operations for analytics
 */

import type { Vec3, SnapCandidate, Transform } from '../types/SnapTypes';
import type { GizmoAxis, GizmoSpace } from './gizmoTypes';

// ============================================
// TYPES
// ============================================

/**
 * Result of an orchestrated drag operation
 */
export interface OrchestratedDragResult {
  /** Final position after drag (includes snap adjustment) */
  finalPosition: Vec3;
  /** Free delta (before snap) */
  freeDelta: Vec3;
  /** Snap delta (if engaged) */
  snapDelta: Vec3 | null;
  /** Was snap engaged? */
  snapEngaged: boolean;
  /** Active snap candidate (if any) */
  snapCandidate: SnapCandidate | null;
  /** Did gate check pass? */
  gatePass: boolean;
  /** Gate blockers (if any) */
  gateBlockers: string[];
}

/**
 * Telemetry data for a drag operation
 */
export interface DragTelemetry {
  /** Drag start timestamp */
  startTs: number;
  /** Drag end timestamp */
  endTs: number;
  /** Duration in ms */
  durationMs: number;
  /** Axis used */
  axis: GizmoAxis;
  /** Space mode */
  space: GizmoSpace;
  /** Total delta magnitude (mm) */
  deltaMagnitude: number;
  /** Was snap engaged */
  snapEngaged: boolean;
  /** Gate pass/fail */
  gatePassed: boolean;
  /** Number of snap candidates considered */
  snapCandidateCount: number;
  /** Object ID being moved */
  objectId: string;
}

/**
 * Snap query function type
 * Returns list of candidates given moving object position
 */
export type SnapQueryFn = (
  movingObjectId: string,
  currentPosition: Vec3,
  delta: Vec3
) => SnapCandidate[];

/**
 * Gate check function type
 * Returns pass/fail and blockers
 */
export type GateCheckFn = (
  objectId: string,
  newPosition: Vec3
) => { pass: boolean; blockers: string[] };

/**
 * Telemetry callback type
 */
export type TelemetryFn = (data: DragTelemetry) => void;

// ============================================
// ORCHESTRATOR STATE
// ============================================

export interface OrchestratorState {
  /** Is currently in a drag operation */
  isDragging: boolean;
  /** Object being dragged */
  objectId: string | null;
  /** Drag start timestamp */
  startTs: number | null;
  /** Start position */
  startPosition: Vec3 | null;
  /** Current free position (before snap) */
  freePosition: Vec3 | null;
  /** Current snap delta */
  snapDelta: Vec3 | null;
  /** Current snap candidate */
  snapCandidate: SnapCandidate | null;
  /** Number of candidates in current frame */
  candidateCount: number;
  /** Axis being used */
  axis: GizmoAxis;
  /** Space mode */
  space: GizmoSpace;
}

// ============================================
// ORCHESTRATOR FUNCTIONS
// ============================================

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Create initial orchestrator state
 */
export function createOrchestratorState(): OrchestratorState {
  return {
    isDragging: false,
    objectId: null,
    startTs: null,
    startPosition: null,
    freePosition: null,
    snapDelta: null,
    snapCandidate: null,
    candidateCount: 0,
    axis: null,
    space: 'LOCAL',
  };
}

/**
 * Begin orchestrated drag
 */
export function beginOrchestratedDrag(
  state: OrchestratorState,
  objectId: string,
  startPosition: Vec3,
  axis: GizmoAxis,
  space: GizmoSpace
): OrchestratorState {
  return {
    ...state,
    isDragging: true,
    objectId,
    startTs: performance.now(),
    startPosition,
    freePosition: startPosition,
    snapDelta: null,
    snapCandidate: null,
    candidateCount: 0,
    axis,
    space,
  };
}

/**
 * Update orchestrated drag with new position and snap query
 */
export function updateOrchestratedDrag(
  state: OrchestratorState,
  freePosition: Vec3,
  snapQuery?: SnapQueryFn
): OrchestratorState {
  if (!state.isDragging || !state.objectId || !state.startPosition) {
    return state;
  }

  // Calculate free delta
  const freeDelta: Vec3 = {
    x: freePosition.x - state.startPosition.x,
    y: freePosition.y - state.startPosition.y,
    z: freePosition.z - state.startPosition.z,
  };

  // Query snap system if available
  let snapCandidate: SnapCandidate | null = null;
  let snapDelta: Vec3 | null = null;
  let candidateCount = 0;

  if (snapQuery) {
    const candidates = snapQuery(state.objectId, freePosition, freeDelta);
    candidateCount = candidates.length;

    // Take best candidate (first one, assumed sorted by score)
    if (candidates.length > 0) {
      snapCandidate = candidates[0];
      // Snap delta would come from snap resolver
      // For now, placeholder - snap system will provide actual delta
      snapDelta = null;
    }
  }

  return {
    ...state,
    freePosition,
    snapDelta,
    snapCandidate,
    candidateCount,
  };
}

/**
 * End orchestrated drag with optional gate check
 *
 * @param state Current orchestrator state
 * @param gateCheck Optional gate check function
 * @param telemetry Optional telemetry callback
 * @returns Drag result with final position and metadata
 */
export function endOrchestratedDrag(
  state: OrchestratorState,
  gateCheck?: GateCheckFn,
  telemetry?: TelemetryFn
): { state: OrchestratorState; result: OrchestratedDragResult } {
  if (!state.isDragging || !state.objectId || !state.startPosition || !state.freePosition) {
    // Not in valid drag state
    return {
      state: createOrchestratorState(),
      result: {
        finalPosition: ZERO_VEC,
        freeDelta: ZERO_VEC,
        snapDelta: null,
        snapEngaged: false,
        snapCandidate: null,
        gatePass: false,
        gateBlockers: ['Invalid drag state'],
      },
    };
  }

  const endTs = performance.now();

  // Calculate final position
  const finalPosition: Vec3 = state.snapDelta
    ? {
        x: state.freePosition.x + state.snapDelta.x,
        y: state.freePosition.y + state.snapDelta.y,
        z: state.freePosition.z + state.snapDelta.z,
      }
    : state.freePosition;

  // Calculate free delta
  const freeDelta: Vec3 = {
    x: state.freePosition.x - state.startPosition.x,
    y: state.freePosition.y - state.startPosition.y,
    z: state.freePosition.z - state.startPosition.z,
  };

  // Run gate check
  let gatePass = true;
  let gateBlockers: string[] = [];

  if (gateCheck) {
    const gateResult = gateCheck(state.objectId, finalPosition);
    gatePass = gateResult.pass;
    gateBlockers = gateResult.blockers;
  }

  // Send telemetry
  if (telemetry && state.startTs) {
    const deltaMagnitude = Math.sqrt(
      freeDelta.x ** 2 + freeDelta.y ** 2 + freeDelta.z ** 2
    );

    telemetry({
      startTs: state.startTs,
      endTs,
      durationMs: endTs - state.startTs,
      axis: state.axis,
      space: state.space,
      deltaMagnitude,
      snapEngaged: !!state.snapDelta,
      gatePassed: gatePass,
      snapCandidateCount: state.candidateCount,
      objectId: state.objectId,
    });
  }

  // Create result
  const result: OrchestratedDragResult = {
    finalPosition: gatePass ? finalPosition : state.startPosition, // Revert on gate fail
    freeDelta,
    snapDelta: state.snapDelta,
    snapEngaged: !!state.snapDelta,
    snapCandidate: state.snapCandidate,
    gatePass,
    gateBlockers,
  };

  // Reset state
  return {
    state: createOrchestratorState(),
    result,
  };
}

/**
 * Cancel orchestrated drag
 */
export function cancelOrchestratedDrag(
  state: OrchestratorState
): { state: OrchestratorState; originalPosition: Vec3 | null } {
  const originalPosition = state.startPosition;
  return {
    state: createOrchestratorState(),
    originalPosition,
  };
}

// ============================================
// SNAP INTEGRATION HELPERS
// ============================================

/**
 * Calculate snap offset from candidate
 * This would be called by the snap system with proper geometry
 */
export function calculateSnapOffset(
  candidate: SnapCandidate,
  currentPosition: Vec3
): Vec3 {
  // Placeholder - actual implementation would use snap system geometry
  // For now, return zero (no snap offset)
  return ZERO_VEC;
}

/**
 * Check if position is within snap threshold of any candidate
 */
export function isWithinSnapThreshold(
  candidates: SnapCandidate[],
  thresholdMm: number = 50
): boolean {
  return candidates.some((c) => c.distanceMm <= thresholdMm);
}

// ============================================
// GIZMO-SPECIFIC HELPERS
// ============================================

/**
 * Blend gizmo constraint with snap suggestion
 *
 * When both axis constraint and snap are active:
 * - Primary: follow gizmo axis for main movement
 * - Secondary: apply snap offset perpendicular to axis
 *
 * This allows precise axis movement while still snapping
 * to nearby objects.
 */
export function blendGizmoAndSnap(
  gizmoDelta: Vec3,
  snapDelta: Vec3 | null,
  axis: GizmoAxis
): Vec3 {
  if (!snapDelta) return gizmoDelta;

  // For now, simple blending:
  // - Use gizmo delta along constrained axis
  // - Add snap delta for perpendicular axes

  switch (axis) {
    case 'X':
      // X constrained: use gizmo.x, snap for y/z
      return {
        x: gizmoDelta.x,
        y: snapDelta.y,
        z: snapDelta.z,
      };
    case 'Y':
      // Y constrained: use gizmo.y, snap for x/z
      return {
        x: snapDelta.x,
        y: gizmoDelta.y,
        z: snapDelta.z,
      };
    case 'Z':
      // Z constrained: use gizmo.z, snap for x/y
      return {
        x: snapDelta.x,
        y: snapDelta.y,
        z: gizmoDelta.z,
      };
    default:
      // No constraint: use snap delta entirely
      return snapDelta;
  }
}

/**
 * Get effective step size considering keyboard override
 */
export function getEffectiveStepSize(
  baseStepMm: number | null,
  overrideStepMm: number | null,
  isCtrlHeld: boolean
): number | null {
  // Priority: override > ctrl modifier > base setting
  if (overrideStepMm !== null) return overrideStepMm;
  if (isCtrlHeld) return 1; // Default 1mm when Ctrl held
  return baseStepMm;
}

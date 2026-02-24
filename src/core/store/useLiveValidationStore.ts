/**
 * useLiveValidationStore - Real-time Drag Validation State
 *
 * Zustand store for tracking collision/clearance validation during
 * drag operations. Provides real-time feedback as the user moves
 * cabinets around the scene.
 *
 * ARCHITECTURE:
 * - Uses existing collision engine (OBB-based) for detection
 * - Debounced validation prevents excessive computation during drag
 * - Stores collision pairs for visual feedback (CollisionHighlight)
 * - Integrates with clearanceValidator for body/envelope checks
 *
 * DATA FLOW:
 * ```
 * DragHandler.onDrag(position)
 *   → useLiveValidationStore.validateDragPosition(cabId, pos, ctx)
 *   → detectCollisionForMovedCabinet (collision engine)
 *   → CollisionHighlight reads dragCollisions
 *   → Visual feedback in R3F scene
 *
 * DragHandler.onDragEnd()
 *   → useLiveValidationStore.clearDragValidation()
 * ```
 *
 * @version 1.0.0 - Phase 5: Real-time Validation
 */

import { create } from 'zustand';
import type { CollisionHit } from '../collision/collisionEngine';
import {
  detectCollisionForMovedCabinet,
  detectAllCollisions,
  type CollisionContextOBB,
} from '../collision/collisionEngine';
import type { CabinetCollisionShape } from '../collision/obbTypes';

// ============================================
// TYPES
// ============================================

/**
 * A collision pair detected during drag validation.
 * Contains both the hit info and position data for visualization.
 */
export interface DragCollisionPair {
  /** The collision hit information */
  hit: CollisionHit;
  /** Severity: 'error' for body collision, 'warning' for envelope */
  severity: 'error' | 'warning';
  /** Timestamp when collision was detected */
  detectedAt: number;
}

/**
 * Result of a single validation check during drag.
 */
export interface DragValidationResult {
  /** Whether any collisions were detected */
  hasCollisions: boolean;
  /** Number of error-level collisions */
  errorCount: number;
  /** Number of warning-level collisions */
  warningCount: number;
  /** All collision pairs */
  collisions: DragCollisionPair[];
  /** Time taken for validation in ms */
  validationTimeMs: number;
}

// ============================================
// STATE TYPES
// ============================================

interface LiveValidationState {
  // ─────────────────────────────────────────────────────────────────────────
  // DRAG VALIDATION STATE
  // ─────────────────────────────────────────────────────────────────────────
  /** Whether drag validation is currently running */
  isDragValidating: boolean;
  /** Current drag collision pairs */
  dragCollisions: DragCollisionPair[];
  /** Warning messages from validation */
  dragWarnings: string[];
  /** Latest validation result */
  lastDragResult: DragValidationResult | null;
  /** ID of cabinet being dragged */
  dragCabinetId: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // CONTINUOUS VALIDATION STATE
  // ─────────────────────────────────────────────────────────────────────────
  /** Whether continuous validation is enabled */
  continuousValidationEnabled: boolean;
  /** Latest continuous validation collisions (checked after drag ends) */
  staticCollisions: DragCollisionPair[];
}

interface LiveValidationActions {
  // ─────────────────────────────────────────────────────────────────────────
  // DRAG ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Validate a drag position against the collision context.
   * Called during drag operations to provide real-time feedback.
   *
   * @param cabinetId - ID of the cabinet being dragged
   * @param bodyShape - Cabinet body collision shape at new position
   * @param useEnvelopeShape - Optional use envelope shape
   * @param ctx - Collision context (other cabinets + obstacles)
   */
  validateDragPosition: (
    cabinetId: string,
    bodyShape: CabinetCollisionShape,
    useEnvelopeShape: CabinetCollisionShape | undefined,
    ctx: CollisionContextOBB
  ) => void;

  /** Clear drag validation state (call on drag end) */
  clearDragValidation: () => void;

  // ─────────────────────────────────────────────────────────────────────────
  // CONTINUOUS VALIDATION ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /** Enable/disable continuous validation */
  setContinuousValidation: (enabled: boolean) => void;

  /**
   * Run static collision check for all cabinets.
   * Called after drag ends or on cabinet property changes.
   */
  validateAllStatic: (
    cabinets: Array<{ id: string; bodyShape: CabinetCollisionShape }>,
    ctx: CollisionContextOBB
  ) => void;

  /** Clear all static collisions */
  clearStaticCollisions: () => void;

  /** Reset entire store */
  reset: () => void;
}

// ============================================
// INITIAL STATE
// ============================================

const initialState: LiveValidationState = {
  isDragValidating: false,
  dragCollisions: [],
  dragWarnings: [],
  lastDragResult: null,
  dragCabinetId: null,
  continuousValidationEnabled: false,
  staticCollisions: [],
};

// ============================================
// STORE
// ============================================

export const useLiveValidationStore = create<
  LiveValidationState & LiveValidationActions
>((set, get) => ({
  ...initialState,

  // ──────────────────────────────────────────────────────────────────────────
  // DRAG VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  validateDragPosition: (cabinetId, bodyShape, useEnvelopeShape, ctx) => {
    const startTime = performance.now();
    const collisions: DragCollisionPair[] = [];
    const warnings: string[] = [];
    const now = Date.now();

    // 1. Check body collision (ERROR level)
    const bodyHits = detectAllCollisions(cabinetId, bodyShape, ctx);
    for (const hit of bodyHits) {
      collisions.push({
        hit,
        severity: 'error',
        detectedAt: now,
      });
    }

    // 2. Check use envelope collision (WARNING level)
    if (useEnvelopeShape?.obbs?.length) {
      const envelopeHits = detectAllCollisions(
        cabinetId,
        useEnvelopeShape,
        ctx
      );
      for (const hit of envelopeHits) {
        collisions.push({
          hit,
          severity: 'warning',
          detectedAt: now,
        });
        warnings.push(
          `Door/drawer clearance: ${hit.reason}`
        );
      }
    }

    const validationTimeMs = performance.now() - startTime;

    const result: DragValidationResult = {
      hasCollisions: collisions.length > 0,
      errorCount: collisions.filter((c) => c.severity === 'error').length,
      warningCount: collisions.filter((c) => c.severity === 'warning').length,
      collisions,
      validationTimeMs,
    };

    set({
      isDragValidating: false,
      dragCollisions: collisions,
      dragWarnings: warnings,
      lastDragResult: result,
      dragCabinetId: cabinetId,
    });
  },

  clearDragValidation: () => {
    set({
      isDragValidating: false,
      dragCollisions: [],
      dragWarnings: [],
      lastDragResult: null,
      dragCabinetId: null,
    });
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CONTINUOUS VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  setContinuousValidation: (enabled) => {
    set({ continuousValidationEnabled: enabled });
    if (!enabled) {
      set({ staticCollisions: [] });
    }
  },

  validateAllStatic: (cabinets, ctx) => {
    const collisions: DragCollisionPair[] = [];
    const now = Date.now();

    for (const cab of cabinets) {
      const hits = detectAllCollisions(cab.id, cab.bodyShape, ctx);
      for (const hit of hits) {
        // Avoid duplicate pairs (A→B and B→A)
        const existingPair = collisions.find(
          (c) =>
            (c.hit.targetId === cab.id &&
              c.hit.type === 'CABINET') ||
            (hit.targetId === cab.id && hit.type === 'CABINET')
        );

        if (!existingPair) {
          collisions.push({
            hit: { ...hit, reason: `${cab.id} ↔ ${hit.targetId}: ${hit.reason}` },
            severity: 'error',
            detectedAt: now,
          });
        }
      }
    }

    set({ staticCollisions: collisions });
  },

  clearStaticCollisions: () => {
    set({ staticCollisions: [] });
  },

  reset: () => {
    set(initialState);
  },
}));

// ============================================
// SELECTOR HELPERS
// ============================================

/**
 * Check if there are any drag collisions (for conditional rendering).
 */
export function hasDragCollisions(): boolean {
  return useLiveValidationStore.getState().dragCollisions.length > 0;
}

/**
 * Check if the dragged cabinet has error-level collisions.
 */
export function hasDragErrors(): boolean {
  return useLiveValidationStore
    .getState()
    .dragCollisions.some((c) => c.severity === 'error');
}

/**
 * Get all collision target IDs (for highlighting in scene).
 */
export function getDragCollisionTargetIds(): string[] {
  return useLiveValidationStore
    .getState()
    .dragCollisions.map((c) => c.hit.targetId);
}

/**
 * Get the last validation time in ms (for performance monitoring).
 */
export function getLastValidationTime(): number {
  return useLiveValidationStore.getState().lastDragResult?.validationTimeMs ?? 0;
}

// ============================================
// DEBOUNCED VALIDATOR (Utility)
// ============================================

/**
 * Creates a debounced drag validator that limits validation frequency.
 * Useful for integrating with high-frequency drag events.
 *
 * @param intervalMs - Minimum time between validations (default: 50ms = 20Hz)
 * @returns Debounced validate function
 *
 * @example
 * ```ts
 * const validate = createDebouncedDragValidator(50);
 *
 * // In drag handler:
 * onDrag((position) => {
 *   const shape = buildCollisionShape(cabinet, position);
 *   validate(cabinet.id, shape, undefined, collisionCtx);
 * });
 * ```
 */
export function createDebouncedDragValidator(intervalMs = 50) {
  let lastRunTime = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  return (
    cabinetId: string,
    bodyShape: CabinetCollisionShape,
    useEnvelopeShape: CabinetCollisionShape | undefined,
    ctx: CollisionContextOBB
  ) => {
    const now = performance.now();
    const elapsed = now - lastRunTime;

    if (elapsed >= intervalMs) {
      // Run immediately
      lastRunTime = now;
      useLiveValidationStore
        .getState()
        .validateDragPosition(cabinetId, bodyShape, useEnvelopeShape, ctx);
    } else {
      // Schedule for later
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        lastRunTime = performance.now();
        useLiveValidationStore
          .getState()
          .validateDragPosition(cabinetId, bodyShape, useEnvelopeShape, ctx);
        pendingTimer = null;
      }, intervalMs - elapsed);
    }
  };
}

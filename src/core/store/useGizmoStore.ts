/**
 * useGizmoStore.ts - Zustand Store for Gizmo State
 *
 * ARCHITECTURE:
 * - Global state for gizmo settings and active session
 * - Integrates with tool store for mode coordination
 * - Provides actions for all gizmo operations
 *
 * STATE FLOW:
 * 1. User enters move mode (W key)
 * 2. User clicks on gizmo axis handle
 * 3. beginDrag() creates session
 * 4. updateDrag() called on mouse move
 * 5. endDrag() commits final position
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Vec3 } from '../types/SnapTypes';
import type { GizmoAxis, GizmoSettings, GizmoSpace } from '../gizmo/gizmoTypes';
import { DEFAULT_GIZMO_SETTINGS, GIZMO_STEP_SIZES } from '../gizmo/gizmoTypes';
import type { GizmoSession, GizmoDragContext, GizmoDragInput } from '../gizmo/gizmoSession';
import type { LocalAxes } from '../gizmo/gizmoAxis';
import type { Ray } from '../gizmo/translateAxisDrag';
import {
  createGizmoSession,
  beginGizmoDrag,
  updateGizmoDrag,
  endGizmoDrag,
  cancelGizmoDrag,
  toggleGizmoSpace,
  setGizmoSpace as setSessionSpace,
  isDragging,
  getDragDistanceAlongAxis,
} from '../gizmo/gizmoSession';
import { localAxesFromEuler, IDENTITY_LOCAL_AXES } from '../gizmo/gizmoAxis';

// ============================================
// TYPES
// ============================================

export interface GizmoState {
  // Session state
  session: GizmoSession;

  // UI state
  hoveredAxis: GizmoAxis;
  showHUD: boolean;

  // Keyboard override state
  axisOverride: GizmoAxis;  // X/Y/Z key locks axis without clicking handle
  stepMmOverride: number | null;  // 1/5/0 keys set step size
  isFine: boolean;  // Shift key state (fine mode for axis, constrain for plane)
  isAlt: boolean;   // Alt key state (fine mode for plane)

  // Current object context (set when selecting cabinet)
  currentObjectId: string | null;
  currentLocalAxes: LocalAxes;

  // Settings shortcut
  space: GizmoSpace;

  // Actions
  setHoveredAxis: (axis: GizmoAxis) => void;
  setCurrentObject: (id: string | null, rotation?: [number, number, number]) => void;

  // Hotkey actions
  setAxisOverride: (axis: GizmoAxis) => void;
  toggleAxisOverride: (axis: 'X' | 'Y' | 'Z') => void;
  setStepMmOverride: (stepMm: number | null) => void;
  toggleStepMmOverride: (stepMm: number) => void;
  setShowHUD: (show: boolean) => void;
  toggleHUD: () => void;
  setIsFine: (fine: boolean) => void;
  setIsAlt: (alt: boolean) => void;

  // Drag lifecycle
  beginDrag: (axis: GizmoAxis, ray: Ray, ctx: GizmoDragContext) => void;
  updateDrag: (input: GizmoDragInput) => void;
  endDrag: () => { finalPosition: Vec3; delta: Vec3 } | null;
  cancelDrag: () => void;

  // Settings
  toggleSpace: () => void;
  setSpace: (space: GizmoSpace) => void;
  setStepSize: (stepMm: number | null) => void;

  // Getters
  isDragging: () => boolean;
  getPreviewPosition: () => Vec3;
  getDelta: () => Vec3;
  getDeltaDistance: () => number;
  getEffectiveAxis: () => GizmoAxis;  // Returns active axis or axisOverride
}

// ============================================
// STORE
// ============================================

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };

export const useGizmoStore = create<GizmoState>()(
  immer((set, get) => ({
    // Initial state
    session: createGizmoSession(DEFAULT_GIZMO_SETTINGS),
    hoveredAxis: null,
    showHUD: true,
    axisOverride: null,
    stepMmOverride: null,
    isFine: false,
    isAlt: false,
    currentObjectId: null,
    currentLocalAxes: IDENTITY_LOCAL_AXES,
    space: DEFAULT_GIZMO_SETTINGS.space,

    // ============================================
    // UI ACTIONS
    // ============================================

    setHoveredAxis: (axis) =>
      set((state) => {
        state.hoveredAxis = axis;
      }),

    setCurrentObject: (id, rotation) =>
      set((state) => {
        state.currentObjectId = id;
        if (rotation) {
          state.currentLocalAxes = localAxesFromEuler(rotation);
        } else {
          state.currentLocalAxes = IDENTITY_LOCAL_AXES;
        }
      }),

    // ============================================
    // HOTKEY ACTIONS
    // ============================================

    setAxisOverride: (axis) =>
      set((state) => {
        state.axisOverride = axis;
      }),

    toggleAxisOverride: (axis) =>
      set((state) => {
        // Toggle: if same axis, clear; if different axis, set
        if (state.axisOverride === axis) {
          state.axisOverride = null;
        } else {
          state.axisOverride = axis;
        }
      }),

    setStepMmOverride: (stepMm) =>
      set((state) => {
        state.stepMmOverride = stepMm;
      }),

    toggleStepMmOverride: (stepMm) =>
      set((state) => {
        // Toggle: if same step, clear; if different step, set
        if (state.stepMmOverride === stepMm) {
          state.stepMmOverride = null;
        } else {
          state.stepMmOverride = stepMm;
        }
      }),

    setShowHUD: (show) =>
      set((state) => {
        state.showHUD = show;
      }),

    toggleHUD: () =>
      set((state) => {
        state.showHUD = !state.showHUD;
      }),

    setIsFine: (fine) =>
      set((state) => {
        state.isFine = fine;
      }),

    setIsAlt: (alt) =>
      set((state) => {
        state.isAlt = alt;
      }),

    // ============================================
    // DRAG LIFECYCLE
    // ============================================

    beginDrag: (axis, ray, ctx) =>
      set((state) => {
        if (axis === null) return;
        state.session = beginGizmoDrag(state.session, axis, ray, ctx);
      }),

    updateDrag: (input) =>
      set((state) => {
        if (state.session.phase !== 'dragging') return;
        state.session = updateGizmoDrag(state.session, input);
      }),

    endDrag: () => {
      const state = get();
      if (state.session.phase !== 'dragging') return null;

      const result = endGizmoDrag(state.session);
      set((s) => {
        s.session = result.session;
      });

      return {
        finalPosition: result.finalPosition,
        delta: result.delta,
      };
    },

    cancelDrag: () =>
      set((state) => {
        state.session = cancelGizmoDrag(state.session);
      }),

    // ============================================
    // SETTINGS
    // ============================================

    toggleSpace: () =>
      set((state) => {
        state.session = toggleGizmoSpace(state.session);
        state.space = state.session.settings.space;
      }),

    setSpace: (space) =>
      set((state) => {
        state.session = setSessionSpace(state.session, space);
        state.space = space;
      }),

    setStepSize: (stepMm) =>
      set((state) => {
        state.session.settings.stepMm = stepMm;
      }),

    // ============================================
    // GETTERS
    // ============================================

    isDragging: () => isDragging(get().session),

    getPreviewPosition: () => get().session.previewPosition,

    getDelta: () => get().session.freeDeltaWorld,

    getDeltaDistance: () => getDragDistanceAlongAxis(get().session),

    getEffectiveAxis: () => {
      const state = get();
      // During drag, use active axis from session
      if (state.session.activeAxis !== null) {
        return state.session.activeAxis;
      }
      // Otherwise use keyboard override
      return state.axisOverride;
    },
  }))
);

// ============================================
// SELECTOR HOOKS
// ============================================

/**
 * Get current gizmo space mode
 */
export function useGizmoSpace(): GizmoSpace {
  return useGizmoStore((s) => s.space);
}

/**
 * Get current hovered axis
 */
export function useHoveredAxis(): GizmoAxis {
  return useGizmoStore((s) => s.hoveredAxis);
}

/**
 * Check if gizmo is currently dragging
 */
export function useIsDragging(): boolean {
  return useGizmoStore((s) => s.session.phase === 'dragging');
}

/**
 * Get active axis during drag
 */
export function useActiveAxis(): GizmoAxis {
  return useGizmoStore((s) => s.session.activeAxis);
}

/**
 * Get preview position during drag
 */
export function usePreviewPosition(): Vec3 {
  return useGizmoStore((s) => s.session.previewPosition);
}

/**
 * Get delta distance along active axis
 */
export function useDeltaDistance(): number {
  return useGizmoStore((s) => getDragDistanceAlongAxis(s.session));
}

/**
 * Get HUD visibility state
 */
export function useShowHUD(): boolean {
  return useGizmoStore((s) => s.showHUD);
}

/**
 * Get keyboard axis override
 */
export function useAxisOverride(): GizmoAxis {
  return useGizmoStore((s) => s.axisOverride);
}

/**
 * Get keyboard step size override
 */
export function useStepMmOverride(): number | null {
  return useGizmoStore((s) => s.stepMmOverride);
}

/**
 * Get fine mode state (Shift key)
 */
export function useIsFine(): boolean {
  return useGizmoStore((s) => s.isFine);
}

/**
 * Get effective axis (active drag axis or keyboard override)
 */
export function useEffectiveAxis(): GizmoAxis {
  return useGizmoStore((s) => {
    if (s.session.activeAxis !== null) {
      return s.session.activeAxis;
    }
    return s.axisOverride;
  });
}

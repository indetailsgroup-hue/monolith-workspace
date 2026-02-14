/**
 * Gizmo Store - Transform Gizmo State
 *
 * Manages the move/rotate/scale gizmo state for the 3D viewport.
 * App.tsx reads deep selectors for the GizmoHUD overlay.
 */

import { create } from 'zustand';

// ============================================
// TYPES
// ============================================

type GizmoAxis = 'x' | 'y' | 'z' | null;
type GizmoPlane = 'xy' | 'xz' | 'yz' | null;
type GizmoSpace = 'world' | 'local';
type GizmoPhase = 'idle' | 'hovering' | 'dragging';

interface GizmoSession {
  activeAxis: GizmoAxis;
  activePlane: GizmoPlane;
  planeMode: boolean;
  phase: GizmoPhase;
  freeDeltaWorld: { x: number; y: number; z: number };
  planeDelta2D: { u: number; v: number } | null;
  planeDragState: { locked: boolean } | null;
}

interface GizmoState {
  showHUD: boolean;
  space: GizmoSpace;
  axisOverride: GizmoAxis;
  stepMmOverride: number | null;
  isFine: boolean;
  isAlt: boolean;
  session: GizmoSession;
}

interface GizmoActions {
  setShowHUD: (show: boolean) => void;
  setSpace: (space: GizmoSpace) => void;
  setAxisOverride: (axis: GizmoAxis) => void;
  setStepMmOverride: (step: number | null) => void;
  setFine: (fine: boolean) => void;
  setAlt: (alt: boolean) => void;
  startDrag: (axis: GizmoAxis) => void;
  updateDrag: (delta: { x: number; y: number; z: number }) => void;
  endDrag: () => void;
  resetSession: () => void;
}

type GizmoStore = GizmoState & GizmoActions;

// ============================================
// DEFAULT SESSION
// ============================================

const DEFAULT_SESSION: GizmoSession = {
  activeAxis: null,
  activePlane: null,
  planeMode: false,
  phase: 'idle',
  freeDeltaWorld: { x: 0, y: 0, z: 0 },
  planeDelta2D: null,
  planeDragState: null,
};

// ============================================
// STORE
// ============================================

export const useGizmoStore = create<GizmoStore>()((set) => ({
  showHUD: true,
  space: 'world',
  axisOverride: null,
  stepMmOverride: null,
  isFine: false,
  isAlt: false,
  session: { ...DEFAULT_SESSION },

  setShowHUD: (show) => set({ showHUD: show }),
  setSpace: (space) => set({ space }),
  setAxisOverride: (axis) => set({ axisOverride: axis }),
  setStepMmOverride: (step) => set({ stepMmOverride: step }),
  setFine: (fine) => set({ isFine: fine }),
  setAlt: (alt) => set({ isAlt: alt }),

  startDrag: (axis) =>
    set((state) => ({
      session: { ...state.session, activeAxis: axis, phase: 'dragging' },
    })),

  updateDrag: (delta) =>
    set((state) => ({
      session: { ...state.session, freeDeltaWorld: delta },
    })),

  endDrag: () =>
    set({ session: { ...DEFAULT_SESSION } }),

  resetSession: () =>
    set({ session: { ...DEFAULT_SESSION } }),
}));

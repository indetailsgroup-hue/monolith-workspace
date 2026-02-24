/**
 * useSnapStore.ts - Zustand Store for Cabinet Snap System
 *
 * FEATURES:
 * - Manages snap state during drag operations
 * - Stores active snap candidate and preview
 * - Configurable snap constants
 * - Integration with CabinetTransformControls
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { projectScopedStorage } from './projectScopedStorage';
import {
  SnapConstants,
  SnapCandidate,
  SnapResult,
  SnapMode,
  SnapAlignment,
  Transform,
  DEFAULT_SNAP_CONSTANTS,
} from '../types/SnapTypes';
import { useHistoryStore } from '../history/useHistoryStore';
import { makeCabinetSnapFeature } from '../history/historyTypes';
import { createSnapParams } from '../utils/cabinetSnap';

// ============================================
// TYPES
// ============================================

export interface SnapStoreState {
  // Snap enabled/disabled
  enabled: boolean;

  // Snap mode (rigid, auto_filler, resize_bounded)
  mode: SnapMode;

  // Snap constants
  constants: SnapConstants;

  // Default alignment constraints
  defaultAlignment: SnapAlignment;

  // Active snap during drag
  activeCandidate: SnapCandidate | null;
  activeResult: SnapResult | null;
  previewTransform: Transform | null;

  // Is currently snapping (for visual feedback)
  isSnapping: boolean;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: SnapMode) => void;
  setConstants: (constants: Partial<SnapConstants>) => void;
  setDefaultAlignment: (alignment: Partial<SnapAlignment>) => void;

  // Active snap actions
  setActiveSnap: (candidate: SnapCandidate | null, result: SnapResult | null) => void;
  setPreviewTransform: (transform: Transform | null) => void;
  clearActiveSnap: () => void;

  // Commit snap (records to history)
  commitSnap: () => void;
}

// ============================================
// STORE
// ============================================

export const useSnapStore = create<SnapStoreState>()(
  persist(
    immer((set, get) => ({
      // Default state
      enabled: true,
      mode: 'rigid',
      constants: { ...DEFAULT_SNAP_CONSTANTS },
      defaultAlignment: {
        alignBottom: true,
        alignFrontFlush: true,
      },

    activeCandidate: null,
    activeResult: null,
    previewTransform: null,
    isSnapping: false,

    // Actions
    setEnabled: (enabled) => set((state) => {
      state.enabled = enabled;
      if (!enabled) {
        state.activeCandidate = null;
        state.activeResult = null;
        state.previewTransform = null;
        state.isSnapping = false;
      }
    }),

    setMode: (mode) => set((state) => {
      state.mode = mode;
    }),

    setConstants: (constants) => set((state) => {
      Object.assign(state.constants, constants);
    }),

    setDefaultAlignment: (alignment) => set((state) => {
      Object.assign(state.defaultAlignment, alignment);
    }),

    setActiveSnap: (candidate, result) => set((state) => {
      state.activeCandidate = candidate;
      state.activeResult = result;
      state.isSnapping = candidate !== null;
      if (result) {
        state.previewTransform = result.resolvedTransformB;
      } else {
        state.previewTransform = null;
      }
    }),

    setPreviewTransform: (transform) => set((state) => {
      state.previewTransform = transform;
    }),

    clearActiveSnap: () => set((state) => {
      state.activeCandidate = null;
      state.activeResult = null;
      state.previewTransform = null;
      state.isSnapping = false;
    }),

    commitSnap: () => {
      const { activeResult, constants, defaultAlignment } = get();
      if (!activeResult || !activeResult.isValid) {
        console.warn('[Snap] Cannot commit: no valid snap result');
        return;
      }

      // Record to history as CABINET_SNAP feature
      const snapParams = createSnapParams(activeResult, constants, defaultAlignment);
      const jobId = useHistoryStore.getState().jobId;
      const feature = makeCabinetSnapFeature(snapParams, jobId, 'user');
      useHistoryStore.getState().addFeature(feature);

      // Clear active snap after commit
      set((state) => {
        state.activeCandidate = null;
        state.activeResult = null;
        state.previewTransform = null;
        state.isSnapping = false;
      });
    },
  })),
    {
      name: 'monolith:snapstore',
      version: 1,
      storage: createJSONStorage(() => projectScopedStorage),
      partialize: (state) => ({
        // Only persist settings, not transient snap state
        enabled: state.enabled,
        mode: state.mode,
        constants: state.constants,
        defaultAlignment: state.defaultAlignment,
      }),
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const useSnapEnabled = () => useSnapStore((s) => s.enabled);
export const useSnapMode = () => useSnapStore((s) => s.mode);
export const useSnapConstants = () => useSnapStore((s) => s.constants);
export const useIsSnapping = () => useSnapStore((s) => s.isSnapping);
export const useActiveSnapCandidate = () => useSnapStore((s) => s.activeCandidate);
export const useActiveSnapResult = () => useSnapStore((s) => s.activeResult);
export const usePreviewTransform = () => useSnapStore((s) => s.previewTransform);

// ============================================
// SNAP TYPE LABELS
// ============================================

export const SNAP_TYPE_LABELS: Record<string, string> = {
  SIDE_JOIN: 'Side Join',
  FLUSH_FRONT: 'Flush Front',
  BACK_ALIGN: 'Back Align',
  STACK: 'Stack',
};

export const SNAP_TYPE_COLORS: Record<string, string> = {
  SIDE_JOIN: '#22c55e',    // Green
  FLUSH_FRONT: '#3b82f6',  // Blue
  BACK_ALIGN: '#8b5cf6',   // Purple
  STACK: '#f59e0b',        // Amber
};

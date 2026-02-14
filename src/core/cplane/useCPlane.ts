/**
 * Construction Plane Store
 *
 * Manages the active construction plane for sketching.
 * Project-scoped persistence.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { projectScopedStorage } from '../store/projectScopedStorage';
import {
  CPlane,
  CPlaneKind,
  CPLANE_WORLD_XZ,
  getPresetCPlane,
} from './types';

// ============================================================================
// Store Types
// ============================================================================

interface CPlaneState {
  /** Active construction plane */
  plane: CPlane;

  /** Whether CPlane visualization is visible */
  visible: boolean;

  /** History of custom planes (for quick switching) */
  recentPlanes: CPlane[];
}

interface CPlaneActions {
  /** Set plane to a preset kind */
  setKind: (kind: CPlaneKind) => void;

  /** Set plane origin */
  setOrigin: (origin: [number, number, number]) => void;

  /** Set grid size */
  setGridSize: (size: number) => void;

  /** Set grid extent */
  setGridExtent: (extent: number) => void;

  /** Toggle grid visibility */
  toggleGrid: () => void;

  /** Toggle axes visibility */
  toggleAxes: () => void;

  /** Toggle entire CPlane visibility */
  toggleVisible: () => void;

  /** Set visibility */
  setVisible: (visible: boolean) => void;

  /** Set custom plane */
  setCustomPlane: (plane: Partial<CPlane>) => void;

  /** Reset to default (World XZ) */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CPlaneState = {
  plane: { ...CPLANE_WORLD_XZ },
  visible: true,
  recentPlanes: [],
};

// ============================================================================
// Store
// ============================================================================

export const useCPlane = create<CPlaneState & CPlaneActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      setKind: (kind) => {
        set((state) => {
          const preset = getPresetCPlane(kind);
          // Preserve current grid settings
          preset.gridSize = state.plane.gridSize;
          preset.gridExtent = state.plane.gridExtent;
          preset.showGrid = state.plane.showGrid;
          preset.showAxes = state.plane.showAxes;
          state.plane = preset;
        });
        console.log(`[CPlane] Set to ${kind}`);
      },

      setOrigin: (origin) => {
        set((state) => {
          state.plane.origin = origin;
        });
        console.log(`[CPlane] Origin: [${origin.join(', ')}]`);
      },

      setGridSize: (size) => {
        set((state) => {
          state.plane.gridSize = Math.max(1, size);
        });
      },

      setGridExtent: (extent) => {
        set((state) => {
          state.plane.gridExtent = Math.max(100, extent);
        });
      },

      toggleGrid: () => {
        set((state) => {
          state.plane.showGrid = !state.plane.showGrid;
        });
      },

      toggleAxes: () => {
        set((state) => {
          state.plane.showAxes = !state.plane.showAxes;
        });
      },

      toggleVisible: () => {
        set((state) => {
          state.visible = !state.visible;
        });
        console.log(`[CPlane] Visible: ${get().visible}`);
      },

      setVisible: (visible) => {
        set((state) => {
          state.visible = visible;
        });
      },

      setCustomPlane: (updates) => {
        set((state) => {
          Object.assign(state.plane, updates);
          state.plane.kind = 'custom';
        });
      },

      reset: () => {
        set((state) => {
          state.plane = { ...CPLANE_WORLD_XZ };
          state.visible = true;
        });
        console.log('[CPlane] Reset to World XZ');
      },
    })),
    {
      name: 'monolith:cplane',
      storage: createJSONStorage(() => projectScopedStorage),
      partialize: (state) => ({
        plane: state.plane,
        visible: state.visible,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useCPlaneKind = () => useCPlane((s) => s.plane.kind);
export const useCPlaneOrigin = () => useCPlane((s) => s.plane.origin);
export const useCPlaneVisible = () => useCPlane((s) => s.visible);
export const useCPlaneGridSize = () => useCPlane((s) => s.plane.gridSize);

export default useCPlane;

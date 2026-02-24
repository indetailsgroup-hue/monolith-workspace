/**
 * useCncOverlayStore.ts - CNC Overlay State Management
 *
 * Zustand store for managing CNC overlay visualization state.
 * Separates overlay data (from OperationGraph) from filter/display preferences.
 *
 * @version 1.0.0 - Phase D4.x
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  CncOverlayBuildResult,
  CncOverlayFilter,
  CncOverlayPoint,
  CncOverlayMarkerStyle,
} from '../../factory/cnc/overlay/cncOverlayTypes';
import {
  DEFAULT_OVERLAY_FILTER,
  DEFAULT_MARKER_STYLE,
  filterOverlayPoints,
} from '../../factory/cnc/overlay/cncOverlayTypes';
import type { PanelFace } from '../../cnc/transform/workpieceTypes';
import type { CycleType, HoleKind } from '../../cnc/policy/drillPolicyTypes';

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Mutable version of CncOverlayBuildResult for store state.
 * The original is readonly for trust chain integrity.
 */
interface MutableOverlayResult {
  points: CncOverlayPoint[];
  stats: import('../../factory/cnc/overlay/cncOverlayTypes').CncOverlayStats;
  jobId: string;
  machineId: string;
  builtAt: string;
  contentHash: string;
}

interface CncOverlayState {
  // ─────────────────────────────────────────────────────────────────────────
  // DATA
  // ─────────────────────────────────────────────────────────────────────────
  /** Current overlay build result (null if not built) */
  overlayResult: MutableOverlayResult | null;
  /** Loading state */
  isBuilding: boolean;
  /** Error message (if build failed) */
  buildError: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // DISPLAY
  // ─────────────────────────────────────────────────────────────────────────
  /** Whether overlay is visible */
  isVisible: boolean;
  /** Current filter settings */
  filter: CncOverlayFilter;
  /** Marker style settings */
  markerStyle: CncOverlayMarkerStyle;
  /** Currently hovered point ID */
  hoveredPointId: string | null;
  /** Currently selected point ID */
  selectedPointId: string | null;

  // ─────────────────────────────────────────────────────────────────────────
  // COMPUTED (derived)
  // ─────────────────────────────────────────────────────────────────────────
  /** Version counter for React re-renders */
  version: number;
}

interface CncOverlayActions {
  // ─────────────────────────────────────────────────────────────────────────
  // DATA ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /** Set overlay build result */
  setOverlayResult: (result: CncOverlayBuildResult | null) => void;
  /** Set building state */
  setIsBuilding: (isBuilding: boolean) => void;
  /** Set build error */
  setBuildError: (error: string | null) => void;
  /** Clear overlay data */
  clearOverlay: () => void;

  // ─────────────────────────────────────────────────────────────────────────
  // DISPLAY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /** Toggle overlay visibility */
  toggleVisibility: () => void;
  /** Set visibility explicitly */
  setVisible: (visible: boolean) => void;
  /** Update filter settings */
  updateFilter: (updates: Partial<CncOverlayFilter>) => void;
  /** Reset filter to defaults */
  resetFilter: () => void;
  /** Update marker style */
  updateMarkerStyle: (updates: Partial<CncOverlayMarkerStyle>) => void;
  /** Set hovered point */
  setHoveredPoint: (pointId: string | null) => void;
  /** Set selected point */
  setSelectedPoint: (pointId: string | null) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // FILTER SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────
  /** Toggle drill visibility */
  toggleDrill: () => void;
  /** Toggle bore visibility */
  toggleBore: () => void;
  /** Toggle through-holes only mode */
  toggleThroughHolesOnly: () => void;
  /** Set face filter */
  setFaceFilter: (face: PanelFace | null) => void;
  /** Toggle hole kind in filter */
  toggleHoleKindFilter: (kind: HoleKind) => void;
  /** Toggle cycle in filter */
  toggleCycleFilter: (cycle: CycleType) => void;

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS (for convenience)
  // ─────────────────────────────────────────────────────────────────────────
  /** Get filtered points based on current filter */
  getFilteredPoints: () => CncOverlayPoint[];
  /** Get point by ID */
  getPointById: (id: string) => CncOverlayPoint | undefined;
  /** Check if overlay has data */
  hasOverlay: () => boolean;
}

type CncOverlayStore = CncOverlayState & CncOverlayActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: CncOverlayState = {
  overlayResult: null,
  isBuilding: false,
  buildError: null,
  isVisible: true,
  filter: { ...DEFAULT_OVERLAY_FILTER },
  markerStyle: { ...DEFAULT_MARKER_STYLE },
  hoveredPointId: null,
  selectedPointId: null,
  version: 0,
};

// ============================================================================
// STORE
// ============================================================================

export const useCncOverlayStore = create<CncOverlayStore>()(
  immer((set, get) => ({
    ...initialState,

    // ─────────────────────────────────────────────────────────────────────────
    // DATA ACTIONS
    // ─────────────────────────────────────────────────────────────────────────
    setOverlayResult: (result) => {
      set((state) => {
        // Deep copy to mutable version for immer compatibility
        if (result) {
          state.overlayResult = {
            points: [...result.points],
            stats: { ...result.stats },
            jobId: result.jobId,
            machineId: result.machineId,
            builtAt: result.builtAt,
            contentHash: result.contentHash,
          };
        } else {
          state.overlayResult = null;
        }
        state.buildError = null;
        state.isBuilding = false;
        state.version++;
      });
    },

    setIsBuilding: (isBuilding) => {
      set((state) => {
        state.isBuilding = isBuilding;
      });
    },

    setBuildError: (error) => {
      set((state) => {
        state.buildError = error;
        state.isBuilding = false;
        state.version++;
      });
    },

    clearOverlay: () => {
      set((state) => {
        state.overlayResult = null;
        state.buildError = null;
        state.isBuilding = false;
        state.hoveredPointId = null;
        state.selectedPointId = null;
        state.version++;
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // DISPLAY ACTIONS
    // ─────────────────────────────────────────────────────────────────────────
    toggleVisibility: () => {
      set((state) => {
        state.isVisible = !state.isVisible;
        state.version++;
      });
    },

    setVisible: (visible) => {
      set((state) => {
        state.isVisible = visible;
        state.version++;
      });
    },

    updateFilter: (updates) => {
      set((state) => {
        Object.assign(state.filter, updates);
        state.version++;
      });
    },

    resetFilter: () => {
      set((state) => {
        state.filter = { ...DEFAULT_OVERLAY_FILTER };
        state.version++;
      });
    },

    updateMarkerStyle: (updates) => {
      set((state) => {
        Object.assign(state.markerStyle, updates);
        state.version++;
      });
    },

    setHoveredPoint: (pointId) => {
      set((state) => {
        state.hoveredPointId = pointId;
      });
    },

    setSelectedPoint: (pointId) => {
      set((state) => {
        state.selectedPointId = pointId;
        state.version++;
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FILTER SHORTCUTS
    // ─────────────────────────────────────────────────────────────────────────
    toggleDrill: () => {
      set((state) => {
        state.filter.showDrill = !state.filter.showDrill;
        state.version++;
      });
    },

    toggleBore: () => {
      set((state) => {
        state.filter.showBore = !state.filter.showBore;
        state.version++;
      });
    },

    toggleThroughHolesOnly: () => {
      set((state) => {
        state.filter.throughHolesOnly = !state.filter.throughHolesOnly;
        state.version++;
      });
    },

    setFaceFilter: (face) => {
      set((state) => {
        state.filter.faceFilter = face;
        state.version++;
      });
    },

    toggleHoleKindFilter: (kind) => {
      set((state) => {
        const idx = state.filter.holeKindFilter.indexOf(kind);
        if (idx >= 0) {
          state.filter.holeKindFilter.splice(idx, 1);
        } else {
          state.filter.holeKindFilter.push(kind);
        }
        state.version++;
      });
    },

    toggleCycleFilter: (cycle) => {
      set((state) => {
        const idx = state.filter.cycleFilter.indexOf(cycle);
        if (idx >= 0) {
          state.filter.cycleFilter.splice(idx, 1);
        } else {
          state.filter.cycleFilter.push(cycle);
        }
        state.version++;
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // GETTERS
    // ─────────────────────────────────────────────────────────────────────────
    getFilteredPoints: () => {
      const state = get();
      if (!state.overlayResult) return [];
      return filterOverlayPoints(state.overlayResult.points, state.filter);
    },

    getPointById: (id) => {
      const state = get();
      if (!state.overlayResult) return undefined;
      return state.overlayResult.points.find((p) => p.id === id);
    },

    hasOverlay: () => {
      const state = get();
      return state.overlayResult !== null && state.overlayResult.points.length > 0;
    },
  }))
);

// ============================================================================
// SELECTORS
// ============================================================================

/**
 * Select filtered points (for use in components).
 */
export const selectFilteredPoints = (state: CncOverlayStore): CncOverlayPoint[] => {
  if (!state.overlayResult) return [];
  return filterOverlayPoints(state.overlayResult.points, state.filter);
};

/**
 * Select overlay stats.
 */
export const selectOverlayStats = (state: CncOverlayStore) => {
  return state.overlayResult?.stats ?? null;
};

/**
 * Select visibility and filter state for legend.
 */
export const selectLegendState = (state: CncOverlayStore) => ({
  isVisible: state.isVisible,
  filter: state.filter,
  stats: state.overlayResult?.stats ?? null,
  hasOverlay: state.overlayResult !== null,
});

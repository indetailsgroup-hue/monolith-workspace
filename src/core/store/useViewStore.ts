/**
 * useViewStore.ts - View State Management
 *
 * Manages camera view state for the 3D scene.
 * Used by commands to control camera focus and presets.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import type { RenderMode } from '../types/VisualTypes';

// View types as per SPEC-08
export type ViewType = 'Perspective' | 'Front' | 'Left' | 'Top' | 'Install' | 'Factory' | 'CNC';

// Camera presets for each view
// isOrtho: true = use OrthographicCamera (2D view like 3ds Max)
export const VIEW_PRESETS: Record<ViewType, {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  description: string;
  isOrtho: boolean;  // true = orthographic camera (2D), false = perspective (3D)
  orthoZoom?: number; // zoom factor for orthographic views (default: 0.5)
}> = {
  Perspective: {
    position: [1500, 1200, 2000],
    target: [0, 400, 0],
    fov: 45,
    description: 'Design thinking / presentation view',
    isOrtho: false,
  },
  Front: {
    position: [0, 400, 3000],
    target: [0, 400, 0],
    fov: 45,
    description: 'Contractor-friendly frontal view (2D)',
    isOrtho: true,
    orthoZoom: 0.4,
  },
  Left: {
    position: [-3000, 400, 0],
    target: [0, 400, 0],
    fov: 45,
    description: 'Side profile for depth verification (2D)',
    isOrtho: true,
    orthoZoom: 0.4,
  },
  Top: {
    position: [0, 3000, 0],
    target: [0, 400, 0],
    fov: 45,
    description: 'Top-down bird\'s eye view (2D)',
    isOrtho: true,
    orthoZoom: 0.4,
  },
  Install: {
    position: [1200, 800, 1200],
    target: [0, 300, 0],
    fov: 50,
    description: 'Installation reference view (3/4 angle)',
    isOrtho: false,
  },
  Factory: {
    position: [0, 3000, 0],
    target: [0, 0, 0],
    fov: 45,
    description: 'Manufacturing truth - top-down panel view (2D)',
    isOrtho: true,
    orthoZoom: 0.4,
  },
  CNC: {
    position: [0, 0, 3000],
    target: [0, 0, 0],
    fov: 35,
    description: 'CAM alignment - machine coordinate space (2D)',
    isOrtho: true,
    orthoZoom: 0.4,
  }
};

// ============================================================================
// Types
// ============================================================================

interface FocusTarget {
  position: [number, number, number];
  size: { width: number; height: number; depth: number };
}

interface ViewState {
  // Current view preset
  currentView: ViewType;

  // Isolated cabinet ID (null = show all)
  isolatedCabinetId: string | null;

  // Camera override (when focusing on specific object)
  cameraOverride: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  } | null;

  // Version counter for triggering re-renders
  version: number;

  // Plasticity-style view modes
  xRayMode: boolean;       // See-through materials (Alt+Z)
  isOrthographic: boolean; // Orthographic vs Perspective (O key / Numpad 5)

  // Render mode for Ghost/Preview (Indetails Smart patterns)
  renderMode: RenderMode;  // NORMAL, GHOST, PREVIEW, XRAY

  // CSG Boolean drill holes mode
  useCSGHoles: boolean;    // True geometry subtraction (Ctrl+Shift+H)

  // Ghost cabinet IDs (for showing original before change)
  ghostCabinetIds: string[];

  // Preview cabinet IDs (for showing proposed changes)
  previewCabinetIds: string[];
}

interface ViewActions {
  // View preset actions
  setView: (view: ViewType) => void;
  resetView: () => void;

  // Isolate actions
  isolateCabinet: (cabinetId: string) => void;
  clearIsolation: () => void;
  toggleIsolation: (cabinetId: string) => void;

  // Camera focus actions
  focusOnTarget: (target: FocusTarget) => void;
  clearCameraOverride: () => void;

  // Focus on cabinet by ID (calculates position from cabinet data)
  focusOnCabinet: (cabinetId: string, cabinetData: {
    position: [number, number, number];
    dimensions: { width: number; height: number; depth: number };
  }) => void;

  // Plasticity-style view mode toggles
  toggleXRay: () => void;
  setXRayMode: (enabled: boolean) => void;
  toggleOrthographic: () => void;

  // Render mode actions (Indetails Smart patterns)
  setRenderMode: (mode: RenderMode) => void;
  setGhostCabinets: (cabinetIds: string[]) => void;
  setPreviewCabinets: (cabinetIds: string[]) => void;
  clearRenderOverrides: () => void;

  // CSG Boolean drill holes
  toggleCSGHoles: () => void;
  setCSGHoles: (enabled: boolean) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useViewStore = create<ViewState & ViewActions>((set, get) => ({
  // Initial state
  currentView: 'Perspective',
  isolatedCabinetId: null,
  cameraOverride: null,
  version: 0,
  xRayMode: false,
  isOrthographic: false,
  renderMode: 'NORMAL' as RenderMode,
  useCSGHoles: false,
  ghostCabinetIds: [],
  previewCabinetIds: [],

  // ─────────────────────────────────────────────────────────────────────────
  // View Preset Actions
  // ─────────────────────────────────────────────────────────────────────────
  setView: (view) => {
    set({
      currentView: view,
      cameraOverride: null, // Clear any override when switching presets
      version: get().version + 1,
    });
  },

  resetView: () => {
    set({
      currentView: 'Perspective',
      isolatedCabinetId: null,
      cameraOverride: null,
      version: get().version + 1,
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Isolate Actions
  // ─────────────────────────────────────────────────────────────────────────
  isolateCabinet: (cabinetId) => {
    set({
      isolatedCabinetId: cabinetId,
      version: get().version + 1,
    });
  },

  clearIsolation: () => {
    set({
      isolatedCabinetId: null,
      version: get().version + 1,
    });
  },

  toggleIsolation: (cabinetId) => {
    const current = get().isolatedCabinetId;
    if (current === cabinetId) {
      get().clearIsolation();
    } else {
      get().isolateCabinet(cabinetId);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Camera Focus Actions
  // ─────────────────────────────────────────────────────────────────────────
  focusOnTarget: (target) => {
    const { position, size } = target;

    // Calculate camera distance based on object size
    const maxDim = Math.max(size.width, size.height, size.depth);
    const distance = maxDim * 2.5; // Multiplier for comfortable viewing

    // Camera position: offset from center based on current view angle
    const cameraPos: [number, number, number] = [
      position[0] + distance * 0.7,
      position[1] + size.height / 2 + distance * 0.5,
      position[2] + distance * 0.7,
    ];

    // Target: center of object
    const cameraTarget: [number, number, number] = [
      position[0] + size.width / 2,
      position[1] + size.height / 2,
      position[2] + size.depth / 2,
    ];

    set({
      cameraOverride: {
        position: cameraPos,
        target: cameraTarget,
        fov: 45,
      },
      version: get().version + 1,
    });
  },

  clearCameraOverride: () => {
    set({
      cameraOverride: null,
      version: get().version + 1,
    });
  },

  focusOnCabinet: (cabinetId, cabinetData) => {
    get().focusOnTarget({
      position: cabinetData.position,
      size: cabinetData.dimensions,
    });
    get().isolateCabinet(cabinetId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Plasticity-Style View Mode Actions
  // ─────────────────────────────────────────────────────────────────────────
  toggleXRay: () => {
    const newValue = !get().xRayMode;
    set({
      xRayMode: newValue,
      version: get().version + 1,
    });
  },

  setXRayMode: (enabled) => {
    if (get().xRayMode !== enabled) {
      set({
        xRayMode: enabled,
        version: get().version + 1,
      });
    }
  },

  toggleOrthographic: () => {
    const newValue = !get().isOrthographic;
    set({
      isOrthographic: newValue,
      version: get().version + 1,
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Render Mode Actions (Indetails Smart Patterns)
  // ─────────────────────────────────────────────────────────────────────────
  setRenderMode: (mode) => {
    set({
      renderMode: mode,
      version: get().version + 1,
    });
  },

  setGhostCabinets: (cabinetIds) => {
    set({
      ghostCabinetIds: cabinetIds,
      version: get().version + 1,
    });
  },

  setPreviewCabinets: (cabinetIds) => {
    set({
      previewCabinetIds: cabinetIds,
      version: get().version + 1,
    });
  },

  clearRenderOverrides: () => {
    set({
      renderMode: 'NORMAL' as RenderMode,
      ghostCabinetIds: [],
      previewCabinetIds: [],
      version: get().version + 1,
    });
  },

  // CSG Boolean Drill Holes
  toggleCSGHoles: () => {
    set({
      useCSGHoles: !get().useCSGHoles,
      version: get().version + 1,
    });
  },

  setCSGHoles: (enabled) => {
    if (get().useCSGHoles !== enabled) {
      set({
        useCSGHoles: enabled,
        version: get().version + 1,
      });
    }
  },
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectCurrentView = (state: ViewState & ViewActions) => state.currentView;
export const selectIsolatedCabinetId = (state: ViewState & ViewActions) => state.isolatedCabinetId;
export const selectCameraOverride = (state: ViewState & ViewActions) => state.cameraOverride;
export const selectXRayMode = (state: ViewState & ViewActions) => state.xRayMode;
export const selectIsOrthographic = (state: ViewState & ViewActions) => state.isOrthographic;
export const selectRenderMode = (state: ViewState & ViewActions) => state.renderMode;
export const selectGhostCabinetIds = (state: ViewState & ViewActions) => state.ghostCabinetIds;
export const selectPreviewCabinetIds = (state: ViewState & ViewActions) => state.previewCabinetIds;
export const selectUseCSGHoles = (state: ViewState & ViewActions) => state.useCSGHoles;

// ============================================================================
// Export type
// ============================================================================

export type { ViewState, ViewActions, FocusTarget };

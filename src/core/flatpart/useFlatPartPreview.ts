/**
 * FlatPart Preview Store
 *
 * Zustand store for managing 2D preview state from sketch entities.
 * Ephemeral state - not persisted to localStorage.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  FlatPartPreview,
  Poly2,
  Path2D,
  PreviewFeature,
  createEmptyPreview,
} from './previewTypes';

// ============================================================================
// Store Types
// ============================================================================

interface FlatPartPreviewState {
  /** Current preview */
  preview: FlatPartPreview;

  /** Whether preview mode is active */
  isPreviewMode: boolean;

  /** Active panel target (cabinet panel ID) */
  targetPanelId: string | null;
}

interface FlatPartPreviewActions {
  /** Set the outline polygon */
  setOutline: (outline: Poly2) => void;

  /** Clear the outline */
  clearOutline: () => void;

  /** Add a cutout polygon */
  addCutout: (cutout: Poly2) => void;

  /** Remove a cutout by ID */
  removeCutout: (id: string) => void;

  /** Add a path */
  addPath: (path: Path2D) => void;

  /** Remove a path by ID */
  removePath: (id: string) => void;

  /** Add feature metadata */
  addFeature: (feature: PreviewFeature) => void;

  /** Clear all preview data */
  clearPreview: () => void;

  /** Set preview mode active/inactive */
  setPreviewMode: (active: boolean) => void;

  /** Set target panel ID */
  setTargetPanel: (panelId: string | null) => void;

  /** Reset store to initial state */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: FlatPartPreviewState = {
  preview: createEmptyPreview(),
  isPreviewMode: false,
  targetPanelId: null,
};

// ============================================================================
// Store
// ============================================================================

export const useFlatPartPreview = create<FlatPartPreviewState & FlatPartPreviewActions>()(
  immer((set, get) => ({
    ...initialState,

    setOutline: (outline) => {
      set((state) => {
        state.preview.outline = outline;
        state.preview.timestamp = Date.now();
        state.isPreviewMode = true;
      });
      console.log('[FlatPartPreview] Outline set:', outline.id);
    },

    clearOutline: () => {
      set((state) => {
        state.preview.outline = null;
        state.preview.timestamp = Date.now();
      });
      console.log('[FlatPartPreview] Outline cleared');
    },

    addCutout: (cutout) => {
      set((state) => {
        // Avoid duplicates
        const exists = state.preview.cutouts.some((c) => c.id === cutout.id);
        if (!exists) {
          state.preview.cutouts.push(cutout);
          state.preview.timestamp = Date.now();
        }
        state.isPreviewMode = true;
      });
      console.log('[FlatPartPreview] Cutout added:', cutout.id);
    },

    removeCutout: (id) => {
      set((state) => {
        state.preview.cutouts = state.preview.cutouts.filter((c) => c.id !== id);
        state.preview.timestamp = Date.now();
      });
      console.log('[FlatPartPreview] Cutout removed:', id);
    },

    addPath: (path) => {
      set((state) => {
        const exists = state.preview.paths.some((p) => p.id === path.id);
        if (!exists) {
          state.preview.paths.push(path);
          state.preview.timestamp = Date.now();
        }
        state.isPreviewMode = true;
      });
      console.log('[FlatPartPreview] Path added:', path.id);
    },

    removePath: (id) => {
      set((state) => {
        state.preview.paths = state.preview.paths.filter((p) => p.id !== id);
        state.preview.timestamp = Date.now();
      });
    },

    addFeature: (feature) => {
      set((state) => {
        state.preview.features.push(feature);
      });
    },

    clearPreview: () => {
      set((state) => {
        state.preview = createEmptyPreview();
        state.isPreviewMode = false;
      });
      console.log('[FlatPartPreview] Preview cleared');
    },

    setPreviewMode: (active) => {
      set((state) => {
        state.isPreviewMode = active;
      });
    },

    setTargetPanel: (panelId) => {
      set((state) => {
        state.targetPanelId = panelId;
      });
    },

    reset: () => {
      set(() => ({ ...initialState, preview: createEmptyPreview() }));
      console.log('[FlatPartPreview] Reset');
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const useFlatPartPreviewOutline = () =>
  useFlatPartPreview((s) => s.preview.outline);

export const useFlatPartPreviewCutouts = () =>
  useFlatPartPreview((s) => s.preview.cutouts);

export const useFlatPartPreviewPaths = () =>
  useFlatPartPreview((s) => s.preview.paths);

export const useIsPreviewMode = () =>
  useFlatPartPreview((s) => s.isPreviewMode);

export const useFlatPartPreviewData = () =>
  useFlatPartPreview((s) => s.preview);

export default useFlatPartPreview;

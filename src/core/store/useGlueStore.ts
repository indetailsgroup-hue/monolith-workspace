/**
 * Glue Store - State management for cabinet-to-cabinet alignment tool
 *
 * Features:
 * - Face-to-face alignment (6 faces: left, right, front, back, top, bottom)
 * - Two-step selection: source face → target face
 * - Visual feedback with face highlighting
 * - Keyboard shortcuts support (L/R/F/B/T/Bo)
 */

import { create } from 'zustand';

// ============================================
// TYPES
// ============================================

export type CabinetFace = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom';

export interface FaceSelection {
  cabinetId: string;
  face: CabinetFace;
}

export type GlueMode = 'idle' | 'selectSource' | 'selectTarget' | 'preview';

export interface GlueState {
  // Current mode
  mode: GlueMode;

  // Selected faces
  source: FaceSelection | null;
  target: FaceSelection | null;

  // Hover state for visual feedback
  hoveredFace: FaceSelection | null;

  // Offset between faces (optional gap)
  offset: number; // mm

  // Actions
  startGlue: () => void;
  cancelGlue: () => void;
  selectFace: (cabinetId: string, face: CabinetFace) => void;
  selectFaceByKey: (face: CabinetFace) => void;
  setHoveredFace: (selection: FaceSelection | null) => void;
  setOffset: (offset: number) => void;
  confirmGlue: () => void;
  reset: () => void;
}

// ============================================
// FACE METADATA
// ============================================

export const FACE_INFO: Record<CabinetFace, {
  label: string;
  shortcut: string;
  axis: 'x' | 'y' | 'z';
  direction: 1 | -1;
  color: string;
}> = {
  left: {
    label: 'Left',
    shortcut: 'L',
    axis: 'x',
    direction: -1,
    color: '#ef4444', // Red
  },
  right: {
    label: 'Right',
    shortcut: 'R',
    axis: 'x',
    direction: 1,
    color: '#22c55e', // Green
  },
  front: {
    label: 'Front',
    shortcut: 'F',
    axis: 'z',
    direction: 1,
    color: '#3b82f6', // Blue
  },
  back: {
    label: 'Back',
    shortcut: 'B',
    axis: 'z',
    direction: -1,
    color: '#f59e0b', // Amber
  },
  top: {
    label: 'Top',
    shortcut: 'T',
    axis: 'y',
    direction: 1,
    color: '#8b5cf6', // Purple
  },
  bottom: {
    label: 'Bottom',
    shortcut: 'O', // 'O' for bOttom to avoid conflict with 'B' for back
    axis: 'y',
    direction: -1,
    color: '#ec4899', // Pink
  },
};

// Map keyboard shortcuts to faces
export const SHORTCUT_TO_FACE: Record<string, CabinetFace> = {
  l: 'left',
  r: 'right',
  f: 'front',
  b: 'back',
  t: 'top',
  o: 'bottom', // 'O' for bOttom
};

// ============================================
// STORE
// ============================================

export const useGlueStore = create<GlueState>((set, get) => ({
  mode: 'idle',
  source: null,
  target: null,
  hoveredFace: null,
  offset: 0,

  startGlue: () => {
    set({
      mode: 'selectSource',
      source: null,
      target: null,
      hoveredFace: null,
    });
  },

  cancelGlue: () => {
    set({
      mode: 'idle',
      source: null,
      target: null,
      hoveredFace: null,
    });
  },

  selectFace: (cabinetId: string, face: CabinetFace) => {
    const state = get();

    if (state.mode === 'selectSource') {
      // Select source face - mode will change to selectTarget
      set({
        source: { cabinetId, face },
        mode: 'selectTarget',
      });
    } else if (state.mode === 'selectTarget') {
      // Can't select same cabinet
      if (cabinetId === state.source?.cabinetId) {
        return;
      }

      // Select target face - mode will change to preview
      set({
        target: { cabinetId, face },
        mode: 'preview',
      });
    }
  },

  selectFaceByKey: (face: CabinetFace) => {
    const state = get();

    // Need a hovered or selected cabinet to apply face selection
    if (state.hoveredFace) {
      state.selectFace(state.hoveredFace.cabinetId, face);
    }
  },

  setHoveredFace: (selection: FaceSelection | null) => {
    set({ hoveredFace: selection });
  },

  setOffset: (offset: number) => {
    set({ offset: Math.max(0, offset) });
  },

  confirmGlue: () => {
    const state = get();
    if (state.mode !== 'preview' || !state.source || !state.target) {
      return;
    }

    // The actual alignment is done by the component that calls this
    // After alignment, reset to idle
    set({
      mode: 'idle',
      source: null,
      target: null,
      hoveredFace: null,
    });
  },

  reset: () => {
    set({
      mode: 'idle',
      source: null,
      target: null,
      hoveredFace: null,
      offset: 0,
    });
  },
}));

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Check if glue mode is active
 */
export function useIsGlueModeActive(): boolean {
  return useGlueStore((s) => s.mode !== 'idle');
}

/**
 * Get the current glue step description
 */
export function useGlueStepDescription(): string {
  const mode = useGlueStore((s) => s.mode);
  const source = useGlueStore((s) => s.source);

  switch (mode) {
    case 'idle':
      return '';
    case 'selectSource':
      return 'Click a face on the SOURCE cabinet (or hover + press L/R/F/B/T/O)';
    case 'selectTarget':
      return `Source: ${source?.face.toUpperCase()} face selected. Now click TARGET cabinet face`;
    case 'preview':
      return 'Press Enter to confirm, Esc to cancel';
    default:
      return '';
  }
}

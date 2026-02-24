/**
 * useSelectionStore.ts - Selection Mode Store
 *
 * Manages selection mode (point/edge/face/object/sketch).
 * Used by Radial Menu for context-aware actions.
 *
 * T015: Added panel hover tracking and overlap cycling for UX improvements.
 *
 * @version 1.1.0
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type SelectionKind = 'object' | 'face' | 'edge' | 'point' | 'sketch';

interface SelectionState {
  /** Current selection mode */
  kind: SelectionKind;

  /** Selected entity IDs (for future use) */
  selectedIds: string[];

  /** T015: Currently hovered panel ID (null if none) */
  hoveredPanelId: string | null;

  /** T015: Overlap candidates for Tab cycling (stable order: by distance then id) */
  overlapCandidates: string[];

  /** T015: Current index in overlap cycle */
  overlapIndex: number;
}

interface SelectionActions {
  /** Set selection mode */
  setKind: (kind: SelectionKind) => void;

  /** Add to selection */
  select: (ids: string[]) => void;

  /** Remove from selection */
  deselect: (ids: string[]) => void;

  /** Clear selection */
  clearSelection: () => void;

  /** Toggle selection */
  toggleSelection: (id: string) => void;

  /** T015: Set hovered panel ID (transient, does not persist) */
  setHoveredPanel: (id: string | null) => void;

  /** T015: Set overlap candidates (called on click with multiple hits) */
  setOverlapCandidates: (ids: string[]) => void;

  /** T015: Cycle to next overlap candidate (Tab key) */
  cycleOverlapNext: () => string | null;

  /** T015: Cycle to previous overlap candidate (Shift+Tab key) */
  cycleOverlapPrev: () => string | null;

  /** T015: Clear overlap state */
  clearOverlap: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useSelectionStore = create<SelectionState & SelectionActions>((set, get) => ({
  kind: 'object',
  selectedIds: [],
  hoveredPanelId: null,
  overlapCandidates: [],
  overlapIndex: 0,

  setKind: (kind) => {
    set({ kind });
  },

  select: (ids) => {
    set((state) => ({
      selectedIds: [...new Set([...state.selectedIds, ...ids])],
    }));
  },

  deselect: (ids) => {
    set((state) => ({
      selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
    }));
  },

  clearSelection: () => {
    set({ selectedIds: [], overlapCandidates: [], overlapIndex: 0 });
  },

  toggleSelection: (id) => {
    const { selectedIds } = get();
    if (selectedIds.includes(id)) {
      get().deselect([id]);
    } else {
      get().select([id]);
    }
  },

  // T015: Hover tracking (transient)
  // T017: Made idempotent - no-op if unchanged to prevent subscriber re-renders
  setHoveredPanel: (id) => {
    if (get().hoveredPanelId === id) return; // T017: Early return if unchanged
    set({ hoveredPanelId: id });
  },

  // T015: Set overlap candidates for Tab cycling
  setOverlapCandidates: (ids) => {
    set({ overlapCandidates: ids, overlapIndex: 0 });
  },

  // T015: Cycle to next candidate
  cycleOverlapNext: () => {
    const { overlapCandidates, overlapIndex } = get();
    if (overlapCandidates.length === 0) return null;
    const nextIndex = (overlapIndex + 1) % overlapCandidates.length;
    const nextId = overlapCandidates[nextIndex];
    set({ overlapIndex: nextIndex, selectedIds: [nextId] });
    return nextId;
  },

  // T015: Cycle to previous candidate
  cycleOverlapPrev: () => {
    const { overlapCandidates, overlapIndex } = get();
    if (overlapCandidates.length === 0) return null;
    const prevIndex = (overlapIndex - 1 + overlapCandidates.length) % overlapCandidates.length;
    const prevId = overlapCandidates[prevIndex];
    set({ overlapIndex: prevIndex, selectedIds: [prevId] });
    return prevId;
  },

  // T015: Clear overlap state
  clearOverlap: () => {
    set({ overlapCandidates: [], overlapIndex: 0 });
  },
}));

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert number key to selection kind
 */
export function selectionKeyToKind(key: string): SelectionKind | null {
  switch (key) {
    case '1': return 'point';
    case '2': return 'edge';
    case '3': return 'face';
    case '4': return 'object';
    default: return null;
  }
}

/**
 * Get display name for selection kind
 */
export function getSelectionKindLabel(kind: SelectionKind): string {
  switch (kind) {
    case 'point': return 'Point';
    case 'edge': return 'Edge';
    case 'face': return 'Face';
    case 'object': return 'Object';
    case 'sketch': return 'Sketch';
    default: return kind;
  }
}

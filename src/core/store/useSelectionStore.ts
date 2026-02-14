/**
 * Selection Store - Hover/Selection State (Stub)
 *
 * Tracks which panel is hovered for highlight effects.
 */

import { create } from 'zustand';

interface SelectionState {
  hoveredPanelId: string | null;
  setHoveredPanel: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  hoveredPanelId: null,
  setHoveredPanel: (id) => set({ hoveredPanelId: id }),
}));

/**
 * View Store - Viewport Display State
 *
 * Manages X-ray mode, cabinet isolation, ghost mode, and current view.
 */

import { create } from 'zustand';

// ============================================
// TYPES
// ============================================

interface ViewState {
  xRayMode: boolean;
  isolatedCabinetId: string | null;
  ghostCabinetIds: string[];
  previewCabinetIds: string[];
  currentView: string;
}

interface ViewActions {
  toggleXRay: () => void;
  setXRayMode: (enabled: boolean) => void;
  isolateCabinet: (id: string | null) => void;
  setGhostCabinets: (ids: string[]) => void;
  setPreviewCabinets: (ids: string[]) => void;
  setCurrentView: (view: string) => void;
}

type ViewStore = ViewState & ViewActions;

// ============================================
// STORE
// ============================================

export const useViewStore = create<ViewStore>()((set) => ({
  xRayMode: false,
  isolatedCabinetId: null,
  ghostCabinetIds: [],
  previewCabinetIds: [],
  currentView: 'Perspective',

  toggleXRay: () => set((s) => ({ xRayMode: !s.xRayMode })),
  setXRayMode: (enabled) => set({ xRayMode: enabled }),
  isolateCabinet: (id) => set({ isolatedCabinetId: id }),
  setGhostCabinets: (ids) => set({ ghostCabinetIds: ids }),
  setPreviewCabinets: (ids) => set({ previewCabinetIds: ids }),
  setCurrentView: (view) => set({ currentView: view }),
}));

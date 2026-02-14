/**
 * Snap Store - Snap/Alignment State (Stub)
 *
 * Tracks active snapping state for the viewport.
 */

import { create } from 'zustand';

interface SnapState {
  isSnapping: boolean;
  activeSnapId: string | null;
  clearActiveSnap: () => void;
  setSnapping: (snapping: boolean) => void;
}

export const useSnapStore = create<SnapState>()((set) => ({
  isSnapping: false,
  activeSnapId: null,
  clearActiveSnap: () => set({ activeSnapId: null, isSnapping: false }),
  setSnapping: (snapping) => set({ isSnapping: snapping }),
}));

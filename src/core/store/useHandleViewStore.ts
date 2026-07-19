/**
 * useHandleViewStore.ts - Scene-level visibility switch for handle hardware.
 *
 * Rendering only. Toggling handles off hides the meshes; it does NOT change the
 * cabinet, the BOM or the cut list. A handle that is configured is still bought
 * and still billed whether or not you are looking at it.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';

interface HandleViewState {
  /** Whether handle meshes are drawn in the 3D scene. */
  showHandles: boolean;
  setShowHandles: (show: boolean) => void;
  toggleShowHandles: () => void;
}

export const useHandleViewStore = create<HandleViewState>((set) => ({
  showHandles: true,
  setShowHandles: (show) => set({ showHandles: show }),
  toggleShowHandles: () => set((state) => ({ showHandles: !state.showHandles })),
}));

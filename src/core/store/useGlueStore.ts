/**
 * Glue Store - Cabinet Glue/Alignment Mode State
 *
 * Manages the glue workflow: idle → selecting-source → selecting-target → preview → idle
 * App.tsx subscribes to state transitions to trigger cabinet position updates.
 */

import { create } from 'zustand';

// ============================================
// TYPES
// ============================================

interface GlueFaceRef {
  cabinetId: string;
  face: string;
}

type GlueMode = 'idle' | 'selecting-source' | 'selecting-target' | 'preview';

interface GlueState {
  mode: GlueMode;
  source: GlueFaceRef | null;
  target: GlueFaceRef | null;
}

interface GlueActions {
  startGlue: () => void;
  selectSource: (cabinetId: string, face: string) => void;
  selectTarget: (cabinetId: string, face: string) => void;
  confirmGlue: () => void;
  cancelGlue: () => void;
  reset: () => void;
}

type GlueStore = GlueState & GlueActions;

// ============================================
// STORE
// ============================================

export const useGlueStore = create<GlueStore>()((set) => ({
  mode: 'idle',
  source: null,
  target: null,

  startGlue: () => set({ mode: 'selecting-source', source: null, target: null }),

  selectSource: (cabinetId, face) =>
    set({ mode: 'selecting-target', source: { cabinetId, face } }),

  selectTarget: (cabinetId, face) =>
    set((state) => ({
      mode: 'preview',
      target: { cabinetId, face },
      source: state.source,
    })),

  confirmGlue: () => set({ mode: 'idle' }),

  cancelGlue: () => set({ mode: 'idle', source: null, target: null }),

  reset: () => set({ mode: 'idle', source: null, target: null }),
}));

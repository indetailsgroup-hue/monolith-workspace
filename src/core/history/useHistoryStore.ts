/**
 * useHistoryStore.ts - Feature History Management
 *
 * FEATURES:
 * - Track all features (operations) for undo/redo
 * - Record CABINET_SNAP for audit trail
 * - Gate validation integration point
 *
 * ARCHITECTURE:
 * - Features are immutable and timestamped
 * - Undo marks features as undone, doesn't delete
 * - Redo clears undone flag
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { FeatureNode, FeatureKind } from './historyTypes';

// ============================================
// TYPES
// ============================================

export interface HistoryState {
  // Current job/project ID
  jobId: string;

  // All features in chronological order
  features: FeatureNode[];

  // Current position in history (for undo/redo)
  currentIndex: number;

  // Actions
  setJobId: (jobId: string) => void;
  addFeature: (feature: FeatureNode) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Query
  getFeaturesByKind: (kind: FeatureKind) => FeatureNode[];
  getFeaturesByRef: (refId: string) => FeatureNode[];
  getLastFeature: () => FeatureNode | null;

  // Clear
  clearHistory: () => void;
}

// ============================================
// STORE
// ============================================

export const useHistoryStore = create<HistoryState>()(
  immer((set, get) => ({
    jobId: 'default-job',
    features: [],
    currentIndex: -1,

    setJobId: (jobId) => set((state) => {
      state.jobId = jobId;
    }),

    addFeature: (feature) => set((state) => {
      // Remove any features after currentIndex (they were undone and now we're branching)
      if (state.currentIndex < state.features.length - 1) {
        state.features = state.features.slice(0, state.currentIndex + 1);
      }

      // Add new feature
      state.features.push(feature);
      state.currentIndex = state.features.length - 1;

      console.log(`[History] Added feature: ${feature.kind} (${feature.id})`);
    }),

    undo: () => {
      const { currentIndex, features } = get();
      if (currentIndex < 0) return false;

      set((state) => {
        const feature = state.features[state.currentIndex];
        if (feature) {
          feature.undone = true;
          state.currentIndex--;
          console.log(`[History] Undo: ${feature.kind} (${feature.id})`);
        }
      });

      return true;
    },

    redo: () => {
      const { currentIndex, features } = get();
      if (currentIndex >= features.length - 1) return false;

      set((state) => {
        state.currentIndex++;
        const feature = state.features[state.currentIndex];
        if (feature) {
          feature.undone = false;
          console.log(`[History] Redo: ${feature.kind} (${feature.id})`);
        }
      });

      return true;
    },

    canUndo: () => {
      return get().currentIndex >= 0;
    },

    canRedo: () => {
      const { currentIndex, features } = get();
      return currentIndex < features.length - 1;
    },

    getFeaturesByKind: (kind) => {
      return get().features.filter(f => f.kind === kind && !f.undone);
    },

    getFeaturesByRef: (refId) => {
      return get().features.filter(f =>
        !f.undone && (f.inputRefs.includes(refId) || f.outputRefs.includes(refId))
      );
    },

    getLastFeature: () => {
      const { features, currentIndex } = get();
      return features[currentIndex] || null;
    },

    clearHistory: () => set((state) => {
      state.features = [];
      state.currentIndex = -1;
      console.log('[History] Cleared');
    }),
  }))
);

// ============================================
// SELECTORS
// ============================================

export const useFeatures = () => useHistoryStore((s) => s.features.filter(f => !f.undone));
export const useCanUndo = () => useHistoryStore((s) => s.canUndo());
export const useCanRedo = () => useHistoryStore((s) => s.canRedo());
export const useCurrentFeature = () => useHistoryStore((s) => s.getLastFeature());

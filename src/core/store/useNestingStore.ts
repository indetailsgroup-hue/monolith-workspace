/**
 * useNestingStore.ts - Sheet Nesting State Management
 *
 * Zustand store for managing nesting optimization results.
 * Bridges NestingPanel UI component with the export pipeline.
 *
 * ## Data Flow:
 * ```
 * NestingPanel.onNestingComplete(sheets)
 *   → useNestingStore.setNestingSheets(sheets)
 *   → createContextProviderFromStore({ getNestingSheets })
 *   → monolithFactoryPackageExporter
 * ```
 *
 * @version 1.0.0 - T027 Phase 2: Export Pipeline Wiring
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { NestingSheet } from '../export/monolith/monolithExportContext';

// ============================================================================
// STATE TYPES
// ============================================================================

interface NestingState {
  // ─────────────────────────────────────────────────────────────────────────
  // DATA
  // ─────────────────────────────────────────────────────────────────────────
  /** Nesting sheets from last optimization run (null = never run) */
  nestingSheets: NestingSheet[] | null;
  /** Whether optimization is currently running */
  isOptimizing: boolean;
  /** Error message from last failed run */
  error: string | null;
  /** Timestamp of last successful optimization */
  lastOptimizedAt: number | null;

  // ─────────────────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────────────────
  /** Index of currently selected/viewed sheet tab */
  selectedSheetIndex: number;
  /** Whether the NestingPanel is expanded in the export panel */
  isPanelExpanded: boolean;
}

interface NestingActions {
  // ─────────────────────────────────────────────────────────────────────────
  // DATA ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /** Store nesting results from NestingPanel */
  setNestingSheets: (sheets: NestingSheet[]) => void;
  /** Set optimizing state */
  setIsOptimizing: (optimizing: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Clear all nesting data */
  clearNesting: () => void;

  // ─────────────────────────────────────────────────────────────────────────
  // UI ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  /** Select a sheet tab by index */
  selectSheet: (index: number) => void;
  /** Toggle panel expanded state */
  togglePanel: () => void;
  /** Set panel expanded state */
  setPanelExpanded: (expanded: boolean) => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useNestingStore = create<NestingState & NestingActions>()(
  immer((set) => ({
    // Initial state
    nestingSheets: null,
    isOptimizing: false,
    error: null,
    lastOptimizedAt: null,
    selectedSheetIndex: 0,
    isPanelExpanded: false,

    // Data actions
    setNestingSheets: (sheets) =>
      set((state) => {
        state.nestingSheets = sheets;
        state.error = null;
        state.lastOptimizedAt = Date.now();
        state.selectedSheetIndex = 0;
      }),

    setIsOptimizing: (optimizing) =>
      set((state) => {
        state.isOptimizing = optimizing;
        if (optimizing) {
          state.error = null;
        }
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
        state.isOptimizing = false;
      }),

    clearNesting: () =>
      set((state) => {
        state.nestingSheets = null;
        state.isOptimizing = false;
        state.error = null;
        state.lastOptimizedAt = null;
        state.selectedSheetIndex = 0;
      }),

    // UI actions
    selectSheet: (index) =>
      set((state) => {
        state.selectedSheetIndex = index;
      }),

    togglePanel: () =>
      set((state) => {
        state.isPanelExpanded = !state.isPanelExpanded;
      }),

    setPanelExpanded: (expanded) =>
      set((state) => {
        state.isPanelExpanded = expanded;
      }),
  })),
);

// ============================================================================
// SELECTOR HELPERS
// ============================================================================

/**
 * Get nesting sheets for export pipeline.
 * Used by createContextProviderFromStore's getNestingSheets callback.
 */
export function getNestingSheetsForExport(): NestingSheet[] | undefined {
  const sheets = useNestingStore.getState().nestingSheets;
  return sheets ?? undefined;
}

/**
 * Check if nesting results are available.
 */
export function hasNestingResults(): boolean {
  return useNestingStore.getState().nestingSheets !== null;
}

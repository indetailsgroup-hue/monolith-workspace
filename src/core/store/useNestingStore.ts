/**
 * useNestingStore.ts - Sheet Nesting State Management
 *
 * Zustand store for managing nesting optimization results.
 * Bridges NestingPanel UI component with the export pipeline.
 *
 * ## Data Flow:
 * ```
 * NestingPanel.onNestingComplete({ sheets, unplacedParts })
 *   → useNestingStore.setNestingSheets(sheets, unplacedParts)
 *   → createContextProviderFromStore({ getNestingSheets })
 *   → monolithFactoryPackageExporter
 * ```
 *
 * ## Why `unplacedParts` is stored, not just displayed
 *
 * `NestingSheet[]` only ever contains parts that were actually PLACED. A part
 * too large for the board — a full-length worktop run, a machine-max panel — is
 * simply absent from it, and an absent part looks identical to a part that was
 * never ordered. That is a part nobody cuts and nobody quotes.
 *
 * So the unplaced list travels with the layout all the way into this store, and
 * `getNestingSheetsForExport()` REFUSES to hand a layout to the export pipeline
 * while that list is non-empty. The type system cannot force a caller to check a
 * sibling field; it can force one to deal with `undefined`.
 *
 * @version 2.0.0 - unplaced parts are carried across the panel→store→export seam
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { NestingSheet } from '../export/monolith/monolithExportContext';
import type { NestingPart } from '../../nesting/types';

// ============================================================================
// STATE TYPES
// ============================================================================

interface NestingState {
  // ─────────────────────────────────────────────────────────────────────────
  // DATA
  // ─────────────────────────────────────────────────────────────────────────
  /** Nesting sheets from last optimization run (null = never run) */
  nestingSheets: NestingSheet[] | null;
  /**
   * Parts the optimizer could not place on any sheet in any allowed
   * orientation. While this is non-empty, `nestingSheets` is a PARTIAL layout
   * and must not be treated as a cut list.
   */
  unplacedParts: NestingPart[];
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
  /**
   * Store nesting results from NestingPanel.
   *
   * `unplacedParts` is REQUIRED, not optional: a caller that has a layout also
   * has the unplaced list (they are returned together by `runNesting`), and
   * making it optional would let the drop reappear as a missing argument.
   */
  setNestingSheets: (sheets: NestingSheet[], unplacedParts: NestingPart[]) => void;
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
    unplacedParts: [],
    isOptimizing: false,
    error: null,
    lastOptimizedAt: null,
    selectedSheetIndex: 0,
    isPanelExpanded: false,

    // Data actions
    setNestingSheets: (sheets, unplacedParts) =>
      set((state) => {
        state.nestingSheets = sheets;
        state.unplacedParts = unplacedParts;
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
        state.unplacedParts = [];
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
 *
 * Returns `undefined` — the same as "never run" — whenever ANY part was left
 * unplaced. A `NestingSheet[]` that is missing parts is indistinguishable, to
 * every downstream consumer (buildDxfSheets, buildCutListCsv, the factory
 * package), from a complete one. Refusing to return it is the only way to stop
 * a truncated cut list from reaching the shop floor, because there is no way to
 * express "this layout is incomplete" in the `NestingSheet[]` type itself.
 *
 * Callers that want the layout regardless (a preview, a diagnostic) should read
 * `useNestingStore.getState().nestingSheets` directly and handle
 * `unplacedParts` themselves.
 */
export function getNestingSheetsForExport(): NestingSheet[] | undefined {
  const { nestingSheets, unplacedParts } = useNestingStore.getState();
  if (unplacedParts.length > 0) return undefined;
  return nestingSheets ?? undefined;
}

/**
 * Check if a COMPLETE nesting result is available.
 * A run that left parts unplaced does not count as a result.
 */
export function hasNestingResults(): boolean {
  const { nestingSheets, unplacedParts } = useNestingStore.getState();
  return nestingSheets !== null && unplacedParts.length === 0;
}

/**
 * Whether the last run produced a layout that is missing parts.
 * Distinct from `!hasNestingResults()`, which is also true before any run.
 */
export function hasUnplacedParts(): boolean {
  return useNestingStore.getState().unplacedParts.length > 0;
}

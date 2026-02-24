/**
 * Gate UI Store
 *
 * Zustand store for Safety Gate UI state management.
 * Tracks validation results, selection, and running state.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import { create } from 'zustand';
import type { GateResult, GateUIState, GateUIActions } from './gateTypes';

// ============================================
// INITIAL STATE
// ============================================

const initialState: GateUIState = {
  lastResult: null,
  isRunning: false,
  selectedFindingKey: null,
  selectedEntityIds: [],
};

// ============================================
// STORE
// ============================================

export const useGateStore = create<GateUIState & GateUIActions>((set, get) => ({
  // Initial state
  ...initialState,

  // ────────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────────

  setResult: (result: GateResult) => {
    set({ lastResult: result, isRunning: false });
    console.log(
      `[GateStore] Result: ${result.passed ? 'PASSED' : 'FAILED'} ` +
      `(${result.findings.blockers.length} blockers, ` +
      `${result.findings.warnings.length} warnings)`
    );
  },

  setRunning: (running: boolean) => {
    set({ isRunning: running });
    if (running) {
      console.log('[GateStore] Validation running...');
    }
  },

  selectFinding: (findingKey: string, entityIds: string[]) => {
    set({
      selectedFindingKey: findingKey,
      selectedEntityIds: entityIds,
    });
    console.log(`[GateStore] Selected finding: ${findingKey}`, entityIds);
  },

  clearSelection: () => {
    set({
      selectedFindingKey: null,
      selectedEntityIds: [],
    });
  },

  reset: () => {
    set(initialState);
    console.log('[GateStore] Reset');
  },
}));

// ============================================
// SELECTORS
// ============================================

export const selectLastResult = (s: GateUIState) => s.lastResult;
export const selectIsRunning = (s: GateUIState) => s.isRunning;
export const selectSelectedFindingKey = (s: GateUIState) => s.selectedFindingKey;
export const selectSelectedEntityIds = (s: GateUIState) => s.selectedEntityIds;

/**
 * Selector: Is there at least one blocker?
 */
export const selectHasBlockers = (s: GateUIState): boolean => {
  return (s.lastResult?.findings.blockers.length ?? 0) > 0;
};

/**
 * Selector: Total finding count
 */
export const selectTotalFindingCount = (s: GateUIState): number => {
  if (!s.lastResult) return 0;
  const { blockers, warnings, info } = s.lastResult.findings;
  return blockers.length + warnings.length + info.length;
};

// ============================================
// HOOKS
// ============================================

/**
 * Hook: Get pass/fail status
 */
export function useGatePassed(): boolean | null {
  return useGateStore(s => s.lastResult?.passed ?? null);
}

/**
 * Hook: Get selected finding details
 */
export function useSelectedFinding() {
  const result = useGateStore(s => s.lastResult);
  const key = useGateStore(s => s.selectedFindingKey);

  if (!result || !key) return null;

  const all = [
    ...result.findings.blockers,
    ...result.findings.warnings,
    ...result.findings.info,
  ];
  return all.find(f => f.key === key) ?? null;
}

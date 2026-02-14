/**
 * useExportGate - Gate Enforcement Hook for Export/Release
 *
 * Derives export permissions from Gate validation results.
 * Provides clear yes/no decisions for:
 * - canFreeze: Can transition DRAFT → FROZEN
 * - canRelease: Can transition FROZEN → RELEASED
 * - canExport: Can generate factory output (DXF, CNC, etc.)
 *
 * @version 1.0.0 - Phase B1: Gate Enforcement
 */

import { useCallback, useMemo } from 'react';
import { useGateStore, selectHasBlockers } from './gateStore';
import { openSafetyTab } from '../../designer/state/useIntentPanelStore';
import type { GateResult, GateFinding } from './gateTypes';

// ============================================
// TYPES
// ============================================

export interface ExportGateStatus {
  /** Can freeze spec (DRAFT → FROZEN) - requires no blockers */
  canFreeze: boolean;

  /** Can release spec (FROZEN → RELEASED) - requires no blockers */
  canRelease: boolean;

  /** Can export DXF/CNC output - requires no blockers */
  canExport: boolean;

  /** Has gate been run at all */
  hasRun: boolean;

  /** Is validation currently running */
  isRunning: boolean;

  /** Number of blockers */
  blockerCount: number;

  /** Number of warnings (non-blocking) */
  warningCount: number;

  /** Blockers list for display */
  blockers: GateFinding[];

  /** Full result for advanced use */
  result: GateResult | null;
}

export interface ExportGateActions {
  /** Open Safety tab and focus on first blocker */
  openFirstBlocker: () => void;

  /** Get reason why export is blocked */
  getBlockReason: () => string;
}

// ============================================
// HOOK
// ============================================

export function useExportGate(): ExportGateStatus & ExportGateActions {
  const result = useGateStore((s) => s.lastResult);
  const isRunning = useGateStore((s) => s.isRunning);
  const hasBlockers = useGateStore(selectHasBlockers);
  const selectFinding = useGateStore((s) => s.selectFinding);

  // Derived values
  const status = useMemo<ExportGateStatus>(() => {
    const hasRun = result !== null;
    const blockers = result?.findings.blockers ?? [];
    const warnings = result?.findings.warnings ?? [];

    // Core rule: No blockers = can proceed
    const canProceed = hasRun && blockers.length === 0;

    return {
      canFreeze: canProceed,
      canRelease: canProceed,
      canExport: canProceed,
      hasRun,
      isRunning,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      blockers,
      result,
    };
  }, [result, isRunning]);

  // Actions
  const openFirstBlocker = useCallback(() => {
    const firstBlocker = status.blockers[0];
    if (firstBlocker) {
      // Select the finding and open Safety tab
      selectFinding(firstBlocker.key, firstBlocker.entityIds);
      openSafetyTab();
      console.log('[ExportGate] Opened Safety tab, selected:', firstBlocker.key);
    } else {
      // No blockers, just open Safety tab
      openSafetyTab();
    }
  }, [status.blockers, selectFinding]);

  const getBlockReason = useCallback((): string => {
    if (status.isRunning) {
      return 'Validation is running...';
    }
    if (!status.hasRun) {
      return 'Gate validation has not been run yet';
    }
    if (status.blockerCount === 0) {
      return ''; // No block
    }
    if (status.blockerCount === 1) {
      return `1 blocker: ${status.blockers[0]?.message ?? 'Unknown issue'}`;
    }
    return `${status.blockerCount} blockers must be resolved`;
  }, [status]);

  return {
    ...status,
    openFirstBlocker,
    getBlockReason,
  };
}

// ============================================
// NON-REACT ACCESS
// ============================================

/**
 * Get export gate status outside React (for imperative code)
 */
export function getExportGateStatus(): ExportGateStatus {
  const state = useGateStore.getState();
  const result = state.lastResult;
  const hasRun = result !== null;
  const blockers = result?.findings.blockers ?? [];
  const warnings = result?.findings.warnings ?? [];
  const canProceed = hasRun && blockers.length === 0;

  return {
    canFreeze: canProceed,
    canRelease: canProceed,
    canExport: canProceed,
    hasRun,
    isRunning: state.isRunning,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    result,
  };
}

/**
 * Check if export is allowed (simple boolean check)
 */
export function isExportAllowed(): boolean {
  const { canExport, hasRun } = getExportGateStatus();
  return hasRun && canExport;
}

/**
 * Check if freeze is allowed
 */
export function isFreezeAllowed(): boolean {
  const { canFreeze, hasRun } = getExportGateStatus();
  return hasRun && canFreeze;
}

/**
 * Check if release is allowed
 */
export function isReleaseAllowed(): boolean {
  const { canRelease, hasRun } = getExportGateStatus();
  return hasRun && canRelease;
}

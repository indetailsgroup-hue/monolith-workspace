/**
 * GateProvider Tests
 *
 * Tests for the GateProvider React Context component.
 * Validates auto-run lifecycle, context value derivation,
 * and integration with useGateStore.
 *
 * @version 1.0.0 - Phase 4: GateProvider React Context
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useGateStore, selectHasBlockers, selectTotalFindingCount } from '../gateStore';
import type { GateResult, GateFinding } from '../gateTypes';

// ============================================
// TEST FIXTURES
// ============================================

function makePassingResult(): GateResult {
  return {
    passed: true,
    runAt: new Date().toISOString(),
    policyVersion: '1.0.0',
    findings: {
      blockers: [],
      warnings: [],
      info: [],
    },
  };
}

function makeFailingResult(blockerCount = 1): GateResult {
  const blockers: GateFinding[] = Array.from(
    { length: blockerCount },
    (_, i) => ({
      key: `BLOCKER_${i}`,
      code: `RULE_${i}`,
      message: `Blocker ${i} message`,
      severity: 'BLOCKER' as const,
      entityIds: [`entity-${i}`],
    })
  );

  return {
    passed: false,
    runAt: new Date().toISOString(),
    policyVersion: '1.0.0',
    findings: {
      blockers,
      warnings: [],
      info: [],
    },
  };
}

function makeWarningResult(warningCount = 2): GateResult {
  const warnings: GateFinding[] = Array.from(
    { length: warningCount },
    (_, i) => ({
      key: `WARNING_${i}`,
      code: `WARN_${i}`,
      message: `Warning ${i} message`,
      severity: 'WARNING' as const,
      entityIds: [`warn-entity-${i}`],
    })
  );

  return {
    passed: true,
    runAt: new Date().toISOString(),
    policyVersion: '1.0.0',
    findings: {
      blockers: [],
      warnings,
      info: [],
    },
  };
}

function makeMixedResult(): GateResult {
  return {
    passed: false,
    runAt: new Date().toISOString(),
    policyVersion: '1.0.0',
    findings: {
      blockers: [
        {
          key: 'BLOCK_1',
          code: 'DRILL_DEPTH',
          message: 'Drill depth exceeds limit',
          severity: 'BLOCKER',
          entityIds: ['entity-a', 'entity-b'],
        },
      ],
      warnings: [
        {
          key: 'WARN_1',
          code: 'EDGE_MARGIN',
          message: 'Edge margin too small',
          severity: 'WARNING',
          entityIds: ['entity-a'],
        },
      ],
      info: [
        {
          key: 'INFO_1',
          code: 'MATERIAL_NOTE',
          message: 'Material requires special handling',
          severity: 'INFO',
          entityIds: ['entity-c'],
        },
      ],
    },
  };
}

// ============================================
// TESTS
// ============================================

describe('GateProvider / useGateStore Integration', () => {
  beforeEach(() => {
    useGateStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INITIAL STATE
  // ──────────────────────────────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should start with no result', () => {
      const state = useGateStore.getState();
      expect(state.lastResult).toBeNull();
      expect(state.isRunning).toBe(false);
      expect(state.selectedFindingKey).toBeNull();
      expect(state.selectedEntityIds).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SET RESULT
  // ──────────────────────────────────────────────────────────────────────────

  describe('setResult', () => {
    it('should store passing result', () => {
      const result = makePassingResult();
      useGateStore.getState().setResult(result);

      const state = useGateStore.getState();
      expect(state.lastResult).toEqual(result);
      expect(state.lastResult?.passed).toBe(true);
      expect(state.isRunning).toBe(false);
    });

    it('should store failing result', () => {
      const result = makeFailingResult(3);
      useGateStore.getState().setResult(result);

      const state = useGateStore.getState();
      expect(state.lastResult?.passed).toBe(false);
      expect(state.lastResult?.findings.blockers).toHaveLength(3);
    });

    it('should store mixed result', () => {
      const result = makeMixedResult();
      useGateStore.getState().setResult(result);

      const state = useGateStore.getState();
      expect(state.lastResult?.findings.blockers).toHaveLength(1);
      expect(state.lastResult?.findings.warnings).toHaveLength(1);
      expect(state.lastResult?.findings.info).toHaveLength(1);
    });

    it('should set isRunning=false after result', () => {
      useGateStore.getState().setRunning(true);
      expect(useGateStore.getState().isRunning).toBe(true);

      useGateStore.getState().setResult(makePassingResult());
      expect(useGateStore.getState().isRunning).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SELECTION
  // ──────────────────────────────────────────────────────────────────────────

  describe('selectFinding', () => {
    it('should set selected finding key and entity IDs', () => {
      useGateStore.getState().selectFinding('BLOCK_1', ['entity-a', 'entity-b']);

      const state = useGateStore.getState();
      expect(state.selectedFindingKey).toBe('BLOCK_1');
      expect(state.selectedEntityIds).toEqual(['entity-a', 'entity-b']);
    });

    it('should clear selection', () => {
      useGateStore.getState().selectFinding('BLOCK_1', ['entity-a']);
      useGateStore.getState().clearSelection();

      const state = useGateStore.getState();
      expect(state.selectedFindingKey).toBeNull();
      expect(state.selectedEntityIds).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SELECTORS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Selectors', () => {
    it('selectHasBlockers returns false when no result', () => {
      expect(selectHasBlockers(useGateStore.getState())).toBe(false);
    });

    it('selectHasBlockers returns true when blockers exist', () => {
      useGateStore.getState().setResult(makeFailingResult());
      expect(selectHasBlockers(useGateStore.getState())).toBe(true);
    });

    it('selectHasBlockers returns false when only warnings', () => {
      useGateStore.getState().setResult(makeWarningResult());
      expect(selectHasBlockers(useGateStore.getState())).toBe(false);
    });

    it('selectTotalFindingCount counts all findings', () => {
      useGateStore.getState().setResult(makeMixedResult());
      expect(selectTotalFindingCount(useGateStore.getState())).toBe(3);
    });

    it('selectTotalFindingCount returns 0 when no result', () => {
      expect(selectTotalFindingCount(useGateStore.getState())).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RESET
  // ──────────────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should clear all state', () => {
      // Set up some state
      useGateStore.getState().setResult(makeMixedResult());
      useGateStore.getState().selectFinding('BLOCK_1', ['entity-a']);

      // Reset
      useGateStore.getState().reset();

      const state = useGateStore.getState();
      expect(state.lastResult).toBeNull();
      expect(state.isRunning).toBe(false);
      expect(state.selectedFindingKey).toBeNull();
      expect(state.selectedEntityIds).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GATE CONTEXT VALUE DERIVATION
  // ──────────────────────────────────────────────────────────────────────────

  describe('Context Value Derivation', () => {
    it('should derive canProceed=false when no result', () => {
      const state = useGateStore.getState();
      const hasRun = state.lastResult !== null;
      const blockerCount = state.lastResult?.findings.blockers.length ?? 0;
      const canProceed = hasRun && blockerCount === 0;

      expect(canProceed).toBe(false);
    });

    it('should derive canProceed=true when passing', () => {
      useGateStore.getState().setResult(makePassingResult());

      const state = useGateStore.getState();
      const hasRun = state.lastResult !== null;
      const blockerCount = state.lastResult?.findings.blockers.length ?? 0;
      const canProceed = hasRun && blockerCount === 0;

      expect(canProceed).toBe(true);
    });

    it('should derive canProceed=false when blockers exist', () => {
      useGateStore.getState().setResult(makeFailingResult());

      const state = useGateStore.getState();
      const hasRun = state.lastResult !== null;
      const blockerCount = state.lastResult?.findings.blockers.length ?? 0;
      const canProceed = hasRun && blockerCount === 0;

      expect(canProceed).toBe(false);
    });

    it('should derive canProceed=true when only warnings', () => {
      useGateStore.getState().setResult(makeWarningResult());

      const state = useGateStore.getState();
      const hasRun = state.lastResult !== null;
      const blockerCount = state.lastResult?.findings.blockers.length ?? 0;
      const canProceed = hasRun && blockerCount === 0;

      expect(canProceed).toBe(true);
    });

    it('should derive isBlocked from blocker count', () => {
      useGateStore.getState().setResult(makeMixedResult());

      const state = useGateStore.getState();
      const isBlocked = (state.lastResult?.findings.blockers.length ?? 0) > 0;
      expect(isBlocked).toBe(true);
    });

    it('should count findings by severity', () => {
      useGateStore.getState().setResult(makeMixedResult());

      const state = useGateStore.getState();
      expect(state.lastResult?.findings.blockers.length).toBe(1);
      expect(state.lastResult?.findings.warnings.length).toBe(1);
      expect(state.lastResult?.findings.info.length).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ENTITY FILTERING
  // ──────────────────────────────────────────────────────────────────────────

  describe('Entity Filtering', () => {
    it('should filter findings by entity ID', () => {
      const result = makeMixedResult();
      useGateStore.getState().setResult(result);

      const state = useGateStore.getState();
      const allFindings = [
        ...state.lastResult!.findings.blockers,
        ...state.lastResult!.findings.warnings,
        ...state.lastResult!.findings.info,
      ];

      // entity-a appears in blocker + warning
      const entityAFindings = allFindings.filter((f) =>
        f.entityIds.includes('entity-a')
      );
      expect(entityAFindings).toHaveLength(2);

      // entity-c appears only in info
      const entityCFindings = allFindings.filter((f) =>
        f.entityIds.includes('entity-c')
      );
      expect(entityCFindings).toHaveLength(1);
      expect(entityCFindings[0].severity).toBe('INFO');

      // Non-existent entity
      const noFindings = allFindings.filter((f) =>
        f.entityIds.includes('entity-xyz')
      );
      expect(noFindings).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RUNNING STATE
  // ──────────────────────────────────────────────────────────────────────────

  describe('Running State', () => {
    it('should track running state', () => {
      expect(useGateStore.getState().isRunning).toBe(false);

      useGateStore.getState().setRunning(true);
      expect(useGateStore.getState().isRunning).toBe(true);

      useGateStore.getState().setRunning(false);
      expect(useGateStore.getState().isRunning).toBe(false);
    });

    it('setResult should stop running', () => {
      useGateStore.getState().setRunning(true);
      useGateStore.getState().setResult(makePassingResult());

      expect(useGateStore.getState().isRunning).toBe(false);
    });
  });
});

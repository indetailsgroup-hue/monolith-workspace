/**
 * useExportGate Hook Tests
 *
 * Tests for Gate enforcement hook that controls export/freeze/release permissions.
 *
 * @version 1.0.0 - Phase B1: Gate Enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGateStore } from '../gateStore';
import {
  getExportGateStatus,
  isExportAllowed,
  isFreezeAllowed,
  isReleaseAllowed,
} from '../useExportGate';
import type { GateResult } from '../gateTypes';

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

function makeFailingResult(blockerCount: number = 1): GateResult {
  const blockers = Array.from({ length: blockerCount }, (_, i) => ({
    key: `BLOCKER_${i}`,
    code: `RULE_${i}`,
    message: `Blocker ${i} message`,
    severity: 'BLOCKER' as const,
    entityIds: [`entity-${i}`],
  }));

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

function makeWarningResult(warningCount: number = 1): GateResult {
  const warnings = Array.from({ length: warningCount }, (_, i) => ({
    key: `WARNING_${i}`,
    code: `WARN_${i}`,
    message: `Warning ${i} message`,
    severity: 'WARNING' as const,
    entityIds: [`entity-${i}`],
  }));

  return {
    passed: true, // Warnings don't fail
    runAt: new Date().toISOString(),
    policyVersion: '1.0.0',
    findings: {
      blockers: [],
      warnings,
      info: [],
    },
  };
}

// ============================================
// TESTS
// ============================================

describe('useExportGate', () => {
  beforeEach(() => {
    // Reset store before each test
    useGateStore.getState().reset();
  });

  describe('getExportGateStatus', () => {
    it('should return hasRun=false when no result exists', () => {
      const status = getExportGateStatus();
      expect(status.hasRun).toBe(false);
      expect(status.canFreeze).toBe(false);
      expect(status.canRelease).toBe(false);
      expect(status.canExport).toBe(false);
    });

    it('should allow all actions when gate passes', () => {
      useGateStore.getState().setResult(makePassingResult());

      const status = getExportGateStatus();
      expect(status.hasRun).toBe(true);
      expect(status.canFreeze).toBe(true);
      expect(status.canRelease).toBe(true);
      expect(status.canExport).toBe(true);
      expect(status.blockerCount).toBe(0);
    });

    it('should block all actions when gate has blockers', () => {
      useGateStore.getState().setResult(makeFailingResult(3));

      const status = getExportGateStatus();
      expect(status.hasRun).toBe(true);
      expect(status.canFreeze).toBe(false);
      expect(status.canRelease).toBe(false);
      expect(status.canExport).toBe(false);
      expect(status.blockerCount).toBe(3);
    });

    it('should allow actions when gate has only warnings', () => {
      useGateStore.getState().setResult(makeWarningResult(5));

      const status = getExportGateStatus();
      expect(status.hasRun).toBe(true);
      expect(status.canFreeze).toBe(true);
      expect(status.canRelease).toBe(true);
      expect(status.canExport).toBe(true);
      expect(status.blockerCount).toBe(0);
      expect(status.warningCount).toBe(5);
    });

    it('should provide blocker list for display', () => {
      useGateStore.getState().setResult(makeFailingResult(2));

      const status = getExportGateStatus();
      expect(status.blockers).toHaveLength(2);
      expect(status.blockers[0].key).toBe('BLOCKER_0');
      expect(status.blockers[1].key).toBe('BLOCKER_1');
    });

    it('should track running state', () => {
      useGateStore.getState().setRunning(true);

      const status = getExportGateStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('isExportAllowed', () => {
    it('should return false when gate not run', () => {
      expect(isExportAllowed()).toBe(false);
    });

    it('should return true when gate passes', () => {
      useGateStore.getState().setResult(makePassingResult());
      expect(isExportAllowed()).toBe(true);
    });

    it('should return false when gate has blockers', () => {
      useGateStore.getState().setResult(makeFailingResult());
      expect(isExportAllowed()).toBe(false);
    });
  });

  describe('isFreezeAllowed', () => {
    it('should return false when gate not run', () => {
      expect(isFreezeAllowed()).toBe(false);
    });

    it('should return true when gate passes', () => {
      useGateStore.getState().setResult(makePassingResult());
      expect(isFreezeAllowed()).toBe(true);
    });

    it('should return false when gate has blockers', () => {
      useGateStore.getState().setResult(makeFailingResult());
      expect(isFreezeAllowed()).toBe(false);
    });
  });

  describe('isReleaseAllowed', () => {
    it('should return false when gate not run', () => {
      expect(isReleaseAllowed()).toBe(false);
    });

    it('should return true when gate passes', () => {
      useGateStore.getState().setResult(makePassingResult());
      expect(isReleaseAllowed()).toBe(true);
    });

    it('should return false when gate has blockers', () => {
      useGateStore.getState().setResult(makeFailingResult());
      expect(isReleaseAllowed()).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('should update status when result changes from fail to pass', () => {
      // Start with failing
      useGateStore.getState().setResult(makeFailingResult());
      expect(isExportAllowed()).toBe(false);

      // Fix issues and re-run gate
      useGateStore.getState().setResult(makePassingResult());
      expect(isExportAllowed()).toBe(true);
    });

    it('should update status when result changes from pass to fail', () => {
      // Start with passing
      useGateStore.getState().setResult(makePassingResult());
      expect(isExportAllowed()).toBe(true);

      // Something broke
      useGateStore.getState().setResult(makeFailingResult());
      expect(isExportAllowed()).toBe(false);
    });

    it('should handle reset correctly', () => {
      // Set a result
      useGateStore.getState().setResult(makePassingResult());
      expect(isExportAllowed()).toBe(true);

      // Reset
      useGateStore.getState().reset();
      expect(isExportAllowed()).toBe(false);
      expect(getExportGateStatus().hasRun).toBe(false);
    });
  });
});

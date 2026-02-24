/**
 * calculateCncCoordinate - Unit Tests (Connector OS v1.1)
 *
 * Tests CNC coordinate calculation with both legacy and
 * NCenterPolicy-based N-axis computation.
 *
 * @see Master Specification v1.1 §4, §8
 */

import { describe, it, expect } from 'vitest';
import { calculateCncCoordinate } from '../calculateCncCoordinate';
import type { Stack } from '../calculateCncCoordinate';
import type { NCenterPolicy } from '../types';

// HMR 18mm + HPL 0.8mm × 2 = 19.6mm finished, PVC 1.0mm
const STACK_HMR18: Stack = {
  core: 18.0,
  finished: 19.6,
  pvc: 1.0,
};

describe('calculateCncCoordinate', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Legacy behavior (no NCenterPolicy)
  // ──────────────────────────────────────────────────────────────────────

  describe('Legacy (no policy)', () => {
    it('DRILL_ON_FINISHED → U=24, V=37.0, N=9.0', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED');

      expect(result.u).toBe(24.0);
      expect(result.v).toBe(37.0);
      expect(result.n).toBe(9.0);
    });

    it('DRILL_ON_CORE → V compensates PVC (V=36.0)', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_CORE');

      expect(result.v).toBe(36.0); // 37 - 1.0
      expect(result.n).toBe(9.0);  // Still core/2
    });

    it('N = core/2, NOT finished/2', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED');

      // N must be 9.0 (core/2), NOT 9.8 (finished/2)
      expect(result.n).toBe(9.0);
      expect(result.n).not.toBe(9.8);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // NCenterPolicy (v1.1)
  // ──────────────────────────────────────────────────────────────────────

  describe('NCenterPolicy (v1.1)', () => {
    it('FINISHED_CENTER with offset -0.8 → N=9.0', () => {
      const policy: NCenterPolicy = {
        base: 'FINISHED_CENTER',
        offsetMm: -0.8,
      };

      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED', policy);

      // (19.6 / 2) + (-0.8) = 9.8 - 0.8 = 9.0
      expect(result.n).toBe(9.0);
    });

    it('CORE_CENTER with offset 0 → N=9.0', () => {
      const policy: NCenterPolicy = {
        base: 'CORE_CENTER',
        offsetMm: 0,
      };

      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED', policy);

      // (18.0 / 2) + 0 = 9.0
      expect(result.n).toBe(9.0);
    });

    it('FINISHED_CENTER with offset +1.0 → N=10.8', () => {
      const policy: NCenterPolicy = {
        base: 'FINISHED_CENTER',
        offsetMm: 1.0,
      };

      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED', policy);

      // (19.6 / 2) + 1.0 = 9.8 + 1.0 = 10.8
      expect(result.n).toBe(10.8);
    });

    it('policy does NOT affect V-axis calculation', () => {
      const policy: NCenterPolicy = {
        base: 'FINISHED_CENTER',
        offsetMm: -0.8,
      };

      const finished = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED', policy);
      const core = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_CORE', policy);

      expect(finished.v).toBe(37.0);
      expect(core.v).toBe(36.0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Master Spec §8 Unit Test — FAIL conditions
  // ──────────────────────────────────────────────────────────────────────

  describe('Master Spec §8 — Mandatory Pass/Fail', () => {
    it('Input: S=37, FinishedThk=19.6, CoreThk=18.0, Mode=FINISHED → V=37.0, N=9.0', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED');

      expect(result.v).toBe(37.0);
      expect(result.n).toBe(9.0);
    });

    it('MUST NOT produce V=36.0 in FINISHED mode', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED');

      expect(result.v).not.toBe(36.0);
    });

    it('MUST NOT produce N=9.8 (finished center without offset)', () => {
      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED');

      expect(result.n).not.toBe(9.8);
    });

    it('v1.1 policy also yields correct N=9.0', () => {
      const policy: NCenterPolicy = {
        base: 'FINISHED_CENTER',
        offsetMm: -0.8,
      };

      const result = calculateCncCoordinate(37, 24, STACK_HMR18, 'DRILL_ON_FINISHED', policy);

      expect(result.v).toBe(37.0);
      expect(result.n).toBe(9.0);
    });
  });
});

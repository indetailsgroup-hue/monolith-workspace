/**
 * Connector OS v1.1 Unit Test Suite
 *
 * Validates CNC coordinate calculation logic for structural connectors
 * on finished 19.6mm panels (HMR 18 + HPL 0.8x2 + PVC 1.0).
 *
 * Tests cover:
 * - N-axis centering (Core Rule)
 * - V-axis mode-dependent compensation (DRILL_ON_CORE vs DRILL_ON_FINISHED)
 * - Target J10 transform logic (B = A - 25)
 * - Gate G11 mode-mismatch detection
 *
 * @see docs/connector-os/gate-g11.md
 * @see docs/connector-os/material-stack.md
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCncCoordinate,
  targetJ10Transform,
  type Stack,
  type ManufacturingMode,
} from '../calculateCncCoordinate';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PREMIUM_STACK: Stack = { core: 18.0, finished: 19.6, pvc: 1.0 };
const THICK_HPL_STACK: Stack = { core: 18.0, finished: 20.4, pvc: 1.0 };
const THICK_PVC_STACK: Stack = { core: 18.0, finished: 19.6, pvc: 2.0 };
const THIN_STACK_16: Stack = { core: 16.0, finished: 17.6, pvc: 1.0 };

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: N-Axis Centering (Structural Rule)
// ─────────────────────────────────────────────────────────────────────────────

describe('N-Axis Centering (Core Rule)', () => {
  it('should center structural hole on CORE (9.0) even on 19.6mm panel', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.n).toBe(9.0);
  });

  it('should center on CORE (9.0) in DRILL_ON_CORE mode too', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(result.n).toBe(9.0);
  });

  it('should NOT use finished center (9.8) - this would cause misalignment', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.n).not.toBe(PREMIUM_STACK.finished / 2); // 9.8
  });

  it('should center on CORE (9.0) with thicker HPL (1.2mm x2 = 20.4mm finished)', () => {
    const result = calculateCncCoordinate(37.0, 24.0, THICK_HPL_STACK, 'DRILL_ON_FINISHED');
    expect(result.n).toBe(9.0);
    expect(result.n).not.toBe(THICK_HPL_STACK.finished / 2); // 10.2
  });

  it('should center on 8.0mm for 16mm core board', () => {
    const result = calculateCncCoordinate(37.0, 24.0, THIN_STACK_16, 'DRILL_ON_FINISHED');
    expect(result.n).toBe(8.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: V-Axis in DRILL_ON_FINISHED Mode
// ─────────────────────────────────────────────────────────────────────────────

describe('V-Axis: DRILL_ON_FINISHED Mode', () => {
  it('should NOT subtract PVC in DRILL_ON_FINISHED mode (V=37.0)', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.v).toBe(37.0);
  });

  it('should NOT subtract even with thick PVC (2.0mm)', () => {
    const result = calculateCncCoordinate(37.0, 24.0, THICK_PVC_STACK, 'DRILL_ON_FINISHED');
    expect(result.v).toBe(37.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: V-Axis in DRILL_ON_CORE Mode
// ─────────────────────────────────────────────────────────────────────────────

describe('V-Axis: DRILL_ON_CORE Mode', () => {
  it('should subtract PVC in DRILL_ON_CORE mode (V=36.0)', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(result.v).toBe(36.0);
  });

  it('should subtract thick PVC (2.0mm) correctly (V=35.0)', () => {
    const result = calculateCncCoordinate(37.0, 24.0, THICK_PVC_STACK, 'DRILL_ON_CORE');
    expect(result.v).toBe(35.0);
  });

  it('V + PVC should always equal System32 target in DRILL_ON_CORE', () => {
    const s = 37.0;
    const result = calculateCncCoordinate(s, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(result.v + PREMIUM_STACK.pvc).toBe(s);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Target J10 B = A - 25 Transform Logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Target J10 Transform (B = A - 25)', () => {
  it('should calculate B=9.5 when A=34.5', () => {
    const B = targetJ10Transform(34.5);
    expect(B).toBe(9.5);
    const result = calculateCncCoordinate(37.0, B, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.u).toBe(9.5);
  });

  it('should calculate B=7.0 when A=32.0', () => {
    const B = targetJ10Transform(32.0);
    expect(B).toBe(7.0);
  });

  it('should calculate B=0 when A=25', () => {
    const B = targetJ10Transform(25.0);
    expect(B).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: U-Axis Pass-Through (Distance B)
// ─────────────────────────────────────────────────────────────────────────────

describe('U-Axis Pass-Through', () => {
  it('should pass through Minifix B=24 directly', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.u).toBe(24.0);
  });

  it('should pass through Minifix B=34 directly', () => {
    const result = calculateCncCoordinate(37.0, 34.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.u).toBe(34.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Gate G11 Mode-Mismatch Detection
// ─────────────────────────────────────────────────────────────────────────────

describe('Gate G11: Mode-Coordinate Consistency', () => {
  it('DRILL_ON_FINISHED must emit V=37.0, not V=36.0', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    expect(result.v).toBe(37.0);
    expect(result.v).not.toBe(36.0); // 36.0 would be DRILL_ON_CORE coordinate
  });

  it('DRILL_ON_CORE must emit V=36.0, not V=37.0', () => {
    const result = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(result.v).toBe(36.0);
    expect(result.v).not.toBe(37.0); // 37.0 would be DRILL_ON_FINISHED coordinate
  });

  it('mode difference must equal PVC thickness exactly', () => {
    const finished = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    const core = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(finished.v - core.v).toBe(PREMIUM_STACK.pvc);
  });

  it('N-center must be identical regardless of mode', () => {
    const finished = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
    const core = calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
    expect(finished.n).toBe(core.n);
    expect(finished.n).toBe(9.0);
  });
});

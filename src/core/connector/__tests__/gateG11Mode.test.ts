/**
 * Connector OS v1.1 - Gate G11 Validation Tests
 *
 * Tests manufacturing audit rules: mode consistency, pairing, spacing.
 *
 * @see docs/connector-os/gate-g11.md
 */

import { describe, it, expect } from 'vitest';
import {
  validateG11Mode,
  validateG11Pairing,
  validateG11Spacing,
} from '../gateG11Mode';
import type { ConnectorDrillOp } from '../types';

// ──────────────────────────────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────────────────────────────

function makeOp(overrides: {
  pairId: string;
  featureId: string;
  role?: 'STRUCTURAL' | 'AUXILIARY';
  v?: number;
  mode?: string;
}): ConnectorDrillOp {
  return {
    type: 'DRILL',
    params: {
      dia: 15,
      depth: 13.5,
      u: 24,
      v: overrides.v ?? 37,
      n: 9,
    },
    meta: {
      connectorId: 'HAFELE_MINIFIX_15_B24',
      pairId: overrides.pairId,
      featureId: overrides.featureId,
      instanceIndex: 0,
      role: overrides.role ?? 'STRUCTURAL',
      frame: 'CORE',
    },
    tags: [
      'CONN=HAFELE_MINIFIX_15_B24',
      `ROLE=${overrides.role ?? 'STRUCTURAL'}`,
      `MODE=${overrides.mode ?? 'DRILL_ON_FINISHED'}`,
    ],
  };
}

describe('validateG11Mode', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Test 5 (spec): Mode mismatch → FAIL
  // ──────────────────────────────────────────────────────────────────────
  it('mode mismatch: ops tagged DRILL_ON_CORE but declared DRILL_ON_FINISHED → FAIL', () => {
    const ops = [
      makeOp({
        pairId: 'PAIR_J1_0',
        featureId: 'CAM',
        v: 36.0,
        mode: 'DRILL_ON_CORE',
      }),
      makeOp({
        pairId: 'PAIR_J1_0',
        featureId: 'BOLT',
        v: 36.0,
        mode: 'DRILL_ON_CORE',
      }),
    ];

    const result = validateG11Mode(ops, 'DRILL_ON_FINISHED');
    expect(result.status).toBe('FAIL');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].code).toBe('G11_MODE_MISMATCH');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Matching mode → PASS
  // ──────────────────────────────────────────────────────────────────────
  it('matching mode → PASS', () => {
    const ops = [
      makeOp({
        pairId: 'PAIR_J1_0',
        featureId: 'CAM',
        mode: 'DRILL_ON_FINISHED',
      }),
      makeOp({
        pairId: 'PAIR_J1_0',
        featureId: 'BOLT',
        mode: 'DRILL_ON_FINISHED',
      }),
    ];

    const result = validateG11Mode(ops, 'DRILL_ON_FINISHED');
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // AUXILIARY ops are skipped (only STRUCTURAL checked)
  // ──────────────────────────────────────────────────────────────────────
  it('AUXILIARY ops are not checked for mode', () => {
    const ops = [
      makeOp({
        pairId: 'PAIR_J1_0',
        featureId: 'SHELF_PIN',
        role: 'AUXILIARY',
        mode: 'DRILL_ON_CORE',
      }),
    ];

    const result = validateG11Mode(ops, 'DRILL_ON_FINISHED');
    expect(result.status).toBe('PASS');
  });
});

describe('validateG11Pairing', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Test 7 (spec): Missing counterpart → FAIL
  // ──────────────────────────────────────────────────────────────────────
  it('missing counterpart: CAM without BOLT → FAIL', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM' }),
      // No BOLT for PAIR_J1_0 → should fail
    ];

    const result = validateG11Pairing(ops);
    expect(result.status).toBe('FAIL');
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].code).toBe('G11_PAIRING_VIOLATION');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Complete pair → PASS
  // ──────────────────────────────────────────────────────────────────────
  it('complete pair (CAM + BOLT) → PASS', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM' }),
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'BOLT' }),
    ];

    const result = validateG11Pairing(ops);
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Multiple pairs - one incomplete → FAIL
  // ──────────────────────────────────────────────────────────────────────
  it('multiple pairs: one incomplete → FAIL with 1 issue', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM' }),
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'BOLT' }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'CAM' }),
      // Missing BOLT for PAIR_J1_1
    ];

    const result = validateG11Pairing(ops);
    expect(result.status).toBe('FAIL');
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].opId).toBe('PAIR_J1_1');
  });
});

describe('validateG11Spacing', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Spacing violation → FAIL
  // ──────────────────────────────────────────────────────────────────────
  it('spacing exceeds max → FAIL', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'BOLT', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'CAM', v: 200 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'BOLT', v: 200 }),
    ];

    // Gap = 200 - 37 = 163mm > 128mm
    const result = validateG11Spacing(ops, 128);
    expect(result.status).toBe('FAIL');
    expect(result.issues[0].code).toBe('G11_SPACING_VIOLATION');
  });

  // ──────────────────────────────────────────────────────────────────────
  // Spacing within limit → PASS
  // ──────────────────────────────────────────────────────────────────────
  it('spacing within max → PASS', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'BOLT', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'CAM', v: 69 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'BOLT', v: 69 }),
    ];

    // Gap = 69 - 37 = 32mm < 128mm
    const result = validateG11Spacing(ops, 128);
    expect(result.status).toBe('PASS');
    expect(result.issues).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────
  // HEAVY load max 96mm
  // ──────────────────────────────────────────────────────────────────────
  it('HEAVY spacing: 100mm gap with 96mm max → FAIL', () => {
    const ops = [
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'CAM', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_0', featureId: 'BOLT', v: 37 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'CAM', v: 137 }),
      makeOp({ pairId: 'PAIR_J1_1', featureId: 'BOLT', v: 137 }),
    ];

    // Gap = 137 - 37 = 100mm > 96mm
    const result = validateG11Spacing(ops, 96);
    expect(result.status).toBe('FAIL');
  });
});

/**
 * wearModel.test.ts - Tool Wear Model Tests
 *
 * Tests for D6-A wear calculation functions.
 * Verifies determinism, edge cases, and correctness.
 *
 * @version 1.0.0 - Phase D6-A
 */

import { describe, it, expect } from 'vitest';
import { MATERIAL_WEAR_WEIGHT, computeToolHealth, computeWearUnits } from '../wearModel';

describe('D6-A wearModel', () => {
  it('wear weights are conservative and ordered as expected', () => {
    expect(MATERIAL_WEAR_WEIGHT.HPL).toBeGreaterThan(MATERIAL_WEAR_WEIGHT.MDF);
    expect(MATERIAL_WEAR_WEIGHT.MELAMINE).toBeGreaterThan(MATERIAL_WEAR_WEIGHT.PLYWOOD);
    expect(MATERIAL_WEAR_WEIGHT.UNKNOWN).toBeGreaterThan(MATERIAL_WEAR_WEIGHT.MDF);
  });

  it('computeWearUnits is deterministic', () => {
    const a = computeWearUnits({ count: 10, depthMm: 18, material: 'HPL' });
    const b = computeWearUnits({ count: 10, depthMm: 18, material: 'HPL' });
    expect(a).toBe(b);
  });

  it('computeWearUnits clamps negatives and non-finite safely', () => {
    expect(computeWearUnits({ count: -1, depthMm: 18, material: 'MDF' })).toBe(0);
    expect(computeWearUnits({ count: 1, depthMm: -18, material: 'MDF' })).toBe(0);

    // @ts-expect-error deliberate
    expect(computeWearUnits({ count: Number.NaN, depthMm: 18, material: 'MDF' })).toBe(0);
  });

  it('computeToolHealth returns expected status bands', () => {
    const threshold = { toolId: 'DRILL_5', maxWearUnits: 1000 };

    const ok = computeToolHealth({ toolId: 'DRILL_5', wearUnits: 100, threshold });
    expect(ok.status).toBe('OK');

    const nearing = computeToolHealth({ toolId: 'DRILL_5', wearUnits: 900, threshold, nearingLimitPct: 85 });
    expect(nearing.status).toBe('NEARING_LIMIT');

    const over = computeToolHealth({ toolId: 'DRILL_5', wearUnits: 1200, threshold });
    expect(over.status).toBe('OVER_LIMIT');
  });
});

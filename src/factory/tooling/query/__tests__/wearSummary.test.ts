/**
 * wearSummary.test.ts - Wear Summary Tests
 *
 * Tests for D6-E.1 wear breakdown helpers.
 *
 * @version 1.0.0 - Phase D6-E.1
 */

import { describe, it, expect } from 'vitest';
import { summarizeWearByMaterial } from '../wearSummary';
import type { ToolUsageRecord } from '../../types';

describe('D6-E.1 wearSummary', () => {
  it('returns breakdown with percentages summing to 100', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_5',
      totalHoles: 100,
      totalDepthMm: 1800,
      wearUnits: 150,
      byMaterial: {
        MDF: { holes: 50, depthMm: 900, wearUnits: 50 },
        HPL: { holes: 30, depthMm: 540, wearUnits: 60 },
        MELAMINE: { holes: 20, depthMm: 360, wearUnits: 40 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.toolId).toBe('DRILL_5');
    expect(summary.totalWearUnits).toBe(150);
    expect(summary.items).toHaveLength(3);

    // Check percentages sum to 100
    const sumPct = summary.items.reduce((acc, i) => acc + i.percent, 0);
    expect(sumPct).toBeCloseTo(100, 1);
  });

  it('returns empty items when total is 0', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_8',
      totalHoles: 0,
      totalDepthMm: 0,
      wearUnits: 0,
      byMaterial: {},
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.toolId).toBe('DRILL_8');
    expect(summary.totalWearUnits).toBe(0);
    expect(summary.items).toHaveLength(0);
  });

  it('sets percent to 0 when byMaterial has entries but totalWearUnits is 0', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_8',
      totalHoles: 10,
      totalDepthMm: 100,
      wearUnits: 0, // edge case: record says 0 but has byMaterial
      byMaterial: {
        MDF: { holes: 10, depthMm: 100, wearUnits: 0 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.totalWearUnits).toBe(0);
    // byMaterial.MDF.wearUnits is 0, so it won't be included
    expect(summary.items).toHaveLength(0);
  });

  it('sorts items by wearUnits desc, then material asc', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_5',
      totalHoles: 100,
      totalDepthMm: 1800,
      wearUnits: 100,
      byMaterial: {
        MDF: { holes: 25, depthMm: 450, wearUnits: 25 },
        HPL: { holes: 50, depthMm: 900, wearUnits: 50 },
        MELAMINE: { holes: 25, depthMm: 450, wearUnits: 25 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    // HPL has most wear, so first
    expect(summary.items[0].material).toBe('HPL');
    expect(summary.items[0].wearUnits).toBe(50);

    // MDF and MELAMINE have same wearUnits, so sorted alphabetically
    expect(summary.items[1].material).toBe('MDF');
    expect(summary.items[2].material).toBe('MELAMINE');
  });

  it('handles single material correctly', () => {
    const record: ToolUsageRecord = {
      toolId: 'BORE_35',
      totalHoles: 50,
      totalDepthMm: 600,
      wearUnits: 100,
      byMaterial: {
        HPL: { holes: 50, depthMm: 600, wearUnits: 100 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].material).toBe('HPL');
    expect(summary.items[0].percent).toBe(100);
  });

  it('normalizes values to 3 decimal places', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_5',
      totalHoles: 100,
      totalDepthMm: 1000,
      wearUnits: 100.12345,
      byMaterial: {
        MDF: { holes: 100, depthMm: 1000, wearUnits: 100.12345 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.totalWearUnits).toBe(100.123);
    expect(summary.items[0].wearUnits).toBe(100.123);
  });

  it('clamps negative wearUnits to 0', () => {
    const record: ToolUsageRecord = {
      toolId: 'DRILL_5',
      totalHoles: 100,
      totalDepthMm: 1000,
      wearUnits: -50, // invalid
      byMaterial: {
        MDF: { holes: 100, depthMm: 1000, wearUnits: -50 },
      },
      updatedAt: Date.now(),
    };

    const summary = summarizeWearByMaterial(record);

    expect(summary.totalWearUnits).toBe(0);
    expect(summary.items).toHaveLength(0); // negative wearUnits in byMaterial filtered out
  });
});

/**
 * resetToolWear.test.ts - Reset Tool Wear Tests
 *
 * Tests for D6.1 resetToolWear functionality.
 * Uses fake-indexeddb for consistent testing.
 *
 * @version 1.0.0 - Phase D6.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetToolingDb,
  appendToolUsageEvents,
  getToolUsageRecord,
  setToolWearThreshold,
  getToolWearThreshold,
  resetToolWear,
  listToolWearThresholds,
  deleteToolWearThreshold,
  getMaintenanceLog,
  clearMaintenanceLog,
} from '../indexedDbToolingStore';
import type { ToolUsageEvent } from '../../types';

// Helper to create a tool usage event
function makeEvent(
  toolId: string,
  depthMm: number,
  material: 'MDF' | 'HPL' = 'MDF'
): ToolUsageEvent {
  return {
    jobId: 'test-job',
    machineId: 'KDT',
    dialect: 'FANUC',
    postVersion: '1.0.0',
    programHash: 'sha-test',
    packetContentHash: 'sha-packet',
    tool: { toolId, diameterMm: 5 },
    material,
    holeKind: 'DRILL',
    diameterMm: 5,
    depthMm,
    count: 1,
    occurredAt: Date.now(),
  };
}

describe('D6.1 resetToolWear', () => {
  beforeEach(async () => {
    await resetToolingDb();
    clearMaintenanceLog();
  });

  it('resets aggregated wear data to zero', async () => {
    // Add some usage
    await appendToolUsageEvents([
      makeEvent('DRILL_5', 100),
      makeEvent('DRILL_5', 50),
    ]);

    // Verify usage exists
    const before = await getToolUsageRecord('DRILL_5');
    expect(before).not.toBeNull();
    expect(before!.wearUnits).toBeGreaterThan(0);
    expect(before!.totalHoles).toBe(2);

    // Reset
    await resetToolWear('DRILL_5');

    // Verify reset
    const after = await getToolUsageRecord('DRILL_5');
    expect(after).not.toBeNull();
    expect(after!.wearUnits).toBe(0);
    expect(after!.totalHoles).toBe(0);
    expect(after!.totalDepthMm).toBe(0);
    expect(after!.byMaterial).toEqual({});
  });

  it('preserves threshold when resetting', async () => {
    // Add usage and threshold
    await appendToolUsageEvents([makeEvent('DRILL_5', 100)]);
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });

    // Reset wear
    await resetToolWear('DRILL_5');

    // Threshold should still exist
    const threshold = await getToolWearThreshold('DRILL_5');
    expect(threshold).not.toBeNull();
    expect(threshold!.maxWearUnits).toBe(5000);
  });

  it('handles non-existent tool gracefully', async () => {
    // Should not throw
    await expect(resetToolWear('NON_EXISTENT')).resolves.toBeUndefined();

    // Should create a fresh record
    const record = await getToolUsageRecord('NON_EXISTENT');
    expect(record).not.toBeNull();
    expect(record!.wearUnits).toBe(0);
  });

  it('allows re-tracking after reset', async () => {
    // Add usage, reset, add more
    await appendToolUsageEvents([makeEvent('DRILL_5', 100)]);
    await resetToolWear('DRILL_5');
    await appendToolUsageEvents([makeEvent('DRILL_5', 50)]);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record).not.toBeNull();
    // MDF weight = 1.0, so 50mm = 50 wear units
    expect(record!.wearUnits).toBe(50);
    expect(record!.totalHoles).toBe(1);
  });

  it('logs maintenance action with reason and note', async () => {
    await appendToolUsageEvents([makeEvent('DRILL_5', 100)]);

    await resetToolWear('DRILL_5', {
      reason: 'REPLACED',
      note: 'New tool installed',
    });

    const log = getMaintenanceLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].toolId).toBe('DRILL_5');
    expect(log[0].action).toBe('RESET');
    expect(log[0].reason).toBe('REPLACED');
    expect(log[0].note).toBe('New tool installed');
  });

  it('uses provided timestamp', async () => {
    const customTime = 1700000000000;

    await appendToolUsageEvents([makeEvent('DRILL_5', 100)]);
    await resetToolWear('DRILL_5', { occurredAt: customTime });

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.updatedAt).toBe(customTime);
  });
});

describe('D6.1 listToolWearThresholds', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('returns empty array when no thresholds set', async () => {
    const list = await listToolWearThresholds();
    expect(list).toEqual([]);
  });

  it('lists all custom thresholds', async () => {
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });
    await setToolWearThreshold({ toolId: 'DRILL_8', maxWearUnits: 8000 });
    await setToolWearThreshold({ toolId: 'BORE_35', maxWearUnits: 3000 });

    const list = await listToolWearThresholds();

    expect(list).toHaveLength(3);
    // Should be sorted by toolId
    expect(list[0].toolId).toBe('BORE_35');
    expect(list[1].toolId).toBe('DRILL_5');
    expect(list[2].toolId).toBe('DRILL_8');
  });
});

describe('D6.1 deleteToolWearThreshold', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('deletes existing threshold', async () => {
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });

    const deleted = await deleteToolWearThreshold('DRILL_5');
    expect(deleted).toBe(true);

    const threshold = await getToolWearThreshold('DRILL_5');
    expect(threshold).toBeNull();
  });

  it('returns false for non-existent threshold', async () => {
    const deleted = await deleteToolWearThreshold('NON_EXISTENT');
    expect(deleted).toBe(false);
  });
});

/**
 * indexedDbToolingStore.stress.test.ts - Stress & Concurrency Tests
 *
 * Tests for concurrent writes, large batches, and edge cases.
 * Addresses gaps identified in code review.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  appendToolUsageEvents,
  getToolUsageRecord,
  listToolUsageRecords,
  resetToolingDb,
  setToolWearThreshold,
  getToolWearThreshold,
  listToolWearThresholds,
} from '../indexedDbToolingStore';
import type { ToolUsageEvent, MaterialClass } from '../../types';

// ============================================
// HELPERS
// ============================================

function createEvent(
  toolId: string,
  depthMm: number,
  material: MaterialClass = 'MDF',
  overrides?: Partial<ToolUsageEvent>
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
    ...overrides,
  };
}

function createEventBatch(
  count: number,
  toolId: string = 'DRILL_5',
  depthMm: number = 10,
  material: MaterialClass = 'MDF'
): ToolUsageEvent[] {
  return Array.from({ length: count }, (_, i) =>
    createEvent(toolId, depthMm, material, {
      occurredAt: Date.now() + i,
    })
  );
}

// ============================================
// CONCURRENT WRITE TESTS
// ============================================

describe('IndexedDB Concurrent Writes', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('handles concurrent writes to same tool without data loss', async () => {
    const events1 = createEventBatch(5, 'DRILL_5', 10, 'MDF');
    const events2 = createEventBatch(5, 'DRILL_5', 20, 'HPL');

    // Write concurrently
    await Promise.all([
      appendToolUsageEvents(events1),
      appendToolUsageEvents(events2),
    ]);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record).not.toBeNull();

    // All 10 events should be counted
    expect(record!.totalHoles).toBe(10);

    // MDF: 5 * 10 * 1.0 = 50, HPL: 5 * 20 * 2.0 = 200
    // Total = 250
    expect(record!.wearUnits).toBe(250);
  });

  it('handles concurrent writes to different tools correctly', async () => {
    const drillEvents = createEventBatch(10, 'DRILL_5', 10);
    const boreEvents = createEventBatch(5, 'BORE_35', 12);

    await Promise.all([
      appendToolUsageEvents(drillEvents),
      appendToolUsageEvents(boreEvents),
    ]);

    const drill = await getToolUsageRecord('DRILL_5');
    const bore = await getToolUsageRecord('BORE_35');

    expect(drill!.totalHoles).toBe(10);
    expect(bore!.totalHoles).toBe(5);
  });

  it('handles rapid sequential writes correctly', async () => {
    // Simulate rapid fire events
    const promises: Promise<void>[] = [];

    for (let i = 0; i < 20; i++) {
      promises.push(
        appendToolUsageEvents([
          createEvent('DRILL_5', 10, 'MDF', { occurredAt: Date.now() + i }),
        ])
      );
    }

    await Promise.all(promises);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(20);
  });

  it('maintains data integrity with mixed concurrent operations', async () => {
    // Mix of different tools and materials
    const operations = [
      appendToolUsageEvents(createEventBatch(3, 'DRILL_5', 10, 'MDF')),
      appendToolUsageEvents(createEventBatch(2, 'DRILL_5', 15, 'HPL')),
      appendToolUsageEvents(createEventBatch(4, 'DRILL_8', 20, 'MELAMINE')),
      appendToolUsageEvents(createEventBatch(1, 'BORE_35', 12, 'PLYWOOD')),
    ];

    await Promise.all(operations);

    const records = await listToolUsageRecords();
    expect(records).toHaveLength(3); // DRILL_5, DRILL_8, BORE_35

    const drill5 = records.find((r) => r.toolId === 'DRILL_5');
    const drill8 = records.find((r) => r.toolId === 'DRILL_8');
    const bore35 = records.find((r) => r.toolId === 'BORE_35');

    expect(drill5!.totalHoles).toBe(5);
    expect(drill8!.totalHoles).toBe(4);
    expect(bore35!.totalHoles).toBe(1);
  });

  it('handles concurrent threshold updates', async () => {
    const thresholdOps = [
      setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 }),
      setToolWearThreshold({ toolId: 'DRILL_8', maxWearUnits: 8000 }),
      setToolWearThreshold({ toolId: 'BORE_35', maxWearUnits: 3000 }),
    ];

    await Promise.all(thresholdOps);

    const thresholds = await listToolWearThresholds();
    expect(thresholds).toHaveLength(3);

    const drill5 = await getToolWearThreshold('DRILL_5');
    expect(drill5!.maxWearUnits).toBe(5000);
  });

  it('handles threshold update race condition (last write wins)', async () => {
    // Multiple updates to same tool
    const updates = [
      setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 1000 }),
      setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 2000 }),
      setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 3000 }),
    ];

    await Promise.all(updates);

    const threshold = await getToolWearThreshold('DRILL_5');
    // One of the values should persist (last write wins)
    expect([1000, 2000, 3000]).toContain(threshold!.maxWearUnits);
  });
});

// ============================================
// LARGE BATCH PERFORMANCE TESTS
// ============================================

describe('IndexedDB Large Batch Performance', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('handles 100 events in single batch efficiently', async () => {
    const events = createEventBatch(100, 'DRILL_5', 10);

    const start = performance.now();
    await appendToolUsageEvents(events);
    const elapsed = performance.now() - start;

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(100);

    // Should complete within 2 seconds (generous for CI environments)
    expect(elapsed).toBeLessThan(2000);
  });

  it('handles 500 events in single batch', async () => {
    const events = createEventBatch(500, 'DRILL_5', 10);

    const start = performance.now();
    await appendToolUsageEvents(events);
    const elapsed = performance.now() - start;

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(500);
    expect(record!.wearUnits).toBe(500 * 10 * 1.0); // 5000

    // Should complete within 5 seconds
    expect(elapsed).toBeLessThan(5000);
  });

  it('handles events distributed across many tools', async () => {
    const events: ToolUsageEvent[] = [];

    // 10 events each for 50 different tools = 500 events
    for (let t = 0; t < 50; t++) {
      const toolId = `DRILL_${t}`;
      events.push(...createEventBatch(10, toolId, 10));
    }

    const start = performance.now();
    await appendToolUsageEvents(events);
    const elapsed = performance.now() - start;

    const records = await listToolUsageRecords();
    expect(records).toHaveLength(50);

    // Each tool should have 10 holes
    records.forEach((r) => {
      expect(r.totalHoles).toBe(10);
    });

    // Should complete within 10 seconds
    expect(elapsed).toBeLessThan(10000);
  });

  it('handles mixed materials in large batch correctly', async () => {
    const materials: MaterialClass[] = ['MDF', 'HPL', 'MELAMINE', 'PLYWOOD', 'HMR'];
    const events: ToolUsageEvent[] = [];

    // 20 events per material = 100 events
    materials.forEach((mat) => {
      events.push(...createEventBatch(20, 'DRILL_5', 10, mat));
    });

    await appendToolUsageEvents(events);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(100);

    // Check material breakdown
    expect(record!.byMaterial.MDF?.holes).toBe(20);
    expect(record!.byMaterial.HPL?.holes).toBe(20);
    expect(record!.byMaterial.MELAMINE?.holes).toBe(20);
    expect(record!.byMaterial.PLYWOOD?.holes).toBe(20);
    expect(record!.byMaterial.HMR?.holes).toBe(20);

    // Verify wear calculations per material
    // MDF: 20 * 10 * 1.0 = 200
    // HPL: 20 * 10 * 2.0 = 400
    // MELAMINE: 20 * 10 * 1.5 = 300
    // PLYWOOD: 20 * 10 * 1.2 = 240
    // HMR: 20 * 10 * 1.1 = 220
    // Total: 1360
    expect(record!.wearUnits).toBe(1360);
  });

  it('maintains deterministic aggregation for large batches', async () => {
    const events = createEventBatch(200, 'DRILL_5', 10);

    // Run same batch twice (after reset)
    await appendToolUsageEvents(events);
    const record1 = await getToolUsageRecord('DRILL_5');

    await resetToolingDb();

    await appendToolUsageEvents(events);
    const record2 = await getToolUsageRecord('DRILL_5');

    expect(record1!.totalHoles).toBe(record2!.totalHoles);
    expect(record1!.wearUnits).toBe(record2!.wearUnits);
    expect(record1!.totalDepthMm).toBe(record2!.totalDepthMm);
  });
});

// ============================================
// EDGE CASE TESTS
// ============================================

describe('IndexedDB Edge Cases', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('handles empty events array gracefully', async () => {
    await expect(appendToolUsageEvents([])).resolves.not.toThrow();

    const records = await listToolUsageRecords();
    expect(records).toHaveLength(0);
  });

  it('handles events with zero depth', async () => {
    const event = createEvent('DRILL_5', 0);
    await appendToolUsageEvents([event]);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(1);
    expect(record!.wearUnits).toBe(0); // 1 * 0 * 1.0 = 0
  });

  it('handles events with very small depth values', async () => {
    const event = createEvent('DRILL_5', 0.001);
    await appendToolUsageEvents([event]);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(1);
    expect(record!.wearUnits).toBeCloseTo(0.001, 6);
  });

  it('handles events with very large depth values', async () => {
    const event = createEvent('DRILL_5', 10000);
    await appendToolUsageEvents([event]);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(1);
    expect(record!.wearUnits).toBe(10000); // 1 * 10000 * 1.0
  });

  it('handles special characters in toolId', async () => {
    const event = createEvent('DRILL-5_SPECIAL#1', 10);
    await appendToolUsageEvents([event]);

    const record = await getToolUsageRecord('DRILL-5_SPECIAL#1');
    expect(record).not.toBeNull();
    expect(record!.totalHoles).toBe(1);
  });

  it('handles unicode in toolId', async () => {
    const event = createEvent('DRILL_ドリル_5', 10);
    await appendToolUsageEvents([event]);

    const record = await getToolUsageRecord('DRILL_ドリル_5');
    expect(record).not.toBeNull();
    expect(record!.totalHoles).toBe(1);
  });

  it('handles threshold at zero (edge case)', async () => {
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 0 });

    const threshold = await getToolWearThreshold('DRILL_5');
    expect(threshold!.maxWearUnits).toBe(0);
  });

  it('handles very large threshold values', async () => {
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: Number.MAX_SAFE_INTEGER });

    const threshold = await getToolWearThreshold('DRILL_5');
    expect(threshold!.maxWearUnits).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ============================================
// DATA INTEGRITY TESTS
// ============================================

describe('IndexedDB Data Integrity', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('accumulates data correctly across multiple append calls', async () => {
    // First batch
    await appendToolUsageEvents(createEventBatch(10, 'DRILL_5', 10));
    let record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(10);

    // Second batch
    await appendToolUsageEvents(createEventBatch(15, 'DRILL_5', 10));
    record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(25);

    // Third batch
    await appendToolUsageEvents(createEventBatch(5, 'DRILL_5', 10));
    record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(30);
  });

  it('correctly updates lastJobId and lastOccurredAt', async () => {
    await appendToolUsageEvents([
      createEvent('DRILL_5', 10, 'MDF', { jobId: 'JOB-1', occurredAt: 1000 }),
    ]);

    let record = await getToolUsageRecord('DRILL_5');
    expect(record!.lastJobId).toBe('JOB-1');
    expect(record!.lastOccurredAt).toBe(1000);

    await appendToolUsageEvents([
      createEvent('DRILL_5', 10, 'MDF', { jobId: 'JOB-2', occurredAt: 2000 }),
    ]);

    record = await getToolUsageRecord('DRILL_5');
    expect(record!.lastJobId).toBe('JOB-2');
    expect(record!.lastOccurredAt).toBe(2000);
  });

  it('handles interleaved job events correctly', async () => {
    const events = [
      createEvent('DRILL_5', 10, 'MDF', { jobId: 'JOB-A', occurredAt: 1000 }),
      createEvent('DRILL_5', 10, 'HPL', { jobId: 'JOB-B', occurredAt: 1500 }),
      createEvent('DRILL_5', 10, 'MDF', { jobId: 'JOB-A', occurredAt: 1200 }),
      createEvent('DRILL_5', 10, 'HPL', { jobId: 'JOB-B', occurredAt: 2000 }),
    ];

    await appendToolUsageEvents(events);

    const record = await getToolUsageRecord('DRILL_5');
    expect(record!.totalHoles).toBe(4);
    // Last occurred should be the highest timestamp
    expect(record!.lastOccurredAt).toBe(2000);
    expect(record!.lastJobId).toBe('JOB-B');
  });
});

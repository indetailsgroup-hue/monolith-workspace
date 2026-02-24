/**
 * indexedDbToolingStore.test.ts - Tool Usage Store Tests
 *
 * Tests for D6-C IndexedDB persistence.
 * Uses fake-indexeddb for testing.
 *
 * @version 1.0.0 - Phase D6-C
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
  getToolUsageEventsByTool,
} from '../indexedDbToolingStore';

describe('D6-C IndexedDB tooling store', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  it('appends events and aggregates ToolUsageRecord by toolId', async () => {
    await appendToolUsageEvents([
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'DRILL_5', diameterMm: 5 },
        material: 'MDF',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 18,
        count: 1,
        occurredAt: 1,
      },
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'DRILL_5', diameterMm: 5 },
        material: 'HPL',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 18,
        count: 2,
        occurredAt: 2,
      },
    ]);

    const rec = await getToolUsageRecord('DRILL_5');
    expect(rec).not.toBeNull();
    expect(rec!.totalHoles).toBe(3);
    expect(rec!.byMaterial.MDF?.holes).toBe(1);
    expect(rec!.byMaterial.HPL?.holes).toBe(2);
    expect(rec!.lastJobId).toBe('J1');
    expect(rec!.lastOccurredAt).toBe(2);
  });

  it('listToolUsageRecords returns stable ordering', async () => {
    await appendToolUsageEvents([
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'B_TOOL' },
        material: 'MDF',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 10,
        count: 1,
        occurredAt: 1,
      },
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'A_TOOL' },
        material: 'MDF',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 10,
        count: 1,
        occurredAt: 1,
      },
    ]);

    const all = await listToolUsageRecords();
    expect(all.map((r) => r.toolId)).toEqual(['A_TOOL', 'B_TOOL']);
  });

  it('thresholds are persisted and retrievable', async () => {
    await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 12345 });
    const t = await getToolWearThreshold('DRILL_5');
    expect(t).not.toBeNull();
    expect(t!.maxWearUnits).toBe(12345);
  });

  it('event log can be queried by toolId', async () => {
    await appendToolUsageEvents(
      [
        {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          tool: { toolId: 'DRILL_5' },
          material: 'MDF',
          holeKind: 'DRILL',
          diameterMm: 5,
          depthMm: 10,
          count: 1,
          occurredAt: 5,
        },
        {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          tool: { toolId: 'DRILL_5' },
          material: 'HPL',
          holeKind: 'DRILL',
          diameterMm: 5,
          depthMm: 10,
          count: 1,
          occurredAt: 6,
        },
      ],
      { persistEventLog: true }
    );

    const events = await getToolUsageEventsByTool('DRILL_5', 10);
    expect(events).toHaveLength(2);
    expect(events[0].occurredAt).toBe(5);
    expect(events[1].occurredAt).toBe(6);
  });

  it('can disable event log persistence (records only)', async () => {
    await appendToolUsageEvents(
      [
        {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          tool: { toolId: 'DRILL_5' },
          material: 'MDF',
          holeKind: 'DRILL',
          diameterMm: 5,
          depthMm: 10,
          count: 1,
          occurredAt: 1,
        },
      ],
      { persistEventLog: false }
    );

    const rec = await getToolUsageRecord('DRILL_5');
    expect(rec).not.toBeNull();

    const events = await getToolUsageEventsByTool('DRILL_5', 10);
    expect(events).toHaveLength(0);
  });

  it('aggregates wear units correctly with material weights', async () => {
    // MDF: weight 1.0, HPL: weight 2.0
    await appendToolUsageEvents([
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'DRILL_5' },
        material: 'MDF',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 10,
        count: 1, // wear = 1 * 10 * 1.0 = 10
        occurredAt: 1,
      },
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'DRILL_5' },
        material: 'HPL',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 10,
        count: 1, // wear = 1 * 10 * 2.0 = 20
        occurredAt: 2,
      },
    ]);

    const rec = await getToolUsageRecord('DRILL_5');
    expect(rec!.wearUnits).toBe(30); // 10 + 20
    expect(rec!.byMaterial.MDF?.wearUnits).toBe(10);
    expect(rec!.byMaterial.HPL?.wearUnits).toBe(20);
  });

  it('handles multiple tools independently', async () => {
    await appendToolUsageEvents([
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'DRILL_5' },
        material: 'MDF',
        holeKind: 'DRILL',
        diameterMm: 5,
        depthMm: 10,
        count: 5,
        occurredAt: 1,
      },
      {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        tool: { toolId: 'BORE_35' },
        material: 'MDF',
        holeKind: 'BORE',
        diameterMm: 35,
        depthMm: 12,
        count: 2,
        occurredAt: 2,
      },
    ]);

    const drill = await getToolUsageRecord('DRILL_5');
    const bore = await getToolUsageRecord('BORE_35');

    expect(drill!.totalHoles).toBe(5);
    expect(bore!.totalHoles).toBe(2);
  });

  it('returns null for non-existent records', async () => {
    const rec = await getToolUsageRecord('NON_EXISTENT');
    expect(rec).toBeNull();

    const threshold = await getToolWearThreshold('NON_EXISTENT');
    expect(threshold).toBeNull();
  });
});

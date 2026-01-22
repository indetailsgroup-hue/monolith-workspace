/**
 * toolHealthQuery.test.ts - Tool Health Query Tests
 *
 * Integration tests for D6-E.1 health queries.
 * Uses fake-indexeddb for consistent testing.
 *
 * @version 1.0.0 - Phase D6-E.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getToolHealth, listToolHealth, listNearingLimitTools } from '../toolHealthQuery';
import {
  resetToolingDb,
  appendToolUsageEvents,
  setToolWearThreshold,
} from '../../storage';
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

describe('D6-E.1 toolHealthQuery', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  describe('getToolHealth', () => {
    it('returns null for non-existent tool', async () => {
      const health = await getToolHealth('UNKNOWN_TOOL');
      expect(health).toBeNull();
    });

    it('returns OK status when wear is low', async () => {
      // Add some usage
      await appendToolUsageEvents([makeEvent('DRILL_5', 10)]);

      // Set threshold high (10000)
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 10000 });

      const health = await getToolHealth('DRILL_5');

      expect(health).not.toBeNull();
      expect(health!.status).toBe('OK');
      expect(health!.healthPct).toBeGreaterThan(90);
    });

    it('returns NEARING_LIMIT when wear exceeds 85%', async () => {
      // Add usage that will result in 90 wear units
      // MDF weight = 1.0, so 90 depth = 90 wear units
      await appendToolUsageEvents([makeEvent('DRILL_5', 90)]);

      // Set threshold to 100 (so 90% used)
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 100 });

      const health = await getToolHealth('DRILL_5');

      expect(health).not.toBeNull();
      expect(health!.status).toBe('NEARING_LIMIT');
    });

    it('returns OVER_LIMIT when wear exceeds 100%', async () => {
      // Add usage that will result in 120 wear units
      await appendToolUsageEvents([makeEvent('DRILL_5', 120)]);

      // Set threshold to 100
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 100 });

      const health = await getToolHealth('DRILL_5');

      expect(health).not.toBeNull();
      expect(health!.status).toBe('OVER_LIMIT');
    });

    it('uses default threshold when none set', async () => {
      await appendToolUsageEvents([makeEvent('DRILL_5', 10)]);

      const health = await getToolHealth('DRILL_5');

      expect(health).not.toBeNull();
      expect(health!.maxWearUnits).toBe(10000); // default
      expect(health!.status).toBe('OK');
    });

    it('respects custom nearingLimitPct', async () => {
      // 75 wear units out of 100 = 75% used
      await appendToolUsageEvents([makeEvent('DRILL_5', 75)]);
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 100 });

      // Default 85% threshold → OK
      const health85 = await getToolHealth('DRILL_5', { nearingLimitPct: 85 });
      expect(health85!.status).toBe('OK');

      // Custom 70% threshold → NEARING_LIMIT
      const health70 = await getToolHealth('DRILL_5', { nearingLimitPct: 70 });
      expect(health70!.status).toBe('NEARING_LIMIT');
    });
  });

  describe('listToolHealth', () => {
    it('returns empty array when no tools tracked', async () => {
      const list = await listToolHealth();
      expect(list).toEqual([]);
    });

    it('lists all tools with health status', async () => {
      await appendToolUsageEvents([
        makeEvent('DRILL_5', 50),
        makeEvent('DRILL_8', 30),
        makeEvent('BORE_35', 20),
      ]);

      const list = await listToolHealth();

      expect(list).toHaveLength(3);
      expect(list.map((h) => h.toolId).sort()).toEqual(['BORE_35', 'DRILL_5', 'DRILL_8']);
    });

    it('sorts by status priority then healthPct desc', async () => {
      // Create tools with different statuses
      await appendToolUsageEvents([
        makeEvent('TOOL_OK', 10), // low wear
        makeEvent('TOOL_NEAR', 90), // high wear
        makeEvent('TOOL_OVER', 120), // over limit
      ]);

      // Set thresholds
      await setToolWearThreshold({ toolId: 'TOOL_OK', maxWearUnits: 1000 });
      await setToolWearThreshold({ toolId: 'TOOL_NEAR', maxWearUnits: 100 });
      await setToolWearThreshold({ toolId: 'TOOL_OVER', maxWearUnits: 100 });

      const list = await listToolHealth();

      // OVER_LIMIT first, then NEARING_LIMIT, then OK
      expect(list[0].toolId).toBe('TOOL_OVER');
      expect(list[0].status).toBe('OVER_LIMIT');

      expect(list[1].toolId).toBe('TOOL_NEAR');
      expect(list[1].status).toBe('NEARING_LIMIT');

      expect(list[2].toolId).toBe('TOOL_OK');
      expect(list[2].status).toBe('OK');
    });

    it('sorts tools with same status by healthPct desc, then toolId asc', async () => {
      // Two tools with NEARING_LIMIT status
      await appendToolUsageEvents([
        makeEvent('DRILL_A', 85),
        makeEvent('DRILL_B', 90),
      ]);

      await setToolWearThreshold({ toolId: 'DRILL_A', maxWearUnits: 100 });
      await setToolWearThreshold({ toolId: 'DRILL_B', maxWearUnits: 100 });

      const list = await listToolHealth();

      // DRILL_B has higher wear (lower healthPct), so comes first
      expect(list[0].toolId).toBe('DRILL_B');
      expect(list[1].toolId).toBe('DRILL_A');
    });
  });

  describe('listNearingLimitTools', () => {
    it('returns only NEARING_LIMIT and OVER_LIMIT tools', async () => {
      await appendToolUsageEvents([
        makeEvent('TOOL_OK', 10),
        makeEvent('TOOL_NEAR', 90),
        makeEvent('TOOL_OVER', 120),
      ]);

      await setToolWearThreshold({ toolId: 'TOOL_OK', maxWearUnits: 1000 });
      await setToolWearThreshold({ toolId: 'TOOL_NEAR', maxWearUnits: 100 });
      await setToolWearThreshold({ toolId: 'TOOL_OVER', maxWearUnits: 100 });

      const list = await listNearingLimitTools();

      expect(list).toHaveLength(2);
      expect(list.map((h) => h.toolId)).toContain('TOOL_NEAR');
      expect(list.map((h) => h.toolId)).toContain('TOOL_OVER');
      expect(list.map((h) => h.toolId)).not.toContain('TOOL_OK');
    });

    it('excludes OVER_LIMIT when includeOverLimit=false', async () => {
      await appendToolUsageEvents([
        makeEvent('TOOL_NEAR', 90),
        makeEvent('TOOL_OVER', 120),
      ]);

      await setToolWearThreshold({ toolId: 'TOOL_NEAR', maxWearUnits: 100 });
      await setToolWearThreshold({ toolId: 'TOOL_OVER', maxWearUnits: 100 });

      const list = await listNearingLimitTools({ includeOverLimit: false });

      expect(list).toHaveLength(1);
      expect(list[0].toolId).toBe('TOOL_NEAR');
    });

    it('returns empty array when all tools are OK', async () => {
      await appendToolUsageEvents([
        makeEvent('DRILL_5', 10),
        makeEvent('DRILL_8', 20),
      ]);

      // High thresholds → all OK
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 10000 });
      await setToolWearThreshold({ toolId: 'DRILL_8', maxWearUnits: 10000 });

      const list = await listNearingLimitTools();

      expect(list).toHaveLength(0);
    });

    it('maintains correct sorting (OVER_LIMIT before NEARING_LIMIT)', async () => {
      await appendToolUsageEvents([
        makeEvent('TOOL_NEAR', 90),
        makeEvent('TOOL_OVER', 120),
      ]);

      await setToolWearThreshold({ toolId: 'TOOL_NEAR', maxWearUnits: 100 });
      await setToolWearThreshold({ toolId: 'TOOL_OVER', maxWearUnits: 100 });

      const list = await listNearingLimitTools();

      expect(list[0].toolId).toBe('TOOL_OVER');
      expect(list[1].toolId).toBe('TOOL_NEAR');
    });
  });
});

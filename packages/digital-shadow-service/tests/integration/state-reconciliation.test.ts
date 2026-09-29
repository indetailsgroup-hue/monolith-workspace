/**
 * MONOLITH Digital Shadow — State Reconciliation Integration Test
 * Tests WwUnitState → MonolithJobState mapping through full job lifecycle
 * Uses mock Redis Streams to verify event publishing
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { StateReconciliationEngine } from '../../src/services/StateReconciliationEngine';
import { WwUnitState, WwUnitMode } from '../../src/types/machine';
import type { MachineStateSnapshot } from '../../src/types/machine';
import { EventStream } from '../../src/types/events';

// Mock Redis for testing
vi.mock('../../src/config', () => ({
  redisConfig: { url: 'redis://localhost:6379' },
  eventBusConfig: {
    streamPrefix: 'test-ds:',
    consumerGroup: 'test-group',
    consumerName: 'test-consumer-1',
    maxStreamLength: 1000,
    blockTimeoutMs: 1000,
  },
}));

function createSnapshot(overrides: Partial<MachineStateSnapshot> = {}): MachineStateSnapshot {
  return {
    machineId: 'biesse-rover-test',
    timestamp: new Date(),
    state: WwUnitState.READY,
    mode: WwUnitMode.AUTOMATIC,
    spindleSpeed: 0,
    feedRate: 0,
    toolId: 'T0',
    partCount: 0,
    runtimeSeconds: 0,
    activeAlarms: [],
    ...overrides,
  };
}

describe('StateReconciliationEngine — Job Lifecycle Mapping', () => {
  let engine: StateReconciliationEngine;
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis('redis://localhost:6379');

    // Clean up test streams
    for (const stream of Object.values(EventStream)) {
      try { await redis.del(stream); } catch { /* ignore */ }
    }

    engine = new StateReconciliationEngine();
    await engine.start();
  }, 10000);

  afterAll(async () => {
    await engine.stop();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clean streams between tests
    for (const stream of Object.values(EventStream)) {
      try { await redis.del(stream); } catch { /* ignore */ }
    }
  });

  // ─── Normal Job Lifecycle ──────────────────────────────────────────────────

  describe('Normal Job Lifecycle: READY → WORKING → READY (COMPLETED)', () => {
    it('should publish state_update event on every state read', async () => {
      const snapshot = createSnapshot({
        state: WwUnitState.READY,
        mode: WwUnitMode.AUTOMATIC,
      });

      await engine.processStateUpdate(snapshot);

      // Read from Redis stream
      const events = await redis.xrange(EventStream.MACHINE_STATE, '-', '+');
      expect(events.length).toBeGreaterThanOrEqual(1);

      const lastEvent = events[events.length - 1];
      const fields = Object.fromEntries(
        lastEvent![1].reduce((acc: [string, string][], val, idx, arr) => {
          if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
          return acc;
        }, []),
      );

      expect(fields['type']).toBe('state_update');
      const data = JSON.parse(fields['data']!);
      expect(data.machineId).toBe('biesse-rover-test');
      expect(data.state).toBe(WwUnitState.READY);
    });

    it('should emit JOB_STARTED when READY → WORKING with active job', async () => {
      // Register a job
      engine.registerJob('biesse-rover-test', 'job-cabinet-001');

      // First update: READY state (establishes previous state)
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.READY,
      }));

      // Transition: READY → WORKING
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.WORKING,
        spindleSpeed: 18000,
        feedRate: 95,
      }));

      // Check JOB_LIFECYCLE stream
      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      expect(events.length).toBeGreaterThanOrEqual(1);

      const lastEvent = events[events.length - 1];
      const fields = Object.fromEntries(
        lastEvent![1].reduce((acc: [string, string][], val, idx, arr) => {
          if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
          return acc;
        }, []),
      );

      expect(fields['type']).toBe('JOB_STARTED');
      expect(fields['correlationId']).toBe('job-cabinet-001');
    });

    it('should emit JOB_COMPLETED when WORKING → READY with active job', async () => {
      // Register job and establish working state
      engine.registerJob('biesse-rover-test', 'job-cabinet-002');

      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.WORKING,
        spindleSpeed: 18000,
      }));

      // Transition: WORKING → READY (job complete)
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.READY,
        spindleSpeed: 0,
        partCount: 1,
      }));

      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      const completedEvent = events.find((e) => {
        const fields = Object.fromEntries(
          e[1].reduce((acc: [string, string][], val, idx, arr) => {
            if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
            return acc;
          }, []),
        );
        return fields['type'] === 'JOB_COMPLETED';
      });

      expect(completedEvent).toBeDefined();
    });
  });

  // ─── Error Path ────────────────────────────────────────────────────────────

  describe('Error Path: WORKING → ERROR (JOB_ABORTED)', () => {
    it('should emit JOB_ABORTED on WORKING → ERROR', async () => {
      engine.registerJob('biesse-rover-test', 'job-shelf-001');

      // Establish WORKING state
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.WORKING,
        spindleSpeed: 16000,
      }));

      // Error occurs!
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.ERROR,
        spindleSpeed: 0,
        feedRate: 0,
        activeAlarms: [{
          alarmId: 'ALM-SPINDLE-001',
          severity: 'CRITICAL',
          message: 'Spindle overload',
          timestamp: new Date(),
          acknowledged: false,
        }],
      }));

      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      const abortedEvent = events.find((e) => {
        const fields = Object.fromEntries(
          e[1].reduce((acc: [string, string][], val, idx, arr) => {
            if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
            return acc;
          }, []),
        );
        return fields['type'] === 'JOB_ABORTED';
      });

      expect(abortedEvent).toBeDefined();
    });

    it('should publish alarm events when activeAlarms is non-empty', async () => {
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.ERROR,
        activeAlarms: [
          {
            alarmId: 'ALM-001',
            severity: 'CRITICAL',
            message: 'Tool breakage detected',
            timestamp: new Date(),
            acknowledged: false,
          },
          {
            alarmId: 'ALM-002',
            severity: 'WARNING',
            message: 'Dust collector full',
            timestamp: new Date(),
            acknowledged: false,
          },
        ],
      }));

      const events = await redis.xrange(EventStream.MACHINE_ALARM, '-', '+');
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Pause/Resume Path ─────────────────────────────────────────────────────

  describe('Pause Path: WORKING → STANDBY (PAUSED)', () => {
    it('should emit state change on WORKING → STANDBY', async () => {
      // Establish WORKING state
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.WORKING,
        spindleSpeed: 18000,
      }));

      // Operator pauses (STANDBY)
      await engine.processStateUpdate(createSnapshot({
        state: WwUnitState.STANDBY,
        spindleSpeed: 0,
      }));

      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      const pauseEvent = events.find((e) => {
        const fields = Object.fromEntries(
          e[1].reduce((acc: [string, string][], val, idx, arr) => {
            if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
            return acc;
          }, []),
        );
        return fields['type'] === 'STATE_CHANGED';
      });

      expect(pauseEvent).toBeDefined();
    });
  });

  // ─── No Transition (same state) ───────────────────────────────────────────

  describe('No Transition — Same State Repeated', () => {
    it('should not publish job lifecycle event when state stays same', async () => {
      // Clear streams
      await redis.del(EventStream.JOB_LIFECYCLE);

      // Send same state twice
      await engine.processStateUpdate(createSnapshot({ state: WwUnitState.WORKING }));
      await engine.processStateUpdate(createSnapshot({ state: WwUnitState.WORKING }));

      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      // Should only have events from the initial transition (if any), not duplicates
      expect(events.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Job Registration ──────────────────────────────────────────────────────

  describe('Job Registration and Clearing', () => {
    it('should not emit JOB_STARTED without registered job', async () => {
      engine.clearJob('biesse-rover-test');
      await redis.del(EventStream.JOB_LIFECYCLE);

      await engine.processStateUpdate(createSnapshot({ state: WwUnitState.READY }));
      await engine.processStateUpdate(createSnapshot({ state: WwUnitState.WORKING }));

      const events = await redis.xrange(EventStream.JOB_LIFECYCLE, '-', '+');
      const startedEvents = events.filter((e) => {
        const fields = Object.fromEntries(
          e[1].reduce((acc: [string, string][], val, idx, arr) => {
            if (idx % 2 === 0) acc.push([val, arr[idx + 1]!]);
            return acc;
          }, []),
        );
        return fields['type'] === 'JOB_STARTED';
      });

      expect(startedEvents).toHaveLength(0);
    });
  });
});

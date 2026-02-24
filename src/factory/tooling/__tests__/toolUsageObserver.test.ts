/**
 * toolUsageObserver.test.ts - Tool Usage Observer Tests
 *
 * Tests for D6-B observer function.
 * Verifies determinism, stable ordering, and edge cases.
 *
 * @version 1.0.0 - Phase D6-B
 */

import { describe, it, expect } from 'vitest';
import { observeToolUsageFromOperationGraph } from '../toolUsageObserver';

describe('D6-B ToolUsageObserver', () => {
  it('emits deterministic events from DRILL/BORE operations', () => {
    const opGraph = {
      operations: [
        { id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
        { id: 'b', type: 'BORE', toolId: 'BORE_35', depth: 12, diameter: 35 },
        { id: 'c', type: 'MOVE', toolId: 'X', depth: 0 }, // ignored
      ],
    };

    const events = observeToolUsageFromOperationGraph(opGraph, {
      jobId: 'job-1',
      machineId: 'KDT',
      dialect: 'fanuc',
      postVersion: '1.3.0',
      programHash: 'sha-prog',
      packetContentHash: 'sha-packet',
      occurredAt: 1700000000000,
      resolveMaterial: (op: any) => (op.type === 'BORE' ? 'HPL' : 'MDF'),
    });

    expect(events).toHaveLength(2);
    expect(events[0].occurredAt).toBe(1700000000000);
    expect(events[0].jobId).toBe('job-1');
    expect(events[0].programHash).toBe('sha-prog');
    expect(events[0].packetContentHash).toBe('sha-packet');

    // Sorting deterministic: BORE_35 comes before DRILL_5 alphabetically
    expect(events.map((e) => e.tool.toolId)).toEqual(['BORE_35', 'DRILL_5']);
  });

  it('defaults material to UNKNOWN when resolver not provided', () => {
    const events = observeToolUsageFromOperationGraph(
      { operations: [{ id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
      {
        jobId: 'job-1',
        machineId: 'KDT',
        dialect: 'fanuc',
        postVersion: '1.3.0',
        programHash: 'sha-prog',
        packetContentHash: 'sha-packet',
        occurredAt: 1,
      }
    );

    expect(events[0].material).toBe('UNKNOWN');
  });

  it('clamps non-finite/negative depth/diameter safely', () => {
    const events = observeToolUsageFromOperationGraph(
      {
        operations: [
          { id: 'a', type: 'BORE', toolId: 'BORE_15', depth: -5, diameter: Number.NaN },
        ],
      },
      {
        jobId: 'job-1',
        machineId: 'KDT',
        dialect: 'fanuc',
        postVersion: '1.3.0',
        programHash: 'sha-prog',
        packetContentHash: 'sha-packet',
        occurredAt: 1,
      }
    );

    expect(events[0].depthMm).toBe(0);
    expect(events[0].diameterMm).toBe(0);
  });

  it('returns empty array for null/undefined opGraph', () => {
    const ctx = {
      jobId: 'job-1',
      machineId: 'KDT',
      dialect: 'fanuc',
      postVersion: '1.3.0',
      programHash: 'sha-prog',
      packetContentHash: 'sha-packet',
      occurredAt: 1,
    };

    expect(observeToolUsageFromOperationGraph(null, ctx)).toEqual([]);
    expect(observeToolUsageFromOperationGraph(undefined, ctx)).toEqual([]);
    expect(observeToolUsageFromOperationGraph({}, ctx)).toEqual([]);
  });

  it('skips operations without toolId', () => {
    const events = observeToolUsageFromOperationGraph(
      {
        operations: [
          { id: 'a', type: 'DRILL', depth: 10 }, // no toolId
          { id: 'b', type: 'DRILL', toolId: '', depth: 10 }, // empty toolId
          { id: 'c', type: 'DRILL', toolId: 'DRILL_5', depth: 10 }, // valid
        ],
      },
      {
        jobId: 'job-1',
        machineId: 'KDT',
        dialect: 'fanuc',
        postVersion: '1.3.0',
        programHash: 'sha-prog',
        packetContentHash: 'sha-packet',
        occurredAt: 1,
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0].tool.toolId).toBe('DRILL_5');
  });

  it('produces identical output for identical inputs (determinism)', () => {
    const opGraph = {
      operations: [
        { id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
        { id: 'b', type: 'BORE', toolId: 'BORE_35', depth: 12, diameter: 35 },
        { id: 'c', type: 'DRILL', toolId: 'DRILL_8', depth: 25 },
      ],
    };

    const ctx = {
      jobId: 'job-1',
      machineId: 'KDT',
      dialect: 'fanuc',
      postVersion: '1.3.0',
      programHash: 'sha-prog',
      packetContentHash: 'sha-packet',
      occurredAt: 1700000000000,
    };

    const events1 = observeToolUsageFromOperationGraph(opGraph, ctx);
    const events2 = observeToolUsageFromOperationGraph(opGraph, ctx);

    expect(JSON.stringify(events1)).toBe(JSON.stringify(events2));
  });

  it('maintains stable ordering regardless of input order', () => {
    const opGraph1 = {
      operations: [
        { id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
        { id: 'b', type: 'DRILL', toolId: 'DRILL_8', depth: 25 },
        { id: 'c', type: 'BORE', toolId: 'BORE_35', depth: 12, diameter: 35 },
      ],
    };

    const opGraph2 = {
      operations: [
        { id: 'c', type: 'BORE', toolId: 'BORE_35', depth: 12, diameter: 35 },
        { id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
        { id: 'b', type: 'DRILL', toolId: 'DRILL_8', depth: 25 },
      ],
    };

    const ctx = {
      jobId: 'job-1',
      machineId: 'KDT',
      dialect: 'fanuc',
      postVersion: '1.3.0',
      programHash: 'sha-prog',
      packetContentHash: 'sha-packet',
      occurredAt: 1,
    };

    const events1 = observeToolUsageFromOperationGraph(opGraph1, ctx);
    const events2 = observeToolUsageFromOperationGraph(opGraph2, ctx);

    // Same stable order regardless of input order
    expect(events1.map((e) => e.tool.toolId)).toEqual(events2.map((e) => e.tool.toolId));
  });

  it('sets count to 1 for each event', () => {
    const events = observeToolUsageFromOperationGraph(
      {
        operations: [
          { id: 'a', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
          { id: 'b', type: 'DRILL', toolId: 'DRILL_5', depth: 18 },
        ],
      },
      {
        jobId: 'job-1',
        machineId: 'KDT',
        dialect: 'fanuc',
        postVersion: '1.3.0',
        programHash: 'sha-prog',
        packetContentHash: 'sha-packet',
        occurredAt: 1,
      }
    );

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.count === 1)).toBe(true);
  });

  it('normalizes depth/diameter to 3 decimal places', () => {
    const events = observeToolUsageFromOperationGraph(
      {
        operations: [
          { id: 'a', type: 'BORE', toolId: 'BORE_35', depth: 12.12345, diameter: 35.9999 },
        ],
      },
      {
        jobId: 'job-1',
        machineId: 'KDT',
        dialect: 'fanuc',
        postVersion: '1.3.0',
        programHash: 'sha-prog',
        packetContentHash: 'sha-packet',
        occurredAt: 1,
      }
    );

    expect(events[0].depthMm).toBe(12.123);
    expect(events[0].diameterMm).toBe(36);
  });
});

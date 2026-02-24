/**
 * wireToolUsage.test.ts - Tool Usage Wiring Tests
 *
 * Tests for D6-D wiring function.
 * Uses mocks to avoid IndexedDB dependency in unit tests.
 *
 * @version 1.0.0 - Phase D6-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as storage from '../storage';
import { wireToolUsageAfterCncBuild } from '../wireToolUsage';

describe('D6-D wireToolUsageAfterCncBuild', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not write on cacheHit by default', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
        cacheHit: true,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      { enableOnCacheHit: false }
    );

    expect(res.attempted).toBe(false);
    expect(res.cacheHit).toBe(true);
    expect(res.eventsWritten).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('writes events when not cacheHit', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
        cacheHit: false,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      { persistEventLog: false }
    );

    expect(res.attempted).toBe(true);
    expect(res.cacheHit).toBe(false);
    expect(res.eventsWritten).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.any(Array), { persistEventLog: false });
  });

  it('writes on cacheHit when enableOnCacheHit=true', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
        cacheHit: true,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      { enableOnCacheHit: true }
    );

    expect(res.attempted).toBe(true);
    expect(res.eventsWritten).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('swallows errors by default', async () => {
    vi.spyOn(storage, 'appendToolUsageEvents').mockRejectedValue(new Error('db down'));

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
        cacheHit: false,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      { swallowErrors: true }
    );

    expect(res.attempted).toBe(true);
    expect(res.eventsWritten).toBe(0);
    expect(res.error).toBe('db down');
  });

  it('throws errors when swallowErrors=false', async () => {
    vi.spyOn(storage, 'appendToolUsageEvents').mockRejectedValue(new Error('db down'));

    await expect(
      wireToolUsageAfterCncBuild(
        {
          opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
          cacheHit: false,
          observerContext: {
            jobId: 'J1',
            machineId: 'KDT',
            dialect: 'FANUC',
            postVersion: '1.3.0',
            programHash: 'prog',
            packetContentHash: 'packet',
            occurredAt: 1,
          },
        },
        { swallowErrors: false }
      )
    ).rejects.toThrow('db down');
  });

  it('returns eventsWritten=0 for empty opGraph', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: { operations: [] },
        cacheHit: false,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      {}
    );

    expect(res.attempted).toBe(true);
    expect(res.eventsWritten).toBe(0);
    expect(spy).not.toHaveBeenCalled(); // No events to write
  });

  it('handles multiple operations correctly', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild(
      {
        opGraph: {
          operations: [
            { type: 'DRILL', toolId: 'DRILL_5', depth: 10 },
            { type: 'BORE', toolId: 'BORE_35', depth: 12, diameter: 35 },
            { type: 'DRILL', toolId: 'DRILL_8', depth: 25 },
            { type: 'MOVE', toolId: 'X' }, // ignored
          ],
        },
        cacheHit: false,
        observerContext: {
          jobId: 'J1',
          machineId: 'KDT',
          dialect: 'FANUC',
          postVersion: '1.3.0',
          programHash: 'prog',
          packetContentHash: 'packet',
          occurredAt: 1,
        },
      },
      {}
    );

    expect(res.attempted).toBe(true);
    expect(res.eventsWritten).toBe(3); // DRILL, BORE, DRILL (MOVE ignored)
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('uses default options when not provided', async () => {
    const spy = vi.spyOn(storage, 'appendToolUsageEvents').mockResolvedValue(undefined);

    const res = await wireToolUsageAfterCncBuild({
      opGraph: { operations: [{ type: 'DRILL', toolId: 'DRILL_5', depth: 10 }] },
      cacheHit: false,
      observerContext: {
        jobId: 'J1',
        machineId: 'KDT',
        dialect: 'FANUC',
        postVersion: '1.3.0',
        programHash: 'prog',
        packetContentHash: 'packet',
        occurredAt: 1,
      },
    });

    expect(res.attempted).toBe(true);
    expect(res.eventsWritten).toBe(1);
    // Default persistEventLog=true
    expect(spy).toHaveBeenCalledWith(expect.any(Array), { persistEventLog: true });
  });
});

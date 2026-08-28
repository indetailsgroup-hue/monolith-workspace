/**
 * FeatureCacheService.refreshTTL — Vitest unit tests
 *
 * Covers three scenarios using a fully-mocked ioredis client:
 *   1. no-op       — SCAN returns no keys; pipeline is never called
 *   2. pipeline    — 3 keys found; pipeline.expire called for each with TTL=300, exec called once
 *   3. swallows    — Redis SCAN rejects; error is swallowed, promise resolves without throwing
 *
 * Mock strategy (mirrors getOldestTimestamp.test.ts):
 *   vi.hoisted() creates ALL mock functions BEFORE vi.mock() factory executes.
 *   mockPipeline is a function that returns a chainable { expire, exec } object.
 *   In beforeEach we re-stub mockPipeline and mockExec to prevent cross-test leakage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoist mock functions before vi.mock() factory runs ──────────────────────

const { mockScan, mockPipeline, mockExpire, mockExec } = vi.hoisted(() => ({
  mockScan:     vi.fn<[], Promise<[string, string[]]>>(),
  mockPipeline: vi.fn(),
  mockExpire:   vi.fn(),
  mockExec:     vi.fn<[], Promise<unknown[]>>(),
}));

// ─── Fully stub ioredis ───────────────────────────────────────────────────────

vi.mock('ioredis', () => {
  class MockRedis {
    scan     = mockScan;
    pipeline = mockPipeline;
    hget     = vi.fn();
    hgetall  = vi.fn();
    on       = vi.fn().mockReturnThis();
    quit     = vi.fn().mockResolvedValue('OK');
  }
  return { default: MockRedis };
});

// ─── SUT import (must come AFTER mock registration) ──────────────────────────

import { FeatureCacheService } from '../../src/services/FeatureCacheService';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureCacheService.refreshTTL', () => {
  let svc: FeatureCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub pipeline factory so each test starts from a clean state
    mockPipeline.mockReturnValue({ expire: mockExpire, exec: mockExec });
    mockExec.mockResolvedValue([]);
  });

  afterEach(() => {
    // no-op; vi.clearAllMocks() in beforeEach is sufficient
  });

  // ── 1. No-op when no keys exist ───────────────────────────────────────────────
  it('returns early without calling pipeline when SCAN finds no keys', async () => {
    // Single SCAN pass — empty result with terminating cursor '0'
    mockScan.mockResolvedValueOnce(['0', []]);

    svc = new FeatureCacheService('redis://localhost:6379');
    await expect(svc.refreshTTL('machine-001')).resolves.toBeUndefined();

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockPipeline).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
  });

  // ── 2. Pipelines EXPIRE for each found key ────────────────────────────────────
  //   Three component keys → pipeline.expire called 3× with TTL=300, exec called once
  it('calls pipeline.expire on each key with TTL=300 and exec once', async () => {
    const machineId = 'machine-001';
    const keys = [
      `ds:features:${machineId}:SPINDLE`,
      `ds:features:${machineId}:BALL_SCREW_X`,
      `ds:features:${machineId}:LINEAR_GUIDE_X`,
    ];

    // Single SCAN pass returns all three keys
    mockScan.mockResolvedValueOnce(['0', keys]);

    svc = new FeatureCacheService('redis://localhost:6379');
    await expect(svc.refreshTTL(machineId)).resolves.toBeUndefined();

    // Pipeline was opened once
    expect(mockPipeline).toHaveBeenCalledTimes(1);

    // EXPIRE queued for each key with the canonical 300s TTL
    expect(mockExpire).toHaveBeenCalledTimes(3);
    expect(mockExpire).toHaveBeenCalledWith(keys[0], 300);
    expect(mockExpire).toHaveBeenCalledWith(keys[1], 300);
    expect(mockExpire).toHaveBeenCalledWith(keys[2], 300);

    // Pipeline flushed exactly once
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  // ── 3. Swallows Redis SCAN error ──────────────────────────────────────────────
  it('resolves without throwing when Redis SCAN rejects', async () => {
    mockScan.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    svc = new FeatureCacheService('redis://localhost:6379');
    await expect(svc.refreshTTL('machine-001')).resolves.toBeUndefined();

    expect(mockPipeline).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();
  });
});

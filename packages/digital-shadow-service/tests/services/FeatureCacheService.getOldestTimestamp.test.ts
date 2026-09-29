/**
 * FeatureCacheService.getOldestTimestamp — Vitest unit tests
 *
 * Covers three scenarios using a fully-mocked ioredis client:
 *   1. null          — SCAN returns no keys (cold / empty cache)
 *   2. minimum ts    — multiple keys present; returns the lowest timestamp
 *   3. null on error — Redis SCAN rejects; error is swallowed, returns null
 *
 * Mock strategy (mirrors getAggregatedHealth.test.ts):
 *   vi.hoisted() creates mock functions BEFORE vi.mock() factory executes,
 *   satisfying Vitest's hoisting requirement and avoiding "used before defined" errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoist mock functions before vi.mock() factory runs ──────────────────────

const { mockScan, mockHget } = vi.hoisted(() => ({
  mockScan: vi.fn<[], Promise<[string, string[]]>>(),
  mockHget: vi.fn<[string, string], Promise<string | null>>(),
}));

// ─── Fully stub ioredis ───────────────────────────────────────────────────────

vi.mock('ioredis', () => {
  class MockRedis {
    scan    = mockScan;
    hget    = mockHget;
    hgetall = vi.fn();                     // present so constructor chain doesn't break
    on      = vi.fn().mockReturnThis();    // satisfies `this.redis.on('error', …)`
    quit    = vi.fn().mockResolvedValue('OK');
  }
  return { default: MockRedis };
});

// ─── SUT import (must come AFTER mock registration) ──────────────────────────

import { FeatureCacheService } from '../../src/services/FeatureCacheService';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureCacheService.getOldestTimestamp', () => {
  let svc: FeatureCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FeatureCacheService('redis://localhost:6379');
  });

  // ── 1. null when no keys ─────────────────────────────────────────────────────
  it('returns null when SCAN finds no component keys (cold cache)', async () => {
    // Single SCAN pass — empty result with terminating cursor '0'
    mockScan.mockResolvedValueOnce(['0', []]);

    const result = await svc.getOldestTimestamp('machine-001');

    expect(result).toBeNull();
    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockHget).not.toHaveBeenCalled();
  });

  // ── 2. minimum timestamp across multiple keys ─────────────────────────────────
  //   Three component keys with epoch timestamps:
  //     SPINDLE            → 1_700_000_300_000
  //     BALL_SCREW_X       → 1_700_000_100_000   ← oldest  (should be returned)
  //     LINEAR_GUIDE_X     → 1_700_000_200_000
  it('returns the minimum timestamp when multiple component keys exist', async () => {
    const machineId = 'machine-001';
    const keys = [
      `ds:features:${machineId}:SPINDLE`,
      `ds:features:${machineId}:BALL_SCREW_X`,
      `ds:features:${machineId}:LINEAR_GUIDE_X`,
    ];

    const OLDEST_TS  = 1_700_000_100_000;
    const MIDDLE_TS  = 1_700_000_200_000;
    const NEWEST_TS  = 1_700_000_300_000;

    // Single SCAN pass returns all three keys
    mockScan.mockResolvedValueOnce(['0', keys]);

    // hget('timestamp') returns different epochs per key
    mockHget
      .mockResolvedValueOnce(String(NEWEST_TS))   // SPINDLE
      .mockResolvedValueOnce(String(OLDEST_TS))   // BALL_SCREW_X
      .mockResolvedValueOnce(String(MIDDLE_TS));  // LINEAR_GUIDE_X

    const result = await svc.getOldestTimestamp(machineId);

    expect(result).toBe(OLDEST_TS);
    expect(mockHget).toHaveBeenCalledTimes(3);
    // Each call fetches the 'timestamp' field from the correct key
    expect(mockHget).toHaveBeenCalledWith(keys[0], 'timestamp');
    expect(mockHget).toHaveBeenCalledWith(keys[1], 'timestamp');
    expect(mockHget).toHaveBeenCalledWith(keys[2], 'timestamp');
  });

  // ── 3. null when Redis throws ────────────────────────────────────────────────
  it('returns null when Redis SCAN rejects (connection refused)', async () => {
    mockScan.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    const result = await svc.getOldestTimestamp('machine-001');

    expect(result).toBeNull();
    expect(mockHget).not.toHaveBeenCalled();
  });
});

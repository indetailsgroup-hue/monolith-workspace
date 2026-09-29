/**
 * FeatureCacheService.getAggregatedHealth — Vitest unit tests
 *
 * Covers three scenarios using a fully-mocked ioredis client:
 *   1. HEALTHY  — SCAN returns no keys (cold / empty cache)
 *   2. CRITICAL — one SPINDLE key, rms=0.2625 → normalizedDeviation=0.85
 *   3. FAILED   — one SPINDLE key, rms=0.30   → normalizedDeviation=1.0  (short-circuit)
 *
 * Mock strategy:
 *   vi.hoisted() creates the mock functions BEFORE vi.mock() factory executes,
 *   satisfying Vitest's hoisting requirement and avoiding "used before defined" errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoist mock functions before vi.mock() factory runs ──────────────────────

const { mockScan, mockHgetall } = vi.hoisted(() => ({
  mockScan:    vi.fn<[], Promise<[string, string[]]>>(),
  mockHgetall: vi.fn<[string], Promise<Record<string, string>>>(),
}));

// ─── Fully stub ioredis ───────────────────────────────────────────────────────

vi.mock('ioredis', () => {
  class MockRedis {
    scan    = mockScan;
    hgetall = mockHgetall;
    on      = vi.fn().mockReturnThis();   // satisfies constructor `this.redis.on('error', …)`
    quit    = vi.fn().mockResolvedValue('OK');
  }
  return { default: MockRedis };
});

// ─── SUT import (must come AFTER mock registration) ──────────────────────────

import { FeatureCacheService } from '../../src/services/FeatureCacheService';
import { HealthStatus } from '../../src/types/maintenance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a realistic hgetall hash with `rms` overridden.
 * All other features sit at their safe baselines so only rms drives the health score:
 *   kurtosis       = 3.00  (baseline) → normalizedDeviation = 0
 *   crest_factor   = 1.50  (baseline) → normalizedDeviation = 0
 *   trend_slope    = 0.000 (baseline) → normalizedDeviation = 0
 *   ewma_deviation = 0.000 (baseline) → normalizedDeviation = 0
 */
function makeFeaturePayload(rms: number): Record<string, string> {
  return {
    rms:           String(rms),
    kurtosis:      '3.0',
    crestFactor:   '1.5',
    slope:         '0',
    ewmaDeviation: '0',
    timestamp:     String(Date.now()),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureCacheService.getAggregatedHealth', () => {
  let svc: FeatureCacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FeatureCacheService('redis://localhost:6379');
  });

  // 1. HEALTHY ─────────────────────────────────────────────────────────────────
  it('returns HEALTHY when SCAN finds no component keys (cold cache)', async () => {
    // Single SCAN pass — empty list + terminating cursor '0'
    mockScan.mockResolvedValueOnce(['0', []]);

    const result = await svc.getAggregatedHealth('machine-001');

    expect(result).toBe(HealthStatus.HEALTHY);
    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockHgetall).not.toHaveBeenCalled();
  });

  // 2. CRITICAL ─────────────────────────────────────────────────────────────────
  //   rms = 0.2625
  //   normalize(0.2625, baseline=0.05, failure=0.30)
  //     = (0.2625 − 0.05) / (0.30 − 0.05) = 0.2125 / 0.25 = 0.85
  //   scoreToHealth(0.85) → CRITICAL  (≥ 0.80 threshold)
  it('returns CRITICAL when worst normalizedDeviation is 0.85 (rms=0.2625)', async () => {
    const machineId = 'machine-001';
    const key       = `ds:features:${machineId}:SPINDLE`;

    mockScan.mockResolvedValueOnce(['0', [key]]);
    mockHgetall.mockResolvedValueOnce(makeFeaturePayload(0.2625));

    const result = await svc.getAggregatedHealth(machineId);

    expect(result).toBe(HealthStatus.CRITICAL);
    expect(mockHgetall).toHaveBeenCalledWith(key);
  });

  // 3. FAILED ──────────────────────────────────────────────────────────────────
  //   rms = 0.30  (exactly at failure threshold)
  //   normalize(0.30, baseline=0.05, failure=0.30) = 1.0
  //   Short-circuit fires immediately — no further keys are read
  it('returns FAILED when rms equals the failure threshold (score 1.0)', async () => {
    const machineId = 'machine-001';
    const key       = `ds:features:${machineId}:SPINDLE`;

    mockScan.mockResolvedValueOnce(['0', [key]]);
    mockHgetall.mockResolvedValueOnce(makeFeaturePayload(0.30));

    const result = await svc.getAggregatedHealth(machineId);

    expect(result).toBe(HealthStatus.FAILED);
    // Short-circuit: only ONE hgetall call — remaining keys (if any) never scanned
    expect(mockHgetall).toHaveBeenCalledTimes(1);
  });
});

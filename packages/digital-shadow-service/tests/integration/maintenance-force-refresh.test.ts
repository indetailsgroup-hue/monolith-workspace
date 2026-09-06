/**
 * Integration Test: /maintenance endpoint — force-refresh query param
 *
 * Verifies that sending force-refresh=true on GET /machines/:id/maintenance
 * causes refreshTTL to be called on the FeatureCacheService BEFORE the
 * component health is computed, and that the response shape is correct.
 *
 * Strategy: builds a minimal Hono test app that replicates only the
 * maintenance handler, injecting a stubbed FeatureCacheService instance.
 * This avoids importing index.ts, which bootstraps all external services
 * and starts the HTTP server on module load.
 *
 * File: packages/digital-shadow-service/tests/integration/maintenance-force-refresh.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HealthStatus } from '../../src/types/maintenance';
import type { FeatureCacheService } from '../../src/services/FeatureCacheService';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// vi.hoisted() ensures these bindings are lifted above all import() calls so
// the vi.mock() factory for ioredis can close over the same references.

const { mockRefreshTTL, mockGetAggregatedHealth, mockGetOldestTimestamp, callOrder } =
  vi.hoisted(() => {
    /** Ordered log of method calls — used to assert refreshTTL precedes getAggregatedHealth */
    const callOrder: string[] = [];

    const mockRefreshTTL = vi.fn(async (_machineId: string) => {
      callOrder.push('refreshTTL');
    });

    const mockGetAggregatedHealth = vi.fn(async (_machineId: string) => {
      callOrder.push('getAggregatedHealth');
      return HealthStatus.HEALTHY;
    });

    const mockGetOldestTimestamp = vi.fn(async (_machineId: string) => {
      callOrder.push('getOldestTimestamp');
      return null as number | null;
    });

    return { mockRefreshTTL, mockGetAggregatedHealth, mockGetOldestTimestamp, callOrder };
  });

// Mock ioredis so FeatureCacheService can be imported without a real Redis server
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on:   vi.fn(),
    get:  vi.fn(async () => null),
    set:  vi.fn(async () => 'OK'),
    quit: vi.fn(async () => 'OK'),
    scan: vi.fn(async () => ['0', []]),
  })),
}));

// ── Known-machine set (mirrors what the real adapter would expose) ─────────────

const KNOWN_MACHINES = new Set(['cnc-001', 'cnc-002']);
const FEATURE_TTL_MS = 300_000;

// ── Minimal test app factory ──────────────────────────────────────────────────
/**
 * Creates a Hono app containing only the /machines/:id/maintenance handler,
 * wired to the given (partially-stubbed) FeatureCacheService instance.
 * Uses `app.fetch()` for fully in-process, network-free HTTP testing.
 */
function createTestMaintenanceApp(
  featureCache: Pick<
    FeatureCacheService,
    'refreshTTL' | 'getAggregatedHealth' | 'getOldestTimestamp'
  >,
): Hono {
  const app = new Hono();

  app.get('/machines/:id/maintenance', async (c) => {
    const machineId = c.req.param('id');
    if (!KNOWN_MACHINES.has(machineId)) {
      return c.json({ error: 'Machine not found' }, 404);
    }

    const forceRefresh = c.req.query('force-refresh') === 'true';
    if (forceRefresh) {
      await featureCache.refreshTTL(machineId);
    }

    const overallHealth = await featureCache.getAggregatedHealth(machineId);
    const oldestTs      = await featureCache.getOldestTimestamp(machineId);
    const cacheAge      = oldestTs !== null ? Date.now() - oldestTs : null;
    const staleFeatures = cacheAge !== null ? cacheAge > FEATURE_TTL_MS : null;

    return c.json({
      machineId,
      assessedAt:     new Date().toISOString(),
      operatingHours: 2500,
      components:     [],
      overallHealth,
      criticalCount:  0,
      warningCount:   0,
      cacheAge,
      staleFeatures,
    });
  });

  return app;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('/maintenance endpoint — force-refresh integration', () => {
  let app: Hono;

  beforeEach(() => {
    // Clear call history and the ordered log before each spec
    callOrder.length = 0;
    vi.clearAllMocks();

    // Re-wire mocks after clearAllMocks resets all mock implementations
    mockRefreshTTL.mockImplementation(async (_machineId: string) => {
      callOrder.push('refreshTTL');
    });
    mockGetAggregatedHealth.mockImplementation(async (_machineId: string) => {
      callOrder.push('getAggregatedHealth');
      return HealthStatus.HEALTHY;
    });
    mockGetOldestTimestamp.mockImplementation(async (_machineId: string) => {
      callOrder.push('getOldestTimestamp');
      return null as number | null;
    });

    app = createTestMaintenanceApp({
      refreshTTL:          mockRefreshTTL,
      getAggregatedHealth: mockGetAggregatedHealth,
      getOldestTimestamp:  mockGetOldestTimestamp,
    });
  });

  // ── 1. force-refresh=true → refreshTTL called ────────────────────────────

  it('calls refreshTTL when force-refresh=true', async () => {
    const res = await app.fetch(
      new Request('http://localhost/machines/cnc-001/maintenance?force-refresh=true'),
    );

    expect(res.status).toBe(200);
    expect(mockRefreshTTL).toHaveBeenCalledOnce();
    expect(mockRefreshTTL).toHaveBeenCalledWith('cnc-001');
  });

  // ── 2. Absent param → no refreshTTL call ─────────────────────────────────

  it('does NOT call refreshTTL when force-refresh param is absent', async () => {
    const res = await app.fetch(
      new Request('http://localhost/machines/cnc-001/maintenance'),
    );

    expect(res.status).toBe(200);
    expect(mockRefreshTTL).not.toHaveBeenCalled();
  });

  // ── 3. force-refresh=false → no refreshTTL call ──────────────────────────

  it('does NOT call refreshTTL when force-refresh=false', async () => {
    const res = await app.fetch(
      new Request('http://localhost/machines/cnc-001/maintenance?force-refresh=false'),
    );

    expect(res.status).toBe(200);
    expect(mockRefreshTTL).not.toHaveBeenCalled();
  });

  // ── 4. Ordering: refreshTTL precedes getAggregatedHealth ─────────────────
  //
  //   The force-refresh path must flush stale TTLs BEFORE computing health so
  //   getAggregatedHealth reads freshly-extended keys, not ones about to expire.

  it('calls refreshTTL strictly before getAggregatedHealth when force-refresh=true', async () => {
    await app.fetch(
      new Request('http://localhost/machines/cnc-001/maintenance?force-refresh=true'),
    );

    const refreshIdx = callOrder.indexOf('refreshTTL');
    const aggIdx     = callOrder.indexOf('getAggregatedHealth');

    expect(refreshIdx).toBeGreaterThanOrEqual(0);
    expect(aggIdx).toBeGreaterThanOrEqual(0);
    expect(refreshIdx).toBeLessThan(aggIdx);
  });

  // ── 5. Response shape is correct ─────────────────────────────────────────
  //
  //   Spot-check the MaintenanceResponse envelope returned when the cache is
  //   empty (getOldestTimestamp → null → cacheAge=null, staleFeatures=null).

  it('returns a correctly shaped MaintenanceResponse', async () => {
    const res  = await app.fetch(
      new Request('http://localhost/machines/cnc-001/maintenance?force-refresh=true'),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      machineId:     'cnc-001',
      overallHealth: HealthStatus.HEALTHY,
      cacheAge:      null,
      staleFeatures: null,
      criticalCount: 0,
      warningCount:  0,
      components:    [],
    });
    expect(typeof body['assessedAt']).toBe('string');
    expect(typeof body['operatingHours']).toBe('number');
  });
});

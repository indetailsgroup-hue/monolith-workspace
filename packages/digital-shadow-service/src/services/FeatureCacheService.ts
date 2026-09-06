/**
 * FeatureCacheService — Redis hash cache for FeatureEngineeringService output
 *
 * Key schema : ds:features:{machineId}:{componentType}
 * TTL        : 300 s (refreshed on every write)
 *
 * Converts computed time-domain + trend features → DegradationIndicator[]
 * using fixed ISO 281-aligned thresholds.  All Redis errors are swallowed so
 * connectivity issues never crash the hot sensor path.
 *
 * @version 1.3.0  — added getAggregatedHealth(), getOldestTimestamp(), refreshTTL()
 */

import Redis from 'ioredis';
import { HealthStatus, type DegradationIndicator } from '../types/maintenance';

// ─── Cached feature schema ────────────────────────────────────────────────────

export interface CachedFeatures {
  rms: number;
  kurtosis: number;
  crestFactor: number;
  slope: number;
  ewmaDeviation: number;
  timestamp: number; // ms epoch
}

// ─── Fixed health thresholds ──────────────────────────────────────────────────

const T = {
  rms_vibration:  { baseline: 0.05,  warning: 0.18,  failure: 0.30 },
  kurtosis:       { baseline: 3.00,  warning: 4.50,  failure: 7.00 },
  crest_factor:   { baseline: 1.50,  warning: 3.00,  failure: 5.00 },
  trend_slope:    { baseline: 0.000, warning: 0.001, failure: 0.005 },
  ewma_deviation: { baseline: 0.000, warning: 0.20,  failure: 0.40  },
} as const;

// ─── normalizedDeviation → HealthStatus thresholds ───────────────────────────

const HEALTH_THRESHOLDS: [number, HealthStatus][] = [
  [1.0, HealthStatus.FAILED],
  [0.8, HealthStatus.CRITICAL],
  [0.6, HealthStatus.WARNING],
  [0.4, HealthStatus.DEGRADING],
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalize(value: number, baseline: number, failure: number): number {
  if (failure <= baseline) return 0;
  return Math.min(1, Math.max(0, (value - baseline) / (failure - baseline)));
}

function toIndicators(f: CachedFeatures): DegradationIndicator[] {
  return [
    {
      name: 'rms_vibration',
      currentValue: f.rms,
      warningThreshold: T.rms_vibration.warning,
      failureThreshold: T.rms_vibration.failure,
      normalizedDeviation: normalize(f.rms, T.rms_vibration.baseline, T.rms_vibration.failure),
    },
    {
      name: 'kurtosis',
      currentValue: f.kurtosis,
      warningThreshold: T.kurtosis.warning,
      failureThreshold: T.kurtosis.failure,
      normalizedDeviation: normalize(f.kurtosis, T.kurtosis.baseline, T.kurtosis.failure),
    },
    {
      name: 'crest_factor',
      currentValue: f.crestFactor,
      warningThreshold: T.crest_factor.warning,
      failureThreshold: T.crest_factor.failure,
      normalizedDeviation: normalize(f.crestFactor, T.crest_factor.baseline, T.crest_factor.failure),
    },
    {
      name: 'trend_slope',
      currentValue: f.slope,
      warningThreshold: T.trend_slope.warning,
      failureThreshold: T.trend_slope.failure,
      normalizedDeviation: normalize(f.slope, T.trend_slope.baseline, T.trend_slope.failure),
    },
    {
      name: 'ewma_deviation',
      currentValue: f.ewmaDeviation,
      warningThreshold: T.ewma_deviation.warning,
      failureThreshold: T.ewma_deviation.failure,
      normalizedDeviation: normalize(f.ewmaDeviation, T.ewma_deviation.baseline, T.ewma_deviation.failure),
    },
  ];
}

/** Map worst normalizedDeviation score → HealthStatus (worst-wins). */
function scoreToHealth(worstScore: number): HealthStatus {
  for (const [threshold, status] of HEALTH_THRESHOLDS) {
    if (worstScore >= threshold) return status;
  }
  return HealthStatus.HEALTHY;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const FEATURE_TTL_S = 300;

export class FeatureCacheService {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true });
    // Swallow all Redis errors — cache miss is always handled gracefully
    this.redis.on('error', () => undefined);
  }

  private cacheKey(machineId: string, componentType: string): string {
    return `ds:features:${machineId}:${componentType}`;
  }

  /** Write (or refresh) all feature scalars for one component. */
  async setFeatures(
    machineId: string,
    componentType: string,
    features: CachedFeatures,
  ): Promise<void> {
    try {
      const key = this.cacheKey(machineId, componentType);
      await this.redis.hset(
        key,
        'rms',           String(features.rms),
        'kurtosis',      String(features.kurtosis),
        'crestFactor',   String(features.crestFactor),
        'slope',         String(features.slope),
        'ewmaDeviation', String(features.ewmaDeviation),
        'timestamp',     String(features.timestamp),
      );
      await this.redis.expire(key, FEATURE_TTL_S);
    } catch {
      // swallow — Redis unavailability must not crash the sensor pipeline
    }
  }

  /**
   * Read cached features and convert them to DegradationIndicators.
   * Returns null when the key is absent or Redis is unavailable.
   */
  async getIndicators(
    machineId: string,
    componentType: string,
  ): Promise<DegradationIndicator[] | null> {
    try {
      const raw = await this.redis.hgetall(this.cacheKey(machineId, componentType));
      if (!raw || !raw['rms']) return null;

      return toIndicators({
        rms:           parseFloat(raw['rms']!),
        kurtosis:      parseFloat(raw['kurtosis']!),
        crestFactor:   parseFloat(raw['crestFactor']!),
        slope:         parseFloat(raw['slope']!),
        ewmaDeviation: parseFloat(raw['ewmaDeviation']!),
        timestamp:     parseInt(raw['timestamp']!, 10),
      });
    } catch {
      return null;
    }
  }

  /**
   * Scan all cached component keys for `machineId` and return the overall
   * HealthStatus derived from the single worst normalizedDeviation score
   * across every component and every feature indicator.
   *
   * Precedence (worst → best):
   *   FAILED (≥ 1.0) > CRITICAL (≥ 0.8) > WARNING (≥ 0.6) > DEGRADING (≥ 0.4) > HEALTHY
   *
   * Returns HEALTHY when no keys are cached or Redis is unavailable.
   */
  async getAggregatedHealth(machineId: string): Promise<HealthStatus> {
    try {
      // Use SCAN (non-blocking) to enumerate all component keys for this machine.
      const pattern = `ds:features:${machineId}:*`;
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, found] = await this.redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100,
        );
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== '0');

      if (keys.length === 0) return HealthStatus.HEALTHY;

      let worstScore = 0;

      for (const key of keys) {
        // Extract componentType from key pattern ds:features:{machineId}:{componentType}
        const componentType = key.split(':').pop() ?? '';
        if (!componentType) continue;

        const indicators = await this.getIndicators(machineId, componentType);
        if (!indicators) continue;

        for (const ind of indicators) {
          if (ind.normalizedDeviation > worstScore) {
            worstScore = ind.normalizedDeviation;
          }
        }

        // Short-circuit: FAILED is the worst possible — no need to scan further
        if (worstScore >= 1.0) return HealthStatus.FAILED;
      }

      return scoreToHealth(worstScore);
    } catch {
      // Redis unavailable — fail open with HEALTHY so the endpoint keeps serving
      return HealthStatus.HEALTHY;
    }
  }


  /**
   * Return the oldest feature `timestamp` (ms epoch) across all cached component
   * keys for `machineId`.  Used by the /maintenance endpoint to compute `cacheAge`.
   *
   * Returns null when no keys are found or Redis is unavailable.
   */
  async getOldestTimestamp(machineId: string): Promise<number | null> {
    try {
      const pattern = `ds:features:${machineId}:*`;
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, found] = await this.redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100,
        );
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== '0');

      if (keys.length === 0) return null;

      let oldest: number | null = null;

      for (const key of keys) {
        const raw = await this.redis.hget(key, 'timestamp');
        if (!raw) continue;
        const ts = parseInt(raw, 10);
        if (!Number.isFinite(ts)) continue;
        if (oldest === null || ts < oldest) oldest = ts;
      }

      return oldest;
    } catch {
      return null;
    }
  }


  /**
   * Reset the 300 s TTL on every cached component key for `machineId`.
   *
   * Call this whenever new sensor data arrives so warm keys never expire
   * mid-analysis cycle.  Uses a Redis pipeline to batch all EXPIRE commands
   * into a single round-trip.  Errors are swallowed — TTL drift is recoverable.
   *
   * @param machineId  Machine whose component keys should be refreshed.
   */
  async refreshTTL(machineId: string): Promise<void> {
    try {
      // 1. Collect all component keys via non-blocking SCAN
      const pattern = `ds:features:${machineId}:*`;
      const keys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, found] = await this.redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100,
        );
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== '0');

      if (keys.length === 0) return;

      // 2. Pipeline all EXPIRE commands — single round-trip to Redis
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.expire(key, FEATURE_TTL_S);
      }
      await pipeline.exec();
    } catch {
      // swallow — TTL drift is recoverable on the next setFeatures() call
    }
  }

  async quit(): Promise<void> {
    try { await this.redis.quit(); } catch { /* ignore */ }
  }
}


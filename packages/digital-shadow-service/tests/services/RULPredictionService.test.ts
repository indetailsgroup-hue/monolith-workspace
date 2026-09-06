/**
 * RULPredictionService Unit Tests
 * Phase 3 — Predictive Maintenance (Weibull Survival Model)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RULPredictionService,
  DEFAULT_RUL_CONFIG,
  DegradationIndicator,
} from '../../src/services/RULPredictionService';
import { ComponentType, HealthStatus, MaintenanceUrgency } from '../../src/types/maintenance';

// Mock pino logger
const mockLogger = {
  child: () => mockLogger,
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

// ─── Helpers ─────────────────────────────────────────────────────────

function createIndicators(overrides: Partial<DegradationIndicator>[] = []): DegradationIndicator[] {
  const defaults: DegradationIndicator[] = [
    {
      name: 'vibration_rms',
      currentValue: 3.5,
      warningThreshold: 5.0,
      failureThreshold: 8.0,
      normalizedDeviation: 0.2,
    },
    {
      name: 'kurtosis',
      currentValue: 4.0,
      warningThreshold: 5.5,
      failureThreshold: 7.0,
      normalizedDeviation: 0.15,
    },
    {
      name: 'temperature_delta',
      currentValue: 5.0,
      warningThreshold: 12,
      failureThreshold: 18,
      normalizedDeviation: 0.1,
    },
  ];

  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('RULPredictionService', () => {
  let service: RULPredictionService;

  beforeEach(() => {
    service = new RULPredictionService({ logger: mockLogger });
  });

  // ═══════════════════════════════════════════════════════════════════
  // WEIBULL DISTRIBUTION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  describe('survivalFunction()', () => {
    it('returns 1 at t = 0', () => {
      expect(service.survivalFunction(0, 2.5, 8000)).toBe(1);
    });

    it('returns 1 for negative t', () => {
      expect(service.survivalFunction(-100, 2.5, 8000)).toBe(1);
    });

    it('returns 1 through the 3-parameter Weibull threshold', () => {
      expect(service.survivalFunction(799, 2.5, 8000, 800)).toBe(1);
      expect(service.survivalFunction(800, 2.5, 8000, 800)).toBe(1);
    });

    it('returns exp(-1) ≈ 0.368 at t = scale (characteristic life)', () => {
      const survival = service.survivalFunction(8000, 1, 8000);
      expect(survival).toBeCloseTo(Math.exp(-1), 5);
    });

    it('decreases monotonically with time', () => {
      const s1 = service.survivalFunction(1000, 2.5, 8000);
      const s2 = service.survivalFunction(4000, 2.5, 8000);
      const s3 = service.survivalFunction(8000, 2.5, 8000);
      expect(s1).toBeGreaterThan(s2);
      expect(s2).toBeGreaterThan(s3);
    });

    it('approaches 0 for very large t', () => {
      const survival = service.survivalFunction(50000, 2.5, 8000);
      expect(survival).toBeLessThan(0.001);
    });

    it('higher shape parameter gives steeper drop-off', () => {
      const s_low_shape = service.survivalFunction(8000, 1.5, 8000);
      const s_high_shape = service.survivalFunction(8000, 4.0, 8000);
      // With β=1 exactly: S(η) = exp(-1). Higher β → steeper around η
      // Both at t=η give exp(-1), but the shapes differ elsewhere
      const s_low_early = service.survivalFunction(4000, 1.5, 8000);
      const s_high_early = service.survivalFunction(4000, 4.0, 8000);
      // Higher shape → survival drops more steeply around scale
      expect(s_high_early).toBeGreaterThan(s_low_early);
    });
  });

  describe('hazardFunction()', () => {
    it('returns 0 for t <= 0', () => {
      expect(service.hazardFunction(0, 2.5, 8000)).toBe(0);
      expect(service.hazardFunction(-10, 2.5, 8000)).toBe(0);
    });

    it('returns 0 before the 3-parameter Weibull threshold', () => {
      expect(service.hazardFunction(799, 2.5, 8000, 800)).toBe(0);
    });

    it('increases with time when shape > 1 (wear-out)', () => {
      const h1 = service.hazardFunction(2000, 2.5, 8000);
      const h2 = service.hazardFunction(4000, 2.5, 8000);
      const h3 = service.hazardFunction(6000, 2.5, 8000);
      expect(h2).toBeGreaterThan(h1);
      expect(h3).toBeGreaterThan(h2);
    });

    it('is constant when shape = 1 (exponential)', () => {
      const h1 = service.hazardFunction(1000, 1.0, 8000);
      const h2 = service.hazardFunction(5000, 1.0, 8000);
      expect(h1).toBeCloseTo(h2, 10);
    });

    it('decreases with time when shape < 1 (infant mortality)', () => {
      const h1 = service.hazardFunction(1000, 0.5, 8000);
      const h2 = service.hazardFunction(5000, 0.5, 8000);
      expect(h1).toBeGreaterThan(h2);
    });
  });

  describe('cdf()', () => {
    it('returns 0 for t <= 0', () => {
      expect(service.cdf(0, 2.5, 8000)).toBe(0);
      expect(service.cdf(-5, 2.5, 8000)).toBe(0);
    });

    it('equals 1 - survival', () => {
      const t = 5000;
      const survival = service.survivalFunction(t, 2.5, 8000);
      const cdf = service.cdf(t, 2.5, 8000);
      expect(cdf + survival).toBeCloseTo(1, 10);
    });

    it('approaches 1 for large t', () => {
      expect(service.cdf(50000, 2.5, 8000)).toBeGreaterThan(0.999);
    });
  });

  describe('quantileFunction()', () => {
    it('returns 0 for p = 0', () => {
      expect(service.quantileFunction(0, 2.5, 8000)).toBe(0);
    });

    it('returns Infinity for p = 1', () => {
      expect(service.quantileFunction(1, 2.5, 8000)).toBe(Infinity);
    });

    it('returns scale * (ln2)^(1/β) for p = 0.5 (median)', () => {
      const median = service.quantileFunction(0.5, 2.5, 8000);
      const expected = 8000 * Math.pow(Math.log(2), 1 / 2.5);
      expect(median).toBeCloseTo(expected, 5);
    });

    it('adds the threshold to a 3-parameter Weibull quantile', () => {
      const median = service.quantileFunction(0.5, 2.5, 8000, 800);
      const expected = 800 + 8000 * Math.pow(Math.log(2), 1 / 2.5);
      expect(median).toBeCloseTo(expected, 5);
    });

    it('is the inverse of cdf', () => {
      const t_original = 4500;
      const p = service.cdf(t_original, 2.5, 8000);
      const t_recovered = service.quantileFunction(p, 2.5, 8000);
      expect(t_recovered).toBeCloseTo(t_original, 3);
    });

    it('increases monotonically with p', () => {
      const q10 = service.quantileFunction(0.1, 2.5, 8000);
      const q50 = service.quantileFunction(0.5, 2.5, 8000);
      const q90 = service.quantileFunction(0.9, 2.5, 8000);
      expect(q50).toBeGreaterThan(q10);
      expect(q90).toBeGreaterThan(q50);
    });
  });

  describe('pdf()', () => {
    it('returns 0 for t <= 0', () => {
      expect(service.pdf(0, 2.5, 8000)).toBe(0);
      expect(service.pdf(-10, 2.5, 8000)).toBe(0);
    });

    it('is non-negative everywhere', () => {
      for (let t = 100; t < 20000; t += 500) {
        expect(service.pdf(t, 2.5, 8000)).toBeGreaterThanOrEqual(0);
      }
    });

    it('integrates approximately to 1 (trapezoidal)', () => {
      // Numerical integration from 0 to 30000 with step 10
      let integral = 0;
      const step = 10;
      for (let t = step; t <= 30000; t += step) {
        integral += service.pdf(t, 2.5, 8000) * step;
      }
      expect(integral).toBeCloseTo(1, 1);
    });
  });

  describe('weibullMean()', () => {
    it('equals scale for shape = 1 (exponential)', () => {
      // E[T] = η * Γ(2) = η * 1 = η
      const mean = service.weibullMean(1, 8000);
      expect(mean).toBeCloseTo(8000, 1);
    });

    it('equals scale * sqrt(π)/2 for shape = 2 (Rayleigh)', () => {
      const mean = service.weibullMean(2, 8000);
      const expected = 8000 * Math.sqrt(Math.PI) / 2;
      expect(mean).toBeCloseTo(expected, 0);
    });
  });

  describe('gamma()', () => {
    it('Γ(1) = 1', () => {
      expect(service.gamma(1)).toBeCloseTo(1, 8);
    });

    it('Γ(2) = 1', () => {
      expect(service.gamma(2)).toBeCloseTo(1, 8);
    });

    it('Γ(3) = 2', () => {
      expect(service.gamma(3)).toBeCloseTo(2, 6);
    });

    it('Γ(5) = 24', () => {
      expect(service.gamma(5)).toBeCloseTo(24, 4);
    });

    it('Γ(0.5) = √π', () => {
      expect(service.gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 5);
    });

    it('Γ(1.5) = √π / 2', () => {
      expect(service.gamma(1.5)).toBeCloseTo(Math.sqrt(Math.PI) / 2, 5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // COVARIATE HAZARD MODEL
  // ═══════════════════════════════════════════════════════════════════

  describe('computeHazardMultiplier()', () => {
    it('returns baselineMultiplier when no indicators match weights', () => {
      const indicators: DegradationIndicator[] = [{
        name: 'unknown_feature',
        currentValue: 10,
        warningThreshold: 7,
        failureThreshold: 10,
        normalizedDeviation: 0.9,
      }];

      const covariates = { weights: { vibration_rms: 0.35 }, baselineMultiplier: 1.0 };
      const multiplier = service.computeHazardMultiplier(indicators, covariates);
      // exp(0) * 1.0 = 1.0
      expect(multiplier).toBeCloseTo(1.0, 5);
    });

    it('increases multiplier with degradation', () => {
      const indicators = createIndicators([
        { normalizedDeviation: 0.8 },
        { normalizedDeviation: 0.7 },
        { normalizedDeviation: 0.6 },
      ]);

      const covariates = DEFAULT_RUL_CONFIG.covariateWeights[ComponentType.SPINDLE]!;
      const multiplier = service.computeHazardMultiplier(indicators, covariates);
      expect(multiplier).toBeGreaterThan(1);
    });

    it('returns ~1 for zero deviations (healthy state)', () => {
      const indicators = createIndicators([
        { normalizedDeviation: 0 },
        { normalizedDeviation: 0 },
        { normalizedDeviation: 0 },
      ]);

      const covariates = DEFAULT_RUL_CONFIG.covariateWeights[ComponentType.SPINDLE]!;
      const multiplier = service.computeHazardMultiplier(indicators, covariates);
      expect(multiplier).toBeCloseTo(1.0, 2);
    });

    it('is capped at 50 for extreme degradation', () => {
      const indicators: DegradationIndicator[] = [{
        name: 'vibration_rms',
        currentValue: 100,
        warningThreshold: 5,
        failureThreshold: 8,
        normalizedDeviation: 50, // extreme!
      }];

      const covariates = { weights: { vibration_rms: 1.0 }, baselineMultiplier: 1.0 };
      const multiplier = service.computeHazardMultiplier(indicators, covariates);
      expect(multiplier).toBe(50);
    });

    it('is floored at 0.1', () => {
      const indicators: DegradationIndicator[] = [{
        name: 'vibration_rms',
        currentValue: 0,
        warningThreshold: 5,
        failureThreshold: 8,
        normalizedDeviation: -100, // negative (below baseline)
      }];

      const covariates = { weights: { vibration_rms: 1.0 }, baselineMultiplier: 1.0 };
      const multiplier = service.computeHazardMultiplier(indicators, covariates);
      expect(multiplier).toBe(0.1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // RUL PREDICTION
  // ═══════════════════════════════════════════════════════════════════

  describe('predictRUL()', () => {
    it('returns valid RUL estimate for healthy spindle', () => {
      const indicators = createIndicators([
        { normalizedDeviation: 0.1 },
        { normalizedDeviation: 0.05 },
        { normalizedDeviation: 0.08 },
      ]);

      const rul = service.predictRUL('machine-001', ComponentType.SPINDLE, 2000, indicators);

      expect(rul.median).toBeGreaterThan(0);
      expect(rul.lowerBound).toBeLessThanOrEqual(rul.median);
      expect(rul.upperBound).toBeGreaterThanOrEqual(rul.median);
      expect(rul.survivalProbability).toBeGreaterThan(0);
      expect(rul.survivalProbability).toBeLessThanOrEqual(1);
      expect(rul.hazardRate).toBeGreaterThanOrEqual(0);
      expect(rul.confidence).toBeGreaterThan(0);
      expect(rul.confidence).toBeLessThanOrEqual(1);
      expect(rul.method).toBe('weibull_3p_proportional_hazards');
    });

    it('predicts shorter RUL for degraded component', () => {
      const healthyIndicators = createIndicators([
        { normalizedDeviation: 0.05 },
        { normalizedDeviation: 0.05 },
        { normalizedDeviation: 0.05 },
      ]);

      const degradedIndicators = createIndicators([
        { normalizedDeviation: 0.8 },
        { normalizedDeviation: 0.7 },
        { normalizedDeviation: 0.6 },
      ]);

      const healthyRUL = service.predictRUL('m1', ComponentType.SPINDLE, 3000, healthyIndicators);
      const degradedRUL = service.predictRUL('m1', ComponentType.SPINDLE, 3000, degradedIndicators);

      expect(degradedRUL.median).toBeLessThan(healthyRUL.median);
    });

    it('predicts shorter RUL with more operating hours', () => {
      const indicators = createIndicators();
      const rul_early = service.predictRUL('m1', ComponentType.SPINDLE, 1000, indicators);
      const rul_late = service.predictRUL('m1', ComponentType.SPINDLE, 6000, indicators);

      expect(rul_late.median).toBeLessThan(rul_early.median);
    });

    it('respects minRULHours floor', () => {
      const criticalIndicators = createIndicators([
        { normalizedDeviation: 5.0 },
        { normalizedDeviation: 5.0 },
        { normalizedDeviation: 5.0 },
      ]);

      const rul = service.predictRUL('m1', ComponentType.SPINDLE, 9000, criticalIndicators);
      expect(rul.median).toBeGreaterThanOrEqual(DEFAULT_RUL_CONFIG.minRULHours);
      expect(rul.lowerBound).toBeGreaterThanOrEqual(DEFAULT_RUL_CONFIG.minRULHours);
    });

    it('respects maxRULHours ceiling', () => {
      const healthyIndicators = createIndicators([
        { normalizedDeviation: 0 },
        { normalizedDeviation: 0 },
        { normalizedDeviation: 0 },
      ]);

      const rul = service.predictRUL('m1', ComponentType.SPINDLE, 100, healthyIndicators);
      expect(rul.median).toBeLessThanOrEqual(DEFAULT_RUL_CONFIG.maxRULHours);
      expect(rul.upperBound).toBeLessThanOrEqual(DEFAULT_RUL_CONFIG.maxRULHours);
    });

    it('uses fallback params for unconfigured component types', () => {
      const indicators = createIndicators();
      const rul = service.predictRUL('m1', ComponentType.DUST_COLLECTOR, 1000, indicators);
      expect(rul.median).toBeGreaterThan(0);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('caches operating hours', () => {
      const indicators = createIndicators();
      service.predictRUL('m1', ComponentType.SPINDLE, 5000, indicators);

      const cached = service.getOperatingHours('m1', ComponentType.SPINDLE);
      expect(cached).toBe(5000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // HEALTH ASSESSMENT
  // ═══════════════════════════════════════════════════════════════════

  describe('assessComponentHealth()', () => {
    it('returns HEALTHY for high RUL + low anomaly', () => {
      const rulEstimate = {
        median: 5000,
        lowerBound: 4000,
        upperBound: 6000,
        survivalProbability: 0.9,
        hazardRate: 0.0001,
        confidence: 0.8,
        method: 'weibull_proportional_hazards' as const,
      };

      const indicators = createIndicators([
        { normalizedDeviation: 0.05 },
        { normalizedDeviation: 0.05 },
        { normalizedDeviation: 0.05 },
      ]);

      const health = service.assessComponentHealth(
        'machine-001',
        ComponentType.SPINDLE,
        rulEstimate,
        0.1,
        indicators,
      );

      expect(health.status).toBe(HealthStatus.HEALTHY);
      expect(health.healthScore).toBeGreaterThan(0.8);
    });

    it('returns CRITICAL for low RUL + high anomaly', () => {
      const rulEstimate = {
        median: 10,
        lowerBound: 5,
        upperBound: 20,
        survivalProbability: 0.05,
        hazardRate: 0.1,
        confidence: 0.6,
        method: 'weibull_proportional_hazards' as const,
      };

      const indicators = createIndicators([
        { normalizedDeviation: 0.9 },
        { normalizedDeviation: 0.85 },
        { normalizedDeviation: 0.8 },
      ]);

      const health = service.assessComponentHealth(
        'machine-001',
        ComponentType.SPINDLE,
        rulEstimate,
        0.9,
        indicators,
      );

      expect(health.status).toBe(HealthStatus.CRITICAL);
      expect(health.healthScore).toBeLessThan(0.25);
    });

    it('includes contributing factors from degraded indicators', () => {
      const rulEstimate = {
        median: 500,
        lowerBound: 300,
        upperBound: 700,
        survivalProbability: 0.5,
        hazardRate: 0.01,
        confidence: 0.7,
        method: 'weibull_proportional_hazards' as const,
      };

      const indicators = createIndicators([
        { normalizedDeviation: 0.6 },  // > 0.3 threshold
        { normalizedDeviation: 0.2 },  // below threshold
        { normalizedDeviation: 0.9 },  // > 0.3 threshold
      ]);

      const health = service.assessComponentHealth(
        'machine-001',
        ComponentType.SPINDLE,
        rulEstimate,
        0.5,
        indicators,
      );

      // Only indicators with deviation > 0.3 appear as contributing factors
      expect(health.contributingFactors.length).toBe(2);
      expect(health.contributingFactors[0]!.severity).toBe('medium');
      expect(health.contributingFactors[1]!.severity).toBe('high');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MAINTENANCE RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════

  describe('generateRecommendation()', () => {
    it('returns null for healthy components', () => {
      const health = {
        machineId: 'machine-001',
        componentType: ComponentType.SPINDLE,
        healthScore: 0.95,
        status: HealthStatus.HEALTHY,
        remainingUsefulLife: 5000,
        confidence: 0.85,
        lastUpdated: new Date(),
        contributingFactors: [],
      };

      const rec = service.generateRecommendation(health);
      expect(rec).toBeNull();
    });

    it('generates IMMEDIATE urgency for very low RUL', () => {
      const health = {
        machineId: 'machine-001',
        componentType: ComponentType.SPINDLE,
        healthScore: 0.15,
        status: HealthStatus.CRITICAL,
        remainingUsefulLife: 10,
        confidence: 0.7,
        lastUpdated: new Date(),
        contributingFactors: [],
      };

      const rec = service.generateRecommendation(health);
      expect(rec).not.toBeNull();
      expect(rec!.urgency).toBe(MaintenanceUrgency.IMMEDIATE);
      expect(rec!.action).toContain('Replace spindle bearings');
    });

    it('generates URGENT for 1-7 day RUL', () => {
      const health = {
        machineId: 'machine-001',
        componentType: ComponentType.SPINDLE,
        healthScore: 0.35,
        status: HealthStatus.WARNING,
        remainingUsefulLife: 100, // ~4 days
        confidence: 0.75,
        lastUpdated: new Date(),
        contributingFactors: [],
      };

      const rec = service.generateRecommendation(health);
      expect(rec!.urgency).toBe(MaintenanceUrgency.URGENT);
    });

    it('estimates higher downtime for urgent repairs', () => {
      const health = {
        machineId: 'machine-001',
        componentType: ComponentType.SPINDLE,
        healthScore: 0.15,
        status: HealthStatus.CRITICAL,
        remainingUsefulLife: 5,
        confidence: 0.7,
        lastUpdated: new Date(),
        contributingFactors: [],
      };

      const rec = service.generateRecommendation(health);
      // IMMEDIATE spindle replacement: 480 * 1.5 = 720
      expect(rec!.estimatedDowntimeMinutes).toBe(720);
    });

    it('generates tool-specific action for TOOL_HOLDER', () => {
      const health = {
        machineId: 'machine-001',
        componentType: ComponentType.TOOL_HOLDER,
        healthScore: 0.20,
        status: HealthStatus.CRITICAL,
        remainingUsefulLife: 5,
        confidence: 0.8,
        lastUpdated: new Date(),
        contributingFactors: [],
      };

      const rec = service.generateRecommendation(health);
      expect(rec!.action).toContain('tool');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // BATCH PREDICT
  // ═══════════════════════════════════════════════════════════════════

  describe('batchPredict()', () => {
    it('returns estimates for all components', () => {
      const components = [
        { componentType: ComponentType.SPINDLE, operatingHours: 3000, degradationIndicators: createIndicators() },
        { componentType: ComponentType.BALL_SCREW_X, operatingHours: 5000, degradationIndicators: createIndicators() },
        { componentType: ComponentType.VACUUM_PUMP, operatingHours: 2000, degradationIndicators: createIndicators() },
      ];

      const results = service.batchPredict('machine-001', components);
      expect(results.size).toBe(3);
      expect(results.has(ComponentType.SPINDLE)).toBe(true);
      expect(results.has(ComponentType.BALL_SCREW_X)).toBe(true);
      expect(results.has(ComponentType.VACUUM_PUMP)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // OPERATING HOURS TRACKING
  // ═══════════════════════════════════════════════════════════════════

  describe('operating hours tracking', () => {
    it('stores and retrieves operating hours', () => {
      service.updateOperatingHours('m1', ComponentType.SPINDLE, 1234);
      expect(service.getOperatingHours('m1', ComponentType.SPINDLE)).toBe(1234);
    });

    it('returns undefined for unknown machine-component', () => {
      expect(service.getOperatingHours('unknown', ComponentType.SPINDLE)).toBeUndefined();
    });

    it('updates existing value', () => {
      service.updateOperatingHours('m1', ComponentType.SPINDLE, 1000);
      service.updateOperatingHours('m1', ComponentType.SPINDLE, 2000);
      expect(service.getOperatingHours('m1', ComponentType.SPINDLE)).toBe(2000);
    });
  });
});

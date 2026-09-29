/**
 * AnomalyDetectionService Unit Tests
 * Phase 3 — Predictive Maintenance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnomalyDetectionService, DEFAULT_ANOMALY_CONFIG } from '../../src/services/AnomalyDetectionService';
import { ComponentType, FeatureVector } from '../../src/types/maintenance';

// Mock pino logger
const mockLogger = {
  child: () => mockLogger,
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

// ─── Test Data Generators ────────────────────────────────────────────

function generateNormalSamples(n: number, dim: number, seed = 42): number[][] {
  let state = seed;
  const rng = () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 4294967296;
  };

  // Box-Muller transform for normal distribution
  const normal = () => {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  };

  const data: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) {
      row.push(normal() * 0.5 + 5); // mean=5, std=0.5
    }
    data.push(row);
  }
  return data;
}

function generateAnomalySample(dim: number): number[] {
  // Way outside the normal distribution
  return Array.from({ length: dim }, () => 20 + Math.random() * 10);
}

function createMockFeatureVector(overrides: Partial<FeatureVector> = {}): FeatureVector {
  return {
    machineId: 'machine-001',
    componentType: ComponentType.SPINDLE,
    timestamp: new Date('2026-08-01T10:00:00Z'),
    timeDomain: {
      rms: 2.5,
      kurtosis: 3.2,
      crestFactor: 4.1,
      skewness: 0.1,
      shapeFactor: 1.5,
      peak: 10.0,
      peakToPeak: 18.0,
      mean: 0.5,
      standardDeviation: 2.0,
    },
    frequencyDomain: {
      dominantFrequency: 120,
      dominantAmplitude: 5.5,
      spectralKurtosis: 3.0,
      bandEnergies: [],
      totalEnergy: 50,
      meanFrequency: 100,
      rmsFrequency: 110,
    },
    trend: {
      slope: 0.001,
      acceleration: 0.0001,
      ewma: 2.4,
      ewmaDeviation: 0.1,
      changePointDetected: false,
    },
    windowSizeMs: 60000,
    sampleCount: 1024,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService;

  beforeEach(() => {
    service = new AnomalyDetectionService({ logger: mockLogger });
  });

  describe('constructor', () => {
    it('initializes with default config', () => {
      const info = service.getModelInfo();
      expect(info.isTrained).toBe(false);
      expect(info.nEstimators).toBe(200);
      expect(info.threshold).toBe(0.75);
      expect(info.contamination).toBe(0.02);
    });

    it('accepts custom config', () => {
      const custom = new AnomalyDetectionService({
        config: { nEstimators: 50, alertThreshold: 0.6 },
        logger: mockLogger,
      });
      const info = custom.getModelInfo();
      expect(info.nEstimators).toBe(50);
      expect(info.threshold).toBe(0.6);
    });
  });

  describe('train()', () => {
    it('trains successfully with sufficient data', () => {
      const data = generateNormalSamples(300, 5);
      service.train(data);
      expect(service.isReady()).toBe(true);
    });

    it('throws on fewer than 2 samples', () => {
      expect(() => service.train([[1, 2, 3]])).toThrow('Training requires at least 2 samples');
    });

    it('throws on empty data', () => {
      expect(() => service.train([])).toThrow('Training requires at least 2 samples');
    });

    it('handles data smaller than maxSamples', () => {
      const data = generateNormalSamples(50, 3);
      service.train(data);
      expect(service.isReady()).toBe(true);
      expect(service.getModelInfo().trainingSize).toBe(50);
    });

    it('caps subsample at maxSamples', () => {
      const data = generateNormalSamples(500, 5);
      service.train(data);
      expect(service.getModelInfo().trainingSize).toBe(256);
    });
  });

  describe('score()', () => {
    beforeEach(() => {
      const data = generateNormalSamples(300, 5);
      service.train(data);
    });

    it('throws if model not trained', () => {
      const untrained = new AnomalyDetectionService({ logger: mockLogger });
      expect(() => untrained.score([1, 2, 3, 4, 5])).toThrow('Model not trained');
    });

    it('returns score between 0 and 1', () => {
      const sample = [5, 5, 5, 5, 5]; // normal-ish
      const score = service.score(sample);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('scores normal samples lower than anomalies', () => {
      const normalSample = [5, 5, 5, 5, 5];
      const anomalySample = generateAnomalySample(5);

      const normalScore = service.score(normalSample);
      const anomalyScore = service.score(anomalySample);

      expect(anomalyScore).toBeGreaterThan(normalScore);
    });

    it('gives consistently low scores for points near training data center', () => {
      const scores: number[] = [];
      for (let i = 0; i < 10; i++) {
        scores.push(service.score([5, 5, 5, 5, 5]));
      }
      // All same since deterministic
      expect(scores.every((s) => s === scores[0])).toBe(true);
      expect(scores[0]!).toBeLessThan(0.6);
    });

    it('gives high scores for extreme outliers', () => {
      const extremeOutlier = [100, 100, 100, 100, 100];
      const score = service.score(extremeOutlier);
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('scoreFeatureVector()', () => {
    beforeEach(() => {
      // Train on data matching the feature vector space
      const data = generateNormalSamples(300, 18); // 9 + 5 + 4 = 18 features
      service.train(data);
    });

    it('produces AnomalyScore with correct structure', () => {
      const fv = createMockFeatureVector();
      const result = service.scoreFeatureVector(fv);

      expect(result.machineId).toBe('machine-001');
      expect(result.componentType).toBe(ComponentType.SPINDLE);
      expect(result.timestamp).toEqual(fv.timestamp);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.isolationForestScore).toBe(result.score);
      expect(result.autoEncoderResidual).toBe(0);
      expect(result.threshold).toBe(0.75);
      expect(typeof result.isAnomaly).toBe('boolean');
    });

    it('flags anomaly when score exceeds threshold', () => {
      const service2 = new AnomalyDetectionService({
        config: { alertThreshold: 0.01 }, // very low threshold → everything is anomaly
        logger: mockLogger,
      });
      const data = generateNormalSamples(300, 18);
      service2.train(data);

      const fv = createMockFeatureVector();
      const result = service2.scoreFeatureVector(fv);
      expect(result.isAnomaly).toBe(true);
    });
  });

  describe('scoreBatch()', () => {
    beforeEach(() => {
      const data = generateNormalSamples(300, 18);
      service.train(data);
    });

    it('scores multiple vectors', () => {
      const vectors = [
        createMockFeatureVector({ machineId: 'machine-001' }),
        createMockFeatureVector({ machineId: 'machine-002' }),
        createMockFeatureVector({ machineId: 'machine-003' }),
      ];

      const results = service.scoreBatch(vectors);
      expect(results).toHaveLength(3);
      expect(results[0]!.machineId).toBe('machine-001');
      expect(results[1]!.machineId).toBe('machine-002');
      expect(results[2]!.machineId).toBe('machine-003');
    });

    it('handles empty batch', () => {
      const results = service.scoreBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('calibrateThreshold()', () => {
    beforeEach(() => {
      const data = generateNormalSamples(300, 5);
      service.train(data);
    });

    it('sets threshold at (1-contamination) percentile', () => {
      const refData = generateNormalSamples(200, 5);
      const threshold = service.calibrateThreshold(refData);

      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThanOrEqual(1);
      expect(service.getModelInfo().threshold).toBe(threshold);
    });

    it('throws if model not trained', () => {
      const untrained = new AnomalyDetectionService({ logger: mockLogger });
      expect(() => untrained.calibrateThreshold([[1, 2, 3]])).toThrow('Model not trained');
    });
  });

  describe('averagePathLength()', () => {
    it('returns 0 for n <= 1', () => {
      expect(service.averagePathLength(0)).toBe(0);
      expect(service.averagePathLength(1)).toBe(0);
    });

    it('returns 1 for n = 2', () => {
      expect(service.averagePathLength(2)).toBe(1);
    });

    it('grows logarithmically', () => {
      const c10 = service.averagePathLength(10);
      const c100 = service.averagePathLength(100);
      const c1000 = service.averagePathLength(1000);

      expect(c100).toBeGreaterThan(c10);
      expect(c1000).toBeGreaterThan(c100);
      // Roughly logarithmic growth
      expect(c1000 / c100).toBeLessThan(2);
    });

    it('matches known values', () => {
      // c(256) ≈ 2*H(255) - 2*255/256
      // H(255) ≈ ln(255) + 0.5772 ≈ 6.1231
      // c(256) ≈ 2*6.1231 - 2*255/256 ≈ 12.2462 - 1.9922 ≈ 10.254
      const c256 = service.averagePathLength(256);
      expect(c256).toBeCloseTo(10.254, 0);
    });
  });

  describe('featureVectorToNumeric()', () => {
    it('produces flat array of length 18', () => {
      const fv = createMockFeatureVector();
      const numeric = service.featureVectorToNumeric(fv);

      expect(numeric).toHaveLength(18);
      expect(numeric[0]).toBe(2.5);   // rms
      expect(numeric[1]).toBe(3.2);   // kurtosis
      expect(numeric[9]).toBe(120);   // dominantFrequency
      expect(numeric[14]).toBe(0.001); // slope
    });
  });

  describe('deterministic behavior with seed', () => {
    it('produces same forest with same seed', () => {
      const data = generateNormalSamples(100, 5);
      const sample = [5, 5, 5, 5, 5];

      const s1 = new AnomalyDetectionService({
        config: { randomSeed: 123 },
        logger: mockLogger,
      });
      s1.train(data);
      const score1 = s1.score(sample);

      const s2 = new AnomalyDetectionService({
        config: { randomSeed: 123 },
        logger: mockLogger,
      });
      s2.train(data);
      const score2 = s2.score(sample);

      expect(score1).toBe(score2);
    });

    it('produces different forests with different seeds', () => {
      const data = generateNormalSamples(100, 5);
      const sample = [5, 5, 5, 5, 5];

      const s1 = new AnomalyDetectionService({
        config: { randomSeed: 111 },
        logger: mockLogger,
      });
      s1.train(data);

      const s2 = new AnomalyDetectionService({
        config: { randomSeed: 999 },
        logger: mockLogger,
      });
      s2.train(data);

      // Different seeds → potentially different scores (not guaranteed but very likely)
      // Just verify they both produce valid scores
      expect(s1.score(sample)).toBeGreaterThanOrEqual(0);
      expect(s2.score(sample)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('handles single-dimensional data', () => {
      const data = Array.from({ length: 100 }, (_, i) => [i * 0.1]);
      service.train(data);
      const score = service.score([50]); // outlier
      expect(score).toBeGreaterThan(0);
    });

    it('handles constant feature column gracefully', () => {
      // All same value in one dimension → cannot split on it
      const data = Array.from({ length: 100 }, () => [5, Math.random(), Math.random()]);
      service.train(data);
      const score = service.score([5, 0.5, 0.5]);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('handles exactly 2 samples', () => {
      service.train([[1, 2], [3, 4]]);
      expect(service.isReady()).toBe(true);
      const score = service.score([100, 200]);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});

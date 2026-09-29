/**
 * FeatureEngineeringService Unit Tests
 * Tests time-domain, frequency-domain, and trend computations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureEngineeringService } from '../../src/services/FeatureEngineeringService';
import { ComponentType } from '../../src/types/maintenance';

// Mock InfluxDB
vi.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: vi.fn(function MockInfluxDB() {
    return {
      getQueryApi: vi.fn(() => ({
        queryRows: vi.fn(),
      })),
    };
  }),
}));

// Mock pino
const mockLogger = {
  child: vi.fn().mockReturnThis(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

describe('FeatureEngineeringService', () => {
  let service: FeatureEngineeringService;

  beforeEach(() => {
    service = new FeatureEngineeringService({
      influxUrl: 'http://localhost:8086',
      influxToken: 'test-token',
      influxOrg: 'monolith',
      logger: mockLogger,
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TIME-DOMAIN
  // ═══════════════════════════════════════════════════════════════════

  describe('computeTimeDomain()', () => {
    it('should compute RMS correctly for simple signal', () => {
      const signal = [1, -1, 1, -1, 1, -1, 1, -1];
      const result = service.computeTimeDomain(signal);
      expect(result.rms).toBeCloseTo(1.0, 5);
    });

    it('should compute mean and standard deviation', () => {
      const signal = [2, 4, 6, 8, 10];
      const result = service.computeTimeDomain(signal);
      expect(result.mean).toBeCloseTo(6, 5);
      expect(result.standardDeviation).toBeGreaterThan(0);
    });

    it('should compute kurtosis = 0 for normal-like signal', () => {
      // A uniform distribution has kurtosis ~-1.2
      const signal = Array.from({ length: 64 }, (_, i) => i / 64);
      const result = service.computeTimeDomain(signal);
      expect(result.kurtosis).toBeLessThan(0); // Platykurtic
    });

    it('should compute positive kurtosis for heavy-tailed signal', () => {
      // Signal with extreme values
      const signal = [0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, -10];
      const result = service.computeTimeDomain(signal);
      expect(result.kurtosis).toBeGreaterThan(0); // Leptokurtic
    });

    it('should compute crest factor', () => {
      // Sine wave: crest factor = sqrt(2) ≈ 1.414
      const signal = Array.from({ length: 128 }, (_, i) => Math.sin(2 * Math.PI * i / 128));
      const result = service.computeTimeDomain(signal);
      expect(result.crestFactor).toBeCloseTo(Math.sqrt(2), 1);
    });

    it('should compute shape factor', () => {
      const signal = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = service.computeTimeDomain(signal);
      expect(result.shapeFactor).toBeGreaterThan(1); // RMS > mean(|x|) for asymmetric signals
    });

    it('should compute peak-to-peak', () => {
      const signal = [-5, 0, 3, 10, -2, 7];
      const result = service.computeTimeDomain(signal);
      expect(result.peakToPeak).toBe(15); // 10 - (-5)
      expect(result.peak).toBe(10);
    });

    it('should throw for signals < 4 samples', () => {
      expect(() => service.computeTimeDomain([1, 2, 3])).toThrow();
    });

    it('should handle zero-variance signal gracefully', () => {
      const signal = [5, 5, 5, 5, 5, 5, 5, 5];
      const result = service.computeTimeDomain(signal);
      expect(result.kurtosis).toBe(0);
      expect(result.skewness).toBe(0);
      expect(result.standardDeviation).toBe(0);
    });

    it('should compute skewness = 0 for symmetric signal', () => {
      const signal = [-3, -2, -1, 0, 1, 2, 3, 0];
      const result = service.computeTimeDomain(signal);
      expect(Math.abs(result.skewness)).toBeLessThan(0.5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FREQUENCY-DOMAIN
  // ═══════════════════════════════════════════════════════════════════

  describe('computeFrequencyDomain()', () => {
    it('should identify dominant frequency of a pure sine', () => {
      const sampleRate = 1000; // 1kHz
      const freq = 50; // 50Hz
      const signal = Array.from({ length: 256 }, (_, i) =>
        Math.sin(2 * Math.PI * freq * i / sampleRate)
      );
      const result = service.computeFrequencyDomain(signal, sampleRate);
      // Should detect ~50Hz as dominant
      expect(result.dominantFrequency).toBeCloseTo(50, -1);
    });

    it('should compute total energy > 0 for non-zero signal', () => {
      const signal = Array.from({ length: 64 }, (_, i) => Math.sin(2 * Math.PI * i / 16));
      const result = service.computeFrequencyDomain(signal, 1000);
      expect(result.totalEnergy).toBeGreaterThan(0);
    });

    it('should compute mean and RMS frequency', () => {
      const signal = Array.from({ length: 128 }, (_, i) =>
        Math.sin(2 * Math.PI * 100 * i / 1000) + 0.5 * Math.sin(2 * Math.PI * 200 * i / 1000)
      );
      const result = service.computeFrequencyDomain(signal, 1000);
      expect(result.meanFrequency).toBeGreaterThan(0);
      expect(result.rmsFrequency).toBeGreaterThan(0);
      expect(result.rmsFrequency).toBeGreaterThanOrEqual(result.meanFrequency);
    });

    it('should compute band energies when bearingBands provided', () => {
      const signal = Array.from({ length: 256 }, (_, i) => Math.sin(2 * Math.PI * 80 * i / 1000));
      const bands = [
        { label: 'BPFO_1X', centerFrequency: 80, bandwidth: 10, energy: 0, normalizedEnergy: 0 },
        { label: 'BPFI_1X', centerFrequency: 150, bandwidth: 10, energy: 0, normalizedEnergy: 0 },
      ];
      const result = service.computeFrequencyDomain(signal, 1000, bands);
      expect(result.bandEnergies.length).toBe(2);
      // BPFO band (80Hz) should have more energy than BPFI (150Hz)
      expect(result.bandEnergies[0]!.energy).toBeGreaterThan(result.bandEnergies[1]!.energy);
    });

    it('should throw for signals < 8 samples', () => {
      expect(() => service.computeFrequencyDomain([1, 2, 3, 4, 5, 6, 7], 1000)).toThrow();
    });

    it('should compute spectral kurtosis', () => {
      const signal = Array.from({ length: 128 }, () => Math.random() - 0.5);
      const result = service.computeFrequencyDomain(signal, 1000);
      expect(typeof result.spectralKurtosis).toBe('number');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // BEARING FREQUENCIES
  // ═══════════════════════════════════════════════════════════════════

  describe('computeBearingFrequencies()', () => {
    it('should compute correct bearing frequencies for known geometry', () => {
      // Typical 6205 bearing
      const params = {
        numBalls: 9,
        ballDiameter: 7.94,
        pitchDiameter: 38.5,
        contactAngle: 0,
      };
      const rpm = 1800;
      const result = service.computeBearingFrequencies(params, rpm);

      expect(result.bpfo).toBeGreaterThan(0);
      expect(result.bpfi).toBeGreaterThan(0);
      expect(result.bsf).toBeGreaterThan(0);
      expect(result.ftf).toBeGreaterThan(0);
      // BPFI > BPFO always
      expect(result.bpfi).toBeGreaterThan(result.bpfo);
      // FTF < shaft frequency
      expect(result.ftf).toBeLessThan(rpm / 60);
    });
  });

  describe('createBearingBands()', () => {
    it('should create 12 bands for 4 frequencies × 3 harmonics', () => {
      const freqs = { bpfo: 100, bpfi: 130, bsf: 60, ftf: 12 };
      const bands = service.createBearingBands(freqs, 3, 5);
      expect(bands.length).toBe(12);
      expect(bands[0]!.label).toBe('BPFO_1X');
      expect(bands[0]!.centerFrequency).toBe(100);
      expect(bands[1]!.label).toBe('BPFO_2X');
      expect(bands[1]!.centerFrequency).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TREND FEATURES
  // ═══════════════════════════════════════════════════════════════════

  describe('computeTrend()', () => {
    it('should detect positive slope in rising signal', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const timestamps = values.map((_, i) => i * 3600000); // 1hr intervals
      const result = service.computeTrend(values, timestamps);
      expect(result.slope).toBeCloseTo(1, 1); // 1 unit/hour
    });

    it('should detect negative slope in declining signal', () => {
      const values = [10, 9, 8, 7, 6, 5, 4, 3];
      const timestamps = values.map((_, i) => i * 3600000);
      const result = service.computeTrend(values, timestamps);
      expect(result.slope).toBeLessThan(0);
    });

    it('should compute EWMA', () => {
      const values = [1, 1, 1, 1, 10, 1, 1, 1]; // spike at index 4
      const timestamps = values.map((_, i) => i * 1000);
      const result = service.computeTrend(values, timestamps, 0.3);
      // EWMA should be between 1 and 10
      expect(result.ewma).toBeGreaterThan(1);
      expect(result.ewma).toBeLessThan(10);
    });

    it('should detect change point in sudden shift', () => {
      // Large step change with enough post-shift data to accumulate CUSUM
      const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
      const timestamps = values.map((_, i) => i * 3600000);
      const result = service.computeTrend(values, timestamps);
      expect(result.changePointDetected).toBe(true);
    });

    it('should not detect change point in stable signal', () => {
      const values = [5, 5.1, 4.9, 5, 5.05, 4.95, 5, 5.1, 4.9, 5];
      const timestamps = values.map((_, i) => i * 3600000);
      const result = service.computeTrend(values, timestamps);
      expect(result.changePointDetected).toBe(false);
    });

    it('should throw for < 3 values', () => {
      expect(() => service.computeTrend([1, 2], [0, 1000])).toThrow();
    });

    it('should compute acceleration', () => {
      // Quadratic growth: acceleration should be positive
      const values = [0, 1, 4, 9, 16, 25, 36, 49];
      const timestamps = values.map((_, i) => i * 3600000);
      const result = service.computeTrend(values, timestamps);
      expect(result.acceleration).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // COMPOSITE FEATURE VECTOR
  // ═══════════════════════════════════════════════════════════════════

  describe('computeFeatureVector()', () => {
    it('should produce a complete feature vector', () => {
      const signal = Array.from({ length: 256 }, (_, i) =>
        Math.sin(2 * Math.PI * 50 * i / 1000) + 0.1 * Math.random()
      );
      const timestamps = signal.map((_, i) => Date.now() + i);

      const result = service.computeFeatureVector({
        machineId: 'biesse-rover-001',
        componentType: ComponentType.SPINDLE,
        signal,
        timestamps,
        sampleRateHz: 1000,
      });

      expect(result.machineId).toBe('biesse-rover-001');
      expect(result.componentType).toBe(ComponentType.SPINDLE);
      expect(result.sampleCount).toBe(256);
      expect(result.timeDomain.rms).toBeGreaterThan(0);
      expect(result.frequencyDomain.dominantFrequency).toBeGreaterThan(0);
      expect(typeof result.trend.slope).toBe('number');
    });

    it('should include bearing bands when params provided', () => {
      const signal = Array.from({ length: 256 }, (_, i) =>
        Math.sin(2 * Math.PI * 100 * i / 1000)
      );
      const timestamps = signal.map((_, i) => Date.now() + i);

      const result = service.computeFeatureVector({
        machineId: 'biesse-rover-001',
        componentType: ComponentType.SPINDLE,
        signal,
        timestamps,
        sampleRateHz: 1000,
        bearingParams: { numBalls: 9, ballDiameter: 7.94, pitchDiameter: 38.5, contactAngle: 0 },
        shaftRpm: 3000,
      });

      expect(result.frequencyDomain.bandEnergies.length).toBe(12);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FLUX QUERY BUILDERS
  // ═══════════════════════════════════════════════════════════════════

  describe('buildRmsFluxQuery()', () => {
    it('should return a valid Flux query string', () => {
      const query = service.buildRmsFluxQuery({
        bucket: 'telemetry',
        machineId: 'biesse-001',
        measurement: 'vibration',
        field: 'acceleration_rms',
        windowSize: '1h',
      }, '5m');

      expect(query).toContain('from(bucket: "telemetry")');
      expect(query).toContain('machine_id');
      expect(query).toContain('math.sqrt');
      expect(query).toContain('window(every: 5m)');
    });
  });

  describe('buildKurtosisFluxQuery()', () => {
    it('should return a Flux query with reduce for 4th moment', () => {
      const query = service.buildKurtosisFluxQuery({
        bucket: 'telemetry',
        machineId: 'homag-001',
        measurement: 'vibration',
        field: 'acceleration',
        windowSize: '30m',
      }, '2m');

      expect(query).toContain('reduce');
      expect(query).toContain('sum4');
      expect(query).toContain('variance');
    });
  });
});

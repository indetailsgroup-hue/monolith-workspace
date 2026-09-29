/**
 * FeatureEngineeringService
 * Phase 3 — Predictive Maintenance
 *
 * Computes time-domain, frequency-domain, and trend features from
 * raw vibration/current/temperature telemetry stored in InfluxDB.
 */

import { fft } from 'fft-js';
import * as ss from 'simple-statistics';
import { InfluxDB } from '@influxdata/influxdb-client';
import { Logger } from 'pino';

import {
  TimeDomainFeatures,
  FrequencyDomainFeatures,
  TrendFeatures,
  FeatureVector,
  BandEnergy,
  BearingParameters,
  BearingFrequencies,
  ComponentType,
  FeatureQueryConfig,
  TrainingBatchRequest,
  TrainingBatchResult,
} from '../types/maintenance';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Pad signal to next power of 2 for FFT */
function padToPowerOf2(signal: number[]): number[] {
  const n = signal.length;
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  if (nextPow2 === n) return signal;
  return [...signal, ...new Array<number>(nextPow2 - n).fill(0)];
}

/** Compute magnitude spectrum from FFT phasors */
function magnitudeSpectrum(phasors: [number, number][]): number[] {
  return phasors.map(([re, im]) => Math.sqrt(re * re + im * im));
}

// ─── Service ─────────────────────────────────────────────────────────

export class FeatureEngineeringService {
  private influxClient: InfluxDB;
  private org: string;
  private logger: Logger;

  constructor(deps: {
    influxUrl: string;
    influxToken: string;
    influxOrg: string;
    logger: Logger;
  }) {
    this.influxClient = new InfluxDB({
      url: deps.influxUrl,
      token: deps.influxToken,
    });
    this.org = deps.influxOrg;
    this.logger = deps.logger.child({ service: 'FeatureEngineering' });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIME-DOMAIN FEATURES
  // ═══════════════════════════════════════════════════════════════════

  computeTimeDomain(signal: number[]): TimeDomainFeatures {
    if (signal.length < 4) {
      throw new Error('Signal must have at least 4 samples for time-domain analysis');
    }

    const mean = ss.mean(signal);
    const stdDev = ss.standardDeviation(signal);
    const rms = Math.sqrt(ss.mean(signal.map((x) => x * x)));
    const peak = Math.max(...signal.map(Math.abs));
    const peakToPeak = Math.max(...signal) - Math.min(...signal);

    // Kurtosis (excess kurtosis, Fisher's definition)
    const kurtosis = this.computeKurtosis(signal, mean, stdDev);

    // Skewness
    const skewness = this.computeSkewness(signal, mean, stdDev);

    // Crest Factor = peak / RMS
    const crestFactor = rms > 0 ? peak / rms : 0;

    // Shape Factor = RMS / mean(|x|)
    const meanAbs = ss.mean(signal.map(Math.abs));
    const shapeFactor = meanAbs > 0 ? rms / meanAbs : 0;

    return {
      rms,
      kurtosis,
      crestFactor,
      skewness,
      shapeFactor,
      peak,
      peakToPeak,
      mean,
      standardDeviation: stdDev,
    };
  }

  private computeKurtosis(signal: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    const n = signal.length;
    const m4 = signal.reduce((sum, x) => sum + Math.pow(x - mean, 4), 0) / n;
    return m4 / Math.pow(stdDev, 4) - 3; // excess kurtosis
  }

  private computeSkewness(signal: number[], mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    const n = signal.length;
    const m3 = signal.reduce((sum, x) => sum + Math.pow(x - mean, 3), 0) / n;
    return m3 / Math.pow(stdDev, 3);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FREQUENCY-DOMAIN FEATURES
  // ═══════════════════════════════════════════════════════════════════

  computeFrequencyDomain(
    signal: number[],
    sampleRateHz: number,
    bearingBands?: BandEnergy[]
  ): FrequencyDomainFeatures {
    if (signal.length < 8) {
      throw new Error('Signal must have at least 8 samples for frequency analysis');
    }

    // Pad and compute FFT
    const padded = padToPowerOf2(signal);
    const phasors = fft(padded);
    const magnitudes = magnitudeSpectrum(phasors);

    // Only use positive frequencies (first half)
    const N = magnitudes.length;
    const halfN = Math.floor(N / 2);
    const positiveFreqMags = magnitudes.slice(0, halfN);
    const freqResolution = sampleRateHz / N;

    // Dominant frequency
    let maxIdx = 0;
    let maxAmp = 0;
    for (let i = 1; i < positiveFreqMags.length; i++) {
      if (positiveFreqMags[i]! > maxAmp) {
        maxAmp = positiveFreqMags[i]!;
        maxIdx = i;
      }
    }
    const dominantFrequency = maxIdx * freqResolution;
    const dominantAmplitude = maxAmp / halfN; // normalized

    // Total energy (Parseval's theorem)
    const totalEnergy = positiveFreqMags.reduce((s, m) => s + m * m, 0);

    // Mean frequency & RMS frequency
    let weightedFreqSum = 0;
    let weightedFreqSqSum = 0;
    let powerSum = 0;
    for (let i = 0; i < positiveFreqMags.length; i++) {
      const freq = i * freqResolution;
      const power = positiveFreqMags[i]! * positiveFreqMags[i]!;
      weightedFreqSum += freq * power;
      weightedFreqSqSum += freq * freq * power;
      powerSum += power;
    }
    const meanFrequency = powerSum > 0 ? weightedFreqSum / powerSum : 0;
    const rmsFrequency = powerSum > 0 ? Math.sqrt(weightedFreqSqSum / powerSum) : 0;

    // Spectral kurtosis
    const spectralKurtosis = this.computeSpectralKurtosis(positiveFreqMags);

    // Band energies
    const bandEnergies: BandEnergy[] = bearingBands
      ? this.computeBandEnergies(positiveFreqMags, freqResolution, bearingBands, totalEnergy)
      : [];

    return {
      dominantFrequency,
      dominantAmplitude,
      spectralKurtosis,
      bandEnergies,
      totalEnergy,
      meanFrequency,
      rmsFrequency,
    };
  }

  private computeSpectralKurtosis(magnitudes: number[]): number {
    const mean = ss.mean(magnitudes);
    const stdDev = ss.standardDeviation(magnitudes);
    if (stdDev === 0) return 0;
    const n = magnitudes.length;
    const m4 = magnitudes.reduce((sum, x) => sum + Math.pow(x - mean, 4), 0) / n;
    return m4 / Math.pow(stdDev, 4) - 3;
  }

  private computeBandEnergies(
    magnitudes: number[],
    freqResolution: number,
    bands: BandEnergy[],
    totalEnergy: number
  ): BandEnergy[] {
    return bands.map((band) => {
      const lowBin = Math.max(0, Math.floor((band.centerFrequency - band.bandwidth / 2) / freqResolution));
      const highBin = Math.min(
        magnitudes.length - 1,
        Math.ceil((band.centerFrequency + band.bandwidth / 2) / freqResolution)
      );
      let energy = 0;
      for (let i = lowBin; i <= highBin; i++) {
        energy += magnitudes[i]! * magnitudes[i]!;
      }
      return {
        ...band,
        energy,
        normalizedEnergy: totalEnergy > 0 ? energy / totalEnergy : 0,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // BEARING FREQUENCY CALCULATION
  // ═══════════════════════════════════════════════════════════════════

  computeBearingFrequencies(params: BearingParameters, shaftRpm: number): BearingFrequencies {
    const { numBalls, ballDiameter, pitchDiameter, contactAngle } = params;
    const cosAngle = Math.cos((contactAngle * Math.PI) / 180);
    const ratio = ballDiameter / pitchDiameter;
    const shaftHz = shaftRpm / 60;

    return {
      bpfo: (numBalls / 2) * shaftHz * (1 - ratio * cosAngle),
      bpfi: (numBalls / 2) * shaftHz * (1 + ratio * cosAngle),
      bsf: (pitchDiameter / (2 * ballDiameter)) * shaftHz * (1 - Math.pow(ratio * cosAngle, 2)),
      ftf: (shaftHz / 2) * (1 - ratio * cosAngle),
    };
  }

  /** Generate band definitions for bearing fault frequencies */
  createBearingBands(
    bearingFreqs: BearingFrequencies,
    harmonics: number = 3,
    bandwidthHz: number = 5
  ): BandEnergy[] {
    const bands: BandEnergy[] = [];
    const entries: [string, number][] = [
      ['BPFO', bearingFreqs.bpfo],
      ['BPFI', bearingFreqs.bpfi],
      ['BSF', bearingFreqs.bsf],
      ['FTF', bearingFreqs.ftf],
    ];

    for (const [label, baseFreq] of entries) {
      for (let h = 1; h <= harmonics; h++) {
        bands.push({
          label: `${label}_${h}X`,
          centerFrequency: baseFreq * h,
          bandwidth: bandwidthHz,
          energy: 0,
          normalizedEnergy: 0,
        });
      }
    }
    return bands;
  }

  // ═══════════════════════════════════════════════════════════════════
  // TREND FEATURES
  // ═══════════════════════════════════════════════════════════════════

  computeTrend(values: number[], timestamps: number[], alpha: number = 0.3): TrendFeatures {
    if (values.length < 3) {
      throw new Error('At least 3 data points required for trend computation');
    }

    // Linear regression for slope
    const n = values.length;
    const xNorm = timestamps.map((t) => (t - timestamps[0]!) / 3600000); // hours
    const pairs: [number, number][] = xNorm.map((x, i) => [x, values[i]!]);
    const regression = ss.linearRegression(pairs);
    const slope = regression.m;

    // Second derivative (acceleration) via finite difference of slopes
    const slopes: number[] = [];
    for (let i = 1; i < n; i++) {
      const dt = (timestamps[i]! - timestamps[i - 1]!) / 3600000;
      if (dt > 0) {
        slopes.push((values[i]! - values[i - 1]!) / dt);
      }
    }
    const acceleration =
      slopes.length >= 2
        ? (slopes[slopes.length - 1]! - slopes[0]!) / (slopes.length - 1)
        : 0;

    // EWMA
    let ewma = values[0]!;
    for (let i = 1; i < n; i++) {
      ewma = alpha * values[i]! + (1 - alpha) * ewma;
    }
    const ewmaDeviation = Math.abs(values[n - 1]! - ewma);

    // Change point detection (CUSUM-like)
    const mean = ss.mean(values);
    const std = ss.standardDeviation(values);
    let cusum = 0;
    let changePointDetected = false;
    const threshold = 4 * std;
    for (let i = 0; i < n; i++) {
      cusum = Math.max(0, cusum + (values[i]! - mean) - std / 2);
      if (cusum > threshold) {
        changePointDetected = true;
        break;
      }
    }

    return { slope, acceleration, ewma, ewmaDeviation, changePointDetected };
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPOSITE FEATURE VECTOR
  // ═══════════════════════════════════════════════════════════════════

  computeFeatureVector(params: {
    machineId: string;
    componentType: ComponentType;
    signal: number[];
    timestamps: number[];
    sampleRateHz: number;
    bearingParams?: BearingParameters;
    shaftRpm?: number;
  }): FeatureVector {
    const { machineId, componentType, signal, timestamps, sampleRateHz, bearingParams, shaftRpm } = params;

    // Time-domain
    const timeDomain = this.computeTimeDomain(signal);

    // Frequency-domain with optional bearing bands
    let bearingBands: BandEnergy[] | undefined;
    if (bearingParams && shaftRpm) {
      const freqs = this.computeBearingFrequencies(bearingParams, shaftRpm);
      bearingBands = this.createBearingBands(freqs);
    }
    const frequencyDomain = this.computeFrequencyDomain(signal, sampleRateHz, bearingBands);

    // Trend features (use RMS of windowed sub-segments if signal is long enough)
    const trendValues = signal.length > 10 ? this.extractTrendValues(signal, 10) : signal;
    const trendTimestamps =
      timestamps.length > 10 ? this.extractTrendTimestamps(timestamps, 10) : timestamps;
    const trend = this.computeTrend(trendValues, trendTimestamps);

    return {
      machineId,
      componentType,
      timestamp: new Date(timestamps[timestamps.length - 1]!),
      timeDomain,
      frequencyDomain,
      trend,
      windowSizeMs: timestamps[timestamps.length - 1]! - timestamps[0]!,
      sampleCount: signal.length,
    };
  }

  private extractTrendValues(signal: number[], segments: number): number[] {
    const segSize = Math.floor(signal.length / segments);
    const values: number[] = [];
    for (let i = 0; i < segments; i++) {
      const seg = signal.slice(i * segSize, (i + 1) * segSize);
      values.push(Math.sqrt(ss.mean(seg.map((x) => x * x)))); // RMS per segment
    }
    return values;
  }

  private extractTrendTimestamps(timestamps: number[], segments: number): number[] {
    const segSize = Math.floor(timestamps.length / segments);
    const ts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const idx = (i + 1) * segSize - 1;
      ts.push(timestamps[idx] ?? timestamps[timestamps.length - 1]!);
    }
    return ts;
  }

  // ═══════════════════════════════════════════════════════════════════
  // INFLUXDB QUERIES
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Fetch raw vibration signal from InfluxDB for a single window
   */
  async querySignalWindow(config: FeatureQueryConfig): Promise<{ values: number[]; timestamps: number[] }> {
    const query = `
      from(bucket: "${config.bucket}")
        |> range(start: -${config.windowSize})
        |> filter(fn: (r) => r["_measurement"] == "${config.measurement}")
        |> filter(fn: (r) => r["machine_id"] == "${config.machineId}")
        |> filter(fn: (r) => r["_field"] == "${config.field}")
        ${config.aggregateWindow ? `|> aggregateWindow(every: ${config.aggregateWindow}, fn: mean, createEmpty: false)` : ''}
        |> sort(columns: ["_time"])
    `;

    const queryApi = this.influxClient.getQueryApi(this.org);
    const values: number[] = [];
    const timestamps: number[] = [];

    return new Promise((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: { toObject(row: string[]): Record<string, unknown> }) {
          const obj = tableMeta.toObject(row);
          values.push(Number(obj._value));
          timestamps.push(new Date(obj._time as string).getTime());
        },
        error(err: Error) {
          reject(err);
        },
        complete() {
          resolve({ values, timestamps });
        },
      });
    });
  }

  /**
   * Flux query: compute RMS of vibration in sliding windows (server-side)
   */
  buildRmsFluxQuery(config: FeatureQueryConfig, windowEvery: string): string {
    return `
      import "math"

      from(bucket: "${config.bucket}")
        |> range(start: -${config.windowSize})
        |> filter(fn: (r) => r["_measurement"] == "${config.measurement}")
        |> filter(fn: (r) => r["machine_id"] == "${config.machineId}")
        |> filter(fn: (r) => r["_field"] == "${config.field}")
        |> window(every: ${windowEvery})
        |> map(fn: (r) => ({ r with _value_sq: r._value * r._value }))
        |> mean(column: "_value_sq")
        |> map(fn: (r) => ({ r with _value: math.sqrt(x: r._value_sq) }))
        |> group(columns: ["_measurement", "machine_id"])
    `;
  }

  /**
   * Flux query: kurtosis computation via 4th central moment
   */
  buildKurtosisFluxQuery(config: FeatureQueryConfig, windowEvery: string): string {
    return `
      import "math"

      data = from(bucket: "${config.bucket}")
        |> range(start: -${config.windowSize})
        |> filter(fn: (r) => r["_measurement"] == "${config.measurement}")
        |> filter(fn: (r) => r["machine_id"] == "${config.machineId}")
        |> filter(fn: (r) => r["_field"] == "${config.field}")

      stats = data
        |> window(every: ${windowEvery})
        |> reduce(fn: (r, accumulator) => ({
            count: accumulator.count + 1.0,
            sum: accumulator.sum + r._value,
            sum2: accumulator.sum2 + r._value * r._value,
            sum4: accumulator.sum4 + r._value * r._value * r._value * r._value
          }),
          identity: { count: 0.0, sum: 0.0, sum2: 0.0, sum4: 0.0 }
        )
        |> map(fn: (r) => {
            mean = r.sum / r.count
            variance = r.sum2 / r.count - mean * mean
            m4 = r.sum4 / r.count - 4.0 * mean * (r.sum2 * r.sum / (r.count * r.count))
                  + 6.0 * mean * mean * (r.sum2 / r.count) - 3.0 * mean * mean * mean * mean
            return { r with _value: if variance > 0.0 then m4 / (variance * variance) - 3.0 else 0.0 }
        })
        |> group(columns: ["_measurement", "machine_id"])

      stats
    `;
  }

  /**
   * Compute a full training batch: sliding-window feature vectors over a time range
   */
  async computeTrainingBatch(request: TrainingBatchRequest): Promise<TrainingBatchResult> {
    const { machineId, componentType, startTime, endTime, windowSizeMs, stepSizeMs } = request;

    this.logger.info({
      machineId,
      componentType,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      windowSizeMs,
      stepSizeMs,
    }, 'Computing training batch');

    // Query entire range
    const queryApi = this.influxClient.getQueryApi(this.org);
    const query = `
      from(bucket: "telemetry")
        |> range(start: ${startTime.toISOString()}, stop: ${endTime.toISOString()})
        |> filter(fn: (r) => r["_measurement"] == "vibration")
        |> filter(fn: (r) => r["machine_id"] == "${machineId}")
        |> filter(fn: (r) => r["_field"] == "acceleration_rms")
        |> sort(columns: ["_time"])
    `;

    const allValues: number[] = [];
    const allTimestamps: number[] = [];

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row: string[], tableMeta: { toObject(row: string[]): Record<string, unknown> }) {
          const obj = tableMeta.toObject(row);
          allValues.push(Number(obj._value));
          allTimestamps.push(new Date(obj._time as string).getTime());
        },
        error: (err: Error) => reject(err),
        complete: () => resolve(),
      });
    });

    if (allValues.length < 8) {
      this.logger.warn({ machineId, sampleCount: allValues.length }, 'Insufficient data for training batch');
      return {
        features: [],
        sampleCount: allValues.length,
        startTime,
        endTime,
        gaps: [],
      };
    }

    // Detect gaps (> 2× expected interval)
    const gaps: Array<{ start: Date; end: Date }> = [];
    if (allTimestamps.length > 1) {
      const intervals = allTimestamps.slice(1).map((t, i) => t - allTimestamps[i]!);
      const medianInterval = ss.median(intervals);
      for (let i = 1; i < allTimestamps.length; i++) {
        const dt = allTimestamps[i]! - allTimestamps[i - 1]!;
        if (dt > medianInterval * 2) {
          gaps.push({ start: new Date(allTimestamps[i - 1]!), end: new Date(allTimestamps[i]!) });
        }
      }
    }

    // Compute sample rate
    const avgInterval =
      (allTimestamps[allTimestamps.length - 1]! - allTimestamps[0]!) / (allTimestamps.length - 1);
    const sampleRateHz = 1000 / avgInterval;

    // Sliding window
    const features: FeatureVector[] = [];
    let windowStart = allTimestamps[0]!;
    const lastTs = allTimestamps[allTimestamps.length - 1]!;

    while (windowStart + windowSizeMs <= lastTs) {
      const windowEnd = windowStart + windowSizeMs;

      // Extract window samples
      const startIdx = allTimestamps.findIndex((t) => t >= windowStart);
      const endIdx = allTimestamps.findIndex((t) => t > windowEnd);
      const windowValues = allValues.slice(startIdx, endIdx === -1 ? undefined : endIdx);
      const windowTimestamps = allTimestamps.slice(startIdx, endIdx === -1 ? undefined : endIdx);

      if (windowValues.length >= 8) {
        const fv = this.computeFeatureVector({
          machineId,
          componentType,
          signal: windowValues,
          timestamps: windowTimestamps,
          sampleRateHz,
        });
        features.push(fv);
      }

      windowStart += stepSizeMs;
    }

    this.logger.info({
      machineId,
      featureCount: features.length,
      totalSamples: allValues.length,
      gapCount: gaps.length,
    }, 'Training batch complete');

    return { features, sampleCount: allValues.length, startTime, endTime, gaps };
  }
}

/**
 * Phase 3 — Predictive Maintenance Types
 * MONOLITH Digital Shadow Service
 */

// ─── Component Health ────────────────────────────────────────────────

export enum ComponentType {
  SPINDLE = 'SPINDLE',
  TOOL_HOLDER = 'TOOL_HOLDER',
  LINEAR_GUIDE_X = 'LINEAR_GUIDE_X',
  LINEAR_GUIDE_Y = 'LINEAR_GUIDE_Y',
  LINEAR_GUIDE_Z = 'LINEAR_GUIDE_Z',
  BALL_SCREW_X = 'BALL_SCREW_X',
  BALL_SCREW_Y = 'BALL_SCREW_Y',
  BALL_SCREW_Z = 'BALL_SCREW_Z',
  VACUUM_PUMP = 'VACUUM_PUMP',
  DUST_COLLECTOR = 'DUST_COLLECTOR',
  COOLANT_SYSTEM = 'COOLANT_SYSTEM',
  ATC_MAGAZINE = 'ATC_MAGAZINE',
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADING = 'DEGRADING',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  FAILED = 'FAILED',
}

export interface ComponentHealth {
  machineId: string;
  componentType: ComponentType;
  healthScore: number;        // 0.0 – 1.0
  status: HealthStatus;
  remainingUsefulLife: number; // hours
  confidence: number;         // 0.0 – 1.0
  lastUpdated: Date;
  contributingFactors: ContributingFactor[];
}

export interface ContributingFactor {
  feature: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high';
}

// ─── Feature Cache / Degradation Indicators ─────────────────────────

export interface DegradationIndicator {
  /** Short identifier, e.g. 'rms_vibration', 'kurtosis', 'trend_slope' */
  name: string;
  /** Raw sensor / feature value */
  currentValue: number;
  /** Value at which a WARNING should be raised */
  warningThreshold: number;
  /** Value at which FAILURE is considered imminent */
  failureThreshold: number;
  /**
   * Normalised deviation in [0, 1].
   * 0 = baseline (healthy), 1 = failure threshold reached.
   */
  normalizedDeviation: number;
}

// ─── Feature Engineering ─────────────────────────────────────────────

export interface TimeDomainFeatures {
  rms: number;
  kurtosis: number;
  crestFactor: number;
  skewness: number;
  shapeFactor: number;
  peak: number;
  peakToPeak: number;
  mean: number;
  standardDeviation: number;
}

export interface FrequencyDomainFeatures {
  dominantFrequency: number;
  dominantAmplitude: number;
  spectralKurtosis: number;
  bandEnergies: BandEnergy[];
  totalEnergy: number;
  meanFrequency: number;
  rmsFrequency: number;
}

export interface BandEnergy {
  label: string;          // e.g. "BPFO", "BPFI", "BSF", "FTF", "1X", "2X"
  centerFrequency: number;
  bandwidth: number;
  energy: number;
  normalizedEnergy: number;
}

export interface TrendFeatures {
  slope: number;            // linear trend (units/hour)
  acceleration: number;     // second derivative
  ewma: number;             // exponentially weighted moving average
  ewmaDeviation: number;    // deviation from EWMA
  changePointDetected: boolean;
}

export interface FeatureVector {
  machineId: string;
  componentType: ComponentType;
  timestamp: Date;
  timeDomain: TimeDomainFeatures;
  frequencyDomain: FrequencyDomainFeatures;
  trend: TrendFeatures;
  windowSizeMs: number;
  sampleCount: number;
}

// ─── Bearing Frequency Parameters ────────────────────────────────────

export interface BearingParameters {
  /** Number of rolling elements */
  numBalls: number;
  /** Ball diameter (mm) */
  ballDiameter: number;
  /** Pitch diameter (mm) */
  pitchDiameter: number;
  /** Contact angle (degrees) */
  contactAngle: number;
}

export interface BearingFrequencies {
  /** Ball Pass Frequency Outer race */
  bpfo: number;
  /** Ball Pass Frequency Inner race */
  bpfi: number;
  /** Ball Spin Frequency */
  bsf: number;
  /** Fundamental Train Frequency */
  ftf: number;
}

// ─── Anomaly Detection ───────────────────────────────────────────────

export interface AnomalyScore {
  machineId: string;
  componentType: ComponentType;
  timestamp: Date;
  score: number;            // 0.0 (normal) – 1.0 (anomalous)
  isolationForestScore: number;
  autoEncoderResidual: number;
  threshold: number;
  isAnomaly: boolean;
}

// ─── Maintenance Scheduling ──────────────────────────────────────────

export enum MaintenanceUrgency {
  ROUTINE = 'ROUTINE',
  PLANNED = 'PLANNED',
  SOON = 'SOON',
  URGENT = 'URGENT',
  IMMEDIATE = 'IMMEDIATE',
}

export interface MaintenanceRecommendation {
  id: string;
  machineId: string;
  componentType: ComponentType;
  urgency: MaintenanceUrgency;
  action: string;
  estimatedDowntimeMinutes: number;
  scheduledDate?: Date;
  healthScore: number;
  remainingUsefulLife: number;
  confidence: number;
  createdAt: Date;
}

// ─── InfluxDB Query Config ───────────────────────────────────────────

export interface FeatureQueryConfig {
  bucket: string;
  machineId: string;
  measurement: string;
  field: string;
  windowSize: string;       // e.g. "5m", "1h"
  aggregateWindow?: string; // e.g. "1s", "100ms"
}

// ─── Training Data ───────────────────────────────────────────────────

export interface TrainingBatchRequest {
  machineId: string;
  componentType: ComponentType;
  startTime: Date;
  endTime: Date;
  windowSizeMs: number;
  stepSizeMs: number;       // sliding window step
}

export interface TrainingBatchResult {
  features: FeatureVector[];
  sampleCount: number;
  startTime: Date;
  endTime: Date;
  gaps: Array<{ start: Date; end: Date }>;
}

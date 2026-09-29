# Phase 3: Predictive Maintenance Module — Technical Design

## MONOLITH Digital Shadow Service — Predictive Maintenance Extension

| Field | Value |
|-------|-------|
| **Module** | `PredictiveMaintenanceService` |
| **Status** | Design Complete (Pending Phase 1-2 stabilization) |
| **Depends On** | Phase 1 Digital Shadow (InfluxDB telemetry), Phase 2 Command Layer |
| **Target** | Biesse Rover B / Homag Centateq P / KDT KN Series |
| **Stack** | TypeScript, InfluxDB, TensorFlow.js (ONNX Runtime), Redis Streams |

---

## 1. Executive Summary

Phase 3 introduces a **Predictive Maintenance (PdM)** module that analyzes time-series telemetry data from InfluxDB to forecast CNC component failures before they occur. The module targets three primary failure modes in furniture production CNC machines:

1. **Spindle bearing degradation** — vibration signature analysis
2. **Tool wear progression** — cutting force & surface quality correlation
3. **Thermal drift** — spindle/axis thermal expansion compensation failure

The system provides:
- **Remaining Useful Life (RUL)** estimation per component
- **Anomaly detection** for early-warning alerts
- **Maintenance scheduling integration** with MONOLITH Factory Server
- **Cost-optimized maintenance windows** aligned with production schedule

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        MONOLITH Factory Server                            │
│   ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│   │  Job Scheduler   │  │ Activity Log │  │  Maintenance Calendar  │    │
│   └────────┬────────┘  └──────┬───────┘  └───────────┬────────────┘    │
│            │                  │                       │                   │
└────────────┼──────────────────┼───────────────────────┼──────────────────┘
             │                  │                       │
             ▼                  ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Digital Shadow Service — Phase 3                       │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   PredictiveMaintenanceService                      │  │
│  │                                                                     │  │
│  │  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │  │
│  │  │ Feature Engine │  │  Model Inference  │  │  Alert Manager   │  │  │
│  │  │                │  │                   │  │                  │  │  │
│  │  │ • FFT/Wavelet  │  │  • LSTM (RUL)    │  │  • Threshold     │  │  │
│  │  │ • RMS/Kurtosis │  │  • Isolation     │  │  • Notification  │  │  │
│  │  │ • Trend Stats  │  │    Forest        │  │  • Escalation    │  │  │
│  │  │ • Rolling Agg  │  │  • XGBoost       │  │  • Auto-Schedule │  │  │
│  │  └───────┬────────┘  └────────┬─────────┘  └────────┬─────────┘  │  │
│  │          │                    │                      │             │  │
│  │          ▼                    ▼                      ▼             │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │             Health Score Calculator (per component)           │ │  │
│  │  │  ═══════════════════════════════════════════════════════════  │ │  │
│  │  │  Spindle: 87% ████████░░  Tool T01: 42% ████░░░░░░         │ │  │
│  │  │  X-Axis: 95% █████████░  Vacuum: 91% █████████░            │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Phase 1:       │  │  Phase 2:       │  │  InfluxDB (Telemetry)   │ │
│  │  State Shadow   │  │  Command Layer  │  │  • vibration_rms        │ │
│  │  (adapters)     │  │  (startJob...)  │  │  • spindle_temp         │ │
│  └─────────────────┘  └─────────────────┘  │  • cutting_force        │ │
│                                              │  • axis_position_error  │ │
│                                              │  • tool_wear_index      │ │
│                                              └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Failure Modes & Sensor Mapping

### 3.1 Spindle Bearing Degradation

| Parameter | Source | InfluxDB Measurement | Sample Rate |
|-----------|--------|---------------------|-------------|
| Vibration RMS (X/Y/Z) | Accelerometer (MEMS) | `vibration_rms` | 1 kHz → 1s aggregates |
| Vibration Kurtosis | Derived | `vibration_kurtosis` | 10s window |
| Spindle Temperature | RTD sensor | `spindle_temp_c` | 1s |
| Spindle Current | Motor drive | `spindle_current_a` | 100ms |
| Spindle RPM | Encoder | `spindle_rpm` | 100ms |
| Bearing Frequency Bands | FFT (BPFO/BPFI/BSF/FTF) | `bearing_fft_bands` | 10s window |

**Failure Timeline:**
```
Normal → Micro-pitting (6-12 months) → Spalling (2-4 weeks) → Catastrophic (hours)
         ├─ Kurtosis ↑              ├─ RMS ↑↑ + Temp ↑    ├─ RPM fluctuation
         ├─ FFT band shift          ├─ Current spike       └─ Audible noise
         └─ RUL: 90+ days           └─ RUL: 7-30 days
```

### 3.2 Tool Wear Progression

| Parameter | Source | InfluxDB Measurement | Sample Rate |
|-----------|--------|---------------------|-------------|
| Cutting Force (Fx/Fy/Fz) | Dynamometer / Current | `cutting_force_n` | 100ms |
| Surface Roughness Proxy | Vibration during cut | `surface_quality_idx` | Per cut |
| Tool Runtime | Accumulated | `tool_runtime_min` | Per job |
| Chip Load | Derived (feed/teeth) | `chip_load_mm` | 100ms |
| Material Hardness | Job metadata | `material_hardness` | Per job |

**Wear Stages (ISO 3685):**
```
VB (flank wear):  0.0mm → 0.1mm (initial) → 0.2mm (steady) → 0.3mm (rapid) → REPLACE
                   ├─ Normal cutting      ├─ Force ↑10-15%    ├─ Force ↑↑ 30%+
                   └─ RUL: full life      └─ RUL: 20-40%      └─ RUL: 0-10%
```

### 3.3 Thermal Drift / Axis Error

| Parameter | Source | InfluxDB Measurement | Sample Rate |
|-----------|--------|---------------------|-------------|
| Axis Position Error | Linear encoder | `axis_position_error_um` | 1s |
| Axis Temperature | RTD (ballscrew/guide) | `axis_temp_c` | 5s |
| Ambient Temperature | Room sensor | `ambient_temp_c` | 30s |
| Thermal Gradient | Derived | `thermal_gradient_k_min` | 1 min |
| Compensation Status | CNC controller | `thermal_comp_active` | Event |

---

## 4. Type Definitions

```typescript
// src/types/maintenance.ts

import { MachineVendor } from './machine';

// ─── Component Taxonomy ──────────────────────────────────────────────────────

export enum ComponentCategory {
  SPINDLE = 'SPINDLE',
  TOOL = 'TOOL',
  AXIS_X = 'AXIS_X',
  AXIS_Y = 'AXIS_Y',
  AXIS_Z = 'AXIS_Z',
  VACUUM = 'VACUUM',
  DUST_EXTRACTION = 'DUST_EXTRACTION',
  COOLANT = 'COOLANT',
  PNEUMATIC = 'PNEUMATIC',
  ELECTRICAL = 'ELECTRICAL',
}

export enum FailureMode {
  BEARING_DEGRADATION = 'BEARING_DEGRADATION',
  TOOL_WEAR = 'TOOL_WEAR',
  THERMAL_DRIFT = 'THERMAL_DRIFT',
  VIBRATION_ANOMALY = 'VIBRATION_ANOMALY',
  OVERTEMPERATURE = 'OVERTEMPERATURE',
  SEAL_LEAK = 'SEAL_LEAK',
  BELT_WEAR = 'BELT_WEAR',
  LUBRICATION_DEFICIENCY = 'LUBRICATION_DEFICIENCY',
}

export enum HealthStatus {
  HEALTHY = 'HEALTHY',         // 80-100% health score
  DEGRADED = 'DEGRADED',      // 50-79%
  WARNING = 'WARNING',         // 25-49%
  CRITICAL = 'CRITICAL',       // 0-24%
  UNKNOWN = 'UNKNOWN',
}

export enum MaintenanceUrgency {
  IMMEDIATE = 'IMMEDIATE',     // < 24 hours RUL
  URGENT = 'URGENT',           // 1-7 days RUL
  PLANNED = 'PLANNED',         // 7-30 days RUL
  SCHEDULED = 'SCHEDULED',     // > 30 days RUL
  NONE = 'NONE',               // No maintenance needed
}

// ─── Health Assessment ───────────────────────────────────────────────────────

export interface ComponentHealth {
  machineId: string;
  componentId: string;
  category: ComponentCategory;
  healthScore: number;           // 0-100
  status: HealthStatus;
  remainingUsefulLife: RULEstimate;
  failureModes: FailureModeAssessment[];
  lastUpdated: Date;
  confidence: number;            // 0-1 (model confidence)
}

export interface RULEstimate {
  /** Estimated hours until failure */
  hoursRemaining: number;
  /** Lower bound (10th percentile) */
  lowerBound: number;
  /** Upper bound (90th percentile) */
  upperBound: number;
  /** Estimation method used */
  method: 'lstm' | 'survival_analysis' | 'degradation_model' | 'threshold_extrapolation';
  /** Model version that produced this estimate */
  modelVersion: string;
  /** Timestamp of estimation */
  estimatedAt: Date;
}

export interface FailureModeAssessment {
  mode: FailureMode;
  probability: number;            // 0-1
  severity: 'low' | 'medium' | 'high' | 'critical';
  contributingFeatures: FeatureContribution[];
}

export interface FeatureContribution {
  featureName: string;
  currentValue: number;
  normalRange: [number, number];
  contribution: number;           // SHAP-like contribution score
}

// ─── Maintenance Recommendations ─────────────────────────────────────────────

export interface MaintenanceRecommendation {
  id: string;
  machineId: string;
  componentId: string;
  urgency: MaintenanceUrgency;
  action: MaintenanceAction;
  estimatedDowntime: number;      // minutes
  estimatedCost: CostEstimate;
  scheduledWindow?: TimeWindow;
  dependencies: string[];         // other components to check simultaneously
  createdAt: Date;
  expiresAt: Date;
}

export interface MaintenanceAction {
  type: 'replace' | 'inspect' | 'lubricate' | 'calibrate' | 'clean' | 'adjust';
  description: string;
  procedure: string;              // Reference to maintenance procedure doc
  requiredParts: SparePart[];
  requiredTools: string[];
  skillLevel: 'operator' | 'technician' | 'specialist';
}

export interface SparePart {
  partNumber: string;
  description: string;
  vendor: string;
  quantity: number;
  inStock: boolean;
  leadTimeDays: number;
}

export interface CostEstimate {
  laborHours: number;
  partsCost: number;              // THB
  downtimeCost: number;           // THB (opportunity cost)
  totalCost: number;              // THB
}

export interface TimeWindow {
  start: Date;
  end: Date;
  reason: string;                 // e.g., "shift change", "weekend", "low-demand period"
}

// ─── Model Configuration ─────────────────────────────────────────────────────

export interface PdMModelConfig {
  modelId: string;
  modelType: 'lstm_rul' | 'isolation_forest' | 'xgboost_classification' | 'arima_degradation';
  targetComponent: ComponentCategory;
  targetFailureMode: FailureMode;
  inputFeatures: FeatureSpec[];
  outputType: 'regression' | 'classification' | 'anomaly_score';
  /** ONNX model path */
  modelPath: string;
  /** Model performance metrics from validation */
  metrics: ModelMetrics;
  /** Retraining schedule */
  retrainConfig: RetrainConfig;
}

export interface FeatureSpec {
  name: string;
  influxMeasurement: string;
  influxField: string;
  aggregation: 'mean' | 'max' | 'min' | 'stddev' | 'last' | 'rate';
  windowSize: string;             // InfluxDB duration (e.g., '1h', '24h')
  normalization: 'z_score' | 'min_max' | 'none';
}

export interface ModelMetrics {
  mae?: number;                   // Mean Absolute Error (for RUL)
  rmse?: number;                  // Root Mean Square Error
  accuracy?: number;              // Classification accuracy
  precision?: number;
  recall?: number;
  f1Score?: number;
  aucRoc?: number;                // For anomaly detection
  validatedOn: Date;
  datasetSize: number;
}

export interface RetrainConfig {
  triggerType: 'scheduled' | 'drift_detected' | 'manual';
  intervalDays: number;           // For scheduled
  driftThreshold: number;         // PSI threshold for drift detection
  minSamples: number;             // Minimum new samples before retrain
}

// ─── Telemetry Feature Store ─────────────────────────────────────────────────

export interface FeatureVector {
  machineId: string;
  componentId: string;
  timestamp: Date;
  features: Record<string, number>;
  metadata: {
    jobId?: string;
    material?: string;
    toolId?: string;
    programRef?: string;
  };
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface PdMEvent {
  type: 'health_update' | 'anomaly_detected' | 'rul_warning' | 'maintenance_recommended' | 'model_retrained';
  machineId: string;
  componentId: string;
  severity: 'info' | 'warning' | 'critical';
  payload: ComponentHealth | MaintenanceRecommendation;
  timestamp: Date;
}
```

---

## 5. Service Architecture

### 5.1 FeatureEngineeringService

Extracts time-domain and frequency-domain features from raw InfluxDB telemetry.

```typescript
// src/services/FeatureEngineeringService.ts

export class FeatureEngineeringService {
  private influx: InfluxQueryApi;
  private featureStore: Redis;

  // ─── Time-Domain Features ──────────────────────────────────────────────────

  /** Root Mean Square — overall vibration energy */
  computeRMS(signal: number[]): number;

  /** Kurtosis — impulsiveness indicator (bearing defects → kurtosis > 3.5) */
  computeKurtosis(signal: number[]): number;

  /** Crest Factor — peak/RMS ratio (early bearing damage indicator) */
  computeCrestFactor(signal: number[]): number;

  /** Skewness — asymmetry of vibration distribution */
  computeSkewness(signal: number[]): number;

  /** Shape Factor — waveform complexity */
  computeShapeFactor(signal: number[]): number;

  // ─── Frequency-Domain Features (FFT) ──────────────────────────────────────

  /** Bearing defect frequencies (based on bearing geometry) */
  computeBearingFrequencies(
    rpm: number,
    bearingSpec: BearingSpec,
  ): { bpfo: number; bpfi: number; bsf: number; ftf: number };

  /** Extract energy in specific frequency bands */
  computeBandEnergy(
    fftMagnitude: number[],
    freqResolution: number,
    band: [number, number],
  ): number;

  /** Spectral Kurtosis — frequency-specific impulsiveness */
  computeSpectralKurtosis(signal: number[], windowSize: number): number[];

  // ─── Trend Features ────────────────────────────────────────────────────────

  /** Linear regression slope over time window (degradation rate) */
  computeTrendSlope(timeSeries: Array<{ t: number; v: number }>): number;

  /** Rate of change acceleration (second derivative) */
  computeTrendAcceleration(timeSeries: Array<{ t: number; v: number }>): number;

  /** Exponential weighted moving average (recent emphasis) */
  computeEWMA(values: number[], alpha?: number): number;

  // ─── Cross-Feature Computation ─────────────────────────────────────────────

  /** Compute full feature vector for a component at current time */
  async computeFeatureVector(
    machineId: string,
    componentId: string,
    config: PdMModelConfig,
  ): Promise<FeatureVector>;

  /** Batch compute features for training data export */
  async computeTrainingBatch(
    machineId: string,
    componentId: string,
    timeRange: { start: Date; end: Date },
    stepSize: string,
  ): Promise<FeatureVector[]>;
}
```

### 5.2 ModelInferenceService

Runs ONNX models for RUL estimation and anomaly detection.

```typescript
// src/services/ModelInferenceService.ts

import * as ort from 'onnxruntime-node';

export class ModelInferenceService {
  private sessions: Map<string, ort.InferenceSession>;
  private modelRegistry: PdMModelConfig[];

  /** Load ONNX model into memory */
  async loadModel(config: PdMModelConfig): Promise<void>;

  /** Unload model (free memory) */
  async unloadModel(modelId: string): Promise<void>;

  /** Run RUL inference — returns hours remaining */
  async predictRUL(
    modelId: string,
    featureVector: FeatureVector,
  ): Promise<RULEstimate>;

  /** Run anomaly detection — returns anomaly score 0-1 */
  async detectAnomaly(
    modelId: string,
    featureVector: FeatureVector,
  ): Promise<{ score: number; isAnomaly: boolean; threshold: number }>;

  /** Run failure mode classification */
  async classifyFailureMode(
    modelId: string,
    featureVector: FeatureVector,
  ): Promise<FailureModeAssessment[]>;

  /** Batch inference for monitoring dashboard */
  async assessAllComponents(machineId: string): Promise<ComponentHealth[]>;

  // ─── Model Management ──────────────────────────────────────────────────────

  /** Check for model drift (PSI on feature distributions) */
  async checkModelDrift(modelId: string, recentFeatures: FeatureVector[]): Promise<{
    drifted: boolean;
    psiScore: number;
    driftedFeatures: string[];
  }>;

  /** Export training data window for retraining pipeline */
  async exportTrainingData(
    modelId: string,
    timeRange: { start: Date; end: Date },
  ): Promise<string>; // Returns path to exported CSV/Parquet
}
```

### 5.3 HealthScoreCalculator

Aggregates per-component health metrics into actionable scores.

```typescript
// src/services/HealthScoreCalculator.ts

export class HealthScoreCalculator {
  /**
   * Weighted health score formula:
   *
   * H(component) = Σ(wᵢ × fᵢ(xᵢ)) where:
   *   wᵢ = weight for factor i
   *   fᵢ = degradation function for factor i
   *   xᵢ = current sensor reading for factor i
   *
   * Degradation functions:
   *   - Linear:      f(x) = max(0, 100 - α(x - x_normal))
   *   - Exponential: f(x) = 100 × exp(-λ(x - x_normal))
   *   - Sigmoid:     f(x) = 100 / (1 + exp(k(x - x_threshold)))
   */

  calculateComponentHealth(
    featureVector: FeatureVector,
    rulEstimate: RULEstimate,
    anomalyScore: number,
    failureModes: FailureModeAssessment[],
  ): ComponentHealth;

  /** Machine-level health = min(component healths) with weighting */
  calculateMachineHealth(componentHealths: ComponentHealth[]): {
    overallScore: number;
    status: HealthStatus;
    worstComponent: ComponentHealth;
    recommendations: MaintenanceRecommendation[];
  };

  /** Fleet-level dashboard data */
  calculateFleetHealth(machineHealths: Map<string, ComponentHealth[]>): FleetHealthSummary;
}
```

### 5.4 MaintenanceScheduler

Integrates PdM outputs with production schedule for optimal maintenance windows.

```typescript
// src/services/MaintenanceScheduler.ts

export class MaintenanceScheduler {
  /**
   * Optimization objective:
   *   Minimize: total_cost = Σ(downtime_cost + part_cost + labor_cost + risk_of_failure_cost)
   *   Subject to:
   *     - RUL constraints (must service before predicted failure)
   *     - Production priority constraints (high-priority jobs cannot be interrupted)
   *     - Resource constraints (technician availability, spare parts)
   *     - Grouping benefits (service nearby components together)
   */

  /** Generate maintenance schedule for next N days */
  async generateSchedule(
    machineId: string,
    horizonDays: number,
    productionPlan: ProductionSlot[],
  ): Promise<MaintenanceRecommendation[]>;

  /** Find optimal maintenance window given constraints */
  findOptimalWindow(
    urgency: MaintenanceUrgency,
    estimatedDowntime: number,
    productionGaps: TimeWindow[],
    technicianAvailability: TimeWindow[],
  ): TimeWindow | null;

  /** Group maintenance tasks for efficiency */
  groupMaintenanceTasks(
    recommendations: MaintenanceRecommendation[],
  ): MaintenanceGroup[];

  /** Trigger command layer for maintenance mode */
  async initiateMaintenanceMode(
    machineId: string,
    maintenanceId: string,
  ): Promise<void>;
}
```

### 5.5 AlertManager

Manages notification lifecycle and escalation.

```typescript
// src/services/AlertManager.ts

export class AlertManager {
  private escalationRules: EscalationRule[];

  /** Escalation ladder:
   *  1. Dashboard warning (HealthStatus.DEGRADED)
   *  2. Operator notification (HealthStatus.WARNING)
   *  3. Maintenance team alert (MaintenanceUrgency.URGENT)
   *  4. Production manager escalation (MaintenanceUrgency.IMMEDIATE)
   *  5. Auto-stop machine (CRITICAL + imminent failure)
   */

  async processHealthUpdate(health: ComponentHealth): Promise<void>;

  async triggerAlert(event: PdMEvent): Promise<void>;

  /** Integration with MONOLITH notification channels */
  async notify(
    channel: 'dashboard' | 'line_app' | 'email' | 'sms' | 'factory_alarm',
    recipients: string[],
    alert: PdMAlert,
  ): Promise<void>;

  /** Auto-execute emergency stop if failure is imminent */
  async autoProtectMachine(
    machineId: string,
    reason: string,
  ): Promise<void>;
}
```

---

## 6. InfluxDB Schema Design

### 6.1 Measurements (Tables)

```flux
// Vibration data (high-frequency → downsampled)
// Retention: raw=7d, 1s_agg=90d, 1min_agg=2y
bucket: "telemetry_raw" / "telemetry_downsampled"

vibration_rms
  tags: machine_id, axis (x/y/z), sensor_id
  fields: value (float), peak (float)
  timestamp: nanosecond precision

spindle_metrics
  tags: machine_id, spindle_id
  fields: rpm (float), current_a (float), temp_c (float),
          vibration_rms (float), power_kw (float)

cutting_force
  tags: machine_id, tool_id, axis (x/y/z)
  fields: force_n (float), chip_load_mm (float)

axis_metrics
  tags: machine_id, axis (x/y/z/a/b/c)
  fields: position_error_um (float), temp_c (float),
          following_error_um (float), current_a (float)

tool_wear
  tags: machine_id, tool_id, tool_type
  fields: wear_index (float), runtime_min (float),
          cuts_count (int), force_baseline_pct (float)

// Feature store (computed features, lower frequency)
// Retention: 1y
bucket: "features"

component_features
  tags: machine_id, component_id, model_id
  fields: [dynamic — feature name → value]

// Health scores and predictions
// Retention: 2y
bucket: "predictions"

component_health
  tags: machine_id, component_id, category
  fields: health_score (float), rul_hours (float),
          rul_lower (float), rul_upper (float),
          anomaly_score (float), confidence (float)

maintenance_events
  tags: machine_id, component_id, urgency, action_type
  fields: scheduled_start (string), estimated_downtime_min (int),
          estimated_cost_thb (float), completed (bool)
```

### 6.2 Downsampling Tasks (InfluxDB Flux)

```flux
// Continuous aggregate: 1-second vibration → 1-minute statistics
option task = {name: "downsample_vibration_1m", every: 1m}

from(bucket: "telemetry_raw")
  |> range(start: -task.every)
  |> filter(fn: (r) => r._measurement == "vibration_rms")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  |> map(fn: (r) => ({r with _measurement: "vibration_1m_mean"}))
  |> to(bucket: "telemetry_downsampled")

// Kurtosis computation (rolling 10-second window)
option task = {name: "compute_kurtosis_10s", every: 10s}

from(bucket: "telemetry_raw")
  |> range(start: -10s)
  |> filter(fn: (r) => r._measurement == "vibration_rms")
  |> reduce(
      fn: (r, accumulator) => ({
        sum: accumulator.sum + r._value,
        sum2: accumulator.sum2 + r._value * r._value,
        sum4: accumulator.sum4 + math.pow(x: r._value, y: 4.0),
        count: accumulator.count + 1.0,
      }),
      identity: {sum: 0.0, sum2: 0.0, sum4: 0.0, count: 0.0},
    )
  |> map(fn: (r) => {
      mean = r.sum / r.count
      variance = (r.sum2 / r.count) - mean * mean
      kurtosis = if variance > 0.0 then
        ((r.sum4 / r.count) - 4.0 * mean * (r.sum2 / r.count) + 6.0 * mean * mean * (r.sum2 / r.count) - 3.0 * math.pow(x: mean, y: 4.0)) / math.pow(x: variance, y: 2.0)
      else 0.0
      return {_time: now(), _measurement: "vibration_kurtosis", _field: "value", _value: kurtosis, machine_id: r.machine_id, axis: r.axis}
    })
  |> to(bucket: "features")
```

---

## 7. Model Architecture Details

### 7.1 LSTM RUL Model (Spindle Bearing)

```
Input: Feature sequence [T=168 hours × F=12 features]

Architecture:
  Input Layer: (168, 12)
  LSTM Layer 1: 64 units, return_sequences=True, dropout=0.2
  LSTM Layer 2: 32 units, return_sequences=False, dropout=0.2
  Dense Layer 1: 64 units, ReLU
  Dense Layer 2: 32 units, ReLU
  Output Layer: 3 units (RUL_median, RUL_lower, RUL_upper) — Quantile regression

Features (per timestep):
  1. vibration_rms_x        7. spindle_current_mean
  2. vibration_rms_y        8. spindle_power_kw
  3. vibration_rms_z        9. bearing_bpfo_energy
  4. vibration_kurtosis    10. bearing_bpfi_energy
  5. spindle_temp_c        11. trend_slope_7d
  6. spindle_rpm_mean      12. operating_hours_since_service

Training:
  - Data: Run-to-failure datasets from 24 spindle replacements (historical)
  - Augmentation: Time warping, jitter, magnitude scaling
  - Loss: Pinball loss (quantile regression for uncertainty bounds)
  - Optimizer: Adam, lr=1e-4, early stopping (patience=20)
  - Validation: Walk-forward cross-validation (5 folds)

Expected Performance:
  - MAE: ±15% of actual RUL
  - P90 coverage: >85% (actual RUL falls within predicted bounds)
```

### 7.2 Isolation Forest (Anomaly Detection)

```
Purpose: Detect novel anomaly patterns not covered by supervised models
Input: Current feature vector (12-20 features)
Output: Anomaly score 0-1

Configuration:
  - n_estimators: 200
  - max_samples: 256
  - contamination: 0.02 (expected 2% anomaly rate)
  - random_state: 42

Retraining: Weekly on sliding 30-day window of "healthy" data
Alert threshold: score > 0.75 (tuned for 1% false positive rate)
```

### 7.3 XGBoost Classifier (Tool Wear Stage)

```
Purpose: Classify tool into wear stages (New/Steady/Accelerating/Replace)
Input: 8 features from current cutting cycle
Output: Probability distribution over 4 classes

Features:
  1. cutting_force_ratio (current/baseline)
  2. surface_quality_index
  3. tool_runtime_minutes
  4. cumulative_cut_length_m
  5. material_hardness_factor
  6. spindle_current_deviation
  7. chip_load_variance
  8. force_trend_slope_last_10_cuts

Expected Performance:
  - Accuracy: >92% (4-class)
  - Precision (Replace class): >95% (minimize false negatives)
  - Recall (Replace class): >88%
```

---

## 8. Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Processing Pipeline (every 60s)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐    ┌──────────────┐    ┌────────────────┐    ┌─────────┐ │
│  │InfluxDB │───▶│   Feature    │───▶│     Model      │───▶│  Health │ │
│  │  Query  │    │  Engineering │    │   Inference    │    │  Score  │ │
│  └─────────┘    └──────────────┘    └────────────────┘    └────┬────┘ │
│                                                                 │      │
│                    ┌────────────────────────────────────────────┘      │
│                    ▼                                                    │
│  ┌──────────────────────┐    ┌────────────────┐    ┌──────────────┐  │
│  │   Alert Evaluation   │───▶│  Maintenance   │───▶│   Factory    │  │
│  │ (threshold + trend)  │    │   Scheduler    │    │   Server     │  │
│  └──────────────────────┘    └────────────────┘    └──────────────┘  │
│                                                                        │
│  Timing: Feature compute ~200ms │ Inference ~50ms │ Total < 500ms    │
│                                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pipeline Execution Flow:

1. **Every 60 seconds** per machine:
   - Query InfluxDB for latest telemetry window (1h lookback)
   - Compute feature vector (time-domain + frequency-domain)
   - Store in feature store (Redis + InfluxDB `features` bucket)

2. **Every 5 minutes** per component:
   - Load feature sequence (168 timesteps for LSTM, or current vector for IF/XGB)
   - Run model inference (ONNX Runtime)
   - Calculate health score
   - Store in `predictions` bucket

3. **On health score change or threshold crossing**:
   - Evaluate alert rules
   - Generate maintenance recommendation if needed
   - Publish to Redis Stream (`pdm:events`)
   - Notify Factory Server via webhook

---

## 9. API Endpoints

```typescript
// src/api/maintenance.ts — added to Hono router

// ─── Health Dashboard ─────────────────────────────────────────────────────────

GET /maintenance/health
  → FleetHealthSummary (all machines, all components)

GET /maintenance/health/:machineId
  → { machineId, overallScore, components: ComponentHealth[] }

GET /maintenance/health/:machineId/:componentId
  → ComponentHealth (detailed with feature contributions)

GET /maintenance/health/:machineId/:componentId/history
  Query: ?from=2026-01-01&to=2026-08-28&resolution=1h
  → Array<{ timestamp, healthScore, rulHours }>

// ─── RUL & Predictions ───────────────────────────────────────────────────────

GET /maintenance/rul/:machineId
  → { components: Array<{ componentId, category, rul: RULEstimate }> }

GET /maintenance/anomalies/:machineId
  Query: ?severity=warning&from=...&limit=50
  → Array<{ timestamp, componentId, score, features }>

// ─── Maintenance Schedule ─────────────────────────────────────────────────────

GET /maintenance/schedule
  Query: ?horizon=30d&urgency=urgent,planned
  → Array<MaintenanceRecommendation>

POST /maintenance/schedule/generate
  Body: { machineId, horizonDays, productionPlan? }
  → { recommendations: MaintenanceRecommendation[], optimizedWindows: TimeWindow[] }

POST /maintenance/acknowledge/:recommendationId
  Body: { acknowledgedBy, scheduledAt?, notes? }
  → { status: 'acknowledged' }

POST /maintenance/complete/:recommendationId
  Body: { completedBy, actualDowntimeMin, partsUsed, notes }
  → { status: 'completed', nextServiceEstimate }

// ─── Model Management ─────────────────────────────────────────────────────────

GET /maintenance/models
  → Array<{ modelId, status, lastTrained, metrics }>

POST /maintenance/models/:modelId/retrain
  Body: { timeRange, triggerReason }
  → { jobId, estimatedDuration }

GET /maintenance/models/:modelId/drift
  → { drifted, psiScore, driftedFeatures, recommendation }
```

---

## 10. Integration with Existing System

### 10.1 Phase 1 Integration (Digital Shadow)

```typescript
// PdM subscribes to the same InfluxDB that MqttIngestionService writes to
// No changes needed to Phase 1 — PdM is a read-only consumer

// Feature pipeline queries:
const vibrationQuery = `
  from(bucket: "telemetry_raw")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "vibration_rms")
    |> filter(fn: (r) => r.machine_id == "${machineId}")
    |> aggregateWindow(every: 1s, fn: mean)
`;
```

### 10.2 Phase 2 Integration (Command Layer)

```typescript
// PdM can trigger maintenance mode via Command Layer

// Auto-protection: when CRITICAL health detected
await commandDispatcher.submitCommand({
  machineId: health.machineId,
  commandType: CommandType.PAUSE_JOB,
  priority: CommandPriority.HIGH,
  payload: {
    type: 'PAUSE_JOB',
    reason: `PdM auto-protect: ${health.failureModes[0].mode} — RUL ${health.remainingUsefulLife.hoursRemaining}h`,
  },
  initiator: {
    source: 'pdm_system',
    actorId: 'predictive-maintenance-service',
    traceId: `pdm-${health.componentId}-${Date.now()}`,
  },
  timeoutMs: 5000,
});
```

### 10.3 Factory Server Integration

```typescript
// Webhook to Factory Server for maintenance calendar sync
POST ${FACTORY_SERVER_URL}/api/maintenance/recommendations
Body: MaintenanceRecommendation

// Query production schedule for optimal windows
GET ${FACTORY_SERVER_URL}/api/schedule/gaps?machineId=${machineId}&horizon=7d
Response: Array<TimeWindow>

// Activity Log for maintenance events
POST ${FACTORY_SERVER_URL}/api/activity-log
Body: {
  type: 'MAINTENANCE_PREDICTED',
  machineId,
  details: { componentId, urgency, rul, healthScore },
}
```

---

## 11. Configuration

```typescript
// src/config/maintenance.ts

export const maintenanceConfig = {
  // Pipeline scheduling
  featureComputeIntervalMs: 60_000,       // 1 minute
  healthAssessmentIntervalMs: 300_000,    // 5 minutes
  scheduleOptimizationIntervalMs: 3_600_000, // 1 hour

  // Model paths
  models: {
    spindleRUL: './models/spindle_rul_lstm_v3.onnx',
    toolWear: './models/tool_wear_xgboost_v2.onnx',
    anomaly: './models/anomaly_iforest_v4.onnx',
    thermalDrift: './models/thermal_drift_arima_v1.onnx',
  },

  // Alert thresholds
  alerts: {
    healthScoreWarning: 50,
    healthScoreCritical: 25,
    anomalyScoreThreshold: 0.75,
    rulImmediateHours: 24,
    rulUrgentHours: 168,     // 7 days
    rulPlannedHours: 720,    // 30 days
  },

  // Auto-protection
  autoProtect: {
    enabled: true,
    criticalHealthAutoStop: true,    // Auto-pause at health < 15%
    rulAutoStopHours: 4,             // Auto-pause when RUL < 4 hours
    requireConfirmation: false,       // Direct action without operator confirmation
  },

  // Cost parameters (THB)
  costs: {
    downtimePerHour: 15_000,          // Opportunity cost per hour of downtime
    unplannedMultiplier: 3.5,         // Unplanned downtime costs 3.5× more
    technicianHourly: 800,
    specialistHourly: 2_500,
  },

  // Bearing specifications (for frequency calculation)
  bearingSpecs: {
    'biesse-rover-b': {
      type: '7014C',
      ballCount: 16,
      ballDiameter: 11.1125,
      pitchDiameter: 90,
      contactAngle: 15,
    },
    'homag-centateq-p': {
      type: '7012C',
      ballCount: 14,
      ballDiameter: 10.3188,
      pitchDiameter: 77.5,
      contactAngle: 15,
    },
  },
};
```

---

## 12. Deployment & Dependencies

### 12.1 New Dependencies

```json
{
  "dependencies": {
    "onnxruntime-node": "^1.17.0",
    "fft-js": "^0.0.12",
    "simple-statistics": "^7.8.0"
  },
  "devDependencies": {
    "@types/fft-js": "^0.0.3"
  }
}
```

### 12.2 Docker Compose Addition

```yaml
services:
  # ... existing services ...

  pdm-worker:
    build:
      context: .
      dockerfile: Dockerfile
    command: ["node", "dist/workers/pdm-pipeline.js"]
    environment:
      - INFLUX_URL=http://influxdb:8086
      - INFLUX_TOKEN=${INFLUX_TOKEN}
      - REDIS_URL=redis://redis:6379
      - MODEL_DIR=/app/models
    volumes:
      - ./models:/app/models:ro
    depends_on:
      - influxdb
      - redis
    deploy:
      resources:
        limits:
          memory: 2G        # ONNX models need memory
          cpus: '2.0'
```

### 12.3 Model Storage

Models stored as ONNX files in a dedicated volume. Versioned via CAS hash:
```
models/
├── spindle_rul_lstm_v3.onnx          (42 MB)
├── tool_wear_xgboost_v2.onnx         (8 MB)
├── anomaly_iforest_v4.onnx           (12 MB)
├── thermal_drift_arima_v1.onnx       (2 MB)
└── model_registry.json               (metadata)
```

---

## 13. Implementation Roadmap

| Phase | Deliverable | Duration | Dependencies |
|-------|-------------|----------|--------------|
| 3.1 | Type definitions + InfluxDB schema | 1 week | Phase 1 stable |
| 3.2 | Feature engineering service | 2 weeks | InfluxDB data flowing |
| 3.3 | Model inference service (ONNX Runtime) | 2 weeks | 3.2 |
| 3.4 | Health score calculator | 1 week | 3.3 |
| 3.5 | Alert manager + escalation | 1 week | 3.4 |
| 3.6 | Maintenance scheduler | 2 weeks | 3.5 + Factory Server API |
| 3.7 | API routes + Grafana panels | 1 week | 3.4 |
| 3.8 | Model training pipeline (offline) | 3 weeks | Historical data collection |
| 3.9 | Integration testing + validation | 2 weeks | 3.1-3.8 |

**Total: ~15 weeks** (parallel with data collection starting from Phase 1 deployment)

---

## 14. Data Collection Strategy

Since PdM requires historical run-to-failure data, Phase 1 deployment starts data collection immediately:

1. **Months 1-3**: Collect normal operating data (establishes baselines)
2. **Months 3-6**: Accumulate degradation patterns (with manual failure annotations)
3. **Month 6+**: First models trained on real DAPH Decor data

**Interim approach** (before sufficient local data):
- Use transfer learning from public bearing datasets (CWRU, FEMTO, NASA)
- Apply domain adaptation for wood-cutting specific vibration patterns
- Use manufacturer-provided wear curves as prior knowledge

---

## 15. KPIs & Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Unplanned downtime reduction | -40% vs baseline | Monthly MTTR comparison |
| Prediction accuracy (RUL) | MAE < ±20% | Validated at each failure event |
| False alarm rate | < 5% per week | Alerts that didn't require action |
| Maintenance cost reduction | -25% | Annual maintenance spend |
| Mean Time Between Failures (MTBF) | +30% | Rolling 6-month average |
| Tool usage optimization | +15% tool life | Average tool runtime before replacement |
| Model availability | > 99.5% | Pipeline uptime monitoring |

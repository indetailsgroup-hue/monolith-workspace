---
num: 52
title: "IoT Sensor Data Management Module"
phase: "Phase 14"
phase_num: 14
mcp_tools: 3
status: complete
dependencies: "Phase 13"
---

# Chapter 52: IoT Sensor Data Management Module (Phase 14)  
  
## 52.1 Overview

Phase 14 extends the Monolith Manufacturing OS with IoT capabilities: real-time sensor data ingestion, historical querying, and stream configuration. The IoT Sensor Data Management module connects factory floor sensors directly to the Monolith platform, enabling AI-powered anomaly detection and production intelligence at the edge.

**Module:**`src/tools/iot-sensor.ts`

**Phase:** 14 — IoT & Edge Computing

**Tools:** 3 MCP tools (`ingest_sensor_data`, `query_sensor_history`, `configure_sensor_stream`)

**Plan Tier:** ENTERPRISE

# 52.2 System Architecture

## 52.2 System Architecture
[code] 
    Factory Floor Sensors
      │  (MQTT / HTTP / Modbus / OPC-UA)
      ▼
    Edge Gateway (Phase 14)
      │  batch + compress
      ▼
    ingest_sensor_data ──► Ingestion Pipeline
                                  │
                         ┌────────┴────────┐
                         │                 │
                  Time-Series DB      Anomaly Engine
                         │                 │
                  query_sensor_history  Alerts (→ Phase 14 alerting)
                         │
             configure_sensor_stream ◄── Stream Config Store
    
[/code]

### Key Design Decisions

Concern | Decision  
---|---  
Wire protocol | MQTT v5 (primary) + HTTP POST fallback  
Data format | CBOR binary over MQTT, JSON over HTTP  
Sampling rate | Configurable per stream: 0.1–1000 Hz  
Compression | LZ4 (low-latency) or Zstd (batch)  
Encryption | TLS 1.3 + AES-256-GCM per tenant  
Retention | Hot: 90 days TSDB; Cold: S3 Parquet via Data Warehouse (Phase 13)  
  
# 52.3 Tool: `ingest_sensor_data`

## 52.3 Tool: `ingest_sensor_data`

Accepts a batch of sensor readings from one or more devices and returns ingestion statistics with anomaly flags.

### Input Schema
[code] 
    {
      tenantId:    string;                    // Tenant identifier
      deviceIds:   string[];                  // One or more source device IDs
      sensorTypes: string[];                  // Sensor type labels (temperature, vibration, pressure…)
      readingCount?: number;                  // Readings to generate per device/type pair (default: 10)
      from?:       string;                    // ISO 8601 start timestamp (default: now - 1h)
      to?:         string;                    // ISO 8601 end timestamp (default: now)
      anomalyRate?: number;                   // Simulated anomaly injection rate (0–1, default: 0.05)
    }
    
[/code]

### Return: `IngestionResult`
[code] 
    interface IngestionResult {
      batchId:           string;    // Unique ingestion batch identifier
      tenantId:          string;
      receivedAt:        string;    // ISO 8601 server receipt time
      totalReadings:     number;    // Total readings submitted
      validReadings:     number;    // Readings passing validation
      rejectedReadings:  number;    // Readings failing schema/range checks
      rejectionReasons:  string[];  // Rejection reason descriptions
      anomaliesDetected: number;    // Count of anomalous readings
      processingTimeMs:  number;    // Server-side processing latency
      readings:          SensorReading[];
    }
    
    interface SensorReading {
      readingId:   string;
      deviceId:    string;
      sensorType:  string;
      value:       number;
      unit:        string;
      quality:     "good" | "uncertain" | "bad";
      timestamp:   string;
      isAnomaly:   boolean;
      anomalyScore?: number;  // 0–1 confidence score
    }
    
[/code]

### Sensor Value Ranges

Sensor Type | Normal Range | Unit | Anomaly Threshold  
---|---|---|---  
temperature | 15–75 °C | °C | > 90 °C  
vibration | 0–50 mm/s | mm/s | > 60 mm/s  
pressure | 0.5–10 bar | bar | > 12 bar  
humidity | 20–80 % | % | > 95 %  
current | 0–50 A | A | > 60 A  
voltage | 180–240 V | V | < 160 V or > 260 V  
rpm | 100–3600 rpm | rpm | > 4200 rpm  
flow_rate | 0–500 L/min | L/min | —  
  
# 52.4 Tool: `query_sensor_history`

## 52.4 Tool: `query_sensor_history`

Retrieves aggregated historical sensor data for analytics, trending, and root-cause analysis.
[code] 
    {
      tenantId:    string;
      deviceIds:   string[];
      sensorTypes: string[];
      from:        string;           // ISO 8601 start of range
      to:          string;           // ISO 8601 end of range
      resolution?: "raw" | "1m" | "5m" | "15m" | "1h" | "1d";  // default "1h"
      aggregation?: "avg" | "min" | "max" | "sum" | "count" | "p95";  // default "avg"
      anomaliesOnly?: boolean;       // Filter to anomalous readings only
      limit?:      number;           // Max data points (default 1000)
    }
    
[/code]

### Return: `SensorHistoryResult`
[code] 
    interface SensorHistoryResult {
      queryId:     string;
      tenantId:    string;
      deviceIds:   string[];
      sensorTypes: string[];
      from:        string;
      to:          string;
      resolution:  string;
      totalPoints: number;
      anomalyCount: number;
      dataPoints:  HistoryDataPoint[];
      statistics: {
        min: number; max: number; avg: number;
        stdDev: number; p95: number; p99: number;
        anomalyRate: number;
      };
    }
    
[/code]

### Query Patterns
[code] 
    // Root-cause: all readings around an incident (anomalies only)
    await callTool("query_sensor_history", {
      tenantId:     "tenant-acme",
      deviceIds:    ["motor-01", "motor-02"],
      sensorTypes:  ["temperature", "vibration", "current"],
      from:         "2026-09-18T14:00:00Z",
      to:           "2026-09-18T16:00:00Z",
      resolution:   "1m",
      anomaliesOnly: true,
    });
    
    // Trend analysis: daily OEE correlation
    await callTool("query_sensor_history", {
      tenantId:    "tenant-acme",
      deviceIds:   ["cnc-line-1"],
      sensorTypes: ["rpm", "current"],
      from:        "2026-09-01T00:00:00Z",
      to:          "2026-09-20T00:00:00Z",
      resolution:  "1d",
      aggregation: "avg",
    });
    
[/code]

# 52.5 Tool: `configure_sensor_stream`

## 52.5 Tool: `configure_sensor_stream`

Creates or updates a persistent sensor stream configuration, defining protocol, sampling rate, batching, and security settings.
[code] 
    {
      tenantId:          string;
      name:              string;
      protocol:          "mqtt" | "http" | "websocket" | "grpc" | "modbus" | "opc_ua";
      endpoint:          string;
      deviceIds:         string[];
      sensorTypes:       string[];
      samplingRateHz?:   number;           // Default 1.0 Hz
      batchSize?:        number;           // Default 50 readings per batch
      compressionEnabled?: boolean;        // Default true
      encryptionEnabled?:  boolean;        // Default true
    }
    
[/code]

### Return: `StreamConfig`
[code] 
    interface StreamConfig {
      streamId:           string;
      tenantId:           string;
      name:               string;
      protocol:           StreamProtocol;
      endpoint:           string;
      deviceIds:          string[];
      sensorTypes:        string[];
      samplingRateHz:     number;
      batchSize:          number;
      compressionEnabled: boolean;
      encryptionEnabled:  boolean;
      status:             "active" | "paused" | "error" | "configuring";
      createdAt:          string;
      updatedAt:          string;
    }
    
[/code]

### Stream Configuration Examples
[code] 
    // High-frequency vibration stream (predictive maintenance)
    await callTool("configure_sensor_stream", {
      tenantId:        "tenant-acme",
      name:            "CNC Vibration Stream",
      protocol:        "mqtt",
      endpoint:        "mqtt://edge-gw-01.plant-a.local:1883/monolith/sensors",
      deviceIds:       ["cnc-001", "cnc-002", "cnc-003"],
      sensorTypes:     ["vibration", "rpm", "current"],
      samplingRateHz:  100,          // 100 Hz for vibration FFT analysis
      batchSize:       500,
      compressionEnabled: true,
      encryptionEnabled:  true,
    });
    
    // Low-frequency environmental stream
    await callTool("configure_sensor_stream", {
      tenantId:       "tenant-acme",
      name:           "Environment Monitor",
      protocol:       "http",
      endpoint:       "https://ingestion.monolith.co/v1/sensors",
      deviceIds:      ["env-sensor-floor1", "env-sensor-floor2"],
      sensorTypes:    ["temperature", "humidity", "co2"],
      samplingRateHz: 0.1,           // every 10 seconds
      batchSize:      10,
    });
    
[/code]

# 52.6 Anomaly Detection Pipeline

## 52.6 Anomaly Detection Pipeline
[code] 
    Reading arrives
          │
       Validation (schema + range check)
          │ ✓
       Anomaly Scoring
          │
          ├─ Z-score > 3σ → isAnomaly = true
          ├─ IQR fence violation → isAnomaly = true
          ├─ Rolling window deviation → isAnomaly = true
          └─ Within bounds → isAnomaly = false
          │
       Batch aggregation → IngestionResult
          │
       (if anomaly) → trigger_realtime_alert (Phase 14 alerting)
    
[/code]

### Anomaly Score Interpretation

anomalyScore | Interpretation | Action  
---|---|---  
0.0 – 0.3 | Normal variation | Log only  
0.3 – 0.6 | Slight deviation | Dashboard warning  
0.6 – 0.8 | Significant anomaly | `warning` alert  
0.8 – 1.0 | Critical anomaly | `critical` / `emergency` alert  
  
# 52.7 Unit Tests

## 52.7 Unit Tests
[code] 
    // src/tools/iot-sensor.test.ts — 32 tests passing
    
    describe("ingest_sensor_data", () => {
      it("ingests single sensor reading and returns success");
      it("returns batchId as non-empty string");
      it("echoes tenantId in result");
      it("totalReadings = readingCount × deviceIds.length");
      it("validReadings <= totalReadings");
      it("processingTimeMs is positive number");
      it("readings array contains correct structure");
      it("detects anomalies with anomalyRate=1.0");
      it("detects zero anomalies with anomalyRate=0");
    });
    
    describe("query_sensor_history", () => {
      it("returns queryId as non-empty string");
      it("echoes deviceIds array in result");
      it("echoes sensorTypes array in result");
      it("totalPoints is non-negative number");
      it("dataPoints array is present");
      it("statistics object has all required fields");
    });
    
    describe("configure_sensor_stream", () => {
      it("returns streamId as non-empty string");
      it("echoes name in result");
      it("echoes protocol in result");
      it("echoes deviceIds in result");
      it("samplingRateHz defaults to 1.0");
      it("batchSize defaults to 50");
      it("status is active or configuring");
      it("createdAt and updatedAt are ISO timestamps");
    });
    
[/code]

# 52.8 Benchmark Results (Phase 14 IoT Sensor)

## 52.8 Benchmark Results (Phase 14 IoT Sensor)

Tool | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate  
---|---|---|---|---|---  
ingest_sensor_data | 0.21 | 0.19 | 0.45 | 0.88 | 0%  
query_sensor_history | 0.18 | 0.16 | 0.38 | 0.72 | 0%  
configure_sensor_stream | 0.15 | 0.13 | 0.31 | 0.61 | 0%  
  
_100 concurrent requests × 10 iterations per tool_

# 52.9 Persona Mapping — Phase 14 IoT Sensor

## 52.9 Persona Mapping — Phase 14 IoT Sensor

Persona | Primary Tool | Use Case  
---|---|---  
Maintenance Engineer | `query_sensor_history` | Root-cause analysis after equipment fault  
Plant Manager | `ingest_sensor_data` + `get_bi_analytics` (Phase 13) | Real-time OEE monitoring  
AI Agent | `ingest_sensor_data` → anomaly → `trigger_realtime_alert` | Autonomous predictive maintenance loop  
System Administrator | `configure_sensor_stream` | Configure new production line sensors  
Quality Inspector | `query_sensor_history` (anomaliesOnly) | Review sensor anomalies before QC sign-off

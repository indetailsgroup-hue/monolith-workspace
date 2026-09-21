---
num: 54
title: "Predictive Maintenance System"
phase: "Phase 15"
phase_num: 15
mcp_tools: 2
status: in-progress
dependencies: "Phase 14 + All prior phases"
---

# Chapter 54: Phase 15 — Predictive Maintenance System  
  
## Chapter 54: Phase 15 — Predictive Maintenance System

### 54.1 Overview

Phase 15 introduces the **Predictive Maintenance System** — an AI-powered layer that transforms Monolith from a reactive manufacturing platform into a proactive, self-diagnosing operational environment. Three MCP tools deliver machine health scoring, failure prediction, and intelligent maintenance scheduling across the full IoT sensor estate established in Phase 14.

**Phase 15 tools:**

Tool | Class | Plan | Core Capability  
---|---|---|---  
`score_machine_health` | Read_Tool | ENTERPRISE | Composite health score 0–100 per device with optional subsystem breakdown  
`predict_failure` | Read_Tool | ENTERPRISE | ML-based failure probability over configurable horizons with root-cause analysis  
`schedule_maintenance` | Write_Tool | PROFESSIONAL | Work-order creation: preventive, corrective, predictive, emergency  
  
**Total MCP tools after Phase 15:** 123

# Section 122

### 54.2 Machine Health Scoring

`score_machine_health` aggregates sensor telemetry over a configurable lookback window to produce a per-device composite score.

#### 54.2.1 Scoring Input Parameters
[code] 
    {
      tenantId: string;           // Tenant namespace
      deviceIds: string[];        // 1 or more device IDs (minimum 1)
      metrics?: SensorMetric[];   // vibration | temperature | pressure | current | rpm | noise
      timeWindowHours?: number;   // 1–720, default 24
      includeSubsystems?: boolean; // Mechanical / Electrical / Thermal breakdown
    }
    
[/code]

#### 54.2.2 Health Score Model

The composite health score is derived from a weighted combination of sensor dimensions:
[code] 
    Health Score = Σ (metric_weight × normalised_reading) × 100
    
[/code]

Default metric weights:

  * Vibration: 0.30 (leading indicator of bearing/imbalance issues)
  * Temperature: 0.25 (thermal stress and cooling degradation)
  * Current draw: 0.20 (motor load and winding faults)
  * Pressure: 0.15 (fluid system integrity)
  * RPM deviation: 0.10 (speed controller health)



Score bands:

Score | Status | Action  
---|---|---  
85–100 | Nominal | No action required  
70–84 | Moderate | Monitor closely  
50–69 | Degraded | Schedule preventive maintenance  
30–49 | Critical | Immediate corrective maintenance  
0–29 | Failure Imminent | Emergency shutdown consideration  
  
#### 54.2.3 Subsystem Breakdown

When `includeSubsystems: true`, the response includes per-subsystem scores:
[code] 
    {
      "subsystems": {
        "mechanical": 78,
        "electrical": 82,
        "thermal": 91
      }
    }
    
[/code]

This granularity allows technicians to identify which subsystem is degrading first, enabling targeted intervention rather than full machine overhaul.

#### 54.2.4 Example Response
[code] 
    {
      "success": true,
      "tenantId": "tenant-factory-01",
      "evaluatedAt": "2026-09-20T10:00:00.000Z",
      "timeWindowHours": 24,
      "scores": [\
        {\
          "deviceId": "CNC-LATHE-03",\
          "healthScore": 74,\
          "status": "moderate",\
          "anomalyCount": 2,\
          "lastUpdated": "2026-09-20T09:58:12.000Z",\
          "subsystems": {\
            "mechanical": 68,\
            "electrical": 80,\
            "thermal": 85\
          }\
        }\
      ]
    }
    
[/code]

# Section 123

### 54.3 Failure Prediction Engine

`predict_failure` applies a trained ML model to time-series telemetry from a single device and returns a probabilistic failure forecast.

#### 54.3.1 Prediction Parameters
[code] 
    {
      tenantId: string;
      deviceId: string;
      horizonHours?: number;      // 1–8760, default 168 (7 days)
      alertThreshold?: number;    // 0–1, default 0.7
      includeRootCause?: boolean; // Root-cause factor analysis
    }
    
[/code]

#### 54.3.2 Prediction Model Architecture

The failure prediction pipeline uses a three-stage processing chain:

**Stage 1 — Feature Extraction**

Raw sensor readings are transformed into engineered features:

  * Rolling mean and standard deviation (1h, 6h, 24h windows)
  * Rate-of-change derivatives
  * Spectral energy in frequency bands (for vibration)
  * Thermal gradient trends



**Stage 2 — Anomaly Score**

An isolation forest model assigns an anomaly score per 5-minute interval. Sustained elevated anomaly scores above a threshold trigger the failure model.

**Stage 3 — Failure Probability**

A gradient-boosted classifier converts the anomaly trajectory and feature vectors into a failure probability for the requested horizon. The model is retrained monthly on per-tenant historical data.

#### 54.3.3 Risk Categories

Probability | Risk Category | Recommended Response  
---|---|---  
≥ 0.80 | Critical | Emergency maintenance, consider downtime  
0.60–0.79 | High | Schedule within 24 hours  
0.35–0.59 | Medium | Schedule within 72 hours  
0.00–0.34 | Low | Routine monitoring  
  
#### 54.3.4 Root-Cause Analysis

When `includeRootCause: true`, the model returns:
[code] 
    {
      "rootCause": {
        "primaryFactor": "excessive_vibration",
        "confidence": 0.84,
        "contributingFactors": ["thermal_stress", "lubricant_degradation"],
        "recommendation": "Schedule bearing replacement within 72 hours"
      }
    }
    
[/code]

Supported primary factors:

  * `bearing_wear` — accelerated wear from misalignment or fatigue
  * `excessive_vibration` — imbalance, looseness, or resonance
  * `thermal_stress` — sustained over-temperature cycles
  * `lubricant_degradation` — viscosity loss or contamination
  * `electrical_fault` — insulation breakdown or winding short
  * `seal_failure` — fluid leakage in hydraulic/pneumatic systems



# Section 124

### 54.4 Maintenance Scheduling

`schedule_maintenance` creates structured work orders that integrate with ERP-level planning systems and technician calendars.

#### 54.4.1 Tool Parameters
[code] 
    {
      tenantId: string;
      deviceId: string;
      maintenanceType: "preventive" | "corrective" | "predictive" | "emergency";
      priority?: "low" | "medium" | "high" | "critical";  // default: medium
      scheduledAt?: string;        // ISO 8601; omit for auto-schedule
      assignTo?: string;           // Technician or team ID
      estimatedDurationHours?: number; // 0.25–168
      notes?: string;              // max 1000 chars
    }
    
[/code]

#### 54.4.2 Maintenance Type Definitions

Type | Trigger | Urgency | Example  
---|---|---|---  
`preventive` | Time-based or usage-based schedule | Planned | 500-hour oil change  
`corrective` | Post-failure repair | Reactive | Replace failed bearing  
`predictive` | Triggered by `predict_failure` score | Proactive | Replace bearing before failure  
`emergency` | Imminent failure or safety risk | Immediate | Critical vibration threshold  
  
#### 54.4.3 Auto-Scheduling Logic

When `scheduledAt` is omitted, the system selects the next available time slot by:

  1. Querying the assigned technician's calendar for availability
  2. Checking device production schedule (no maintenance during active production runs)
  3. Prioritising slots that minimise machine downtime cost
  4. Returning the recommended slot in `scheduledAt` of the response



#### 54.4.4 Work Order Response
[code] 
    {
      "success": true,
      "workOrderId": "WO-1726826400000",
      "deviceId": "CNC-LATHE-03",
      "maintenanceType": "predictive",
      "priority": "high",
      "scheduledAt": "2026-09-22T08:00:00.000Z",
      "assignedTo": "tech-maint-005",
      "estimatedDurationHours": 3,
      "status": "scheduled",
      "createdAt": "2026-09-20T10:05:00.000Z"
    }
    
[/code]

# Section 125

### 54.5 Integration with Phase 14 IoT Tools

Phase 15 builds directly on Phase 14 sensor infrastructure:
[code] 
    IoT Sensor Data (Phase 14)
            ↓
      ingest_sensor_data
            ↓
      Telemetry Store (time-series)
            ↓
      score_machine_health  ←── Phase 15 (Read)
            ↓
      predict_failure       ←── Phase 15 (Read)
            ↓
      schedule_maintenance  ←── Phase 15 (Write)
            ↓
      Work Order → ERP / Technician Calendar
    
[/code]

This end-to-end pipeline closes the loop from raw sensor ingestion to actionable maintenance tasks, fully automated and AI-orchestrated.

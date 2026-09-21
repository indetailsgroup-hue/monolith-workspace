---
num: 55
title: "Deployment, Governance & Persona Use Cases"
phase: 15
phase_label: "Phase 15"
phase_num: 15
mcp_tools: 1
status: in-progress
dependencies: "Phase 14 + All prior phases"
---

# Chapter 55: Phase 15 — Deployment, Governance, and Persona Use Cases

## Chapter 55: Phase 15 — Deployment, Governance, and Persona Use Cases

### 55.1 Governance Configuration

Phase 15 tools use the existing governance chain with ENTERPRISE/PROFESSIONAL tier enforcement:
[code] 
    // catalog.ts entries
    { name: "score_machine_health", requiredPlan: PlanTier.ENTERPRISE }
    { name: "predict_failure",      requiredPlan: PlanTier.ENTERPRISE }
    { name: "schedule_maintenance", requiredPlan: PlanTier.PROFESSIONAL }
    
[/code]

Rate limits (inheriting defaults):

  * Read tools (`score_machine_health`, `predict_failure`): 60 requests/minute per tenant
  * Write tool (`schedule_maintenance`): 30 requests/minute per tenant



PDPA compliance: No PII fields are required or stored by these tools. Device IDs and sensor readings are classified as operational telemetry, not personal data.

# Section 127

### 55.2 API Endpoints

Phase 15 adds the following REST API endpoints to the Monolith API:

#### POST /api/v1/predictive/machines/health-score

Request:
[code] 
    {
      "deviceIds": ["CNC-LATHE-03", "PRESS-01"],
      "timeWindowHours": 48,
      "includeSubsystems": true
    }
    
[/code]

Headers: `Authorization: Bearer <token>`, `X-Tenant-ID: tenant-factory-01`

Response: `200 OK` with health score payload.

#### POST /api/v1/predictive/machines/predict-failure

Request:
[code] 
    {
      "deviceId": "CNC-LATHE-03",
      "horizonHours": 168,
      "alertThreshold": 0.65,
      "includeRootCause": true
    }
    
[/code]

Response: `200 OK` with prediction payload.

#### POST /api/v1/predictive/maintenance/schedule

Request:
[code] 
    {
      "deviceId": "CNC-LATHE-03",
      "maintenanceType": "predictive",
      "priority": "high",
      "assignTo": "tech-maint-005",
      "estimatedDurationHours": 3
    }
    
[/code]

Response: `201 Created` with work order payload.

# Section 128

### 55.3 Performance Characteristics

Phase 15 tool latency benchmarks (100 concurrent, 2026-09-20):

Tool | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate  
---|---|---|---|---  
`score_machine_health` | 1.85 | 3.20 | 4.50 | 0%  
`predict_failure` | 2.10 | 3.80 | 5.10 | 0%  
`schedule_maintenance` | 1.60 | 2.90 | 3.80 | 0%  
  
All tools meet the SLA target of P99 < 10ms under 100 concurrent load.

# Section 129

### 55.4 Deployment Checklist

**Pre-deployment:**

  * [ ] ML model artifacts deployed to model serving infrastructure (`/models/failure-prediction/v3/`)
  * [ ] Feature store connection verified (Redis + time-series DB endpoint)
  * [ ] Technician calendar API credentials configured in `CALENDAR_API_KEY` env
  * [ ] ERP work order webhook endpoint set in `ERP_WEBHOOK_URL` env



**Post-deployment:**

  * [ ] Run `score_machine_health` health check on 3 known-nominal devices (expect score ≥ 85)
  * [ ] Run `predict_failure` on last week's data for 1 device that failed (verify probability ≥ 0.7)
  * [ ] Create 1 test work order via `schedule_maintenance` and confirm ERP receipt
  * [ ] Confirm governance chain ENTERPRISE tier enforcement rejects PROFESSIONAL requests



**Rollback:**

  * Phase 15 tools are additive; Phase 14 and earlier tools remain unaffected
  * Disable Phase 15 by removing `registerPredictiveMaintenance` call in `index.ts`



# Section 130

### 55.5 Persona Use Cases

**Plant Manager (ENTERPRISE)**
[code] 
    // Morning dashboard: score all production machines
    const health = await client.score_machine_health({
      tenantId: "factory-01",
      deviceIds: productionMachines,
      timeWindowHours: 8,
      includeSubsystems: true,
    });
    // Flag any machine below score 70 for review
    
[/code]

**Maintenance Supervisor (ENTERPRISE + PROFESSIONAL)**
[code] 
    // Predict failures across critical machines this week
    const prediction = await client.predict_failure({
      tenantId: "factory-01",
      deviceId: "CNC-LATHE-03",
      horizonHours: 168,
      includeRootCause: true,
    });
    // Auto-schedule if probability >= 0.65
    if (prediction.failureProbability >= 0.65) {
      await client.schedule_maintenance({
        tenantId: "factory-01",
        deviceId: "CNC-LATHE-03",
        maintenanceType: "predictive",
        priority: "high",
      });
    }
    
[/code]

**AI Agent (ENTERPRISE)**
[code] 
    // Autonomous predictive maintenance loop
    for (const device of await getActiveDevices(tenantId)) {
      const score = await client.score_machine_health({ tenantId, deviceIds: [device.id] });
      if (score.scores[0].healthScore < 60) {
        const prediction = await client.predict_failure({ tenantId, deviceId: device.id });
        if (prediction.failureProbability >= 0.6) {
          await client.schedule_maintenance({
            tenantId,
            deviceId: device.id,
            maintenanceType: "predictive",
            priority: prediction.riskCategory === "critical" ? "critical" : "high",
          });
        }
      }
    }
    
[/code]

# Section 131

### 55.6 ADR Reference

Phase 15 architecture decisions are captured in:

  * **ADR-021** — IoT & Edge Computing Architecture (sensor ingestion pipeline, edge fleet model, alert dispatch)



Future ADR needed:

  * **ADR-022** — Predictive Maintenance ML Model Governance (model versioning, retraining cadence, drift detection, tenant-specific model isolation)



# Section 132

### 55.7 Phase Summary

Phase 15 completes the **Sense → Analyse → Act** loop for Monolith's industrial IoT stack:

  * **Sense** (Phase 14): `ingest_sensor_data`, `query_sensor_history`, `configure_sensor_stream`
  * **Analyse** (Phase 15): `score_machine_health`, `predict_failure`
  * **Act** (Phase 15): `schedule_maintenance`



With 123 total MCP tools across 15 phases, Monolith now covers the full manufacturing operations lifecycle — from panel design and CNC production through supply chain, finance, HR, compliance, CRM, BI, IoT, and predictive maintenance — all accessible via a unified, governance-enforced AI tool registry.

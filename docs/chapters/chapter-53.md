---
num: 53
title: "Edge Device & Real-Time Alerting Module"
phase: "Phase 14"
phase_num: 14
mcp_tools: 3
status: complete
dependencies: "Phase 13"
---

# Chapter 53: Edge Device & Real-Time Alerting Module (Phase 14)  
  
## 53.1 Overview

The Edge Device & Real-Time Alerting module provides lifecycle management for edge computing nodes deployed on the factory floor, combined with a multi-channel alert delivery system. Together, they form the local intelligence layer that enables Monolith to operate with near-zero cloud latency for critical manufacturing events.

**Module:**`src/tools/edge-device.ts`

**Phase:** 14 — IoT & Edge Computing

**Tools:** 3 MCP tools (`register_edge_device`, `update_device_firmware`, `trigger_realtime_alert`)

**Plan Tier:** ENTERPRISE

# 53.2 Edge Device Fleet Architecture

## 53.2 Edge Device Fleet Architecture
[code] 
     Monolith Platform (Cloud)
      │
      │  MCP Tools (register / firmware / alert)
      │
      ▼
    Edge Device Fleet
      ├── Gateway (GW-4000)
      │     ├── MQTT Broker
      │     ├── Protocol Translation
      │     └── Local Storage (72h buffer)
      ├── Sensor Node (SN-200)
      │     ├── BLE Mesh
      │     └── Solar Powered
      ├── Edge Server (ES-8000)
      │     ├── GPU Inference (ONNX)
      │     └── Kubernetes Node
      ├── PLC Bridge (PB-500)
      │     ├── Modbus TCP / OPC-UA
      │     └── Ladder Logic
      └── Camera (CAM-V2)
            ├── 4K + Thermal
            └── Edge Object Detection
    
[/code]

### Device Class Capabilities

Device Class | Auto-provisioned Capabilities  
---|---  
`gateway` | mqtt_broker, protocol_translation, local_storage, edge_inference, vpn_tunnel  
`sensor_node` | temperature_sensing, vibration_sensing, ble_mesh, solar_powered  
`edge_server` | gpu_inference, container_runtime, nfs_storage, kubernetes_node  
`plc_bridge` | modbus_tcp, opc_ua, profinet, ethercat, ladder_logic  
`camera` | 4k_video, thermal_imaging, edge_object_detection, rtsp_stream  
  
# 53.3 Tool: `register_edge_device`

## 53.3 Tool: `register_edge_device`

Provisions a new edge device into the Monolith IoT fleet. Assigns a unique device ID, generates security credentials, and configures capability profiles automatically based on device class.

### Input Schema
[code] 
    {
      tenantId:    string;
      name:        string;         // Human-readable device name (max 100 chars)
      deviceClass: "gateway" | "sensor_node" | "edge_server" | "plc_bridge" | "camera";
      plant:       string;         // Plant/facility identifier
      zone?:       string;         // Zone within plant (optional)
      model?:      string;         // Hardware model override (auto-detected if omitted)
      tags?:       Record<string, string>;
    }
    
[/code]

### Return: `EdgeDevice`
[code] 
    interface EdgeDevice {
      deviceId:          string;
      tenantId:          string;
      name:              string;
      deviceClass:       DeviceClass;
      model:             string;        // e.g., "Monolith GW-4000"
      serialNumber:      string;
      firmwareVersion:   string;
      ipAddress:         string;
      macAddress:        string;
      location:          { plant: string; zone: string; rack?: string };
      capabilities:      string[];
      status:            DeviceStatus;  // "provisioned" on first registration
      lastSeenAt:        string;
      uptimeSeconds:     number;
      cpuUsagePercent:   number;
      memoryUsageMb:     number;
      storageUsedMb:     number;
      connectedSensors:  number;
      registeredAt:      string;
    }
    
[/code]

### Registration Workflow
[code] 
    // 1. Register gateway for Plant A
    const gw = await callTool("register_edge_device", {
      tenantId:    "tenant-acme",
      name:        "Plant-A Primary Gateway",
      deviceClass: "gateway",
      plant:       "Plant-A",
      zone:        "Zone-Control",
      tags:        { environment: "production", criticality: "high" },
    });
    
    const device = JSON.parse(gw.content[0].text).data;
    console.log(`Device ID:  ${device.deviceId}`);
    console.log(`Model:      ${device.model}`);
    console.log(`IP:         ${device.ipAddress}`);
    console.log(`Status:     ${device.status}`);       // "provisioned"
    console.log(`Capabilities: ${device.capabilities.join(", ")}`);
    // → "mqtt_broker, protocol_translation, local_storage, edge_inference, vpn_tunnel"
    
[/code]

# 53.4 Tool: `update_device_firmware`

## 53.4 Tool: `update_device_firmware`

Triggers an over-the-air (OTA) firmware update for an edge device with support for multiple deployment strategies and automatic rollback.
[code] 
    {
      tenantId:       string;
      deviceId:       string;           // Target device (single)
      toVersion:      string;           // Target firmware version (semver)
      channel?:       "stable" | "beta" | "lts" | "hotfix";    // default "stable"
      strategy?:      "immediate" | "rolling" | "scheduled" | "canary";  // default "rolling"
      scheduledAt?:   string;           // ISO 8601 (required when strategy="scheduled")
      forceUpdate?:   boolean;          // Skip compatibility check (default false)
      enableRollback?: boolean;         // Enable auto-rollback on failure (default true)
    }
    
[/code]

### Return: `FirmwareUpdate`
[code] 
    interface FirmwareUpdate {
      updateJobId:       string;
      deviceId:          string;
      tenantId:          string;
      fromVersion:       string;
      toVersion:         string;
      channel:           FirmwareChannel;
      strategy:          UpdateStrategy;
      status:            "pending" | "downloading" | "installing" | "verifying" | "completed" | "rolled_back" | "failed";
      progressPercent:   number;
      downloadedBytes:   number;
      totalBytes:        number;
      checksumVerified:  boolean;
      rollbackAvailable: boolean;
      estimatedMinutes:  number;
      startedAt?:        string;   // Present for non-scheduled
      scheduledAt?:      string;   // Present for scheduled strategy
      completedAt?:      string;
    }
    
[/code]

### Deployment Strategy Comparison

Strategy | When Used | Behavior  
---|---|---  
`immediate` | Critical hotfixes | Applies immediately; interrupts current workload  
`rolling` | Standard updates | Downloads in background; applies at next idle window  
`scheduled` | Planned maintenance | Queued until `scheduledAt` UTC time  
`canary` | Beta features | Applies to 5% of fleet first; monitors for errors  
  
### Rollback Mechanism
[code] 
    Update starts
        │
    Download + verify (checksum SHA-256)
        │
    Apply firmware
        │
        ├── Boot success ──► status = completed ✓
        │
        └── Boot failure
                  │
             rollbackAvailable = true?
                  │
                  ├── Yes → Revert to fromVersion → status = rolled_back
                  └── No  → Alert + manual intervention required
    
[/code]

# 53.5 Tool: `trigger_realtime_alert`

## 53.5 Tool: `trigger_realtime_alert`

Fires a real-time alert across multiple delivery channels (email, SMS, webhook, push, MQTT, PagerDuty, Slack) with deduplication, escalation tracking, and acknowledgement flow.
[code] 
    {
      tenantId:       string;
      name:           string;           // Alert rule name (max 100 chars)
      severity:       "info" | "warning" | "critical" | "emergency";
      condition:      string;           // Human-readable condition description
      channels:       AlertChannel[];   // At least one channel required
      deviceId?:      string;           // Source device (if sensor-triggered)
      sensorType?:    string;
      actualValue?:   number;
      thresholdValue?: number;
      message?:       string;           // Custom message override
      tags?:          Record<string, string>;
    }
    
    type AlertChannel = "email" | "sms" | "webhook" | "push" | "mqtt_alert" | "pagerduty" | "slack";
    
[/code]

### Return: `RealtimeAlert`
[code] 
    interface RealtimeAlert {
      alertId:         string;
      tenantId:        string;
      name:            string;
      severity:        AlertSeverity;
      condition:       string;
      deviceId?:       string;
      sensorType?:     string;
      actualValue?:    number;
      thresholdValue?: number;
      message:         string;          // Auto-generated if not overridden
      channels:        AlertChannel[];
      deliveredTo:     string[];        // Resolved endpoint identifiers
      status:          "open" | "acknowledged" | "resolved" | "suppressed";
      firedAt:         string;
      escalationLevel: number;          // 1=info/warn, 2=critical, 3=emergency
      deduplicationKey: string;         // Prevents duplicate alerts within 5-min window
    }
    
[/code]

### Escalation Matrix

Severity | escalationLevel | Auto-escalates to | SLA for Acknowledgement  
---|---|---|---  
`info` | 1 | — | 4 hours  
`warning` | 1 | `critical` after 30 min unacked | 1 hour  
`critical` | 2 | `emergency` after 15 min unacked | 15 minutes  
`emergency` | 3 | PagerDuty on-call + SMS | 5 minutes  
  
### Alert Lifecycle
[code] 
    trigger_realtime_alert
        │
     Create RealtimeAlert (status: "open")
        │
     Deliver to channels (email/SMS/webhook/push/MQTT/PagerDuty/Slack)
        │
        ├── deliveredTo[] populated
        │
        ├── Deduplication check (5-min window)
        │     └── Duplicate? → suppress → status: "suppressed"
        │
        └── Escalation timer starts
              │
              ├── Acknowledged? → status: "acknowledged"
              └── Timeout → escalate severity → new alert
    
[/code]

### Alert Pattern: Sensor Anomaly to Alert
[code] 
    // Autonomous anomaly → alert pipeline (typically via AI Agent)
    async function sensorAnomalyToAlert(
      tenantId: string,
      reading: SensorReading
    ): Promise<void> {
      if (!reading.isAnomaly || (reading.anomalyScore ?? 0) < 0.6) return;
    
      const severity = (reading.anomalyScore ?? 0) > 0.8 ? "critical" : "warning";
    
      await callTool("trigger_realtime_alert", {
        tenantId,
        name:           `${reading.sensorType} Anomaly — ${reading.deviceId}`,
        severity,
        condition:      `${reading.sensorType} = ${reading.value} ${reading.unit} (anomaly score: ${reading.anomalyScore?.toFixed(2)})`,
        channels:       severity === "critical"
                          ? ["email", "sms", "pagerduty"]
                          : ["email", "webhook"],
        deviceId:       reading.deviceId,
        sensorType:     reading.sensorType,
        actualValue:    reading.value,
        thresholdValue: SENSOR_THRESHOLDS[reading.sensorType],
      });
    }
    
[/code]

# 53.6 Unit Tests

## 53.6 Unit Tests
[code] 
    // src/tools/edge-device.test.ts — 45 tests passing
    
    describe("register_edge_device", () => {
      it("returns success=true with EdgeDevice data");
      it("assigns a unique deviceId");
      it("echoes tenantId in result");
      it("echoes name in result");
      it("echoes deviceClass in result");
      it("stores plant in location.plant");
      it("assigns capabilities array for gateway");
      it("assigns capabilities array for sensor_node");
      it("sets status to provisioned on registration");
      it("includes firmwareVersion, ipAddress, macAddress, serialNumber");
      it("includes numeric metrics: uptime, cpu, memory, storage, connectedSensors");
      it("includes registeredAt and lastSeenAt as ISO strings");
    });
    
    describe("update_device_firmware", () => {
      it("returns success=true with FirmwareUpdate data");
      it("echoes deviceId (single string) in result");
      it("echoes tenantId in result");
      it("sets fromVersion to existing version");
      it("echoes toVersion in result");
      it("uses channel=stable when specified");
      it("uses explicit channel=beta when specified");
      it("uses strategy=rolling when specified");
      it("uses explicit strategy=scheduled when specified");
      it("sets status=pending for scheduled strategy");
      it("sets status=downloading for non-scheduled strategy");
      it("includes rollbackAvailable=true");
      it("includes numeric fields: progressPercent, downloadedBytes, totalBytes, estimatedMinutes");
      it("includes updateJobId as non-empty string");
      it("scheduledAt present for scheduled strategy, absent for immediate");
    });
    
    describe("trigger_realtime_alert", () => {
      it("returns success=true with RealtimeAlert data");
      it("assigns a unique alertId");
      it("echoes tenantId in result");
      it("echoes name field in result");
      it("echoes condition field in result");
      it("echoes severity in result");
      it("echoes channels array in result");
      it("populates deliveredTo based on channels");
      it("sets status=open for new alert");
      it("sets escalationLevel=2 for critical severity");
      it("sets escalationLevel=3 for emergency severity");
      it("sets escalationLevel=1 for warning severity");
      it("sets escalationLevel=1 for info severity");
      it("includes message auto-generated from severity and condition");
      it("includes deduplicationKey as non-empty string");
      it("includes firedAt as ISO timestamp");
      it("stores optional deviceId when provided");
      it("stores optional sensorType and threshold values when provided");
    });
    
[/code]

# 53.7 Benchmark Results (Phase 14 Edge Device)

## 53.7 Benchmark Results (Phase 14 Edge Device)

Tool | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate  
---|---|---|---|---|---  
register_edge_device | 0.19 | 0.17 | 0.41 | 0.79 | 0%  
update_device_firmware | 0.16 | 0.14 | 0.35 | 0.66 | 0%  
trigger_realtime_alert | 0.22 | 0.20 | 0.47 | 0.91 | 0%  
  
_100 concurrent requests × 10 iterations per tool_

# 53.8 Phase 14 Complete Tool Summary

## 53.8 Phase 14 Complete Tool Summary

Tool | Category | Min Plan | STAGE_BUDGET Key  
---|---|---|---  
`ingest_sensor_data` | IoT Ingestion | ENTERPRISE | IOT_OPERATIONS  
`query_sensor_history` | IoT Analytics | ENTERPRISE | IOT_OPERATIONS  
`configure_sensor_stream` | IoT Config | ENTERPRISE | IOT_OPERATIONS  
`register_edge_device` | Edge Management | ENTERPRISE | EDGE_MANAGEMENT  
`update_device_firmware` | Edge Management | ENTERPRISE | EDGE_MANAGEMENT  
`trigger_realtime_alert` | Real-time Alerting | ENTERPRISE | IOT_OPERATIONS  
  
**Phase 14 total: 6 new MCP tools**

**Cumulative total (Phase 1–14): 120 MCP tools**

# 53.9 Integration with Other Phases

## 53.9 Integration with Other Phases
[code] 
    Phase 14 IoT ────────────────────────────────────┐
                                                      │
    ingest_sensor_data ──anomaly──► trigger_realtime_alert
             │                              │
             ▼                              ▼
    query_sensor_history          notify: email/SMS/PagerDuty
             │
             ▼
    get_bi_analytics (Phase 13) ──► create_bi_dashboard
             │
             ▼
    schedule_report_export ──► monthly_maintenance_report
             │
             ▼
    create_service_ticket (Phase 12 CRM) ── service follow-up
    
[/code]

# 53.10 Persona Mapping — Phase 14 Edge & Alerting

## 53.10 Persona Mapping — Phase 14 Edge & Alerting

Persona | Primary Tool | Use Case  
---|---|---  
System Administrator | `register_edge_device` + `update_device_firmware` | Fleet provisioning and OTA management  
Maintenance Engineer | `trigger_realtime_alert` + `query_sensor_history` | Incident response and root-cause  
Plant Manager | `trigger_realtime_alert` (channels: email, slack) | Executive alerts for critical events  
AI Agent | Full Phase 14 pipeline | Autonomous predictive maintenance  
Security Officer | `update_device_firmware` (hotfix channel) | Critical vulnerability patching  
Field Technician | `register_edge_device` (on-site provisioning) | New device onboarding at plant

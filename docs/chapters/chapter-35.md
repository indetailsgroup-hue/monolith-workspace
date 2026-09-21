---
num: 35
title: "Analytics Dashboard & Real-time Monitoring Tools"
phase: 6
phase_label: "Phase 6"
phase_num: 6
mcp_tools: 3
status: complete
dependencies: "Phase 5"
---

# Chapter 35: Phase 6 — Analytics Dashboard & Real-time Monitoring

## Chapter 35: Phase 6 — Analytics Dashboard & Real-time Monitoring

### 35.1 บทนำ

Phase 6 เป็น stretch goal หลัง 5-phase migration เสร็จสมบูรณ์ เน้นให้ managers และ operators มี self-service analytics platform ที่ configure ได้ผ่าน MCP tools โดยไม่ต้องพึ่ง developer

### 35.2 Module Overview

Module | Tools | ToolClass | Min Plan  
---|---|---|---  
Analytics Dashboard | create_dashboard | Write | PROFESSIONAL  
Analytics Dashboard | manage_dashboard_widget | Write | PROFESSIONAL  
Analytics Dashboard | get_dashboard_data | Read | STARTER  
Real-time Monitoring | configure_monitor | Write | ENTERPRISE  
Real-time Monitoring | get_live_metrics | Read | PROFESSIONAL  
Real-time Monitoring | manage_alert_rule | Write | ENTERPRISE  
  
### 35.3 Analytics Dashboard Module

#### 35.3.1 create_dashboard

สร้าง analytics dashboard ใหม่พร้อม configurable grid layout

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
name | string | Yes | Dashboard name (1-100 chars)  
description | string | No | Description (max 500 chars)  
columns | number | No | Grid columns 1-12 (default: 4)  
rowHeight | number | No | Row height pixels 50-500 (default: 120)  
widgets | array | No | Initial widget configurations  
tenantId | string | Auto | Injected by governance  
  
**Widget Types:**

Type | Description | Use Case  
---|---|---  
`kpi_card` | Single metric card | OEE %, throughput count  
`line_chart` | Time series line | Trend over time  
`bar_chart` | Categorical bars | Comparison across categories  
`gauge` | Radial gauge | Utilization %  
`table` | Data table | Detailed records  
`heatmap` | Color matrix | Shift performance by day  
  
**Response:**
[code] 
    {
      "success": true,
      "dashboardId": "dash-1726697000-abc123",
      "name": "Production Floor Overview",
      "widgetCount": 4,
      "layout": { "columns": 4, "rowHeight": 120 },
      "createdAt": "2026-09-19T10:30:00.000Z"
    }
    
[/code]

#### 35.3.2 manage_dashboard_widget

จัดการ widgets ภายใน dashboard — เพิ่ม, อัปเดต, ลบ, หรือเรียงลำดับ

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
dashboardId | string | Yes | Target dashboard ID  
action | enum | Yes | `add` / `update` / `remove` / `reorder`  
widgetId | string | Conditional | Required for update/remove  
widget | object | Conditional | Config for add/update  
order | string[] | Conditional | New widget order for reorder  
  
**Widget Configuration (for add/update):**

Field | Type | Description  
---|---|---  
type | enum | Widget visualization type  
title | string | Display title  
metricSource | string | Metric identifier (e.g. `oee`, `throughput`)  
position | object | `{ row, col, width, height }` in grid  
refreshIntervalSec | enum | `5`, `15`, `30`, `60`, `0` (manual)  
thresholds | object | Green/yellow/red zones `{ min, max }`  
  
**Threshold Configuration Example:**
[code] 
    {
      "thresholds": {
        "green":  { "min": 85, "max": 100 },
        "yellow": { "min": 70, "max": 84.9 },
        "red":    { "min": 0,  "max": 69.9 }
      }
    }
    
[/code]

#### 35.3.3 get_dashboard_data

ดึงข้อมูลทุก widget ของ dashboard ในครั้งเดียว พร้อม computed values, sparklines, และ threshold status

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
dashboardId | string | Yes | Dashboard ID  
timeRange | enum | No | `1h`, `8h`, `24h`, `7d`, `30d` (default: 24h)  
forceRefresh | boolean | No | Bypass cache (default: false)  
  
**Response per Widget:**
[code] 
    {
      "widgetId": "wgt-dash-abc-0",
      "value": 84.5,
      "unit": "%",
      "sparkline": [82.1, 83.4, 84.0, 85.2, 84.5, ...],
      "thresholdStatus": "green",
      "lastUpdated": "2026-09-19T10:30:00.000Z"
    }
    
[/code]

### 35.4 Real-time Monitoring Module

#### 35.4.1 configure_monitor

สร้างหรือจัดการ monitoring configuration สำหรับ metric stream

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
action | enum | Yes | `create` / `update` / `delete` / `list`  
monitorId | string | Conditional | Required for update/delete  
name | string | Conditional | Monitor name  
metricName | string | Conditional | Metric identifier  
metricType | enum | Conditional | `counter`, `gauge`, `histogram`, `summary`  
collectionIntervalSec | number | No | Collection interval 5-300s (default: 30)  
retentionDays | number | No | Data retention 1-365 days (default: 30)  
aggregationMethod | enum | No | `avg`, `sum`, `min`, `max`, `p50`, `p95`, `p99`  
enabled | boolean | No | Enable/disable (default: true)  
  
**Metric Types:**

Type | Description | Example  
---|---|---  
`counter` | Monotonically increasing | Total units produced  
`gauge` | Current value | OEE %, temperature  
`histogram` | Distribution buckets | Response time distribution  
`summary` | Quantile computation | Cycle time percentiles  
  
#### 35.4.2 get_live_metrics

ดึง live metrics แบบ batch query พร้อม history window, min/max/avg, และ trend direction

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
metricNames | string[] | Yes | Metric names (1-20 items)  
windowMinutes | number | No | History window 1-1440 min (default: 60)  
includeSparkline | boolean | No | Include data points (default: true)  
  
**Response per Metric:**
[code] 
    {
      "metricName": "oee",
      "current": 84.5,
      "min": 78.2,
      "max": 91.3,
      "avg": 83.7,
      "trend": "up",
      "dataPoints": 20,
      "collectedAt": "2026-09-19T10:30:00.000Z"
    }
    
[/code]

**Trend Detection:**

  * `up` — recent 5-point avg > older 5-point avg × 1.02
  * `down` — recent 5-point avg < older 5-point avg × 0.98
  * `stable` — within ±2% band



#### 35.4.3 manage_alert_rule

จัดการ alert rules พร้อม conditions และ automated actions

**Parameters:**

Parameter | Type | Required | Description  
---|---|---|---  
action | enum | Yes | `create` / `update` / `delete` / `list`  
ruleId | string | Conditional | Required for update/delete  
name | string | Conditional | Alert rule name  
metricName | string | Conditional | Metric to watch  
conditionType | enum | Conditional | `threshold`, `rate_of_change`, `anomaly_detection`, `absence`  
condition | object | Conditional | Condition parameters  
severity | enum | Conditional | `info`, `warning`, `critical`  
actions | array | Conditional | Actions on trigger  
cooldownMinutes | number | No | Cooldown 0-1440 min (default: 15)  
enabled | boolean | No | Enable/disable (default: true)  
  
**Condition Types:**

Type | Parameters | Description  
---|---|---  
`threshold` | `operator` + `value` | Fire when metric crosses threshold  
`rate_of_change` | `operator` + `value` + `rateWindow` | Fire when rate of change exceeds limit  
`anomaly_detection` | N/A | ML-based anomaly detection  
`absence` | `absenceDuration` | Fire when metric is absent for duration  
  
**Alert Actions:**

Action Type | Target | Description  
---|---|---  
`notify` | Channel ID | Send notification to Slack/Teams/LINE  
`auto_scale` | Service name | Trigger auto-scaling  
`create_incident` | Template ID | Create incident ticket  
`webhook` | URL | Call external webhook  
  
**Example Alert Rule:**
[code] 
    {
      "name": "OEE Below Target",
      "metricName": "oee",
      "conditionType": "threshold",
      "condition": { "operator": "lt", "value": 75 },
      "severity": "warning",
      "actions": [\
        { "type": "notify", "target": "#production-alerts" },\
        { "type": "create_incident", "target": "tpl-oee-low" }\
      ],
      "cooldownMinutes": 30
    }
    
[/code]

### 35.5 Data Flow Architecture
[code] 
    Metric Sources                Real-time Monitoring              Analytics Dashboard
    ┌──────────────┐          ┌─────────────────────┐          ┌───────────────────┐
    │ Machine PLC  │──────────│ configure_monitor    │          │ create_dashboard  │
    │ IoT Sensors  │──metric──│ get_live_metrics     │──data──▶│ manage_widget     │
    │ MES System   │  stream  │ manage_alert_rule    │          │ get_dashboard_data│
    │ ERP Events   │          └─────────┬───────────┘          └───────┬───────────┘
    └──────────────┘                    │                               │
                                        ▼                               ▼
                               ┌─────────────────┐            ┌─────────────────┐
                               │ Alert Engine    │            │ Widget Renderer │
                               │ - Threshold     │            │ - KPI Cards     │
                               │ - Rate Change   │            │ - Line Charts   │
                               │ - Anomaly ML    │            │ - Gauges        │
                               │ - Absence       │            │ - Heatmaps      │
                               └─────────┬───────┘            └─────────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ Action Dispatch │
                               │ - Notify        │
                               │ - Auto Scale    │
                               │ - Incident      │
                               │ - Webhook       │
                               └─────────────────┘
    
[/code]

### 35.6 Metric Registry

Default metric sources ที่ module รองรับ:

Metric | Base Value | Unit | Category  
---|---|---|---  
oee | 82 | % | Production  
throughput | 145 | units/hr | Production  
defect_rate | 2.3 | % | Quality  
availability | 94 | % | Production  
performance | 88 | % | Production  
quality | 97 | % | Quality  
cycle_time | 12.5 | min | Production  
downtime_minutes | 45 | min | Maintenance  
scrap_rate | 1.8 | % | Quality  
energy_kwh | 320 | kWh | Utility  
labor_utilization | 78 | % | Workforce  
on_time_delivery | 91 | % | Logistics  
cpu_usage | 42 | % | Infrastructure  
memory_usage | 68 | % | Infrastructure  
disk_io | 230 | MB/s | Infrastructure  
network_mbps | 85 | Mbps | Infrastructure  
active_connections | 120 | count | Infrastructure  
queue_depth | 8 | count | Infrastructure  
error_rate | 0.4 | % | Infrastructure  
latency_ms | 35 | ms | Infrastructure  
  
### 35.7 Governance Integration

Phase 6 tools ถูก register ใน governance catalog ดังนี้:

Tool | ToolClass | PDPA Scope | Min Plan | Min Role  
---|---|---|---|---  
create_dashboard | Write | analytics_data | PROFESSIONAL | OPERATOR  
manage_dashboard_widget | Write | analytics_data | PROFESSIONAL | OPERATOR  
get_dashboard_data | Read | analytics_data | STARTER | VIEWER  
configure_monitor | Write | analytics_data | ENTERPRISE | OPERATOR  
get_live_metrics | Read | analytics_data | PROFESSIONAL | VIEWER  
manage_alert_rule | Write | analytics_data | ENTERPRISE | OPERATOR  
  
### 35.8 Unit Test Coverage

**analytics-dashboard.test.ts (12 tests):**

Test | Description  
---|---  
create_dashboard — basic | สร้าง dashboard พร้อม name + layout  
create_dashboard — with widgets | สร้างพร้อม initial widgets  
manage_widget — add | เพิ่ม widget เข้า dashboard  
manage_widget — add with thresholds | เพิ่มพร้อม threshold zones  
manage_widget — update | อัปเดต widget config  
manage_widget — remove | ลบ widget  
manage_widget — reorder | เรียงลำดับ widgets ใหม่  
manage_widget — dashboard not found | Error handling  
manage_widget — widget not found | Error handling  
get_dashboard_data — basic | ดึงข้อมูลทุก widget  
get_dashboard_data — with time range | ระบุ time range  
get_dashboard_data — not found | Error handling  
  
**realtime-monitoring.test.ts (13 tests):**

Test | Description  
---|---  
configure_monitor — create | สร้าง monitor configuration  
configure_monitor — update | อัปเดต monitor  
configure_monitor — delete | ลบ monitor  
configure_monitor — list | List monitors by tenant  
configure_monitor — missing fields | Validation error  
configure_monitor — not found | Error handling  
get_live_metrics — single | ดึง metric เดียว  
get_live_metrics — batch | ดึงหลาย metrics  
get_live_metrics — no sparkline | Exclude sparkline data  
manage_alert_rule — create | สร้าง alert rule  
manage_alert_rule — update | อัปเดต rule  
manage_alert_rule — delete | ลบ rule  
manage_alert_rule — list | List rules by tenant  
  
### 35.9 สรุป Build Statistics
[code] 
    Total MCP Tools:  71 (+ read_skill = 72 catalog entries)
    Phase 1-3:        47 tools
    Phase 4:           9 tools (Notification + Reporting + Backup)
    Phase 5:           9 tools (Organization + Culture + CI/CD)
    Phase 6:           6 tools (Analytics Dashboard + Real-time Monitoring)
    Governance Catalog: 72 entries
    
    Build Results:
      tsc --noEmit:     0 errors
      ESLint:           0 errors
      Vitest:           548 passed | 1 skipped | 25 test files
    
[/code]

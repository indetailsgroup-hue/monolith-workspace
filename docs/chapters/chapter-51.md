---
num: 51
title: "BI Dashboard & Reporting Module"
phase: 13
phase_label: "Phase 13"
phase_num: 13
mcp_tools: 3
status: complete
dependencies: "Phase 6, Phase 12"
---

# Chapter 51: BI Dashboard & Reporting Module (Phase 13)  
  
## 51.1 Overview

The **BI Dashboard & Reporting** module is the presentation and scheduling layer of Phase 13. It enables teams to create interactive dashboards with real-time widget binding, schedule automated report exports to multiple destinations, and retrieve AI-augmented analytics with 14-day forecasts and anomaly detection.

Three MCP tools are provided:

Tool | ToolClass | Plan  
---|---|---  
`create_bi_dashboard` | Write_Tool | Professional  
`schedule_report_export` | Write_Tool | Professional  
`get_bi_analytics` | Read_Tool | Professional  
  
# 51.2 Architecture

## 51.2 Architecture
[code] 
    ┌──────────────────────────────────────────────────────────────┐
    │                BI Dashboard & Reporting                       │
    │                                                              │
    │  ┌─────────────────┐   ┌──────────────────┐                 │
    │  │  create_bi_      │   │ schedule_report_  │                │
    │  │  dashboard       │   │ export            │                │
    │  │  (widget layout) │   │ (cron scheduler)  │                │
    │  └────────┬─────────┘   └────────┬─────────┘                │
    │           │                      │                           │
    │  ┌────────▼──────────────────────▼─────────────────────┐    │
    │  │              Dashboard Runtime Engine                │    │
    │  │  RefreshInterval: realtime | 1m | 5m | 15m | 1h    │    │
    │  │  ShareToken: public URL generation                   │    │
    │  └────────────────────────┬────────────────────────────┘    │
    │                            │                                 │
    │  ┌─────────────────────────▼──────────────────────────┐     │
    │  │              get_bi_analytics                       │     │
    │  │   KPIs │ Trends │ 14-Day Forecast │ Anomalies      │     │
    │  └────────────────────────────────────────────────────┘     │
    └──────────────────────────────────────────────────────────────┘
            │                    │                     │
       ┌────▼────┐         ┌─────▼────┐         ┌─────▼─────┐
       │ Email   │         │   S3     │         │   SFTP    │
       │ Deliver │         │ Bucket   │         │  Webhook  │
       └─────────┘         └──────────┘         └───────────┘
    
[/code]

# 51.3 Tool Reference

## 51.3 Tool Reference

### create_bi_dashboard
[code] 
    // Input
    {
      tenantId:        string,
      name:            string,
      description?:    string,
      widgets: {
        type:       "line_chart" | "bar_chart" | "pie_chart" | "kpi_card" |
                    "data_table" | "heat_map" | "scatter_plot" | "funnel" | "gauge" | "text",
        title:      string,
        dataSource?: string,    // default: "primary_warehouse"
        query?:      string,
        position?:   { x, y, w, h },
      }[],
      refreshInterval?: "realtime" | "1m" | "5m" | "15m" | "1h" | "6h" | "24h",
      isPublic?:       boolean,   // Generates shareToken if true
      tags?:           string[],
    }
    
    // Output
    {
      success: true,
      dashboard: {
        dashboardId:     string,
        widgets:         DashboardWidget[],
        refreshInterval: string,
        isPublic:        boolean,
        shareToken?:     string,
        viewCount:       number,
        createdAt:       string,
      },
      shareUrl: string | null,    // https://bi.monolith.app/share/<token>
      message: string,
    }
    
[/code]

### schedule_report_export
[code] 
    // Input
    {
      tenantId:       string,
      dashboardId:    string,
      reportName:     string,
      format:         "pdf" | "xlsx" | "csv" | "json",
      destination:    "email" | "s3" | "sftp" | "webhook",
      cronExpression: string,         // e.g. "0 6 * * 1" = Monday 06:00
      destinationConfig?: {
        recipients?: string[],        // email
        bucket?:     string,          // S3
        prefix?:     string,          // S3 key prefix
        host?:       string,          // SFTP
        path?:       string,          // SFTP path
        url?:        string,          // Webhook URL
      },
      enabled?: boolean,
    }
    
    // Output
    {
      success: true,
      schedule: {
        scheduleId:    string,
        format:        string,
        destination:   string,
        cronExpression: string,
        nextRunAt:     string,
        enabled:       boolean,
      },
      message: string,
    }
    
[/code]

### get_bi_analytics
[code] 
    // Input
    {
      tenantId:         string,
      periodDays?:      number,   // 1–365 (default: 30)
      metrics?:         string[], // Specific metrics (empty = all)
      includeForecast?:  boolean,  // 14-day revenue forecast (default: true)
      includeAnomalies?: boolean,  // Anomaly detection (default: true)
      groupBy?:         "day" | "week" | "month",
    }
    
    // Output
    {
      success: true,
      analytics: {
        kpis:       { name, value, unit, trend, trendDirection, target, targetMet }[],
        trends:     { date, value }[],          // periodDays data points
        forecast:   { date, value, lowerBound, upperBound, confidence }[],  // 14 points
        anomalies:  { date, metric, value, expected, severity }[],
        topMetrics: Record<string, number>,
        periodStart: string,
        periodEnd:   string,
      },
      summary: { kpiCount, kpisMeetTarget, anomalyCount, forecastDays },
    }
    
[/code]

# 51.4 Widget Type Catalogue

## 51.4 Widget Type Catalogue

Widget | Best For | Data Source  
---|---|---  
`line_chart` | Revenue trends, time-series | Warehouse time-series table  
`bar_chart` | Category comparison, production by dept | Aggregated GROUP BY  
`pie_chart` | Status/mix distribution | COUNT by category  
`kpi_card` | Single headline metric | SUM/AVG scalar query  
`data_table` | Top customer list, open orders | Direct table SELECT  
`heat_map` | OEE by machine × shift, demand by weekday/hour | 2D aggregation  
`scatter_plot` | Cycle time vs defect rate, cost vs quality | Correlated metrics  
`funnel` | Sales pipeline, quote-to-order conversion | Stage COUNT  
`gauge` | Real-time OEE, SLA health % | Real-time metric query  
`text` | Annotations, KPI context, narrative | Static text  
  
# 51.5 KPI Metrics Included in get_bi_analytics

## 51.5 KPI Metrics Included in get_bi_analytics

KPI | Unit | Target  
---|---|---  
Total Revenue | THB | 5,000,000/month  
Production OEE | % | ≥ 85%  
Orders Completed | count | ≥ 350/month  
Avg Cycle Time | minutes | ≤ 20 min  
Customer Satisfaction | /5 | ≥ 4.5  
Material Waste | % | ≤ 5%  
  
The 14-day forecast uses a linear trend model with ±12% confidence interval (95% confidence level).

# 51.6 Anomaly Detection

## 51.6 Anomaly Detection

The `get_bi_analytics` anomaly engine flags metrics that deviate more than **2 standard deviations** from their 30-day rolling mean:
[code] 
    Anomaly severity classification:
      low    → 2.0–2.5σ deviation
      medium → 2.5–3.5σ deviation
      high   → > 3.5σ deviation
    
[/code]

Phase 13 demo data includes one built-in anomaly: cycle_time spike to 31.2 min against expected 18.3 min (high severity).

# 51.7 Report Export Schedule Examples

## 51.7 Report Export Schedule Examples
[code] 
    # Daily revenue report to S3 at 02:00
    cronExpression: "0 2 * * *"
    format: "csv"
    destination: "s3"
    
    # Weekly executive PDF emailed every Monday at 06:00
    cronExpression: "0 6 * * 1"
    format: "pdf"
    destination: "email"
    
    # Monthly compliance export on the 1st at midnight
    cronExpression: "0 0 1 * *"
    format: "xlsx"
    destination: "sftp"
    
    # Bi-hourly webhook push for real-time ops monitoring
    cronExpression: "0 */2 * * *"
    format: "json"
    destination: "webhook"
    
[/code]

# 51.8 Unit Tests

## 51.8 Unit Tests
[code] 
    src/tools/bi-dashboard.test.ts — 16 test cases
    
    create_bi_dashboard:
      ✓ registers the tool
      ✓ creates dashboard with multiple widget types
      ✓ creates public dashboard with share token
      ✓ creates private dashboard without share URL
      ✓ supports heat_map widget type
      ✓ includes confirmation message
    
    schedule_report_export:
      ✓ registers the tool
      ✓ schedules PDF report to email
      ✓ schedules XLSX report to S3
      ✓ includes nextRunAt timestamp
      ✓ includes confirmation message with format and destination
    
    get_bi_analytics:
      ✓ registers the tool
      ✓ returns KPIs for 30-day window
      ✓ includes 14-day forecast by default
      ✓ excludes forecast when includeForecast=false
      ✓ excludes anomalies when includeAnomalies=false
      ✓ returns trend data matching periodDays
      ✓ includes topMetrics object
      ✓ includes periodStart and periodEnd
    
[/code]

# 51.9 Benchmark Results (Phase 13 BI Dashboard)

## 51.9 Benchmark Results (Phase 13 BI Dashboard)

Tool | P50 (ms) | P95 (ms) | P99 (ms) | Error Rate  
---|---|---|---|---  
create_bi_dashboard | 0.16 | 0.38 | 0.75 | 0%  
schedule_report_export | 0.14 | 0.33 | 0.69 | 0%  
get_bi_analytics | 0.22 | 0.51 | 0.98 | 0%  
  
# 51.10 Persona Mapping — Phase 13 BI Dashboard

## 51.10 Persona Mapping — Phase 13 BI Dashboard

Persona | Tool Used | Use Case  
---|---|---  
Operations Director | `create_bi_dashboard` + `get_bi_analytics` | Executive KPI board with revenue forecast  
Data Analyst | `get_bi_analytics` | Drill into anomaly details for root-cause analysis  
Finance Manager | `schedule_report_export` (PDF→email, weekly) | Automated weekly P&L report delivery  
System Administrator | `schedule_report_export` (CSV→S3) | Nightly data lake export for compliance archive  
AI Agent | `get_bi_analytics` + `query_warehouse_data` | Autonomous insight generation and alerting

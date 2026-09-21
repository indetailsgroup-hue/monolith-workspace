---
num: 50
title: "Data Warehouse Integration Module"
phase: 13
phase_label: "Phase 13"
phase_num: 13
mcp_tools: 3
status: complete
dependencies: "Phase 6, Phase 12"
---

# Chapter 50: Data Warehouse Integration Module (Phase 13)  
  
## 50.1 Overview

Phase 13 introduces the **BI & Reporting** module — Monolith's first integrated business intelligence layer. The Data Warehouse Integration module connects Monolith's operational databases to analytical engines (BigQuery, Redshift, Snowflake, ClickHouse, PostgreSQL), enabling cross-tenant analytics, scheduled schema synchronisation, and governed SQL query execution.

The module exposes three MCP tools:

Tool | ToolClass | Plan  
---|---|---  
`connect_data_warehouse` | Write_Tool | Enterprise  
`query_warehouse_data` | Read_Tool | Enterprise  
`sync_warehouse_schema` | Write_Tool | Enterprise  
  
### Design Goals

  * **Multi-engine support:** abstract over BigQuery, Redshift, Snowflake, ClickHouse, PostgreSQL behind a unified connection model
  * **Query safety:** enforce SELECT-only execution — DML (`INSERT`, `UPDATE`, `DELETE`, `DROP`) is rejected at parse time
  * **Governed sync:** incremental (CDC), full_refresh, and append_only modes with per-table row-count and size reporting
  * **Credential security:** warehouse credentials encrypted with AES-256-GCM at rest; service-account keys transmitted as base64 over TLS 1.3



# 50.2 Architecture

## 50.2 Architecture
[code] 
    ┌─────────────────────────────────────────────────────────────┐
    │                    Monolith MCP Server                       │
    │  ┌──────────────────────────────────────────────────────┐   │
    │  │           Data Warehouse MCP Tools                   │   │
    │  │  connect_data_warehouse │ query_warehouse_data        │   │
    │  │  sync_warehouse_schema                               │   │
    │  └───────────────────┬──────────────────────────────────┘   │
    │                      │ Governance Chain Middleware           │
    │  ┌───────────────────▼──────────────────────────────────┐   │
    │  │           Connection Registry (per-tenant)           │   │
    │  │   connectionId → { type, host, port, encrypted_creds}│   │
    │  └───────────────────┬──────────────────────────────────┘   │
    └──────────────────────┼──────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────────┐
            ▼              ▼                  ▼
       ┌─────────┐   ┌──────────┐     ┌────────────┐
       │ BigQuery│   │Snowflake │     │ClickHouse  │
       │ Redshift│   │(port 443)│     │ PostgreSQL │
       └─────────┘   └──────────┘     └────────────┘
    
[/code]

**Connection lifecycle:**

  1. `connect_data_warehouse` → creates encrypted connection record, runs connectivity test, returns `connectionId`
  2. `query_warehouse_data` → resolves connection by `connectionId`, enforces SELECT-only, executes with timeout, returns paginated results
  3. `sync_warehouse_schema` → resolves connection, runs CDC delta or full_refresh, reports per-table metrics



# 50.3 Tool Reference

## 50.3 Tool Reference

### connect_data_warehouse
[code] 
    // Input
    {
      tenantId:       string,                    // Tenant identifier
      name:           string,                    // Human-readable connection name
      warehouseType:  "bigquery" | "redshift" | "snowflake" | "clickhouse" | "postgresql",
      host?:          string,                    // Hostname (auto-detected if omitted)
      database?:      string,                    // Target database
      schema?:        string,                    // Default schema (default: "public")
      credentials?: {
        username?:       string,
        password?:       string,
        serviceAccount?: string,                 // base64 JSON service account (BigQuery)
        accountId?:      string,                 // Snowflake account ID
      },
      testConnection?: boolean,                  // Run connectivity test (default: true)
    }
    
    // Output
    {
      success: true,
      connection: {
        connectionId:  string,                   // e.g. "wh-1748765432-a3b2c"
        warehouseType: string,
        status:        "connected" | "disconnected",
        latencyMs:     number,
        createdAt:     string,
        ...
      },
      message: string
    }
    
[/code]

### query_warehouse_data
[code] 
    // Input
    {
      tenantId:     string,
      connectionId: string,                      // From connect_data_warehouse
      sql:          string,                      // SELECT / WITH only — DML rejected
      parameters?:  Record<string, unknown>,     // Named query parameters
      page?:        number,                      // 1-indexed (default: 1)
      pageSize?:    number,                      // 1–1000 (default: 100)
      timeout?:     number,                      // Query timeout in seconds (default: 60)
    }
    
    // Output
    {
      success: true,
      result: {
        queryId:         string,
        columns:         { name: string, type: string, nullable: boolean }[],
        rows:            Record<string, unknown>[],
        totalRows:       number,
        page:            number,
        pageSize:        number,
        executionTimeMs: number,
        bytesProcessed:  number,
        cacheHit:        boolean,
        executedAt:      string,
      }
    }
    
[/code]

### sync_warehouse_schema
[code] 
    // Input
    {
      tenantId:     string,
      connectionId: string,
      tables:       string[],                    // Tables to sync (min 1)
      mode?:        "incremental" | "full_refresh" | "append_only",  // default: "incremental"
      schedule?:    string,                      // Cron expression for recurring sync
      parallelism?: number,                      // Concurrent workers 1–8 (default: 4)
    }
    
    // Output
    {
      success: true,
      syncResult: {
        syncJobId:     string,
        mode:          string,
        tables:        { tableName, rowsInserted, rowsUpdated, rowsDeleted, sizeBytes, status }[],
        totalRowsSynced: number,
        totalSizeBytes:  number,
        durationMs:      number,
        status:          "completed" | "partial" | "failed",
        errorCount:      number,
      },
      summary: { tablesSync, totalRows, sizeMB, durationSec }
    }
    
[/code]

# 50.4 Sync Mode Comparison

## 50.4 Sync Mode Comparison

Mode | CDC Required | Use Case | Row Impact  
---|---|---|---  
`incremental` | Yes | Daily/hourly delta updates | INSERT + UPDATE only  
`full_refresh` | No | Initial load, schema changes | DROP + recreate + INSERT all  
`append_only` | No | Immutable event tables (logs, audit) | INSERT only — no dedup  
  
**Incremental sync prerequisites:**

  * Source table must have a watermark column (`updated_at`, `created_at`, or `sequence_id`)
  * Source database user must have `SELECT` on `information_schema` for schema introspection



# 50.5 Query Safety Controls

## 50.5 Query Safety Controls

  1. **SQL parse-time enforcement:**`sql.trim().toUpperCase().startsWith("SELECT|WITH")` — rejects all DML
  2. **Statement terminator injection:**`;` is stripped and a single statement limit is applied
  3. **Timeout hard cap:** Max 300 seconds; default 60 seconds per query
  4. **Row limit:**`pageSize` capped at 1,000 rows per response; `totalRows` reflects full count
  5. **Byte scan limit (BigQuery/Snowflake):** configurable `maxBytesScanned` prevents runaway cost



# 50.6 Unit Tests

## 50.6 Unit Tests
[code] 
    src/tools/data-warehouse.test.ts — 15 test cases
    
    connect_data_warehouse:
      ✓ registers the tool
      ✓ returns connected status for bigquery
      ✓ returns connected status for snowflake
      ✓ skips test when testConnection=false
      ✓ includes connectionId and latencyMs
      ✓ supports postgresql type
    
    query_warehouse_data:
      ✓ registers the tool
      ✓ executes a valid SELECT query
      ✓ executes a WITH (CTE) query
      ✓ rejects non-SELECT queries
      ✓ returns pagination metadata
      ✓ includes execution stats
    
    sync_warehouse_schema:
      ✓ registers the tool
      ✓ syncs tables in incremental mode
      ✓ syncs tables in full_refresh mode
      ✓ returns summary statistics
      ✓ includes syncJobId
    
[/code]

# 50.7 Integration Points

## 50.7 Integration Points

System | Integration | Detail  
---|---|---  
Phase 11 Audit Trail | `sync_warehouse_schema` logs sync events | SHA-256 chained audit record per sync job  
Governance Chain | All tools enforce tenant isolation | `tenantId` scoped — cross-tenant query rejected  
Phase 6 Dashboard | BI dashboards query via `connectionId` | `query_warehouse_data` as data source backend  
Phase 13 BI Dashboard | `create_bi_dashboard` binds to `connectionId` | Warehouse as primary data source  
  
# 50.8 Benchmark Results (Phase 13)

## 50.8 Benchmark Results (Phase 13)

Tool | P50 (ms) | P95 (ms) | P99 (ms) | 100 Concurrent  
---|---|---|---|---  
connect_data_warehouse | 0.18 | 0.42 | 0.81 | Zero errors  
query_warehouse_data | 0.21 | 0.49 | 0.93 | Zero errors  
sync_warehouse_schema | 0.24 | 0.55 | 1.02 | Zero errors  
  
All Phase 13 tools pass the `<2ms P99` SLA target under 100 concurrent requests.

# 50.9 Persona Mapping — Phase 13 Data Warehouse

## 50.9 Persona Mapping — Phase 13 Data Warehouse

Persona | Tool Used | Use Case  
---|---|---  
Data Engineer | `connect_data_warehouse` | Register new BigQuery project for analytics  
Data Analyst | `query_warehouse_data` | Run ad-hoc SQL over production data  
Operations Director | `sync_warehouse_schema` | Schedule nightly full refresh of KPI tables  
AI Agent (GeminiAgentLoop) | `query_warehouse_data` | Retrieve aggregated metrics for dashboard generation

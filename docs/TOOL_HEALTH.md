# Tool Health & Wear Tracking System

> **Version:** 1.0.0 (D6 Release)
> **Schema:** `monolith-factory-tooling (v1)`
> **Status:** Production Ready

## Overview

The Tool Health system tracks CNC tool wear based on actual G-code operations. It provides:

- **Wear Calculation**: Material-weighted depth tracking
- **Health Status**: OK / NEARING_LIMIT / OVER_LIMIT
- **UI Feedback**: Non-blocking warnings in CNC Generate panel

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   G-code Gen    │────>│   Observer      │────>│   IndexedDB     │
│   (D3 Pipeline) │     │   (D6-B)        │     │   (D6-C)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌─────────────────┐             │
                        │   Query Layer   │<────────────┘
                        │   (D6-E.1)      │
                        └─────────────────┘
                                │
                        ┌─────────────────┐
                        │   UI Surface    │
                        │   (D6-E.2)      │
                        └─────────────────┘
```

## IndexedDB Schema

**Database:** `monolith-factory-tooling`
**Version:** 1

### Stores

#### `toolUsageRecords`
Aggregated usage per tool.

```typescript
interface ToolUsageRecord {
  toolId: string;              // Primary key, e.g., "DRILL_5"
  totalHoles: number;          // Cumulative hole count
  totalDepthMm: number;        // Cumulative depth in mm
  totalWearUnits: number;      // Weighted wear score
  lastJobId: string | null;    // Most recent job
  lastUpdated: number;         // Unix timestamp (ms)
  byMaterial: Record<string, { holes: number; depthMm: number; wearUnits: number }>;
}
```

#### `toolWearThresholds`
Per-tool wear limits.

```typescript
interface ToolWearThreshold {
  toolId: string;              // Primary key
  maxWearUnits: number;        // Threshold for replacement
  updatedAt: number;           // Unix timestamp (ms)
}
```

## Wear Model

### Material Weights

| Material   | Weight | Notes                    |
|------------|--------|--------------------------|
| MDF        | 1.0    | Baseline                 |
| MELAMINE   | 1.3    | Surface hardness         |
| PLYWOOD    | 1.5    | Layered grain            |
| HPL        | 2.0    | Abrasive laminate        |
| HMR        | 1.2    | Moisture-resistant core  |

### Calculation

```typescript
wearUnits = depthMm * materialWeight * count
```

### Health Status Thresholds

| Status         | Condition          |
|----------------|--------------------|
| OK             | wearPct < 85%      |
| NEARING_LIMIT  | 85% <= wearPct < 100% |
| OVER_LIMIT     | wearPct >= 100%    |

Default `maxWearUnits`: **10,000** (if no threshold set)

## API Reference

### Storage Functions

```typescript
// Append events from G-code generation
await appendToolUsageEvents(events: ToolUsageEvent[]): Promise<void>

// Get single tool record
await getToolUsageRecord(toolId: string): Promise<ToolUsageRecord | null>

// Set wear threshold
await setToolWearThreshold(threshold: ToolWearThreshold): Promise<void>
```

### Query Functions

```typescript
// Get health status for one tool
await getToolHealth(toolId: string, options?): Promise<ToolHealth | null>

// List all tools with health status
await listToolHealth(options?): Promise<ToolHealth[]>

// List tools needing attention
await listNearingLimitTools(options?): Promise<ToolHealth[]>
```

### Wiring Function

```typescript
// Call after G-code generation (non-blocking)
await wireToolUsageAfterCncBuild({
  jobId: string,
  machineId: string,
  dialect: GcodeDialect,
  postVersion: string,
  programHash: string,
  packetContentHash: string,
  opGraph: OperationGraph,
}, options?): Promise<WireResult>
```

## UI Components

| Component         | Location                   | Purpose                       |
|-------------------|----------------------------|-------------------------------|
| ToolHealthStrip   | CNC Generate panel header  | Shows tools needing attention |
| ToolHealthBadge   | Next to Generate button    | Warning count                 |
| ToolHealthModal   | Click on tool chip         | Detail view with breakdown    |

## Migration Guide

### Fresh Install

No migration needed. IndexedDB is created automatically on first use.

### Resetting Tool Data

To clear all tool wear data (e.g., after tool replacement):

```typescript
import { resetToolingDb } from 'src/factory/tooling/storage';

// WARNING: Deletes all tool usage history
await resetToolingDb();
```

### Browser DevTools

1. Open DevTools → Application → IndexedDB
2. Find `monolith-factory-tooling`
3. View/delete records as needed

## Factory Usage

### Recommended Workflow

1. **Generate G-code** - Tool usage is recorded automatically
2. **Monitor health** - Check ToolHealthStrip for warnings
3. **Replace tool** - When OVER_LIMIT, replace physical tool
4. **Reset wear** - Clear wear data for replaced tool (UI coming in D6.1)

### Non-Blocking Design

- Tool health is **informational only**
- Does NOT block G-code generation
- Factory can proceed even with OVER_LIMIT tools
- Warnings help scheduling maintenance, not enforce it

## Troubleshooting

### Data Not Updating

1. Check browser console for errors
2. Verify IndexedDB is accessible
3. Check if job completed successfully

### Incorrect Wear Values

1. Verify material is correctly identified in DrillMap
2. Check if custom thresholds are set
3. Review material weight mapping

## Future Enhancements (D6.1)

- [ ] UI for setting per-tool thresholds
- [ ] "Reset wear" / "Mark replaced" button
- [ ] Export wear report (CSV/JSON)
- [ ] Audit trail for maintenance actions

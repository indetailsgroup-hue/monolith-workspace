# D6 Blueprint — Tool Wear & Cost Intelligence

> **Version:** 1.0.0
> **Status:** Implementation Ready
> **Scope:** Counters-only (no prediction magic)
> **Risk:** Zero (read-only observation, no G-code changes)

---

## Overview

D6 adds tool usage tracking to the CNC pipeline. It observes operations
without changing G-code output, providing data for:

- Tool wear estimation
- Cost per job calculation
- Preventive maintenance signals
- Future ERP/MES integration

---

## Architecture

```
OperationGraph
     │
     ▼
 PostProcessor ──────► G-code (unchanged)
     │
     ▼
 ToolUsageObserver ──► ToolUsageRecord
     │
     ▼
 ToolUsageStore ──────► IndexedDB (persistent)
     │
     ▼
 ToolUsageQuery ──────► Factory UI / Reports
```

**Key Principle:** Observer pattern. D6 reads but never writes to G-code path.

---

## Data Model

### ToolUsageRecord

```typescript
interface ToolUsageRecord {
  // Identity
  id: string;                    // UUID
  timestamp: number;             // Unix ms

  // Job Context
  jobId: string;
  machineId: string;

  // Tool Identity
  toolId: string;                // e.g., "DRILL_5", "BORE_35"
  toolNumber: number;            // T1, T2, etc.
  diameter: number;              // mm
  toolType: 'drill' | 'boring' | 'router';

  // Usage Metrics
  holeCount: number;
  totalDepthMm: number;          // cumulative depth drilled

  // Material Breakdown
  materialBreakdown: {
    materialClass: MaterialClass;
    holeCount: number;
    depthMm: number;
  }[];

  // Derived (computed)
  estimatedWearUnits: number;    // weighted by material hardness
}
```

### ToolLifeProfile

```typescript
interface ToolLifeProfile {
  toolId: string;
  diameter: number;

  // Factory-calibrated limits
  maxHoles: number;              // before replacement
  maxDepthMm: number;            // total drilling depth
  maxWearUnits: number;          // weighted limit

  // Cost
  replacementCostTHB: number;
}
```

### ToolUsageSummary

```typescript
interface ToolUsageSummary {
  toolId: string;

  // Lifetime totals
  lifetimeHoles: number;
  lifetimeDepthMm: number;
  lifetimeWearUnits: number;

  // Per-material stats
  holesByMaterial: Record<MaterialClass, number>;
  depthByMaterial: Record<MaterialClass, number>;

  // Status
  healthPercent: number;         // 100% = new, 0% = replace
  estimatedJobsRemaining: number;

  // Alerts
  needsReplacement: boolean;
  nearingLimit: boolean;         // < 20% health
}
```

---

## Material Wear Weights

Different materials cause different tool wear rates:

```typescript
const MATERIAL_WEAR_WEIGHT: Record<MaterialClass, number> = {
  HPL: 2.0,           // High wear (laminate is abrasive)
  MELAMINE: 1.5,      // Medium-high
  PLYWOOD: 1.2,       // Medium
  MDF: 1.0,           // Baseline
  HMR: 1.1,           // Slightly harder than MDF
  UNKNOWN: 1.0,       // Conservative default
};
```

**Wear formula:**
```
wearUnits = Σ (holeCount × depthMm × materialWeight)
```

---

## Implementation Phases

### Phase D6-A: Types & Interfaces (Foundation)
- [ ] Create `src/cnc/tooling/` directory
- [ ] Define `toolUsageTypes.ts` with all interfaces
- [ ] Define `toolLifeProfiles.ts` with default profiles
- [ ] Export from `src/cnc/tooling/index.ts`

### Phase D6-B: Observer & Tracker
- [ ] Create `toolUsageObserver.ts`
  - Pure function: `observeOperations(ops, machine) → ToolUsageRecord`
  - No side effects, deterministic
- [ ] Create `toolUsageTracker.ts`
  - Stateful class that accumulates records
  - Methods: `track(record)`, `getToolSummary(toolId)`, `getAllSummaries()`

### Phase D6-C: Persistence (IndexedDB)
- [ ] Create `toolUsageStore.ts`
  - Store records in IndexedDB
  - Query by: jobId, toolId, machineId, date range
- [ ] Add migrations for schema

### Phase D6-D: Integration Hook
- [ ] Add optional `onToolUsage` callback to `PostProcessOptions`
- [ ] Post-processor calls callback after generating G-code (read-only)
- [ ] Zero impact on G-code output

### Phase D6-E: Query & Reports
- [ ] Create `toolUsageQuery.ts`
  - `getToolHealth(toolId): ToolUsageSummary`
  - `getJobCost(jobId): JobCostEstimate`
  - `getToolsNearingLimit(): ToolUsageSummary[]`

---

## Default Tool Life Profiles

Conservative defaults (adjustable per factory):

| Tool | Diameter | Max Holes | Max Depth | Cost (THB) |
|------|----------|-----------|-----------|------------|
| DRILL_5 | 5mm | 10,000 | 150,000mm | 350 |
| DRILL_8 | 8mm | 8,000 | 120,000mm | 450 |
| BORE_15 | 15mm | 5,000 | 75,000mm | 650 |
| BORE_35 | 35mm | 3,000 | 45,000mm | 1,200 |

---

## API Examples

### Track Usage After Post-Process

```typescript
const result = fanucPostProcessor.post(opGraph, machine, {
  programName: 'JOB123',
  policy: { ... },
  onToolUsage: (record) => {
    toolUsageStore.save(record);
  },
});
```

### Query Tool Health

```typescript
const summary = await toolUsageQuery.getToolHealth('DRILL_5');
// {
//   healthPercent: 72,
//   lifetimeHoles: 2800,
//   needsReplacement: false,
//   nearingLimit: false,
// }
```

### Get Tools Needing Attention

```typescript
const alerts = await toolUsageQuery.getToolsNearingLimit();
// [
//   { toolId: 'BORE_35', healthPercent: 15, needsReplacement: true },
// ]
```

---

## Non-Goals (Explicit Scope Limits)

1. **No prediction AI** — Simple linear wear model only
2. **No auto tool change** — Advisory only, human decides
3. **No G-code modification** — Strictly read-only
4. **No external API calls** — All local computation
5. **No real-time monitoring** — Batch observation after post-process

---

## Test Strategy

1. **Unit tests** for observer (deterministic)
2. **Unit tests** for wear calculation
3. **Integration tests** for IndexedDB persistence
4. **Property tests** for material weight bounds

---

## Success Criteria

- [ ] Tool usage tracked per job
- [ ] Material breakdown recorded
- [ ] Health percentage calculated
- [ ] "Nearing limit" alert works
- [ ] Zero impact on G-code output (regression test)
- [ ] IndexedDB persists across sessions

---

## Files to Create

```
src/cnc/tooling/
├── index.ts                    # Module exports
├── toolUsageTypes.ts           # Type definitions
├── toolLifeProfiles.ts         # Default profiles
├── toolUsageObserver.ts        # Pure observation function
├── toolUsageTracker.ts         # Stateful tracker
├── toolUsageStore.ts           # IndexedDB persistence
├── toolUsageQuery.ts           # Query helpers
├── materialWearWeights.ts      # Wear coefficients
└── __tests__/
    ├── toolUsageObserver.test.ts
    ├── toolUsageTracker.test.ts
    └── toolUsageQuery.test.ts
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| G-code regression | Observer is read-only, separate code path |
| Performance | Observation is O(n) on operations, negligible |
| Storage | IndexedDB with TTL cleanup for old records |
| Accuracy | Conservative defaults, factory can calibrate |

**Overall Risk: LOW** — D6 is additive, non-invasive.

---

## Ready to Implement

Waiting for approval to proceed with D6-A (Types & Interfaces).

Command: `D6-A start`

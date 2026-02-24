# T027: Cut Optimization Algorithm Design

> Sheet Nesting & 2D Bin Packing for CNC Panel Cutting

**Version:** 2.0.0
**Status:** Phase 1 & 2 Complete, Phase 3–4 Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Algorithm Selection](#algorithm-selection)
4. [Implemented Architecture](#implemented-architecture)
5. [Data Structures (Actual)](#data-structures-actual)
6. [Implementation Phases](#implementation-phases)
7. [Test Coverage](#test-coverage)
8. [Trade-offs & Decisions](#trade-offs--decisions)

---

## Problem Statement

### Business Need

When manufacturing furniture, raw sheet materials (plywood, MDF, particleboard) must be cut into individual parts. Efficient cutting minimizes:
- **Material waste** (cost savings)
- **Cutting time** (machine efficiency)
- **Handling** (fewer sheets to process)

### Technical Challenge

The **2D Bin Packing Problem** (2DBPP) is [NP-hard](https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2022.966691/full), meaning:
- No polynomial-time algorithm finds optimal solution
- Heuristics and metaheuristics are required
- Trade-off between solution quality and computation time

### Constraints

| Constraint | Description |
|------------|-------------|
| **Grain Direction** | Wood grain must align for visual consistency |
| **Kerf Width** | Saw blade removes 3-4mm between cuts |
| **Edge Clearance** | Minimum distance from sheet edge (10-15mm) |
| **Rectangular Parts** | All cabinet panels are rectangles (simpler than irregular shapes) |
| **Guillotine Cuts** | Cuts must go edge-to-edge (CNC panel saw limitation) |

---

## Research Summary

### Academic Approaches

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| **Genetic Algorithm (GA)** | Good global optimization, handles constraints | Slow convergence |
| **Simulated Annealing** | Escapes local minima | Parameter tuning difficult |
| **GA-LP Hybrid** | [Combines GA exploration with LP precision](https://www.mdpi.com/2076-3417/13/22/12474) | Complex implementation |
| **Bottom-Left Fill** | Fast, deterministic | Suboptimal for large instances |
| **Shelf Algorithms** | Simple, good for similar-height parts | Wastes vertical space |

### Industry Solutions

| Product | Approach | Notes |
|---------|----------|-------|
| [Solid Edge 2D Nesting](https://solidedge.siemens.com/en/solutions/products/computer-aided-manufacturing-cam/2d-nesting/) | Commercial optimizer | Best-in-class but licensed |
| Autodesk TruNest | Genetic algorithm | Integrated with Inventor |
| CutList Plus | Heuristic | Budget-friendly |
| OpenNest (Grasshopper) | Open-source | Limited rectangular support |

### Integrated Nesting + Routing Problem (INRP)

Research shows [combining nesting with tool path optimization](https://link.springer.com/chapter/10.1007/978-3-031-67195-1_53) reduces:
- Total cutting distance
- Machine wear
- Production time

---

## Algorithm Selection

### Implemented: Hybrid Approach

```
Phase 1: First Fit Decreasing Height (FFDH)  ✅ DONE
   ↓
Phase 2: Grain Direction & Rotation           ✅ DONE
   ↓
Phase 3: Genetic Algorithm Refinement         ⏳ PLANNED
   ↓
Phase 4: (Future) Integration & Polish        ⏳ PLANNED
```

### Rationale

1. **FFDH** provides fast initial solution (< 100ms for typical jobs)
2. **GA refinement** improves solution quality when time permits
3. **Rectangular-only** simplifies implementation significantly
4. **Guillotine constraint** matches CNC panel saw capability

### Algorithm Details

#### Phase 1: FFDH — Implemented in `src/nesting/ffdh.ts`

Deterministic sort: height desc → width desc → id asc for absolute stability.

```typescript
// Actual implementation signature
export function packSingleSheet(
  parts: NestingPart[],
  config: NestingConfig,
): { result: SheetResult; remainingParts: NestingPart[] };

export function ffdhMultiSheet(
  parts: NestingPart[],
  config: NestingConfig,
): { sheets: SheetResult[]; unplacedParts: NestingPart[] };
```

Key features:
- **Shelf-based packing**: parts placed left-to-right within horizontal bands
- **Multi-sheet overflow**: automatically spills to new sheets when full
- **Orientation selection**: picks rotation that minimizes wasted shelf height
- **Safety limit**: max 1000 sheets to prevent infinite loops

#### Phase 2: Grain Direction — Implemented in `src/nesting/optimizer.ts`

```typescript
type GrainDirection = 'HORIZONTAL' | 'VERTICAL' | 'NONE';

// Grain controls rotation:
// - NONE → canRotate = true (MDF, plywood)
// - HORIZONTAL | VERTICAL → canRotate = false (grained materials locked)
```

Key features:
- `extractNestingParts()` reads `CutListRow.grain` field and sets `canRotate`
- Parts with grain constraints cannot be rotated (preserves visual consistency)
- `groupByMaterial()` ensures different materials nest on separate sheets
- `resolveSheetConfig()` looks up sheet dimensions from `CORE_MATERIALS_CATALOG`

#### Phase 3: Genetic Algorithm — NOT YET IMPLEMENTED

Planned GA refinement using FFDH as fitness evaluation function.

---

## Implemented Architecture

### Module Structure (Actual)

```
src/
├── nesting/
│   ├── types.ts              # GrainDirection, NestingPart, NestingConfig,
│   │                         # Placement, Shelf, SheetResult, NestingResult
│   ├── ffdh.ts               # packSingleSheet(), ffdhMultiSheet()
│   ├── optimizer.ts           # runNesting(), extractNestingParts(),
│   │                         # groupByMaterial(), resolveSheetConfig()
│   ├── index.ts              # Public API barrel exports
│   └── __tests__/
│       └── ffdh.test.ts      # 47 tests (all passing)
│
├── components/
│   └── nesting/
│       ├── NestingPanel.tsx   # SVG visualization + controls
│       └── index.ts          # Component barrel export
```

### Integration Points (Actual)

```
CutListRow[] (from monolithExportContext)
        ↓
  extractNestingParts()          # Expand qty, resolve grain
        ↓
  groupByMaterial()              # Map<materialId, NestingPart[]>
        ↓
  resolveSheetConfig()           # CORE_MATERIALS_CATALOG lookup
        ↓
  ffdhMultiSheet() per group     # FFDH shelf packing
        ↓
  NestingSheet[] + NestingResult
        ↓
  ┌────────┴────────┐
  ↓                 ↓
NestingPanel     Export Pipeline
(SVG viz)        (CSV, future DXF/PDF)
```

### NestingPanel UI Component

Interactive React component (`src/components/nesting/NestingPanel.tsx`):
- **Config inputs**: Kerf width, edge clearance (adjustable)
- **Run Optimization** button triggers `runNesting()`
- **Sheet tabs**: Navigate between sheets (label, part count, utilization %)
- **SVG visualization**: Sheet boundary, edge clearance zone, placed parts with:
  - Color-coded part rectangles
  - Part ID labels and dimension text
  - Grain direction indicator lines (toggle on/off)
  - Rotation indicator (↻)
  - Utilization % overlay
- **Summary bar**: Total sheets, overall utilization, waste (m²), unplaced count
- **Export CSV**: Download nesting layout as CSV

---

## Data Structures (Actual)

### Input Types — `src/nesting/types.ts`

```typescript
type GrainDirection = 'HORIZONTAL' | 'VERTICAL' | 'NONE';

interface NestingPart {
  id: string;              // "SIDE_L#1" for qty expansion
  sourcePartId: string;    // Original CutListRow.partId
  cabinetId: string;
  width: number;           // mm (from CutListRow.cutW)
  height: number;          // mm (from CutListRow.cutH)
  materialId: string;
  canRotate: boolean;      // Derived from grainDirection
  grainDirection: GrainDirection;
}

interface NestingConfig {
  kerfWidth: number;       // mm (default: 3.5)
  edgeClearance: number;   // mm (default: 10)
  sheetWidth: number;      // mm (default: 1220)
  sheetHeight: number;     // mm (default: 2440)
  sheetThickness: number;  // mm (default: 18)
}
```

### Output Types — `src/nesting/types.ts`

```typescript
interface Placement {
  partId: string;
  x: number;               // mm from sheet left edge
  y: number;               // mm from sheet bottom edge
  rotation: 0 | 90;
  cutW: number;            // Original width before rotation
  cutH: number;            // Original height before rotation
  grainDirection: GrainDirection;
}

interface SheetResult {
  placements: Placement[];
  usableArea: number;      // mm²
  usedArea: number;        // mm²
  utilization: number;     // 0–100 (1 decimal)
}

interface NestingResult {
  materialId: string;
  sheetsUsed: number;
  sheets: SheetResult[];
  overallUtilization: number;  // 0–100
  totalWaste: number;          // mm²
  computeTimeMs: number;
  unplacedParts: NestingPart[];
}
```

### Export Compatibility — `NestingSheet` (monolithExportContext)

`runNesting()` returns `NestingSheet[]` compatible with the existing export pipeline:

```typescript
interface NestingSheet {
  index1: number;          // Sequential 1-based
  label: string;           // "NEST_01", "NEST_02", ...
  materialId: string;
  sheetW: number;
  sheetH: number;
  sheetThickness: number;
  placements: Array<{
    partId: string;
    x: number; y: number;
    rotation: 0 | 90 | 180 | 270;
    cutW: number; cutH: number;
  }>;
  utilization: number;
}
```

---

## Implementation Phases

### Phase 1: Basic FFDH (MVP) — ✅ COMPLETE

**Scope:**
- Rectangle-only nesting
- Multi-material grouping (by materialId)
- Multi-sheet overflow
- Fixed sheet size (from material catalog)

**Delivered:**
- `ffdh.ts` — `packSingleSheet()`, `ffdhMultiSheet()` with deterministic sort
- `optimizer.ts` — `runNesting()` orchestrator with material catalog lookup
- `NestingPanel.tsx` — SVG visualization with part labels + utilization overlay
- CSV export from NestingPanel
- 47 unit + integration tests

### Phase 2: Grain Direction & Rotation — ✅ COMPLETE

**Scope:**
- `GrainDirection` type: `'HORIZONTAL' | 'VERTICAL' | 'NONE'`
- Grain-based `canRotate` logic (NONE → free, HORIZONTAL/VERTICAL → locked)
- Grain direction flows from `CutListRow.grain` through full pipeline
- SVG grain indicator lines in NestingPanel

**Delivered:**
- `types.ts` — `GrainDirection`, `Placement.grainDirection` field
- `optimizer.ts` — `resolveGrain()`, `canRotateWithGrain()`, grain propagation
- `ffdh.ts` — respects `canRotate` flag in orientation selection
- `NestingPanel.tsx` — `GrainLines` SVG component, grain toggle, grain symbols (═ ║)
- 12 additional grain-specific tests (included in the 47 total)

### Phase 3: Genetic Algorithm — ⏳ NOT STARTED

**Scope:**
- GA-based optimization using FFDH as fitness evaluator
- Configurable time limit
- Solution comparison UI

**Deliverables (planned):**
- `genetic.ts` optimizer
- Progress/status UI
- Benchmark suite

**Estimated Effort:** 4-5 days

### Phase 4: Integration & Polish — ⏳ NOT STARTED

**Scope:**
- Full integration with useCabinetStore (auto-update on design changes)
- PDF export with cut diagram
- Multiple sheet sizes per material
- Leftover/remnant tracking

**Deliverables (planned):**
- Production-ready module with auto-trigger
- User documentation
- Performance tuning

**Estimated Effort:** 3-4 days

---

## Test Coverage

### `src/nesting/__tests__/ffdh.test.ts` — 47 tests, ALL PASSING

| Test Suite | Count | Description |
|---|---|---|
| `packSingleSheet` | 10 | Single part placement, side-by-side, new shelf, rotation, kerf, edge clearance, empty input, oversized, utilization, grain in output |
| `ffdhMultiSheet` | 5 | Single sheet fit, overflow, many parts, empty input, oversized unplaced |
| `Grain Direction Constraints` | 7 | HORIZONTAL locked, VERTICAL locked, NONE rotatable, fit without rotation, grain consistency, mixed grain multi-sheet, utilization impact |
| `Determinism` | 3 | Identical output, order-independent, deterministic with grain |
| `extractNestingParts` | 8 | Qty expansion, qty=1 no suffix, grain=NONE canRotate, grain=VERTICAL locked, grain=HORIZONTAL locked, default NONE, propagation through qty, dimensions + materialId |
| `groupByMaterial` | 1 | Groups by materialId |
| `resolveSheetConfig` | 3 | Catalog lookup, unknown fallback, overrides |
| `runNesting` (integration) | 10 | Empty input, NestingSheet shape, material grouping, custom config, kitchen cabinet 14 parts, sequential indices, grain pipeline, grain unplaced, realistic cabinet with grain |

---

## Trade-offs & Decisions

### Decision 1: Rectangular Parts Only

**Choice:** Support only rectangular parts initially

**Rationale:**
- Cabinet panels are always rectangular
- Irregular nesting is [significantly more complex](https://www.nature.com/articles/s41598-025-97202-0)
- Can add irregular support later if needed

**Impact:** Simpler implementation, faster computation

---

### Decision 2: Guillotine Cuts Required

**Choice:** All solutions must use guillotine cuts

**Rationale:**
- CNC panel saws require edge-to-edge cuts
- More practical for manual cutting too
- Reduces solution space (faster optimization)

**Impact:** Slightly lower utilization vs free-form nesting

---

### Decision 3: Client-Side Computation

**Choice:** Run optimization in browser (requestAnimationFrame)

**Rationale:**
- No server dependency
- Immediate feedback
- Privacy (designs don't leave client)

**Implementation Note:** Currently runs synchronously in `requestAnimationFrame` callback. Phase 4 may move to Web Worker for large jobs.

**Impact:** Limited by device performance, may need time limits

---

### Decision 4: Flat Module Structure (vs Nested)

**Choice:** Flat files (`ffdh.ts`, `optimizer.ts`) instead of nested folders (`algorithms/ffdh.ts`, `constraints/grain.ts`)

**Rationale:**
- Only 4 source files — nested structure adds complexity without benefit
- Grain logic is tightly coupled with optimizer (not a standalone constraint module)
- Easier imports: `from '../nesting/ffdh'` vs `from '../nesting/algorithms/ffdh'`

**Impact:** Simpler project structure, may reorganize if module grows significantly

---

### Decision 5: Grain = No Rotation (Phase 2 Simplification)

**Choice:** Parts with `grainDirection !== 'NONE'` cannot rotate at all

**Rationale:**
- Simplest correct rule: rotating a grained part changes grain direction on sheet
- Future: could allow rotation if ALL parts in a material group agree on same direction
- Phase 2 keeps the conservative approach

**Impact:** Slightly lower utilization for grained materials, but guaranteed visual consistency

---

## References

- [Two-dimensional irregular packing problems: A review](https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2022.966691/full)
- [Optimizing 2D Irregular Packing via Hybrid GA-LP](https://www.mdpi.com/2076-3417/13/22/12474)
- [Integrated Nesting and Tool Path Problem](https://link.springer.com/chapter/10.1007/978-3-031-67195-1_53)
- [Solid Edge 2D Nesting](https://solidedge.siemens.com/en/solutions/products/computer-aided-manufacturing-cam/2d-nesting/)

---

*Document created: February 2026*
*Last updated: February 2026 — v2.0.0 (Phase 1 & 2 implementation complete)*

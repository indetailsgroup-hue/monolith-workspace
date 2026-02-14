# T027: Cut Optimization Algorithm Design

> Sheet Nesting & 2D Bin Packing for CNC Panel Cutting

**Version:** 0.1.0 (Design Phase)
**Status:** Research Complete, Implementation Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Algorithm Selection](#algorithm-selection)
4. [Proposed Architecture](#proposed-architecture)
5. [Data Structures](#data-structures)
6. [Implementation Phases](#implementation-phases)
7. [Trade-offs & Decisions](#trade-offs--decisions)

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

### Recommended: Hybrid Approach

```
Phase 1: First Fit Decreasing Height (FFDH)
   ↓
Phase 2: Genetic Algorithm Refinement
   ↓
Phase 3: (Future) Tool Path Optimization
```

### Rationale

1. **FFDH** provides fast initial solution (< 100ms for typical jobs)
2. **GA refinement** improves solution quality when time permits
3. **Rectangular-only** simplifies implementation significantly
4. **Guillotine constraint** matches CNC panel saw capability

### Algorithm Details

#### Phase 1: First Fit Decreasing Height (FFDH)

```typescript
function ffdh(parts: Part[], sheet: Sheet): Placement[] {
  // Sort by height descending
  const sorted = [...parts].sort((a, b) => b.height - a.height);

  const shelves: Shelf[] = [];
  const placements: Placement[] = [];

  for (const part of sorted) {
    let placed = false;

    // Try to fit in existing shelf
    for (const shelf of shelves) {
      if (shelf.remainingWidth >= part.width && shelf.height >= part.height) {
        placements.push({ part, x: shelf.currentX, y: shelf.y });
        shelf.currentX += part.width + KERF_WIDTH;
        shelf.remainingWidth -= part.width + KERF_WIDTH;
        placed = true;
        break;
      }
    }

    // Create new shelf if needed
    if (!placed) {
      const y = shelves.length === 0 ? 0 : lastShelf.y + lastShelf.height + KERF_WIDTH;
      shelves.push({ y, height: part.height, currentX: part.width + KERF_WIDTH });
      placements.push({ part, x: 0, y });
    }
  }

  return placements;
}
```

#### Phase 2: Genetic Algorithm Refinement

```typescript
interface Individual {
  permutation: number[];  // Part ordering
  fitness: number;        // Material utilization %
}

function geneticOptimize(parts: Part[], sheet: Sheet): Placement[] {
  const POPULATION_SIZE = 50;
  const GENERATIONS = 100;
  const MUTATION_RATE = 0.1;

  // Initialize population with random permutations
  let population = initializePopulation(parts, POPULATION_SIZE);

  for (let gen = 0; gen < GENERATIONS; gen++) {
    // Evaluate fitness (run FFDH with each permutation)
    evaluateFitness(population, parts, sheet);

    // Selection (tournament)
    const parents = tournamentSelect(population);

    // Crossover (order crossover for permutations)
    const offspring = orderCrossover(parents);

    // Mutation (swap two elements)
    mutate(offspring, MUTATION_RATE);

    population = [...eliteSelect(population, 5), ...offspring];
  }

  return ffdh(applyPermutation(parts, population[0].permutation), sheet);
}
```

---

## Proposed Architecture

### Module Structure

```
src/
├── nesting/
│   ├── types.ts              # NestingPart, Sheet, Placement types
│   ├── algorithms/
│   │   ├── ffdh.ts           # First Fit Decreasing Height
│   │   ├── genetic.ts        # Genetic Algorithm optimizer
│   │   └── guillotine.ts     # Guillotine constraint validator
│   ├── constraints/
│   │   ├── grain.ts          # Grain direction constraints
│   │   └── kerf.ts           # Kerf width calculations
│   ├── optimizer.ts          # Main orchestrator
│   ├── visualizer.ts         # Canvas/SVG output
│   └── __tests__/
│       ├── ffdh.test.ts
│       └── genetic.test.ts
```

### Integration Points

```
useCabinetStore.panels
        ↓
    extractParts()
        ↓
    NestingOptimizer
        ↓
    NestingResult
        ↓
  ┌─────┴─────┐
  ↓           ↓
CutList    Visualization
(CSV)      (Canvas/PDF)
```

---

## Data Structures

### Input Types

```typescript
interface NestingPart {
  id: string;
  name: string;
  width: number;          // mm
  height: number;         // mm
  quantity: number;
  canRotate: boolean;     // Allow 90° rotation?
  grainDirection: 'horizontal' | 'vertical' | 'none';
  material: string;       // Group by material
}

interface Sheet {
  id: string;
  width: number;          // mm (e.g., 2440 for standard 8x4)
  height: number;         // mm (e.g., 1220)
  material: string;
  cost: number;           // Per sheet
}

interface NestingConfig {
  kerfWidth: number;      // mm (default: 3.5)
  edgeClearance: number;  // mm (default: 10)
  algorithm: 'ffdh' | 'genetic' | 'hybrid';
  timeLimit?: number;     // ms for GA optimization
}
```

### Output Types

```typescript
interface Placement {
  partId: string;
  sheetIndex: number;
  x: number;              // mm from left edge
  y: number;              // mm from bottom edge
  rotated: boolean;       // 90° rotation applied?
}

interface NestingResult {
  placements: Placement[];
  sheetsUsed: number;
  utilization: number;    // 0-1 (material used / total area)
  waste: number;          // mm² of unused material
  computeTime: number;    // ms
}

interface CutInstruction {
  sheetIndex: number;
  cuts: Cut[];            // Ordered cutting sequence
}

interface Cut {
  type: 'horizontal' | 'vertical';
  position: number;       // mm from edge
  length: number;         // mm
}
```

---

## Implementation Phases

### Phase 1: Basic FFDH (MVP)

**Scope:**
- Rectangle-only nesting
- Single material type
- No grain direction
- Fixed sheet size

**Deliverables:**
- `ffdh.ts` algorithm
- Basic visualization
- CSV cut list export

**Estimated Effort:** 2-3 days

### Phase 2: Grain Direction & Rotation

**Scope:**
- Grain direction constraints
- Optional 90° rotation
- Multiple material grouping

**Deliverables:**
- `grain.ts` constraints
- Material grouping logic
- Enhanced visualization (grain indicators)

**Estimated Effort:** 2-3 days

### Phase 3: Genetic Algorithm

**Scope:**
- GA-based optimization
- Configurable time limit
- Solution comparison UI

**Deliverables:**
- `genetic.ts` optimizer
- Progress/status UI
- Benchmark suite

**Estimated Effort:** 4-5 days

### Phase 4: Integration & Polish

**Scope:**
- Full integration with useCabinetStore
- PDF export with cut diagram
- Multiple sheet sizes
- Leftover/remnant tracking

**Deliverables:**
- Production-ready module
- User documentation
- Performance tuning

**Estimated Effort:** 3-4 days

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

**Choice:** Run optimization in browser (Web Worker)

**Rationale:**
- No server dependency
- Immediate feedback
- Privacy (designs don't leave client)

**Impact:** Limited by device performance, may need time limits

---

### Decision 4: Hybrid Algorithm Default

**Choice:** FFDH for instant results, GA for optimization

**Rationale:**
- FFDH provides acceptable solution immediately
- GA improves solution while user reviews
- User can stop anytime with best-so-far result

**Impact:** Best of both worlds - speed and quality

---

## References

- [Two-dimensional irregular packing problems: A review](https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2022.966691/full)
- [Optimizing 2D Irregular Packing via Hybrid GA-LP](https://www.mdpi.com/2076-3417/13/22/12474)
- [Integrated Nesting and Tool Path Problem](https://link.springer.com/chapter/10.1007/978-3-031-67195-1_53)
- [Solid Edge 2D Nesting](https://solidedge.siemens.com/en/solutions/products/computer-aided-manufacturing-cam/2d-nesting/)

---

*Document created: February 2026*
*Last updated: February 2026*

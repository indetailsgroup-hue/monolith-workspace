# Connector OS v1.1 - Material Stack Integration

## Overview

The material stack system handles the critical difference between **Core thickness** (raw board) and **Finished thickness** (with surface lamination). This 1.6mm gap between 18.0mm Core and 19.6mm Finished is the primary source of drilling errors in conventional systems.

---

## 1. Stack Definition

**Reference case: HMR 18mm + HPL 0.8mm x2 + PVC 1.0mm**

| Layer | Material | Thickness |
|-------|----------|-----------|
| Core | HMR Green | 18.0mm |
| Surface (top) | HPL Grey Oak | 0.8mm |
| Surface (bottom) | HPL Grey Oak | 0.8mm |
| Edge Banding | PVC Grey | 1.0mm |
| **Finished Total** | | **19.6mm** |

```typescript
const CurrentPanelStack = {
  core: { material: 'HMR_GREEN', thickness: 18.0 },
  surface: { material: 'HPL_GREY_OAK', thickness: 0.8, sides: 2 },
  edge: { material: 'PVC_GREY', thickness: 1.0 },
  resolved: {
    coreThk: 18.0,
    finishedThk: 19.6, // 18 + (0.8 * 2)
    edgeThk: 1.0
  }
};
```

---

## 2. N-Center Policy (Structural Drilling)

**CRITICAL RULE:** For structural connectors (Minifix, Target, Rastex), the edge bore center MUST reference the **CORE thickness center**, never the finished thickness center.

### Formula

```
N_center = coreThk / 2
```

### Example

| Reference | Calculation | Center (mm) | Status |
|-----------|-------------|-------------|--------|
| **CORE (correct)** | 18.0 / 2 | **9.0** | PASS |
| FINISHED (wrong) | 19.6 / 2 | 9.8 | FAIL - 0.8mm offset |

### Engineering Rationale

- Hardware (Minifix/Target) is designed for nominal board thickness (16/18/19mm)
- CORE center maintains equal material balance on both sides of the bore
- Using FINISHED center causes 0.8mm asymmetry, risking:
  - Material breakout on the thin side
  - Dowel/bolt misalignment between mating panels
  - HPL delamination near bore edges

### Assembly Mating

When side panel meets bottom panel at a joint, both panels reference CORE center. This ensures bores align perfectly regardless of whether HPL thickness varies between panels.

---

## 3. V-Axis Banding Compensation

System 32 specifies S = 37mm measured from the **finished front surface**. The V-axis compensation depends on the **Manufacturing Mode** - whether the CNC machine drills before or after edge banding.

---

## 4. Manufacturing Mode (v1.1)

The system supports two manufacturing modes that determine how V-axis coordinates are calculated:

### Mode Definitions

| Mode | V Coordinate | When Used |
|------|-------------|-----------|
| **DRILL_ON_CORE** | `V = S - PVC_thickness` (36.0mm) | CNC drills raw board BEFORE edge banding |
| **DRILL_ON_FINISHED** | `V = S` (37.0mm) | CNC drills AFTER edge banding is applied |

### DRILL_ON_CORE Mode

The CNC machine processes raw boards before edge banding. The compiler subtracts PVC thickness so that the bore lands at the correct position after banding.

```
V_cnc = System32_S - PVC_thickness = 37.0 - 1.0 = 36.0mm
```

### DRILL_ON_FINISHED Mode

The CNC machine processes boards that already have edge banding applied. The machine's reference zero touches the PVC edge directly, so no compensation is needed.

```
V_cnc = System32_S = 37.0mm
```

### Implementation

```typescript
type ManufacturingMode = 'DRILL_ON_CORE' | 'DRILL_ON_FINISHED';

function calculateVCoordinate(
  system32S: number,
  pvcThk: number,
  mode: ManufacturingMode
): number {
  return mode === 'DRILL_ON_CORE'
    ? system32S - pvcThk  // 36.0mm
    : system32S;          // 37.0mm
}
```

### Gate G11 Mode Validation

G11 must validate that V-coordinates match the declared manufacturing mode:

| Mode | Expected V for S=37 | If V=36.0 | If V=37.0 |
|------|---------------------|-----------|-----------|
| DRILL_ON_CORE | 36.0 | PASS | **FAIL** - over-compensated |
| DRILL_ON_FINISHED | 37.0 | **FAIL** - wrong compensation | PASS |

**Critical:** If mode is `DRILL_ON_FINISHED` but V=36.0 is emitted, G11 must **terminate** the export immediately to prevent scrap parts.

---

## 5. Two-World Summary

The system strictly separates two reference frames:

| Purpose | Thickness | Usage |
|---------|-----------|-------|
| **Assembly Envelope / Clash** | 19.6mm (Finished) | Space fitting, visual layout |
| **Joinery / Drilling Center** | 18.0mm (Core) | Hardware N-center |
| **V-Axis Compensation** | Mode-dependent | DRILL_ON_CORE subtracts PVC; DRILL_ON_FINISHED does not |

---

## 6. CNC Coordinate Summary Table

For Stack 19.6mm (HMR 18 + HPL 0.8x2 + PVC 1.0):

### DRILL_ON_CORE Mode

| Measurement | System Value | CNC Output | Technical Reason |
|------------|-------------|------------|------------------|
| Panel thickness | 19.6mm | 18.0mm (Core) | CNC references raw board as zero |
| Bore center (N) | Structural Center | **9.0mm** | Core 18mm / 2 |
| First hole (V) | System 32 (37) | **36.0mm** | Subtract PVC 1mm |
| Bore depth (N) | Per hardware spec | Per spec + safety | Prevent drill breakthrough to HPL |

### DRILL_ON_FINISHED Mode

| Measurement | System Value | CNC Output | Technical Reason |
|------------|-------------|------------|------------------|
| Panel thickness | 19.6mm | 19.6mm (Finished) | CNC references finished edge |
| Bore center (N) | Structural Center | **9.0mm** | Still CORE center (always) |
| First hole (V) | System 32 (37) | **37.0mm** | No compensation needed |
| Bore depth (N) | Per hardware spec | Per spec + safety | Prevent drill breakthrough to HPL |

---

## 7. Core Calculation Function (v1.1)

The `calculateCncCoordinate` function is the single source of truth for CNC coordinate generation:

```typescript
interface Stack {
  core: number;      // 18.0
  finished: number;  // 19.6
  pvc: number;       // 1.0
}

type ManufacturingMode = 'DRILL_ON_CORE' | 'DRILL_ON_FINISHED';

interface CncCoordinate {
  u: number;  // U-axis (width/drilling distance B)
  v: number;  // V-axis (depth/System 32)
  n: number;  // N-axis (center point)
}

function calculateCncCoordinate(
  system32S: number,
  distanceB: number,
  stack: Stack,
  mode: ManufacturingMode
): CncCoordinate {
  return {
    u: distanceB,
    v: mode === 'DRILL_ON_CORE' ? system32S - stack.pvc : system32S,
    n: stack.core / 2,  // ALWAYS core center for structural
  };
}
```

### Usage Examples

```typescript
const PREMIUM_STACK: Stack = { core: 18.0, finished: 19.6, pvc: 1.0 };

// DRILL_ON_FINISHED mode (CNC drills after edge banding)
calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_FINISHED');
// → { u: 24.0, v: 37.0, n: 9.0 }

// DRILL_ON_CORE mode (CNC drills before edge banding)
calculateCncCoordinate(37.0, 24.0, PREMIUM_STACK, 'DRILL_ON_CORE');
// → { u: 24.0, v: 36.0, n: 9.0 }
```

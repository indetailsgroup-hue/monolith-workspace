# Minifix S200 + System 32 + Dowel Canonical Specification

> Version: 1.0.0
> Status: Verified
> Last Updated: 2026-02-04

This document defines the **single source of truth** for Minifix connector placement
in Monolith, based on Häfele engineering standards and verified coordinate systems.

---

## 1. ENGINEERING DEFINITIONS

### 1.1 Coordinate System (Monolith)

**World Coordinates:**
```
X: left(-) → right(+)
Y: bottom(-) → top(+)
Z: back(-) → front(+)
```

**Panel-Local Coordinates (from panelBasis.ts):**

| Panel | localX | localY | localU | Origin |
|-------|--------|--------|--------|--------|
| SIDE | depth (front→back) | height (bottom→top) | ±X (into material) | front-bottom |
| TOP | width (left→right) | depth (front→back) | -Y (into material) | front-left |
| BOTTOM | width (left→right) | depth (front→back) | +Y (into material) | front-left |

### 1.2 Joint Types

| Joint | Meaning | TOP/BOTTOM Width |
|-------|---------|------------------|
| INSET | TOP/BOTTOM fits "between" SIDE panels | W - 2*T |
| OVERLAY | TOP/BOTTOM covers SIDE panels | W |

### 1.3 System 32 vs Dimension B (CRITICAL DISTINCTION)

| Parameter | Definition | Value |
|-----------|------------|-------|
| **System 32 Pitch** | Distance between consecutive holes on SIDE panel (grid spacing) | 32mm |
| **Dimension B** | Distance from **mate edge** (LEFT/RIGHT) to CAM center | 24mm (standard) or 34mm |
| **First Hole** | Distance from FRONT edge to first System 32 position | 37mm |

> **WARNING:** Never confuse B with 32! They measure different things.
> - B = horizontal offset from mate edge to connector axis
> - 32 = vertical/depth spacing between connector positions

### 1.4 Dowel Split Depth (Häfele Standard)

Total dowel length: **30mm**

| Panel | Bore Type | Depth | Purpose |
|-------|-----------|-------|---------|
| SIDE | EDGE_BORE | 18mm | Drilled into top/bottom edge |
| TOP/BOTTOM | FACE_BORE | 12mm | Drilled into machining face |

> Split depth prevents wood bulge/breakthrough in 16-19mm panels.

### 1.5 Connector Count Formula

Based on **carcass depth** (SIDE panel's `basis.faceWidth`):

```typescript
const FIRST_HOLE = 37;   // mm from front
const REAR_MARGIN = 37;  // mm from back
const USABLE_ZONE = carcassDepth - (FIRST_HOLE + REAR_MARGIN);  // = depth - 74

const connectorCount = Math.max(2, Math.floor(USABLE_ZONE / 224) + 2);
```

Where `224 = 32 × 7` (7 pitch intervals between connectors).

### 1.6 Mating Tolerance

```typescript
const MATING_THRESHOLD = 0.1;  // mm
```

---

## 2. PLACEMENT ALGORITHM

### 2.1 SIDE Panel (BOLT + DOWEL_EDGE)

For each connector index `i` (0 to count-1):

```typescript
const sys32Z = FIRST_HOLE + i * PITCH;  // System 32 position
const dowelZ = sys32Z + DOWEL_OFFSET;   // Dowel at +32mm from bolt

// BOLT (drilled into TOP/BOTTOM edge of SIDE panel)
{
  type: 'EDGE_BORE',
  purpose: 'BOLT',
  localX: panelThickness / 2,  // center of edge
  localY: isTopCorner ? (faceHeight - edgeOffset) : edgeOffset,
  depth: sleeveLength,  // 17.5mm
  diameter: sleeveDia,  // 10mm
}

// DOWEL on SIDE
{
  type: 'EDGE_BORE',
  purpose: 'DOWEL',
  localX: panelThickness / 2,
  localY: same as bolt,
  depth: dowelDepthEdge,  // 18mm
  diameter: dowelDia,     // 8mm
}
```

### 2.2 TOP/BOTTOM Panel (CAM + DOWEL_FACE)

Dimension B reference from **mate edge**:

```typescript
const isLeftMate = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

// CAM position at Distance B from mate edge
const housingX = isLeftMate
  ? dimensionB                      // 24mm from LEFT edge
  : basis.faceWidth - dimensionB;   // 24mm from RIGHT edge

// CAM HOUSING (drilled into machining face)
{
  type: 'FACE_BORE',
  purpose: 'CAM_LOCK',
  localX: housingX,
  localY: sys32Z,  // System 32 position from front
  depth: camDepth,  // 12.5mm for 16mm wood
  diameter: camDia, // 15mm
}

// DOWEL on TOP/BOTTOM (aligned with SIDE dowel)
{
  type: 'FACE_BORE',
  purpose: 'DOWEL',
  localX: housingX,  // Same X as CAM (at Distance B)
  localY: dowelZ,    // Same Z as SIDE dowel
  depth: dowelDepthFace,  // 12mm
  diameter: dowelDia,     // 8mm
}
```

---

## 3. TYPESCRIPT REFERENCE IMPLEMENTATION

```typescript
interface ConnectorConfig {
  dimensionB: 24 | 34;
  firstHole: number;      // 37mm
  pitch: number;          // 32mm
  dowelOffset: number;    // 32mm
  dowelDia: number;       // 8mm
  dowelDepthEdge: number; // 18mm
  dowelDepthFace: number; // 12mm
  housingDia: number;     // 15mm
  housingDepth: number;   // varies by wood thickness
  sleeveLength: number;   // 17.5mm
}

const MATING_THRESHOLD = 0.1;  // mm

function computeConnectorCount(carcassDepth: number): number {
  const usable = carcassDepth - 74;  // 37 front + 37 back
  return Math.max(2, Math.floor(usable / 224) + 2);
}

function generateMinifixSystem32(
  sideBasis: PanelBasis,
  topBasis: PanelBasis,
  config: ConnectorConfig,
  mate: 'LEFT' | 'RIGHT',
  corner: 'TOP' | 'BOTTOM'
): DrillOperation[] {
  const ops: DrillOperation[] = [];
  const count = computeConnectorCount(sideBasis.faceWidth);

  for (let i = 0; i < count; i++) {
    const sys32 = config.firstHole + i * config.pitch;
    const dowelZ = sys32 + config.dowelOffset;

    // === SIDE PANEL OPERATIONS ===

    // BOLT (edge bore into SIDE)
    ops.push({
      panelRole: 'SIDE',
      kind: 'BOLT',
      drillType: 'EDGE_BORE',
      localX: sideBasis.thickness / 2,
      localY: corner === 'TOP'
        ? sideBasis.faceHeight - 40
        : 40,
      depth: config.sleeveLength,
    });

    // DOWEL on SIDE (edge bore)
    ops.push({
      panelRole: 'SIDE',
      kind: 'DOWEL',
      drillType: 'EDGE_BORE',
      localX: sideBasis.thickness / 2,
      localY: corner === 'TOP'
        ? sideBasis.faceHeight - 40
        : 40,
      depthPosition: dowelZ,
      depth: config.dowelDepthEdge,  // 18mm
    });

    // === TOP/BOTTOM PANEL OPERATIONS ===

    const housingX = mate === 'LEFT'
      ? config.dimensionB
      : topBasis.faceWidth - config.dimensionB;

    // CAM HOUSING (face bore into TOP/BOTTOM)
    ops.push({
      panelRole: corner === 'TOP' ? 'TOP' : 'BOTTOM',
      kind: 'CAM',
      drillType: 'FACE_BORE',
      localX: housingX,
      localY: sys32,
      depth: config.housingDepth,
    });

    // DOWEL on TOP/BOTTOM (face bore)
    ops.push({
      panelRole: corner === 'TOP' ? 'TOP' : 'BOTTOM',
      kind: 'DOWEL',
      drillType: 'FACE_BORE',
      localX: housingX,
      localY: dowelZ,
      depth: config.dowelDepthFace,  // 12mm
    });
  }

  return ops;
}
```

---

## 4. GATE VALIDATION RULES

### 4.1 Logic Gate (Operation Graph Validation)

| Check | Rule | Severity |
|-------|------|----------|
| Drill Type | SIDE dowel = EDGE_BORE, TOP/BOTTOM dowel = FACE_BORE | BLOCKER |
| Split Depth | SIDE = 18mm, TOP/BOTTOM = 12mm | BLOCKER |
| Distance B | Measured from mate edge, not front edge | BLOCKER |
| Count Formula | Uses carcass depth, not OD | WARNING |

### 4.2 Geometry Gate (Drill Map Validation)

For each mating pair (SIDE ↔ TOP/BOTTOM):

```typescript
// Check coaxial alignment
const distance = calculateDistance(worldSideHole, worldTopHole);
if (distance > MATING_THRESHOLD) {
  return { valid: false, error: 'Connector misalignment' };
}
```

---

## 5. INVARIANTS (Must Always Be True)

| # | Invariant | Description |
|---|-----------|-------------|
| 1 | 32 = grid spacing | System 32 pitch between consecutive holes |
| 2 | B = mate edge offset | Distance B measured from LEFT/RIGHT edge |
| 3 | carcassDepth = basis.faceWidth | Use actual panel dimension, not OD |
| 4 | No OD reference | Connector count based on real geometry |
| 5 | No back collision | Rear margin maintained |
| 6 | CNC-safe | All coordinates within panel bounds |
| 7 | Symmetric | LEFT/RIGHT mirrors correctly |
| 8 | Deterministic | Same input = same output |

---

## 6. QUICK REFERENCE

| Term | Definition | Standard Value |
|------|------------|----------------|
| **System 32** | Grid spacing on SIDE panel | 32mm |
| **Dimension B** | Offset from mate edge to CAM center | 24mm |
| **First Hole** | Distance from FRONT to first position | 37mm |
| **Dowel Total** | Full dowel length | 30mm |
| **Dowel Edge** | Depth into SIDE panel | 18mm |
| **Dowel Face** | Depth into TOP/BOTTOM panel | 12mm |
| **Mating Tolerance** | Max alignment error | 0.1mm |

---

## 7. FILE REFERENCES

| File | Purpose |
|------|---------|
| `panelBasis.ts` | Panel coordinate system definitions |
| `generateDrillMap.ts` | Drill map generation implementation |
| `types.ts` | MinifixConfig interface with split depths |
| `minifixDefaults.ts` | Default configuration values |
| `system32MinifixPlacement.ts` | System 32 calculation utilities |

---

## Changelog

- **v1.0.0** (2026-02-04): Initial canonical specification
  - Fixed Distance B to measure from mate edge (not FRONT)
  - Added dowel split depth (18/12)
  - Implemented DOWEL_HORIZONTAL on TOP/BOTTOM panels
  - Documented connector count formula

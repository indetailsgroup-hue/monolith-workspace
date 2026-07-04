# Minifix Drillmap Skill — MONOLITH

## Purpose
Comprehensive knowledge base for the Minifix S200 hardware system, drill map generation,
3D visualization, and factory-grade validation. Prevents incorrect drill positions,
wrong hardware specs, and coordinate mapping errors.

## Scope
Applies to any code that affects:
- Minifix constants (Distance B, CAM depth, bolt dimensions)
- Drill map generation (corner joints, System 32 positions)
- Panel basis / coordinate mapping (AABB, local-to-world)
- Hardware 3D rendering (CAM housing, bolt assembly, dowels)
- Gate G11 validation (placement rules, mating alignment)
- Minifix Transform UI (flip, rotate, move hardware)

---

## 1. Hafele S200 Specifications (Catalog FF 3.10)

### CAM Depth by Wood Thickness (AUTHORITATIVE TABLE)
```
Wood (mm) | CAM Depth (mm) | dimA (mm)
----------|----------------|----------
12        | 9.5            | 6
13        | 11.0           | 6.5
15        | 12.0           | 7.5
16        | 12.5           | 8
18        | 13.5           | 9       ← PROJECT DEFAULT
19        | 14.0           | 9.5
22        | 16.0           | 11
25        | 18.5           | 12.5
28        | 20.0           | 14
```

### Hardware Dimensions (18mm wood)
```
Component         | Dimension | Value    | Notes
------------------|-----------|----------|------
Distance B        | edge→bolt | 24mm     | From MATING EDGE (left/right), NOT front
CAM Housing       | diameter  | 15mm     | Face bore on HORIZONTAL panel
CAM Housing       | depth     | 13.5mm   | For 18mm wood
CAM Height (dimA) | surface→center | 9mm | Distance from panel surface to bolt axis
CAM Rim           | diameter  | 18mm     | Outer rim
CAM Rim           | height    | 2mm      |
Bolt Sleeve       | diameter  | 10mm     | Face bore on VERTICAL panel
Bolt Bore Depth   | depth     | 17.5mm   | Manufacturing drill depth (NOT assembly 14.25mm)
Bolt Shaft        | diameter  | 5mm      | Thread pilot
Bolt Shaft        | length    | 11mm     | L dimension
Ball Head         | diameter  | 6.5mm    | NOT 7.5mm (common mistake!)
Ball Head         | offset    | 3.25mm   | radius
Neck Shaft        | diameter  | 6.5mm    |
Neck Shaft        | length    | 6.5mm    |
Dowel             | diameter  | 8mm      |
Dowel             | total     | 30mm     | 12mm face + 18mm edge (v4.0 split)
Dowel Offset      | from bolt | 32mm     | System 32 spacing
```

### Bolt Protrusion Formula
```
ballRadius(3.25) + neckLength(6.5) + sleeveLength(14.25) = 24mm total protrusion
```

---

## 2. Construction Model: Side-covers-Top (v4.0)

### Rule
SIDE panels COVER the ends of TOP/BOTTOM panels (European standard).

### Drilling Assignment per Panel Type
```
Panel Type   | Allowed Drill Types         | Drill Direction
-------------|-----------------------------|----------------
HORIZONTAL   | CAM_LOCK (face bore)        | Vertical (Y-axis, into face)
(TOP/BOTTOM) | BOLT_ENTRY (edge bore)      | Horizontal (X-axis, shaft passage)
             | DOWEL (edge bore)           | Horizontal (X-axis, into end grain)
             |                             |
VERTICAL     | BOLT (face bore)            | Horizontal (X-axis, into face)
(LEFT/RIGHT) | BOLT_THREAD (face bore)     | Horizontal (X-axis, thread pilot)
SIDE         | DOWEL (face bore)           | Horizontal (X-axis, into face)
```

### Corner Joint Mapping
```
Corner         | CAM Panel | BOLT Panel  | Bolt Direction
---------------|-----------|-------------|---------------
TOP_LEFT       | TOP       | LEFT_SIDE   | LEFT (-X)
TOP_RIGHT      | TOP       | RIGHT_SIDE  | RIGHT (+X)
BOTTOM_LEFT    | BOTTOM    | LEFT_SIDE   | LEFT (-X)
BOTTOM_RIGHT   | BOTTOM    | RIGHT_SIDE  | RIGHT (+X)
```

### Dowel v4.0 Split Depth
```
SIDE panel (vertical):  12mm face bore (shallow, into panel face)
HORIZ panel (horizontal): 18mm edge bore (deep, into end grain)
Total: 12 + 18 = 30mm
```

---

## 3. Coordinate System

### World Coordinates
```
X: left (-) → right (+)
Y: bottom (-) → top (+)
Z: back (-) → front (+, maxZ)
```

### Panel Machining Face Basis (from panelBasis.ts)

#### TOP/BOTTOM (Horizontal Panels)
```
Interior-facing surface (machining face):
  - TOP panel:    bottom surface (drill UP, uAxis = -Y... wait, drills down into face)
  - BOTTOM panel: top surface (drill DOWN into face... actually UP)

Coordinate mapping:
  origin: FRONT-LEFT corner (maxZ, minX)
  localX: LEFT → RIGHT (0 = left edge, max = right edge)
  localY: FRONT → BACK (0 = front edge, max = back edge)
  faceWidth = cabinet width (X dimension)
  faceHeight = cabinet depth (Z dimension)

Drilling normal (uAxis):
  TOP:    +Y (drilling upward into underside)
  BOTTOM: -Y (drilling downward into top surface)
```

#### LEFT_SIDE / RIGHT_SIDE (Vertical Panels)
```
Interior-facing surface (machining face):

Coordinate mapping:
  origin: FRONT-BOTTOM corner (maxZ, minY)
  localX: FRONT → BACK (0 = front edge, max = back edge)
  localY: BOTTOM → TOP (0 = bottom edge, max = top edge)
  faceWidth = cabinet depth (Z dimension)
  faceHeight = cabinet height (Y dimension)

Drilling normal (uAxis):
  LEFT_SIDE:  +X (drilling rightward, inward)
  RIGHT_SIDE: -X (drilling leftward, inward)
```

### System 32 Parameters
```
FIRST_HOLE_Z = 37mm    (from FRONT edge of panel)
PITCH        = 32mm    (between consecutive holes)
END_OFFSET   = 40mm    (margin from LEFT/RIGHT mating edge)
```

### Local Coordinate Calculation

#### For TOP/BOTTOM panels:
```
localX = endOffset (40mm)                      // LEFT corners
localX = faceWidth - endOffset                  // RIGHT corners
localY = sys32Z position                        // System 32 depth position
```

#### For SIDE panels:
```
localX = sys32Z position                        // System 32 depth position
localY = endOffset (40mm)                       // BOTTOM corners
localY = faceHeight - endOffset                 // TOP corners
```

---

## 4. Connector Count Logic (CAD Baseline)

### Threshold Rule
```
faceWidth <= 400mm → 2 connectors per corner (CORNER + CORNER)
faceWidth >  400mm → 3 connectors per corner (CORNER + MIDDLE + CENTER)
```

### Position Calculation for 3 connectors
```
sys32Positions[0] = FIRST_HOLE_Z                           // 37mm (front)
sys32Positions[1] = FIRST_HOLE_Z + N*PITCH                 // middle
sys32Positions[2] = FIRST_HOLE_Z + floor(N/2)*PITCH        // center (symmetric)
```

### Each Connector Generates (per corner):
```
1x CAM_LOCK     on HORIZONTAL panel (face bore, dia=15, depth=13.5)
1x BOLT         on VERTICAL panel   (face bore, dia=10, depth=17.5)
1x BOLT_ENTRY   on HORIZONTAL panel (edge bore, dia=10, through)
1x BOLT_THREAD  on VERTICAL panel   (face bore, dia=5, depth=11)
2x DOWEL        split between panels (dia=8, 12mm face + 18mm edge)
```

---

## 5. Gate G11 Validation Rules

### G11.1: Distance B Validation
```
Measured from: MATING EDGE (left/right), NOT front edge
Standard:  24mm
Alternate: 34mm
Tolerance: +/- 1.0mm
```

### G11.2: Dowel Depth Split
```
SIDE face bore:    12mm (shallow)
HORIZ edge bore:   18mm (deep, end grain)
Tolerance: +/- 0.5mm
```

### G11.3: Drill Type by Panel (see Section 2)
- CAM_LOCK only on HORIZONTAL
- BOLT only on VERTICAL (face)
- BOLT_ENTRY only on HORIZONTAL (edge)

### G11.4: Mating Alignment
```
Paired dowel holes must align within 0.1mm in world-space [x, y, z]
```

### G11.5: Bolt Tip to CAM Center (B=C Truth)
```
Bolt targetPocketCenter must equal CAM pocket center
CAM pocket center = center of dia-15 hole at depth 13.5/2 = 6.75mm
Bolt protrusion = 24mm must reach this center
```

### G11 Constants (gateG11_types.ts)
```typescript
SYSTEM32_PITCH:            32
SYSTEM32_FIRST_HOLE:       37
DIMENSION_B_STANDARD:      24
DIMENSION_B_ALTERNATE:     34
DOWEL_DEPTH_SIDE_FACE:     12
DOWEL_DEPTH_HORIZ_EDGE:    18
CAM_DIAMETER:              15
BOLT_SLEEVE_DIAMETER:      10
BOLT_BALL_HEAD_DIAMETER:    6.5
BOLT_PROTRUSION_TOTAL:     24
MATING_TOLERANCE:           0.1
DIMENSION_B_TOLERANCE:      1.0
DEPTH_TOLERANCE:            0.5
```

---

## 6. Key Files Map

### Constants & Defaults
```
src/core/manufacturing/drillMap/minifixDefaults.ts   → DrillMap defaults (CAM_DRILLING_SPECS table)
src/core/manufacturing/hardware/minifixDefaults.ts   → Hardware library defaults
src/components/canvas/MinifixSet.ts                  → S200_SPECS for 3D rendering
src/release/gates/gateG11_types.ts                   → G11_CONSTANTS
```

### Generation & Mapping
```
src/core/manufacturing/drillMap/generateDrillMap.ts  → Main drill map generator (v4.0)
src/core/manufacturing/drillMap/panelBasis.ts        → AABB panel coordinate system
src/core/manufacturing/drillMap/types.ts             → DrillMapPoint, DrillMap interfaces
src/core/manufacturing/drillMap/drillMapIndex.ts     → O(1) lookup index
src/core/manufacturing/drillMap/drillMapToMinifixPair.ts → DrillMap → validation format
```

### Validation
```
src/release/gates/gateG11_minifixSystem32.ts         → Gate G11 policy enforcement
src/release/gates/gateG11_types.ts                   → G11 constants + types
```

### 3D Visualization
```
src/components/canvas/Hardware3D.tsx                  → 3D render (CAM, bolt, dowel)
src/components/canvas/MinifixSet.ts                  → S200 render specs
src/components/canvas/Cabinet3D.tsx                   → Cabinet 3D (calls Hardware3D)
```

### UI
```
src/components/ui/MinifixTransformPanel.tsx           → Flip/Rotate/Move UI
src/components/ui/HardwareSmartDimensions.tsx         → B 24 / diameter labels
src/components/ui/HardwareLibrary.tsx                 → Hardware preset library
```

### Tests
```
src/core/manufacturing/drillMap/__tests__/generateMinifixDrillMap.threshold.test.ts
src/core/manufacturing/drillMap/__tests__/minifixPlacement.test.ts
src/release/gates/__tests__/gateG11_minifixSystem32.test.ts
src/components/canvas/__tests__/minifixRenderInvariant.test.ts
```

---

## 7. Forbidden Patterns (Hard Fail)

### Wrong Constants
```typescript
// NEVER hardcode wrong values
camDepth: 12.5        // WRONG for 18mm wood (should be 13.5)
ballHeadDia: 7.5      // WRONG (should be 6.5 per Hafele catalog)
camHeight: 8          // WRONG for 18mm (should be 9, dimA)
drillingDistanceB: 34 // WRONG for compact (should be 24)
boltBoreDepth: 14.25  // WRONG for manufacturing (should be 17.5)
```

### Wrong Panel Assignment
```typescript
// NEVER put CAM on vertical panel
{ purpose: 'CAM_LOCK', panelRole: 'LEFT_SIDE' }  // WRONG - CAM goes on HORIZONTAL

// NEVER put BOLT face bore on horizontal panel
{ purpose: 'BOLT', panelRole: 'TOP' }  // WRONG - BOLT face bore goes on VERTICAL
```

### Wrong Distance B Reference
```typescript
// NEVER measure Distance B from front edge
localY = distanceB  // WRONG if localY maps to front-back axis

// CORRECT: Distance B measured from LEFT/RIGHT mating edge
localX = endOffset  // endOffset = 40mm from mating edge for System 32
// Distance B = 24mm is the edge-to-bolt-center on the MATING face
```

### Wrong Dowel Depth
```typescript
// NEVER reverse the split depths
dowelDepthSideFace: 18   // WRONG (should be 12)
dowelDepthHorizEdge: 12  // WRONG (should be 18)
```

---

## 8. Required Patterns (Pass)

### Always Use CAM_DRILLING_SPECS Table
```typescript
// CORRECT: Look up by actual wood thickness
const spec = CAM_DRILLING_SPECS[panel.computed.realThickness];
const camDepth = spec?.drillingDepth ?? 13.5;  // fallback to 18mm default
const dimA = spec?.dimA ?? 9;
```

### Always Use Central Defaults
```typescript
// CORRECT: Import from minifixDefaults.ts
import { getMinifixConfig } from '../drillMap/minifixDefaults';
const config = getMinifixConfig(woodThickness);
```

### Validate Coaxial Alignment
```typescript
// CORRECT: CAM and BOLT must share the same world-space axis
const camCenter = camPoint.position;
const boltTarget = boltPoint.targetPocketCenter;
assert(distance(camCenter, boltTarget) < MATING_TOLERANCE);
```

### Test Factories Must Match Specs
```typescript
// CORRECT: Test helpers must use matching depths
function makeCam(thickness = 18) {
  const spec = CAM_DRILLING_SPECS[thickness];
  return { depth: spec.drillingDepth, dimA: spec.dimA };
}
```

---

## 9. Common Bug → Fix Mapping

| Symptom | Likely Cause | Fix Location |
|---------|-------------|--------------|
| Distance B shows 34 instead of 24 | Wrong default or alternate used | minifixDefaults.ts, generateDrillMap.ts |
| CAM and BOLT not coaxial | panelBasis mapping error | panelBasis.ts, generateCornerJointPoints() |
| Hardware renders at wrong corner | Corner type → local coordinate wrong | cornerToLocalXY_TopBottom/Side() |
| Drill points outside panel bounds | endOffset or sys32Z exceeds panel size | computeConnectorCount(), sys32 calculation |
| Dowel depth wrong (18/12 swapped) | Split depth reversed | minifixDefaults.ts, DOWEL generation |
| CAM depth 12.5 instead of 13.5 | Hardcoded 16mm-wood value | CAM_DRILLING_SPECS lookup, test factories |
| Ball head 7.5mm in render | Old incorrect constant | S200_SPECS, MinifixSet.ts |
| Bolt bore 14.25mm | Using assembly length not manufacturing | boltBoreDepth should be 17.5 |
| Flip/Rotate not working | Transform not applied to drill normal | MinifixTransformPanel.tsx, Hardware3D.tsx |
| G11 validation fails unexpectedly | Constants mismatch between gate and generator | Compare G11_CONSTANTS vs minifixDefaults |
| 3 connectors when should be 2 | Threshold check using wrong dimension | computeConnectorCount(faceWidth) check |
| Smart dimension label wrong | Label reads from wrong property | HardwareSmartDimensions.tsx |

---

## 10. Visual Debug Checklist (3D)

### X-Ray Mode (Alt+Z)
- [ ] Red drill points visible at each corner
- [ ] CAM (dia-15) on TOP/BOTTOM face, BOLT (dia-10) on SIDE face
- [ ] B 24 dimension label between mating edge and bolt center
- [ ] Dowels offset 32mm from bolt position
- [ ] No points floating outside panel geometry

### Hardware Render
- [ ] CAM housing (silver, Ø15) sits flush on horizontal panel
- [ ] Bolt assembly (steel) enters side panel horizontally
- [ ] Ball head (Ø6.5) engages CAM slot
- [ ] Dowel (beech, Ø8) visible at 32mm offset from bolt
- [ ] Flip (V/H) correctly mirrors hardware about panel center

### Smart Dimensions
- [ ] Ø15 label near CAM housing
- [ ] Ø10 label near bolt sleeve
- [ ] Ø5 label near bolt shaft
- [ ] Ø8 x2 label near dowels
- [ ] B 24 dimension with dashed arrow line

---

## 11. Review Checklist (Before Merge)

For any PR touching drill map / hardware / minifix:
- [ ] All constants match Hafele FF 3.10 catalog for target wood thickness
- [ ] Distance B measured from MATING EDGE (not front)
- [ ] CAM only on HORIZONTAL panels, BOLT face bore only on VERTICAL panels
- [ ] Dowel split depth: SIDE=12mm, HORIZ=18mm
- [ ] CAM↔BOLT coaxial within 0.1mm tolerance
- [ ] Connector count threshold: 2 for <=400mm, 3 for >400mm
- [ ] System 32: first hole 37mm, pitch 32mm, end offset 40mm
- [ ] Test factories use matching CAM_DRILLING_SPECS values
- [ ] Gate G11 constants match generation constants
- [ ] `npm run test:minifix` passes
- [ ] Visual check in X-Ray mode (if applicable)

## Definition of Done
- Changing wood thickness updates ALL derived values (camDepth, dimA, bore depths)
- All 4 corners produce valid joint assemblies
- Gate G11 passes with zero violations
- 3D render matches drill map positions exactly
- Smart dimensions show correct values

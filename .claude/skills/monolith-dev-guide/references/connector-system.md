# Connector System — Complete Technical Reference

## Table of Contents
1. [Overview](#overview)
2. [INSET vs OVERLAY — Physical Construction](#inset-vs-overlay)
3. [Drill Map Generation Pipeline](#drill-map-generation-pipeline)
4. [Position Computation per Component](#position-computation)
5. [Bolt Orientation Pipeline (3D Rendering)](#bolt-orientation-pipeline)
6. [Twist Computation (Seam-Driven)](#twist-computation)
7. [V-Flip Transform System](#v-flip-transform)
8. [H-Flip Transform System](#h-flip-transform)
9. [State Persistence & Resolution Chain](#state-persistence)
10. [Stale Override Prevention](#stale-override-prevention)
11. [File Map](#file-map)
12. [Common Mistakes & Pitfalls](#common-mistakes)

---

## Overview

The connector system manages Minifix bolt+cam hardware joints between cabinet panels. Each connector consists of 5 drill points: BOLT, BOLT_THREAD, BOLT_ENTRY, CAM_LOCK, and optional DOWELs.

Two construction modes exist:
- **INSET** (Side-covers-Top): Side panel is full height, horizontal panel fits between sides
- **OVERLAY** (Top-covers-Side): Horizontal panel extends to full width, side panel is shortened

The mode affects which panel receives each drill point, drilling axes, and 3D hardware orientation.

### World Coordinate System
```
+X = Right
+Y = Up
+Z = Depth (front to back, front = maxZ)
```

### Corner Types
```
TOP_LEFT     TOP_RIGHT
BOTTOM_LEFT  BOTTOM_RIGHT
```

---

## INSET vs OVERLAY — Physical Construction

### Panel Role Swap

| Component       | INSET (Side covers Top)        | OVERLAY (Top covers Side)       |
|-----------------|-------------------------------|--------------------------------|
| **BOLT**        | Side panel FACE (±X drilling) | Horizontal panel FACE (±Y drilling) |
| **BOLT_THREAD** | Side panel FACE (co-located with BOLT) | Horizontal panel FACE (co-located with BOLT) |
| **BOLT_ENTRY**  | Horizontal panel EDGE (±X drilling) | Side panel EDGE (±Y drilling) |
| **CAM_LOCK**    | Horizontal panel FACE (±Y drilling) | Side panel FACE (±X drilling) |
| **DOWEL (bolt-side)** | Side panel FACE bore 12mm | Side panel EDGE bore 18mm |
| **DOWEL (cam-side)**  | Horizontal panel EDGE bore 18mm | Horizontal panel FACE bore 12mm |

### Drilling Axis Directions

| Corner | INSET boltDir | OVERLAY boltDir |
|--------|--------------|----------------|
| TOP_LEFT | -X `[-1,0,0]` | +Y `[0,1,0]` |
| TOP_RIGHT | +X `[1,0,0]` | +Y `[0,1,0]` |
| BOTTOM_LEFT | -X `[-1,0,0]` | -Y `[0,-1,0]` |
| BOTTOM_RIGHT | +X `[1,0,0]` | -Y `[0,-1,0]` |

Source: `getDrillingAxis()` in `boltOrientationUtils.ts` (line 558)

```typescript
if (jointType === 'INSET') {
  // Left Panel: shaft goes LEFT (-X), Right Panel: shaft goes RIGHT (+X)
  return isLeft ? WORLD.X_NEG.clone() : WORLD.X_POS.clone();
} else {
  // TOP corners: shaft goes UP (+Y), BOTTOM corners: shaft goes DOWN (-Y)
  return isTop ? WORLD.Y_POS.clone() : WORLD.Y_NEG.clone();
}
```

### Joint Axis (Alignment Reference)

All drill points in a connector share a "joint axis" for proper alignment:

| Mode | Joint Axis | Value |
|------|-----------|-------|
| INSET | jointAxisY | `(horizontalAabb.minY + horizontalAabb.maxY) / 2` — horizontal panel thickness center |
| OVERLAY | jointAxisX | `(verticalAabb.minX + verticalAabb.maxX) / 2` — side panel thickness center |

### targetPocketCenter Computation

The `targetPocketCenter` field on BOLT points defines the cam pocket center, used for `boltDirection` computation and V-Flip rotation center.

| Mode | Offset Direction | Formula |
|------|-----------------|---------|
| INSET | Along cam normal (±Y) | `camPos + camNormal * (horizontalThickness / 2)` |
| OVERLAY | Along cam normal (±X) | `camPos + camNormal * (sideThickness / 2)` |

### boltDirection Computation

For both modes:
```typescript
boltPoint.boltDirection = normalize(camPocketCenter - boltPosition)
```

**Critical contract**: `boltDirection` ≠ `boltPoint.normal` (drilling axis). `boltDirection` points from bolt position toward cam pocket center, used for preview orientation and V-Flip axis.

---

## Drill Map Generation Pipeline

Source: `generateCornerJointPoints()` in `generateDrillMap.ts` (line 435)

### Function Signature
```typescript
function generateCornerJointPoints(
  corner: CornerType,
  sys32Z: number,           // System 32 depth position from front
  positionIndex: number,     // For unique ID generation
  panelsByRole: PanelsByRole,
  config: MinifixConfig,
  params: DrillingParams,
  angleDeg = 90,             // Corner angle (30-150°)
  jointMode: JointType = 'INSET'
): CornerJointResult
```

### Caller (line ~1060)
```typescript
const isTopCorner = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
const jointMode = isTopCorner
  ? (cabinet.structure?.topJoint ?? 'INSET')
  : (cabinet.structure?.bottomJoint ?? 'INSET');
```

### Branch Structure
```
if (jointMode === 'OVERLAY') {
  // Lines 489-694: OVERLAY branch
  // Bolt on horizontal, cam on side, entry on side edge
} else {
  // Lines 696-1043: INSET branch (default)
  // Bolt on side, cam on horizontal, entry on horizontal edge
}
```

---

## Position Computation per Component

### BOLT Position

**INSET** — `boltFacePointFromSideAABB_v4()`:
```
X = inner face of side panel (minX for LEFT, maxX for RIGHT)
Y = jointAxisY (horizontal panel thickness center)
Z = maxZ - sys32Z
Normal = ±X into side panel face
```

**OVERLAY** — `boltFacePointFromHorizAABB_overlay()`:
```
X = jointAxisX (side panel thickness center, overridden after helper call)
Y = mating face of horizontal panel (minY for TOP, maxY for BOTTOM)
Z = maxZ - sys32Z
Normal = ±Y into horizontal panel (TOP: [0,1,0], BOTTOM: [0,-1,0])
```

### CAM Position

**INSET** — Panel-local coordinate system via `getPanelBasisFromAABB()`:
```
localX = Distance B from mate edge (LEFT: distanceB, RIGHT: faceWidth - distanceB)
localY = sys32Z
World position via panelLocalToWorld(basis, localX, localY)
Normal = basis.uAxis (into panel face, ±Y)
```

**OVERLAY** — `camFacePointFromSideAABB_overlay()`:
```
X = inner face of side panel (maxX for LEFT, minX for RIGHT)
Y = Distance B from mating edge (TOP: maxY - distanceB, BOTTOM: minY + distanceB)
Z = maxZ - sys32Z
Normal = ±X into side panel (LEFT: [-1,0,0], RIGHT: [1,0,0])
```

### BOLT_ENTRY Position

**INSET** — `boltEntryEdgePointFromHorizAABB()`:
```
On horizontal panel edge (where bolt shaft passes through)
Normal = ±X (horizontal into panel edge)
```

**OVERLAY** — `boltEntryEdgePointFromSideAABB_overlay()`:
```
X = side panel thickness center
Y = side panel edge (maxY for TOP, minY for BOTTOM)
Z = maxZ - sys32Z
Normal = ±Y (TOP: [0,-1,0] into panel, BOTTOM: [0,1,0])
```

### DOWEL Positions & Depths

Z positions: `maxZ - sys32Z ± dowelOffset` (System 32 spacing, typically ±32mm)

| Mode | Bolt-side panel | Depth | Cam-side panel | Depth |
|------|----------------|-------|----------------|-------|
| INSET | Side face bore | 12mm | Horizontal edge bore | 18mm |
| OVERLAY | Side edge bore | 18mm | Horizontal face bore | 12mm |

The deeper bore (18mm) is always in the **edge** grain; the shallower bore (12mm) is in the **face** grain.

---

## Bolt Orientation Pipeline (3D Rendering)

Source: `boltRotations` useMemo in `Cabinet3D.tsx → Hardware3DOverlayInner` (lines ~265-311)

### Pipeline Steps

```
1. getDrillingAxis(corner, jointType) → boltDirWorld (±X or ±Y)
2. selectBoltPanelNormalWorld(corner) → boltPanelNormal (±X for side panels)
3. computeBoltQuatWithTwist({boltDirWorld, boltPanelNormal, mountType}) → {boltQuat, twistRad, ...}
4. V-Flip: if flipVertical → additional 180° quaternion around boltDir
5. TOP-INSET flip: if (isTopCorner && INSET) → additional 180° around Z-axis
6. Convert final quaternion to Euler → {rotX, rotY, rotZ}
7. H-Flip: if flipHorizontal → rotY += π
```

### BOLT_MODEL Constants (Local Space)
```
SHAFT_AXIS = (0, -1, 0)   // shaft extends downward
FINS_AXIS  = (1, 0, 0)    // fins extend along +X
```

### computeBoltQuatWithTwist Algorithm

Source: `boltOrientationUtils.ts` (line 241)

```
1. seamDir = cross(boltPanelNormal, boltDir)
   - INSET singularity: both are ±X → force seamDir = ±Z
   - OVERLAY: boltPanelNormal=±X, boltDir=±Y → seamDir=±Z
2. targetDir = seamDir (for BOTH INSET and OVERLAY)
   - Both modes: fins align with seam direction (Z-axis)
3. qBase = quaternion that aligns SHAFT_AXIS(-Y) → boltDirWorld
4. finsBefore = FINS_AXIS(+X) rotated by qBase
5. twistRad = signedAngle(finsBefore → targetDir, around boltDir)
6. qFinal = qTwist(twistRad around boltDir) * qBase
```

### selectBoltPanelNormalWorld
```
LEFT corners (TOP_LEFT, BOTTOM_LEFT)  → +X [1, 0, 0]
RIGHT corners (TOP_RIGHT, BOTTOM_RIGHT) → -X [-1, 0, 0]
```
Note: This always returns the **side panel** normal, regardless of joint type.

---

## Twist Computation (Seam-Driven)

Source: `resolveSeamDrivenTwist()` called from `generateDrillMap.ts`

### boltPanelNormal per Mode

| Mode | Panel hosting bolt | boltPanelNormal |
|------|-------------------|-----------------|
| INSET | Side panel | LEFT: `{x:1, y:0, z:0}`, RIGHT: `{x:-1, y:0, z:0}` |
| OVERLAY | Horizontal panel | TOP: `{x:0, y:-1, z:0}`, BOTTOM: `{x:0, y:1, z:0}` |

### Twist Parameters
```typescript
resolveSeamDrivenTwist({
  jointPosition: 'TOP' | 'BOTTOM',
  jointMode: 'INSET' | 'OVERLAY',
  panelSide: 'LEFT' | 'RIGHT',
  cornerType: corner,
  boltDir: drilling axis vector,
  boltPanelNormal: normal of panel hosting bolt,
  position: bolt world position,
  targetPocketCenter: cam pocket center position,
})
```

The twist result (`twistDeg`) is stored on `boltPoint.boltTwistDeg` and used by the rendering pipeline to orient fins parallel to the joint seam.

---

## V-Flip Transform System

V-Flip rotates a connector 180° around the bolt axis (`boltDirection`). This affects three independent systems:

### 1. Hardware3DOverlay (Cabinet3D.tsx)
- Reads `flipVertical` from resolved preview state
- Applies 180° quaternion around boltDirWorld to bolt+cam group
- Code: `boltRotations` useMemo step 4

### 2. Preview3D Cam (MinifixConfigPanel.tsx)
- Rotates ENTIRE cam assembly around cam-local Z-axis (bolt entry direction)
- `camQ = Quaternion(Z-axis, π)` when flipped, identity otherwise
- Must wrap ALL meshes (body + rim + indicators)

### 3. Drill Indicators (Cabinet3D.tsx → drillMapFlipped useMemo)
- Rodrigues 180° rotation for each non-BOLT point in flipped connector:
```
P' = C + 2·(v·n̂)·n̂ − v     where v = P − C
N' = 2·(N·n̂)·n̂ − N          (direction-only transform)
```
- Center C = bolt.position
- Axis n̂ = normalize(bolt.boltDirection)
- BOLT points don't move (they are the rotation center)

### State Resolution
```typescript
const resolved = resolvePreviewState(pairKeyV2, pairId, hardwareOverrides, null);
const isFlipped = resolved?.flipVertical
  ?? flipXStateByPointId[boltPoint.id]  // legacy fallback
  ?? false;
```

---

## H-Flip Transform System

H-Flip rotates a connector 180° around the global Y-axis through the bolt position. In the 3D rendering pipeline, this is equivalent to adding π to Euler rotY.

### Mathematical Derivation

Euler rotY += π ≡ rotation by π around `Rx(rotX) · Ŷ`.

For standard bolt directions:
- INSET (boltDir = ±X): rotX = ±π/2 → `Rx(±π/2)·Ŷ = (0, 0, ∓1)` → but 180° rotation, sign irrelevant → equivalent to Y-axis rotation
- OVERLAY (boltDir = ±Y): rotX = 0 or π → `Rx(0)·Ŷ = (0, 1, 0)` → global Y-axis

**Result**: For all standard configurations, H-Flip axis = global Y `(0, 1, 0)`.

### Effect
H-Flip around Y through bolt center:
- **X reflects**: `X' = 2·Cx - X` (flips left↔right relative to bolt)
- **Y unchanged**: `Y' = Y`
- **Z reflects**: `Z' = 2·Cz - Z` (flips front↔back relative to bolt)

### Implementation in drillMapFlipped
```typescript
if (isHFlipped) {
  pos = rodrigues180(pos, C, 0, 1, 0);   // Global Y axis
  nrm = rodrigues180Dir(nrm, 0, 1, 0);
}
```

Both V-Flip and H-Flip can be applied sequentially:
```typescript
if (isVFlipped) {
  pos = rodrigues180(pos, C, nx, ny, nz);  // boltDirection axis
  nrm = rodrigues180Dir(nrm, nx, ny, nz);
}
if (isHFlipped) {
  pos = rodrigues180(pos, C, 0, 1, 0);     // Global Y axis
  nrm = rodrigues180Dir(nrm, 0, 1, 0);
}
```

### Helper Functions (defined inside Cabinet3D.tsx drillMapFlipped useMemo)
```typescript
// Rodrigues 180° for position (around axis through center C)
const rodrigues180 = (
  pos: [number, number, number],
  C: [number, number, number],
  nx: number, ny: number, nz: number,
): [number, number, number] => {
  const vx = pos[0] - C[0], vy = pos[1] - C[1], vz = pos[2] - C[2];
  const dot = vx * nx + vy * ny + vz * nz;
  return [C[0] + 2*dot*nx - vx, C[1] + 2*dot*ny - vy, C[2] + 2*dot*nz - vz];
};

// Rodrigues 180° for direction (no center offset)
const rodrigues180Dir = (
  dir: [number, number, number],
  nx: number, ny: number, nz: number,
): [number, number, number] => {
  const dot = dir[0] * nx + dir[1] * ny + dir[2] * nz;
  return [2*dot*nx - dir[0], 2*dot*ny - dir[1], 2*dot*nz - dir[2]];
};
```

---

## State Persistence & Resolution Chain

### Hardware Override Storage
```
useCabinetStore.cabinet.hardwareOverrides[key] = {
  previewState: { flipVertical, flipHorizontal, rotationX, rotationY, rotationZ }
}
```

### Dual-Key Resolution (resolvePreviewState.ts)
```
1. hardwareOverrides[pairKeyV2]?.previewState  → v2 content-addressed (stable across dim changes)
2. hardwareOverrides[pairId]?.previewState      → v1 legacy fallback
3. globalConfig (cabinet.hardware.minifixConfig) → cabinet-wide default
4. null                                          → identity (no transform)
```

### Key Types
- **pairKeyV2**: Content-addressed key built from `buildPairKeyV2(corner, sys32Z)` — stable when cabinet dimensions change
- **pairId**: Format `pair-{corner}-{positionIndex}` — may change when position indices shift

### OverlayPreviewState Interface
```typescript
interface OverlayPreviewState {
  flipVertical: boolean;
  flipHorizontal: boolean;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}
```

---

## Stale Override Prevention

### Problem
When switching between INSET ↔ OVERLAY, saved `hardwareOverrides` contain rotation/flip states specific to the previous joint type. The `setDrillMap()` action (useDrillMapStore line ~307) restores these stale overrides onto new drill map points, causing wrong hardware positions.

### Solution
Clear overrides when joint type changes:

**useCabinetStore.setJointType** (line ~2618):
```typescript
cabinet.hardwareOverrides = {};
```

**useDrillMapStore.regenerateDrillMap** (line ~822):
```typescript
set({
  drillMap: null,
  drillMapVersion: currentVersion + 1,
  flipXStateByPointId: {},  // Clear legacy V-Flip state too
});
```

### Why This Works
- `hardwareOverrides = {}` prevents stale rotation data from being restored onto new points
- `flipXStateByPointId = {}` prevents legacy V-Flip states from carrying over
- Fresh drill map generates with correct default orientations for the new joint type

---

## File Map

| File | Purpose |
|------|---------|
| `src/core/manufacturing/drillMap/generateDrillMap.ts` | Main drill map generation, INSET/OVERLAY branches |
| `src/core/manufacturing/drillMap/panelBasis.ts` | Position helpers: AABB→world coordinate functions |
| `src/core/manufacturing/drillMap/types.ts` | DrillMapPoint, BoltDrillPoint, CamDrillPoint interfaces |
| `src/core/manufacturing/hardware/boltOrientationUtils.ts` | getDrillingAxis, computeBoltQuatWithTwist, selectBoltPanelNormalWorld |
| `src/factory/cnc/overlay/resolvePreviewState.ts` | Dual-key preview state resolution |
| `src/components/canvas/Cabinet3D.tsx` | drillMapFlipped useMemo (V-Flip + H-Flip), boltRotations useMemo |
| `src/components/ui/MinifixConfigPanel.tsx` | Preview3D cam rendering, camQ quaternion |
| `src/components/ui/HardwareContextMenu.tsx` | Right-click Minifix Transform UI |
| `src/core/store/useCabinetStore.ts` | hardwareOverrides persistence, setJointType clearing |
| `src/core/store/useDrillMapStore.ts` | flipXStateByPointId, setDrillMap override restoration |

### panelBasis.ts Helper Functions

**INSET helpers:**
- `boltFacePointFromSideAABB_v4(corner, sideAabb, sys32Z, camCenterOffset)` — Bolt on side panel face
- `boltEntryEdgePointFromHorizAABB(corner, horizAabb, sys32Z, distanceB)` — Entry on horizontal edge
- CAM uses `getPanelBasisFromAABB()` + `panelLocalToWorld()` pipeline

**OVERLAY helpers:**
- `boltFacePointFromHorizAABB_overlay(corner, horizAabb, sys32Z, distanceB)` — Bolt on horizontal face
- `boltEntryEdgePointFromSideAABB_overlay(corner, sideAabb, sys32Z, distanceB)` — Entry on side edge
- `camFacePointFromSideAABB_overlay(corner, sideAabb, sys32Z, distanceB)` — CAM on side face

---

## Common Mistakes & Pitfalls

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|-----------------|
| Using `boltDirection` as drilling axis | `boltDirection` = bolt→cam vector (for preview), `normal` = drilling axis | Use `point.normal` for drilling, `point.boltDirection` for orientation |
| Hardcoding `jointMode: 'INSET'` | OVERLAY drill positions will be wrong | Read from `cabinet.structure.topJoint` / `bottomJoint` |
| Not clearing overrides on joint type change | Stale rotation data causes wrong hardware positions | Clear `hardwareOverrides` in `setJointType` |
| Using wrong boltPanelNormal for OVERLAY | INSET: side panel (±X), OVERLAY: horizontal panel (±Y) | Select based on which panel hosts the bolt |
| H-Flip using boltDirection axis | H-Flip is rotY += π, not arbitrary axis | Use global Y axis (0,1,0) for all standard cases |
| Forgetting to pass drillMapFlipped to all consumers | Some indicators show original positions | Pass to CADDrillIndicators, Hardware3DOverlay, CSGDrillOverlay |
| Reading flip state from only one store | Miss persisted overrides or legacy state | Use `resolvePreviewState()` with `flipXStateByPointId` fallback |
| Rotating cam around Y-axis for V-Flip | Cylinder axis = Y, rotation invisible | Rotate around Z-axis (bolt entry direction) |
| Not wrapping entire cam assembly in flip group | Partial flip — body stays, only indicators move | Wrap ALL meshes in `<group quaternion={camQ}>` |
| OVERLAY dowel using INSET depths | Wrong bore depths for construction type | INSET: side=12mm face, horiz=18mm edge / OVERLAY: side=18mm edge, horiz=12mm face |

# Collision & Clearance System - Technical Specification

## Overview

ระบบ Collision และ Clearance สำหรับตรวจจับการชนกันของตู้และ validate clearance สำหรับบาน/ลิ้นชัก

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `cellSizeMm` | 500mm | ขนาด cell ของ Spatial Hash Grid |
| `nearPaddingMm` | 150mm | padding สำหรับ near-field query |
| `doorMaxOpenDeg` | 110° | มุมเปิดบานสูงสุดสำหรับ envelope |
| `doorSampleCount` | 8 | จำนวน OBB samples สำหรับบาน |
| `drawerSampleCount` | 6 | จำนวน OBB samples สำหรับลิ้นชัก |

### Gate Policy

| Collision Type | Severity | Action |
|----------------|----------|--------|
| Body Collision | **ERROR** | Block commit / Mark invalid |
| Use Envelope Collision | **WARNING** | Allow commit with warning |

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COLLISION SYSTEM ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Spatial Hash    │    │  Shape Registries                │   │
│  │  (Broad-phase)   │    │  - obstacleShapesById            │   │
│  │  - spatialObs    │    │  - cabinetBodyById               │   │
│  │  - spatialCabs   │    │  - cabinetUseEnvById             │   │
│  └────────┬─────────┘    └──────────────┬───────────────────┘   │
│           │                              │                       │
│           └──────────────┬───────────────┘                       │
│                          ▼                                       │
│           ┌──────────────────────────────┐                       │
│           │  Collision Context Builder   │                       │
│           │  (Near-field query)          │                       │
│           └──────────────┬───────────────┘                       │
│                          ▼                                       │
│           ┌──────────────────────────────┐                       │
│           │  OBB-OBB SAT Collision       │                       │
│           │  (Narrow-phase)              │                       │
│           └──────────────┬───────────────┘                       │
│                          ▼                                       │
│           ┌──────────────────────────────┐                       │
│           │  Clearance Validator         │                       │
│           │  - Body → ERROR              │                       │
│           │  - Use Envelope → WARNING    │                       │
│           └──────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 OBB (Oriented Bounding Box)

```typescript
interface OBB {
  center: Vec3;      // จุดศูนย์กลาง
  axisX: Vec3;       // แกน X (unit vector)
  axisY: Vec3;       // แกน Y (unit vector)
  axisZ: Vec3;       // แกน Z (unit vector)
  halfSize: Vec3;    // half-extents (mm)
}
```

### 2.2 Collision Shapes

```typescript
interface CabinetCollisionShape {
  cabinetId: string;
  obbs: OBB[];
}

interface WorldObstacleShape {
  id: string;
  kind: ObstacleKind; // 'WALL' | 'COLUMN' | 'APPLIANCE' | etc.
  obbs: OBB[];
}
```

### 2.3 Use Envelope Specs

```typescript
interface DoorSwingSpec {
  doorId: string;
  hingeSide: 'LEFT' | 'RIGHT';
  doorWidth: number;
  doorHeight: number;
  doorThickness: number;
  pivotLocal: Vec3;
  maxOpenDeg: number; // default: 110°
  sampleCount?: number; // default: 8
}

interface DrawerPullSpec {
  drawerId: string;
  pullOutMm: number;
  frontWidth: number;
  frontHeight: number;
  frontThickness: number;
  frontCenterLocal: Vec3;
  pullDirectionLocal: Vec3;
  sampleCount?: number; // default: 6
}
```

---

## 3. Spatial Hash Grid

### 3.1 Algorithm

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPATIAL HASH GRID                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────┬─────┬─────┬─────┬─────┐                                │
│  │     │  A  │     │     │     │   Grid Size: 500mm cells       │
│  ├─────┼─────┼─────┼─────┼─────┤                                │
│  │     │  A  │  B  │     │     │   Object A spans 2 cells       │
│  ├─────┼─────┼─────┼─────┼─────┤   Object B spans 1 cell        │
│  │     │     │     │  C  │  C  │   Object C spans 2 cells       │
│  ├─────┼─────┼─────┼─────┼─────┤                                │
│  │     │     │     │     │     │   Query AABB → get cells       │
│  └─────┴─────┴─────┴─────┴─────┘   → get objects in cells       │
│                                                                  │
│  Performance: O(n) insert, O(k) query (k = objects in cells)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Operations

| Operation | Complexity | Description |
|-----------|------------|-------------|
| `upsert()` | O(cells) | Insert/update object |
| `remove()` | O(1) | Remove by ID (with reverse index) |
| `queryByAabb()` | O(cells) | Query objects in AABB |
| `queryByPoint()` | O(1) | Query objects near point |

---

## 4. OBB-OBB Collision (SAT)

### 4.1 Separating Axis Theorem

```
Test 15 potential separating axes:
- 3 axes from OBB A
- 3 axes from OBB B
- 9 cross products (A_i × B_j)

If separation found on ANY axis → No collision
If no separation on ALL axes → Collision
```

### 4.2 Implementation

```typescript
function obbObbCollision(a: OBB, b: OBB): CollisionResult {
  // Test all 15 axes
  // Return first separating axis found
  // Or return collision with penetration depth
}
```

---

## 5. Use Envelope Generation

### 5.1 Door Swing Envelope

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOOR SWING ENVELOPE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│         Closed      45°         90°         110°                │
│                                                                  │
│           ┌──┐      ┌──┐         ──┐           ──┐              │
│           │  │      │ /          │ │           │  │             │
│           │  │      │/           │ │           │   │            │
│     ──────┤  │      ┤            ┤ │           ┤    │           │
│     Hinge │  │      │            │ │           │     │          │
│           └──┘      └            └─┘           └──────           │
│                                                                  │
│  Sample 8 OBBs from 0° to 110° → Union = Use Envelope           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Drawer Pull Envelope

```
┌─────────────────────────────────────────────────────────────────┐
│                    DRAWER PULL ENVELOPE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Closed:                                                        │
│  ┌────────────────────────────────┐                             │
│  │        Cabinet Body            │                             │
│  │  ┌──────────────────────┐      │                             │
│  │  │     Drawer Front     │      │                             │
│  └──┴──────────────────────┴──────┘                             │
│                                                                  │
│  Full Extension:                                                │
│  ┌────────────────────────────────┐  ┌──────────────────────┐   │
│  │        Cabinet Body            │  │    Drawer Front      │   │
│  │                                │  │                      │   │
│  └────────────────────────────────┘  └──────────────────────┘   │
│                                                                  │
│  Sample 6 OBBs from 0 to pullOutMm → Union = Use Envelope       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Gate Validation

### 6.1 Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    GATE VALIDATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. After Snap Commit                                           │
│     └─ Get moved cabinet body shape at committed position       │
│     └─ Get use envelope shape (if cabinet has doors/drawers)    │
│                                                                  │
│  2. Build Near-field Context                                    │
│     └─ Query spatial hash with padding=150mm                    │
│     └─ Get nearby obstacles and cabinets                        │
│                                                                  │
│  3. Body Collision Check                                        │
│     └─ OBB-OBB SAT against all nearby objects                   │
│     └─ If collision → ERROR (ok=false)                          │
│                                                                  │
│  4. Use Envelope Check                                          │
│     └─ OBB-OBB SAT against all nearby objects                   │
│     └─ If collision → WARNING (ok=true)                         │
│                                                                  │
│  5. Return GateReport                                           │
│     └─ ok: true if no ERRORs                                    │
│     └─ issues: list of all findings                             │
│     └─ summary: human-readable string                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 GateReport Structure

```typescript
interface GateReport {
  ok: boolean;            // true if no ERRORs
  issues: GateIssue[];    // all findings
  summary: string;        // "2 errors, 1 warning"
  formatted: string[];    // ["❌ BODY_COLLISION: ...", "⚠️ ..."]
}

interface GateIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  targetId?: string;
  targetKind?: string;
}
```

---

## 7. File Structure

### 7.1 Core Collision Files

| File | Description |
|------|-------------|
| `src/core/config/snapClearanceConfig.ts` | Constants and policy |
| `src/core/collision/obbTypes.ts` | OBB type definitions |
| `src/core/collision/obbCollision.ts` | OBB-OBB SAT algorithm |
| `src/core/collision/obbBuilder.ts` | Build world OBBs from local definitions |
| `src/core/collision/collisionEngine.ts` | High-level collision detection |
| `src/core/collision/collisionContextBuilder.ts` | Build context from spatial hash |

### 7.2 Math Utilities

| File | Description |
|------|-------------|
| `src/core/math/quaternion.ts` | Quaternion math utilities |
| `src/core/math/transformQ.ts` | Transform with quaternion rotation |

### 7.3 Spatial Indexing

| File | Description |
|------|-------------|
| `src/core/spatial/spatialHash.ts` | Original spatial hash grid |
| `src/core/spatial/spatialHashV3.ts` | V3 with AABB cache + reverse index |

### 7.4 Clearance & Validation

| File | Description |
|------|-------------|
| `src/core/clearance/useEnvelopeTypes.ts` | Door/Drawer types |
| `src/core/clearance/useEnvelopeBuilder.ts` | Build envelope OBBs |
| `src/core/clearance/clearanceValidator.ts` | Validation logic |

### 7.5 World Registry

| File | Description |
|------|-------------|
| `src/core/world/worldCollisionRegistry.ts` | Original registry + spatial hash |
| `src/core/world/worldCollisionRegistryV2.ts` | V2 using SpatialHashV3 |

### 7.6 Snap System

| File | Description |
|------|-------------|
| `src/core/snap/snapPreviewOrchestrator.ts` | Collision-aware snap preview |
| `src/core/snap/overlapScoring.ts` | Face overlap scoring for candidates |
| `src/core/snap/commitSnapHelpers.ts` | Commit snap operations |
| `src/core/gate/runGateAfterSnap.ts` | Gate validation |

### 7.7 Intent & Constraint System

| File | Description |
|------|-------------|
| `src/core/snap/intentTypes.ts` | Intent types and configuration |
| `src/core/snap/intentResolver.ts` | Resolve intent from velocity |
| `src/core/snap/applyIntentBias.ts` | Apply intent bias to candidates |
| `src/core/snap/constraintConfig.ts` | Constraint configuration |
| `src/core/snap/axisLock.ts` | Axis lock for constrained dragging |
| `src/core/snap/stickySnapState.ts` | Sticky candidate + hysteresis |
| `src/core/snap/localVelocity.ts` | Local-axis velocity transform |
| `src/core/snap/predictiveConfig.ts` | Predictive snapping config |
| `src/core/snap/predictiveDelta.ts` | Compute predictive delta |
| `src/core/snap/snapSessionV4.ts` | Complete snap session (V4) |
| `src/core/math/vec3Utils.ts` | Vector3 math utilities |

---

## 8. Integration Points

### 8.1 During Drag (Snap Preview)

```typescript
// In CabinetTransformControls
const previewResult = runSnapPreview({
  targetCabinet,
  movingCabinet,
  movingBodyShape,
  alignment,
  constants,
  registry,
  activeIndex,
});

// previewResult.hasCollision → show error indicator
// previewResult.candidates → for Tab cycling
// previewResult.preview → for ghost cabinet
```

### 8.2 After Commit (Gate Validation)

```typescript
// After snap commit
const gateReport = runGateAfterSnap({
  movedCabId,
  movedBody,
  movedUseEnv,
  registry,
});

if (!gateReport.ok) {
  // Rollback or mark as invalid
}

if (gateReport.issues.length > 0) {
  // Show warnings in UI
}
```

---

## 9. Deterministic Replay

For history/Gate replay, serialize these params:

```typescript
interface CabinetSnapGateParams {
  // Snap params
  aCabId: string;
  bCabId: string;
  snapType: string;
  delta: Vec3;

  // Gate results
  gateOk: boolean;
  gateIssues: GateIssue[];

  // Policy used
  gatePolicy: { bodyCollision: 'ERROR', useEnvelopeCollision: 'WARNING' };

  // Deterministic params
  spatialCellSize: 500;
  nearPaddingMm: 150;
}
```

---

## 10. V3 Optimizations

### 10.1 SpatialHashV3 - AABB Cache + Reverse Index

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPATIAL HASH V3 ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AABB Cache (itemsAabb):                                        │
│  - Pre-computed AABB for each item                              │
│  - No recomputation on query                                    │
│  - Updated only when item moves                                 │
│                                                                  │
│  Reverse Index (itemCells):                                     │
│  - Item ID → Set of cell keys                                   │
│  - O(1) remove without iteration                                │
│  - Delta-based updateObbs                                       │
│                                                                  │
│  Operations:                                                    │
│  - upsert: O(cells touched)                                     │
│  - remove: O(cells item was in) - NOT O(all cells)              │
│  - updateObbs: O(cells changed) - faster than full upsert       │
│  - query: O(cells in query + items in cells)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Quaternion-based Transform

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUATERNION ROTATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Why Quaternion:                                                │
│  - No gimbal lock                                               │
│  - Smooth interpolation (SLERP)                                 │
│  - Accurate OBB generation for rotated cabinets                 │
│                                                                  │
│  TransformQ:                                                    │
│  - position: Vec3 (world space, mm)                             │
│  - rotation: Quat (quaternion)                                  │
│                                                                  │
│  OBB Builder:                                                   │
│  - Local box definition → World OBB                             │
│  - Axes from quaternion rotation                                │
│  - Door/Drawer swing with quaternion composition                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.3 Overlap Scoring for Snap Candidates

```
┌─────────────────────────────────────────────────────────────────┐
│                    OVERLAP SCORING                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Face Overlap Calculation:                                      │
│  - Project cabinet faces onto shared plane                      │
│  - Calculate 2D rectangle overlap                               │
│  - Normalize to 0-1 score                                       │
│                                                                  │
│  Combined Score:                                                │
│  combinedScore = 0.7 * distanceScore + 0.3 * overlapScore       │
│                                                                  │
│  Benefits:                                                      │
│  - Prefers snaps with more contact area                         │
│  - Better alignment for different cabinet sizes                 │
│  - Smarter candidate selection                                  │
│                                                                  │
│  Example:                                                       │
│  ┌─────┐     ┌───────────┐       Score: 0.8 (good)             │
│  │     │─────│           │       Full height overlap            │
│  │     │     │           │                                      │
│  └─────┘     └───────────┘                                      │
│                                                                  │
│  ┌─────┐                         Score: 0.3 (poor)             │
│  │     │──┐                      Partial overlap                │
│  │     │  │ ┌───────────┐                                      │
│  └─────┘  └─│           │                                      │
│             └───────────┘                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.4 Intent-based Snap Selection

```
┌─────────────────────────────────────────────────────────────────┐
│                    VELOCITY-BIASED INTENT                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Drag Direction → Snap Type Bias:                               │
│  - X (left-right) → SIDE_JOIN                                   │
│  - Y (up-down) → STACK                                          │
│  - Z (front-back) → FLUSH_FRONT                                 │
│                                                                  │
│  Local Axes:                                                    │
│  - Use cabinet B's quaternion axes (not world)                  │
│  - Accurate intent even when cabinet is rotated                 │
│                                                                  │
│  Formula:                                                       │
│  newScore = originalScore + (intentBias * 0.15)                 │
│                                                                  │
│  Result: Dragging forward → FLUSH_FRONT wins                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.5 Constraint Snapping (Axis Lock + Hysteresis)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSTRAINT SYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hysteresis (anti-jitter):                                      │
│  - Engage when distance < 50mm                                  │
│  - Disengage when distance > 60mm                               │
│  - Prevents rapid on/off at threshold                           │
│                                                                  │
│  Axis Lock:                                                     │
│  - When engaged: constrain to dominant axis                     │
│  - X-only, Y-only, or Z-only movement                           │
│  - Reduces jitter during snap                                   │
│                                                                  │
│  Sticky Candidate:                                              │
│  - Current candidate stays unless:                              │
│    1. User presses Tab (explicit override)                      │
│    2. New candidate is better by margin > 0.08                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.6 Predictive Snapping (Lookahead)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PREDICTIVE SNAPPING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Algorithm:                                                     │
│  1. Predict position: pos + (velocity * 75ms)                   │
│  2. Use predicted position for engagement decisions             │
│  3. Use real position for actual snap delta                     │
│                                                                  │
│  Adaptive Lookahead:                                            │
│  - Slow drag: 40ms lookahead                                    │
│  - Fast drag: up to 75ms lookahead                              │
│  - Max clamp: 120mm prediction                                  │
│                                                                  │
│  Benefits:                                                      │
│  - Engage snap earlier when dragging fast                       │
│  - Reduce overshoot                                             │
│  - Smoother experience                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Telemetry & Auto-tuning System

### 11.1 Telemetry Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEMETRY PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌───────────────┐    ┌─────────────────┐   │
│  │ Drag/Snap    │───>│  Telemetry    │───>│  Ring Buffer    │   │
│  │ Controllers  │    │  Singleton    │    │  (200 events)   │   │
│  └──────────────┘    └───────┬───────┘    └─────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│                    ┌───────────────────┐                        │
│                    │ Telemetry Pipeline│                        │
│                    └────────┬──────────┘                        │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              ▼              ▼              ▼                    │
│       ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│       │  ALERT    │  │  SUGGEST  │  │  SHADOW   │              │
│       │  Engine   │  │  Engine   │  │  Runner   │              │
│       └─────┬─────┘  └─────┬─────┘  └─────┬─────┘              │
│             │              │              │                     │
│             └──────────────┼──────────────┘                     │
│                            ▼                                    │
│                    ┌───────────────┐                            │
│                    │   Overlay UI  │                            │
│                    └───────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Telemetry Event Types

| Event Kind | Description | Fields |
|------------|-------------|--------|
| `DRAG_TICK` | Per-frame drag metrics | fps, velocity, engaged, candidates |
| `COLLISION_CHECK` | Collision detection | nearItems, satPairs, satHits, ms |
| `GATE_RESULT` | Gate validation | ok, errors, warnings, ms |
| `SNAP_UPDATE` | Snap state change | engaged, axisLock, candidateCount |
| `ALERT` | Threshold alert | code, title, detail, suggestion |
| `SUGGESTION` | Tuning suggestion | code, proposed, confidence, priority |
| `SHADOW_REPORT` | Simulation result | verdict, delta, notes |
| `TUNING_AUDIT` | Apply/Rollback audit | action, sessionId, patch |

### 11.3 Alert Engine

```
┌─────────────────────────────────────────────────────────────────┐
│                    ALERT DEFINITIONS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  COLL_SLOW:                                                     │
│  - Trigger: collision.ms avg > 5ms                              │
│  - Suggestion: "Consider reducing nearPaddingMm"                │
│  - Cooldown: 5s                                                 │
│                                                                  │
│  COLL_SPIKE:                                                    │
│  - Trigger: collision.ms max > 10ms                             │
│  - Suggestion: "Simplify geometry or increase cellSizeMm"       │
│  - Cooldown: 3s                                                 │
│                                                                  │
│  FLIPFLOP_EXCESS:                                               │
│  - Trigger: engagement toggles > 3 in 200ms                     │
│  - Suggestion: "Widen hysteresis gap"                           │
│  - Cooldown: 5s                                                 │
│                                                                  │
│  CAND_EXCESS:                                                   │
│  - Trigger: candidateCount avg > 8                              │
│  - Suggestion: "Reduce snapThresholdMm"                         │
│  - Cooldown: 5s                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.4 Suggestion Engine

| Suggestion Code | From Alert | Proposed Change | Confidence |
|-----------------|------------|-----------------|------------|
| `SUGG_REDUCE_NEAR_PADDING` | COLL_SLOW | nearPaddingMm -20% | 0.75 |
| `SUGG_INCREASE_CELL_SIZE` | COLL_SPIKE | cellSizeMm +25% | 0.65 |
| `SUGG_WIDEN_HYSTERESIS` | FLIPFLOP_EXCESS | disengage +5mm | 0.80 |
| `SUGG_REDUCE_SNAP_THRESHOLD` | CAND_EXCESS | snapThresholdMm -15% | 0.70 |

### 11.5 Shadow Simulation (Shadow-run)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHADOW SIMULATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User triggers "Simulate" from Overlay                       │
│     └─ Suggestions → ShadowOverrides                            │
│     └─ Current state → ShadowRunInput                           │
│                                                                  │
│  2. Run parallel simulation                                     │
│     ┌─────────────────┐  ┌─────────────────┐                    │
│     │   BASE Config   │  │  TRIAL Config   │                    │
│     │  (current)      │  │  (with override)│                    │
│     └────────┬────────┘  └────────┬────────┘                    │
│              │                    │                             │
│              ▼                    ▼                             │
│     ┌─────────────────┐  ┌─────────────────┐                    │
│     │ Collect metrics │  │ Collect metrics │                    │
│     │ - collisionMs   │  │ - collisionMs   │                    │
│     │ - satPairs      │  │ - satPairs      │                    │
│     │ - candidates    │  │ - candidates    │                    │
│     │ - flipFlop      │  │ - flipFlop      │                    │
│     └────────┬────────┘  └────────┬────────┘                    │
│              │                    │                             │
│              └─────────┬──────────┘                             │
│                        ▼                                        │
│  3. Compare & Generate Report                                   │
│     ┌────────────────────────────────────┐                      │
│     │  ShadowReport                      │                      │
│     │  - verdict: IMPROVES/MIXED/WORSENS │                      │
│     │  - delta: % change per metric      │                      │
│     │  - notes: explanations             │                      │
│     └────────────────────────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.6 Shadow Metrics & Verdict

| Metric | Weight | Good | Bad |
|--------|--------|------|-----|
| collisionMsAvg | 0.30 | < -5% | > +5% |
| candidateAvg | 0.25 | < -5% | > +5% |
| satPairsAvg | 0.20 | < 0% | > +10% |
| nearItemsAvg | 0.15 | < 0% | > +10% |
| flipFlopPct | 0.10 | < 0% | > +5% |

**Verdict Logic:**
- `IMPROVES`: All metrics improve or neutral
- `WORSENS`: Any metric > +5% worse
- `MIXED`: Some improve, some worsen
- `INCONCLUSIVE`: Low sample count or no significant change

---

## 12. Apply from Report (Runtime Tuning)

### 12.1 Apply Policy

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLY POLICY RULES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Rule 1: Verdict must be IMPROVES                               │
│  Rule 2: Average suggestion confidence >= 0.65                  │
│  Rule 3: No metric can worsen > 5%                              │
│  Rule 4: Shadow simulation must have been run                   │
│                                                                  │
│  If all rules pass → Apply allowed                              │
│  If any rule fails → Reject with reasons                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.2 Runtime Tuning State

```typescript
interface RuntimeTuningState {
  active: boolean;               // Currently overriding?
  patch: RuntimeTuningPatch;     // What changed: { nearPaddingMm: {from, to} }
  previous: Record<string, number>; // For rollback
  appliedAtTs: number;           // When applied
  sessionId: string;             // Audit trail ID
  lastShadowReportId: string;    // Source simulation
}
```

### 12.3 Config Provider

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIG PROVIDER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Solvers call: getRuntimeConfigs()                              │
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  BASE CONFIG    │ +   │ RUNTIME OVERRIDE│ = Effective Config │
│  │ (file-based)    │     │ (in-memory)     │                    │
│  └─────────────────┘     └─────────────────┘                    │
│                                                                  │
│  Benefits:                                                      │
│  - Single source of truth                                       │
│  - Runtime changes without restart                              │
│  - Automatic rollback on page refresh                           │
│  - Full audit trail                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 12.4 Audit Trail

| Action | When | Logged Data |
|--------|------|-------------|
| `APPLY` | User clicks Apply after IMPROVES verdict | patch, configSnapshot, reportId |
| `ROLLBACK` | User clicks Rollback or manual | activeDurationMs, previous values |
| `REJECT` | Policy check failed | reasons[], reportId |

### 12.5 Apply Flow

```
User clicks "Apply"
       │
       ▼
┌──────────────┐
│ Check Policy │ ─── No ───> REJECT + Log audit
└──────┬───────┘
       │ Yes
       ▼
┌──────────────────────────┐
│ Snapshot current config  │
│ Apply patch to store     │
│ Generate session ID      │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Log APPLY audit event    │
│ Update UI: "Tuning Active"│
└──────────────────────────┘
       │
       ▼
Config Provider now returns
merged (base + override) values
```

### 12.6 Rollback Flow

```
User clicks "Rollback"
       │
       ▼
┌──────────────────────────┐
│ Calculate activeDuration │
│ Get previous values      │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Restore previous config  │
│ Clear override state     │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Log ROLLBACK audit event │
│ Update UI: back to normal│
└──────────────────────────┘
```

---

## 13. Telemetry Files

### 13.1 Core Telemetry

| File | Description |
|------|-------------|
| `src/core/telemetry/telemetrySingleton.ts` | Global ring buffer & counters |
| `src/core/telemetry/telemetryTypes.ts` | Event type definitions |
| `src/core/telemetry/telemetryPipeline.ts` | Alert & Suggest engines |
| `src/core/telemetry/telemetrySelectors.ts` | Query helpers (latestDrag, etc.) |
| `src/core/telemetry/timer.ts` | High-resolution timing |

### 13.2 Alert System

| File | Description |
|------|-------------|
| `src/core/telemetry/alertTypes.ts` | Alert definitions & metadata |
| `src/core/telemetry/alertEngine.ts` | Threshold-based alert detection |

### 13.3 Suggestion System

| File | Description |
|------|-------------|
| `src/core/telemetry/tuningSuggestionTypes.ts` | Suggestion event types |
| `src/core/telemetry/tuningSuggestionEngine.ts` | Alert → Suggestion mapping |
| `src/core/telemetry/syncTuningContext.ts` | Sync current config to engine |

### 13.4 Shadow Simulation

| File | Description |
|------|-------------|
| `src/core/telemetry/shadowMetrics.ts` | Aggregation & verdict logic |
| `src/core/telemetry/shadowOverrides.ts` | Trial config overrides |
| `src/core/telemetry/shadowRunner.ts` | Simulation runner |
| `src/core/telemetry/shadowTelemetry.ts` | Push reports to telemetry |
| `src/core/telemetry/suggestionToOverrides.ts` | Suggestion → Override converter |

### 13.5 Runtime Tuning

| File | Description |
|------|-------------|
| `src/core/config/runtimeTuningTypes.ts` | State & patch types |
| `src/core/config/runtimeTuningStore.ts` | Singleton state store |
| `src/core/config/applyPolicy.ts` | Policy evaluator |
| `src/core/config/configProvider.ts` | Central config accessor |
| `src/core/config/runtimeTuningApply.ts` | Apply/Rollback API |
| `src/core/telemetry/auditTelemetry.ts` | Audit event logging |

### 13.6 UI Components

| File | Description |
|------|-------------|
| `src/components/debug/TelemetryOverlay.tsx` | Debug overlay with all features |

---

## 14. Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    COLLISION & CLEARANCE SYSTEM                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BROAD-PHASE: Spatial Hash Grid (cell=500mm)                    │
│  - O(k) query instead of O(n²)                                  │
│  - Reverse index for O(1) removal                               │
│                                                                  │
│  NARROW-PHASE: OBB-OBB SAT                                      │
│  - 15 separating axis tests                                     │
│  - Accurate for rotated cabinets                                │
│                                                                  │
│  USE ENVELOPE: Door/Drawer clearance                            │
│  - Sample OBBs along swing/pull path                            │
│  - Check clearance at installation                              │
│                                                                  │
│  GATE POLICY:                                                   │
│  - Body collision → ERROR (block)                               │
│  - Use envelope → WARNING (allow with warning)                  │
│                                                                  │
│  DETERMINISTIC: Same inputs → Same outputs                      │
│  - All params serializable                                      │
│  - Replayable from history                                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    TELEMETRY & AUTO-TUNING                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TELEMETRY: Real-time performance monitoring                    │
│  - Ring buffer (200 events)                                     │
│  - Drag/Collision/Gate/Snap events                              │
│  - Alert threshold detection                                    │
│                                                                  │
│  AUTO-SUGGEST: Alert → Suggestion mapping                       │
│  - COLL_SLOW → reduce nearPaddingMm                             │
│  - FLIPFLOP_EXCESS → widen hysteresis                           │
│  - CAND_EXCESS → reduce snapThresholdMm                         │
│                                                                  │
│  SHADOW SIMULATION: Test changes before apply                   │
│  - BASE vs TRIAL parallel simulation                            │
│  - Verdict: IMPROVES / MIXED / WORSENS                          │
│  - Policy-gated apply (confidence >= 65%)                       │
│                                                                  │
│  RUNTIME TUNING: Apply with rollback                            │
│  - In-memory override (not persistent)                          │
│  - Full audit trail (APPLY/ROLLBACK/REJECT)                     │
│  - Config Provider for central access                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

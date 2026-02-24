# Cabinet Snap System - Technical Specification

## Overview

ระบบ Snap สำหรับการประกบ/เข้าหากันของตู้ 2 ใบ (Cabinet A + Cabinet B) แบบ Parametric ที่ผลิตได้จริง

### Constants
| Constant | Value | Description |
|----------|-------|-------------|
| `snapThreshold` | 50mm | ระยะดูด - trigger snap when faces within this distance |
| `minGap` | 1mm | ระยะประกบขั้นต่ำ - minimum gap for manufacturing |
| `angleThreshold` | 5° | ยอมรับ error การหมุน |

### Snap Mode
- **Rigid** (default): เปลี่ยนเฉพาะ transform (ตำแหน่ง/การหมุน), ไม่ resize W/H/D

---

## 1. Data Model

### 1.1 Cabinet มี Local Frame + Envelope

แต่ละตู้มี local coordinate frame (origin + axes) และ "envelope" (bounding box) สำหรับตรวจ collision

```typescript
interface Transform {
  position: Vec3;       // world position (CENTER of cabinet)
  rotationEuler: Vec3;  // euler angles (radians)
}

interface AABB {
  min: Vec3;
  max: Vec3;
}

interface SnapCabinetInstance {
  id: string;
  transform: Transform;
  dimensions: CabinetDimensions;
  anchors: CabinetAnchor[];
  envelope?: AABB;
}
```

### 1.2 Anchor / Face (หัวใจของ Snapping)

การ snap ตู้ไม่ควร snap จาก center-to-center แต่ snap จาก **หน้าที่มีความหมายทางช่าง** เช่น "side face", "back face", "top face"

```typescript
type AnchorKind =
  | 'FACE_LEFT'    // ด้านซ้าย (-X)
  | 'FACE_RIGHT'   // ด้านขวา (+X)
  | 'FACE_BACK'    // ด้านหลัง (-Z)
  | 'FACE_FRONT'   // ด้านหน้า (+Z)
  | 'FACE_TOP'     // ด้านบน (+Y)
  | 'FACE_BOTTOM'; // ด้านล่าง (-Y)

interface CabinetAnchor {
  id: string;
  kind: AnchorKind;
  plane: {
    origin: Vec3;  // จุดบน plane (world space)
    normal: Vec3;  // normal (normalized)
  };
  snapPriority: number;  // higher = more likely to be chosen
}
```

---

## 2. Snap Types (โหมด Snap)

| Type | Description | Compatibility | Priority |
|------|-------------|---------------|----------|
| `SIDE_JOIN` | A.RIGHT ↔ B.LEFT or A.LEFT ↔ B.RIGHT | OPPOSED normals | 100 |
| `FLUSH_FRONT` | A.FRONT ↔ B.FRONT (จัดหน้าเสมอกัน) | ALIGNED normals | 80 |
| `BACK_ALIGN` | A.BACK ↔ B.BACK (island/peninsula) | ALIGNED normals | 70 |
| `STACK` | A.TOP ↔ B.BOTTOM (วางซ้อน) | OPPOSED normals | 60 |

### Compatibility Table

```typescript
const compatibilityPairs: SnapCompatibilityPair[] = [
  { type: 'SIDE_JOIN',   a: 'FACE_RIGHT', b: 'FACE_LEFT',   expected: 'OPPOSED', priority: 100 },
  { type: 'SIDE_JOIN',   a: 'FACE_LEFT',  b: 'FACE_RIGHT',  expected: 'OPPOSED', priority: 100 },
  { type: 'FLUSH_FRONT', a: 'FACE_FRONT', b: 'FACE_FRONT',  expected: 'ALIGNED', priority: 80 },
  { type: 'BACK_ALIGN',  a: 'FACE_BACK',  b: 'FACE_BACK',   expected: 'ALIGNED', priority: 70 },
  { type: 'STACK',       a: 'FACE_TOP',   b: 'FACE_BOTTOM', expected: 'OPPOSED', priority: 60 },
];
```

---

## 3. Snap Algorithm

### 3.1 Candidate Generation

เมื่อผู้ใช้ลาก Cabinet B ใกล้ Cabinet A:

1. Enumerate คู่ anchor ที่เข้าคู่กันได้ (compatibility table)
2. วัดระยะระหว่าง plane-to-plane ตาม normal
3. ถ้าระยะ ≤ `snapThreshold` (50mm) → สร้าง `SnapCandidate`

```typescript
interface SnapCandidate {
  type: SnapType;
  aCabId: string;
  bCabId: string;
  aAnchorId: string;
  bAnchorId: string;
  aAnchorKind: AnchorKind;
  bAnchorKind: AnchorKind;
  distanceMm: number;
  angleErrorDeg: number;
  score: number;
}
```

### 3.2 Scoring

เลือก candidate ที่ "ตั้งใจ" มากที่สุด:

```
score = (distanceScore × 0.60) + (angleScore × 0.25) + (priorityScore × 0.15)

where:
  distanceScore = 1 - clamp(distance / snapThreshold)
  angleScore    = 1 - clamp(angleError / angleThreshold)
  priorityScore = basePriority / 100
```

### 3.3 Solve Transform (Rigid Snap)

**เป้าหมาย**: ทำให้ plane ของ B "ไปอยู่ตรง" กับ plane ของ A โดยมี `minGap`

1. ไม่หมุน B (keep rotation)
2. Translate B ให้ plane B เข้าใกล้ plane A โดยมี minGap=1mm
3. Apply alignment constraints (bottom, front flush)

```typescript
function solveRigidSnap(
  cabA: SnapCabinetInstance,
  cabB: SnapCabinetInstance,
  candidate: SnapCandidate,
  constants: SnapConstants,
  alignment: SnapAlignment
): SnapResult {
  // Calculate signed separation
  const signedSep = planeSeparationAlongA(aAnchor.plane, bAnchor.plane);

  // Target separation is minGap
  const targetSep = constants.minGapMm;
  const deltaAlongNormal = targetSep - signedSep;

  // Apply translation
  const newPos = add(cabB.transform.position, mul(aAnchor.plane.normal, deltaAlongNormal));

  // Apply alignment constraints
  if (alignment.alignBottom) {
    // Align bottoms - both on floor
    newPos.y = cabB.dimensions.height / 2;
  }

  return { resolvedTransformB: { position: newPos, ... }, ... };
}
```

### 3.4 Validation

หลัง solve แล้ว ตรวจ:

1. **Gap check**: ระยะ plane-to-plane ≥ minGap (1mm)
2. **Collision check**: AABB ไม่ overlap (ยกเว้นแค่ touching)

```typescript
function validateSnapResult(
  cabA: SnapCabinetInstance,
  cabB: SnapCabinetInstance,
  result: SnapResult,
  constants: SnapConstants
): SnapResult {
  const errors: string[] = [];

  // Check AABB overlap
  if (aabbOverlap(shrunkA, shrunkB)) {
    errors.push('Collision detected');
  }

  // Check minimum gap
  if (finalSep < constants.minGapMm - 0.1) {
    errors.push(`Gap too small: ${finalSep}mm`);
  }

  return { ...result, isValid: errors.length === 0, validationErrors: errors };
}
```

---

## 4. Feature History (CABINET_SNAP)

บันทึก snap เป็น FeatureNode เพื่อ audit และ Gate:

```typescript
interface CabinetSnapParams {
  aCabId: string;
  bCabId: string;
  snapType: SnapType;
  aAnchorId: string;
  bAnchorId: string;
  aAnchorKind: AnchorKind;
  bAnchorKind: AnchorKind;

  // Constants used
  snapThresholdMm: number;
  minGapMm: number;
  angleThresholdDeg: number;

  // Result
  resolvedTransformB: Transform;
  delta: Vec3;

  // Alignment applied
  alignment: SnapAlignment;
}

interface CabinetSnapFeature extends FeatureNode<CabinetSnapParams> {
  kind: 'CABINET_SNAP';
}
```

### ประโยชน์:
- Undo/redo แบบ deterministic
- Gate ตรวจว่า "ตู้ถูกจัดเรียงอย่างไร"
- สร้าง joinery/connector (เช่น confirmat, joining strip) ในขั้น manufacturing

---

## 5. UX Behavior

### During Drag:
1. ถ้ามี candidate → แสดง ghost preview ของ B ที่ตำแหน่ง snap
2. แสดง label: `SIDE_JOIN (gap 1mm)`
3. Color-coded by snap type:
   - SIDE_JOIN: Green (#22c55e)
   - FLUSH_FRONT: Blue (#3b82f6)
   - BACK_ALIGN: Purple (#8b5cf6)
   - STACK: Amber (#f59e0b)

### On Drop:
1. ถ้ามี valid candidate → commit snap อัตโนมัติ
2. Record CABINET_SNAP feature to history
3. Clear snap preview

### Keyboard:
- Hold `Shift` เพื่อ disable snap ระหว่างลาก

---

## 6. File Structure

| File | Description |
|------|-------------|
| `src/core/types/SnapTypes.ts` | Type definitions |
| `src/core/utils/cabinetSnap.ts` | Snap algorithm engine |
| `src/core/store/useSnapStore.ts` | Zustand state management |
| `src/components/canvas/SnapPreview.tsx` | Visual feedback |
| `src/core/history/historyTypes.ts` | Feature history types |
| `src/core/history/useHistoryStore.ts` | History store |

---

## 7. Integration Points

### CabinetTransformControls
```typescript
// During drag, detect anchor snap candidates
if (snapStoreEnabled && otherSnapInstances.length > 0) {
  const movingSnapInstance = cabinetToSnapInstance(cabinetId, positionMm, dimensions);
  const anchorCandidates = findAllSnapCandidates(movingSnapInstance, otherSnapInstances);

  if (anchorCandidates.length > 0) {
    const bestCandidate = anchorCandidates[0];
    const result = solveRigidSnap(targetInstance, movingSnapInstance, bestCandidate);
    const validated = validateSnapResult(targetInstance, movingSnapInstance, result);
    setActiveSnap(bestCandidate, validated);
  }
}
```

### Gate Validation
- ตรวจว่า snap ทำให้ชน/ไม่ชน
- สร้าง connector/joinery plan (confirmat, joining strip)
- ตรวจ clearance สำหรับ door swing

---

## 8. Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     SNAP ALGORITHM                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CANDIDATE GENERATION                                    │
│     └─ Generate anchor planes (FACE_LEFT/RIGHT/FRONT/etc.) │
│     └─ Check compatibility pairs (SIDE_JOIN, STACK, etc.)  │
│     └─ Filter by snapThreshold (50mm)                       │
│                                                             │
│  2. SCORING                                                 │
│     └─ distanceScore: 60% weight                           │
│     └─ angleScore: 25% weight (angleThreshold=5°)          │
│     └─ priorityScore: 15% weight (SIDE_JOIN=100)           │
│                                                             │
│  3. SOLVE (Rigid Snap)                                      │
│     └─ Translate B to align planes                         │
│     └─ Apply minGap (1mm)                                   │
│     └─ Apply alignment constraints (bottom, front flush)   │
│                                                             │
│  4. VALIDATE                                                │
│     └─ Check AABB collision                                │
│     └─ Verify minGap maintained                            │
│                                                             │
│  5. COMMIT                                                  │
│     └─ Record CABINET_SNAP feature to history              │
│     └─ Enable undo/redo and Gate audit                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

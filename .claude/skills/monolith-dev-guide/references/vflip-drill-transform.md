# V-Flip & Drill Position Transform — Detailed Reference

## Table of Contents
1. [V-Flip Architecture Overview](#v-flip-architecture-overview)
2. [State Resolution Chain](#state-resolution-chain)
3. [Three Systems That Must Sync](#three-systems-that-must-sync)
4. [Cam Rotation (MinifixConfigPanel)](#cam-rotation)
5. [Drill Position Transform (Cabinet3D)](#drill-position-transform)
6. [Rodrigues 180° Formula](#rodrigues-formula)
7. [Implementation Checklist](#implementation-checklist)
8. [Common Mistakes](#common-mistakes)

---

## V-Flip Architecture Overview

The Minifix Transform system provides per-connector orientation control via the HardwareContextMenu (right-click on hardware in X-Ray mode). V-Flip (`flipVertical`) rotates a connector 180° around the bolt axis, which affects three independent rendering systems that must stay in sync.

### Where V-Flip State Lives

```
useCabinetStore.cabinet.hardwareOverrides[key].previewState.flipVertical
  ↓ (resolved via)
resolvePreviewState(pairKeyV2, pairId, hardwareOverrides, globalConfig)
  ↓ (fallback)
useDrillMapStore.flipXStateByPointId[boltPointId]
```

---

## State Resolution Chain

`resolvePreviewState()` in `src/factory/cnc/overlay/resolvePreviewState.ts` uses dual-key resolution:

```
Priority 1: hardwareOverrides[pairKeyV2]?.previewState  (v2 content-addressed, stable across dimension changes)
Priority 2: hardwareOverrides[pairId]?.previewState      (v1 legacy fallback)
Priority 3: globalConfig                                  (cabinet.hardware.minifixConfig)
Priority 4: null                                          (identity / no transform)
```

The resolved `OverlayPreviewState` contains:
- `flipVertical: boolean`
- `flipHorizontal: boolean`
- `rotationX/Y/Z: number`

### Reading Flip State Pattern

```typescript
import { resolvePreviewState } from '../factory/cnc/overlay/resolvePreviewState';

const resolved = resolvePreviewState(
  point.pairKeyV2,     // content-addressed key
  point.pairId,        // legacy pair ID
  hardwareOverrides,   // from useCabinetStore
  null                 // no global config
);
const isFlipped = resolved?.flipVertical
  ?? flipXStateByPointId[boltPoint.id]  // legacy fallback
  ?? false;
```

---

## Three Systems That Must Sync

When V-Flip changes, these three systems must all update:

### 1. Hardware3DOverlay (Cabinet3D.tsx)
Rotates the 3D bolt+cam model 180° around `boltDirWorld` axis.

### 2. Preview3D Cam (MinifixConfigPanel.tsx)
Rotates cam assembly via `camQ` quaternion around cam-local Z axis.

### 3. Drill Indicators (Cabinet3D.tsx → drillMapFlipped)
Transforms drill point positions via Rodrigues 180° rotation around bolt axis through bolt position.

All three consumers receive the same `drillMapFlipped` data:
- `<CADDrillIndicators drillMap={drillMapFlipped} />`
- `<Hardware3DOverlay drillMap={drillMapFlipped} />`
- `<CSGDrillOverlay drillMap={drillMapFlipped} />`

---

## Cam Rotation

In `MinifixConfigPanel.tsx`, the Preview3D component renders the cam housing. V-Flip rotates the ENTIRE cam assembly (body + rim + all indicators) around the bolt axis in cam-local space.

### Correct: Z-axis rotation

```typescript
// Cam-local Z axis = bolt entry direction (socket opening)
// 180° around Z: X→-X (eccentric bore flips), Y→-Y (rim flips top↔bottom)
const camQ = isFlippedCam
  ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
  : new THREE.Quaternion(); // identity

// WRAP entire cam assembly in camQ — not just indicators
<group quaternion={camQ}>
  <mesh>{/* cam body */}</mesh>
  <mesh>{/* rim/flange */}</mesh>
  <mesh>{/* half-moon indicator */}</mesh>
  {/* PZ2 cross, eccentric dot, direction arrow */}
</group>
```

### Why Z-axis?
- The cam cylinder is oriented along Y (its height axis)
- The bolt enters through the cam socket along local Z
- Rotating around Y just spins the cylinder in place — the symmetric body looks identical
- Rotating around Z physically moves the rim from top to bottom and flips the eccentric bore

### Critical Rules
- The ENTIRE assembly must be inside `<group quaternion={camQ}>`, not just asymmetric indicators
- Cam color must NOT change on flip — keep original material (`#909090` normal, `#00ffff` X-Ray)
- Preview3D always receives `xRayMode={false}` (hardcoded) — shows normal metallic colors

---

## Drill Position Transform

In `Cabinet3D.tsx`, a `useMemo` post-processes the drill map when V-Flip is active. This makes drill indicators (ø labels, depth labels, CSG cylinders) follow the hardware rotation.

### Full Implementation

```typescript
const drillMapFlipped = useMemo(() => {
  if (!drillMapData) return drillMapData;

  // 1. Collect BOLT points keyed by pairId (bolt sits on rotation axis)
  const boltByPairId = new Map<string, DrillMapPoint>();
  for (const panel of drillMapData.panels) {
    for (const pt of panel.points) {
      if (pt.purpose === 'BOLT' && pt.pairId) {
        boltByPairId.set(pt.pairId, pt);
      }
    }
  }
  if (boltByPairId.size === 0) return drillMapData;

  // 2. Quick bail-out if no connector is flipped
  let anyFlipped = false;
  for (const [, bolt] of boltByPairId) {
    const ps = resolvePreviewState(bolt.pairKeyV2, bolt.pairId, hardwareOverrides, null);
    const flipped = ps?.flipVertical ?? flipXStateByPointId[bolt.id] ?? false;
    if (flipped) { anyFlipped = true; break; }
  }
  if (!anyFlipped) return drillMapData;

  // 3. Build a flipped copy — Rodrigues 180° rotation
  const newPanels = drillMapData.panels.map(panel => ({
    ...panel,
    points: panel.points.map(point => {
      // Bolt points are the rotation center — they don't move
      if (point.purpose === 'BOLT') return point;
      if (!point.pairId) return point;

      const bolt = boltByPairId.get(point.pairId);
      if (!bolt || !bolt.boltDirection) return point;

      const ps = resolvePreviewState(bolt.pairKeyV2, bolt.pairId, hardwareOverrides, null);
      const isFlipped = ps?.flipVertical ?? flipXStateByPointId[bolt.id] ?? false;
      if (!isFlipped) return point;

      // Rodrigues 180°: P' = C + 2·(v·n̂)·n̂ − v
      const C = bolt.position;
      const d = bolt.boltDirection;
      const len = Math.sqrt(d[0]*d[0] + d[1]*d[1] + d[2]*d[2]);
      if (len < 1e-6) return point;
      const nx = d[0]/len, ny = d[1]/len, nz = d[2]/len;

      // Position transform
      const vx = point.position[0]-C[0], vy = point.position[1]-C[1], vz = point.position[2]-C[2];
      const dot = vx*nx + vy*ny + vz*nz;
      const newPos: [number,number,number] = [
        C[0] + 2*dot*nx - vx,
        C[1] + 2*dot*ny - vy,
        C[2] + 2*dot*nz - vz
      ];

      // Normal vector transform (same formula, no center offset)
      const nvx = point.normal[0], nvy = point.normal[1], nvz = point.normal[2];
      const ndot = nvx*nx + nvy*ny + nvz*nz;
      const newNormal: [number,number,number] = [
        2*ndot*nx - nvx,
        2*ndot*ny - nvy,
        2*ndot*nz - nvz
      ];

      return { ...point, position: newPos, normal: newNormal };
    }),
  }));

  return { ...drillMapData, panels: newPanels };
}, [drillMapData, hardwareOverrides, flipXStateByPointId]);
```

### useMemo Dependencies
- `drillMapData` — raw drill map (changes when cabinet geometry changes)
- `hardwareOverrides` — per-connector flip state from useCabinetStore
- `flipXStateByPointId` — legacy flip state from useDrillMapStore

---

## Rodrigues Formula

The Rodrigues rotation formula for 180° around axis n̂ through center C simplifies to a reflection:

```
P' = C + 2·(v·n̂)·n̂ − v
where v = P − C
```

This is equivalent to: reflect P across the line through C in direction n̂.

For normal vectors (direction only, no position offset):
```
N' = 2·(N·n̂)·n̂ − N
```

### Why Rodrigues?
- It's a single-formula rotation — no need to decompose into rotation matrices
- For 180° specifically, it reduces to a simple reflection formula
- Works in world space directly (no coordinate system conversion needed)
- Both position and normal use the same formula structure

---

## Implementation Checklist

When adding V-Flip support to a new feature:

1. ☐ Read flip state via `resolvePreviewState()` with dual-key resolution
2. ☐ Apply to 3D hardware rendering (quaternion rotation)
3. ☐ Apply to cam preview (Z-axis quaternion in Preview3D)
4. ☐ Apply to drill positions (Rodrigues 180° in drillMapFlipped useMemo)
5. ☐ Pass `drillMapFlipped` to ALL three consumers (CADDrillIndicators, Hardware3DOverlay, CSGDrillOverlay)
6. ☐ Include correct useMemo dependencies

---

## Common Mistakes

| Mistake | Why it's wrong | Correct approach |
|---------|---------------|-----------------|
| Rotating cam around Y-axis | Cylinder is along Y, so rotation is invisible | Rotate around Z-axis (bolt entry direction) |
| Rotating only cam indicators | Body/rim don't flip, looks half-done | Wrap ENTIRE assembly in `<group quaternion={camQ}>` |
| Changing cam color on flip | Visual confusion, no physical meaning | Keep original colors always |
| Forgetting to transform drill normals | Drill direction indicators point wrong way | Apply same Rodrigues to normal vectors |
| Using `drillMapData` instead of `drillMapFlipped` | Drill indicators don't follow hardware | Replace ALL 3 JSX references |
| Reading flip from only one store | Miss overrides or legacy state | Use full resolution chain with fallbacks |

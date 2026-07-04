---
name: monolith-dev-guide
description: "**MONOLITH Manufacturing OS Development Guide**: คู่มือพัฒนา MONOLITH Manufacturing OS ครอบคลุม React+TypeScript+Three.js/R3F+Zustand architecture, Minifix Transform system (V-Flip/H-Flip), drill map position transforms, INSET/OVERLAY connector system, UI theme design system (surface-* tokens), และ code patterns ของ Cabinet3D, MinifixConfigPanel, HardwareContextMenu — ใช้ Skill นี้ทุกครั้งเมื่อผู้ใช้ทำงานกับ MONOLITH codebase, แก้ไข hardware visualization, ปรับ UI theme, เพิ่มฟีเจอร์ใน 3D cabinet viewer, หรือทำงานกับ drill map / hardware overlay / Minifix config / connector system / joint type (INSET/OVERLAY) แม้จะไม่ได้พูดคำว่า 'MONOLITH' โดยตรง หากเห็นว่ากำลังทำงานกับ furniture CAD/CAM app ที่มี Three.js, drill maps, hardware preview, Zustand store ให้ใช้ Skill นี้"
---

# MONOLITH Manufacturing OS — Development Guide

## Overview

MONOLITH Manufacturing OS is a React + TypeScript + Vite furniture CAD/CAM system with Three.js/R3F for 3D rendering and Zustand for state management. This guide captures proven code patterns, architectural decisions, and implementation details from production development.

For detailed references:
- `references/connector-system.md` — **Complete Connector System**: INSET vs OVERLAY algorithms, drill map generation, bolt orientation pipeline, V-Flip/H-Flip transforms, state persistence, stale override prevention
- `references/shelf-connector-system.md` — **Shelf Connector System**: UX/UI design for adding Minifix connectors to internal shelves, data model extensions, drill map generation for shelf junctions, implementation plan
- `references/vflip-drill-transform.md` — V-Flip implementation: cam rotation, drill position Rodrigues transform, resolvePreviewState flow
- `references/ui-theme-system.md` — Design system: surface-* tokens, border-[#333], text-gray-*, ParametricContractPanel patterns

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript + Vite |
| 3D Engine | Three.js + React Three Fiber (R3F) + Drei |
| State | Zustand (with immer + persist middleware) |
| Styling | Tailwind CSS + custom surface-* design tokens |
| Dev Server | localhost:5174 |

---

## Key Architecture

### File Structure (Core Components)

```
src/
├── components/
│   ├── canvas/
│   │   ├── Cabinet3D.tsx         — 3D cabinet scene, hardware overlay, drill indicators
│   │   ├── CADDrillIndicators.tsx — 2D CAD-style drill annotations (circles, labels)
│   │   └── CSGDrillOverlay.tsx   — 3D drill hole cylinders
│   └── ui/
│       ├── MinifixConfigPanel.tsx — Preview3D component, cam/bolt rendering
│       ├── HardwareContextMenu.tsx — Minifix Transform context menu
│       └── PanelConfigModal.tsx   — Panel material/edge configuration
├── core/
│   ├── manufacturing/
│   │   ├── drillMap/
│   │   │   ├── types.ts              — DrillMapPoint, BoltDrillPoint, CamDrillPoint, DrillMap
│   │   │   ├── generateDrillMap.ts   — Drill map generation (INSET + OVERLAY branches)
│   │   │   └── panelBasis.ts         — AABB→world position helpers (INSET + OVERLAY)
│   │   └── hardware/
│   │       └── boltOrientationUtils.ts — getDrillingAxis, computeBoltQuatWithTwist, selectBoltPanelNormalWorld
│   ├── store/
│   │   ├── useCabinetStore.ts    — Cabinet state + hardwareOverrides (immer, persisted)
│   │   └── useDrillMapStore.ts   — Drill map state + flipXStateByPointId
│   └── types/Cabinet.ts          — HardwarePointOverrides, HardwarePreviewState
├── factory/cnc/overlay/
│   └── resolvePreviewState.ts    — Dual-key preview state resolver
└── components/layout/
    └── ParametricContractPanel.tsx — Right sidebar (design system reference)
```

### Zustand Store Pattern

Two primary stores for hardware:

1. **useDrillMapStore** — Drill map data, flipXStateByPointId, visualization settings
2. **useCabinetStore** — Cabinet geometry, hardwareOverrides with immer (persisted)

Hardware overrides use dual-key resolution:
```
pairKeyV2 (content-addressed) → pairId (legacy) → globalConfig → null
```

---

## Connector System (INSET vs OVERLAY)

> **Full reference**: `references/connector-system.md`

### Joint Types
- **INSET** (Side-covers-Top): Bolt on side panel (±X drilling), cam on horizontal panel
- **OVERLAY** (Top-covers-Side): Bolt on horizontal panel (±Y drilling), cam on side panel

### Key Differences Summary

| Aspect | INSET | OVERLAY |
|--------|-------|---------|
| Bolt drilling axis | ±X (horizontal) | ±Y (vertical) |
| Bolt panel | Side panel face | Horizontal panel face |
| CAM panel | Horizontal panel face | Side panel face |
| Joint axis | Y (horiz thickness center) | X (side thickness center) |
| Dowel bolt-side | Face bore 12mm | Edge bore 18mm |
| Dowel cam-side | Edge bore 18mm | Face bore 12mm |
| boltPanelNormal (twist) | Side panel ±X | Horizontal panel ±Y |
| targetPocketCenter offset | Along ±Y | Along ±X |

### Bolt Orientation Pipeline
```
getDrillingAxis(corner, jointType) → boltDirWorld
→ selectBoltPanelNormalWorld(corner) → boltPanelNormal
→ computeBoltQuatWithTwist({boltDir, panelNormal, mountType}) → quaternion
→ V-Flip (180° around boltDir) → H-Flip (rotY += π) → Euler rotations
```

### Stale Override Prevention
When switching INSET↔OVERLAY, clear `hardwareOverrides = {}` in `setJointType` and `flipXStateByPointId = {}` in `regenerateDrillMap` to prevent stale rotation data.

---

## Minifix Transform System

### V-Flip / H-Flip Architecture

The Minifix Transform system allows per-connector orientation control through the HardwareContextMenu (right-click on hardware in X-Ray mode).

**State Resolution Chain:**
```typescript
const resolvedPreview = resolvePreviewState(
  boltPoint.pairKeyV2,    // v2 content-addressed key
  boltPoint.pairId,       // v1 legacy fallback
  hardwareOverrides,      // from useCabinetStore
  null                    // no global config
);
const isFlipped = resolvedPreview?.flipVertical
  ?? flipXStateByPointId[boltPoint.id]
  ?? false;
```

**Three independent systems must stay in sync when V-Flip changes:**

1. **Hardware3DOverlay** (Cabinet3D.tsx) — Rotates the 3D bolt+cam model 180° around boltDirWorld
2. **Preview3D cam** (MinifixConfigPanel.tsx) — Rotates cam assembly via camQ quaternion
3. **Drill indicators** (Cabinet3D.tsx drillMapFlipped) — Transforms drill point positions via Rodrigues 180°

### V-Flip: Rodrigues 180° Formula
```
P' = C + 2·(v·n̂)·n̂ − v     where v = P − C, n̂ = normalize(boltDirection)
N' = 2·(N·n̂)·n̂ − N          (direction-only)
```

### H-Flip: Global Y-Axis Rotation
H-Flip = Euler rotY += π. For all standard bolt directions (±X, ±Y), this reduces to Rodrigues 180° around global Y (0,1,0) through bolt position.

```typescript
// V-Flip and H-Flip applied sequentially in drillMapFlipped useMemo:
if (isVFlipped) pos = rodrigues180(pos, C, nx, ny, nz);  // boltDirection
if (isHFlipped) pos = rodrigues180(pos, C, 0, 1, 0);     // global Y
```

### V-Flip Cam Rotation (MinifixConfigPanel.tsx)

```typescript
const camQ = isFlippedCam
  ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
  : new THREE.Quaternion(); // identity

<group quaternion={camQ}>
  {/* ALL cam meshes: body, rim, indicators */}
</group>
```

### DrillMap Data Structure

```typescript
interface DrillMapPoint {
  id: string;
  position: Vec3Tuple;       // World position [x, y, z]
  normal: Vec3Tuple;         // Drill direction (into material)
  diameter: number;          // mm
  depth: number;             // mm
  purpose: DrillPurpose;     // 'BOLT' | 'CAM_LOCK' | 'DOWEL' | ...
  pairId?: string;           // Links CAM to BOLT
  pairKeyV2?: string;        // Content-addressed key
  boltDirection?: Vec3Tuple; // Direction vector (BOLT only)
  targetPocketCenter?: Vec3Tuple; // Cam pocket center (BOLT only)
}
```

---

## UI Theme Design System

MONOLITH uses a custom dark theme with CSS custom properties (surface tokens) defined in `index.css` and extended via Tailwind config.

### Surface Token Scale

| Token | RGB Value | Usage |
|-------|-----------|-------|
| `surface-0` | `rgb(0, 0, 0)` | Deepest background |
| `surface-1` | `rgb(5, 5, 5)` | Main panel background |
| `surface-2` | `rgb(10, 10, 10)` | Input fields, secondary containers |
| `surface-3` | `rgb(17, 17, 17)` | Hover states, badges |
| `surface-4` | `rgb(26, 26, 26)` | Elevated containers |

### Standard UI Patterns

```
Container:      bg-surface-1 border border-[#333] rounded-lg
Header:         border-b border-[#333] hover:bg-surface-3
Buttons:        bg-surface-2 hover:bg-surface-3 border border-[#333] text-white
Inputs:         bg-surface-2 border border-[#333] rounded-lg text-white font-mono
                focus:border-green-500 focus:ring-1 focus:ring-green-500/20
Labels:         text-[10px] text-gray-500
Section headers: text-[10px] text-gray-500 font-medium
Menu items:     text-gray-400 hover:text-white hover:bg-surface-3
Dividers:       h-px bg-[#333]
Transitions:    transition-all duration-200
```

### Color Accents by Context

| Context | Accent Color |
|---------|-------------|
| Cabinet controls | `green-500` |
| Manufacturing params | `purple-500` |
| Active/flipped state | `orange-400` |
| Corner labels | `cyan-400` |
| Danger/reset | `red-400` |
| Hardware icon | `purple-400` |

---

## X-Ray Mode

- Toggle: `Alt+Z` keyboard shortcut
- State: `useViewStore.xRayMode`
- Hardware3DOverlay: `visible={xRayMode}` — hardware ONLY renders when X-Ray is ON
- Preview3D: receives `xRayMode={false}` hardcoded (always shows normal materials)
- Colors: `#00ffff` (cyan) in X-Ray mode, original metallic colors otherwise

---

## Common Patterns

### Adding New Per-Connector Features

1. **Store state** in `hardwareOverrides` via `useCabinetStore` (persisted with immer)
2. **Resolve state** via `resolvePreviewState()` with dual-key resolution
3. **Apply to 3D hardware** in Hardware3DOverlay (Cabinet3D.tsx)
4. **Apply to cam preview** in Preview3D (MinifixConfigPanel.tsx)
5. **Apply to drill indicators** by post-processing drillMapData with useMemo
6. **Pass transformed data** to ALL consumers: CADDrillIndicators, Hardware3DOverlay, CSGDrillOverlay

### Post-Processing DrillMap Pattern

```typescript
const drillMapTransformed = useMemo(() => {
  if (!drillMapData) return drillMapData;
  // Fast bail-out if no transform needed
  return {
    ...drillMapData,
    panels: drillMapData.panels.map(panel => ({
      ...panel,
      points: panel.points.map(point => {
        return { ...point, position: newPos, normal: newNormal };
      }),
    })),
  };
}, [drillMapData, /* transform dependencies */]);
```

### R3F Quaternion Rotation Pattern

```typescript
const quat = isActive
  ? new THREE.Quaternion().setFromAxisAngle(axis, angle)
  : new THREE.Quaternion(); // identity

<group quaternion={quat}>
  {/* ALL meshes that should rotate together */}
</group>
```

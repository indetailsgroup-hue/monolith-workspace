# Shelf Connector System — UX/UI Design & Implementation Reference

## Table of Contents
1. [Feature Overview](#feature-overview)
2. [Current System Analysis](#current-system-analysis)
3. [UX/UI Design Specification](#ux-ui-design)
4. [Data Model Extensions](#data-model-extensions)
5. [Drill Map Generation for Shelves](#drill-map-generation)
6. [3D Rendering Pipeline](#3d-rendering-pipeline)
7. [Interaction Design](#interaction-design)
8. [Implementation Plan](#implementation-plan)
9. [File Impact Map](#file-impact-map)
10. [Edge Cases & Validation](#edge-cases)

---

## Feature Overview

### Problem Statement
MONOLITH currently supports Minifix connectors (bolt + cam + dowels) only at the 4 cabinet corners (TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT). Internal shelves use only System 32 shelf pins for support. However, fixed shelves in production cabinets frequently require Minifix connectors for structural rigidity — especially in load-bearing applications, tall cabinets, or when shelves cannot be adjustable.

### Goal
Add Minifix connector support at the junction points where internal shelves meet side panels (and optionally dividers), matching the same connector system already used for cabinet corners.

### Visual Reference (From Screenshot)
```
┌──────────────────────────────────────────────┐
│  B 24  [BOLT]────────────────────[BOLT]  B 24│ ← TOP corners
│  ┌──────────────────────────────────────┐    │
│  │         TOP/BOTTOM PANEL             │    │
│  └──────────────────────────────────────┘    │
│  │                                      │    │
│  │                                      │    │
│  ⊕ ← SHELF_LEFT         SHELF_RIGHT → ⊕    │ ← NEW: Shelf connectors
│  │──────────── MAIN SHELF 1 ───────────│    │
│  ⊕                                     ⊕    │
│  │                                      │    │
│  │                                      │    │
│  ┌──────────────────────────────────────┐    │
│  │         TOP/BOTTOM PANEL             │    │
│  └──────────────────────────────────────┘    │
│  B 24  [BOLT]────────────────────[BOLT]  B 24│ ← BOTTOM corners
└──────────────────────────────────────────────┘
```

The red ellipses in the user's screenshot mark the LEFT and RIGHT junctions of Main Shelf 1 with the side panels.

---

## Current System Analysis

### What Exists
- **Cabinet corners**: Full Minifix support (BOLT, CAM_LOCK, BOLT_ENTRY, BOLT_THREAD, DOWEL) via `generateCornerJointPoints()`
- **Shelves**: Count-based creation via `shelfCount`, rendered as panels with role `'SHELF'`
- **Shelf hardware**: System 32 shelf pin holes only (via `ShelfPinCatalog.ts`)
- **Shelf geometry**: Full AABB computation, position overrides (front/back setback, custom Y)
- **Shelf segmentation**: Auto-split by dividers (Shelf 1a, 1b, 1c...)

### What's Missing
- No Minifix drilling for shelf-to-side connections
- No corner types for shelf junctions (only TOP_LEFT/RIGHT, BOTTOM_LEFT/RIGHT exist)
- No joint type selection (INSET/OVERLAY) for shelf connections
- No UI to enable/configure connectors per shelf
- No drill map generation for shelf junction points

---

## UX/UI Design Specification

### Design Principle
Follow the existing MONOLITH pattern: shelf connectors should feel like a natural extension of the current corner connector system, not a separate feature. Users familiar with the corner Minifix system should immediately understand the shelf connector system.

### 1. Shelf Connector Toggle (PanelConfigPanel)

When user clicks on a shelf in 3D view, the PanelConfigPanel appears. Add a new section:

```
┌─────────────────────────────────────────────┐
│ ⚙ Main Shelf 1                              │
│   Individual Configuration                   │
│─────────────────────────────────────────────│
│ Front Setback     [━━━━━━━━━●━━] 20 mm      │
│ Back Setback      [━━━━━━━━━━━●] 46 mm      │
│ Gap Height        [Auto] (401mm)             │
│─────────────────────────────────────────────│
│                                              │
│ 🔩 SHELF CONNECTORS                    NEW  │
│─────────────────────────────────────────────│
│                                              │
│   Connection Type                            │
│   ┌─────────────────┬──────────────────┐    │
│   │  📌 Shelf Pins  │  🔩 Minifix     │    │
│   │  (Adjustable)   │  (Fixed)         │    │
│   └─────────────────┴──────────────────┘    │
│                                              │
│   ┌─ Left Side ──────────────────────────┐  │
│   │ ● Enabled         Joint: [↓ Inset ▾]│  │
│   │ Positions: 1      B: 24mm           │  │
│   └──────────────────────────────────────┘  │
│                                              │
│   ┌─ Right Side ─────────────────────────┐  │
│   │ ● Enabled         Joint: [↓ Inset ▾]│  │
│   │ Positions: 1      B: 24mm           │  │
│   └──────────────────────────────────────┘  │
│                                              │
│   System 32 Positions                        │
│   [64] [96] [128] [160] ...                 │
│                                              │
│   Include Dowels  [●]                       │
│                                              │
└─────────────────────────────────────────────┘
```

### Design Tokens Used
```
Section header:    text-[10px] text-gray-500 font-medium uppercase tracking-widest
Toggle button:     bg-surface-2 hover:bg-surface-3 border border-[#333]
Active toggle:     bg-green-500/10 border-green-500 text-green-400
Side card:         bg-surface-1 border border-[#333] rounded-lg p-3
Joint selector:    Same pattern as top/bottom joint in ConfiguratorPanel
Sys32 chips:       bg-surface-3 text-[10px] rounded px-2 py-0.5 font-mono
Enabled dot:       bg-green-500 w-2 h-2 rounded-full
Disabled dot:      bg-gray-600 w-2 h-2 rounded-full
```

### 2. Connection Type Selector

Two modes for how the shelf connects to side panels:

| Mode | Description | When to Use |
|------|-------------|-------------|
| **Shelf Pins** (default) | System 32 pin holes for adjustable shelves | Standard adjustable shelving |
| **Minifix** (new) | Bolt+cam connectors for fixed shelves | Heavy-duty, structural, permanent |

The toggle switches between the existing `ShelfPinConfigPanel` view and the new `ShelfMinifixConfigPanel`.

### 3. Shelf Minifix Configuration Panel

When "Minifix" mode is selected:

```
┌─────────────────────────────────────────────┐
│ 🔩 Shelf Minifix Configuration               │
│─────────────────────────────────────────────│
│                                              │
│ ┌─ LEFT SIDE ─────────────────────────────┐ │
│ │ [●] Enable Connector                    │ │
│ │                                          │ │
│ │ Joint Type                               │ │
│ │ ┌──────────┬──────────┐                 │ │
│ │ │ ↓ Inset  │ ↑ Overlay│                 │ │
│ │ └──────────┴──────────┘                 │ │
│ │                                          │ │
│ │ ▸ Positions (System 32)                 │ │
│ │   [●] 64mm  [●] 128mm  [ ] 192mm       │ │
│ │                                          │ │
│ │ Distance B         [━━━━●━━━] 24 mm     │ │
│ │ Include Dowels     [●]                   │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ RIGHT SIDE ────────────────────────────┐ │
│ │ [●] Enable Connector                    │ │
│ │ (Same controls as LEFT)                  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ Preview ───────────────────────────────┐ │
│ │  Front View (XY)                         │ │
│ │  ┌───┐                         ┌───┐   │ │
│ │  │⊕B │─────── SHELF ──────────│⊕B │   │ │
│ │  │ C │                         │ C │   │ │
│ │  └───┘                         └───┘   │ │
│ │  ⊕ = Bolt  C = Cam                     │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Total: 4 drill points (2L + 2R)             │
│ + 4 dowels (if enabled)                     │
│─────────────────────────────────────────────│
│ ⚠ Switching to Minifix disables shelf pin   │
│   adjustability for this shelf               │
└─────────────────────────────────────────────┘
```

### 4. X-Ray Mode Visualization

When X-Ray mode (Alt+Z) is active, shelf connectors appear like corner connectors:

```
X-Ray Mode View:
                Side Panel
                    │
    ┌───────────────┼───────────────┐
    │  ø15 CAM      │   ø5 BOLT    │
    │  (cyan ring)  │   (cyan dot) │  ← Shelf connector
    │               │   ø10 ENTRY  │
    ├───────────────┼───────────────┤
    │               │              │
    │    SHELF      │  SIDE PANEL  │
    │               │              │
```

Hardware 3D models (bolt + cam) render at shelf junction points, matching the corner hardware visual style (cyan in X-Ray, metallic in normal).

### 5. Context Menu for Shelf Connectors

Right-clicking shelf hardware opens the same `HardwareContextMenu`:

```
┌─────────────────────────────────────┐
│ 🔧 Minifix Transform                │
│─────────────────────────────────────│
│ Shelf: SHELF_1_LEFT      [cyan]     │
│─────────────────────────────────────│
│ [V] Vertical Flip            [V]    │
│ [H] Horizontal Flip          [H]    │
│─────────────────────────────────────│
│ Fine Rotation                        │
│   Rot X: [-15°]  [+15°]            │
│   ...                               │
└─────────────────────────────────────┘
```

The corner label shows the new shelf corner type (e.g., `SHELF_1_LEFT`) in cyan.

### 6. ConfiguratorPanel Integration

Add a quick toggle in the Structure section:

```
Shelves (Horizontal)
├── BAY 1
│   ├── Count: [- 2 +]
│   └── Fixed Shelves: [●] Shelf 1  [ ] Shelf 2
│       └── (Fixed shelves use Minifix connectors)
```

When a shelf is marked as "Fixed", it automatically gets Minifix connectors instead of shelf pins.

---

## Data Model Extensions

### New Corner Types

```typescript
// Extend CornerType in types.ts
export type CornerType =
  | 'TOP_LEFT' | 'TOP_RIGHT'
  | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT'
  // NEW: Shelf junction corners
  | `SHELF_${number}_LEFT`   // e.g., 'SHELF_1_LEFT'
  | `SHELF_${number}_RIGHT`  // e.g., 'SHELF_1_RIGHT'
  // FUTURE: Shelf-divider junctions
  | `SHELF_${number}_DIV_${number}_LEFT`
  | `SHELF_${number}_DIV_${number}_RIGHT`;
```

### Shelf Connector Config

```typescript
// New interface in types/Cabinet.ts
export interface ShelfConnectorConfig {
  /** Connection mode: shelf-pins (adjustable) or minifix (fixed) */
  connectionType: 'shelf-pins' | 'minifix';

  /** Per-side connector config */
  left: ShelfSideConnectorConfig;
  right: ShelfSideConnectorConfig;
}

export interface ShelfSideConnectorConfig {
  enabled: boolean;
  /** Joint type for this shelf-side connection */
  jointType: JointType;  // 'INSET' | 'OVERLAY'
  /** System 32 Z positions where connectors are placed */
  sys32Positions: number[];  // [64, 128, ...] mm from front
  /** Distance B from shelf edge to bolt center */
  distanceB: number;  // Default: 24mm
  /** Include wooden dowels alongside minifix */
  includeDowels: boolean;
}

// Default config
export const DEFAULT_SHELF_CONNECTOR_CONFIG: ShelfConnectorConfig = {
  connectionType: 'shelf-pins',  // Default to adjustable
  left: {
    enabled: true,
    jointType: 'INSET',  // Shelf is always "inside" side panel
    sys32Positions: [64],  // Single connector at 64mm from front
    distanceB: 24,
    includeDowels: true,
  },
  right: {
    enabled: true,
    jointType: 'INSET',
    sys32Positions: [64],
    distanceB: 24,
    includeDowels: true,
  },
};
```

### Cabinet Structure Extension

```typescript
// In CabinetStructure
export interface CabinetStructure {
  // ... existing fields ...
  shelfCount: number;
  dividerCount: number;

  // NEW: Per-shelf connector configuration
  shelfConnectors?: Record<string, ShelfConnectorConfig>;
  // Key = shelf panel ID or shelf index (e.g., "shelf-0", "shelf-1")
}
```

### Panel Role Extension

```typescript
// Shelf panels that use Minifix get a sub-type marker
export interface CabinetPanel {
  // ... existing fields ...

  /** For SHELF role: whether this shelf uses fixed (Minifix) connection */
  isFixedShelf?: boolean;

  /** Connector config for this shelf (if fixed) */
  connectorConfig?: ShelfConnectorConfig;
}
```

---

## Drill Map Generation for Shelves

### New Function: generateShelfJointPoints()

```typescript
/**
 * Generate Minifix drill points for a shelf-to-side-panel junction.
 *
 * Analogous to generateCornerJointPoints() but for internal shelf connections.
 *
 * SHELF GEOMETRY:
 * - Shelf panel is HORIZONTAL (like TOP/BOTTOM)
 * - Side panel is VERTICAL (same LEFT_SIDE/RIGHT_SIDE)
 * - Joint is always INSET-like: side covers shelf edge
 *
 * DRILLING:
 * - BOLT: on SIDE panel inner face (±X drilling) — same as INSET corner
 * - CAM: on SHELF panel face (±Y drilling) — same as INSET corner
 * - BOLT_ENTRY: on SHELF edge (±X drilling) — same as INSET corner
 * - DOWELs: side=face 12mm, shelf=edge 18mm — same as INSET
 */
function generateShelfJointPoints(
  shelfIndex: number,           // 0-based shelf index
  side: 'LEFT' | 'RIGHT',      // Which side panel
  sys32Z: number,               // System 32 depth position
  positionIndex: number,
  shelfPanel: CabinetPanel,     // The shelf panel
  sidePanel: CabinetPanel,      // LEFT_SIDE or RIGHT_SIDE
  config: MinifixConfig,
  params: DrillingParams,
  jointMode: JointType = 'INSET'
): CornerJointResult
```

### Position Computation

For shelf connectors, the geometry is essentially the same as cabinet corner connectors, but with the shelf's Y position instead of the cabinet top/bottom:

```
SHELF_LEFT (INSET):
  BOLT:       X = sidePanel.innerFace (maxX for LEFT)
              Y = jointAxisY (shelf thickness center)
              Z = maxZ - sys32Z
              Normal = ±X (into side panel)

  CAM:        X = Distance B from LEFT edge of shelf
              Y = shelf face (top or bottom face)
              Z = maxZ - sys32Z
              Normal = ±Y (into shelf face)

  BOLT_ENTRY: X = shelf LEFT edge
              Y = shelf thickness center
              Z = maxZ - sys32Z
              Normal = ±X (into shelf edge)
```

### Key Differences from Corner Joints

| Aspect | Cabinet Corner | Shelf Junction |
|--------|---------------|----------------|
| Horizontal panel | TOP or BOTTOM | SHELF (any Y position) |
| Corner type | TOP_LEFT, etc. | SHELF_1_LEFT, etc. |
| Y position | Fixed (cabinet bounds) | Variable (shelf Y position) |
| Both top AND bottom | N/A | Shelf has connectors on top face OR bottom face (not both) |
| Distance B measurement | From mate edge | From shelf left/right edge |
| Joint axis Y | horizontalAabb center | shelfAabb center |

### Which Face Gets the CAM?

For a shelf with INSET joint:
- **CAM is on SHELF top face** when bolt enters from ABOVE (standard for mid-height shelves)
- **CAM is on SHELF bottom face** is also valid (configurable)
- Default: CAM on top face (bolt shaft goes down from above, cam pocket faces up)

```typescript
// Shelf-specific: determine which face gets the cam
const camOnTopFace = true; // Default: cam pocket on top face of shelf
const camFaceY = camOnTopFace
  ? shelfAabb.max[1]  // Top face
  : shelfAabb.min[1]; // Bottom face
const camNormal: Vec3Tuple = camOnTopFace
  ? [0, -1, 0]  // Drill downward into top face
  : [0, 1, 0];  // Drill upward into bottom face
```

---

## 3D Rendering Pipeline

### Bolt Orientation for Shelf Connectors

Shelf connectors use the same `computeBoltQuatWithTwist` pipeline but with shelf-specific inputs:

```typescript
// For SHELF_1_LEFT (INSET mode):
const boltDir = getDrillingAxis('SHELF_1_LEFT', 'INSET');
// Returns: -X (shaft goes LEFT, into left side panel)

// boltPanelNormal = side panel inner face
const boltPanelNormal = selectBoltPanelNormalWorld('SHELF_1_LEFT');
// LEFT: +X, RIGHT: -X (same as corner)

// Twist computation
const result = computeBoltQuatWithTwist({
  boltDirWorld: boltDir,
  boltPanelNormalWorld: boltPanelNormal,
  mountType: 'INSET',
});
```

### getDrillingAxis Extension

```typescript
export function getDrillingAxis(
  corner: Corner | ShelfCorner,
  jointType: MountType = 'INSET'
): THREE.Vector3 {
  // Handle shelf corners
  if (isShelfCorner(corner)) {
    const side = getShelfSide(corner); // 'LEFT' | 'RIGHT'
    if (jointType === 'INSET') {
      // INSET: bolt shaft into SIDE panel (±X)
      return side === 'LEFT' ? WORLD.X_NEG.clone() : WORLD.X_POS.clone();
    } else {
      // OVERLAY: bolt shaft into SHELF face (±Y)
      // Down into shelf top face, or up into shelf bottom face
      return WORLD.Y_NEG.clone(); // Default: shaft goes down
    }
  }

  // Existing corner logic...
}
```

### V-Flip / H-Flip Support

Shelf connectors automatically inherit V-Flip and H-Flip from the existing `drillMapFlipped` useMemo:
- V-Flip: Rodrigues 180° around boltDirection axis (same as corners)
- H-Flip: Rodrigues 180° around global Y (same as corners)

No changes needed — the existing transform code works on ALL drill points by pairId.

---

## Interaction Design

### User Flow: Enable Shelf Connectors

```
1. User adds shelf via Structure → Shelves → BAY 1 → [+]
2. User clicks on shelf in 3D view
3. PanelConfigPanel opens on right side
4. User scrolls to "Shelf Connectors" section
5. User switches from "Shelf Pins" to "Minifix"
6. Connector config appears (left/right enable, joint type, positions)
7. User toggles System 32 positions where connectors should go
8. Drill map regenerates with new shelf connector points
9. In X-Ray mode (Alt+Z), bolt+cam hardware appears at shelf junctions
10. User can right-click hardware for Minifix Transform menu
```

### User Flow: Quick Toggle via Structure Panel

```
1. Structure → Shelves (Horizontal) → BAY 1
2. New sub-section: "Fixed Shelves" with checkboxes
3. Checking a shelf checkbox marks it as fixed + enables Minifix
4. Unchecking returns to adjustable (shelf pins)
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+Z | Toggle X-Ray mode (existing) — shelf hardware becomes visible |
| V | Vertical Flip (when shelf hardware context menu open) |
| H | Horizontal Flip (when shelf hardware context menu open) |
| Click shelf | Select shelf panel → show config |
| Right-click hardware | Open Minifix Transform for shelf connector |

### Visual States

```
Shelf in normal mode:
  - Shelf panel rendered as solid wood
  - No hardware visible

Shelf in X-Ray mode (connector enabled):
  - Shelf panel semi-transparent
  - Bolt models at left/right junction (cyan color)
  - Cam housing on shelf face (cyan color)
  - Drill indicators: ø5 (bolt), ø10 (entry), ø15 (cam)
  - Distance B dimension lines (orange dashed)

Shelf in X-Ray mode (connector disabled / shelf-pin mode):
  - Shelf panel semi-transparent
  - System 32 pin holes visible (small cyan dots)
  - No Minifix hardware
```

---

## Implementation Plan

### Phase 1: Data Model & Config UI
1. Extend `CornerType` to include shelf corner types
2. Add `ShelfConnectorConfig` interface
3. Add `shelfConnectors` to `CabinetStructure`
4. Create `ShelfMinifixConfigPanel` component
5. Integrate into `PanelConfigPanel` with connection type toggle

### Phase 2: Drill Map Generation
1. Create `generateShelfJointPoints()` function in `generateDrillMap.ts`
2. Extend `generateDrillMap()` to iterate shelf panels
3. Add AABB computation for shelf-side junction
4. Implement correct bolt/cam/entry/dowel positions
5. Set proper pairId/pairKeyV2 for shelf connectors

### Phase 3: 3D Rendering
1. Extend `getDrillingAxis()` for shelf corners
2. Extend `selectBoltPanelNormalWorld()` for shelf corners
3. Extend `boltRotations` useMemo to handle shelf connectors
4. Hardware3DOverlay renders shelf hardware alongside corner hardware
5. V-Flip/H-Flip works automatically (existing system)

### Phase 4: Context Menu & Transform
1. HardwareContextMenu shows shelf corner label (e.g., "SHELF_1_LEFT")
2. Minifix Transform controls work same as corner connectors
3. State persistence via hardwareOverrides (existing system)

### Phase 5: Validation & Edge Cases
1. Shelf minimum width for connector placement
2. Connector vs shelf-pin mutual exclusion
3. Stale override clearing when switching connection type
4. Shelf removal clears associated connectors
5. Divider segmentation: connectors per segment

---

## File Impact Map

| File | Changes |
|------|---------|
| `src/core/types/Cabinet.ts` | Add ShelfConnectorConfig, extend CornerType, extend CabinetPanel |
| `src/core/store/useCabinetStore.ts` | Add shelfConnectors to CabinetStructure, shelf connector actions |
| `src/core/manufacturing/drillMap/generateDrillMap.ts` | Add generateShelfJointPoints(), call from main generate function |
| `src/core/manufacturing/drillMap/panelBasis.ts` | Add shelf-specific position helpers (or reuse existing INSET helpers) |
| `src/core/manufacturing/hardware/boltOrientationUtils.ts` | Extend getDrillingAxis() and selectBoltPanelNormalWorld() for shelf corners |
| `src/components/canvas/Cabinet3D.tsx` | Extend boltRotations for shelf corners, no changes to drillMapFlipped |
| `src/components/ui/PanelConfigPanel.tsx` | Add "Shelf Connectors" section with connection type toggle |
| `src/components/ui/connectors/ShelfMinifixConfigPanel.tsx` | **NEW** — Shelf-specific Minifix config UI |
| `src/components/ui/HardwareContextMenu.tsx` | Handle shelf corner labels in display |
| `src/components/ui/ConfiguratorPanel.tsx` | Add "Fixed Shelves" quick toggle |

---

## Edge Cases & Validation

### Minimum Shelf Width
Shelf width must be at least `2 × distanceB + camDia` (typically 2×24+15 = 63mm) for a connector to fit. Show warning if shelf segment is too narrow.

### Divider Segmentation
When shelves are split by dividers (Shelf 1a, 1b, 1c):
- Each segment gets its own left/right connectors
- Segment connecting to a DIVIDER (not side panel) uses divider's inner face
- Segment connecting to a SIDE panel uses side panel's inner face

### Connection Type Switching
When user switches between "Shelf Pins" and "Minifix":
- Clear associated `hardwareOverrides` for this shelf
- Regenerate drill map
- System 32 pin holes and Minifix holes are mutually exclusive per shelf

### Shelf Removal
When shelf count decreases:
- Remove all drill map points associated with removed shelves
- Clear `hardwareOverrides` for removed shelf connectors
- Clear `shelfConnectors[removedShelfId]` from CabinetStructure

### Vertical Position Conflicts
If two shelves are very close (< 50mm gap):
- Both shelves' connectors may physically overlap
- Show warning with suggested minimum gap
- Enforce minimum gap = shelf thickness + distanceB × 2

### OVERLAY Joint for Shelves
While INSET is the natural joint type for shelves (side covers shelf edge), OVERLAY could be used when:
- Shelf extends past the side panel (exposed edge design)
- Specialized construction requiring bolt from shelf face into side panel edge

For OVERLAY shelf joints, reverse bolt/cam panels:
- BOLT on SHELF face (±Y drilling)
- CAM on SIDE panel face (±X drilling)
- Same pattern as cabinet OVERLAY corners

### Joint Axis Alignment
All drill points in one shelf connector must share the same joint axis:
```typescript
const jointAxisY = (shelfAabb.min[1] + shelfAabb.max[1]) / 2;
// All points: BOLT.y, BOLT_THREAD.y, DOWEL-side.y = jointAxisY
```

---

## Appendix: Component ASCII Mockups

### ShelfMinifixConfigPanel Layout

```
┌───────────────────────────────────────┐
│ 🔩 Shelf Connectors                  │
│───────────────────────────────────────│
│                                       │
│ Connection Type                       │
│ ┌────────────┬────────────┐          │
│ │  📌 Pins   │  🔩 Fix'd │ ← toggle │
│ └────────────┴────────────┘          │
│                                       │
│ ┌─ Left Connection ────────────────┐ │
│ │  [●] Enabled                     │ │
│ │                                  │ │
│ │  Joint  ┌────────┬────────┐     │ │
│ │         │ Inset  │Overlay │     │ │
│ │         └────────┴────────┘     │ │
│ │                                  │ │
│ │  Depth Positions (System 32)     │ │
│ │  [●64] [●128] [ 192] [ 256]    │ │
│ │                                  │ │
│ │  Distance B  [━━●━━━━] 24mm     │ │
│ │  Dowels      [●]                │ │
│ └──────────────────────────────────┘ │
│                                       │
│ ┌─ Right Connection ───────────────┐ │
│ │  [●] Enabled                     │ │
│ │  (Mirror of Left)                │ │
│ │  [🔗 Sync with Left]            │ │
│ └──────────────────────────────────┘ │
│                                       │
│ Summary: 2×2 = 4 connectors + dowels │
└───────────────────────────────────────┘
```

### X-Ray Drill Indicator Layout (Front View)

```
        Side Panel          Shelf              Side Panel
        ┌──────┐   ┌────────────────────┐   ┌──────┐
        │      │   │                    │   │      │
        │  ø5  │   │                    │   │  ø5  │
        │  ┃B  │───│       SHELF        │───│  B┃  │
        │      │   │                    │   │      │
        │      │ø15│                    │ø15│      │
        └──────┘   └────────────────────┘   └──────┘
         ø10 ↗        ø15 = CAM              ↖ ø10
       ENTRY          ø5 = BOLT             ENTRY
                      ø10 = BOLT_ENTRY
```

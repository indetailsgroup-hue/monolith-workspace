# Hardware Preview Keys & Resolution Contract

> **Last Updated:** 2026-02-25
> **Status:** LOCKED (v1)

This document defines the canonical keying and resolution rules for
preview-only transforms (flip/rotation/position) applied to hardware
visualization and CNC overlay rendering.

## Scope

Applies to:
- Hardware3D rendering (Minifix CAM/BOLT/DOWEL)
- CNC Overlay (markers/labels) preview visualization
- DrillMap → Operation mapping (metadata forwarding via `workpieceContext`)

Non-goals:
- Does **not** change manufacturing truth (`Operation.position`, toolpaths, exports).
- Preview transforms must **never** mutate OperationGraph truth.

---

## Key Types

There are three relevant identifiers in the pipeline:

### 1) Point Key (per drill point)

| Field | Value |
|-------|-------|
| **Name** | `pointId` |
| **Source** | `DrillMapPoint.id` |
| **Example** | `cam_lock-TOP_LEFT-0` |
| **Granularity** | one drill point (CAM, BOLT, BOLT_ENTRY, DOWEL each have their own `pointId`) |

Used for:
- per-point fine tuning (rotation/position) of a single point

### 2) Connector Key (per hardware connector set)

| Field | Value |
|-------|-------|
| **Name** | `pairId` |
| **Source** | `DrillMapPoint.pairId` |
| **Example** | `pair-TOP_LEFT-0` |
| **Granularity** | one connector set (CAM + BOLT + BOLT_ENTRY + optional DOWELs) |

Used for:
- per-connector preview transforms (flip/rotation) that must apply
  consistently to all member points

### 3) Global Key (cabinet-wide)

| Field | Value |
|-------|-------|
| **Name** | `global` |
| **Source** | `cabinet.hardware.minifixConfig` |
| **Granularity** | singleton per cabinet |

Used for:
- default preview transform applied to all connectors unless overridden

---

## Canonical Key Decision (LOCKED)

### Per-connector preview state uses `pairId` as the canonical key.

Rationale:
- Users flip/rotate a connector as a unit, not an individual hole.
- All member points of the same connector share the same `pairId`.
- Efficient lookup: one lookup covers CAM+BOLT+DOWEL group.

---

## Storage Locations

### Global preview state (cabinet-wide)
- **Store:** `cabinet.hardware.minifixConfig`
- **Key:** none (singleton)

### Per-connector preview state (connector-wide)
- **Store:** `cabinet.hardwareOverrides[pairId].previewState`
- **Key:** `pairId`

### Per-point override (fine-tune)
- **Store:** `cabinet.hardwareOverrides[pointId]`
- **Key:** `pointId`
- **Note:** intended for point-level position/rotation tweaks, not group flips

---

## Resolution Order

When rendering a point (hardware or overlay), resolve preview state in
the following order:

```
1) cabinet.hardwareOverrides[pairId]?.previewState     (per-connector)
2) cabinet.hardware.minifixConfig                      (global fallback)
3) identity / no-op                                    (no preview transform)
```

---

## Pipeline Requirements (Invariants)

### Invariant A: Member points of a connector MUST carry `pairId`

All points that visually/mechanically belong to the same connector
must share the same `pairId`:
- CAM pocket point(s)
- BOLT axis point(s)
- BOLT_ENTRY edge bore point(s)
- DOWEL point(s), if present

### Invariant B: Preview is visualization-only

- Preview transforms must never modify OperationGraph truth.
- Manufacturing export (DXF/G-code) must remain deterministic and
  independent of preview.

### Invariant C: Overlay and hardware must use the same resolver

To prevent drift:
- Hardware3D and CNC Overlay must use identical preview resolution
  rules and the same key mapping.

---

## Stability Assumptions

Current IDs (`pointId`, `pairId`) are deterministic within a given
cabinet topology and iteration order. They are stable across rebuilds
*as long as*:
- cabinet dimensions/topology do not change the iteration order or
  count of placements
- corner topology remains consistent

### Future upgrade (optional)

> **TODO:** For full stability across dimension changes, migrate
> connector keys to a content-addressed form, e.g.:
> `pair-${cornerType}-${round(sys32Z)}` or another geometric hash
> that is independent of insertion order.

---

## Implementation Notes

- Forward DrillMap metadata through `OperationWorkpieceContext.drillmap`:
  - `pointId`, `pairId`, `anchor`, `normal`, `edgeSide`, etc.
- CNC overlay should apply preview transforms at render time:
  - `P' = A + M(P - A)` (around anchor `A`)
- Hardware3D uses negative scale for flips (`scaleX=-1`, `scaleY=-1`),
  overlay helper must replicate this exactly.

---

## Related Files

| File | Role |
|------|------|
| `src/core/manufacturing/drillMap/generateDrillMap.ts` | ID generation (`generatePointId`, `pairId`) |
| `src/cnc/mapping/mapDrillMapToOps.ts` | Metadata forwarding (`buildDrillmapMetadata`) |
| `src/cnc/transform/workpieceTypes.ts` | `DrillMapVisualMetadata` interface |
| `src/factory/cnc/overlay/cncOverlayTypes.ts` | `CncOverlayPreviewMeta` interface |
| `src/factory/cnc/overlay/buildCncOverlay.ts` | `preview.key` assignment |
| `src/factory/cnc/overlay/overlayPreviewTransform.ts` | Transform helper (`P' = A + M(P-A)`) |
| `src/factory/cnc/overlay/CncOverlayLayer.tsx` | Preview state resolution (renderer) |
| `src/factory/cnc/overlay/CncOverlayMarker.tsx` | Per-marker preview transform |
| `src/core/types/Cabinet.ts` | `HardwarePointOverrides` type |
| `src/core/store/useCabinetStore.ts` | `hardwareOverrides` store actions |

# Hardware Preview Keys & Resolution Contract

> **Last Updated:** 2026-02-25
> **Status:** LOCKED (v2)

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

There are four relevant identifiers in the pipeline:

### 1) Point Key (per drill point)

| Field | Value |
|-------|-------|
| **Name** | `pointId` |
| **Source** | `DrillMapPoint.id` |
| **Example** | `cam_lock-TOP_LEFT-0` |
| **Granularity** | one drill point (CAM, BOLT, BOLT_ENTRY, DOWEL each have their own `pointId`) |

Used for:
- per-point fine tuning (rotation/position) of a single point

### 2) Connector Key v2 (per hardware connector set — content-addressed)

| Field | Value |
|-------|-------|
| **Name** | `pairKeyV2` |
| **Source** | `buildPairKeyV2(cornerType, sys32Z)` |
| **Format** | `pair2-${cornerType}-${Math.round(sys32Z)}` |
| **Example** | `pair2-TOP_RIGHT-37` |
| **Granularity** | one connector set (CAM + BOLT + BOLT_ENTRY + optional DOWELs) |

Used for:
- per-connector preview transforms (flip/rotation) that must apply
  consistently to all member points
- **Stable across dimension changes** — key based on physical System32
  position rather than iteration counter

### 3) Connector Key v1 (legacy — index-based)

| Field | Value |
|-------|-------|
| **Name** | `pairId` |
| **Source** | `generateCornerJointPoints` loop counter |
| **Format** | `pair-${cornerType}-${positionIndex}` |
| **Example** | `pair-TOP_LEFT-0` |
| **Status** | **Legacy** — still generated and forwarded for backward compatibility |

### 4) Global Key (cabinet-wide)

| Field | Value |
|-------|-------|
| **Name** | `global` |
| **Source** | `cabinet.hardware.minifixConfig` |
| **Granularity** | singleton per cabinet |

Used for:
- default preview transform applied to all connectors unless overridden

---

## Canonical Key Decision (LOCKED v2)

### Per-connector preview state uses `pairKeyV2` as the canonical key, with `pairId` as fallback.

Rationale:
- Users flip/rotate a connector as a unit, not an individual hole.
- All member points of the same connector share the same `pairKeyV2`.
- Content-addressed: stable across dimension changes and regeneration.
- Legacy `pairId` fallback ensures backward compatibility.

---

## Storage Locations

### Global preview state (cabinet-wide)
- **Store:** `cabinet.hardware.minifixConfig`
- **Key:** none (singleton)

### Per-connector preview state (connector-wide)
- **Store:** `cabinet.hardwareOverrides[pairKeyV2].previewState`
- **Key:** `pairKeyV2` (primary), `pairId` (legacy fallback)
- **Write policy:** dual-write to both keys during migration period

### Per-point override (fine-tune)
- **Store:** `cabinet.hardwareOverrides[pointId]`
- **Key:** `pointId`
- **Note:** intended for point-level position/rotation tweaks, not group flips

---

## Resolution Order (v2)

When rendering a point (hardware or overlay), resolve preview state in
the following order:

```
1) cabinet.hardwareOverrides[pairKeyV2]?.previewState  (v2 content-addressed)
2) cabinet.hardwareOverrides[pairId]?.previewState      (v1 legacy fallback)
3) cabinet.hardware.minifixConfig                       (global fallback)
4) identity / no-op                                     (no preview transform)
```

---

## Pipeline Requirements (Invariants)

### Invariant A: Member points of a connector MUST carry both `pairId` and `pairKeyV2`

All points that visually/mechanically belong to the same connector
must share the same `pairId` and `pairKeyV2`:
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

### Invariant D: pairKeyV2 is deterministic

`buildPairKeyV2(cornerType, sys32Z)` must always produce the same
output for the same physical position. It depends only on:
- `cornerType` (enum)
- `sys32Z` (System32 position from front edge, mm)

---

## pairKeyV2 Utility

**File:** `src/core/manufacturing/drillMap/pairKeyV2.ts`

```typescript
buildPairKeyV2(cornerType: CornerType, sys32Z: number): string
// → "pair2-TOP_RIGHT-37"

isPairKeyV2(key: string): boolean
// → true for "pair2-*" keys
```

---

## Migration Strategy

1. **Reads** use dual-key resolution (v2 first, v1 fallback)
2. **Writes** dual-write to both v2 and v1 keys
3. **No migration script needed** — the fallback chain handles existing data
4. After 2-3 releases: remove dual-write, simplify resolver to v2-only

---

## Implementation Notes

- Forward DrillMap metadata through `OperationWorkpieceContext.drillmap`:
  - `pointId`, `pairId`, `pairKeyV2`, `anchor`, `normal`, `edgeSide`, etc.
- CNC overlay should apply preview transforms at render time:
  - `P' = A + M(P - A)` (around anchor `A`)
- Hardware3D uses negative scale for flips (`scaleX=-1`, `scaleY=-1`),
  overlay helper must replicate this exactly.

---

## Related Files

| File | Role |
|------|------|
| `src/core/manufacturing/drillMap/pairKeyV2.ts` | `buildPairKeyV2` utility (v2 key generation) |
| `src/core/manufacturing/drillMap/generateDrillMap.ts` | ID generation (`generatePointId`, `pairId`, `pairKeyV2`) |
| `src/cnc/mapping/mapDrillMapToOps.ts` | Metadata forwarding (`buildDrillmapMetadata`) |
| `src/cnc/transform/workpieceTypes.ts` | `DrillMapVisualMetadata` interface |
| `src/factory/cnc/overlay/cncOverlayTypes.ts` | `CncOverlayPreviewMeta` interface |
| `src/factory/cnc/overlay/buildCncOverlay.ts` | `preview.key` assignment |
| `src/factory/cnc/overlay/resolvePreviewState.ts` | Dual-key resolver (v2 → v1 → global → identity) |
| `src/factory/cnc/overlay/overlayPreviewTransform.ts` | Transform helper (`P' = A + M(P-A)`) |
| `src/factory/cnc/overlay/CncOverlayLayer.tsx` | Preview state resolution (renderer) |
| `src/factory/cnc/overlay/CncOverlayMarker.tsx` | Per-marker preview transform |
| `src/core/types/Cabinet.ts` | `HardwarePointOverrides` type |
| `src/core/store/useCabinetStore.ts` | `hardwareOverrides` store actions |

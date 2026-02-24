# Material Stack Skill — MONOLITH

## Purpose
Centralize thickness + cut-size math so 3D, manufacturing, DXF, gate all agree.

## Domain Model
A panel's "real thickness" is derived from:
- Core thickness
- Surface A thickness
- Surface B thickness
- Glue layers (optional, deterministic constant)

## Canonical Formula
```
T_real = T_core + T_surfaceA + T_surfaceB + (2 × T_glue)
```

Where:
- T_glue is a constant (e.g., 0.1mm) if modeled
- Some materials may be 0 on a face (no finish)

## Edge Banding Cut Size Rule
```
CutSize = FinishSize − (EdgeThicknessSide1 + EdgeThicknessSide2) + PreMill
```

Notes:
- PreMill is policy-controlled constant (e.g., 0.5mm per edged side)
- Edge thickness depends on per-edge selection (top/bottom/left/right)

## Mandatory Central Functions
Implement/route all calculations through:
- `calcPanelTotalThickness(panel, defaultSurfaceId)`
- `computePanelCutSize(panel)`
- `getSurfaceThickness(materialId)`
- `getCoreThickness(materialId)`
- `getEdgeThickness(edgeMaterialId)`

## Forbidden Patterns (Hard Fail)
❌ Duplicating formulas inline in:
- Cabinet3D
- PanelConfigPanel
- DXF export
- Gate rules

❌ Hardcoding special-case thickness:
- "back panel is core-mdf-6"
- "surface always melamine 0.3"

## Required Fallback Chains
**Surface:**
```
panel.faces.faceA → cabinetDefaultSurface → safe default
```

**Core:**
```
panel.coreMaterialId → cabinet core default (if exists) → safe default
```

**Edges:**
```
panel.edges[edge] → cabinetDefaultEdge → none
```

## Performance Note
Thickness calculation must be cheap and deterministic:
- Prefer lookup tables (MaterialRegistry)
- No async fetching in thickness computation

## Required Tests
- Changing per-panel core/surfaces updates T_real
- Changing per-edge banding updates CutSize
- Back overlay uses backTotalT derived via `calcPanelTotalThickness(backPanel)`

## Definition of Done
- One formula source-of-truth
- No drift between UI, 3D, manufacturing, export

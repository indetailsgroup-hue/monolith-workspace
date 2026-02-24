# Truth Derivation Skill — MONOLITH

## Purpose
Eliminate "UI changed but 3D/manufacturing didn't" by enforcing a single-source-of-truth derivation chain.

## North-Star Rule
Visual Layer is NOT manufacturing truth.
All geometry + manufacturing + export must derive from the Truth Layer models (Cabinet, CabinetPanel) using shared calculators.

## Scope
Applies to any code that affects:
- panel thickness (realThickness)
- finishWidth / finishHeight
- carcass depth, offsets, Z positions
- cut sizes, BOM, DXF, drillmaps
- gate checks that depend on dimensions/materials

## Mandatory Derivation Chain
1. **CabinetPanel** fields are the authoritative inputs:
   - coreMaterialId
   - faces.faceA / faces.faceB
   - edges.{top,bottom,left,right}
   - finishWidth / finishHeight (manufacturing dims)
   - computed.realThickness (derived)
2. Any "default" (cabinet-level) can only be used as fallback:
   - cabinet.materials.defaultSurface/defaultEdge
   - NEVER hardcode a material in dimension logic

## Forbidden Patterns (Hard Fail)
❌ Hardcoding:
- CORE_MATERIALS['core-mdf-6']
- SURFACE_MATERIALS[defaultSurfaceId]
- "back panel is always 6mm"

❌ Deriving manufacturing/geometry from Visual Layer:
- BoxGeometry sizes used as truth
- material textures/thumbnails used as truth

❌ Using cabinet-level defaults when per-panel fields exist:
- computing depth reduction from cabinet defaults if panel has its own material IDs

## Required Patterns (Pass)
✅ Central calculators:
- computePanelTotalThickness(panel)
- computePanelCutSize(panel)
- resolvePanelSurfaceMaterialId(panel, cabinetDefaultSurface)
- resolvePanelEdgeMaterialId(panel, edge, cabinetDefaultEdge)

✅ Fallback chain example (surface):
panel.faces.faceA → cabinetDefaultSurface → panel.coreMaterialId → safe default

## Review Checklist (Before Merge)
For any PR touching useCabinetStore / ManufacturingCalculator / Cabinet3D / export:
- [ ] Is thickness computed from the panel's material IDs?
- [ ] Are cabinet defaults used only as fallback?
- [ ] Does changing PanelConfig update BOTH 3D and manufacturing?
- [ ] Is there a regression test for the derived result?

## Regression Test Requirement
If you add/modify a derived dimension:
- Add a test that:
  1) Mutates per-panel material/edges via store action
  2) Asserts derived dimension changed (depth reduction / cut size / realThickness)
  3) Asserts invariants still hold (no overlap)

## "Symptom → Likely Cause"
Symptom: UI shows new thickness, but carcass depth unchanged
→ Likely cause: depth reduction computed from cabinet defaults or hardcoded material, not panel-derived thickness.

## Definition of Done
- Changing any per-panel material/edge produces deterministic updates in:
  - computed values
  - geometry layout
  - manufacturing outputs
  - export artifacts

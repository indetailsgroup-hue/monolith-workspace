# Geometry Invariants Skill — MONOLITH

## Purpose
Prevent physically impossible cabinet geometry (overlaps, gaps, out-of-budget OD) by enforcing invariant formulas and tests.

## Cabinet Depth Budget Definition
D = Overall Finished Depth (OD budget)
All panels must lie within [-D/2, +D/2] in cabinet-local Z.

## Key Modes
- BackPanelConstruction: INSET | OVERLAY
- TopJoint: INSET | OVERLAY
- BottomJoint: INSET | OVERLAY

## Canonical Invariants (Back Panel OVERLAY)
Let backTotalT = total finished thickness of back panel (core + surfaces, etc.)

### Carcass (Side/Top/Bottom) rules
```
carcassDepth = D - backTotalT
carcassZ = +backTotalT/2
```

### Back panel rules
```
backZ = -D/2 + backTotalT/2
```

### No overlap & no gap (contact)
```
carcassBackFaceZ = carcassZ - carcassDepth/2
backFrontFaceZ = backZ + backTotalT/2
Must satisfy:
carcassBackFaceZ === backFrontFaceZ
```

### OD budget
```
Carcass front face should reach +D/2:
carcassFrontFaceZ = carcassZ + carcassDepth/2 === +D/2

Back panel back face should reach -D/2:
backBackFaceZ = backZ - backTotalT/2 === -D/2
```

## Canonical Invariants (Back Panel INSET)
Back panel sits inside groove/inset:
- No carcass depth reduction from back thickness unless explicitly modeled
- Back edge banding rules depend on groove visibility

## Edge Thickness Rule (ET)
ET must NOT affect cabinet-local Z placement of panels.
ET affects edge banding/cut sizes, not cabinet OD transform.

## Required Test Suite
Create/maintain:
- overlay invariants tests
- inset invariants tests
- ET independence test
- real-world scenario tests (top/bottom joint combinations)
- regression guards:
  - backDepthReduction uses backTotalT (not backCoreT)
  - backZ uses OD budget formula (not outside)

## When Changing Geometry Logic
You must:
1) Update formulas if truly intended
2) Update tests to match intended physical model
3) Ensure manufacturing dims (finishWidth/finishHeight) remain consistent

## Definition of Done
- Any PR that breaks physical invariants fails tests immediately
- OD budget always respected
- No overlap between back panel and carcass panels in overlay mode

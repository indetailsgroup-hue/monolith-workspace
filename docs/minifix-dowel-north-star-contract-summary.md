# Minifix + Dowel North-Star Contract Summary

## Purpose
This is a contract-ready summary of the agreed Minifix + Dowel behavior.

It is intended for:
- product / design alignment
- cross-team agreement
- regression review checkpoints

This summary is derived from the working baseline and regression history in:
- `docs/minifix-dowel-baseline-spec.md`
- `docs/minifix-dowel-baseline-spec.th.md`
- `docs/minifix-dowel-regression-test-plan.md`

## North-Star Outcomes (What "Correct" Means)

The system is correct only when all of the following are true:

1. **Manufacturing truth is authoritative**
- Drill positions, normals, depths, and purposes are generated correctly
- Overlay and hardware must follow DrillMap, not ad-hoc UI transforms

2. **CAM pocket side and CAM clockface are consistent**
- CAM clockface must be on the same side as the CAM `Ø15` pocket opening
- `Vertical Flip` must flip the CAM face (pocket side), not only the clockface/decal

3. **Bolt/Thread axes are centered in Top/Bottom panel thickness**
- `Ø10` (bolt bore) and `Ø5` (thread/pilot) share the same axis
- Axis must be at the panel thickness center for Top/Bottom panels

4. **Hardware and holes move together**
- For any Flip / Rotation / Move action, hardware and visible hole overlays must remain aligned
- No layer may update independently (DrillMap / CAD overlay / CSG / hardware render)

5. **Connector pattern follows CAD rules**
- Placement count and spacing must follow side-length thresholds (`<= 400`, `> 400`)
- Long-side and short-side patterns must differ per CAD intent
- Pattern composition (Minifix + Dowel grouping) must also match CAD intent, not count only

6. **Dowel spec is standardized**
- Dowel baseline is **`Ø8 x 30`**

## Contract Rules (Behavioral)

### Rule 1: Vertical Flip Semantics
`Vertical Flip` means:
- **Flip Face (Pocket Side)** for CAM / `Ø15`
- not merely clockface rotation/flip

Expected effects:
- CAM pocket opening moves to opposite panel face
- CAM clockface moves with the pocket opening
- yellow CAM circle + `X` overlays move with CAM pocket side
- hardware remains aligned to CAM/BOLT/THREAD holes

### Rule 2: Transform Separation
Transform meanings must remain separate:
- `Vertical Flip` / `Horizontal Flip` = face/side transform intent
- `Rot X/Y/Z` = fine rotation only
- `Move X/Y/Z` = positional offsets only

Implementation constraint:
- flip state must not be inferred from rotation angles (e.g. `rotX`)

### Rule 3: Regeneration Safety
Drill-map regeneration must not overwrite transform overrides immediately.

Expected:
- user transform actions persist visually
- regenerate only runs when drill-relevant inputs actually change

## Contract Rules (Geometric / Manufacturing)

### Rule 4: CAM/BOLT/THREAD Alignment
- CAM, BOLT, and THREAD geometry must remain collinear
- Front-view B24 relationship must remain consistent with CAD intent

### Rule 5: Top/Bottom Thickness Center Axis
For `Top Panel` and `Bottom Panel` Minifix placements:
- `Ø10` and `Ø5` axes must be centered in panel thickness
- hardware flip pivot must use the thickness-center reference (`targetPocketCenter` equivalent)

### Rule 6: Hole/Overlay Consistency
All visible hole representations must express the same DrillMap truth:
- `CADDrillIndicators`
- `CSGDrillOverlay`
- `DrillMapOverlay`

## Contract Rules (Pattern Generation)

### Rule 7: Side-Length Threshold Pattern
Baseline generator rule:
- `sideLen <= 400` -> `CORNER + CORNER`
- `sideLen > 400` -> `CORNER + MIDDLE + CORNER`

Notes:
- `MIDDLE` must be defined explicitly in implementation (Minifix-only or Minifix+Dowel set)
- pattern must be symmetric from panel edges
- threshold rule alone is insufficient; composition/order per slot is part of the contract

Worked example (contract reference):
- `A = 600` -> long-side pattern (`CORNER + MIDDLE + CORNER`)
- `B = 395` -> short-side pattern (`CORNER + CORNER`)

### Rule 8: CAD Spacing Intent (Reference Pattern)
CAD reference intent includes spacing structure such as:
- `37 / 32 / 199 / 32 / 199 / 32 / 37` (example long-side pattern)

This spacing pattern should be preserved in generated positions (or equivalent computed coordinates).

This is an edge-sequence rule, not only a total-length rule.

### Rule 9: Minifix + Dowel Relationship
- Dowel placement is part of the connector pattern logic, not independent decoration
- Dowel placement must remain tied to Minifix spacing and threshold rules
- Section/side CAD references (e.g. `24`, `32`) must remain consistent with generator interpretation

## Known Regression Symptoms (Contract Violations)

Any of the following indicates a contract violation / regression:

1. BOLT label/overlay reverts to `Ø7.5` unexpectedly
2. Vertical Flip changes clockface but not CAM pocket side
3. CAM pocket side flips but hardware stays on old face
4. Hole overlays and hardware render diverge after transforms
5. Transform buttons appear to work in UI but have no visible effect
6. `Ø10` / `Ø5` axes drift away from Top/Bottom thickness center

## Acceptance Checklist (Contract-Level)

A build/change is acceptable only if all pass:

- CAM `Ø15` pocket side flips correctly across panel faces
- CAM clockface remains on pocket-opening side
- `Ø10` + `Ø5` axes centered in Top/Bottom thickness
- Hardware remains aligned with holes under Flip/Rotate/Move
- Transform controls persist without immediate overwrite
- A/B threshold pattern count matches CAD rule
- Dowel spec remains `Ø8 x 30`

## References
- `docs/minifix-dowel-baseline-spec.md`
- `docs/minifix-dowel-baseline-spec.th.md`
- `docs/minifix-dowel-regression-test-plan.md`

# Minifix + Dowel Regression Test Plan (Dev / QA Checklist)

## Purpose
This document converts the Minifix + Dowel baseline spec into a repeatable regression test checklist for developers and QA.

Use this after:
- sync/merge across worktrees
- any Minifix/DrillMap/Overlay/Cabinet3D changes
- UI transform changes
- generator rule updates (A/B threshold logic)

## Preconditions
- run the correct worktree/port intentionally
- confirm which URL is used (`localhost` vs `127.0.0.1`)
- hard refresh (`Ctrl+F5`)
- if testing defaults/transform state, click `Reset All to Calculated`

## Test Matrix (Minimum)

Test all four corners in a cabinet with top + bottom Minifix placements:
- `TOP_LEFT`
- `TOP_RIGHT`
- `BOTTOM_LEFT`
- `BOTTOM_RIGHT`

Test these views:
- `Front` (2D/orthographic)
- `X-Ray` enabled
- one 3D perspective (for sanity check)

## A. Hole / Hardware Alignment Baseline

### A1. CAM / BOLT / THREAD axis alignment (Front view)
Steps:
1. Open `Front` view
2. Zoom into one corner
3. Compare CAM (housing), BOLT (red sleeve area), THREAD (dark threaded part), and labels

Expected:
- CAM / BOLT / THREAD are collinear
- B24 dimension aligns with visible Minifix assembly
- no side-swapped BOLT/THREAD behavior

Repeat:
- all four corners

### A2. Top/Bottom panel centered axis check (`Ø10` + `Ø5`)
Steps:
1. Inspect Top Panel corner in Front view
2. Inspect Bottom Panel corner in Front view
3. Compare `Ø10` and `Ø5` hole axes visually against panel thickness center

Expected:
- `Ø10` and `Ø5` lie on panel thickness center axis
- top and bottom behave consistently

Failure symptom:
- axes visibly drift toward one face (commonly due to CAM-depth-based axis regression)

## B. X-Ray Overlay Consistency

### B1. Hole-type filter correctness
Steps:
1. Enable X-Ray
2. Toggle filters one by one (`ALL`, `CAM`, `BOLT`, `Ø5` and any active set in current UI)

Expected:
- only selected hole types remain visible
- filters affect both CAD indicators and CSG overlay consistently

Failure symptom:
- filter changes labels but not solids, or vice versa

### B2. `Ø7.5` regression check
Steps:
1. Inspect labels/overlays in current merged BOLT display mode

Expected:
- no unintended visible BOLT label fallback to `Ø7.5` in the merged presentation

Failure symptom:
- BOLT overlay/label returns as `Ø7.5`

## C. Vertical Flip Semantics (Critical)

### C1. Vertical Flip = Flip Face (not clockface-only)
Steps:
1. Select one Minifix point
2. Record pre-flip state in Front + X-Ray
3. Click `Vertical Flip`

Expected:
- CAM pocket side (`Ø15` opening side) moves to opposite face
- CAM clockface moves to the same side as the pocket opening
- hardware remains aligned with holes

Failure symptoms:
- clockface flips but `Ø15` pocket side does not
- `Ø15` moves but CAM hardware does not

### C2. Circle + X marker follow the flip
Steps:
1. In X-Ray / CAD overlay mode, observe yellow circle + X for CAM
2. Click `Vertical Flip`

Expected:
- yellow circle and X move to the opposite face with CAM
- CAM normal/entry direction is visually consistent after flip

### C3. Flip pivot stays centered (no drift)
Steps:
1. Compare pre/post vertical flip positions
2. Check if movement is only across panel thickness axis

Expected:
- no lateral drift
- no diagonal drift
- same corner stays same corner (only face side changes)

## D. Other Minifix Transform Controls

### D1. Horizontal Flip works
Steps:
1. Click `Horizontal Flip`

Expected:
- visible geometry/overlay change according to intended semantics
- no immediate reset by regeneration

### D2. Fine Rotation (`Rot X/Y/Z`) persists visibly
Steps:
1. Click `+15°` and `-15°` on each axis
2. Observe model change
3. Switch view / reselect point

Expected:
- visible orientation change
- state persists (not overwritten immediately)

Failure symptom:
- button updates UI state text only, but render does not change

### D3. Move Hardware (X/Y/Z) works and persists
Steps:
1. Apply small moves (`+0.5`, `-0.5`)
2. Apply larger moves (`+5`, `-5`)
3. Observe hardware and associated overlays

Expected:
- hardware moves visibly
- movement is not instantly reverted
- clamp behavior is respected when hitting bounds

## E. Hole/Hardware Coupling Under Transform

### E1. Flip/Rotate/Move keep hole and hardware coupled
Steps:
1. Apply Vertical Flip
2. Apply one rotation (e.g. `Rot Z +15`)
3. Apply one move (e.g. `X +1`)

Expected:
- CAM/BOLT/THREAD meshes stay aligned with their corresponding overlays/holes
- no layer desync between CAD overlay, CSG, and hardware

Failure symptoms:
- hole moves but hardware remains
- hardware moves but yellow circle/X stays old position

## F. Default State / Reset Behavior

### F1. Reset All to Calculated restores baseline
Steps:
1. Modify transform state (flip/rotate/move)
2. Click `Reset All to Calculated`

Expected:
- point overrides reset
- baseline default orientations return
- no stale persisted state overrides remain visible

### F2. Cross-URL storage sanity (`localhost` vs `127.0.0.1`)
Steps:
1. Compare same project behavior across `localhost` and `127.0.0.1`

Expected:
- values may differ because storage namespaces differ
- devs should not treat them as the same persisted environment

## G. CAD Pattern Rules (A/B Threshold >/< 400)

### G1. Long side (`sideLen > 400`) pattern count
Setup:
- use a panel side > 400 mm (e.g. `A = 600`)

Expected:
- generated placement follows `CORNER + MIDDLE + CORNER`
- spacing reflects CAD intent (`37 / 32 / 199 / 32 / 199 / 32 / 37` or equivalent generated positions)

Also verify:
- long-side pattern contains the expected point composition (not count only)
- any `MIDDLE` slot matches the intended CAD placement set (Minifix-only vs Minifix+Dowel, as defined in implementation)

### G2. Short side (`sideLen <= 400`) pattern count
Setup:
- use a panel side < 400 mm (e.g. `B = 395`)

Expected:
- generated placement follows `CORNER + CORNER`
- no unintended middle set

Also verify:
- short-side composition remains reduced (no hidden extra Dowel/Minifix middle group)

### G3. Minifix + Dowel relationship
Expected:
- Dowel placements are tied to Minifix pattern
- c-c spacing `32` is respected where specified by CAD
- symmetry from edges is preserved

### G3.1 Worked example validation (`600 x 395`)
Setup:
- use the CAD reference case with `A = 600`, `B = 395`

Expected:
- A-side uses long pattern (`CORNER + MIDDLE + CORNER`)
- B-side uses short pattern (`CORNER + CORNER`)
- generated positions remain symmetric from edges
- edge-sequence intent matches `37 / 32 / 199 / 32 / 199 / 32 / 37` on the long side (or equivalent coordinates)

### G4. Dowel spec regression check
Expected:
- generated/visualized dowel spec corresponds to **`Ø8 x 30`**

Failure symptom:
- old `Ø6 x 30` behavior reappears

### G5. Threshold-only false pass prevention
Purpose:
- prevent regressions where point count passes but pattern composition/ordering is wrong

Expected:
- tests/review confirm both:
  - placement count
  - placement type order/composition (Minifix vs Dowel grouping per slot)

## H. Cabinet Geometry Regression (Main Shelf 1)

### H1. Main Shelf flush with side panels
Steps:
1. Recalculate cabinet (toggle shelf count or equivalent action)
2. Inspect `Main Shelf 1`

Expected:
- shelf sits flush with side panels (no unexpected side gap)
- shelf dimensions match expected formula (context-specific target values)

Failure symptoms:
- width too narrow due to clearance subtraction
- depth short due to duplicated edge-thickness subtraction

## Quick Triage Map (Symptom -> Likely Cause)

- `Ø7.5` visible again for BOLT:
  - overlay merge/label regression, overwritten `CADDrillIndicators`

- Vertical Flip changes clockface only:
  - flip semantics regressed to decal-only

- Holes and hardware move separately:
  - DrillMap / Overlay / Cabinet3D transform logic desync

- Transform buttons "do nothing":
  - regenerate path overwriting per-point overrides

- Top/Bottom axes not centered:
  - bolt/thread axis math regressed from panel-center rule

## Suggested Automation (Future)

Recommended automated coverage:
- unit tests for side-length threshold pattern count
- generator tests asserting bolt/thread axis = panel thickness center
- render-state tests for vertical flip face-side behavior
- store tests ensuring transform overrides survive non-drill-map updates

# Minifix + Dowel Development Baseline (Reference Spec / Regression Notes)

## Purpose
This document records the agreed baseline behavior for Minifix + Dowel generation, rendering, and transforms.

It is intended to:
- preserve the "known-correct" implementation intent
- prevent regressions when files are overwritten or synced across worktrees
- provide a shared acceptance checklist for dev/debug work

## Scope
This spec covers:
- drill map generation (manufacturing truth)
- drill overlays (CAD / CSG / drill-map overlays)
- hardware rendering alignment (CAM / BOLT / THREAD / DOWEL)
- Minifix transform behavior (flip / rotate / move)
- CAD-driven connector pattern rules (A/B threshold >/< 400 mm)
- related shelf geometry issue that affected validation (Main Shelf 1)

## 0) Core Principle: 3 Layers Must Match

The system is only correct when these 3 layers are consistent:

1. Manufacturing Truth (DrillMap / generator)
- hole position / normal / depth / purpose are correct
- connector count/pattern follows CAD rule

2. Visualization (CADDrillIndicators / CSGDrillOverlay / DrillMapOverlay)
- circles, labels, and X markers match DrillMap exactly
- X-Ray filters isolate real hole types for debugging

3. Hardware Render (Cabinet3D / Hardware3D)
- CAM/BOLT/THREAD meshes sit on the same axis as the generated holes
- flip / rotation / move affects hardware and holes coherently

If any layer uses different logic, common failures appear:
- holes move but hardware stays
- hardware moves but overlays stay
- flip affects clockface only (not CAM pocket side)
- labels show one bore but CSG/mesh indicates another

## 1) Worktree / URL Baseline

### Active multi-worktree mapping
- `determined-williams` -> `http://localhost:5173` (main baseline)
- `dreamy-beaver` -> `http://localhost:5174`
- `keen-jepsen` -> `http://localhost:5175`
- `peaceful-villani` -> `http://localhost:5176`
- `vigorous-cori` -> `http://localhost:5177`
- `wonderful-leakey` -> `http://localhost:5178`

### Critical environment gotchas
- `localhost` and `127.0.0.1` use different `localStorage`
- editing the wrong worktree produces "fixed but unchanged" symptoms
- stale dev server / HMR cache can show old behavior

### Required validation steps after changes
- Hard refresh (`Ctrl+F5`)
- restart the dev server for the target worktree if needed
- use `Reset All to Calculated` for transform/default verification

## 2) Phase A - Align Hole Logic and Hardware Placement (5173 vs 5175)

### Initial split state
- `5173`: hardware correct, holes wrong
- `5175`: holes correct, hardware wrong

### Resolution
- merge correct drill-axis logic and correct hardware placement logic so both use the same geometric references

### Outcome
- both worktrees converged toward consistent Minifix behavior

## 3) Phase B - X-Ray Filters for Hole-Type Debugging

### Problem
Overlapping hole types (`Ø10`, `Ø7.5`, `Ø5`, CAM) made visual inspection unreliable.

### What was added
- X-Ray toolbar filters (e.g. `ALL`, `CAM`, `BOLT`, `Ø5`, and at one stage `Ø7.5`)
- filter propagation into:
  - `CADDrillIndicators`
  - `CSGDrillOverlay`

### Outcome
- easier to verify whether a misalignment is real or just overlay overlap

## 4) Phase C - Merge/Simplify `Ø7.5` into Main BOLT Display

### Requirement
- remove duplicate visual meaning of `Ø7.5` (`BOLT_ENTRY`) in the debug view
- show the larger BOLT bore only
- BOLT bore must appear on the bolt side (not thread side)

### Agreed display behavior
- BOLT shown as the main hole (`Ø10`) with depth `24mm`
- `Ø7.5` hidden as a separate visible item in the merged view

### Matching robustness
Fallback matching was added beyond `pairId` (e.g. corner/depth/nearest matching) because some pairs were incomplete.

### Known regression symptom
- If `Ø7.5` reappears as the visible BOLT label/overlay, treat it as a regression (often caused by file overwrite or stale branch/worktree sync)

## 5) Phase D - Correct Semantics of Vertical Flip (Flip Face vs Flip Clockface)

### Correct meaning
`Vertical Flip` must mean:
- **Flip Face (Pocket Side)**
- not just "flip the CAM clockface/decal"

### Manufacturing interpretation
- CAM pocket opening (`Ø15`) defines the real accessible face
- clockface must stay on the same side as the CAM pocket opening

### Common failure patterns seen
- deriving flip from `rotX` / baseline rotation (causes false flips)
- applying both flip and rotation override changes at once
- applying flip per-point instead of per-corner grouping (split-corner artifacts)

### Baseline rule
- flip is stored as explicit state (e.g. per-point/per-corner flip state)
- rotation overrides are for Rot X/Y/Z only
- `Vertical Flip` changes face-side semantics, not fine rotation

## 6) Phase E - CAM `Ø15` Overlays (Circle + X) Must Flip With Hardware

### Requirement
When Vertical Flip is applied:
- CAM hardware flips to the opposite face
- CAM hole overlay (`Ø15`) flips to the opposite face
- yellow circle + X marker also flip to the opposite face

### Overlay rule (shared)
For CAM/MINIFIX overlays:
- move position across panel thickness (`+ normal * panelThickness`)
- invert normal (`normal = -normal`)

### Layers that must share the same rule
- `CADDrillIndicators`
- `CSGDrillOverlay`
- `DrillMapOverlay`

## 7) Phase F - Bolt/Thread Axis Must Be Centered in Top/Bottom Thickness

### Requirement
For `Top Panel` and `Bottom Panel`:
- `Ø10` bolt axis
- `Ø5` thread/pilot axis
must be centered in the panel thickness.

### Root cause of previous mismatch
- bolt/thread axis calculations incorrectly inherited CAM depth-based offsets (e.g. using `camDepth/2`)

### Correct rule
- compute a bolt axis from panel thickness center (using panel bounds midpoint)
- force both BOLT and BOLT_THREAD to use the same axis

### Acceptance result
- `Ø10` and `Ø5` align on the center axis for top/bottom panels

## 8) Phase G - Hardware Flip Pivot Must Be `targetPocketCenter`

### Problem
Holes were moved to the corrected axis, but hardware still used an older placement reference.

### Correct behavior
- hardware placement should use `targetPocketCenter` (when present) as the primary pivot / alignment reference
- CAM/BOLT matching must resolve the actual paired CAM hole used by the drill map

### Matching strategy baseline
- prefer strongest pair references first (`pairedHoleId`)
- fallback to `pairId`
- fallback to nearest compatible CAM in same logical region/corner

### Outcome
- hardware and hole positions remain coupled through flips and updates

## 9) Phase H - Transform Buttons Not Working (Regenerate Overwrites Overrides)

### Symptoms
These controls appeared to do nothing:
- Horizontal Flip
- Rot X / Rot Y / Rot Z
- Move X / Y / Z

### Root cause
- per-point transform overrides updated correctly
- but drill-map regeneration ran immediately and overwrote the override state
- persisted restore path sometimes restored only position, not rotation

### Fix direction (baseline)
- gate drill-map regeneration behind a dedicated generation key
- regenerate only when drill-relevant inputs actually change
- restore both position and rotation overrides
- avoid effect dependencies that regenerate due to object identity churn

### Note
This is a high-risk regression area if files are overwritten.

## 10) Phase I - CAD Pattern Rules (A/B Threshold + Minifix/Dowel Placement Generator)

This phase is essential and must be included in the baseline.

### CAD references captured from drawings
- panel example dimensions include `600 x 395`
- spacing pattern along the longer side shows:
  - `37 / 32 / 199 / 32 / 199 / 32 / 37`
- pattern is symmetric from both edges
- Minifix and Dowel are used together (not Minifix-only)

### Threshold logic by side length
The generator must distinguish behavior by side length:
- `A > 400mm` -> longer-side pattern (extra middle placement exists)
- `B < 400mm` -> shorter-side pattern (reduced placement count)

This is a side-class rule, not only a raw count rule:
- **A-side (long side)** and **B-side (short side)** must be identified explicitly in the generator context
- the resulting pattern must preserve both count **and composition** (Minifix + Dowel grouping)

### Explicit rule baseline (generator-level)
- `sideLen <= 400` -> `CORNER + CORNER`
- `sideLen > 400` -> `CORNER + MIDDLE + CORNER`

### Worked example (must stay as reference)
For the CAD reference panel `600 x 395`:
- `A = 600` -> `A > 400` -> use long-side pattern (`CORNER + MIDDLE + CORNER`)
- `B = 395` -> `B < 400` -> use short-side pattern (`CORNER + CORNER`)

This example must be used as a regression reference because it exercises both branches in the same panel.

### Important implementation note
`MIDDLE` must be defined explicitly in code/docs as a real placement set:
- Minifix only, or
- Minifix + Dowel pair/set
based on the CAD variant for that side.

Passing only the placement count check is not sufficient. The implementation must preserve:
- which point types exist at each pattern slot
- which slots contain Minifix + Dowel pairs
- which slots are Minifix-only (if applicable by CAD variant)

### Minifix + Dowel relationship
- center-to-center reference spacing `32`
- Dowel placement is tied to Minifix pattern, not independent
- long side gets additional middle pattern
- short side uses reduced pattern

### Edge-to-pattern sequence rule (not just "number of points")
The CAD intent is an edge-sequence rule. For the long-side example, the generated result must honor the sequence structure:
- `37 / 32 / 199 / 32 / 199 / 32 / 37`

This may be represented as explicit coordinates in code, but the resulting geometry must remain equivalent and symmetric from both edges.

### Section-level CAD references that affect generator interpretation
The side/section drawings add constraints that must remain tied to the generator/placement interpretation:
- Minifix vertical reference dimension `24`
- Minifix-to-Dowel spacing reference `32`
- legacy drawing examples may label Dowel as `Ø6 x 30`, but system baseline remains `Ø8 x 30`

### Dowel spec update (agreed baseline)
- old drawing examples may show `Ø6 x 30`
- system baseline must use **`Ø8 x 30`**

### Acceptance for pattern generator
- counts per side match A/B threshold rules
- spacing matches CAD pattern intent (`37/32/199/...`)
- symmetric placement from edges
- Dowel generated as `Ø8 x 30`

## 11) Phase J - Cabinet Geometry Side Issue (Main Shelf 1 Not Flush)

### Symptom
`Main Shelf 1` did not sit flush with side panels and showed wrong dimensions.

### Root cause
- clearance deducted incorrectly in shelf width
- edge thickness deducted twice in shelf depth

### Fix baseline in cabinet geometry logic
- remove duplicated clearance deduction
- remove duplicated edge-thickness deduction from shelf depth
- apply consistently across generate/update/reset/sub-shelf paths

### Important caveat
- must patch the worktree actually running the target port
- existing state may require forced recalc (e.g. shelf count toggle / reset)

## 12) Golden Visual Baselines / Evidence

These screenshots are part of the regression baseline and should be treated as reference evidence:

1. Front Minifix close-up (correct and incorrect states)
- used to verify B24 front-view alignment
- used to detect `Ø7.5` regression and side-swapping mistakes

2. CAD placement reference (`600 x 395`)
- source of truth for spacing / count / symmetry pattern
- source of truth for A/B threshold interpretation

3. Golden app screenshot (`127.0.0.1:5180`)
- valid visual baseline for "correct result" comparison
- must be annotated that it is a different instance/storage namespace than `localhost:5173`

## 13) Known Regression Symptoms (Fast Detection Checklist)

If any of the following appears, assume regression / overwritten file / stale instance:

1. BOLT label/overlay shows `Ø7.5` again
2. Dowel or preview-only geometry appears as oversized or misplaced in the production scene
3. Vertical Flip changes clockface but not CAM pocket side (or vice versa)
4. Holes flip but hardware does not follow (or hardware moves while overlays stay)
5. Transform controls do nothing due to immediate regenerate overwrite
6. Top/Bottom `Ø10` / `Ø5` axes are not centered in panel thickness

## 14) Acceptance Criteria (Must Pass)

The Minifix + Dowel system is considered correct only if all of the following hold:

1. CAM pocket side / `Ø15`
- `Ø15` circle + X appear on the correct entry face
- Vertical Flip moves them to the opposite face correctly

2. Clockface
- CAM clockface is on the same side as the CAM pocket opening
- default orientation matches the agreed baseline
- flip changes side correctly without breaking alignment

3. BOLT / THREAD axis
- `Ø10` and `Ø5` are centered in Top/Bottom thickness for all corners
- axes align with CAM / B24 geometry

4. Hardware-hole coupling
- CAM/BOLT/THREAD meshes align 1:1 with generated holes
- Flip/Rotate/Move operations preserve coupling

5. Transform UI behavior
- Vertical Flip behaves as Flip Face (Pocket Side)
- Horizontal Flip / Rot X/Y/Z / Move X/Y/Z produce visible, persisted changes and are not instantly overwritten

6. Pattern generator (A/B threshold)
- long/short sides produce the correct count of placements
- spacing follows CAD pattern intent
- dowel spec is `Ø8 x 30`

7. Cabinet geometry consistency
- relevant shelves (e.g. Main Shelf 1) are flush with side panels when the geometry rules are applied

## 15) Engineering Rules (Do / Don't)

### Do
- store flip state explicitly (do not infer from rotation)
- keep DrillMap / overlays / hardware render on the same geometric rules
- treat CAD pattern drawings as source-of-truth input for generator logic
- use migrations/resets when default transform behavior changes

### Don't
- do not derive flip from `rotX` or baseline angle heuristics
- do not mix preview-only mesh placement logic into production hardware scene placement
- do not assume `localhost` and `127.0.0.1` share persisted state
- do not validate overlay alignment without hole-type filtering

## 16) Recommended Next Hardening Steps

1. Regression checklist document usage
- Use this spec as a manual review checklist after any Minifix/Dowel changes

2. Automated test coverage
- pattern count by side threshold (`<= 400`, `> 400`)
- bolt/thread axis center = panel thickness center
- vertical flip changes CAM pocket side and keeps hardware aligned
- transform actions are not overwritten by regenerate path

3. Golden screenshot set
- maintain a small versioned set of known-good screenshots for:
  - Front 2D Minifix corner
  - X-Ray CAM/BOLT overlays
  - CAD pattern placement comparison

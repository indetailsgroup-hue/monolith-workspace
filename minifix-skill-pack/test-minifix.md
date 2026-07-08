# /test-minifix - Test Minifix Hardware System

Run comprehensive tests for the Minifix S200 hardware system.
Before starting, read the skill at `.claude/skills/minifix-drillmap/SKILL.md` for full specifications.

## Specifications (Project Default: 18mm wood)

### Hafele Minifix S200 (Catalog FF 3.10)
```
Distance B:        24mm (from MATING EDGE, not front)
CAM Diameter:      15mm
CAM Depth:         13.5mm (for 18mm wood)
CAM Height (dimA): 9mm (for 18mm wood)
Sleeve Diameter:   10mm
Bolt Bore Depth:   17.5mm (manufacturing, not assembly 14.25mm)
Shaft Diameter:    5mm
Shaft Length:      11mm (L)
Ball Head Dia:     6.5mm (NOT 7.5mm)
Dowel Diameter:    8mm
Dowel Split:       12mm (SIDE face) + 18mm (HORIZ edge) = 30mm total
System 32 First:   37mm from front
System 32 Pitch:   32mm
End Offset:        40mm from mating edge
Connector Count:   2 (<=400mm) or 3 (>400mm)
```

## Test Pipeline

### Step 1: Run Unit Tests
```bash
npm run test:minifix
```
If this npm script doesn't exist, run the specific test files:
```bash
npx vitest run src/core/manufacturing/drillMap/__tests__/ --reporter=verbose
npx vitest run src/release/gates/__tests__/gateG11 --reporter=verbose
npx vitest run src/components/canvas/__tests__/minifixRender --reporter=verbose
```

### Step 2: Verify Constants in Source Code
Check these files for correct values matching the spec above:

**Drill Map Defaults:**
- `src/core/manufacturing/drillMap/minifixDefaults.ts`
  - `CAM_DRILLING_SPECS[18]` should have `drillingDepth: 13.5, dimA: 9`
  - `drillingDistanceB` should be `24`
  - `boltBoreDepth` should be `17.5`
  - `ballHeadDia` should be `6.5`

**3D Render Specs:**
- `src/components/canvas/MinifixSet.ts`
  - `S200_SPECS.camHousingDepth` should be `13.5`
  - `S200_SPECS.camHeight` should be `9`
  - `S200_SPECS.ballHeadDia` should be `6.5`
  - `S200_SPECS.drillingDistanceB` should be `24`

**Gate G11 Constants:**
- `src/release/gates/gateG11_types.ts`
  - `DIMENSION_B_STANDARD` should be `24`
  - `DOWEL_DEPTH_SIDE_FACE` should be `12`
  - `DOWEL_DEPTH_HORIZ_EDGE` should be `18`
  - `BOLT_BALL_HEAD_DIAMETER` should be `6.5`

**Hardware Library Presets:**
- `src/components/ui/HardwareLibrary.tsx`
  - 16mm presets should use `camDepth: 12.5` (correct for 16mm)
  - 18mm presets should use `camDepth: 13.5`

### Step 3: Verify Drill Map Generation Logic
Read `src/core/manufacturing/drillMap/generateDrillMap.ts` and check:

**Panel Assignment (Side-covers-Top v4.0):**
- CAM_LOCK must be on HORIZONTAL panel (TOP/BOTTOM) only
- BOLT must be on VERTICAL panel (LEFT_SIDE/RIGHT_SIDE) face only
- BOLT_ENTRY must be on HORIZONTAL panel edge only
- DOWEL split: 12mm on SIDE face, 18mm on HORIZ edge

**Corner Mapping:**
- TOP_LEFT: CAM on TOP, BOLT on LEFT_SIDE, bolt direction = -X
- TOP_RIGHT: CAM on TOP, BOLT on RIGHT_SIDE, bolt direction = +X
- BOTTOM_LEFT: CAM on BOTTOM, BOLT on LEFT_SIDE, bolt direction = -X
- BOTTOM_RIGHT: CAM on BOTTOM, BOLT on RIGHT_SIDE, bolt direction = +X

**Coordinate Mapping:**
- Distance B (24mm) measured from LEFT/RIGHT mating edge, not front
- System 32 positions start at 37mm from FRONT edge
- endOffset = 40mm from mating edge

**Connector Count:**
- faceWidth <= 400mm → 2 connectors
- faceWidth > 400mm → 3 connectors

### Step 4: Verify Coaxial Alignment
- Each CAM point must have a paired BOLT point
- `boltPoint.targetPocketCenter` must equal CAM pocket center
- Tolerance: 0.1mm (MATING_TOLERANCE)

### Step 5: Visual Verification (if dev server running)
```bash
# Start dev server if not running
npm run dev
```

**In the browser:**
1. Open X-Ray mode (Alt+Z or toggle in UI)
2. Check each corner for:
   - Red drill points at correct positions
   - CAM (Ø15) on horizontal panel face
   - BOLT (Ø10) on vertical panel face
   - Dowels (Ø8) at 32mm offset from bolt
3. Check Smart Dimensions:
   - B 24 label with dashed arrow
   - Ø15, Ø10, Ø5, Ø8 labels
4. Test Minifix Transform panel:
   - Click hardware → opens transform panel
   - Vertical Flip (V key) mirrors correctly
   - Horizontal Flip (H key) mirrors correctly
   - Move buttons shift position within bounds
5. Verify no WebGL errors in console

### Step 6: Run Full Verification
```bash
npm run verify
```
Or manually:
```bash
npm run test:run && npm run typecheck:all
```

## Common Issues & Fixes

| Issue | Check | Fix |
|-------|-------|-----|
| Distance B = 34mm | `minifixDefaults.ts` | Change to 24 |
| CAM depth = 12.5mm | `CAM_DRILLING_SPECS[18]` | Change to 13.5 for 18mm |
| Ball head = 7.5mm | `S200_SPECS.ballHeadDia` | Change to 6.5 |
| CAM on SIDE panel | `generateCornerJointPoints()` | Fix panel assignment |
| Dowel depths reversed | SIDE=18/HORIZ=12 | Swap: SIDE=12, HORIZ=18 |
| 3 connectors on small cab | `computeConnectorCount()` | Check threshold 400mm |
| Bolt bore = 14.25 | Manufacturing vs assembly | Use 17.5 for drilling |
| G11 validation fails | Constants mismatch | Sync G11_CONSTANTS with defaults |
| Flip not working | Transform not applied | Check MinifixTransformPanel.tsx |
| dimA = 8mm | Wrong for 18mm wood | Change to 9 |

## After Fixing
1. Re-run `npm run test:minifix` - all tests must pass
2. Re-run `npm run verify` - full pipeline must pass
3. Visual check in X-Ray mode if 3D changes were made
4. Run `npx vitest run --reporter=verbose` for full test output

# /test-minifix - Test Minifix Hardware System

Run comprehensive tests for the Minifix S200 hardware system.

## Specifications to Verify

### Häfele Minifix S200 (per CAD spec)
```
Distance B:     24mm (edge to bolt center)
Cam Diameter:   15mm
Cam Depth:      12.5mm (for 16mm wood)
Cam Height:     8mm (dimA - surface to center)
Sleeve Dia:     10mm
Sleeve Length:  17.5mm
Shaft Length:   11mm (L)
```

## Test Steps

1. **Run Unit Tests**
   ```bash
   npm run test:minifix
   ```

2. **Verify Constants**
   Check these files for correct values:
   - `src/core/manufacturing/drillMap/generateDrillMap.ts`
   - `src/core/manufacturing/drillMap/minifixDefaults.ts`
   - `src/components/canvas/Hardware3D.tsx`

3. **Check Drill Map Generation**
   - Distance B should be 24mm (NOT 34mm)
   - CAM and BOLT must be coaxial
   - System 32 spacing (32mm pitch)
   - First hole at 37mm from front edge

4. **Visual Verification**
   If dev server is running:
   - Open X-Ray mode (Alt+Z)
   - Check drill point positions
   - Verify no WebGL errors

## Common Issues
- Distance B incorrectly set to 34mm
- CAM and BOLT not aligned
- Drill points outside panel bounds

## After Fixing
Run `npm run verify` to ensure all tests pass.

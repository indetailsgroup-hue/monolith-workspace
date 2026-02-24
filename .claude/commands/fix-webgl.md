# /fix-webgl - Debug and Fix WebGL Context Lost Errors

Diagnose and fix WebGL Context Lost errors in the 3D canvas.

## Common Causes

1. **Too Many Draw Calls**
   - Look for components rendering individual meshes in a loop
   - Solution: Use `<Instances>` from @react-three/drei

2. **Console.log in Render Path**
   - Search for console.log in canvas components
   - Solution: Remove or wrap in development-only conditions

3. **Memory Leaks**
   - Textures not disposed in useEffect cleanup
   - Geometries created without useMemo
   - Solution: Add cleanup functions and memoization

4. **Excessive Re-renders**
   - State changes causing frequent re-renders
   - Solution: Use React.memo and proper dependency arrays

## Diagnostic Steps

1. Search for console.log in canvas components:
   ```bash
   grep -r "console.log" src/components/canvas/
   ```

2. Check for unmemoized geometry:
   ```bash
   grep -r "new.*Geometry" src/components/canvas/
   ```

3. Verify InstancedMesh usage for repeated elements

## Files to Check
- `src/components/canvas/Cabinet3D.tsx`
- `src/components/canvas/DrillMapOverlay.tsx`
- `src/components/canvas/Hardware3D.tsx`

## After Fixing
Run `npm run e2e:smoke` to verify no WebGL errors occur.

# Thickness Compliance Skill — MONOLITH

## Purpose
Guarantee all panel thickness calculations use the **single source of truth**:
`src/core/materials/materialThickness.ts`

This prevents the "UI changed but 3D/manufacturing didn't" bug pattern.

## When to Use
- Adding new panel types or creation functions
- Modifying material-related store actions
- Touching geometry calculation for side/top/bottom panels
- Changing back panel construction logic

## Core Rule
**No file may compute thickness using inline formulas.**

Forbidden patterns:
- `core + surface * 2`
- `coreT + surfaceT * 2`
- `hardcoded values (18, 19.6, etc.)`
- `duplicated calculateRealThickness()`

All thickness MUST come from Truth Module.

## Truth Module API

### Location
`src/core/materials/materialThickness.ts`

### Functions

```typescript
// Primary: Calculate total panel thickness
computePanelTotalThickness(panel, defaultSurfaceId, options?)
// → Returns: core + faceA + faceB (+ glue if enabled)

// Dependent geometry: Back depth reduction
computeBackDepthReduction(structure, backPanel, defaultSurfaceId)
// → Returns: 0 for inset, backTotalT for overlay
```

### Store Wrappers (useCabinetStore.ts)

```typescript
calcPanelTotalThickness(panel, defaultSurfaceId)
calcBackDepthReduction(structure, backPanel, defaultSurfaceId)
recomputeCarcassGeometry(cabinet, edgeMaterials)
```

## Invariants (MUST hold)

### Thickness Invariants
1. `panel.computed.realThickness` = `computePanelTotalThickness(panel)`
2. Never hardcode thickness in computed values

### Geometry Invariants (Overlay Mode)
3. `carcassDepth = D - backDepthReduction`
4. `carcassZ = backDepthReduction / 2`
5. `backZ = -D/2 + backTotalT/2`

### Layer Rules
6. **3D Layer**: Never hardcode thickness, read from `panel.computed.realThickness`
7. **Manufacturing Layer**: Never recompute thickness, use panel values

## Mandatory Practices

### When Creating Panels
```typescript
// CORRECT
const actualThickness = calcPanelTotalThickness(panel, defaultSurfaceId);
panel.computed.realThickness = actualThickness;

// WRONG
panel.computed.realThickness = 18; // Hardcoded!
panel.computed.realThickness = core.thickness + surface.thickness * 2; // Inline!
```

### When Back Panel Material Changes
```typescript
// MUST trigger dependent geometry recompute
if (panel.role === 'BACK') {
  recomputeCarcassGeometry(cabinet, state.edgeMaterials);
}
```

### When Reading Thickness in 3D
```typescript
// CORRECT
const t = panel.computed.realThickness;

// WRONG
const t = panel.computed.realThickness ?? 18; // Fallback hides bugs!
```

## Forbidden Patterns (Hard Fail)

```typescript
// ❌ Inline formula
const thickness = coreT + surfaceT * 2;

// ❌ Hardcoded value
const T = 18;
panel.computed.realThickness = T;

// ❌ Duplicate calculator
function myThicknessCalc() {
  return core + faceA + faceB;
}

// ❌ Thickness fallback in render
const t = panel.computed.realThickness ?? 18;
```

## Grep Verification Commands

Run before committing changes:

```bash
# Find inline thickness math (should return 0 in store)
grep -n "surfaceT \* 2\|coreT +\|+ surfaceT" src/core/store/

# Find hardcoded realThickness
grep -n "realThickness: *[0-9]" src/core/store/

# Find forbidden calculators
grep -n "calculateRealThickness" src/core/store/
```

## Required Tests

### Test Files
- `src/core/materials/__tests__/materialThickness.test.ts` (15 tests)
- `src/core/store/__tests__/backPanelGeometry.test.ts` (17 tests)
- `src/core/store/__tests__/thicknessPropagation.test.ts` (9 tests)

### Critical Test Scenarios
1. **Material change propagation**: Change back panel core → carcass depth changes
2. **Surface change propagation**: Change back panel surface → carcass depth changes
3. **Z position invariants**: carcassZ = backDepthReduction/2, backZ = -D/2 + backTotalT/2

### Run Command
```bash
npm run test:run -- src/core/materials src/core/store/__tests__/backPanelGeometry src/core/store/__tests__/thicknessPropagation
```

## Example Scenario

**Cabinet D=560, Back panel HMR18 + HPL0.8×2 (overlay)**

| Value | Formula | Result |
|-------|---------|--------|
| backTotalT | 18 + 0.8×2 | 19.6mm |
| backDepthReduction | backTotalT (overlay) | 19.6mm |
| carcassDepth | D - backDepthReduction | 540.4mm |
| carcassZ | backDepthReduction / 2 | 9.8mm |
| backZ | -D/2 + backTotalT/2 | -270.2mm |

## Definition of Done

- [ ] No inline thickness formulas in store (grep returns 0)
- [ ] All panel creation uses `calcPanelTotalThickness`
- [ ] Back panel changes trigger `recomputeCarcassGeometry`
- [ ] All 41+ thickness tests pass
- [ ] Changing back material visually changes carcass depth in 3D

## Related Skills
- [truth-derivation](../truth-derivation/SKILL.md) - General truth derivation patterns
- [geometry-invariants](../geometry-invariants/SKILL.md) - Geometry constraint rules
- [zustand-reactivity](../zustand-reactivity/SKILL.md) - Store mutation patterns

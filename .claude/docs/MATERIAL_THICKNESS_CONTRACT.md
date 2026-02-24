# Material Thickness Contract — Architecture Document

> **Version:** 1.0.0
> **Status:** Implemented
> **Last Updated:** 2026-02-03

## Executive Summary

This document defines the **Material Thickness Contract** — a set of architectural rules that guarantee panel thickness calculations are consistent across all layers (UI, Store, 3D, Manufacturing).

The contract prevents the critical bug pattern: **"User changed material in UI, but 3D/manufacturing didn't update"**

---

## Problem Statement

### The Bug Pattern

```
User Action: Changed back panel from MDF 6mm to HMR 18mm
Expected:    Carcass depth changes from 553.4mm to 540.4mm
Actual:      Carcass depth stayed at 553.4mm (BUG!)
```

### Root Cause Analysis

1. **Multiple thickness calculators** scattered across codebase
2. **Inline formulas** duplicated the calculation logic
3. **No propagation** — changing panel thickness didn't trigger geometry recompute
4. **Hardcoded values** used as fallbacks hid the real bugs

### Impact

| Layer | Symptom |
|-------|---------|
| UI | Shows correct new thickness |
| Store | Updates only the changed panel |
| 3D | Uses stale geometry (depth unchanged) |
| Manufacturing | Produces wrong cut sizes |

---

## Solution Architecture

### Single Source of Truth

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUTH MODULE                              │
│         src/core/materials/materialThickness.ts              │
├─────────────────────────────────────────────────────────────┤
│  computePanelTotalThickness(panel, defaultSurfaceId)        │
│  computeBackDepthReduction(structure, backPanel, surfaceId) │
│  getThicknessBreakdown(panel, surfaceId)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    STORE WRAPPERS                            │
│                  useCabinetStore.ts                          │
├─────────────────────────────────────────────────────────────┤
│  calcPanelTotalThickness(panel, surfaceId)                  │
│  calcBackDepthReduction(structure, backPanel, surfaceId)    │
│  recomputeCarcassGeometry(cabinet, edgeMaterials)           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         ┌────────┐     ┌────────┐     ┌─────────────┐
         │   UI   │     │   3D   │     │Manufacturing│
         │ (read) │     │ (read) │     │   (read)    │
         └────────┘     └────────┘     └─────────────┘
```

### Data Flow

```
Material Change
      │
      ▼
┌─────────────────────────────────────┐
│ updatePanelMaterial(panelId, ...)   │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ calcPanelTotalThickness(panel)      │ ◄── Truth Module
│ panel.computed.realThickness = t    │
└─────────────────────────────────────┘
      │
      ▼ (if BACK panel)
┌─────────────────────────────────────┐
│ recomputeCarcassGeometry(cabinet)   │
│  - side.finishWidth = D - backT     │
│  - top.finishHeight = D - backT     │
│  - carcassZ = backT / 2             │
│  - backZ = -D/2 + backT/2           │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Zustand notifies subscribers        │
│  - UI re-renders                    │
│  - Cabinet3D re-renders             │
└─────────────────────────────────────┘
```

---

## Contract Rules

### Rule 1: Single Calculator

> **All thickness calculations MUST use the Truth Module.**

```typescript
// ✅ CORRECT
const t = computePanelTotalThickness(panel, defaultSurfaceId);

// ❌ FORBIDDEN
const t = core.thickness + surface.thickness * 2;
const t = 18; // hardcoded
```

### Rule 2: No Inline Formulas

> **No file outside materialThickness.ts may perform thickness arithmetic.**

Forbidden patterns:
- `coreT + surfaceT * 2`
- `thickness * 2`
- `core + faceA + faceB`

### Rule 3: Dependent Geometry Recompute

> **When BACK panel thickness changes, all carcass panels MUST be recomputed.**

```typescript
if (panel.role === 'BACK') {
  recomputeCarcassGeometry(cabinet, edgeMaterials);
}
```

### Rule 4: No Fallbacks in Render Path

> **3D components MUST NOT use thickness fallbacks.**

```typescript
// ✅ CORRECT
const t = panel.computed.realThickness;

// ❌ FORBIDDEN (hides bugs)
const t = panel.computed.realThickness ?? 18;
```

### Rule 5: Manufacturing Reads, Never Computes

> **Manufacturing layer MUST read pre-computed values, never recalculate.**

```typescript
// ✅ CORRECT
const thickness = panel.computed.realThickness;

// ❌ FORBIDDEN
const thickness = getCoreMaterial(panel.coreId).thickness + ...;
```

---

## Thickness Formula

### Standard Panel (1-side or 2-side finish)

```
T_real = T_core + T_surfaceA + T_surfaceB + (T_glue × 2)
```

Where:
- `T_core` = Core material thickness (e.g., 18mm HMR)
- `T_surfaceA` = Face A surface thickness (e.g., 0.8mm HPL)
- `T_surfaceB` = Face B surface thickness (e.g., 0.8mm HPL or 0 if none)
- `T_glue` = Glue layer per interface (default: 0.1mm, disabled in display)

### Back Panel (2-side finish)

```
backTotalT = T_core + (T_surface × 2)
```

Example: MDF 6mm + Melamine 0.3mm × 2 = **6.6mm**

---

## Geometry Invariants

### Overlay Mode (Back panel sits ON the back)

```
carcassDepth = D - backDepthReduction
carcassZ     = backDepthReduction / 2
backZ        = -D/2 + backTotalT/2
```

### Inset Mode (Back panel sits IN grooves)

```
carcassDepth = D  (no reduction)
carcassZ     = 0
backZ        = -D/2 + backPanelInset
```

### Example Calculation (Overlay, D=560, HMR18+HPL0.8)

| Variable | Formula | Value |
|----------|---------|-------|
| backTotalT | 18 + 0.8×2 | 19.6mm |
| backDepthReduction | backTotalT | 19.6mm |
| carcassDepth | D - 19.6 | 540.4mm |
| carcassZ | 19.6 / 2 | 9.8mm |
| backZ | -280 + 9.8 | -270.2mm |

---

## Implementation Files

### Truth Module
```
src/core/materials/materialThickness.ts
├── computePanelTotalThickness()
├── computeBackDepthReduction()
├── getThicknessBreakdown()
├── initMaterialRegistries()
└── getCoreThickness() / getSurfaceThickness()
```

### Store Integration
```
src/core/store/useCabinetStore.ts
├── calcPanelTotalThickness()      // Wrapper
├── calcBackDepthReduction()       // Wrapper
├── recomputeCarcassGeometry()     // Dependent geometry
├── updatePanelMaterial()          // Triggers recompute
└── generatePanels()               // Uses wrappers
```

### Tests
```
src/core/materials/__tests__/materialThickness.test.ts    (15 tests)
src/core/store/__tests__/backPanelGeometry.test.ts        (17 tests)
src/core/store/__tests__/thicknessPropagation.test.ts     (9 tests)
```

---

## Verification Checklist

### Grep Verification
```bash
# Should return 0 results in store
grep -n "surfaceT \* 2" src/core/store/
grep -n "coreT +" src/core/store/
grep -n "realThickness: *[0-9]" src/core/store/
```

### Test Verification
```bash
npm run test:run -- \
  src/core/materials \
  src/core/store/__tests__/backPanelGeometry \
  src/core/store/__tests__/thicknessPropagation
```

### Visual Verification
1. Open cabinet with overlay back panel
2. Change back panel material (e.g., MDF 6mm → HMR 18mm)
3. Observe: carcass panels should visibly shrink in depth
4. Check: side panel depth in UI should show new value

---

## Migration Guide

### For New Panel Types

1. Use `calcPanelTotalThickness()` when setting `computed.realThickness`
2. Never hardcode thickness values
3. If panel affects others, add to `recomputeCarcassGeometry()`

### For Material System Changes

1. Update `materialThickness.ts` formula if needed
2. All consumers automatically get updated values
3. Add tests for new scenarios

### For New Geometry Dependencies

1. Add case to `recomputeCarcassGeometry()`
2. Add test to `thicknessPropagation.test.ts`
3. Document new invariant in this contract

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [Skills: thickness-compliance](../skills/thickness-compliance/SKILL.md) | Implementation checklist |
| [Skills: geometry-invariants](../skills/geometry-invariants/SKILL.md) | Geometry rules |
| [Skills: zustand-reactivity](../skills/zustand-reactivity/SKILL.md) | Store mutation patterns |

---

## Changelog

### v1.0.0 (2026-02-03)
- Initial contract definition
- Truth Module implementation
- Store wrappers and recompute pipeline
- 41 tests covering thickness propagation

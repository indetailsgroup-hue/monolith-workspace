# Zustand Reactivity Skill — MONOLITH (Immer + Zustand)

## Purpose
Guarantee UI → 3D reactivity by preventing nested mutations that don't trigger subscriptions.

## Root Principle
Subscribers only re-render when their selected slice changes by reference/equality.
If Cabinet3D subscribes to `state.cabinets`, mutating only `state.cabinet` (or nested arrays via stale references) may not notify.

## Mandatory Store Mutation Pattern (When 3D subscribes to cabinets)
When mutating panels/cabinets:
1) Locate cabinet by index in `state.cabinets`
2) Mutate through that path
3) Sync `state.cabinet` reference if UI reads it

### Required Template
```ts
const idx = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
if (idx < 0) return;
const cab = state.cabinets[idx];

const panel = cab.panels.find(p => p.id === panelId);
if (!panel) return;

// mutate panel fields here...

state.cabinet = cab; // sync UI reference
```

## Forbidden Patterns (Hard Fail)
❌ Mutating only:
- state.cabinet.panels
- state.cabinet.structure
when 3D reads from state.cabinets or derived selectors from it.

❌ Keeping detached references:
- const panel = state.cabinet.panels.find(...)
- mutate panel
- expecting Cabinet3D to update if it uses cabinets array

## Selector Discipline
- Prefer narrow selectors (id-based) for performance:
  - useCabinetById(state, id)
  - useActiveCabinetFromArray(state)
- Avoid subscribing to huge objects unless necessary.

## Idempotent Updates
All high-frequency setters (hover, pointer move, drag) must be idempotent:
- Early return if value unchanged
- Optional RAF gate for pointer-heavy paths

## Required Regression Tests
When adding store actions used by UI:
- UI→3D: mutate action then assert a derived render input changed
- If action touches panel geometry inputs: also validate invariants test(s)

## Typical "UI changed but 3D didn't" Causes
- Mutated via `state.cabinet` while 3D uses `state.cabinets`
- Selector returns stable reference due to shallow compare + nested mutation
- Derived computations cached/memoized with wrong deps

## Definition of Done
- Any store action that modifies panel geometry inputs updates both:
  - `state.cabinets` path (truth)
  - `state.cabinet` reference (UI convenience)
- A test fails if this wiring is broken.

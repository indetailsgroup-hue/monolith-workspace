# Contributing to Monolith

> **Team Contract for Monolith Development**
> (Safety Gate · Tests · CI)

---

## Welcome to Monolith

Monolith is not just a design tool.
It is a **manufacturing-safe system**.

Every change that reaches `main` **must be producible in the real factory**.

This document defines:

- How Safety Gates work
- How tests must be written
- How CI enforces manufacturing safety

If you are new to the project — **read this first**.

---

## Quick Links

| Resource | Path | Description |
|----------|------|-------------|
| Safety Gate Docs | [docs/SAFETY_GATE.md](docs/SAFETY_GATE.md) | Gate system details, diagrams, error codes |
| CI Workflow | [.github/workflows/gate-tests.yml](.github/workflows/gate-tests.yml) | Required check for all PRs |
| Gate Tests | [src/gate/rules/connectors/__tests__/](src/gate/rules/connectors/__tests__/) | Reference test implementations |
| Test Helpers | [src/gate/rules/connectors/__tests__/helpers/](src/gate/rules/connectors/__tests__/helpers/) | Factory functions for tests |

---

## 1. Development Workflow

### Install

```bash
npm ci
```

### Run gate tests only (fast)

```bash
npm run test:gate
```

### Run all tests + coverage (CI equivalent)

```bash
npm run test:coverage
```

> Always run `test:coverage` before opening a PR.

---

## 2. What is a Safety Gate?

**Safety Gate = Manufacturing Truth**

A Safety Gate validates that:

- hardware placement
- drill positions
- connector geometry

are **physically manufacturable**, not just visually correct.

If a Gate fails:

- Export is blocked
- Release is blocked
- PR merge is blocked (via CI)

---

## 3. Where Gate Logic Lives

```
src/gate/
└── rules/
    └── connectors/
        ├── validateMinifixConnector.ts
        ├── drillMapIndex.ts
        ├── minifixConstraintTypes.ts
        └── __tests__/
            ├── drillMapIndex.spec.ts
            ├── validateMinifixGate.spec.ts
            ├── validateMinifixGate.property.spec.ts
            ├── validateMinifixGate.snapshot.spec.ts
            ├── validateMinifixGate.multipair.spec.ts
            └── helpers/
                └── drillMapFactory.ts
```

Gate logic **lives in the root app**, not in workspace packages.

---

## 4. Mandatory Test Levels (ALL required)

Every new Gate or rule **must include all 4 levels**:

### 1. Unit Tests

Validate single rules (e.g. Y-mismatch, pairing).

### 2. Snapshot Tests

Lock GateResult payload structure (contract stability).

### 3. Property-based Tests

Randomized geometry cases using `fast-check`.

### 4. Multi-pair / Multi-panel Tests

Multiple connectors across panels with mixed validity.

> PRs without full test coverage will be rejected.

---

## 5. Test Helpers (Do Not Write Raw Tests)

Always use the shared factories:

```
src/gate/rules/connectors/__tests__/helpers/drillMapFactory.ts
```

Example:

```typescript
import { makeCam, makeBolt, onePanel } from './helpers/drillMapFactory';

const cam = makeCam({ pairedHoleId: 'bolt-1' });
const bolt = makeBolt({ id: 'bolt-1', position: [10, 96, 0] });

const result = validateMinifixGate(onePanel([cam, bolt]));
```

This ensures:

- readability
- schema consistency
- painless refactors

---

## 6. CI Policy (Non-Negotiable)

CI runs:

- `npm ci`
- `npm run test:coverage`

Merge is blocked if:

- any test fails
- coverage below threshold
- Safety Gate fails

**Gate tests are required checks.**

### Branch Protection Required Checks

```
Monolith Gate Tests / Gate Tests
Monolith Gate Tests / Minifix Connector Tests
Monolith Gate Tests / Snapshot Regression
```

---

## 7. Golden Rules (Read Twice)

1. **Never bypass a Safety Gate**
2. **Never loosen a Gate to "make tests pass"**
3. **Never change Gate logic without updating tests**
4. **Every manufacturing rule must be encoded as a Gate**
5. **If it can break in a factory, it must fail in CI**
6. **If you add/change error codes or constraints, update `docs/SAFETY_GATE.md` in the same PR**

---

## 8. Checklist for New Gates

- [ ] Gate logic implemented
- [ ] Index resolver updated (if needed)
- [ ] Unit tests added
- [ ] Snapshot tests added
- [ ] Property-based tests added
- [ ] Multi-pair tests added
- [ ] `docs/SAFETY_GATE.md` updated
- [ ] CI passes

---

## 9. NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run test` | Watch mode (all tests) |
| `npm run test:run` | Single run (all tests) |
| `npm run test:gate` | Gate tests only |
| `npm run test:gate:watch` | Gate tests watch mode |
| `npm run test:gate:coverage` | Gate tests with coverage |
| `npm run test:minifix` | Minifix connector tests only |

---

## 10. Coordinate System

Monolith uses **Y-up** coordinate system (R3F/Three.js standard):

- **Y** = Vertical (height)
- **X, Z** = Horizontal plane (floor)

```typescript
export const AXIS = {
  X: 0,
  Y: 1,  // Height (vertical) in Y-up system
  Z: 2,
} as const;
```

---

## Final Note

> **UI can be flexible.
> Manufacturing cannot.**

If in doubt — make the Gate stricter, not looser.

# Monolith Developer Guide

> Technical Documentation for Contributors

**Version:** 1.0.0
**Last Updated:** February 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Core Concepts](#core-concepts)
5. [State Management](#state-management)
6. [3D Rendering](#3d-rendering)
7. [Gate Validation System](#gate-validation-system)
8. [Testing](#testing)
9. [Code Conventions](#code-conventions)
10. [Contributing](#contributing)

---

## Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **UI Framework** | React 18 | Component architecture |
| **Language** | TypeScript | Type safety |
| **Build Tool** | Vite | Fast development/builds |
| **3D Engine** | Three.js | WebGL rendering |
| **3D React** | @react-three/fiber | React bindings for Three.js |
| **State** | Zustand | Global state management |
| **Styling** | Inline styles | Dark theme consistency |
| **Crypto** | Web Crypto API | Ed25519 signatures |

### Runtime Modes

```
DESIGNER Mode                    FACTORY Mode
─────────────────────           ─────────────────────
• Flexible validation           • Strict validation
• Policy optional               • Policy required
• Full editing                  • Read-only designs
• Development use               • Production use
```

### Release Workflow

```
       ┌─────────┐
       │  DRAFT  │  ← Initial design state
       └────┬────┘
            │ freeze()
       ┌────▼────┐
       │ FROZEN  │  ← Snapshot created, no edits
       └────┬────┘
            │ runGate()
       ┌────▼────┐
       │  GATED  │  ← Validation complete
       └────┬────┘
            │ release()
       ┌────▼────┐
       │RELEASED │  ← Manifest signed, factory-ready
       └─────────┘
```

---

## Development Setup

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Git**: Latest version
- **VS Code**: Recommended IDE

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd monolith-workspace

# Install dependencies
npm install

# Start development server
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (hot reload) |
| `npm run build` | Production build to `dist/` |
| `npm run test:run` | Run all unit tests once |
| `npm run test` | Run tests in watch mode |
| `npm run typecheck:all` | Full TypeScript validation |
| `npm run lint` | Run ESLint |

### Environment Configuration

Create `.env.local` for local overrides:

```env
# Runtime mode: DESIGNER | FACTORY
VITE_RUNTIME_MODE=DESIGNER

# Enable debug logging
VITE_DEBUG=true

# Factory ID (required for FACTORY mode)
VITE_FACTORY_ID=factory-001
```

---

## Project Structure

```
src/
├── artifacts/              # Bundle storage & verification
│   ├── store/             # Artifact Zustand store
│   └── verify/            # Signature verification
│
├── components/
│   ├── canvas/            # 3D components
│   │   ├── Cabinet3D.tsx     # Main cabinet renderer
│   │   ├── DrillMap3D.tsx    # CNC hole visualization
│   │   └── PanelMesh.tsx     # Individual panel mesh
│   │
│   ├── layout/            # Page layouts
│   │   ├── DesignerLayout.tsx
│   │   └── FactoryLayout.tsx
│   │
│   └── ui/                # UI components
│       ├── MaterialSelector.tsx
│       ├── PanelConfigModal.tsx
│       └── GateReport.tsx
│
├── core/
│   ├── engines/           # Calculation engines
│   │   ├── ManufacturingCalculator.ts
│   │   └── DrillMapEngine.ts
│   │
│   ├── store/             # Zustand stores
│   │   ├── useCabinetStore.ts
│   │   ├── useProjectStore.ts
│   │   └── useToolStore.ts
│   │
│   └── types/             # TypeScript types
│       ├── cabinet.ts
│       └── hardware.ts
│
├── crypto/                # Cryptographic utilities
│   ├── ed25519.ts        # Signing/verification
│   ├── sha256.ts         # Hashing
│   └── keyStore.ts       # Key management
│
├── gate/                  # Manufacturing validation
│   ├── compute/          # Calculation functions
│   │   ├── cutSize.ts
│   │   └── composite.ts
│   │
│   ├── rules/            # Validation rules
│   │   ├── rule_cutSize_nonNegative.ts
│   │   ├── rule_drillDepthSafety.ts
│   │   └── rule_minMargins.ts
│   │
│   └── types.ts          # Gate type definitions
│
├── release/               # Release workflow
│   ├── keys/             # Key registry & guards
│   ├── manifest/         # Manifest building
│   └── policy/           # Revocation policies
│
└── runtime/               # Runtime configuration
    ├── adminAuth.ts      # Admin authentication
    └── envConfig.ts      # Environment settings
```

---

## Core Concepts

### Cabinet Model

A cabinet is composed of:

```typescript
interface Cabinet {
  id: string;
  name: string;
  category: CabinetCategory;   // BASE, WALL, TALL, CORNER
  dimensions: {
    width: number;   // mm
    height: number;  // mm
    depth: number;   // mm
  };
  panels: CabinetPanel[];      // Structural panels
  compartments: Compartment[]; // Internal spaces
  materials: MaterialConfig;   // Material assignments
}
```

### Panel Roles

| Role | Description |
|------|-------------|
| `LEFT_SIDE` | Left vertical panel |
| `RIGHT_SIDE` | Right vertical panel |
| `TOP` | Top horizontal panel |
| `BOTTOM` | Bottom horizontal panel |
| `BACK` | Back panel (typically 4mm) |
| `SHELF` | Internal horizontal shelf |
| `DIVIDER` | Internal vertical divider |

### Coordinate System

```
         +Y (up)
          │
          │    +Z (back)
          │   /
          │  /
          │ /
          │/_________ +X (right)
         O

Origin (O) = Cabinet center at floor level
```

---

## State Management

### Store Architecture

Monolith uses multiple Zustand stores for separation of concerns:

```typescript
// Core data stores
useCabinetStore    // Cabinet geometry & materials
useProjectStore    // Project metadata & persistence
useSpecStore       // Release workflow state

// UI interaction stores
useToolStore       // Active tool selection
useSelectionStore  // Selected objects
useViewStore       // Camera position & view mode

// Hardware stores
useDrillMapStore   // CNC drilling data
useMinifixStore    // Connector configuration
```

### Store Patterns

#### Basic Store Creation

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

export const useCounterStore = create<CounterState>()(
  immer((set) => ({
    count: 0,
    increment: () => set((state) => { state.count += 1; }),
    decrement: () => set((state) => { state.count -= 1; }),
  }))
);
```

#### Persisted Store

```typescript
import { persist } from 'zustand/middleware';
import { projectScopedStorage } from './projectScopedStorage';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'monolith:settings',
      storage: createJSONStorage(() => projectScopedStorage),
    }
  )
);
```

### Accessing Store State

```typescript
// In React components - use selector for granular updates
const width = useCabinetStore((s) => s.cabinet?.dimensions.width);

// Outside React - direct access
const cabinet = useCabinetStore.getState().cabinet;

// Subscribe to changes
const unsub = useCabinetStore.subscribe(
  (state) => state.cabinet,
  (cabinet) => console.log('Cabinet changed:', cabinet)
);
```

---

## 3D Rendering

### React Three Fiber Basics

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function Scene() {
  return (
    <Canvas camera={{ position: [0, 2, 5] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} />
      <OrbitControls />
      <Cabinet3D />
    </Canvas>
  );
}
```

### Panel Mesh Component

```tsx
import { useMemo } from 'react';
import * as THREE from 'three';

interface PanelMeshProps {
  width: number;
  height: number;
  thickness: number;
  position: [number, number, number];
}

export function PanelMesh({ width, height, thickness, position }: PanelMeshProps) {
  const geometry = useMemo(() => {
    // Convert mm to meters for Three.js
    return new THREE.BoxGeometry(
      width / 1000,
      height / 1000,
      thickness / 1000
    );
  }, [width, height, thickness]);

  return (
    <mesh position={position} geometry={geometry}>
      <meshStandardMaterial color="#a0522d" />
    </mesh>
  );
}
```

### Performance Guidelines

1. **Memoize geometries**: Use `useMemo` for BoxGeometry, etc.
2. **Dispose resources**: Clean up in useEffect return
3. **Use instances**: For repeated similar objects
4. **Avoid console.log**: In render paths

```tsx
// ✅ Good - memoized geometry
const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);

// ❌ Bad - creates new geometry every render
<mesh geometry={new BoxGeometry(1, 1, 1)} />
```

---

## Gate Validation System

### Overview

The Gate system validates designs against manufacturing constraints before factory release.

### Validation Rules

Each rule checks a specific manufacturability aspect:

| Rule | Severity | Purpose |
|------|----------|---------|
| `ruleCutSizeNonNegative` | BLOCKER | Cut size must be positive |
| `ruleDrillDepthSafety` | BLOCKER | Drill can't exceed thickness |
| `ruleMinMargins` | BLOCKER | Hardware must have edge margin |
| `ruleFittingSpacing` | BLOCKER | Fittings can't overlap |
| `ruleEdgeAllowance` | WARNING | Premill/edge sanity check |
| `ruleClearanceBackPanel` | BLOCKER | Shelf/back panel clearance |

### Creating a New Rule

```typescript
// src/gate/rules/rule_myRule.ts
import type { GateIssue, GatePolicy, PartSpec } from '../types';
import { issueId } from '../utils/idGen';

/**
 * Rule: My Custom Rule
 *
 * @module gate/rules/rule_myRule
 * @param policy - Gate policy with thresholds
 * @param parts - Parts to validate
 * @returns Array of issues (empty if all pass)
 */
export function ruleMyRule(
  policy: GatePolicy,
  parts: PartSpec[]
): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const part of parts) {
    if (/* violation condition */) {
      issues.push({
        id: issueId('B_MY_RULE', part.partId),
        severity: 'BLOCKER',
        code: 'B_MY_RULE',
        message: 'Description of the issue',
        partIds: [part.partId],
        context: { /* relevant data */ },
      });
    }
  }

  return issues;
}
```

### Running Gate Validation

```typescript
import { runGate } from '@/gate';

const input: GateInput = {
  snapshotId: 'snap-001',
  parts: [...],
  drillOps: [...],
  fittings: [...],
};

const output = runGate(policy, input);

if (output.metrics.blockers > 0) {
  console.error('Cannot release: blockers found');
  output.issues.filter(i => i.severity === 'BLOCKER').forEach(console.error);
}
```

---

## Testing

### Test Structure

```
src/
├── core/
│   ├── engines/
│   │   ├── ManufacturingCalculator.ts
│   │   └── __tests__/
│   │       └── ManufacturingCalculator.test.ts  ✅
│   └── store/
│       ├── useCabinetStore.ts
│       └── __tests__/
│           └── useCabinetStore.panel.test.ts    ✅
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCabinetStore } from '../useCabinetStore';

describe('useCabinetStore', () => {
  beforeEach(() => {
    // Reset store state
    useCabinetStore.setState({
      cabinet: null,
      cabinets: [],
    });
  });

  it('should create a cabinet', () => {
    useCabinetStore.getState().createCabinet('BASE', 'Test');

    const cabinet = useCabinetStore.getState().cabinet;
    expect(cabinet).not.toBeNull();
    expect(cabinet?.category).toBe('BASE');
  });

  it('should update dimensions', () => {
    useCabinetStore.getState().createCabinet('BASE', 'Test');
    useCabinetStore.getState().setDimension('width', 800);

    expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(800);
  });
});
```

### Running Tests

```bash
# Run all tests once
npm run test:run

# Run specific test file
npm run test:run -- src/gate/rules/__tests__/gateRules.test.ts

# Run tests in watch mode
npm run test

# Run with coverage
npm run test:run -- --coverage
```

### Floating Point Precision

When testing calculations, use `toBeCloseTo` for decimal values:

```typescript
// ❌ May fail due to floating point
expect(result).toBe(16.2);

// ✅ Handles precision
expect(result).toBeCloseTo(16.2, 5);
```

---

## Code Conventions

### TypeScript

```typescript
// ✅ Explicit types
function calculate(width: number, height: number): number {
  return width * height;
}

// ❌ Implicit any
function process(data) {
  return data.value;
}
```

### React Components

```typescript
// ✅ Named exports with interface
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

// ❌ Default export, inline types
export default function({ label, onClick }) { ... }
```

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `MaterialSelector.tsx` |
| Utilities | camelCase | `cutSize.ts` |
| Tests | `*.test.ts` | `useCabinetStore.test.ts` |
| Types | camelCase | `cabinet.ts` |

### JSDoc Comments

```typescript
/**
 * Calculates cut dimensions for CNC panel saw.
 *
 * @param part - Part specification with finish dimensions
 * @returns Cut width and height in mm
 *
 * @example
 * const { cutW, cutH } = computeCutSize(part);
 */
export function computeCutSize(part: PartSpec): { cutW: number; cutH: number } {
  // ...
}
```

### Commit Messages

```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore
Scope: cabinet, drillmap, hardware, gate, store, ui

Examples:
feat(gate): add drill depth safety rule
fix(cabinet): correct panel dimension calculation
test(store): add useCabinetStore panel tests
docs(api): update JSDoc for gate module
```

---

## Contributing

### Workflow

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/my-feature`
3. **Implement** your changes with tests
4. **Verify**: `npm run test:run && npm run typecheck:all`
5. **Commit** with conventional message
6. **Push** and create a Pull Request

### Pre-Commit Checklist

- [ ] All tests pass (`npm run test:run`)
- [ ] No TypeScript errors (`npm run typecheck:all`)
- [ ] Code follows conventions (see above)
- [ ] JSDoc added for new public APIs
- [ ] No `console.log` in production code

### Code Review Guidelines

**Reviewers should check:**
- Type safety and null handling
- Test coverage for new code
- Performance (no render-path console.log)
- Documentation completeness

---

## Additional Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Zustand](https://github.com/pmndrs/zustand)
- [Vitest](https://vitest.dev/)

---

*© 2026 Monolith Project. All rights reserved.*

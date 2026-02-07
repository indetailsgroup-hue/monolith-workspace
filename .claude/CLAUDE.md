# Monolith Project Memory

> This file is automatically read by Claude Code at the start of each session.
> It contains project DNA, architecture decisions, and conventions.

## Project Overview

**Monolith** - A built-in furniture design and factory manufacturing system with cryptographic trust chain for factory safety. Supports cabinets, wardrobes, shelving systems, and custom millwork.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **3D**: Three.js + @react-three/fiber + @react-three/drei
- **State**: Zustand (multiple stores)
- **Crypto**: Ed25519 (Web Crypto API) for signing
- **Styling**: Inline styles with dark theme (#1a1a2e base)

## Architecture

### Runtime Modes
```
DESIGNER - Development/design mode (flexible, policy optional)
FACTORY  - Production mode (strict, policy required)
```

### Release Workflow
```
DRAFT → FROZEN → GATED → RELEASED
         ↓         ↓        ↓
      Snapshot   Gate    Manifest
                Report   + Artifacts
```

### Trust Chain (Key Management)
```
Key Import → Scope Enforcement → Admin Override → Revocation Policy
   v0.4          v0.5              v0.6            v0.7-v0.10
```

### Policy Precedence (v0.9+)
```
BUNDLE policy > INSTALLED policy > NONE
```

## Key Directories

```
src/
├── artifacts/        # Bundle storage + verification
├── components/
│   ├── canvas/       # 3D components (Cabinet3D, etc.)
│   └── ui/           # UI panels (PolicyManager, KeyImport, etc.)
├── core/
│   ├── store/        # Zustand stores
│   └── types/        # TypeScript types
├── crypto/           # Ed25519, SHA-256 utilities
├── release/
│   ├── keys/         # Key registry, guards, audit
│   ├── manifest/     # Manifest building + signing
│   └── policy/       # Revocation policy system
├── runtime/          # Admin auth, env config
└── spec/             # Spec workflow UI
```

## Key Stores (Zustand)

| Store | Purpose |
|-------|---------|
| `useCabinetStore` | Cabinet data, panels, compartments |
| `useSpecStore` | Spec document state machine |
| `useProjectStore` | Project metadata |
| `useToolStore` | Active tool selection |

## Conventions

### Code Style
- TypeScript strict mode
- Functional components with hooks
- JSDoc comments for public APIs
- Version comments in file headers (e.g., `v0.10`)

### UI Theme (Dark Mode)
```typescript
background: '#1a1a2e'     // Base
border: '#3a3a5a'         // Subtle
accent: '#8b5cf6'         // Purple (primary)
success: '#22c55e'        // Green
warning: '#f59e0b'        // Amber
error: '#ef4444'          // Red
```

### Naming Conventions
- Files: PascalCase for components, camelCase for utilities
- Types: PascalCase with descriptive names
- Stores: `use[Name]Store`

## Security Principles

1. **Manifest Integrity**: SHA-256 hash for every artifact
2. **Ed25519 Signatures**: All manifests and policies signed
3. **Scope Binding**: FACTORY mode requires matching factoryId
4. **Revocation**: Time-based key revocation support
5. **Admin Override**: Passphrase-protected with audit trail

## Current State

See `.claude/progress.md` for implementation status.
See `.claude/decisions.md` for architectural decisions.

---

# PRPs (Personalized Response Prompts) for AI Agent

> คำแนะนำสำหรับ Claude Code ในการเขียนโค้ดให้ตรงตาม standards ของ project

## 🎯 Code Quality Standards

### TypeScript Rules
```typescript
// ✅ ALWAYS use explicit types
function calculateDistance(p1: Vec3, p2: Vec3): number { ... }

// ❌ NEVER use 'any' without justification
function process(data: any) { ... } // BAD

// ✅ Use strict null checks
const value = obj?.property ?? defaultValue;
```

### React Component Pattern
```typescript
// ✅ Preferred: Named exports with explicit props interface
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}

// ❌ Avoid: Default exports, inline types
export default function({ label, onClick }) { ... }
```

### Zustand Store Pattern
```typescript
// ✅ Standard store pattern
interface FooState {
  value: number;
  setValue: (v: number) => void;
}

export const useFooStore = create<FooState>()((set) => ({
  value: 0,
  setValue: (v) => set({ value: v }),
}));
```

## 🔧 Manufacturing/Hardware Rules

### Minifix S200 Specifications (Häfele Standard)
```typescript
// CRITICAL: Distance B = 24mm per CAD spec (NOT 34mm)
const DRILLING_DISTANCE_B = 24;  // mm - ขอบไม้ → แกนกลาง Bolt

// Cam Housing (Häfele FF 3.10 catalog)
const CAM_DIA = 15;              // mm - Ø15
const CAM_DEPTH = 13.5;          // mm - for 18mm wood (project default)
// Note: 12.5mm for 16mm wood, 14.0mm for 19mm wood

// Bolt Sleeve
const SLEEVE_DIA = 10;           // mm - Ø10
const SLEEVE_LENGTH = 17.5;      // mm

// System 32
const FIRST_HOLE_Z = 37;         // mm - from front edge
const PITCH = 32;                // mm - hole spacing
```

### Drill Map Generation Rules
```typescript
// ALWAYS use center-based coordinates
// x < 0 = LEFT, x > 0 = RIGHT
// y < 0 = BOTTOM, y > 0 = TOP
// z < 0 = FRONT, z > 0 = BACK

// NEVER use console.log in render paths
// ALWAYS memoize geometry with useMemo
// ALWAYS dispose textures in useEffect cleanup
```

## 🧪 Testing Requirements

### Before Committing Code
1. Run `npm run test:run` - Unit tests must pass
2. Run `npm run typecheck:all` - No TypeScript errors
3. Run `npx playwright test` - E2E tests must pass (when applicable)

### Test File Naming
```
src/
├── core/utils/snap.ts
├── core/utils/__tests__/snap.test.ts  ✅ Correct
├── core/utils/snap.test.ts            ❌ Wrong location
```

## 🚫 Anti-Patterns to Avoid

### Performance Killers
```typescript
// ❌ console.log in render path
function Component() {
  console.log('render');  // NEVER - causes performance issues
  return <div />;
}

// ❌ Creating objects in render without memoization
function Component() {
  const geometry = new BoxGeometry(1, 1, 1);  // Memory leak!
  return <mesh geometry={geometry} />;
}

// ✅ Correct pattern
function Component() {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  return <mesh geometry={geometry} />;
}
```

### WebGL Context Lost Prevention
```typescript
// ✅ Use InstancedMesh for many similar objects
<Instances limit={1000}>
  <boxGeometry />
  <meshBasicMaterial />
  {items.map(item => <Instance key={item.id} position={item.pos} />)}
</Instances>

// ❌ Individual meshes for each item
{items.map(item => (
  <mesh key={item.id} position={item.pos}>
    <boxGeometry />
    <meshBasicMaterial />
  </mesh>
))}
```

## 📋 Commit Message Format
```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore
Scope: cabinet, drillmap, hardware, store, ui

Examples:
feat(drillmap): add System 32 auto-spacing
fix(hardware): correct Distance B to 24mm per CAD spec
refactor(store): remove console.log from render paths
```

## 🤖 Agent Automation Hooks

### Pre-commit Verification
```bash
# Run before every commit
npm run test:run && npm run typecheck:all
```

### Post-fix Verification
```bash
# After fixing bugs, verify with E2E
npx playwright test --grep "@smoke"
```

# IIMOS Project Memory

> This file is automatically read by Claude Code at the start of each session.
> It contains project DNA, architecture decisions, and conventions.

## Project Overview

**IIMOS** (Intelligent Industrial Manufacturing Operations System) - A cabinet design and factory manufacturing system with cryptographic trust chain for factory safety.

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

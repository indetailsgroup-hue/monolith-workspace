# TASK: P004 - Panel Material Assignment UX (Per-face + Edge)

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Three.js
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/components/ui/PanelOverrideModal.tsx    # Current material modal (READ FIRST)
src/core/types/materials.ts                 # Material types
src/core/store/useCabinetStore.ts           # Panel material state
src/components/canvas/Cabinet3D.tsx         # Material rendering
```

## Problem
Current UI only sets "face material" globally. Users need per-face (front/back) and edge banding controls.

## Current State
```typescript
// Panel material structure (from types)
interface PanelMaterialOverride {
  face?: MaterialId;      // Applied to both faces
  faceOuter?: MaterialId; // Front face (exposed)
  faceInner?: MaterialId; // Back face (hidden)
  edge?: MaterialId;      // Edge banding
}
```

## Requirements

### 1. Enhanced Material Assignment UI
Update `PanelOverrideModal.tsx`:
```typescript
interface MaterialAssignmentSection {
  // Toggle: Simple (one material) vs Advanced (per-face)
  mode: 'simple' | 'advanced';

  // Simple mode
  face?: MaterialId;

  // Advanced mode
  faceOuter?: MaterialId;  // "Exposed Face"
  faceInner?: MaterialId;  // "Back Face"

  // Edge banding (always shown)
  edge?: MaterialId;
  edgeThickness?: 0.4 | 1 | 2;  // mm
}
```

### 2. UI Layout
```
┌─────────────────────────────────────────┐
│  Panel Material Assignment              │
├─────────────────────────────────────────┤
│  Mode: [Simple ▼] / [Advanced]          │
│                                         │
│  ┌─ Simple Mode ───────────────────┐    │
│  │ Face Material: [Oak ▼]          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─ Advanced Mode ─────────────────┐    │
│  │ Exposed Face: [Oak ▼]           │    │
│  │ Back Face:    [White Melamine ▼]│    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─ Edge Banding ──────────────────┐    │
│  │ Material: [Matching ▼]          │    │
│  │ Thickness: [0.4mm ○] [1mm ●]    │    │
│  │ Apply to: [□All □Exposed only]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Preview: [3D thumbnail of panel]       │
│                                         │
│  [Cancel]              [Apply to Panel] │
└─────────────────────────────────────────┘
```

### 3. Edge Banding Options
```typescript
interface EdgeBandingConfig {
  material: MaterialId | 'matching';  // 'matching' = same as face
  thickness: 0.4 | 1 | 2;  // mm
  sides: 'all' | 'exposed' | 'custom';
  customSides?: ('front' | 'back' | 'left' | 'right')[];
}
```

### 4. Visual Preview
Show mini 3D preview of panel with materials:
```typescript
function MaterialPreview({ faceOuter, faceInner, edge }) {
  return (
    <Canvas style={{ width: 200, height: 150 }}>
      <PerspectiveCamera position={[2, 1, 2]} />
      <ambientLight />
      <mesh>
        {/* Panel geometry with face/edge materials */}
      </mesh>
    </Canvas>
  );
}
```

### 5. Batch Apply to Selection
If multiple panels selected:
```typescript
<button onClick={() => applyToAllSelected()}>
  Apply to {selectedCount} panels
</button>
```

## Implementation Steps
1. Add mode toggle (simple/advanced) to modal
2. Add faceOuter/faceInner fields for advanced mode
3. Add edge banding section with thickness options
4. Add mini 3D preview
5. Support batch apply to multiple selected panels
6. Update Cabinet3D to render per-face materials

## Verify
```bash
npm run dev
# Select panel → Right-click → Materials
# Toggle Advanced mode
# Set different materials for front/back
# Configure edge banding
# Verify 3D preview updates
# Apply and verify Cabinet3D renders correctly
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/ui/PanelOverrideModal.tsx | MODIFY | Add per-face and edge UI |
| src/core/types/materials.ts | MODIFY | Add EdgeBandingConfig type |
| src/components/ui/MaterialPreview.tsx | CREATE | Mini 3D preview |
| src/components/canvas/Cabinet3D.tsx | MODIFY | Render per-face materials |

## Anti-Drift Rules
- Do NOT break existing simple material assignment
- Do NOT duplicate material selection UI (reuse components)
- Do NOT forget edge banding in BOM export
- Do NOT show preview canvas if WebGL already strained

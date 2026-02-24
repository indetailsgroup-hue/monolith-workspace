# TASK: T015 - Panel Selection UX

You are a senior React + R3F engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand, @react-three/fiber, @react-three/drei
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
Open and inspect these files before implementing:

```
src/core/store/useSelectionStore.ts    # Selection state (READ FIRST)
src/components/canvas/Cabinet3D.tsx    # 3D cabinet renderer
src/components/canvas/CabinetNode.tsx  # Individual cabinet node
src/components/ui/PanelList.tsx        # UI panel list (if exists)
src/core/store/useCabinetStore.ts      # Cabinet data store
```

## Current State Analysis
`useSelectionStore.ts` has:
- `selectedIds: string[]` - Selected entity IDs
- `select()`, `deselect()`, `toggleSelection()` - Selection methods
- `kind: SelectionKind` - Selection mode (object/face/edge/point)

Missing:
- `hoveredId` state for hover tracking
- No visual highlight in 3D
- No bidirectional sync with UI list

## Requirements

### 1. Hover State
Add to `useSelectionStore`:
```typescript
hoveredId: string | null;
setHovered: (id: string | null) => void;
```

### 2. 3D Visual Feedback
In `Cabinet3D.tsx` or `CabinetNode.tsx`:
- Hover: Outline shader or opacity change (0.7 opacity)
- Selected: Brighter outline or emissive material
- Use `@react-three/drei` Outlines or custom shader

### 3. Tooltip on Hover
- Show panel name on 3D hover
- Use `Html` from drei or custom tooltip component
- Position at mouse or above mesh

### 4. Tab Cycle for Overlapping Panels
- When multiple panels at click point, Tab cycles through them
- Add `cycleSelection()` to store
- Track overlapping candidates

### 5. Bidirectional Sync
- Click in 3D -> Highlight in PanelList
- Click in PanelList -> Select in 3D + camera focus (optional)

## Rules
1. Single source of truth = `useSelectionStore`
2. No duplicate state in components
3. Use memoization for 3D materials (useMemo)
4. No full-scene rerender on hover
5. Follow existing Zustand selector patterns

## Implementation Steps
1. Extend `useSelectionStore` with hoveredId
2. Add hover handlers in 3D mesh components
3. Create selection highlight material
4. Add Html tooltip for hover
5. Wire PanelList to store bidirectionally

## Verify
```bash
npx tsc --noEmit
npm run test:run
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/store/useSelectionStore.ts | MODIFY | Add hoveredId, setHovered, cycleSelection |
| src/components/canvas/Cabinet3D.tsx | MODIFY | Add hover/select visual feedback |
| src/components/ui/PanelList.tsx | MODIFY | Sync with selection store |

## Anti-Drift Rules
- Do NOT create new selection stores
- Do NOT use inline state in components for selection
- Do NOT cause full re-renders on hover

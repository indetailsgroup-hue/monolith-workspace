# TASK: T014 - Keyboard Shortcuts Enhancement

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand, R3F
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
Open and inspect these files before implementing:

```
src/core/ui/useGlobalHotkeys.ts       # Current shortcut handler (READ FIRST)
src/core/commands/uiRegistry.ts       # Command registration system
src/core/commands/actions.ts          # Existing actions
src/core/store/useUiStore.ts          # UI state (modals, overlays)
src/core/store/useMeasureStore.ts     # Dimension visibility state
src/components/ui/PanelConfigModal.tsx # Panel edit modal
```

## Current State Analysis
The existing `useGlobalHotkeys.ts` has these bindings:
- `D` = Delete (actionDelete) - CONFLICTS with dimension toggle
- `E` = Boolean Intersect - NOT edit panel
- `G` = Move tool - NOT Safety Gate
- `Ctrl+S` = Save - ALREADY WORKING
- `Esc` = Close overlays - ALREADY WORKING

## Requirements

### New Shortcut Mappings
| Key | Action | Implementation |
|-----|--------|----------------|
| `M` | Toggle dimension labels | Call `useMeasureStore.getState().toggleVisibility()` |
| `Shift+E` | Edit selected panel | Open `PanelConfigModal` if panel selected |
| `Shift+G` | Toggle Safety Gate | Navigate to SafetyGatePage or toggle panel |

### Preserve Existing Shortcuts
- Keep `D` = Delete (current behavior)
- Keep `G` = Move tool (current behavior)
- Keep `E` = Boolean Intersect (current behavior)

### Rules
1. All shortcuts must be centralized in `useGlobalHotkeys.ts`
2. Do NOT override browser shortcuts (Ctrl+R, Ctrl+W, etc.)
3. Must show visual feedback via toast or status indicator
4. Must respect `isTypingInInput()` check (already exists)
5. No new shortcut systems - extend existing pattern

### Implementation Steps
1. Add `useMeasureStore` import
2. Add `M` key handler for dimension toggle
3. Add `Shift+E` handler for panel edit modal
4. Add `Shift+G` handler for Safety Gate toggle
5. Add toast feedback for each action

## Verify
```bash
npx tsc --noEmit
npm run test:run
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/ui/useGlobalHotkeys.ts | MODIFY | Add M, Shift+E, Shift+G handlers |
| src/core/store/useMeasureStore.ts | MODIFY | Add toggleVisibility if missing |

## Anti-Drift Rules
- Do NOT create new files for shortcuts
- Do NOT change existing shortcut behavior (D, G, E)
- Do NOT add shortcuts without toast feedback

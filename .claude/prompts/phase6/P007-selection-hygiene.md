# TASK: P007 - Selection State Hygiene + Ghost-State Guard

You are a senior React + Zustand engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, Zustand, Three.js
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/core/store/useCabinetStore.ts           # Selection state (READ FIRST)
src/components/canvas/Cabinet3D.tsx         # Selection rendering
src/components/ui/PanelPropertiesPanel.tsx  # Properties for selected
src/core/types/cabinet.ts                   # Panel types
```

## Problem
Selection can point to deleted panels ("ghost state"). Causes crashes or stale UI.

## Current State
```typescript
// In useCabinetStore
interface CabinetState {
  panels: Record<string, Panel>;
  selectedPanelIds: string[];  // Can contain deleted IDs!
  // ...
}
```

## Requirements

### 1. Selection Cleanup on Panel Delete
```typescript
// In useCabinetStore
deletePanel: (panelId: string) => {
  set((state) => {
    const { [panelId]: deleted, ...remainingPanels } = state.panels;
    return {
      panels: remainingPanels,
      // CRITICAL: Clean up selection
      selectedPanelIds: state.selectedPanelIds.filter(id => id !== panelId),
    };
  });
},
```

### 2. Selection Validator
```typescript
// Hook to ensure selection validity
function useValidSelection() {
  const panels = useCabinetStore(state => state.panels);
  const selectedPanelIds = useCabinetStore(state => state.selectedPanelIds);
  const setSelection = useCabinetStore(state => state.setSelectedPanelIds);

  useEffect(() => {
    // Filter out any invalid IDs
    const validIds = selectedPanelIds.filter(id => id in panels);
    if (validIds.length !== selectedPanelIds.length) {
      console.warn('[Selection] Cleaned up ghost selection:',
        selectedPanelIds.filter(id => !(id in panels))
      );
      setSelection(validIds);
    }
  }, [panels, selectedPanelIds, setSelection]);

  // Return only valid selected panels
  return selectedPanelIds.filter(id => id in panels).map(id => panels[id]);
}
```

### 3. Derived Selection Selector
```typescript
// In useCabinetStore - computed selector
const selectValidSelectedPanels = (state: CabinetState): Panel[] => {
  return state.selectedPanelIds
    .filter(id => id in state.panels)
    .map(id => state.panels[id]);
};

// Usage (auto-filters invalid)
const selectedPanels = useCabinetStore(selectValidSelectedPanels);
```

### 4. Guard in UI Components
```typescript
// PanelPropertiesPanel.tsx
function PanelPropertiesPanel() {
  const selectedPanels = useCabinetStore(selectValidSelectedPanels);

  if (selectedPanels.length === 0) {
    return <EmptyState message="No panel selected" />;
  }

  // Safe to use selectedPanels[0]
  const panel = selectedPanels[0];
  // ...
}
```

### 5. Guard in 3D Rendering
```typescript
// Cabinet3D.tsx - Selection highlighting
function SelectionHighlight() {
  const panels = useCabinetStore(state => state.panels);
  const selectedIds = useCabinetStore(state => state.selectedPanelIds);

  // Filter to valid panels only
  const validSelectedPanels = useMemo(() =>
    selectedIds
      .filter(id => id in panels)
      .map(id => panels[id]),
    [panels, selectedIds]
  );

  return (
    <>
      {validSelectedPanels.map(panel => (
        <SelectionOutline key={panel.id} panel={panel} />
      ))}
    </>
  );
}
```

### 6. Bulk Operations Safety
```typescript
// Batch delete with selection cleanup
deletePanels: (panelIds: string[]) => {
  set((state) => {
    const newPanels = { ...state.panels };
    panelIds.forEach(id => delete newPanels[id]);

    return {
      panels: newPanels,
      selectedPanelIds: state.selectedPanelIds.filter(
        id => !panelIds.includes(id)
      ),
    };
  });
},
```

### 7. Undo/Redo Selection Restore
```typescript
// When undoing a delete, consider re-selecting
undoDeletePanel: (panel: Panel) => {
  set((state) => ({
    panels: { ...state.panels, [panel.id]: panel },
    // Optionally re-select the restored panel
    selectedPanelIds: [...state.selectedPanelIds, panel.id],
  }));
},
```

## Implementation Steps
1. Update `deletePanel` to clean selection
2. Create `selectValidSelectedPanels` selector
3. Update `PanelPropertiesPanel` to use guarded selector
4. Update `Cabinet3D` selection highlighting
5. Add `useValidSelection` hook for edge cases
6. Test delete scenarios thoroughly

## Verify
```bash
npm run dev
# Select a panel
# Delete the panel
# Verify: no console errors, properties panel shows "No selection"
# Verify: no ghost outline in 3D view
# Undo delete → panel re-selected
# Multi-select → delete one → other still selected
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/store/useCabinetStore.ts | MODIFY | Add selection cleanup to delete |
| src/core/store/selectors.ts | CREATE | selectValidSelectedPanels |
| src/components/ui/PanelPropertiesPanel.tsx | MODIFY | Use guarded selector |
| src/components/canvas/Cabinet3D.tsx | MODIFY | Filter valid selection |

## Anti-Drift Rules
- Do NOT assume selectedPanelIds always contain valid IDs
- Do NOT read panel by ID without checking existence
- Do NOT forget cleanup in batch operations
- Do NOT break undo/redo selection restoration

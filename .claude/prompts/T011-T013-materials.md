# TASK: T011-T013 - MaterialSelector UX (MOSTLY DONE)

You are a senior React + Zustand engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/components/ui/MaterialSelector.tsx         # Main component (READ FIRST)
src/core/materials/useMaterialHistoryStore.ts  # Recent materials (T012 DONE)
src/core/materials/useMaterialFavoritesStore.ts # Favorites (T013 DONE)
src/core/materials/MaterialRegistry.ts         # Material data
```

## Current State Analysis

### T011 Search/Filter - DONE
`MaterialSelector.tsx:134-144` already has:
- `searchQuery` state
- `filterMaterials()` function searching name, type, manufacturer, category
- Category filter tabs (All / MELAMINE / HPL / FENIX_NTM / FENIX_NTA)

### T012 Recent Materials - DONE
`useMaterialHistoryStore.ts` implements:
- LRU tracking with max 15 entries
- `addToHistory()` on material selection
- `getRecentIds(limit)` for retrieval
- Persisted to localStorage

### T013 Favorites - DONE
`useMaterialFavoritesStore.ts` implements:
- `favoriteIds[]` array
- `toggleFavorite()`, `isFavorite()` methods
- Star button on material cards (line 418-434)
- Favorites section at top (line 268-304)
- Persisted to localStorage

## Remaining Enhancements (Optional)

### 1. Highlight Matched Text in Search
Currently search works but doesn't highlight matches:
```tsx
// In material card name display
const highlightMatch = (text: string, query: string) => {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};
```

### 2. Drag Reorder Favorites (Not Implemented)
Add drag-to-reorder in favorites section:
- Use `@dnd-kit/sortable` or existing SortableList
- Update `useMaterialFavoritesStore` to support reorder
- Persist order

### 3. Clear Recent Button
Add button to clear recent history:
```tsx
<button onClick={() => useMaterialHistoryStore.getState().clearHistory()}>
  Clear Recent
</button>
```

## Rules
1. Persistence ONLY via Zustand persist middleware (already done)
2. Follow existing store patterns
3. Do NOT create new stores

## Verify
```bash
npx tsc --noEmit
npm run test:run -- MaterialSelector
npm run test:run -- useMaterialHistoryStore
npm run test:run -- useMaterialFavoritesStore
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/ui/MaterialSelector.tsx | MODIFY | Add highlight, drag reorder |
| src/core/materials/useMaterialFavoritesStore.ts | MODIFY | Add reorderFavorites if needed |

## Anti-Drift Rules
- Do NOT recreate existing functionality
- Do NOT change persistence mechanism
- Do NOT break existing search/filter behavior

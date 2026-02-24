# TASK: T017 - State Update Performance

You are a senior React + Zustand engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/core/store/useCabinetStore.ts      # Main cabinet state
src/core/store/useSelectionStore.ts    # Selection state
src/core/modeling/useModelingStore.ts  # Modeling state
src/components/canvas/Cabinet3D.tsx    # Heavy render component
```

## Current State
No systematic memoization or debouncing. Potential re-render cascades.

## Requirements

### 1. Zustand Selector Memoization
Ensure all store subscriptions use selectors:
```typescript
// BAD - re-renders on any store change
const { cabinets, activeCabinetId } = useCabinetStore();

// GOOD - re-renders only when these values change
const cabinets = useCabinetStore((s) => s.cabinets);
const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);

// BETTER - shallow compare for arrays/objects
import { shallow } from 'zustand/shallow';
const { cabinets, activeCabinetId } = useCabinetStore(
  (s) => ({ cabinets: s.cabinets, activeCabinetId: s.activeCabinetId }),
  shallow
);
```

### 2. Debounce Validation (300ms)
Create `src/core/utils/debounce.ts`:
```typescript
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
```

Use for validation:
```typescript
const debouncedValidate = useMemo(
  () => debounce(validateCabinet, 300),
  []
);
```

### 3. Batch Updates with Immer
Zustand with immer middleware batches mutations:
```typescript
// In store with immer
set((state) => {
  state.cabinet.width = newWidth;
  state.cabinet.height = newHeight;
  state.cabinet.depth = newDepth;
  // Single re-render
});
```

### 4. React.memo for Heavy Components
```typescript
import { memo } from 'react';

export const Cabinet3D = memo(function Cabinet3D({ cabinet }: Props) {
  // ...
}, (prev, next) => {
  // Custom comparison
  return prev.cabinet.id === next.cabinet.id
    && prev.cabinet.dimensions === next.cabinet.dimensions;
});
```

### 5. useMemo for Expensive Computations
```typescript
const geometry = useMemo(() => {
  return new BoxGeometry(width, height, depth);
}, [width, height, depth]);
```

### 6. Dev-Only Perf Logs
```typescript
if (import.meta.env.DEV) {
  console.log('[Perf] Cabinet3D render:', cabinet.id);
}
```

## Implementation Checklist
1. [ ] Audit all store subscriptions in components
2. [ ] Add shallow selectors where needed
3. [ ] Create debounce utility
4. [ ] Wrap validation with debounce
5. [ ] Add React.memo to Cabinet3D, CabinetNode
6. [ ] Add useMemo for geometries and materials
7. [ ] Add dev-only render logs

## Verify
```bash
npx tsc --noEmit
npm run test:run
# Manual: Use React DevTools Profiler to check re-renders
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/utils/debounce.ts | CREATE | Debounce utility |
| src/components/canvas/Cabinet3D.tsx | MODIFY | Add memo, useMemo |
| src/core/store/useCabinetStore.ts | MODIFY | Verify immer usage |

## Anti-Drift Rules
- Do NOT add memo without measuring benefit
- Do NOT debounce user input (only validation/computation)
- Do NOT over-optimize prematurely
- Do NOT add console.log in production

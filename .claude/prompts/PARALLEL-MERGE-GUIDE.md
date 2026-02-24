# Parallel Task Merge Guide

> วิธีรัน T014-T018 แบบ parallel และ merge โดยไม่ชนกัน

## Conflict Matrix

| Task | Files Touched | Conflicts With |
|------|---------------|----------------|
| **T014** | `useGlobalHotkeys.ts`, `uiRegistry.ts`, `actions.ts` | T015 (Esc key) |
| **T015** | `Cabinet3D.tsx`, `PanelList.tsx`, `useSelectionStore.ts` | T014 (deselect) |
| **T011-13** | `MaterialSelector.tsx`, `useMaterialStore.ts`, `unsafeStorage.ts` | None |
| **T016** | New `TextureCache.ts`, `MaterialSelector.tsx` (thumbnails) | T011-13 (MaterialSelector) |
| **T017** | Various stores, validation paths | T015 (selection perf) |
| **T018** | `vite.config.ts`, `App.tsx`, lazy imports | T014 (App.tsx) |

## Recommended Merge Order

```
Phase 1 (Safe Parallel):
├── T011-T013 (MaterialSelector)     ← No conflicts, merge first
├── T015 (Selection UX)              ← Isolated to canvas/selection
└── T016 (Texture Perf)              ← New files mostly

Phase 2 (After Phase 1 merged):
├── T014 (Shortcuts)                 ← Needs T015's deselect logic
└── T017 (State Perf)                ← Needs T015's store changes

Phase 3 (Last):
└── T018 (Code Splitting)            ← Touches App.tsx, needs stable imports
```

## Pre-Merge Checklist

### Before merging any task:
```bash
# 1. Type check
npx tsc --noEmit

# 2. Run tests
npm run test:run

# 3. Check for conflict markers
grep -r "<<<<<<" src/

# 4. Verify no duplicate imports
grep -r "from '@/core/store/useSelectionStore'" src/ | wc -l
```

### T014 + T015 Merge (Esc/Deselect Conflict)
- [ ] T015 adds `clearSelection()` to store
- [ ] T014 uses T015's `clearSelection()` for Esc behavior
- [ ] Order: T015 first, then T014

### T011-13 + T016 Merge (MaterialSelector Conflict)
- [ ] T016 adds thumbnail loading to MaterialSelector
- [ ] T011-13 adds search/favorites UI to MaterialSelector
- [ ] Verify both changes are in different sections
- [ ] Order: T011-13 first (UI structure), then T016 (perf layer)

### T017 + T015 Merge (Selection Store Conflict)
- [ ] T017 adds memoization to selectors
- [ ] T015 adds hoveredId state
- [ ] Verify selector patterns are consistent
- [ ] Order: T015 first (state shape), then T017 (perf optimization)

### T018 Final Merge
- [ ] All lazy-loaded components exist and work
- [ ] No circular imports introduced
- [ ] Build succeeds: `npm run build`
- [ ] Bundle sizes documented

## Conflict Resolution Patterns

### Pattern 1: Same File, Different Sections
```typescript
// T011-13 adds to top of MaterialSelector
const [searchQuery, setSearchQuery] = useState('');

// T016 adds to bottom of MaterialSelector
const { getCachedTexture } = useTextureCache();

// ✅ Safe to merge - different sections
```

### Pattern 2: Same Function Modified
```typescript
// T014 modifies handleKeyDown
if (e.key === 'Escape') { closeModal(); clearSelection(); }

// T015 also needs handleKeyDown for Tab
if (e.key === 'Tab') { cycleSelection(); }

// ⚠️ Merge manually - combine in same handler
```

### Pattern 3: Store Shape Changed
```typescript
// T015 adds
hoveredId: string | null;

// T017 adds memoization
const selectHovered = (s) => s.hoveredId; // needs T015's shape

// ✅ Order matters - T015 first
```

## Quick Commands

```bash
# Start parallel branches
git checkout -b feat/t014-shortcuts
git checkout -b feat/t015-selection
git checkout -b feat/t011-materials

# Merge order
git checkout main
git merge feat/t011-materials    # First (no conflicts)
git merge feat/t015-selection    # Second
git merge feat/t014-shortcuts    # Third (uses T015)
git merge feat/t016-texture      # Fourth
git merge feat/t017-state-perf   # Fifth
git merge feat/t018-splitting    # Last
```

## Post-Merge Verification

```bash
# Full verification after all merges
npm run typecheck:all
npm run test:run
npm run build

# Manual smoke test
npm run dev
# Test: D key toggles dimensions
# Test: Hover panel shows highlight
# Test: Search materials works
# Test: Lazy components load
```

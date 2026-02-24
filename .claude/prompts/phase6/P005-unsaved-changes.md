# TASK: P005 - Unsaved Changes + Autosave Feedback

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand persist
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/core/store/useCabinetStore.ts           # State persistence (READ FIRST)
src/core/store/useProjectStore.ts           # Project metadata
src/components/ui/StatusBar.tsx             # Bottom status bar
src/App.tsx                                 # beforeunload handler?
```

## Problem
Users don't know if work is saved. No visual feedback on autosave. Risk of data loss.

## Requirements

### 1. Dirty State Tracking
```typescript
// In store or dedicated hook
interface SaveState {
  isDirty: boolean;
  lastSaved: Date | null;
  isSaving: boolean;
  error: string | null;
}

// Track changes
const useSaveState = create<SaveState>((set) => ({
  isDirty: false,
  lastSaved: null,
  isSaving: false,
  error: null,

  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: new Date() }),
}));
```

### 2. beforeunload Warning
```typescript
// In App.tsx
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```

### 3. Visual Indicators

#### Title Bar / Tab
```typescript
// Update document.title
useEffect(() => {
  const base = 'Monolith Workspace';
  document.title = isDirty ? `● ${base}` : base;
}, [isDirty]);
```

#### StatusBar Save Indicator
```typescript
function SaveIndicator() {
  const { isDirty, lastSaved, isSaving } = useSaveState();

  if (isSaving) {
    return (
      <span style={{ color: '#f59e0b' }}>
        <SpinnerIcon /> Saving...
      </span>
    );
  }

  if (isDirty) {
    return (
      <span style={{ color: '#ef4444' }}>
        ● Unsaved changes
      </span>
    );
  }

  if (lastSaved) {
    return (
      <span style={{ color: '#22c55e' }}>
        ✓ Saved {formatRelativeTime(lastSaved)}
      </span>
    );
  }

  return null;
}
```

### 4. Autosave with Debounce
```typescript
// Autosave hook
function useAutosave(data: CabinetState, intervalMs = 30000) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const { markSaved, setIsSaving } = useSaveState();

  useEffect(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule autosave
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveToLocalStorage(data);
        markSaved();
      } catch (err) {
        console.error('[Autosave] Failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, intervalMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, intervalMs]);
}
```

### 5. Save Feedback Toast
```typescript
// Brief toast notification on save
function SaveToast({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 48,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#22c55e',
      color: 'white',
      padding: '8px 16px',
      borderRadius: 4,
      fontSize: 14,
      animation: 'fadeInOut 2s ease-in-out',
    }}>
      ✓ Changes saved
    </div>
  );
}
```

### 6. Manual Save (Ctrl+S)
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNow();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

## Implementation Steps
1. Create `useSaveState` store
2. Add beforeunload handler in App.tsx
3. Add save indicator to StatusBar
4. Implement autosave hook with debounce
5. Add Ctrl+S manual save handler
6. Add save toast notification
7. Update document.title with dirty indicator

## Verify
```bash
npm run dev
# Make a change → "● Unsaved changes" appears
# Wait 30s → Autosave triggers, "✓ Saved" appears
# Press Ctrl+S → Immediate save
# Try to close tab with unsaved changes → Warning dialog
# Check document.title shows ● when dirty
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/store/useSaveState.ts | CREATE | Save state tracking |
| src/components/ui/SaveIndicator.tsx | CREATE | StatusBar save indicator |
| src/components/ui/StatusBar.tsx | MODIFY | Add SaveIndicator |
| src/App.tsx | MODIFY | Add beforeunload, Ctrl+S, autosave |

## Anti-Drift Rules
- Do NOT autosave more frequently than 30s (performance)
- Do NOT block UI during save
- Do NOT lose unsaved work silently
- Do NOT show toast for every autosave (only manual save)

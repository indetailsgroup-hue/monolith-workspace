# TASK: P001 - Shortcut Help Overlay + Command Hints

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/components/ui/CommandPalette.tsx        # Existing command palette (READ FIRST)
src/components/ui/RadialMenu.tsx            # Radial menu with shortcuts
src/core/store/useToolStore.ts              # Tool state
src/App.tsx                                 # Keyboard event handlers
```

## Problem
Users don't know available shortcuts. No discoverability.

## Requirements

### 1. Shortcut Help Modal (`?` or `Ctrl+/`)
Create `src/components/ui/ShortcutHelpModal.tsx`:
```typescript
interface ShortcutGroup {
  title: string;
  shortcuts: { key: string; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Selection',
    shortcuts: [
      { key: 'Esc', label: 'Clear selection' },
      { key: 'Click', label: 'Select panel' },
      { key: 'Ctrl+Click', label: 'Multi-select' },
    ],
  },
  {
    title: 'Tools',
    shortcuts: [
      { key: 'V', label: 'Select tool' },
      { key: 'P', label: 'Add panel' },
      { key: 'D', label: 'Add divider' },
      { key: 'H', label: 'Hardware mode' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { key: 'F', label: 'Focus selected' },
      { key: 'R', label: 'Reset camera' },
      { key: '1-6', label: 'Preset views' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { key: 'Ctrl+S', label: 'Save project' },
      { key: 'Ctrl+Z', label: 'Undo' },
      { key: 'Ctrl+Shift+Z', label: 'Redo' },
      { key: 'Ctrl+K', label: 'Command palette' },
    ],
  },
];
```

### 2. Contextual Hints in StatusBar
Show relevant shortcuts based on current state:
- No selection: "Press P to add panel"
- Panel selected: "Press D for divider, H for hardware"
- Hardware mode: "Click to place, Esc to cancel"

### 3. Keyboard Registration
```typescript
// In App.tsx or dedicated hook
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // ? or Ctrl+/
    if (e.key === '?' || (e.ctrlKey && e.key === '/')) {
      e.preventDefault();
      setShowShortcutHelp(true);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

## Implementation Steps
1. Create `ShortcutHelpModal.tsx` component
2. Add `showShortcutHelp` state to App.tsx
3. Register `?` and `Ctrl+/` keyboard handlers
4. Add contextual hints to StatusBar
5. Style with dark theme (#1a1a2e base)

## Verify
```bash
npm run dev
# Press ? → Modal appears with all shortcuts
# Press Ctrl+/ → Same modal
# Press Esc → Modal closes
# Check StatusBar shows contextual hints
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/ui/ShortcutHelpModal.tsx | CREATE | Shortcut help modal |
| src/App.tsx | MODIFY | Add state and keyboard handler |
| src/components/ui/StatusBar.tsx | MODIFY | Add contextual hints |

## Anti-Drift Rules
- Do NOT duplicate shortcut definitions (single source of truth)
- Do NOT break existing keyboard handlers
- Do NOT use hard-coded colors (use theme constants)
- Do NOT forget accessibility (focus trap, aria-labels)

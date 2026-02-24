# TASK: Optional Polish PR-A (O1 + O2)

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Vite
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/routes/index.tsx                        # Route definitions (READ FIRST)
src/components/ui/LoadingSpinner.tsx        # If exists, check existing pattern
.claude/CLAUDE.md                           # Theme tokens reference
```

## Scope

### O1) Fallback Theme Tokens
Convert `WorkspaceLoadingFallback` from inline styles to Monolith theme class tokens.

**Current State** (inline styles):
```typescript
function WorkspaceLoadingFallback() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: 'white',
    }}>
      {/* ... spinner with inline styles ... */}
    </div>
  );
}
```

**Target State**:
- Extract to reusable `LoadingScreen` component in `src/components/ui/LoadingScreen.tsx`
- Use Monolith theme tokens:
  - Background: `#1a1a2e` (base) or `#0a0a0a` (darker variant)
  - Accent: `#8b5cf6` (purple)
  - Text: `rgba(255,255,255,0.7)` or `#a0a0a0`
- CSS-in-JS or CSS module pattern (match existing codebase)

**Optional Reusable Component**:
```typescript
// src/components/ui/LoadingScreen.tsx
interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading…' }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <div className="loading-message">{message}</div>
    </div>
  );
}
```

---

### O2) Clean Unused Imports
Remove unused imports in `src/routes/index.tsx`.

**Check these imports** (only remove if truly unused in entire file):
```typescript
import { useMemo, useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
```

**Rules**:
- Scan ENTIRE file before removing
- Keep: `Suspense`, `lazy`, `createBrowserRouter`, `RouterProvider`, `Navigate`
- Check usage of: `useMemo`, `useEffect`, `useState`, `useCallback`
- Check usage of: `Link`, `useParams`, `useNavigate`, `useLocation`

---

## Files to Modify
| File | Change |
|------|--------|
| `src/routes/index.tsx` | Refactor fallback, clean imports |
| `src/components/ui/LoadingScreen.tsx` | CREATE (optional, for reusability) |

## Rules
- No folder moves, no API breaks
- Keep Suspense boundaries intact
- No behavior changes to routing
- Match existing code style in codebase

## Verify
```bash
# TypeScript check
npx tsc --noEmit

# Build check
npm run build

# Visual check
npm run dev
# Refresh / → See themed fallback briefly
# Verify spinner uses theme accent color
```

## Acceptance Criteria
- [ ] Visual: fallback background/typography matches Monolith dark theme
- [ ] No inline style objects longer than 3 properties (unless necessary)
- [ ] `npx tsc --noEmit` passes (no new errors)
- [ ] Lint doesn't flag unused imports in routes/index.tsx
- [ ] Routing behavior unchanged

## Anti-Drift Rules
- Do NOT change routing logic
- Do NOT remove Suspense boundaries
- Do NOT add new dependencies
- Do NOT break existing imports used elsewhere in file

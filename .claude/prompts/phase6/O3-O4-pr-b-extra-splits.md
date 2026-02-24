# TASK: Optional Polish PR-B (O3 + O4)

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Vite, React Router
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/routes/index.tsx                        # Route definitions (READ FIRST)
src/components/pages/SafetyGatePage.tsx     # Safety page to lazy load
src/factory/FactoryApp.tsx                  # Factory app to lazy load
src/core/auth/guards.tsx                    # RequireRole implementation
```

## Scope

### O3) Lazy SafetyGatePage

**Current State**:
```typescript
import { SafetyGatePage } from '../components/pages/SafetyGatePage';
// ...
{ path: '/diagnostics/safety', element: <SafetyGatePage /> },
```

**Target State**:
```typescript
const SafetyGatePage = lazy(() =>
  import('../components/pages/SafetyGatePage').then(m => ({ default: m.SafetyGatePage }))
);
// ...
{
  path: '/diagnostics/safety',
  element: (
    <Suspense fallback={<LoadingScreen message="Loading Safety Diagnostics…" />}>
      <SafetyGatePage />
    </Suspense>
  ),
},
```

---

### O4) Lazy FactoryApp

**Current State**:
```typescript
import { FactoryApp } from '../factory/FactoryApp';
// ...
{
  path: '/factory',
  element: (
    <RequireRole role="FACTORY">
      <FactoryApp useMockApi={false} />
    </RequireRole>
  ),
},
```

**Target State**:
```typescript
const FactoryApp = lazy(() =>
  import('../factory/FactoryApp').then(m => ({ default: m.FactoryApp }))
);
// ...
{
  path: '/factory',
  element: (
    <RequireRole role="FACTORY">
      <Suspense fallback={<LoadingScreen message="Loading Factory…" />}>
        <FactoryApp useMockApi={false} />
      </Suspense>
    </RequireRole>
  ),
},
```

**CRITICAL**: Place `<Suspense>` INSIDE `<RequireRole>` to ensure:
1. Role guard executes BEFORE any Factory code loads
2. Unauthorized users redirect immediately without loading Factory chunk
3. Only authorized users trigger the lazy load

---

## RequireRole Behavior Check

Before implementing, verify how `RequireRole` works:

```typescript
// Expected pattern in src/core/auth/guards.tsx
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const hasRequiredRole = hasRole(role);

  if (!hasRequiredRole) {
    return <Navigate to="/unauthorized" replace />;
    // OR redirect to login, etc.
  }

  return <>{children}</>;  // Only renders children if role passes
}
```

If `RequireRole` renders children unconditionally (even during auth check), adjust Suspense placement or fix the guard.

---

## Files to Modify
| File | Change |
|------|--------|
| `src/routes/index.tsx` | Convert SafetyGatePage and FactoryApp to lazy imports |

## Rules
- No routing behavior changes
- Ensure RequireRole still blocks unauthorized users WITHOUT importing FactoryApp eagerly
- Provide themed Suspense fallbacks (reuse LoadingScreen from O1 if available)
- Keep existing route paths unchanged

## Verify
```bash
# Build check
npm run build

# TypeScript check
npx tsc --noEmit

# Manual verification
npm run dev
```

### Network Tab Verification

1. **Open `/projects`** (or any non-lazy route)
   - ❌ Should NOT load: `SafetyGatePage-*.js` chunk
   - ❌ Should NOT load: `FactoryApp-*.js` chunk
   - ❌ Should NOT load: `vendor-three-*.js` (existing T018 behavior)

2. **Navigate to `/diagnostics/safety`**
   - ✅ Should see fallback briefly
   - ✅ Should load: `SafetyGatePage-*.js` chunk
   - ✅ Page renders correctly

3. **Navigate to `/factory` WITH valid role**
   - ✅ Should see fallback briefly
   - ✅ Should load: `FactoryApp-*.js` chunk
   - ✅ Page renders correctly

4. **Navigate to `/factory` WITHOUT role**
   - ✅ Should redirect immediately (to unauthorized or login)
   - ❌ Should NOT load: `FactoryApp-*.js` chunk
   - ❌ Should NOT see Factory loading fallback

---

## Acceptance Criteria
- [ ] `/projects` does NOT load Safety or Factory chunks
- [ ] `/diagnostics/safety` loads on demand with fallback
- [ ] `/factory` (with role) loads on demand with fallback
- [ ] `/factory` (without role) redirects immediately, no Factory chunk loaded
- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] No routing behavior changes

## Anti-Drift Rules
- Do NOT change RequireRole logic
- Do NOT change route paths
- Do NOT forget named export handling in lazy imports
- Do NOT place Suspense OUTSIDE RequireRole (security issue)
- Do NOT break existing role-based access control

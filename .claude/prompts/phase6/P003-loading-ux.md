# TASK: P003 - Loading UX Standardization

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Suspense
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/routes/index.tsx                        # Route-level Suspense (READ FIRST)
src/App.tsx                                 # Lazy component imports
src/components/canvas/TexturedWoodMaterial.tsx  # Texture loading states
```

## Problem
Inconsistent loading states: some show spinner, some blank, some jarring flash.

## Requirements

### 1. Unified LoadingSpinner Component
Create `src/components/ui/LoadingSpinner.tsx`:
```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  fullScreen?: boolean;
}

const SIZES = {
  sm: { spinner: 16, border: 2 },
  md: { spinner: 32, border: 3 },
  lg: { spinner: 48, border: 4 },
};

export function LoadingSpinner({
  size = 'md',
  label,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const { spinner, border } = SIZES[size];

  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.75rem',
    }}>
      <div
        style={{
          width: spinner,
          height: spinner,
          border: `${border}px solid #3a3a5a`,
          borderTopColor: '#8b5cf6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {label && (
        <span style={{ color: '#a0a0a0', fontSize: '14px' }}>
          {label}
        </span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        zIndex: 9999,
      }}>
        {content}
      </div>
    );
  }

  return content;
}
```

### 2. CSS Keyframes (add to index.css or inline)
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 3. Suspense Fallback Components
```typescript
// Route-level fallback
export function RouteFallback() {
  return <LoadingSpinner fullScreen label="Loading workspace…" />;
}

// Panel-level fallback (smaller, inline)
export function PanelFallback() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <LoadingSpinner size="sm" />
    </div>
  );
}

// Modal fallback
export function ModalFallback() {
  return (
    <div style={{
      minHeight: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <LoadingSpinner label="Loading…" />
    </div>
  );
}
```

### 4. Texture Loading State
For `TexturedWoodMaterial.tsx`:
```typescript
// Show subtle shimmer while texture loads
function TextureShimmer() {
  return (
    <meshBasicMaterial
      color="#2a2a3a"
      transparent
      opacity={0.5}
    />
  );
}

// Usage
{!texture ? <TextureShimmer /> : <meshStandardMaterial map={texture} />}
```

### 5. Minimum Display Time (prevent flash)
```typescript
// Hook to prevent loading flash
function useMinimumLoadingTime(isLoading: boolean, minMs = 300): boolean {
  const [showLoading, setShowLoading] = useState(isLoading);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      startTime.current = Date.now();
      setShowLoading(true);
    } else if (startTime.current) {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, minMs - elapsed);
      setTimeout(() => setShowLoading(false), remaining);
    }
  }, [isLoading, minMs]);

  return showLoading;
}
```

## Implementation Steps
1. Create `LoadingSpinner.tsx` with size variants
2. Add spin keyframes to CSS
3. Create fallback components for different contexts
4. Update route Suspense fallbacks
5. Update lazy modal Suspense fallbacks
6. Add shimmer state for texture loading

## Verify
```bash
npm run dev
# Refresh page → See workspace loading spinner
# Open modal → See modal loading state
# Throttle network → Verify texture shimmer
# No jarring flashes on fast loads
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/ui/LoadingSpinner.tsx | CREATE | Unified spinner component |
| src/index.css | MODIFY | Add spin keyframes |
| src/routes/index.tsx | MODIFY | Use RouteFallback |
| src/App.tsx | MODIFY | Use ModalFallback for lazy modals |

## Anti-Drift Rules
- Do NOT use different spinner styles in different places
- Do NOT show loading for < 100ms operations
- Do NOT block user interaction unnecessarily
- Do NOT forget dark theme colors

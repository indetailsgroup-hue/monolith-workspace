# TASK: P002 - Error Boundary + Crash Recovery

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Zustand
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/App.tsx                                 # Main app (READ FIRST)
src/main.tsx                                # Root render
src/core/store/useCabinetStore.ts           # Cabinet state (persist?)
src/components/canvas/Canvas3DContainer.tsx # 3D canvas wrapper
```

## Problem
WebGL crashes or runtime errors cause white screen. No recovery path.

## Requirements

### 1. Global ErrorBoundary with Recovery
Create `src/components/ui/ErrorBoundary.tsx`:
```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to analytics/Sentry if configured
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleResetWithClear = () => {
    // Clear problematic state
    localStorage.removeItem('cabinet-storage');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <CrashRecoveryUI
          error={this.state.error}
          onRetry={this.handleReset}
          onClearAndReload={this.handleResetWithClear}
        />
      );
    }
    return this.props.children;
  }
}
```

### 2. CrashRecoveryUI Component
```typescript
function CrashRecoveryUI({ error, onRetry, onClearAndReload }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <h1 style={{ color: '#ef4444', marginBottom: '1rem' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#a0a0a0', marginBottom: '2rem', maxWidth: '400px', textAlign: 'center' }}>
        The application encountered an unexpected error.
        Your work may have been auto-saved.
      </p>

      {/* Error details (collapsible) */}
      <details style={{ marginBottom: '2rem', maxWidth: '600px' }}>
        <summary style={{ cursor: 'pointer', color: '#8b5cf6' }}>
          Technical Details
        </summary>
        <pre style={{
          background: '#0a0a0a',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          fontSize: '12px',
        }}>
          {error?.message}
          {error?.stack}
        </pre>
      </details>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onRetry} style={primaryButtonStyle}>
          Try Again
        </button>
        <button onClick={onClearAndReload} style={secondaryButtonStyle}>
          Clear Data & Reload
        </button>
      </div>
    </div>
  );
}
```

### 3. Canvas-Specific ErrorBoundary
For WebGL context lost:
```typescript
// Wrap Canvas3DContainer with specialized boundary
<ErrorBoundary fallback={<Canvas3DErrorFallback />}>
  <Canvas3DContainer />
</ErrorBoundary>

function Canvas3DErrorFallback() {
  return (
    <div style={{ /* centered, dark bg */ }}>
      <p>3D rendering failed. Your GPU may be overloaded.</p>
      <button onClick={() => window.location.reload()}>
        Reload Page
      </button>
    </div>
  );
}
```

## Implementation Steps
1. Create `ErrorBoundary.tsx` class component
2. Create `CrashRecoveryUI.tsx` functional component
3. Wrap App in `main.tsx` with ErrorBoundary
4. Add Canvas-specific ErrorBoundary in Canvas3DContainer
5. Test by throwing error in dev mode

## Verify
```bash
npm run dev
# In React DevTools, force error in a component
# Verify recovery UI appears
# Test "Try Again" button
# Test "Clear Data & Reload" button
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/ui/ErrorBoundary.tsx | CREATE | Error boundary class |
| src/components/ui/CrashRecoveryUI.tsx | CREATE | Recovery UI |
| src/main.tsx | MODIFY | Wrap with ErrorBoundary |
| src/components/canvas/Canvas3DContainer.tsx | MODIFY | Add canvas-specific boundary |

## Anti-Drift Rules
- Do NOT catch errors that should propagate
- Do NOT lose user data (check autosave first)
- Do NOT show technical errors to users by default
- Do NOT forget to log errors for debugging

# TASK: P008 - Route/Feature Flags for "Pitch Mode"

You are a senior React + TypeScript engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, React Router
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/routes/index.tsx                        # Route definitions (READ FIRST)
src/runtime/env.ts                          # Environment config
src/App.tsx                                 # Main workspace
src/components/ui/StatusBar.tsx             # UI elements to hide
```

## Problem
Demo/pitch mode needs to hide WIP features, debug UI, and unpolished elements.

## Requirements

### 1. Feature Flags System
Create `src/core/featureFlags.ts`:
```typescript
export interface FeatureFlags {
  // Core features
  showDebugPanel: boolean;
  showPerfOverlay: boolean;
  showDevTools: boolean;

  // WIP features to hide in pitch
  showCNCExport: boolean;
  showAdvancedHardware: boolean;
  showMaterialEditor: boolean;
  showBatchOperations: boolean;

  // Demo enhancements
  showWatermark: boolean;
  demoMode: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  showDebugPanel: import.meta.env.DEV,
  showPerfOverlay: false,
  showDevTools: import.meta.env.DEV,

  showCNCExport: true,
  showAdvancedHardware: true,
  showMaterialEditor: true,
  showBatchOperations: true,

  showWatermark: false,
  demoMode: false,
};

// URL param overrides: ?pitch=1
function getFlagsFromUrl(): Partial<FeatureFlags> {
  const params = new URLSearchParams(window.location.search);

  if (params.get('pitch') === '1' || params.get('demo') === '1') {
    return {
      showDebugPanel: false,
      showPerfOverlay: false,
      showDevTools: false,
      showCNCExport: false,
      showAdvancedHardware: false,
      showMaterialEditor: false,
      showBatchOperations: false,
      showWatermark: true,
      demoMode: true,
    };
  }

  return {};
}

export const featureFlags: FeatureFlags = {
  ...DEFAULT_FLAGS,
  ...getFlagsFromUrl(),
};

// React hook
export function useFeatureFlag<K extends keyof FeatureFlags>(
  flag: K
): FeatureFlags[K] {
  return featureFlags[flag];
}
```

### 2. Feature Guard Component
```typescript
interface FeatureGateProps {
  flag: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ flag, children, fallback = null }: FeatureGateProps) {
  const enabled = useFeatureFlag(flag);
  return enabled ? <>{children}</> : <>{fallback}</>;
}

// Usage
<FeatureGate flag="showCNCExport">
  <CNCExportButton />
</FeatureGate>
```

### 3. Pitch Mode Route
```typescript
// In routes/index.tsx
{
  path: '/pitch',
  element: <Navigate to="/?pitch=1" replace />,
},

// Or dedicated pitch workspace
{
  path: '/pitch',
  element: (
    <Suspense fallback={<WorkspaceLoadingFallback />}>
      <PitchModeProvider>
        <DesignerWorkspace />
      </PitchModeProvider>
    </Suspense>
  ),
},
```

### 4. Demo Watermark
```typescript
function DemoWatermark() {
  if (!featureFlags.showWatermark) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      background: 'rgba(139, 92, 246, 0.9)',
      color: 'white',
      padding: '8px 16px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      pointerEvents: 'none',
      zIndex: 9999,
    }}>
      DEMO
    </div>
  );
}
```

### 5. Conditional UI Elements
```typescript
// StatusBar.tsx
function StatusBar() {
  return (
    <div className="status-bar">
      <FeatureGate flag="showDebugPanel">
        <DebugInfo />
      </FeatureGate>

      {/* Always shown */}
      <SaveIndicator />
      <ZoomLevel />

      <FeatureGate flag="demoMode">
        <span style={{ color: '#8b5cf6' }}>Demo Mode</span>
      </FeatureGate>
    </div>
  );
}
```

### 6. Simplified Toolbar for Pitch
```typescript
// Toolbar.tsx
function Toolbar() {
  const demoMode = useFeatureFlag('demoMode');

  const tools = demoMode
    ? ['select', 'addPanel', 'addDivider']  // Core tools only
    : ['select', 'addPanel', 'addDivider', 'addHardware', 'measure', 'export'];

  return (
    <div className="toolbar">
      {tools.map(tool => <ToolButton key={tool} tool={tool} />)}
    </div>
  );
}
```

### 7. Preloaded Demo Project
```typescript
// Load demo project in pitch mode
useEffect(() => {
  if (featureFlags.demoMode) {
    loadDemoProject();
  }
}, []);

async function loadDemoProject() {
  const demo = await import('./data/demoProject.json');
  useCabinetStore.getState().loadProject(demo);
}
```

## Implementation Steps
1. Create `featureFlags.ts` with URL param support
2. Create `FeatureGate` component
3. Add `?pitch=1` detection
4. Add demo watermark
5. Update Toolbar to respect flags
6. Update StatusBar to respect flags
7. Create demo project JSON
8. Add `/pitch` route redirect

## Verify
```bash
npm run dev
# Normal mode: all features visible
# Add ?pitch=1 to URL
# Verify: debug panels hidden
# Verify: WIP features hidden
# Verify: "DEMO" watermark visible
# Verify: simplified toolbar
# Navigate to /pitch → redirects with flag
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/featureFlags.ts | CREATE | Feature flag system |
| src/components/ui/FeatureGate.tsx | CREATE | Conditional render component |
| src/components/ui/DemoWatermark.tsx | CREATE | Demo watermark |
| src/routes/index.tsx | MODIFY | Add /pitch route |
| src/App.tsx | MODIFY | Add DemoWatermark, respect flags |
| src/components/ui/Toolbar.tsx | MODIFY | Respect demoMode flag |

## Anti-Drift Rules
- Do NOT hardcode feature hiding (use flags)
- Do NOT break normal development workflow
- Do NOT forget to hide console.logs in pitch mode
- Do NOT show unfinished features in demos
- Do NOT make pitch mode the default

# TASK: P006 - Performance Instrumentation (DEV-only)

You are a senior React + Three.js performance engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, Three.js, @react-three/fiber
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/components/canvas/Canvas3DContainer.tsx # Canvas setup (READ FIRST)
src/components/canvas/Cabinet3D.tsx         # Main 3D component
src/core/store/useCabinetStore.ts           # State updates
src/App.tsx                                 # Root component
```

## Problem
No visibility into render performance. Hard to diagnose slowdowns.

## Requirements

### 1. DEV-only Performance Overlay
Create `src/components/dev/PerfOverlay.tsx`:
```typescript
// Only render in development
if (import.meta.env.PROD) {
  export function PerfOverlay() { return null; }
} else {
  export function PerfOverlay() {
    const { fps, frameTime, drawCalls, triangles, textures } = usePerfStats();

    return (
      <div style={{
        position: 'fixed',
        top: 8,
        left: 8,
        background: 'rgba(0,0,0,0.8)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: 8,
        borderRadius: 4,
        zIndex: 9999,
        pointerEvents: 'none',
      }}>
        <div>FPS: {fps.toFixed(0)} ({frameTime.toFixed(1)}ms)</div>
        <div>Draw calls: {drawCalls}</div>
        <div>Triangles: {(triangles / 1000).toFixed(1)}K</div>
        <div>Textures: {textures}</div>
      </div>
    );
  }
}
```

### 2. Three.js Stats Hook
```typescript
import { useThree, useFrame } from '@react-three/fiber';

function usePerfStats() {
  const { gl } = useThree();
  const [stats, setStats] = useState({
    fps: 60,
    frameTime: 16,
    drawCalls: 0,
    triangles: 0,
    textures: 0,
  });

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 1000) {
      const info = gl.info;
      setStats({
        fps: (frameCount.current / elapsed) * 1000,
        frameTime: elapsed / frameCount.current,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
      });
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return stats;
}
```

### 3. React Render Profiling
```typescript
// Wrap components to log re-renders
function useRenderCount(componentName: string) {
  const count = useRef(0);
  count.current++;

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[Render] ${componentName}: ${count.current}`);
    }
  });
}

// Usage in component
function Cabinet3D() {
  useRenderCount('Cabinet3D');
  // ...
}
```

### 4. Store Update Logging
```typescript
// Zustand middleware for DEV logging
const logMiddleware = (config) => (set, get, api) =>
  config(
    (...args) => {
      if (import.meta.env.DEV) {
        console.log('[Store] Before:', get());
        set(...args);
        console.log('[Store] After:', get());
      } else {
        set(...args);
      }
    },
    get,
    api
  );
```

### 5. Frame Time Warning
```typescript
// Alert if frame time exceeds threshold
useFrame((_, delta) => {
  if (import.meta.env.DEV && delta > 0.1) { // > 100ms
    console.warn(`[Perf] Slow frame: ${(delta * 1000).toFixed(0)}ms`);
  }
});
```

### 6. Memory Tracking
```typescript
function useMemoryStats() {
  const [memory, setMemory] = useState<{
    used: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const interval = setInterval(() => {
      // @ts-ignore - performance.memory is Chrome-only
      const mem = performance.memory;
      if (mem) {
        setMemory({
          used: mem.usedJSHeapSize / 1024 / 1024,
          total: mem.totalJSHeapSize / 1024 / 1024,
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return memory;
}
```

### 7. Toggle with Keyboard
```typescript
// Press ` (backtick) to toggle perf overlay
const [showPerf, setShowPerf] = useState(false);

useEffect(() => {
  if (!import.meta.env.DEV) return;

  const handler = (e: KeyboardEvent) => {
    if (e.key === '`') {
      setShowPerf(prev => !prev);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

## Implementation Steps
1. Create `PerfOverlay.tsx` (DEV-only)
2. Create `usePerfStats` hook for Three.js metrics
3. Add render count logging (optional, commented by default)
4. Add frame time warning
5. Add keyboard toggle (backtick key)
6. Ensure all code tree-shakes in production

## Verify
```bash
npm run dev
# Press ` → Perf overlay appears
# See FPS, draw calls, triangles
# Make changes → Check for slow frame warnings
# npm run build → Verify no perf code in bundle
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/components/dev/PerfOverlay.tsx | CREATE | Performance overlay |
| src/components/dev/usePerfStats.ts | CREATE | Three.js stats hook |
| src/App.tsx | MODIFY | Add PerfOverlay + toggle |

## Anti-Drift Rules
- Do NOT include in production builds (use import.meta.env.DEV)
- Do NOT impact performance when measuring (observer effect)
- Do NOT log every frame (use sampling)
- Do NOT use console.log in render (use ref + effect)

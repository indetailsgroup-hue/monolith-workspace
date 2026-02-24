# TASK: T018 - Code Splitting

You are a senior React + Vite engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Vite
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
vite.config.ts                              # Build config (READ FIRST)
src/App.tsx                                 # Main app entry
src/main.tsx                                # Root render
package.json                                # Dependencies for chunk analysis
```

## Current State
`vite.config.ts` is minimal:
```typescript
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
```

No `build.rollupOptions.output.manualChunks` configured.

## Requirements

### 1. Lazy Load Heavy Components
```typescript
// In App.tsx or routes
import { lazy, Suspense } from 'react';

const MinifixConfigPanel = lazy(() => import('./components/ui/MinifixConfigPanel'));
const HardwarePanel = lazy(() => import('./components/ui/HardwarePanel'));
const ExportPanel = lazy(() => import('./export/ui/ExportPanel'));
const MaterialSelector = lazy(() => import('./components/ui/MaterialSelector'));
const SafetyGatePage = lazy(() => import('./gate/ui/SafetyPanel'));

// Usage with Suspense
<Suspense fallback={<LoadingFallback />}>
  <MinifixConfigPanel />
</Suspense>
```

### 2. Vite manualChunks Configuration
Update `vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-zustand': ['zustand', 'immer'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 500, // KB
  },
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
```

### 3. Bundle Size Target
- Initial bundle: < 500KB (gzipped)
- Largest chunk: < 250KB
- Total: reasonable for furniture CAD app

### 4. Loading Fallback Component
Create `src/components/ui/LoadingFallback.tsx`:
```typescript
export function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
    </div>
  );
}
```

## Implementation Steps
1. Update `vite.config.ts` with manualChunks
2. Create `LoadingFallback` component
3. Identify heavy components (> 50KB contribution)
4. Convert to lazy imports with Suspense
5. Build and analyze bundle

## Verify
```bash
npm run build
# Check dist/ sizes
ls -la dist/assets/*.js | awk '{print $5, $9}' | sort -n

# Or use rollup-plugin-visualizer
npm install -D rollup-plugin-visualizer
# Add to vite.config.ts and run build
```

### Expected Output Structure
```
dist/assets/
├── index-[hash].js          # < 200KB (main entry)
├── vendor-react-[hash].js   # ~150KB (react ecosystem)
├── vendor-three-[hash].js   # ~300KB (three.js)
├── vendor-zustand-[hash].js # ~20KB
├── MinifixConfigPanel-[hash].js  # Lazy loaded
├── ExportPanel-[hash].js         # Lazy loaded
└── ...
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| vite.config.ts | MODIFY | Add manualChunks, chunkSizeWarningLimit |
| src/components/ui/LoadingFallback.tsx | CREATE | Loading spinner component |
| src/App.tsx | MODIFY | Convert heavy imports to lazy |

## Anti-Drift Rules
- Do NOT lazy load critical path components (Canvas, Cabinet3D)
- Do NOT break existing imports
- Do NOT remove type safety
- Do NOT forget Suspense boundaries

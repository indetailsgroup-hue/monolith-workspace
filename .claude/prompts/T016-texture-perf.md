# TASK: T016 - Texture Loading Performance

You are a senior React + Three.js engineer working on **Monolith Workspace**.

## Context
- Repo: `c:\Projects\iimos-workspace`
- Stack: React 18, TypeScript 5, Three.js, @react-three/fiber, @react-three/drei
- Philosophy: **Design is free. Manufacturing is deterministic.**

## MUST READ FIRST (DO NOT SKIP)
```
src/components/materials/TriplanarMaterial.tsx  # Material with textures
src/components/canvas/Cabinet3D.tsx             # Where textures are used
src/core/materials/MaterialRegistry.ts          # Texture URLs
src/core/materials/useMaterialStore.ts          # Material state
```

## Current State
No texture caching system exists. Each material load is independent.

## Requirements

### 1. Texture Cache (LRU with max 50)
Create `src/core/textures/TextureCache.ts`:
```typescript
import { Texture, TextureLoader } from 'three';

const MAX_CACHE_SIZE = 50;
const cache = new Map<string, Texture>();
const accessOrder: string[] = [];

export function getCachedTexture(url: string): Texture | null {
  if (cache.has(url)) {
    // Move to end (most recently used)
    const idx = accessOrder.indexOf(url);
    if (idx > -1) accessOrder.splice(idx, 1);
    accessOrder.push(url);
    return cache.get(url)!;
  }
  return null;
}

export function setCachedTexture(url: string, texture: Texture): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict LRU
    const oldest = accessOrder.shift();
    if (oldest) {
      cache.get(oldest)?.dispose();
      cache.delete(oldest);
    }
  }
  cache.set(url, texture);
  accessOrder.push(url);
}
```

### 2. Lazy Load with Suspense
Use `useTexture` from drei with Suspense boundary:
```typescript
import { useTexture } from '@react-three/drei';

// In component
const texture = useTexture(url, (tex) => {
  setCachedTexture(url, tex);
});
```

### 3. Preload Visible Materials
```typescript
import { useTexture } from '@react-three/drei';

// Preload in parent component
useTexture.preload([url1, url2, url3]);
```

### 4. Thumbnail Size (256x256)
For MaterialSelector thumbnails, use smaller images:
- Store `thumbnailUrl` (256x256) separate from `textureUrl` (full)
- Load thumbnails in selector grid
- Load full texture only when applied

### 5. Loading Indicators
Show placeholder while loading:
```tsx
<Suspense fallback={<LoadingPlaceholder />}>
  <MaterialMesh url={textureUrl} />
</Suspense>
```

## Implementation Steps
1. Create `TextureCache.ts` utility
2. Create `useTextureWithCache` hook
3. Add Suspense boundaries in Cabinet3D
4. Add thumbnail support to MaterialRegistry
5. Add loading skeleton to MaterialSelector

## Rules
1. Always dispose textures on eviction
2. Use drei's useTexture for R3F integration
3. No blocking main thread
4. Memoize texture references

## Verify
```bash
npx tsc --noEmit
npm run test:run
# Manual test: Open app, check DevTools Network tab for texture loading behavior
```

## Output Format
| File | Change Type | Description |
|------|-------------|-------------|
| src/core/textures/TextureCache.ts | CREATE | LRU texture cache |
| src/core/textures/useTextureWithCache.ts | CREATE | Custom hook with caching |
| src/components/canvas/Cabinet3D.tsx | MODIFY | Add Suspense boundaries |
| src/components/ui/MaterialSelector.tsx | MODIFY | Use thumbnails |

## Anti-Drift Rules
- Do NOT create global mutable state outside cache module
- Do NOT forget to dispose textures
- Do NOT block render while loading

/**
 * useObjectUrlTexture - Shared Texture Loader with RefCount
 *
 * T016: Performance optimization
 * - Module-level texture cache with reference counting
 * - Automatic disposal when last user unmounts
 * - Works with objectURLs from textureLRU cache
 *
 * @version 1.0.0
 */

import { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================================================
// Module-level Texture Cache
// ============================================================================

interface CachedTexture {
  texture: THREE.Texture;
  refCount: number;
  url: string;
}

/** Shared texture cache - keyed by objectUrl */
const textureCache = new Map<string, CachedTexture>();

/** Pending loads - for deduplication */
const pendingLoads = new Map<string, Promise<THREE.Texture>>();

/** Shared texture loader */
const loader = new THREE.TextureLoader();

/**
 * Load texture from URL (internal)
 */
async function loadTextureFromUrl(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        // Configure texture for wood grain rendering
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });
}

/**
 * Get or load texture with reference counting
 */
async function acquireTexture(url: string): Promise<THREE.Texture> {
  // Check cache first
  const cached = textureCache.get(url);
  if (cached) {
    cached.refCount++;
    return cached.texture;
  }

  // Check if already loading
  const pending = pendingLoads.get(url);
  if (pending) {
    const texture = await pending;
    // Increment refCount after pending resolves (already in cache)
    const entry = textureCache.get(url);
    if (entry) entry.refCount++;
    return texture;
  }

  // Start new load
  const loadPromise = loadTextureFromUrl(url);
  pendingLoads.set(url, loadPromise);

  try {
    const texture = await loadPromise;

    // Store in cache
    textureCache.set(url, {
      texture,
      refCount: 1,
      url,
    });

    return texture;
  } finally {
    pendingLoads.delete(url);
  }
}

/**
 * Release texture reference
 */
function releaseTexture(url: string): void {
  const cached = textureCache.get(url);
  if (!cached) return;

  cached.refCount--;

  if (cached.refCount <= 0) {
    // Dispose and remove from cache
    cached.texture.dispose();
    textureCache.delete(url);
    // console.log(`[TextureCache] Disposed: ${url.substring(0, 50)}...`);
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook to load and share textures from objectURLs
 *
 * @param objectUrl - The objectURL from textureLRU cache (or null)
 * @returns THREE.Texture or null while loading
 */
export function useObjectUrlTexture(objectUrl: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    if (!objectUrl) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    const currentUrl = objectUrl;

    acquireTexture(objectUrl)
      .then((tex) => {
        if (!cancelled) {
          setTexture(tex);
          invalidate();
        } else {
          // Component unmounted during load - release immediately
          releaseTexture(currentUrl);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useObjectUrlTexture] Load failed:', err);
          setTexture(null);
        }
      });

    return () => {
      cancelled = true;
      // Only release if we successfully acquired
      if (texture) {
        releaseTexture(currentUrl);
      }
    };
  }, [objectUrl, invalidate]);

  // Handle URL change - release old texture
  useEffect(() => {
    return () => {
      if (objectUrl) {
        releaseTexture(objectUrl);
      }
    };
  }, [objectUrl]);

  return texture;
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Get current cache stats (for debugging)
 */
export function getTextureCacheStats(): { count: number; urls: string[] } {
  return {
    count: textureCache.size,
    urls: Array.from(textureCache.keys()),
  };
}

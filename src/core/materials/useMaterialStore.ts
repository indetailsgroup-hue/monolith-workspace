/**
 * MaterialStore - Material State Management
 *
 * ARCHITECTURE (North Star v4.0):
 * - Manages active material selection
 * - Handles texture loading with LRU cache
 * - Supports True-Grain™ UV mapping
 *
 * T016: Performance optimization
 * - Split thumb/full loading
 * - LRU cache with objectURL (not base64)
 * - Preload visible thumbnails only
 *
 * @version 2.0.0
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import {
  MaterialSpec,
  getMaterial,
  getDefaultMaterial,
} from './MaterialRegistry';
import { textureLRU } from './textureCache';
import { decodeThumb256 } from './textureThumb';
import { SURFACE_MATERIALS } from '../store/useCabinetStore';

// Enable Immer MapSet plugin for Set/Map support in store
enableMapSet();

/**
 * Unified material lookup: checks both MaterialRegistry and SURFACE_MATERIALS
 */
function getAnyMaterial(id: string): { textureUrl?: string; name: string } | undefined {
  // First check MaterialRegistry (new material system)
  const registryMaterial = getMaterial(id);
  if (registryMaterial) return registryMaterial;

  // Fallback to SURFACE_MATERIALS (cabinet material system)
  const surfaceMaterial = SURFACE_MATERIALS[id as keyof typeof SURFACE_MATERIALS];
  if (surfaceMaterial) return surfaceMaterial;

  return undefined;
}

// ============================================
// TYPES
// ============================================

/**
 * T016: Split thumb/full texture storage
 */
export interface LoadedTexture {
  materialId: string;

  /** 256px thumbnail as dataUrl (small, safe for UI) */
  thumbDataUrl?: string;
  thumbLoaded: boolean;

  /** Full texture as objectURL (for 3D rendering) */
  fullObjectUrl?: string;
  fullLoaded: boolean;

  /** Original dimensions */
  width?: number;
  height?: number;

  /** Error message if loading failed */
  error?: string;
}

export type TextureLoadKind = 'thumb' | 'full';

export interface MaterialState {
  // Current selection
  activeMaterialId: string;

  // Loaded textures cache
  loadedTextures: Record<string, LoadedTexture>;

  // Loading state (tracks materialId being loaded)
  loadingMaterials: Set<string>;

  // Actions
  setActiveMaterial: (id: string) => void;
  loadTexture: (materialId: string, kind?: TextureLoadKind) => Promise<void>;
  preloadVisibleThumbnails: (materialIds: string[]) => Promise<void>;

  // Getters
  getActiveMaterial: () => MaterialSpec | undefined;
  getThumbDataUrl: (materialId: string) => string | null;
  getFullObjectUrl: (materialId: string) => string | null;
  isThumbLoaded: (materialId: string) => boolean;
  isFullLoaded: (materialId: string) => boolean;

  // Legacy compatibility (deprecated, use getThumbDataUrl or getFullObjectUrl)
  getTextureDataUrl: (materialId: string) => string | null;
  isTextureLoaded: (materialId: string) => boolean;
}

// ============================================
// STORE
// ============================================

export const useMaterialStore = create<MaterialState>()(
  immer((set, get) => ({
    activeMaterialId: getDefaultMaterial().id,
    loadedTextures: {},
    loadingMaterials: new Set(),

    /**
     * Set active material for assignment
     */
    setActiveMaterial: (id) => {
      const material = getMaterial(id);
      if (!material) {
        console.warn(`[Material] Unknown material: ${id}`);
        return;
      }

      set((state) => {
        state.activeMaterialId = id;
      });

      // T016: Auto-load full texture when material is activated
      if (material.textureUrl && !get().isFullLoaded(id)) {
        get().loadTexture(id, 'full');
      }

      console.log(`[Material] Active: ${material.name}`);
    },

    /**
     * T016: Load texture with kind (thumb or full)
     * Uses unified material lookup (MaterialRegistry + SURFACE_MATERIALS)
     */
    loadTexture: async (materialId, kind = 'full') => {
      const material = getAnyMaterial(materialId);
      if (!material) return;

      // Skip if no texture URL (solid colors)
      if (!material.textureUrl) {
        set((state) => {
          state.loadedTextures[materialId] = {
            materialId,
            thumbDataUrl: '',
            thumbLoaded: true,
            fullObjectUrl: '',
            fullLoaded: true,
            width: 0,
            height: 0,
          };
        });
        return;
      }

      // Check if already loaded
      const current = get().loadedTextures[materialId];
      if (kind === 'thumb' && current?.thumbLoaded) return;
      if (kind === 'full' && current?.fullLoaded) return;

      // Skip if already loading
      const loadKey = `${materialId}:${kind}`;
      if (get().loadingMaterials.has(loadKey)) return;

      // Mark as loading
      set((state) => {
        state.loadingMaterials.add(loadKey);
      });

      try {
        // Fetch via LRU cache (returns blob + objectUrl)
        const entry = await textureLRU.fetch(material.textureUrl);

        // Decode thumbnail (always do this - it's cheap and useful)
        const decoded = await decodeThumb256(entry.blob);

        set((state) => {
          const prev = state.loadedTextures[materialId] ?? {
            materialId,
            thumbLoaded: false,
            fullLoaded: false,
          };

          state.loadedTextures[materialId] = {
            ...prev,
            materialId,
            thumbDataUrl: decoded.thumbDataUrl,
            thumbLoaded: true,
            width: decoded.width,
            height: decoded.height,

            // Full: only mark loaded when kind === 'full'
            fullObjectUrl: kind === 'full' ? entry.objectUrl : prev.fullObjectUrl,
            fullLoaded: kind === 'full' ? true : (prev.fullLoaded ?? false),
          };

          state.loadingMaterials.delete(loadKey);
        });

        console.log(
          `[Material] ✅ Loaded ${kind}: ${material.name} (${decoded.width}×${decoded.height})`
        );
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Material] ❌ Failed to load ${kind}: ${material.name}`, error);

        set((state) => {
          state.loadedTextures[materialId] = {
            materialId,
            thumbLoaded: false,
            fullLoaded: false,
            error: errMsg,
          };
          state.loadingMaterials.delete(loadKey);
        });
      }
    },

    /**
     * T016: Preload thumbnails for visible materials (with concurrency limit)
     */
    preloadVisibleThumbnails: async (materialIds) => {
      const unique = Array.from(new Set(materialIds)).filter(Boolean);
      const concurrencyLimit = 5;
      let index = 0;

      const worker = async () => {
        while (index < unique.length) {
          const id = unique[index++];
          try {
            await get().loadTexture(id, 'thumb');
          } catch {
            // Ignore individual failures, continue preloading
          }
        }
      };

      // Start workers in parallel
      await Promise.all(
        Array.from({ length: Math.min(concurrencyLimit, unique.length) }, worker)
      );
    },

    /**
     * Get active material spec
     */
    getActiveMaterial: () => {
      return getMaterial(get().activeMaterialId);
    },

    /**
     * T016: Get thumbnail dataUrl
     */
    getThumbDataUrl: (materialId) => {
      const loaded = get().loadedTextures[materialId];
      if (!loaded?.thumbLoaded || !loaded.thumbDataUrl) return null;
      return loaded.thumbDataUrl;
    },

    /**
     * T016: Get full texture objectUrl
     */
    getFullObjectUrl: (materialId) => {
      const loaded = get().loadedTextures[materialId];
      if (!loaded?.fullLoaded || !loaded.fullObjectUrl) return null;
      return loaded.fullObjectUrl;
    },

    /**
     * T016: Check if thumbnail is loaded
     */
    isThumbLoaded: (materialId) => {
      return get().loadedTextures[materialId]?.thumbLoaded ?? false;
    },

    /**
     * T016: Check if full texture is loaded
     */
    isFullLoaded: (materialId) => {
      return get().loadedTextures[materialId]?.fullLoaded ?? false;
    },

    /**
     * Legacy: Get texture data URL (returns thumb for compatibility)
     * @deprecated Use getThumbDataUrl or getFullObjectUrl
     */
    getTextureDataUrl: (materialId) => {
      return get().getThumbDataUrl(materialId);
    },

    /**
     * Legacy: Check if texture is loaded (checks thumb for compatibility)
     * @deprecated Use isThumbLoaded or isFullLoaded
     */
    isTextureLoaded: (materialId) => {
      return get().isThumbLoaded(materialId);
    },
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectActiveMaterial = (state: MaterialState) =>
  getMaterial(state.activeMaterialId);

export const selectLoadingCount = (state: MaterialState) =>
  state.loadingMaterials.size;

export const selectLoadedCount = (state: MaterialState) =>
  Object.values(state.loadedTextures).filter((t) => t.thumbLoaded).length;

// ============================================
// HOOKS
// ============================================

import { useEffect } from 'react';

/**
 * T016: Hook to preload active material only (not all)
 * @deprecated Consider using preloadVisibleThumbnails in component instead
 */
export function usePreloadTextures() {
  const activeMaterialId = useMaterialStore((s) => s.activeMaterialId);
  const loadTexture = useMaterialStore((s) => s.loadTexture);
  const isFullLoaded = useMaterialStore((s) => s.isFullLoaded(activeMaterialId));

  useEffect(() => {
    // Only preload the active material's full texture
    if (!isFullLoaded) {
      loadTexture(activeMaterialId, 'full');
    }
  }, [activeMaterialId, isFullLoaded, loadTexture]);
}

/**
 * Hook to get texture for a material
 */
export function useTexture(materialId: string) {
  const loadTexture = useMaterialStore((s) => s.loadTexture);
  const thumbDataUrl = useMaterialStore((s) => s.getThumbDataUrl(materialId));
  const fullObjectUrl = useMaterialStore((s) => s.getFullObjectUrl(materialId));
  const isThumbLoaded = useMaterialStore((s) => s.isThumbLoaded(materialId));
  const isFullLoaded = useMaterialStore((s) => s.isFullLoaded(materialId));

  useEffect(() => {
    if (!isFullLoaded) {
      loadTexture(materialId, 'full');
    }
  }, [materialId, isFullLoaded, loadTexture]);

  return {
    thumbDataUrl,
    fullObjectUrl,
    isThumbLoaded,
    isFullLoaded,
    // Legacy compatibility
    dataUrl: thumbDataUrl,
    isLoaded: isThumbLoaded,
  };
}

/**
 * T016: Hook to get only thumbnail (for UI lists)
 */
export function useThumbnail(materialId: string) {
  const loadTexture = useMaterialStore((s) => s.loadTexture);
  const thumbDataUrl = useMaterialStore((s) => s.getThumbDataUrl(materialId));
  const isLoaded = useMaterialStore((s) => s.isThumbLoaded(materialId));

  useEffect(() => {
    if (!isLoaded) {
      loadTexture(materialId, 'thumb');
    }
  }, [materialId, isLoaded, loadTexture]);

  return { thumbDataUrl, isLoaded };
}

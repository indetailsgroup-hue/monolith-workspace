/**
 * MaterialStore - Material State Management
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Manages active material selection
 * - Handles texture loading
 * - Supports True-Grain™ UV mapping
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { 
  MaterialSpec, 
  MATERIAL_CATALOG, 
  getMaterial, 
  getDefaultMaterial,
  calculateTextureRepeat,
} from './MaterialRegistry';

// ============================================
// TYPES
// ============================================

export interface LoadedTexture {
  materialId: string;
  dataUrl: string;
  width: number;
  height: number;
  loaded: boolean;
  error?: string;
  /** Full-resolution texture loaded */
  fullLoaded?: boolean;
  /** Object URL for full-resolution texture */
  fullObjectUrl?: string | null;
}

export interface MaterialState {
  // Current selection
  activeMaterialId: string;
  
  // Loaded textures cache
  loadedTextures: Record<string, LoadedTexture>;
  
  // Loading state
  loadingMaterials: Set<string>;
  
  // Actions
  setActiveMaterial: (id: string) => void;
  loadTexture: (materialId: string, quality?: 'thumbnail' | 'full') => Promise<void>;
  preloadAllTextures: () => Promise<void>;
  
  // Getters
  getActiveMaterial: () => MaterialSpec | undefined;
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
      
      // Auto-load texture if not loaded
      if (material.textureUrl && !get().isTextureLoaded(id)) {
        get().loadTexture(id);
      }
      
      console.log(`[Material] Active: ${material.name}`);
    },
    
    /**
     * Load texture from URL
     */
    loadTexture: async (materialId) => {
      const material = getMaterial(materialId);
      if (!material) return;
      
      // Skip if no texture URL (solid colors)
      if (!material.textureUrl) {
        set((state) => {
          state.loadedTextures[materialId] = {
            materialId,
            dataUrl: '',
            width: 0,
            height: 0,
            loaded: true,
          };
        });
        return;
      }
      
      // Skip if already loaded or loading
      if (get().loadedTextures[materialId]?.loaded) return;
      if (get().loadingMaterials.has(materialId)) return;
      
      // Mark as loading
      set((state) => {
        state.loadingMaterials.add(materialId);
      });
      
      try {
        console.log(`[Material] Loading texture: ${material.name}`);
        
        const response = await fetch(material.textureUrl);
        const blob = await response.blob();
        
        // Convert to data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        // Get image dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = dataUrl;
        });
        
        set((state) => {
          state.loadedTextures[materialId] = {
            materialId,
            dataUrl,
            width: img.width,
            height: img.height,
            loaded: true,
          };
          state.loadingMaterials.delete(materialId);
        });
        
        console.log(`[Material] ✅ Loaded: ${material.name} (${img.width}×${img.height})`);
        
      } catch (error: any) {
        console.error(`[Material] ❌ Failed to load: ${material.name}`, error);
        
        set((state) => {
          state.loadedTextures[materialId] = {
            materialId,
            dataUrl: '',
            width: 0,
            height: 0,
            loaded: false,
            error: error?.message || 'Unknown error',
          };
          state.loadingMaterials.delete(materialId);
        });
      }
    },
    
    /**
     * Preload all textures in catalog
     */
    preloadAllTextures: async () => {
      console.log('[Material] Preloading all textures...');
      
      const promises = MATERIAL_CATALOG
        .filter(m => m.textureUrl)
        .map(m => get().loadTexture(m.id));
      
      await Promise.all(promises);
      
      console.log('[Material] ✅ All textures preloaded');
    },
    
    /**
     * Get active material spec
     */
    getActiveMaterial: () => {
      return getMaterial(get().activeMaterialId);
    },
    
    /**
     * Get texture data URL for material
     */
    getTextureDataUrl: (materialId) => {
      const loaded = get().loadedTextures[materialId];
      if (!loaded?.loaded || !loaded.dataUrl) return null;
      return loaded.dataUrl;
    },
    
    /**
     * Check if texture is loaded
     */
    isTextureLoaded: (materialId) => {
      return get().loadedTextures[materialId]?.loaded ?? false;
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
  Object.values(state.loadedTextures).filter(t => t.loaded).length;

// ============================================
// HOOKS
// ============================================

import { useEffect } from 'react';

/**
 * Hook to preload textures on mount
 */
export function usePreloadTextures() {
  const preloadAllTextures = useMaterialStore((s) => s.preloadAllTextures);
  
  useEffect(() => {
    preloadAllTextures();
  }, [preloadAllTextures]);
}

/**
 * Hook to get texture for a material
 */
export function useTexture(materialId: string) {
  const loadTexture = useMaterialStore((s) => s.loadTexture);
  const dataUrl = useMaterialStore((s) => s.getTextureDataUrl(materialId));
  const isLoaded = useMaterialStore((s) => s.isTextureLoaded(materialId));
  
  useEffect(() => {
    if (!isLoaded) {
      loadTexture(materialId);
    }
  }, [materialId, isLoaded, loadTexture]);
  
  return { dataUrl, isLoaded };
}

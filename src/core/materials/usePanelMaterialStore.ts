/**
 * PanelMaterialStore - Per-Panel Material Assignment
 * 
 * Manages individual panel material compositions:
 * - Core, Surface (Face A/B), Edge (Top/Bottom/Left/Right)
 * - Supports per-panel overrides from cabinet defaults
 * - Auto-suggests matching edges for surfaces
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  PanelMaterialComposition,
  CoreMaterial,
  SurfaceMaterial,
  EdgeMaterial,
  CORE_MATERIALS_CATALOG,
  SURFACE_MATERIALS_CATALOG,
  EDGE_MATERIALS_CATALOG,
  createDefaultComposition,
  calculateCompositeThickness,
  calculateCutSizeWithEdges,
  calculatePanelCost,
  findMatchingEdge,
  getMatchingEdges,
} from './PanelMaterialSystem';

// ============================================
// TYPES
// ============================================

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';
export type FaceSide = 'faceA' | 'faceB';

export interface PanelMaterialOverride {
  panelId: string;
  composition: Partial<PanelMaterialComposition>;
}

export interface PanelMaterialState {
  // Cabinet defaults
  defaultCoreId: string;
  defaultSurfaceId: string;
  defaultEdgeId: string;
  
  // Per-panel overrides
  panelOverrides: Record<string, Partial<PanelMaterialComposition>>;
  
  // Currently editing
  editingPanelId: string | null;
  
  // Catalogs (editable)
  coreCatalog: Record<string, CoreMaterial>;
  surfaceCatalog: Record<string, SurfaceMaterial>;
  edgeCatalog: Record<string, EdgeMaterial>;
  
  // Actions - Defaults
  setDefaultCore: (id: string) => void;
  setDefaultSurface: (id: string) => void;
  setDefaultEdge: (id: string) => void;
  
  // Actions - Per-panel
  setPanelCore: (panelId: string, coreId: string) => void;
  setPanelSurface: (panelId: string, face: FaceSide, surfaceId: string | null) => void;
  setPanelEdge: (panelId: string, side: EdgeSide, edgeId: string | null) => void;
  setPanelAllEdges: (panelId: string, edgeId: string | null) => void;
  clearPanelOverride: (panelId: string) => void;
  
  // Actions - Editing
  setEditingPanel: (panelId: string | null) => void;
  
  // Actions - Catalog CRUD
  addCoreMaterial: (material: CoreMaterial) => void;
  updateCoreMaterial: (id: string, updates: Partial<CoreMaterial>) => void;
  deleteCoreMaterial: (id: string) => void;
  
  addSurfaceMaterial: (material: SurfaceMaterial) => void;
  updateSurfaceMaterial: (id: string, updates: Partial<SurfaceMaterial>) => void;
  deleteSurfaceMaterial: (id: string) => void;
  
  addEdgeMaterial: (material: EdgeMaterial) => void;
  updateEdgeMaterial: (id: string, updates: Partial<EdgeMaterial>) => void;
  deleteEdgeMaterial: (id: string) => void;
  
  // Getters
  getPanelComposition: (panelId: string) => PanelMaterialComposition;
  getPanelThickness: (panelId: string) => number;
  getPanelCutSize: (panelId: string, finishW: number, finishH: number) => { cutWidth: number; cutHeight: number };
  getPanelCost: (panelId: string, finishW: number, finishH: number) => ReturnType<typeof calculatePanelCost>;
  getSuggestedEdges: (surfaceId: string) => EdgeMaterial[];
}

// ============================================
// STORE
// ============================================

export const usePanelMaterialStore = create<PanelMaterialState>()(
  immer((set, get) => ({
    // Defaults
    defaultCoreId: 'core-pb-16',
    defaultSurfaceId: 'surf-mel-white',
    defaultEdgeId: 'edge-pvc-white-10',
    
    // Overrides
    panelOverrides: {},
    
    // Editing
    editingPanelId: null,
    
    // Catalogs
    coreCatalog: { ...CORE_MATERIALS_CATALOG },
    surfaceCatalog: { ...SURFACE_MATERIALS_CATALOG },
    edgeCatalog: { ...EDGE_MATERIALS_CATALOG },
    
    // ========== DEFAULT ACTIONS ==========
    
    setDefaultCore: (id) => {
      if (!get().coreCatalog[id]) return;
      set((state) => {
        state.defaultCoreId = id;
      });
    },
    
    setDefaultSurface: (id) => {
      if (!get().surfaceCatalog[id]) return;
      set((state) => {
        state.defaultSurfaceId = id;
      });
      
      // Auto-suggest matching edge
      const matchingEdge = findMatchingEdge(id);
      if (matchingEdge) {
        console.log(`[Material] Auto-suggest edge: ${matchingEdge}`);
      }
    },
    
    setDefaultEdge: (id) => {
      if (!get().edgeCatalog[id]) return;
      set((state) => {
        state.defaultEdgeId = id;
      });
    },
    
    // ========== PER-PANEL ACTIONS ==========
    
    setPanelCore: (panelId, coreId) => {
      set((state) => {
        if (!state.panelOverrides[panelId]) {
          state.panelOverrides[panelId] = {};
        }
        state.panelOverrides[panelId].coreId = coreId;
      });
    },
    
    setPanelSurface: (panelId, face, surfaceId) => {
      set((state) => {
        if (!state.panelOverrides[panelId]) {
          state.panelOverrides[panelId] = {};
        }
        state.panelOverrides[panelId][face] = surfaceId;
      });
    },
    
    setPanelEdge: (panelId, side, edgeId) => {
      const edgeKey = `edge${side.charAt(0).toUpperCase() + side.slice(1)}` as keyof PanelMaterialComposition;
      set((state) => {
        if (!state.panelOverrides[panelId]) {
          state.panelOverrides[panelId] = {};
        }
        (state.panelOverrides[panelId] as any)[edgeKey] = edgeId;
      });
    },
    
    setPanelAllEdges: (panelId, edgeId) => {
      set((state) => {
        if (!state.panelOverrides[panelId]) {
          state.panelOverrides[panelId] = {};
        }
        state.panelOverrides[panelId].edgeTop = edgeId;
        state.panelOverrides[panelId].edgeBottom = edgeId;
        state.panelOverrides[panelId].edgeLeft = edgeId;
        state.panelOverrides[panelId].edgeRight = edgeId;
      });
    },
    
    clearPanelOverride: (panelId) => {
      set((state) => {
        delete state.panelOverrides[panelId];
      });
    },
    
    // ========== EDITING ==========
    
    setEditingPanel: (panelId) => {
      set((state) => {
        state.editingPanelId = panelId;
      });
    },
    
    // ========== CATALOG CRUD - CORE ==========
    
    addCoreMaterial: (material) => {
      set((state) => {
        state.coreCatalog[material.id] = material;
      });
    },
    
    updateCoreMaterial: (id, updates) => {
      set((state) => {
        if (state.coreCatalog[id]) {
          state.coreCatalog[id] = { ...state.coreCatalog[id], ...updates };
        }
      });
    },
    
    deleteCoreMaterial: (id) => {
      set((state) => {
        delete state.coreCatalog[id];
      });
    },
    
    // ========== CATALOG CRUD - SURFACE ==========
    
    addSurfaceMaterial: (material) => {
      set((state) => {
        state.surfaceCatalog[material.id] = material;
      });
    },
    
    updateSurfaceMaterial: (id, updates) => {
      set((state) => {
        if (state.surfaceCatalog[id]) {
          state.surfaceCatalog[id] = { ...state.surfaceCatalog[id], ...updates };
        }
      });
    },
    
    deleteSurfaceMaterial: (id) => {
      set((state) => {
        delete state.surfaceCatalog[id];
      });
    },
    
    // ========== CATALOG CRUD - EDGE ==========
    
    addEdgeMaterial: (material) => {
      set((state) => {
        state.edgeCatalog[material.id] = material;
      });
    },
    
    updateEdgeMaterial: (id, updates) => {
      set((state) => {
        if (state.edgeCatalog[id]) {
          state.edgeCatalog[id] = { ...state.edgeCatalog[id], ...updates };
        }
      });
    },
    
    deleteEdgeMaterial: (id) => {
      set((state) => {
        delete state.edgeCatalog[id];
      });
    },
    
    // ========== GETTERS ==========
    
    getPanelComposition: (panelId) => {
      const state = get();
      const override = state.panelOverrides[panelId] || {};
      
      // Merge defaults with overrides
      return {
        coreId: override.coreId ?? state.defaultCoreId,
        faceA: override.faceA !== undefined ? override.faceA : state.defaultSurfaceId,
        faceB: override.faceB !== undefined ? override.faceB : state.defaultSurfaceId,
        edgeTop: override.edgeTop !== undefined ? override.edgeTop : state.defaultEdgeId,
        edgeBottom: override.edgeBottom !== undefined ? override.edgeBottom : state.defaultEdgeId,
        edgeLeft: override.edgeLeft !== undefined ? override.edgeLeft : state.defaultEdgeId,
        edgeRight: override.edgeRight !== undefined ? override.edgeRight : state.defaultEdgeId,
      };
    },
    
    getPanelThickness: (panelId) => {
      const composition = get().getPanelComposition(panelId);
      return calculateCompositeThickness(composition);
    },
    
    getPanelCutSize: (panelId, finishW, finishH) => {
      const composition = get().getPanelComposition(panelId);
      return calculateCutSizeWithEdges(finishW, finishH, composition);
    },
    
    getPanelCost: (panelId, finishW, finishH) => {
      const composition = get().getPanelComposition(panelId);
      return calculatePanelCost(finishW, finishH, composition);
    },
    
    getSuggestedEdges: (surfaceId) => {
      return getMatchingEdges(surfaceId);
    },
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectDefaultCore = (state: PanelMaterialState) => 
  state.coreCatalog[state.defaultCoreId];

export const selectDefaultSurface = (state: PanelMaterialState) => 
  state.surfaceCatalog[state.defaultSurfaceId];

export const selectDefaultEdge = (state: PanelMaterialState) => 
  state.edgeCatalog[state.defaultEdgeId];

export const selectCoreCatalog = (state: PanelMaterialState) => 
  Object.values(state.coreCatalog);

export const selectSurfaceCatalog = (state: PanelMaterialState) => 
  Object.values(state.surfaceCatalog);

export const selectEdgeCatalog = (state: PanelMaterialState) => 
  Object.values(state.edgeCatalog);

// ============================================
// HOOKS
// ============================================

import { useMemo } from 'react';

/**
 * Hook to get panel composition with materials resolved
 */
export function usePanelMaterials(panelId: string) {
  const composition = usePanelMaterialStore((s) => s.getPanelComposition(panelId));
  const coreCatalog = usePanelMaterialStore((s) => s.coreCatalog);
  const surfaceCatalog = usePanelMaterialStore((s) => s.surfaceCatalog);
  const edgeCatalog = usePanelMaterialStore((s) => s.edgeCatalog);
  
  return useMemo(() => ({
    composition,
    core: coreCatalog[composition.coreId],
    faceA: composition.faceA ? surfaceCatalog[composition.faceA] : null,
    faceB: composition.faceB ? surfaceCatalog[composition.faceB] : null,
    edgeTop: composition.edgeTop ? edgeCatalog[composition.edgeTop] : null,
    edgeBottom: composition.edgeBottom ? edgeCatalog[composition.edgeBottom] : null,
    edgeLeft: composition.edgeLeft ? edgeCatalog[composition.edgeLeft] : null,
    edgeRight: composition.edgeRight ? edgeCatalog[composition.edgeRight] : null,
  }), [composition, coreCatalog, surfaceCatalog, edgeCatalog]);
}

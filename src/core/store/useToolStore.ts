/**
 * ToolStore - Global Tool State Management
 *
 * ARCHITECTURE (North Star v4.0):
 * - Central state for active workspace tool
 * - Coordinates between different tool modules
 * - Handles hotkey-to-tool mapping
 *
 * TOOLS:
 * - select (V): Default selection tool
 * - move (W): Transform - translate
 * - rotate (R): Transform - rotate
 * - scale (S): Transform - scale
 * - uv (U): UV/True-Grain editing
 * - measure (M): Measure 3D distances
 * - glue (G): Face-to-face cabinet alignment
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { projectScopedStorage } from './projectScopedStorage';
import { useMeasureStore } from './useMeasureStore';
import { useGlueStore } from './useGlueStore';
import { useGizmoStore } from './useGizmoStore';
import { useCabinetStore } from './useCabinetStore';
import { useViewStore } from './useViewStore';
import { useModelingStore } from '../modeling';
import { useSketchStore } from '../sketch';
import { useCPlane } from '../cplane';

// ============================================
// TYPES
// ============================================

export type ToolId =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'uv'
  | 'measure'
  | 'glue';

export interface ToolInfo {
  id: ToolId;
  name: string;
  hotkey: string;
  icon: string;
  description: string;
}

/**
 * Tool info with Plasticity 2025.3 compatible hotkeys
 */
export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  select: {
    id: 'select',
    name: 'Select',
    hotkey: 'V',
    icon: '↖',
    description: 'Select objects and faces',
  },
  move: {
    id: 'move',
    name: 'Move',
    hotkey: 'G',  // Plasticity: G = Move
    icon: '✥',
    description: 'Move selected objects',
  },
  rotate: {
    id: 'rotate',
    name: 'Rotate',
    hotkey: 'R',  // Plasticity: R = Rotate
    icon: '↻',
    description: 'Rotate selected objects',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    hotkey: 'S',  // Plasticity: S = Scale
    icon: '⤢',
    description: 'Scale selected objects',
  },
  uv: {
    id: 'uv',
    name: 'UV Edit',
    hotkey: 'U',  // IIMOS specific
    icon: '⊞',
    description: 'Edit UV mapping / True-Grain',
  },
  measure: {
    id: 'measure',
    name: 'Measure',
    hotkey: 'M',  // Simple key, no browser conflict
    icon: '📏',
    description: 'Measure 3D distances',
  },
  glue: {
    id: 'glue',
    name: 'Glue',
    hotkey: 'Shift+G',  // IIMOS specific (G is Move in Plasticity)
    icon: '🔗',
    description: 'Align cabinets face-to-face',
  },
};

export interface SnapOptions {
  enabled: boolean;
  gridSize: number;      // mm
  snapToVertex: boolean;
  snapToEdge: boolean;
  snapToFace: boolean;
  snapToGrid: boolean;
}

export interface ToolOptions {
  snap: SnapOptions;
}

export interface ToolState {
  activeTool: ToolId;
  previousTool: ToolId;

  // Tool options (Grid, Snap, etc.)
  options: ToolOptions;

  // Dragging state - tracks which cabinet is being dragged (for TransformControls)
  // When set, Cabinet3D skips position sync to avoid fighting with TransformControls
  draggingCabinetId: string | null;

  // Box3 visualization options
  showBoxes: boolean;           // Show/hide Box3 outlines for cabinets
  boxDrawDistance: number;      // Max distance (mm) to draw boxes from active cabinet (0 = unlimited)

  // Snap point glyph visualization (Plasticity-style)
  showSnapPoints: boolean;      // Show vertex/midpoint/center glyphs during move

  // Actions
  setTool: (tool: ToolId) => void;
  toggleTool: (tool: ToolId) => void;
  restorePreviousTool: () => void;

  // Snap actions
  setSnapEnabled: (enabled: boolean) => void;
  toggleSnap: () => void;
  setGridSize: (size: number) => void;
  incGridSize: (delta?: number) => void;
  decGridSize: (delta?: number) => void;
  setSnapOptions: (options: Partial<SnapOptions>) => void;

  // Dragging actions
  setDraggingCabinetId: (id: string | null) => void;

  // Box3 visualization actions
  toggleBoxes: () => void;
  setBoxDrawDistance: (distance: number) => void;

  // Snap point glyph actions
  toggleSnapPoints: () => void;
}

// ============================================
// STORE
// ============================================

export const useToolStore = create<ToolState>()(
  persist(
    immer((set, get) => ({
      activeTool: 'select',
      previousTool: 'select',

    // Default options
    options: {
      snap: {
        enabled: true,
        gridSize: 10,        // 10mm default grid
        snapToVertex: true,
        snapToEdge: true,
        snapToFace: false,
        snapToGrid: true,
      },
    },

    // Dragging state
    draggingCabinetId: null,

    // Box3 visualization
    showBoxes: true,
    boxDrawDistance: 3000,  // 3m default distance

    // Snap point glyphs (Plasticity-style)
    showSnapPoints: false,  // Off by default for cleaner UI

    setTool: (tool) => {
      const current = get().activeTool;

      // Skip if already on this tool (prevents key repeat spam)
      if (current === tool) return;

      // Deactivate current tool
      if (current === 'measure') {
        useMeasureStore.getState().deactivateTool();
      }
      if (current === 'glue') {
        // Only cancel if not already idle (prevents redundant state changes after confirmGlue)
        if (useGlueStore.getState().mode !== 'idle') {
          useGlueStore.getState().cancelGlue();
        }
      }

      // Activate new tool
      if (tool === 'measure') {
        useMeasureStore.getState().activateTool();
      }
      if (tool === 'glue') {
        useGlueStore.getState().startGlue();
      }

      set((state) => {
        state.previousTool = current;
        state.activeTool = tool;
      });
    },
    
    toggleTool: (tool) => {
      const current = get().activeTool;
      if (current === tool) {
        get().restorePreviousTool();
      } else {
        get().setTool(tool);
      }
    },
    
    restorePreviousTool: () => {
      const prev = get().previousTool;
      get().setTool(prev);
    },
    
    // Snap actions
    setSnapEnabled: (enabled) => set((state) => {
      state.options.snap.enabled = enabled;
    }),

    toggleSnap: () => set((state) => {
      state.options.snap.enabled = !state.options.snap.enabled;
    }),

    setGridSize: (size) => set((state) => {
      state.options.snap.gridSize = size;
    }),

    incGridSize: (delta = 10) => set((state) => {
      const current = state.options.snap.gridSize;
      const newSize = Math.min(1000, current + delta);
      state.options.snap.gridSize = newSize;
    }),

    decGridSize: (delta = 10) => set((state) => {
      const current = state.options.snap.gridSize;
      const newSize = Math.max(1, current - delta);
      state.options.snap.gridSize = newSize;
    }),

    setSnapOptions: (options) => set((state) => {
      Object.assign(state.options.snap, options);
    }),

    // Dragging actions - used by TransformControls to signal when dragging
    setDraggingCabinetId: (id) => set((state) => {
      state.draggingCabinetId = id;
    }),

    // Box3 visualization actions
    toggleBoxes: () => set((state) => {
      state.showBoxes = !state.showBoxes;
    }),

    setBoxDrawDistance: (distance) => set((state) => {
      state.boxDrawDistance = distance;
    }),

    // Snap point glyph actions
    toggleSnapPoints: () => set((state) => {
      state.showSnapPoints = !state.showSnapPoints;
    }),
  })),
    {
      name: 'monolith:toolstore',
      storage: createJSONStorage(() => projectScopedStorage),
      partialize: (state) => ({
        // Only persist these settings (not active tool or dragging state)
        options: state.options,
        showBoxes: state.showBoxes,
        boxDrawDistance: state.boxDrawDistance,
        showSnapPoints: state.showSnapPoints,
      }),
    }
  )
);

// ============================================
// HOTKEY HANDLER
// ============================================

/**
 * Handle basic tool hotkeys (Plasticity 2025.3 compatible)
 *
 * Plasticity Standard:
 * - V = Select (not in Plasticity but common)
 * - G = Move (Plasticity: G = Move)
 * - R = Rotate (Plasticity: R = Rotate)
 * - S = Scale (Plasticity: S = Scale)
 * - U = UV Edit (IIMOS specific)
 *
 * Reserved for Plasticity commands:
 * - M = Material (Plasticity: M = Set Material)
 * - B = Fillet (Plasticity: B = Fillet)
 * - P = Pipe (Plasticity: P = Pipe)
 * - E = Extrude, L = Loft, Q = Boolean, etc.
 */
export function handleToolHotkey(key: string): boolean {
  const setTool = useToolStore.getState().setTool;

  switch (key.toUpperCase()) {
    case 'V':
      setTool('select');
      return true;
    case 'G':
      // Plasticity: G = Move
      setTool('move');
      return true;
    case 'R':
      // Plasticity: R = Rotate
      setTool('rotate');
      return true;
    case 'S':
      // Plasticity: S = Scale
      setTool('scale');
      return true;
    case 'U':
      // IIMOS specific: UV/True-Grain editing
      setTool('uv');
      return true;
    // Note: M is used for Measure (handled in useToolHotkeys)
    // B, P reserved for Plasticity commands (Fillet, Pipe)
    default:
      return false;
  }
}

// ============================================
// HOOK FOR HOTKEYS
// ============================================

import { useEffect } from 'react';

export function useToolHotkeys() {
  const setTool = useToolStore((s) => s.setTool);
  const activeTool = useToolStore((s) => s.activeTool);
  const cancelMeasurement = useMeasureStore((s) => s.cancelMeasurement);

  // Glue store actions
  const glueMode = useGlueStore((s) => s.mode);
  const cancelGlue = useGlueStore((s) => s.cancelGlue);
  const confirmGlue = useGlueStore((s) => s.confirmGlue);
  const selectFaceByKey = useGlueStore((s) => s.selectFaceByKey);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Handle Delete key - remove selected cabinet
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.activeCabinetId) {
          cabinetStore.removeCabinet(cabinetStore.activeCabinetId);
          return;
        }
      }

      // Handle Ctrl+D - duplicate selected cabinet
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault(); // Prevent browser bookmark
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.activeCabinetId) {
          cabinetStore.duplicateCabinet(cabinetStore.activeCabinetId);
          return;
        }
      }

      // Handle Escape
      // IMPORTANT: Read current mode from store directly to avoid stale closure
      if (e.key === 'Escape') {
        const currentGlueMode = useGlueStore.getState().mode;
        // Cancel glue mode if active
        if (currentGlueMode !== 'idle') {
          cancelGlue();
          setTool('select');
          return;
        }
        // Cancel current measurement if in progress
        cancelMeasurement();
        return;
      }

      // Handle Enter for glue confirmation
      // IMPORTANT: Read current mode from store directly to avoid stale closure
      if (e.key === 'Enter') {
        const currentGlueMode = useGlueStore.getState().mode;
        if (currentGlueMode === 'preview') {
          confirmGlue();
          setTool('select');
          return;
        }
      }

      // Handle face selection keys when in glue mode
      // IMPORTANT: Read current state from stores directly to avoid stale closure
      const currentActiveTool = useToolStore.getState().activeTool;
      const currentGlueModeForFaces = useGlueStore.getState().mode;
      if (currentActiveTool === 'glue' && currentGlueModeForFaces !== 'idle') {
        const key = e.key.toLowerCase();
        if (['l', 'r', 'f', 'b', 't', 'o'].includes(key)) {
          const faceMap: Record<string, 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'> = {
            l: 'left',
            r: 'right',
            f: 'front',
            b: 'back',
            t: 'top',
            o: 'bottom',
          };
          selectFaceByKey(faceMap[key]);
          return;
        }
      }

      // ========================================
      // Plasticity 2025.3 Compatible Hotkeys
      // ========================================

      // Shift+G = Glue tool (IIMOS specific, G alone is Move in Plasticity)
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key.toUpperCase() === 'G') {
        setTool('glue');
        return;
      }

      // M = Measure (simple, no browser conflict)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toUpperCase() === 'M') {
        e.preventDefault();
        setTool('measure');
        return;
      }

      // Shift+D = Duplicate (Plasticity standard)
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key.toUpperCase() === 'D') {
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.activeCabinetId) {
          cabinetStore.duplicateCabinet(cabinetStore.activeCabinetId);
        }
        return;
      }

      // A = Select All (Plasticity standard)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toUpperCase() === 'A') {
        // Select all cabinets - set first cabinet as active if none selected
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.cabinets.length > 0 && !cabinetStore.activeCabinetId) {
          cabinetStore.selectCabinet(cabinetStore.cabinets[0].id);
        }
        return;
      }

      // H = Hide Selected (Plasticity standard)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toUpperCase() === 'H') {
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.activeCabinetId) {
          cabinetStore.hideCabinet(cabinetStore.activeCabinetId);
        }
        return;
      }

      // Shift+H = Hide Unselected (Plasticity standard)
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key.toUpperCase() === 'H') {
        const cabinetStore = useCabinetStore.getState();
        if (cabinetStore.activeCabinetId) {
          cabinetStore.hideUnselectedCabinets(cabinetStore.activeCabinetId);
        }
        return;
      }

      // Alt+H = Unhide All (Plasticity standard)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toUpperCase() === 'H') {
        e.preventDefault();
        useCabinetStore.getState().showAllCabinets();
        return;
      }

      // / (Slash) = Focus viewport on selection (Plasticity standard)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '/') {
        const cabinetStore = useCabinetStore.getState();
        const viewStore = useViewStore.getState();
        if (cabinetStore.activeCabinetId) {
          const cabinet = cabinetStore.cabinets.find(c => c.id === cabinetStore.activeCabinetId) as any;
          if (cabinet) {
            viewStore.focusOnCabinet(cabinetStore.activeCabinetId, {
              position: cabinet.scenePosition || [0, 0, 0],
              dimensions: cabinet.dimensions,
            });
          }
        }
        return;
      }

      // . (Period) = Isolate selection (Plasticity standard)
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '.') {
        const cabinetStore = useCabinetStore.getState();
        const viewStore = useViewStore.getState();
        if (cabinetStore.activeCabinetId) {
          // Toggle isolation: if already isolated, clear; otherwise isolate
          if (viewStore.isolatedCabinetId === cabinetStore.activeCabinetId) {
            viewStore.clearIsolation();
            cabinetStore.showAllCabinets();
          } else {
            // Hide all other cabinets and isolate in view
            cabinetStore.hideUnselectedCabinets(cabinetStore.activeCabinetId);
            viewStore.isolateCabinet(cabinetStore.activeCabinetId);
          }
        }
        return;
      }

      // Alt+Z = Toggle X-Ray Mode (Plasticity standard)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toUpperCase() === 'Z') {
        e.preventDefault();
        const viewStore = useViewStore.getState();
        viewStore.toggleXRay();
        return;
      }

      // Alt+Shift+Z = Toggle Overlays (Plasticity standard)
      if (e.altKey && e.shiftKey && !e.ctrlKey && e.key.toUpperCase() === 'Z') {
        e.preventDefault();
        // Toggle drill map overlay (dimensions, annotations, hardware points)
        import('./useDrillMapStore').then(({ useDrillMapStore }) => {
          useDrillMapStore.getState().toggleVisible();
        });
        return;
      }

      // Space = Navigate to Selection (Plasticity standard)
      // Centers camera on selected object
      if (e.key === ' ' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const cabinetStore = useCabinetStore.getState();
        const viewStore = useViewStore.getState();
        if (cabinetStore.activeCabinetId) {
          const cabinet = cabinetStore.cabinets.find(c => c.id === cabinetStore.activeCabinetId) as any;
          if (cabinet) {
            // Focus camera on the selected cabinet without isolating
            viewStore.focusOnTarget({
              position: cabinet.scenePosition || [0, 0, 0],
              size: cabinet.dimensions,
            });
          }
        }
        return;
      }

      // Ctrl+K or F = Open Command Palette (common in VS Code, Figma)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useModelingStore.getState().openCommandPalette();
        return;
      }
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toUpperCase() === 'F') {
        useModelingStore.getState().openCommandPalette();
        return;
      }

      // ========================================
      // Visualization Toggles (Alt+key pattern for Plasticity compatibility)
      // B = Fillet, P = Pipe in Plasticity, so we use Alt+ for viz toggles
      // ========================================

      // Alt+B = Box3 toggle (B reserved for Fillet in Plasticity)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toUpperCase() === 'B') {
        e.preventDefault();
        useToolStore.getState().toggleBoxes();
        return;
      }

      // Alt+P = Snap point glyphs toggle (P reserved for Pipe in Plasticity)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toUpperCase() === 'P') {
        e.preventDefault();
        useToolStore.getState().toggleSnapPoints();
        return;
      }

      // Alt+O = Drill map visualization toggle
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toUpperCase() === 'O') {
        e.preventDefault();
        import('./useDrillMapStore').then(({ useDrillMapStore }) => {
          useDrillMapStore.getState().toggleVisible();
        });
        return;
      }

      // ========================================
      // Selection Modes (Plasticity: 1/2/3/4)
      // Architecture supports selection modes via useSelectionStore.ts
      // 1 = Point, 2 = Edge, 3 = Face, 4 = Object
      // When in select tool, number keys change selection mode
      // When in move tool, number keys control step size
      // When in other tools, number keys control Box3 distance presets
      // ========================================

      // Handle number keys for selection modes (when in select tool)
      if (currentActiveTool === 'select' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const selectionModeKey = e.key;
        if (['1', '2', '3', '4'].includes(selectionModeKey)) {
          import('./useSelectionStore').then(({ useSelectionStore, selectionKeyToKind }) => {
            const kind = selectionKeyToKind(selectionModeKey);
            if (kind) {
              useSelectionStore.getState().setKind(kind);
            }
          });
          return;
        }
      }

      // Handle 0/1/2/3 keys for Box3 distance presets (when not in select or move mode)
      // Move mode uses 0/1/5 for step size (handled above in move mode section)
      if (currentActiveTool !== 'move' && currentActiveTool !== 'select') {
        const distancePresets: Record<string, number> = {
          '0': 0,     // Unlimited (∞)
          '1': 1000,  // 1m
          '2': 2000,  // 2m
          '3': 3000,  // 3m
        };
        if (distancePresets[e.key] !== undefined) {
          useToolStore.getState().setBoxDrawDistance(distancePresets[e.key]);
          return;
        }
      }

      // Handle Shift+S for snap toggle (S alone is for Scale tool)
      if (e.shiftKey && e.key.toUpperCase() === 'S') {
        useToolStore.getState().toggleSnap();
        return;
      }

      // ========================================
      // Sketch Mode Hotkeys
      // ========================================

      // K = Toggle sketch mode
      if (e.key.toUpperCase() === 'K') {
        useSketchStore.getState().toggle();
        return;
      }

      // Sketch tool hotkeys (only when sketch is enabled)
      const sketchEnabled = useSketchStore.getState().enabled;
      if (sketchEnabled) {
        const key = e.key.toUpperCase();

        // L = Line tool
        if (key === 'L') {
          useSketchStore.getState().setTool('line');
          return;
        }

        // T = Rectangle tool (not R - that's rotate)
        if (key === 'T') {
          useSketchStore.getState().setTool('rect');
          return;
        }

        // A = Arc tool
        if (key === 'A') {
          useSketchStore.getState().setTool('arc');
          return;
        }

        // C = Circle tool
        if (key === 'C') {
          useSketchStore.getState().setTool('circle');
          return;
        }

        // Enter = Commit current sketch
        if (e.key === 'Enter') {
          useSketchStore.getState().commit();
          return;
        }

        // Escape = Clear temp points or disable sketch
        if (e.key === 'Escape') {
          const tempPoints = useSketchStore.getState().tempPoints;
          if (tempPoints.length > 0) {
            useSketchStore.getState().clearTempPoints();
          } else {
            useSketchStore.getState().setTool('select');
          }
          return;
        }
      }

      // ========================================
      // Construction Plane Hotkeys
      // ========================================

      // Shift+X = World XZ plane (floor)
      if (e.shiftKey && e.key.toUpperCase() === 'X') {
        useCPlane.getState().setKind('XZ');
        return;
      }

      // Shift+Y = World XY plane (front)
      if (e.shiftKey && e.key.toUpperCase() === 'Y') {
        useCPlane.getState().setKind('XY');
        return;
      }

      // Shift+Z = World YZ plane (side)
      if (e.shiftKey && e.key.toUpperCase() === 'Z') {
        useCPlane.getState().setKind('YZ');
        return;
      }

      // Handle [ and ] for grid size adjustment
      // Normal: ±10mm, Shift: ±50mm
      if (e.key === '[') {
        const delta = e.shiftKey ? 50 : 10;
        useToolStore.getState().decGridSize(delta);
        return;
      }
      if (e.key === ']') {
        const delta = e.shiftKey ? 50 : 10;
        useToolStore.getState().incGridSize(delta);
        return;
      }

      // Handle gizmo hotkeys when in move mode
      if (currentActiveTool === 'move') {
        const key = e.key.toUpperCase();
        const gizmoStore = useGizmoStore.getState();

        // L = toggle World/Local space
        if (key === 'L') {
          gizmoStore.toggleSpace();
          return;
        }

        // X/Y/Z = toggle axis constraint
        if (key === 'X' || key === 'Y' || key === 'Z') {
          gizmoStore.toggleAxisOverride(key);
          return;
        }

        // H = toggle HUD
        if (key === 'H') {
          gizmoStore.toggleHUD();
          return;
        }

        // 1 = toggle 1mm step
        if (e.key === '1') {
          gizmoStore.toggleStepMmOverride(1);
          return;
        }

        // 5 = toggle 5mm step
        if (e.key === '5') {
          gizmoStore.toggleStepMmOverride(5);
          return;
        }

        // 0 = toggle 10mm step
        if (e.key === '0') {
          gizmoStore.toggleStepMmOverride(10);
          return;
        }
      }

      // Handle tool hotkeys
      handleToolHotkey(e.key);
    }

    // Handle Shift key for fine/constrain mode (keydown = on, keyup = off)
    function handleKeyUp(e: KeyboardEvent) {
      const currentActiveTool = useToolStore.getState().activeTool;
      if (currentActiveTool === 'move') {
        if (e.key === 'Shift') {
          useGizmoStore.getState().setIsFine(false);
        }
        if (e.key === 'Alt') {
          useGizmoStore.getState().setIsAlt(false);
        }
      }
    }

    function handleModifierDown(e: KeyboardEvent) {
      const currentActiveTool = useToolStore.getState().activeTool;
      if (currentActiveTool === 'move') {
        if (e.key === 'Shift') {
          useGizmoStore.getState().setIsFine(true);
        }
        if (e.key === 'Alt') {
          // Prevent default browser behavior (menu focus)
          e.preventDefault();
          useGizmoStore.getState().setIsAlt(true);
        }
      }
    }

    window.addEventListener('keydown', handler);
    window.addEventListener('keydown', handleModifierDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keydown', handleModifierDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setTool, cancelMeasurement, activeTool, glueMode, cancelGlue, confirmGlue, selectFaceByKey]);
}

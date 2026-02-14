/**
 * ToolStore - Global Tool State Management
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Central state for active workspace tool
 * - Coordinates between different tool modules
 * - Handles hotkey-to-tool mapping
 * 
 * TOOLS:
 * - select: Default selection tool
 * - move (G): Transform - translate
 * - rotate (R): Transform - rotate
 * - scale (S): Transform - scale
 * - uv (U): UV/True-Grain editing
 * - measure (M): Measure 3D distances
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useMeasureStore } from './useMeasureStore';

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
    hotkey: 'G',
    icon: '✥',
    description: 'Move selected objects',
  },
  rotate: {
    id: 'rotate',
    name: 'Rotate',
    hotkey: 'R',
    icon: '↻',
    description: 'Rotate selected objects',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    hotkey: 'S',
    icon: '⤢',
    description: 'Scale selected objects',
  },
  uv: {
    id: 'uv',
    name: 'UV Edit',
    hotkey: 'U',
    icon: '⊞',
    description: 'Edit UV mapping / True-Grain',
  },
  measure: {
    id: 'measure',
    name: 'Measure',
    hotkey: 'M',
    icon: '📏',
    description: 'Measure 3D distances',
  },
  glue: {
    id: 'glue',
    name: 'Glue',
    hotkey: 'J',
    icon: '🔗',
    description: 'Join cabinets with glue faces',
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

  // Drag state (used by Cabinet3D for move tool)
  draggingCabinetId: string | null;
  setDraggingCabinetId: (id: string | null) => void;

  // Snap point visibility (toggled by P key)
  showSnapPoints: boolean;

  // Actions
  setTool: (tool: ToolId) => void;
  toggleTool: (tool: ToolId) => void;
  restorePreviousTool: () => void;

  // Snap actions
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setSnapOptions: (options: Partial<SnapOptions>) => void;
}

// ============================================
// STORE
// ============================================

export const useToolStore = create<ToolState>()(
  immer((set, get) => ({
    activeTool: 'select',
    previousTool: 'select',

    // Drag state
    draggingCabinetId: null,
    setDraggingCabinetId: (id) => set({ draggingCabinetId: id }),

    // Snap point visibility
    showSnapPoints: false,

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
    
    setTool: (tool) => {
      const current = get().activeTool;
      
      // Deactivate current tool
      if (current === 'measure') {
        useMeasureStore.getState().deactivateTool();
      }
      
      // Activate new tool
      if (tool === 'measure') {
        useMeasureStore.getState().activateTool();
      }
      
      set((state) => {
        state.previousTool = current;
        state.activeTool = tool;
      });
      
      console.log(`[Tool] Switched to: ${tool}`);
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
      console.log(`[Tool] Snap ${enabled ? 'enabled' : 'disabled'}`);
    }),
    
    setGridSize: (size) => set((state) => {
      state.options.snap.gridSize = size;
      console.log(`[Tool] Grid size: ${size}mm`);
    }),
    
    setSnapOptions: (options) => set((state) => {
      Object.assign(state.options.snap, options);
    }),
  }))
);

// ============================================
// HOTKEY HANDLER
// ============================================

export function handleToolHotkey(key: string): boolean {
  const setTool = useToolStore.getState().setTool;
  
  switch (key.toUpperCase()) {
    case 'V':
      setTool('select');
      return true;
    case 'G':
      setTool('move');
      return true;
    case 'R':
      setTool('rotate');
      return true;
    case 'S':
      setTool('scale');
      return true;
    case 'U':
      setTool('uv');
      return true;
    case 'M':
      setTool('measure');
      return true;
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
  const cancelMeasurement = useMeasureStore((s) => s.cancelMeasurement);
  
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Handle Escape
      if (e.key === 'Escape') {
        // Cancel current measurement if in progress
        cancelMeasurement();
        // Could also clear selection here
        return;
      }
      
      // Handle tool hotkeys
      handleToolHotkey(e.key);
    }
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool, cancelMeasurement]);
}

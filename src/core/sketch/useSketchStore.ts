/**
 * Sketch Store
 *
 * Manages sketch state for 2D drawing on construction planes.
 * Project-scoped persistence.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { projectScopedStorage } from '../store/projectScopedStorage';
import {
  SketchTool,
  SketchEntity,
  SketchPoint,
  SketchLine,
  SketchRect,
  SketchArc,
  generateSketchId,
} from './types';

// ============================================================================
// Store Types
// ============================================================================

interface SketchState {
  /** Whether sketch mode is enabled */
  enabled: boolean;

  /** Active sketch tool */
  tool: SketchTool;

  /** Temporary points being placed (for multi-click tools) */
  tempPoints: SketchPoint[];

  /** Committed sketch entities */
  entities: SketchEntity[];

  /** Selected entity IDs */
  selectedIds: string[];

  /** Snap to grid */
  snapToGrid: boolean;

  /** Snap to endpoints */
  snapToEndpoints: boolean;

  /** Construction mode (entities are reference only) */
  constructionMode: boolean;

  /** Current cursor position on plane (ephemeral, not persisted) */
  cursorPos: SketchPoint | null;

  /** Current snap type (ephemeral) */
  snapType: 'grid' | 'point' | 'axis' | 'none';

  /** Current axis lock mode (ephemeral) */
  axisLock: 'none' | 'x' | 'y';

  /** HUD numeric input string (ephemeral) */
  hudInput: string;
}

interface SketchActions {
  /** Toggle sketch mode on/off */
  toggle: () => void;

  /** Enable sketch mode */
  enable: () => void;

  /** Disable sketch mode */
  disable: () => void;

  /** Set active tool */
  setTool: (tool: SketchTool) => void;

  /** Add a temporary point (during drawing) */
  addPoint: (point: SketchPoint) => void;

  /** Clear temporary points */
  clearTempPoints: () => void;

  /** Commit current temp points as entity */
  commit: () => void;

  /** Add an entity directly */
  addEntity: (entity: Omit<SketchEntity, 'id' | 'selected' | 'construction'>) => string;

  /** Remove entity by ID */
  removeEntity: (id: string) => void;

  /** Clear all entities */
  clearEntities: () => void;

  /** Select entity */
  selectEntity: (id: string) => void;

  /** Deselect entity */
  deselectEntity: (id: string) => void;

  /** Clear selection */
  clearSelection: () => void;

  /** Delete selected entities */
  deleteSelected: () => void;

  /** Toggle snap to grid */
  toggleSnapToGrid: () => void;

  /** Toggle snap to endpoints */
  toggleSnapToEndpoints: () => void;

  /** Toggle construction mode */
  toggleConstructionMode: () => void;

  /** Update cursor position (called by SketchInputLayer) */
  setCursorPos: (pos: SketchPoint | null, snapType?: 'grid' | 'point' | 'axis' | 'none') => void;

  /** Set axis lock mode */
  setAxisLock: (axis: 'none' | 'x' | 'y') => void;

  /** Toggle axis lock */
  toggleAxisLock: (axis: 'x' | 'y') => void;

  /** Set HUD input string */
  setHudInput: (input: string) => void;

  /** Append character to HUD input */
  appendHudInput: (char: string) => void;

  /** Clear HUD input */
  clearHudInput: () => void;

  /** Backspace HUD input */
  backspaceHudInput: () => void;

  /** Reset sketch state */
  reset: () => void;

  /** Update an entity by ID */
  updateEntity: (id: string, updates: Partial<SketchEntity>) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SketchState = {
  enabled: false,
  tool: 'select',
  tempPoints: [],
  entities: [],
  selectedIds: [],
  snapToGrid: true,
  snapToEndpoints: true,
  constructionMode: false,
  cursorPos: null,
  snapType: 'none',
  axisLock: 'none',
  hudInput: '',
};

// ============================================================================
// Store
// ============================================================================

export const useSketchStore = create<SketchState & SketchActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      toggle: () => {
        set((state) => {
          state.enabled = !state.enabled;
          if (!state.enabled) {
            // Clear temp points when disabling
            state.tempPoints = [];
            state.tool = 'select';
          }
        });
        console.log(`[Sketch] ${get().enabled ? 'Enabled' : 'Disabled'}`);
      },

      enable: () => {
        set((state) => {
          state.enabled = true;
        });
        console.log('[Sketch] Enabled');
      },

      disable: () => {
        set((state) => {
          state.enabled = false;
          state.tempPoints = [];
          state.tool = 'select';
        });
        console.log('[Sketch] Disabled');
      },

      setTool: (tool) => {
        set((state) => {
          state.tool = tool;
          state.tempPoints = []; // Clear temp points when changing tools
        });
        console.log(`[Sketch] Tool: ${tool}`);
      },

      addPoint: (point) => {
        set((state) => {
          state.tempPoints.push(point);
        });
        console.log(`[Sketch] Point added: [${point[0].toFixed(1)}, ${point[1].toFixed(1)}]`);

        // Auto-commit based on tool requirements
        const { tool, tempPoints } = get();
        const pointCount = tempPoints.length;

        if (tool === 'line' && pointCount >= 2) {
          get().commit();
        } else if (tool === 'rect' && pointCount >= 2) {
          get().commit();
        } else if (tool === 'arc' && pointCount >= 3) {
          get().commit();
        } else if (tool === 'circle' && pointCount >= 2) {
          get().commit();
        }
      },

      clearTempPoints: () => {
        set((state) => {
          state.tempPoints = [];
        });
      },

      commit: () => {
        const { tool, tempPoints, constructionMode } = get();

        if (tempPoints.length < 2) {
          console.log('[Sketch] Not enough points to commit');
          return;
        }

        let entity: SketchEntity | null = null;
        const id = generateSketchId();

        switch (tool) {
          case 'line':
            if (tempPoints.length >= 2) {
              entity = {
                id,
                type: 'line',
                start: tempPoints[0],
                end: tempPoints[1],
                selected: false,
                construction: constructionMode,
              };
            }
            break;

          case 'rect':
            if (tempPoints.length >= 2) {
              entity = {
                id,
                type: 'rect',
                corner1: tempPoints[0],
                corner2: tempPoints[1],
                selected: false,
                construction: constructionMode,
              };
            }
            break;

          case 'arc':
            if (tempPoints.length >= 3) {
              entity = {
                id,
                type: 'arc',
                start: tempPoints[0],
                mid: tempPoints[1],
                end: tempPoints[2],
                selected: false,
                construction: constructionMode,
              };
            }
            break;

          case 'circle':
            if (tempPoints.length >= 2) {
              const dx = tempPoints[1][0] - tempPoints[0][0];
              const dy = tempPoints[1][1] - tempPoints[0][1];
              const radius = Math.sqrt(dx * dx + dy * dy);
              entity = {
                id,
                type: 'circle',
                center: tempPoints[0],
                radius,
                selected: false,
                construction: constructionMode,
              };
            }
            break;
        }

        if (entity) {
          set((state) => {
            state.entities.push(entity!);
            state.tempPoints = [];
          });
          console.log(`[Sketch] Committed ${entity.type}: ${entity.id}`);
        }
      },

      addEntity: (entityData) => {
        const id = generateSketchId();
        const entity: SketchEntity = {
          ...entityData,
          id,
          selected: false,
          construction: get().constructionMode,
        } as SketchEntity;

        set((state) => {
          state.entities.push(entity);
        });

        return id;
      },

      removeEntity: (id) => {
        set((state) => {
          state.entities = state.entities.filter((e) => e.id !== id);
          state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
        });
      },

      clearEntities: () => {
        set((state) => {
          state.entities = [];
          state.selectedIds = [];
          state.tempPoints = [];
        });
        console.log('[Sketch] All entities cleared');
      },

      selectEntity: (id) => {
        set((state) => {
          if (!state.selectedIds.includes(id)) {
            state.selectedIds.push(id);
          }
          const entity = state.entities.find((e) => e.id === id);
          if (entity) {
            entity.selected = true;
          }
        });
      },

      deselectEntity: (id) => {
        set((state) => {
          state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
          const entity = state.entities.find((e) => e.id === id);
          if (entity) {
            entity.selected = false;
          }
        });
      },

      clearSelection: () => {
        set((state) => {
          state.selectedIds = [];
          state.entities.forEach((e) => {
            e.selected = false;
          });
        });
      },

      deleteSelected: () => {
        set((state) => {
          state.entities = state.entities.filter(
            (e) => !state.selectedIds.includes(e.id)
          );
          state.selectedIds = [];
        });
        console.log('[Sketch] Deleted selected entities');
      },

      toggleSnapToGrid: () => {
        set((state) => {
          state.snapToGrid = !state.snapToGrid;
        });
      },

      toggleSnapToEndpoints: () => {
        set((state) => {
          state.snapToEndpoints = !state.snapToEndpoints;
        });
      },

      toggleConstructionMode: () => {
        set((state) => {
          state.constructionMode = !state.constructionMode;
        });
        console.log(`[Sketch] Construction mode: ${get().constructionMode}`);
      },

      setCursorPos: (pos, snapType = 'none') => {
        set((state) => {
          state.cursorPos = pos;
          state.snapType = snapType;
        });
      },

      setAxisLock: (axis) => {
        set((state) => {
          state.axisLock = axis;
        });
      },

      toggleAxisLock: (axis) => {
        set((state) => {
          state.axisLock = state.axisLock === axis ? 'none' : axis;
        });
      },

      setHudInput: (input) => {
        set((state) => {
          state.hudInput = input;
        });
      },

      appendHudInput: (char) => {
        set((state) => {
          // Only allow valid HUD characters: digits, dot, @, minus
          if (/^[\d.@-]$/.test(char)) {
            state.hudInput += char;
          }
        });
      },

      clearHudInput: () => {
        set((state) => {
          state.hudInput = '';
        });
      },

      backspaceHudInput: () => {
        set((state) => {
          state.hudInput = state.hudInput.slice(0, -1);
        });
      },

      reset: () => {
        set(() => ({ ...initialState }));
        console.log('[Sketch] Reset');
      },

      updateEntity: (id, updates) => {
        set((state) => {
          const entity = state.entities.find((e) => e.id === id);
          if (entity) {
            Object.assign(entity, updates);
          }
        });
        console.log(`[Sketch] Updated entity: ${id}`);
      },
    })),
    {
      name: 'monolith:sketch',
      storage: createJSONStorage(() => projectScopedStorage),
      partialize: (state) => ({
        entities: state.entities,
        snapToGrid: state.snapToGrid,
        snapToEndpoints: state.snapToEndpoints,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const useSketchEnabled = () => useSketchStore((s) => s.enabled);
export const useSketchTool = () => useSketchStore((s) => s.tool);
export const useSketchEntities = () => useSketchStore((s) => s.entities);
export const useSketchTempPoints = () => useSketchStore((s) => s.tempPoints);
export const useSketchSelectedIds = () => useSketchStore((s) => s.selectedIds);
export const useSketchCursorPos = () => useSketchStore((s) => s.cursorPos);
export const useSketchSnapType = () => useSketchStore((s) => s.snapType);
export const useSketchAxisLock = () => useSketchStore((s) => s.axisLock);
export const useSketchHudInput = () => useSketchStore((s) => s.hudInput);

export default useSketchStore;

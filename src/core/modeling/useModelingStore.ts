/**
 * Modeling Store (Zustand)
 *
 * Manages the Plasticity-style modeling layer state:
 * - Selection state (what's selected)
 * - Active tool state
 * - Design intent stack (undo/redo)
 * - Command palette state
 *
 * v1.0: Initial modeling store
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  SelectionTarget,
  SelectionType,
  DesignIntent,
  ToolState,
  ActiveToolMode,
  ProfileAsset,
  ModelingCommand,
} from './types';
import type { PreflightResult, PanelContext } from './preflight';
import { validateIntent } from './preflight';

/** Generate unique ID */
function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// Store State Type
// ============================================================================

interface ModelingState {
  // Selection
  selection: SelectionTarget | null;
  hoverTarget: SelectionTarget | null;
  multiSelection: SelectionTarget[];

  // Tool State
  tool: ToolState;

  // Command Palette
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;

  // Design Intents (per cabinet)
  intentsByCabinet: Record<string, DesignIntent[]>;

  // Undo/Redo
  undoStack: Array<{ cabinetId: string; intent: DesignIntent }>;
  redoStack: Array<{ cabinetId: string; intent: DesignIntent }>;

  // Profile Library
  profiles: ProfileAsset[];
  customProfiles: ProfileAsset[];

  // Preview
  previewIntent: DesignIntent | null;

  // Preflight Validation
  preflightResult: PreflightResult | null;
  preflightPanelContext: PanelContext | null;
}

// ============================================================================
// Store Actions Type
// ============================================================================

interface ModelingActions {
  // Selection
  setSelection: (target: SelectionTarget | null) => void;
  setHoverTarget: (target: SelectionTarget | null) => void;
  addToMultiSelection: (target: SelectionTarget) => void;
  removeFromMultiSelection: (target: SelectionTarget) => void;
  clearSelection: () => void;

  // Tool
  setToolMode: (mode: ActiveToolMode) => void;
  setToolParam: (key: string, value: number | string | boolean) => void;
  selectProfile: (profileId: string) => void;
  setPreviewEnabled: (enabled: boolean) => void;

  // Command Palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;
  executeCommand: (command: ModelingCommand) => void;

  // Design Intents
  addIntent: (cabinetId: string, intent: Omit<DesignIntent, 'id' | 'createdAt'>) => string;
  removeIntent: (cabinetId: string, intentId: string) => void;
  updateIntent: (cabinetId: string, intentId: string, updates: Partial<DesignIntent>) => void;
  getIntentsForCabinet: (cabinetId: string) => DesignIntent[];
  getIntentsForPanel: (cabinetId: string, panelId: string) => DesignIntent[];

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Preview
  setPreviewIntent: (intent: DesignIntent | null) => void;

  // Preflight Validation
  runPreflight: (intent: DesignIntent, panelContext: PanelContext) => PreflightResult;
  clearPreflight: () => void;
  commitIntentWithPreflight: (
    cabinetId: string,
    intent: Omit<DesignIntent, 'id' | 'createdAt'>,
    panelContext: PanelContext
  ) => { success: boolean; intentId?: string; result: PreflightResult };

  // Profile Library
  addCustomProfile: (profile: Omit<ProfileAsset, 'id'>) => string;
  removeCustomProfile: (profileId: string) => void;
  getAllProfiles: () => ProfileAsset[];
  getProfileById: (profileId: string) => ProfileAsset | undefined;

  // Reset
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialToolState: ToolState = {
  mode: 'select',
  selectedProfileId: undefined,
  params: {},
  previewEnabled: true,
};

const initialState: ModelingState = {
  selection: null,
  hoverTarget: null,
  multiSelection: [],
  tool: initialToolState,
  commandPaletteOpen: false,
  commandPaletteQuery: '',
  intentsByCabinet: {},
  undoStack: [],
  redoStack: [],
  profiles: [], // Will be populated from BUILT_IN_PROFILES
  customProfiles: [],
  previewIntent: null,
  preflightResult: null,
  preflightPanelContext: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useModelingStore = create<ModelingState & ModelingActions>()(
  immer((set, get) => ({
    ...initialState,

    // ========================================================================
    // Selection Actions
    // ========================================================================

    setSelection: (target) => {
      set((state) => {
        state.selection = target;
        state.multiSelection = target ? [target] : [];
      });
    },

    setHoverTarget: (target) => {
      set((state) => {
        state.hoverTarget = target;
      });
    },

    addToMultiSelection: (target) => {
      set((state) => {
        const exists = state.multiSelection.some(
          (s) =>
            s.cabinetId === target.cabinetId &&
            s.panelId === target.panelId &&
            s.edgeIndex === target.edgeIndex
        );
        if (!exists) {
          state.multiSelection.push(target);
        }
      });
    },

    removeFromMultiSelection: (target) => {
      set((state) => {
        state.multiSelection = state.multiSelection.filter(
          (s) =>
            !(
              s.cabinetId === target.cabinetId &&
              s.panelId === target.panelId &&
              s.edgeIndex === target.edgeIndex
            )
        );
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selection = null;
        state.multiSelection = [];
      });
    },

    // ========================================================================
    // Tool Actions
    // ========================================================================

    setToolMode: (mode) => {
      set((state) => {
        state.tool.mode = mode;
        // Clear preview when changing tools
        state.previewIntent = null;
      });
    },

    setToolParam: (key, value) => {
      set((state) => {
        state.tool.params[key] = value;
      });
    },

    selectProfile: (profileId) => {
      set((state) => {
        state.tool.selectedProfileId = profileId;
      });
    },

    setPreviewEnabled: (enabled) => {
      set((state) => {
        state.tool.previewEnabled = enabled;
      });
    },

    // ========================================================================
    // Command Palette Actions
    // ========================================================================

    openCommandPalette: () => {
      set((state) => {
        state.commandPaletteOpen = true;
        state.commandPaletteQuery = '';
      });
    },

    closeCommandPalette: () => {
      set((state) => {
        state.commandPaletteOpen = false;
        state.commandPaletteQuery = '';
      });
    },

    setCommandPaletteQuery: (query) => {
      set((state) => {
        state.commandPaletteQuery = query;
      });
    },

    executeCommand: (command) => {
      // Map command to tool mode
      const commandToMode: Partial<Record<ModelingCommand, ActiveToolMode>> = {
        'apply-edge-profile': 'edge-profile',
        'bevel-edge': 'edge-profile',
        'chamfer-edge': 'edge-profile',
        'round-edge': 'edge-profile',
        'add-groove': 'groove',
        'add-dado': 'groove',
        'add-rabbet': 'groove',
        'add-shelf-pin-holes': 'hole',
        'add-hinge-bore': 'hole',
        'add-system-hole': 'hole',
        'apply-slat-pattern': 'pattern',
        'apply-wainscoting': 'pattern',
      };

      const newMode = commandToMode[command];
      if (newMode) {
        set((s) => {
          s.tool.mode = newMode;
          s.tool.params.activeCommand = command;
          s.commandPaletteOpen = false;
        });
      } else {
        // Handle instant commands (duplicate, mirror, etc.)
        set((s) => {
          s.commandPaletteOpen = false;
        });
        // These would dispatch to cabinet store actions
        console.log(`Execute instant command: ${command}`);
      }
    },

    // ========================================================================
    // Design Intent Actions
    // ========================================================================

    addIntent: (cabinetId, intentData) => {
      const id = generateId();
      const intent: DesignIntent = {
        ...intentData,
        id,
        createdAt: new Date().toISOString(),
      } as DesignIntent;

      set((state) => {
        if (!state.intentsByCabinet[cabinetId]) {
          state.intentsByCabinet[cabinetId] = [];
        }
        state.intentsByCabinet[cabinetId].push(intent);
        // Push to undo stack
        state.undoStack.push({ cabinetId, intent });
        // Clear redo stack on new action
        state.redoStack = [];
      });

      return id;
    },

    removeIntent: (cabinetId, intentId) => {
      set((state) => {
        const intents = state.intentsByCabinet[cabinetId];
        if (intents) {
          const index = intents.findIndex((i) => i.id === intentId);
          if (index !== -1) {
            intents.splice(index, 1);
          }
        }
      });
    },

    updateIntent: (cabinetId, intentId, updates) => {
      set((state) => {
        const intents = state.intentsByCabinet[cabinetId];
        if (intents) {
          const intent = intents.find((i) => i.id === intentId);
          if (intent) {
            Object.assign(intent, updates);
          }
        }
      });
    },

    getIntentsForCabinet: (cabinetId) => {
      return get().intentsByCabinet[cabinetId] || [];
    },

    getIntentsForPanel: (cabinetId, panelId) => {
      const intents = get().intentsByCabinet[cabinetId] || [];
      return intents.filter((i) => i.target.panelId === panelId);
    },

    // ========================================================================
    // Undo/Redo Actions
    // ========================================================================

    undo: () => {
      set((state) => {
        const lastAction = state.undoStack.pop();
        if (lastAction) {
          const { cabinetId, intent } = lastAction;
          const intents = state.intentsByCabinet[cabinetId];
          if (intents) {
            const index = intents.findIndex((i) => i.id === intent.id);
            if (index !== -1) {
              intents.splice(index, 1);
            }
          }
          state.redoStack.push(lastAction);
        }
      });
    },

    redo: () => {
      set((state) => {
        const lastUndo = state.redoStack.pop();
        if (lastUndo) {
          const { cabinetId, intent } = lastUndo;
          if (!state.intentsByCabinet[cabinetId]) {
            state.intentsByCabinet[cabinetId] = [];
          }
          state.intentsByCabinet[cabinetId].push(intent);
          state.undoStack.push(lastUndo);
        }
      });
    },

    canUndo: () => {
      return get().undoStack.length > 0;
    },

    canRedo: () => {
      return get().redoStack.length > 0;
    },

    // ========================================================================
    // Preview Actions
    // ========================================================================

    setPreviewIntent: (intent) => {
      set((state) => {
        state.previewIntent = intent;
      });
    },

    // ========================================================================
    // Preflight Validation Actions
    // ========================================================================

    runPreflight: (intent, panelContext) => {
      const profile = intent.type === 'edge-profile'
        ? get().getProfileById((intent as any).profileId)
        : undefined;

      const result = validateIntent(intent, panelContext, profile);

      set((state) => {
        state.preflightResult = result;
        state.preflightPanelContext = panelContext;
      });

      return result;
    },

    clearPreflight: () => {
      set((state) => {
        state.preflightResult = null;
        state.preflightPanelContext = null;
      });
    },

    commitIntentWithPreflight: (cabinetId, intentData, panelContext) => {
      // Create temporary intent for validation
      const tempIntent: DesignIntent = {
        ...intentData,
        id: 'temp-validation',
        createdAt: new Date().toISOString(),
      } as DesignIntent;

      // Run preflight validation
      const profile = tempIntent.type === 'edge-profile'
        ? get().getProfileById((tempIntent as any).profileId)
        : undefined;

      const result = validateIntent(tempIntent, panelContext, profile);

      // Store preflight result
      set((state) => {
        state.preflightResult = result;
        state.preflightPanelContext = panelContext;
      });

      // Only commit if no errors (warnings allowed)
      if (result.valid) {
        const intentId = get().addIntent(cabinetId, intentData);
        return { success: true, intentId, result };
      }

      return { success: false, result };
    },

    // ========================================================================
    // Profile Library Actions
    // ========================================================================

    addCustomProfile: (profileData) => {
      const id = generateId();
      const profile: ProfileAsset = {
        ...profileData,
        id,
      };

      set((state) => {
        state.customProfiles.push(profile);
      });

      return id;
    },

    removeCustomProfile: (profileId) => {
      set((state) => {
        state.customProfiles = state.customProfiles.filter((p) => p.id !== profileId);
      });
    },

    getAllProfiles: () => {
      const state = get();
      return [...state.profiles, ...state.customProfiles];
    },

    getProfileById: (profileId) => {
      const state = get();
      return (
        state.profiles.find((p) => p.id === profileId) ||
        state.customProfiles.find((p) => p.id === profileId)
      );
    },

    // ========================================================================
    // Reset
    // ========================================================================

    reset: () => {
      set(() => ({
        ...initialState,
      }));
    },
  }))
);

// ============================================================================
// Selector Hooks
// ============================================================================

/** Get current selection type */
export const useSelectionType = (): SelectionType => {
  return useModelingStore((s) => s.selection?.type || 'none');
};

/** Get current tool mode */
export const useToolMode = (): ActiveToolMode => {
  return useModelingStore((s) => s.tool.mode);
};

/** Check if command palette is open */
export const useCommandPaletteOpen = (): boolean => {
  return useModelingStore((s) => s.commandPaletteOpen);
};

/** Get filtered commands based on selection */
export const useAvailableCommands = () => {
  const selection = useModelingStore((s) => s.selection);
  const selectionType = selection?.type || 'none';

  // Import commands list
  const { MODELING_COMMANDS } = require('./types');

  return MODELING_COMMANDS.filter((cmd: any) =>
    cmd.requiresSelection.includes(selectionType) || cmd.requiresSelection.includes('none')
  );
};

/** Get current preflight result */
export const usePreflightResult = (): PreflightResult | null => {
  return useModelingStore((s) => s.preflightResult);
};

// ============================================================================
// Initialize with built-in profiles
// ============================================================================

// This runs once when the module is loaded
import('./types').then(({ BUILT_IN_PROFILES }) => {
  useModelingStore.setState({ profiles: BUILT_IN_PROFILES });
});

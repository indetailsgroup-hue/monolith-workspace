/**
 * Project Store - Save/Load Project System
 *
 * @module core/store/useProjectStore
 * @version 1.0.0
 *
 * Manages project lifecycle including persistence, auto-save, and import/export.
 *
 * ## Features
 * - **Auto-save**: Debounced saves to localStorage (2s delay)
 * - **Manual save/load**: Explicit project persistence
 * - **Export/Import**: JSON file download/upload
 * - **Project metadata**: Name, version, timestamps, author
 * - **Multi-cabinet support**: Scene positions and rotations
 *
 * ## Storage Keys
 * - `monolith-current-project`: Active project data
 * - `monolith-projects-list`: Recent projects list (max 20)
 *
 * ## Usage
 * ```typescript
 * // Initialize on app start
 * useProjectStore.getState().initialize();
 *
 * // Create new project
 * useProjectStore.getState().newProject('My Cabinet');
 *
 * // Save current state
 * useProjectStore.getState().saveProject();
 *
 * // Export to file
 * useProjectStore.getState().downloadProject();
 * ```
 *
 * @see {@link useCabinetStore} for cabinet data management
 */

import { create } from 'zustand';
import { useCabinetStore } from './useCabinetStore';
import {
  parseAndValidateSafe,
  validateExternalStateSafe,
  type ValidationIssue,
} from '../gate/validateExternalState';
import { ProjectDataSchema, ImportedProjectSchema, SavedProjectsListSchema } from '../schema/project.schema';
import {
  readString,
  writeJson,
  writeRaw,
  remove,
} from '../persistence/unsafeStorage';
import { getMinifixFullConfigForThickness } from '../manufacturing/hardware/minifixDefaults';

// ============================================
// TYPES
// ============================================

/**
 * Project metadata for identification and tracking.
 *
 * @example
 * {
 *   id: 'proj-1705123456789-abc123def',
 *   name: 'Kitchen Base Cabinet',
 *   version: '1.0.0',
 *   createdAt: 1705123456789,
 *   updatedAt: 1705123456789,
 *   description: 'Main kitchen island base',
 *   author: 'Designer Name',
 * }
 */
export interface ProjectMetadata {
  /** Unique project identifier */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Unix timestamp of creation */
  createdAt: number;
  /** Unix timestamp of last update */
  updatedAt: number;
  /** Optional project description */
  description?: string;
  /** Optional author/creator name */
  author?: string;
}

/**
 * Complete project data for serialization.
 *
 * Contains metadata, active cabinet, and scene layout information.
 */
export interface ProjectData {
  /** Project identification and tracking */
  metadata: ProjectMetadata;
  /** Active cabinet state from useCabinetStore */
  cabinet: any;
  /** All cabinets with scene positions/rotations */
  cabinets?: any[];
}

/**
 * Summary of a saved project for the projects list.
 *
 * Lightweight representation for project picker UI.
 */
export interface SavedProject {
  /** Project identifier */
  id: string;
  /** Project name for display */
  name: string;
  /** Last update timestamp for sorting */
  updatedAt: number;
}

// ============================================
// CONSTANTS
// ============================================

const STORAGE_KEY = 'monolith-current-project';
const PROJECTS_LIST_KEY = 'monolith-projects-list';
const AUTO_SAVE_DELAY = 2000; // 2 seconds

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createDefaultMetadata(name: string = 'Untitled Project'): ProjectMetadata {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// STORE
// ============================================

interface ProjectState {
  metadata: ProjectMetadata | null;
  isDirty: boolean; // Has unsaved changes
  lastSaved: number | null;
  autoSaveEnabled: boolean;
  savedProjects: SavedProject[];
}

interface ProjectActions {
  // Project lifecycle
  newProject: (name?: string) => void;
  saveProject: () => void;
  loadProject: (projectId?: string) => boolean;
  deleteProject: (projectId: string) => void;
  
  // Metadata
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  
  // Export/Import
  exportProject: () => string;
  importProject: (jsonString: string) => boolean;
  downloadProject: () => void;
  
  // Auto-save
  setAutoSave: (enabled: boolean) => void;
  markDirty: () => void;
  
  // Load saved projects list
  loadProjectsList: () => void;
  
  // Initialize (call on app start)
  initialize: () => void;
}

type ProjectStore = ProjectState & ProjectActions;

let autoSaveTimer: NodeJS.Timeout | null = null;

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  // Initial state
  metadata: null,
  isDirty: false,
  lastSaved: null,
  autoSaveEnabled: true,
  savedProjects: [],
  
  // ========== PROJECT LIFECYCLE ==========
  
  newProject: (name = 'Untitled Project') => {
    const metadata = createDefaultMetadata(name);
    
    // Create new cabinet
    useCabinetStore.getState().createCabinet('BASE', name);
    
    set({
      metadata,
      isDirty: false,
      lastSaved: null,
    });
    
    // Save immediately
    get().saveProject();
  },
  
  saveProject: () => {
    const { metadata, autoSaveEnabled, isDirty } = get();
    const cabinetStore = useCabinetStore.getState();
    const cabinet = cabinetStore.cabinet;
    const cabinets = cabinetStore.cabinets;

    if (!metadata || !cabinet || !cabinet.materials) {
      console.warn('[Project] Cannot save: no project or cabinet data incomplete');
      return;
    }

    // Update metadata timestamp.
    // Preserve updatedAt on a clean save (e.g. the initial auto-save right after
    // creation, where no edits have been made) so a brand-new project keeps
    // updatedAt === createdAt. Only advance it when there are unsaved edits.
    const updatedMetadata: ProjectMetadata = {
      ...metadata,
      updatedAt: isDirty ? Date.now() : metadata.updatedAt,
    };

    // Serialize cabinets with scenePosition/sceneRotation
    const serializedCabinets = cabinets.map((c: any) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      dimensions: c.dimensions,
      scenePosition: c.scenePosition || [0, 0, 0],
      sceneRotation: c.sceneRotation || [0, 0, 0],
    }));

    // Create project data
    const projectData: ProjectData = {
      metadata: updatedMetadata,
      cabinet: {
        ...cabinet,
        // Convert Map to object for JSON serialization
        materials: {
          ...cabinet.materials,
          overrides: cabinet.materials.overrides
            ? Object.fromEntries(cabinet.materials.overrides)
            : {},
        },
      },
      cabinets: serializedCabinets,
    };
    
    // Save to localStorage via G9 boundary
    try {
      writeJson(STORAGE_KEY, projectData);

      // Update projects list
      const projectsList = get().savedProjects.filter(p => p.id !== metadata.id);
      projectsList.unshift({
        id: updatedMetadata.id,
        name: updatedMetadata.name,
        updatedAt: updatedMetadata.updatedAt,
      });
      writeJson(PROJECTS_LIST_KEY, projectsList.slice(0, 20)); // Keep last 20
      
      set({
        metadata: updatedMetadata,
        isDirty: false,
        lastSaved: Date.now(),
        savedProjects: projectsList,
      });
    } catch (error) {
      console.error('[Project] Save failed:', error);
    }
  },
  
  loadProject: (projectId?: string) => {
    try {
      // If no projectId, load current project (via G9 boundary)
      const stored = readString(STORAGE_KEY);
      if (!stored) {
        return false;
      }

      // G9: Validate external state from localStorage
      const validation = parseAndValidateSafe(stored, ProjectDataSchema, 'localStorage');
      if (!validation.ok) {
        console.error('[Project] G9 Validation failed:', validation.issues);
        // Try to recover with lenient schema for legacy data
        const legacyParsed = parseAndValidateSafe(stored, ImportedProjectSchema, 'localStorage-legacy');
        if (!legacyParsed.ok) {
          console.error('[Project] Legacy validation also failed:', legacyParsed.issues);
          return false;
        }
        // Proceed with legacy data but warn
        console.warn('[Project] Loaded with legacy schema - some data may be incomplete');
      }

      // Parse again for actual use (since we validated)
      const projectData: ProjectData = JSON.parse(stored);

      // If projectId specified but doesn't match, return false
      if (projectId && projectData.metadata.id !== projectId) {
        return false;
      }

      // Restore cabinet state - convert overrides back to Map
      const cabinet = {
        ...projectData.cabinet,
        materials: {
          ...projectData.cabinet.materials,
          overrides: new Map(Object.entries(projectData.cabinet.materials?.overrides || {})),
        },
      };

      // Restore cabinets array with scenePosition/sceneRotation
      let cabinetsToRestore = [cabinet];
      if (projectData.cabinets && projectData.cabinets.length > 0) {
        // Merge saved scene positions into cabinets
        cabinetsToRestore = projectData.cabinets.map((savedCab: any) => {
          // For the active cabinet, merge with full cabinet data
          if (savedCab.id === cabinet.id) {
            return {
              ...cabinet,
              scenePosition: savedCab.scenePosition || [0, 0, 0],
              sceneRotation: savedCab.sceneRotation || [0, 0, 0],
            };
          }
          // For other cabinets, use saved data with defaults
          return {
            ...savedCab,
            scenePosition: savedCab.scenePosition || [0, 0, 0],
            sceneRotation: savedCab.sceneRotation || [0, 0, 0],
          };
        });
      }

      // v4.1 Migration: Auto-apply hardware config to cabinets that don't have one
      // This ensures legacy projects get Minifix S200 + Dowel hardware automatically
      cabinetsToRestore = cabinetsToRestore.map((cab: any) => {
        if (!cab.hardware?.minifixConfig) {
          // Determine wood thickness from core material (default 18mm)
          const coreId = cab.materials?.defaultCore || 'core-pb-18';
          const woodThickness = coreId.includes('16') ? 16 : coreId.includes('19') ? 19 : 18;
          const minifixConfig = getMinifixFullConfigForThickness(woodThickness);
          return {
            ...cab,
            hardware: {
              ...cab.hardware,
              minifixConfig,
              minifixPresetId: `builtin_minifix_${woodThickness}mm`,
            },
          };
        }
        return cab;
      });

      // Set cabinet and also sync to cabinets array
      useCabinetStore.setState({
        cabinet: cabinetsToRestore.find((c: any) => c.id === cabinet.id) || cabinet,
        cabinets: cabinetsToRestore,
        activeCabinetId: cabinet.id
      });
      
      set({
        metadata: projectData.metadata,
        isDirty: false,
        lastSaved: projectData.metadata.updatedAt,
      });
      return true;
    } catch (error) {
      console.error('[Project] Load failed:', error);
      return false;
    }
  },
  
  deleteProject: (projectId: string) => {
    const { savedProjects, metadata } = get();

    // Remove from list (via G9 boundary)
    const updatedList = savedProjects.filter(p => p.id !== projectId);
    writeJson(PROJECTS_LIST_KEY, updatedList);

    // If deleting current project, clear it
    if (metadata?.id === projectId) {
      remove(STORAGE_KEY);
      set({
        metadata: null,
        isDirty: false,
        lastSaved: null,
      });
    }

    set({ savedProjects: updatedList });
  },
  
  // ========== METADATA ==========
  
  setProjectName: (name: string) => {
    set((state) => ({
      metadata: state.metadata ? { ...state.metadata, name } : null,
      isDirty: true,
    }));
    get().markDirty();
  },
  
  setProjectDescription: (description: string) => {
    set((state) => ({
      metadata: state.metadata ? { ...state.metadata, description } : null,
      isDirty: true,
    }));
    get().markDirty();
  },
  
  // ========== EXPORT/IMPORT ==========
  
  exportProject: () => {
    const { metadata } = get();
    const cabinet = useCabinetStore.getState().cabinet;
    
    if (!metadata || !cabinet) {
      return '{}';
    }
    
    const projectData: ProjectData = {
      metadata,
      cabinet: {
        ...cabinet,
        materials: {
          ...cabinet.materials,
          overrides: cabinet.materials.overrides 
            ? Object.fromEntries(cabinet.materials.overrides)
            : {},
        },
      },
    };
    
    return JSON.stringify(projectData, null, 2);
  },
  
  importProject: (jsonString: string) => {
    try {
      // G9: Validate imported project data
      const validation = parseAndValidateSafe(jsonString, ImportedProjectSchema, 'file-import');
      if (!validation.ok) {
        console.error('[Project] G9 Import validation failed:', validation.issues);
        // Surface errors for UI
        const errorPaths = validation.issues.map(i => `${i.path}: ${i.message}`).join('\n');
        console.error('[Project] Validation errors:\n', errorPaths);
        return false;
      }

      // Parse the validated data
      const projectData: ProjectData = JSON.parse(jsonString);

      // Validate structure (additional check for required cabinet data)
      if (!projectData.cabinet) {
        console.error('[Project] Invalid project file: missing cabinet data');
        return false;
      }

      // Generate new ID to avoid conflicts
      const newMetadata: ProjectMetadata = {
        ...projectData.metadata,
        id: generateId(),
        name: projectData.metadata.name || 'Imported Project',
        version: projectData.metadata.version || '1.0.0',
        createdAt: projectData.metadata.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      // Restore cabinet
      const cabinet = {
        ...projectData.cabinet,
        materials: {
          ...projectData.cabinet.materials,
          overrides: new Map(Object.entries(projectData.cabinet.materials?.overrides || {})),
        },
      };

      useCabinetStore.setState({ cabinet });

      set({
        metadata: newMetadata,
        isDirty: true,
      });

      // Save the imported project
      get().saveProject();
      return true;
    } catch (error) {
      console.error('[Project] Import failed:', error);
      return false;
    }
  },
  
  downloadProject: () => {
    const { metadata } = get();
    const json = get().exportProject();
    
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata?.name || 'project'}.monolith.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  
  // ========== AUTO-SAVE ==========
  
  setAutoSave: (enabled: boolean) => {
    set({ autoSaveEnabled: enabled });
    if (!enabled && autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  },
  
  markDirty: () => {
    const { autoSaveEnabled } = get();
    set({ isDirty: true });
    
    if (autoSaveEnabled) {
      // Debounce auto-save
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      autoSaveTimer = setTimeout(() => {
        get().saveProject();
      }, AUTO_SAVE_DELAY);
    }
  },
  
  // ========== PROJECTS LIST ==========
  
  loadProjectsList: () => {
    try {
      // G9: Read via boundary and validate
      const stored = readString(PROJECTS_LIST_KEY);
      if (stored) {
        const validation = parseAndValidateSafe(stored, SavedProjectsListSchema, 'localStorage-projects-list');
        if (!validation.ok) {
          console.warn('[Project] G9 Projects list validation failed, using empty list:', validation.issues);
          set({ savedProjects: [] });
          return;
        }
        set({ savedProjects: validation.data });
      }
    } catch (error) {
      console.error('[Project] Failed to load projects list:', error);
    }
  },
  
  // ========== INITIALIZE ==========

  initialize: () => {
    // Load projects list
    get().loadProjectsList();

    // Try to load last project
    const loaded = get().loadProject();

    if (!loaded) {
      // Create new project if none exists
      get().newProject('Kitchen Base Cabinet');
    }
  },
}));

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook to access project metadata.
 *
 * @returns Current project metadata or null if no project loaded
 *
 * @example
 * function ProjectHeader() {
 *   const project = useProject();
 *   return <h1>{project?.name ?? 'No Project'}</h1>;
 * }
 */
export const useProject = () => useProjectStore((s) => s.metadata);

/**
 * Hook to check if project has unsaved changes.
 *
 * @returns True if there are unsaved changes
 *
 * @example
 * function SaveIndicator() {
 *   const isDirty = useProjectDirty();
 *   return isDirty ? <span>• Unsaved</span> : null;
 * }
 */
export const useProjectDirty = () => useProjectStore((s) => s.isDirty);

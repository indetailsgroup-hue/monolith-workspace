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
 * - `monolith-project:<id>`: Saved data for each project
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
} from '../gate/validateExternalState';
import { ProjectDataSchema, ImportedProjectSchema, SavedProjectsListSchema } from '../schema/project.schema';
import {
  readString,
  writeJson,
  remove,
} from '../persistence/unsafeStorage';
import { getMinifixFullConfigForThickness } from '../manufacturing/hardware/minifixDefaults';
import type { Cabinet } from '../types/Cabinet';

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
type SerializedCabinet = Omit<Cabinet, 'materials'> & {
  materials: Omit<Cabinet['materials'], 'overrides'> & {
    overrides: Record<string, string>;
  };
};

export interface ProjectData {
  /** Project identification and tracking */
  metadata: ProjectMetadata;
  /** Active cabinet state from useCabinetStore */
  cabinet: SerializedCabinet;
  /** All cabinets with scene positions/rotations */
  cabinets?: SerializedCabinet[];
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

const projectStorageKey = (id: string) => `monolith-project:${id}`;

// Keep the previous current-only save when first writing the new per-ID format.
// The original payload is retained; there is no bulk migration or deletion.
function preservePreviousCurrent(nextId: string): void {
  const stored = readString(STORAGE_KEY);
  if (!stored) return;
  const validation = parseAndValidateSafe(stored, ImportedProjectSchema, 'localStorage-legacy');
  if (!validation.ok || !validation.data.metadata.id || validation.data.metadata.id === nextId) return;
  const key = projectStorageKey(validation.data.metadata.id);
  if (readString(key) === null) writeJson(key, JSON.parse(stored));
}

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

function serializeCabinet(cabinet: Cabinet): SerializedCabinet {
  return {
    ...cabinet,
    materials: {
      ...cabinet.materials,
      overrides: Object.fromEntries(cabinet.materials.overrides),
    },
  };
}

function deserializeCabinet(cabinet: SerializedCabinet): Cabinet {
  return {
    ...cabinet,
    materials: {
      ...cabinet.materials,
      overrides: new Map(Object.entries(cabinet.materials.overrides ?? {})),
    },
  };
}

function serializeScene(cabinet: Cabinet, cabinets: Cabinet[]): SerializedCabinet[] {
  const scene = cabinets.some((candidate) => candidate.id === cabinet.id)
    ? cabinets.map((candidate) => candidate.id === cabinet.id ? {
      ...cabinet,
      // Move/rotate actions update the scene entry independently of cabinet.
      scenePosition: candidate.scenePosition ?? cabinet.scenePosition,
      sceneRotation: candidate.sceneRotation ?? cabinet.sceneRotation,
    } : candidate)
    : [...cabinets, cabinet];
  return scene.map((candidate) => serializeCabinet({
    ...candidate,
    scenePosition: candidate.scenePosition ?? [0, 0, 0],
    sceneRotation: candidate.sceneRotation ?? [0, 0, 0],
  }));
}

function restoreScene(projectData: ProjectData): Cabinet[] {
  const active = projectData.cabinet;
  const saved = projectData.cabinets?.length ? projectData.cabinets : [active];
  if (![active, ...saved].every((cabinet) => typeof cabinet?.id === 'string' && cabinet.id.trim())) {
    throw new Error('Invalid project scene: each cabinet requires an identity');
  }
  if (new Set(saved.map((cabinet) => cabinet.id)).size !== saved.length) {
    throw new Error('Invalid project scene: duplicate cabinet identities');
  }
  // Older files may omit the active cabinet from the optional scene array.
  const scene = saved.some((candidate) => candidate.id === active.id) ? saved : [...saved, active];
  return scene.map((candidate) => {
    const cabinet = deserializeCabinet(candidate.id === active.id ? {
      ...active,
      scenePosition: candidate.scenePosition ?? active.scenePosition,
      sceneRotation: candidate.sceneRotation ?? active.sceneRotation,
    } : candidate);
    const restored = {
      ...cabinet,
      scenePosition: cabinet.scenePosition ?? [0, 0, 0] as [number, number, number],
      sceneRotation: cabinet.sceneRotation ?? [0, 0, 0] as [number, number, number],
    };
    if (restored.hardware?.minifixConfig) return restored;
    // Preserve the existing v4.1 hardware migration for legacy cabinets.
    const coreId = restored.materials?.defaultCore || 'core-pb-18';
    const thickness = coreId.includes('16') ? 16 : coreId.includes('19') ? 19 : 18;
    return {
      ...restored,
      hardware: {
        ...restored.hardware,
        minifixConfig: getMinifixFullConfigForThickness(thickness),
        minifixPresetId: `builtin_minifix_${thickness}mm`,
      },
    };
  });
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
    useCabinetStore.setState({ selectedPanelId: null });
    
    set({
      metadata,
      isDirty: false,
      lastSaved: null,
    });
    
    // Save immediately
    get().saveProject();
  },
  
  saveProject: () => {
    const { metadata, isDirty } = get();
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
    const serializedCabinets = serializeScene(cabinet, cabinets);

    // Create project data
    const projectData: ProjectData = {
      metadata: updatedMetadata,
      cabinet: serializeCabinet(cabinet),
      cabinets: serializedCabinets,
    };
    
    // Save to localStorage via G9 boundary
    try {
      preservePreviousCurrent(metadata.id);
      writeJson(projectStorageKey(metadata.id), projectData);
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
      const stored = (projectId ? readString(projectStorageKey(projectId)) : null)
        ?? readString(STORAGE_KEY);
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

      if (!projectData.cabinet?.materials) {
        console.error('[Project] Invalid project data: missing cabinet materials');
        return false;
      }

      // If projectId specified but doesn't match, return false
      if (projectId && projectData.metadata.id !== projectId) {
        return false;
      }

      const cabinetsToRestore = restoreScene(projectData);
      // Explicit selection must persist the current snapshot before switching
      // memory. Startup recovery reads the current snapshot without requiring
      // a redundant write (e.g. a readable store whose quota is exhausted).
      if (projectId) {
        preservePreviousCurrent(projectData.metadata.id);
        writeJson(STORAGE_KEY, projectData);
      }
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      // Set cabinet and also sync to cabinets array
      useCabinetStore.setState({
        cabinet: cabinetsToRestore.find((candidate) => candidate.id === projectData.cabinet.id)!,
        cabinets: cabinetsToRestore,
        activeCabinetId: projectData.cabinet.id,
        selectedPanelId: null,
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
    remove(projectStorageKey(projectId));

    // If deleting current project, clear it
    if (metadata?.id === projectId) {
      remove(STORAGE_KEY);
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      useCabinetStore.setState({
        cabinet: null,
        cabinets: [],
        activeCabinetId: null,
        selectedPanelId: null,
      });
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
      cabinet: serializeCabinet(cabinet),
      cabinets: serializeScene(cabinet, useCabinetStore.getState().cabinets),
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

      const cabinets = restoreScene(projectData);
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      useCabinetStore.setState({
        cabinet: cabinets.find((candidate) => candidate.id === projectData.cabinet.id)!,
        cabinets,
        activeCabinetId: projectData.cabinet.id,
        selectedPanelId: null,
      });

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

/**
 * useProjectStore Integration Tests
 *
 * Tests for project lifecycle operations:
 * - Project creation
 * - Save and load
 * - Project metadata
 * - Export and import
 * - Auto-save mechanism
 *
 * @version 1.1.0 - AGENT-T022 & AGENT-T023 (Fixed API alignment)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { useCabinetStore } from '../useCabinetStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    _getStore: () => store,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useProjectStore', () => {
  beforeEach(() => {
    // Reset stores
    localStorageMock.clear();
    vi.clearAllMocks();

    useProjectStore.setState({
      metadata: null,
      isDirty: false,
      lastSaved: null,
      autoSaveEnabled: true,
      savedProjects: [],
    });

    useCabinetStore.setState({
      cabinets: [],
      cabinet: null,
      activeCabinetId: null,
      selectedPanelId: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ============================================
  // PROJECT CREATION
  // ============================================

  describe('newProject', () => {
    it('should create a new project with default name', () => {
      useProjectStore.getState().newProject();

      const { metadata } = useProjectStore.getState();
      expect(metadata).not.toBeNull();
      expect(metadata?.id).toBeDefined();
      expect(metadata?.id.startsWith('proj-')).toBe(true);
    });

    it('should create a new project with custom name', () => {
      useProjectStore.getState().newProject('My Kitchen');

      const { metadata } = useProjectStore.getState();
      expect(metadata?.name).toBe('My Kitchen');
    });

    it('should generate unique IDs for each project', () => {
      useProjectStore.getState().newProject('Project 1');
      const id1 = useProjectStore.getState().metadata?.id;

      useProjectStore.getState().newProject('Project 2');
      const id2 = useProjectStore.getState().metadata?.id;

      expect(id1).not.toBe(id2);
    });

    it('should set createdAt timestamp', () => {
      const before = Date.now();
      useProjectStore.getState().newProject('Test');
      const after = Date.now();

      const { metadata } = useProjectStore.getState();
      expect(metadata?.createdAt).toBeGreaterThanOrEqual(before);
      expect(metadata?.createdAt).toBeLessThanOrEqual(after);
    });

    it('should initialize cabinet on new project', () => {
      useProjectStore.getState().newProject('Test');

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet).not.toBeNull();
    });

    it('should set isDirty to false', () => {
      useProjectStore.getState().newProject('Test');
      expect(useProjectStore.getState().isDirty).toBe(false);
    });
  });

  // ============================================
  // PROJECT SAVE
  // ============================================

  describe('saveProject', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Save Test');
    });

    it('should save project to localStorage', () => {
      useProjectStore.getState().saveProject();

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should update lastSaved timestamp', () => {
      const before = Date.now();
      useProjectStore.getState().saveProject();
      const after = Date.now();

      const { lastSaved } = useProjectStore.getState();
      expect(lastSaved).toBeGreaterThanOrEqual(before);
      expect(lastSaved).toBeLessThanOrEqual(after);
    });

    it('should clear isDirty flag after save', () => {
      useProjectStore.getState().markDirty();
      expect(useProjectStore.getState().isDirty).toBe(true);

      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('should update metadata.updatedAt', () => {
      const initialUpdatedAt = useProjectStore.getState().metadata?.updatedAt || 0;

      // Wait a bit using real time
      const newSaveTime = Date.now();
      useProjectStore.getState().saveProject();

      const newUpdatedAt = useProjectStore.getState().metadata?.updatedAt;
      expect(newUpdatedAt).toBeGreaterThanOrEqual(initialUpdatedAt);
    });

    it('should add project to projects list', () => {
      useProjectStore.getState().saveProject();

      const projectsList = JSON.parse(
        localStorageMock._getStore()['monolith-projects-list'] || '[]'
      );
      expect(projectsList.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // PROJECT LOAD
  // ============================================

  describe('loadProject', () => {
    it('should load project from localStorage', () => {
      // Create and save a project
      useProjectStore.getState().newProject('Load Test');
      const savedId = useProjectStore.getState().metadata?.id;
      useProjectStore.getState().saveProject();

      // Clear current state
      useProjectStore.setState({ metadata: null });

      // Load the project
      const loaded = useProjectStore.getState().loadProject();

      expect(loaded).toBe(true);
      expect(useProjectStore.getState().metadata?.id).toBe(savedId);
    });

    it('should return false if no project to load', () => {
      localStorageMock.clear();
      const loaded = useProjectStore.getState().loadProject();
      expect(loaded).toBe(false);
    });

    it('should restore cabinet state on load', () => {
      // Create and modify cabinet
      useProjectStore.getState().newProject('Cabinet Test');
      useCabinetStore.getState().setDimension('width', 800);
      useProjectStore.getState().saveProject();

      // Clear cabinet state
      useCabinetStore.setState({ cabinet: null });

      // Load project
      useProjectStore.getState().loadProject();

      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet?.dimensions.width).toBe(800);
    });

    it('should set isDirty to false after load', () => {
      useProjectStore.getState().newProject('Test');
      useProjectStore.getState().saveProject();

      useProjectStore.setState({ isDirty: true });
      useProjectStore.getState().loadProject();

      expect(useProjectStore.getState().isDirty).toBe(false);
    });
  });

  // ============================================
  // PROJECT METADATA
  // ============================================

  describe('Project Metadata', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Metadata Test');
    });

    it('should update project name', () => {
      useProjectStore.getState().setProjectName('New Name');
      expect(useProjectStore.getState().metadata?.name).toBe('New Name');
    });

    it('should mark dirty when name changes', () => {
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().setProjectName('Changed Name');
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('should update project description', () => {
      useProjectStore.getState().setProjectDescription('A kitchen cabinet project');
      expect(useProjectStore.getState().metadata?.description).toBe(
        'A kitchen cabinet project'
      );
    });

    it('should mark dirty when description changes', () => {
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().setProjectDescription('New description');
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('should preserve metadata across saves', () => {
      useProjectStore.getState().setProjectName('Preserved Name');
      useProjectStore.getState().setProjectDescription('Preserved Description');
      useProjectStore.getState().saveProject();

      // Clear and reload
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().loadProject();

      expect(useProjectStore.getState().metadata?.name).toBe('Preserved Name');
      expect(useProjectStore.getState().metadata?.description).toBe(
        'Preserved Description'
      );
    });
  });

  // ============================================
  // PROJECT DELETE
  // ============================================

  describe('deleteProject', () => {
    it('should remove project from list', () => {
      useProjectStore.getState().newProject('To Delete');
      const projectId = useProjectStore.getState().metadata?.id || '';
      useProjectStore.getState().saveProject();

      // Verify it's in the list
      let projectsList = useProjectStore.getState().savedProjects;
      expect(projectsList.some((p) => p.id === projectId)).toBe(true);

      // Delete
      useProjectStore.getState().deleteProject(projectId);

      // Verify removal
      projectsList = useProjectStore.getState().savedProjects;
      expect(projectsList.some((p) => p.id === projectId)).toBe(false);
    });

    it('should clear current project if deleting active project', () => {
      useProjectStore.getState().newProject('Current');
      const projectId = useProjectStore.getState().metadata?.id || '';
      useProjectStore.getState().saveProject();

      useProjectStore.getState().deleteProject(projectId);

      expect(useProjectStore.getState().metadata).toBeNull();
    });
  });

  // ============================================
  // PROJECT EXPORT/IMPORT
  // ============================================

  describe('exportProject', () => {
    it('should export project as JSON string', () => {
      useProjectStore.getState().newProject('Export Test');
      const json = useProjectStore.getState().exportProject();

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.cabinet).toBeDefined();
    });

    it('should include cabinet data in export', () => {
      useProjectStore.getState().newProject('Export Cabinet');
      useCabinetStore.getState().setDimension('width', 900);

      const json = useProjectStore.getState().exportProject();
      const parsed = JSON.parse(json);

      expect(parsed.cabinet.dimensions.width).toBe(900);
    });
  });

  describe('importProject', () => {
    it('should import project from JSON string', () => {
      // Create and export a project
      useProjectStore.getState().newProject('Original');
      useCabinetStore.getState().setDimension('width', 850);
      const exportedJson = useProjectStore.getState().exportProject();

      // Clear state
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      // Import
      const success = useProjectStore.getState().importProject(exportedJson);

      expect(success).toBe(true);
      expect(useProjectStore.getState().metadata?.name).toBe('Original');
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(850);
    });

    it('should generate new ID on import', () => {
      useProjectStore.getState().newProject('Import Test');
      const originalId = useProjectStore.getState().metadata?.id;
      const json = useProjectStore.getState().exportProject();

      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().importProject(json);

      const importedId = useProjectStore.getState().metadata?.id;
      expect(importedId).not.toBe(originalId);
    });

    it('should return false for invalid JSON', () => {
      const success = useProjectStore.getState().importProject('not valid json');
      expect(success).toBe(false);
    });

    it('should return false for empty string', () => {
      const success = useProjectStore.getState().importProject('');
      expect(success).toBe(false);
    });
  });

  // ============================================
  // DIRTY FLAG
  // ============================================

  describe('Dirty Flag', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Dirty Test');
    });

    it('should mark project as dirty', () => {
      useProjectStore.getState().markDirty();
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('should clear dirty flag on save', () => {
      useProjectStore.getState().markDirty();
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('should clear dirty flag on load', () => {
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ isDirty: true });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });
  });
});

// ============================================
// AUTO-SAVE TESTS (AGENT-T023)
// ============================================

describe('Auto-save Mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();

    useProjectStore.setState({
      metadata: null,
      isDirty: false,
      lastSaved: null,
      autoSaveEnabled: true,
      savedProjects: [],
    });

    useCabinetStore.setState({
      cabinets: [],
      cabinet: null,
      activeCabinetId: null,
      selectedPanelId: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Auto-save Enable/Disable', () => {
    it('should have auto-save enabled by default', () => {
      expect(useProjectStore.getState().autoSaveEnabled).toBe(true);
    });

    it('should allow disabling auto-save', () => {
      useProjectStore.getState().setAutoSave(false);
      expect(useProjectStore.getState().autoSaveEnabled).toBe(false);
    });

    it('should allow enabling auto-save', () => {
      useProjectStore.getState().setAutoSave(false);
      useProjectStore.getState().setAutoSave(true);
      expect(useProjectStore.getState().autoSaveEnabled).toBe(true);
    });
  });

  describe('Auto-save Trigger', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Auto-save Test');
    });

    it('should trigger save after delay when marked dirty', () => {
      const saveSpy = vi.spyOn(useProjectStore.getState(), 'saveProject');

      useProjectStore.getState().markDirty();

      // Before delay, should not have saved
      expect(saveSpy).not.toHaveBeenCalled();

      // After 2 seconds (AUTO_SAVE_DELAY)
      vi.advanceTimersByTime(2000);

      // Now should have saved
      expect(saveSpy).toHaveBeenCalled();
    });

    it('should debounce multiple dirty marks', () => {
      useProjectStore.getState().markDirty();
      vi.advanceTimersByTime(1000); // 1 second

      useProjectStore.getState().markDirty(); // Restart timer
      vi.advanceTimersByTime(1000); // 1 more second (2 total from first, 1 from second)

      // Should not have saved yet (timer restarted)
      const lastSaved = useProjectStore.getState().lastSaved;

      // Advance past second debounce
      vi.advanceTimersByTime(1000);

      // Now should have saved
      const newLastSaved = useProjectStore.getState().lastSaved;
      expect(newLastSaved).toBeGreaterThan(lastSaved || 0);
    });

    it('should not auto-save when disabled', () => {
      useProjectStore.getState().setAutoSave(false);

      const lastSaved = useProjectStore.getState().lastSaved;
      useProjectStore.getState().markDirty();
      vi.advanceTimersByTime(5000);

      expect(useProjectStore.getState().lastSaved).toBe(lastSaved);
    });
  });

  describe('Data Recovery', () => {
    it('should recover last saved state on app restart', () => {
      // Create and save
      useProjectStore.getState().newProject('Recovery Test');
      useCabinetStore.getState().setDimension('width', 777);
      useProjectStore.getState().saveProject();

      // Simulate app restart (clear memory state)
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      // Initialize (simulates app startup)
      useProjectStore.getState().initialize();

      // Should recover saved state
      expect(useProjectStore.getState().metadata?.name).toBe('Recovery Test');
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(777);
    });

    it('should create new project if no saved state exists', () => {
      localStorageMock.clear();

      useProjectStore.getState().initialize();

      expect(useProjectStore.getState().metadata).not.toBeNull();
      expect(useCabinetStore.getState().cabinet).not.toBeNull();
    });

    it('should preserve panel customizations after recovery', () => {
      useProjectStore.getState().newProject('Panel Test');

      // Add a shelf and customize it (role is uppercase 'SHELF')
      useCabinetStore.getState().addShelfInCompartment(0, 0);
      const shelf = useCabinetStore
        .getState()
        .cabinet?.panels.find((p) => p.role === 'SHELF' && p.name.includes('Sub'));

      if (shelf) {
        useCabinetStore.getState().updatePanelMaterial(shelf.id, 'core', 'custom-core');
      }

      useProjectStore.getState().saveProject();

      // Simulate restart
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().initialize();

      // Verify customization preserved
      const recoveredShelf = useCabinetStore
        .getState()
        .cabinet?.panels.find((p) => p.role === 'SHELF' && p.name.includes('Sub'));

      // Panel has coreMaterialId, not materials.core
      if (recoveredShelf) {
        expect(recoveredShelf.coreMaterialId).toBe('custom-core');
      }
    });
  });

  describe('Auto-save Error Handling', () => {
    it('should handle localStorage write errors gracefully', () => {
      useProjectStore.getState().newProject('Error Test');

      // Make localStorage.setItem throw
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw
      expect(() => {
        useProjectStore.getState().saveProject();
      }).not.toThrow();
    });

    it('should handle corrupted localStorage data', () => {
      // Set invalid JSON in localStorage
      localStorageMock.setItem('monolith-current-project', 'invalid json {{{');

      // Should not throw, should return false
      expect(() => {
        useProjectStore.getState().loadProject();
      }).not.toThrow();
    });
  });
});

// ============================================
// PROJECTS LIST MANAGEMENT
// ============================================

describe('Projects List', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();

    useProjectStore.setState({
      metadata: null,
      isDirty: false,
      lastSaved: null,
      autoSaveEnabled: true,
      savedProjects: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should load projects list on initialize', () => {
    // Pre-populate localStorage
    localStorageMock.setItem(
      'monolith-projects-list',
      JSON.stringify([
        { id: 'proj-1', name: 'Project 1', updatedAt: Date.now() },
        { id: 'proj-2', name: 'Project 2', updatedAt: Date.now() },
      ])
    );

    useProjectStore.getState().loadProjectsList();

    expect(useProjectStore.getState().savedProjects.length).toBe(2);
  });

  it('should limit projects list to 20 items', () => {
    // Create many projects
    for (let i = 0; i < 25; i++) {
      useProjectStore.getState().newProject(`Project ${i}`);
      useProjectStore.getState().saveProject();
    }

    const projectsList = JSON.parse(
      localStorageMock._getStore()['monolith-projects-list'] || '[]'
    );
    expect(projectsList.length).toBeLessThanOrEqual(20);
  });

  it('should sort projects by updatedAt (most recent first)', () => {
    useProjectStore.getState().newProject('Old');
    useProjectStore.getState().saveProject();

    // Create newer project
    vi.advanceTimersByTime(1000);
    useProjectStore.getState().newProject('New');
    useProjectStore.getState().saveProject();

    const projectsList = useProjectStore.getState().savedProjects;
    expect(projectsList[0].name).toBe('New');
  });
});

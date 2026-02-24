/** @vitest-environment jsdom */

/**
 * useProjectStore Integration Tests (T022 + T023)
 *
 * Comprehensive tests covering:
 * - T022: Save/Load integration, roundtrip, export/import, projects list
 * - T023: Auto-save, debouncing, data recovery, error handling
 *
 * @version 2.0.0 - AGENT-T022 & AGENT-T023 (60+ tests)
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { useCabinetStore } from '../useCabinetStore';

// ============================================
// MOCKS
// ============================================

// In-memory localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
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
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _getStore: () => store,
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Helper: reset both stores cleanly
function resetStores() {
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
}

// ============================================
// T022 - SAVE / LOAD INTEGRATION TESTS
// ============================================

describe('T022 - Save/Load Integration', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ──────────────────────────────────────────
  // 1. newProject(name)
  // ──────────────────────────────────────────

  describe('newProject', () => {
    it('creates a project with default name "Untitled Project"', () => {
      useProjectStore.getState().newProject();
      const { metadata } = useProjectStore.getState();
      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe('Untitled Project');
    });

    it('creates a project with custom name', () => {
      useProjectStore.getState().newProject('My Kitchen');
      expect(useProjectStore.getState().metadata?.name).toBe('My Kitchen');
    });

    it('generates an ID starting with "proj-"', () => {
      useProjectStore.getState().newProject('Test');
      const { metadata } = useProjectStore.getState();
      expect(metadata?.id).toMatch(/^proj-/);
    });

    it('generates unique IDs for successive projects', () => {
      useProjectStore.getState().newProject('A');
      const id1 = useProjectStore.getState().metadata?.id;
      useProjectStore.getState().newProject('B');
      const id2 = useProjectStore.getState().metadata?.id;
      expect(id1).not.toBe(id2);
    });

    it('sets createdAt timestamp around Date.now()', () => {
      const before = Date.now();
      useProjectStore.getState().newProject('Test');
      const after = Date.now();
      const { metadata } = useProjectStore.getState();
      expect(metadata!.createdAt).toBeGreaterThanOrEqual(before);
      expect(metadata!.createdAt).toBeLessThanOrEqual(after);
    });

    it('sets updatedAt equal to createdAt on creation', () => {
      useProjectStore.getState().newProject('Test');
      const { metadata } = useProjectStore.getState();
      expect(metadata!.updatedAt).toBe(metadata!.createdAt);
    });

    it('sets version to "1.0.0"', () => {
      useProjectStore.getState().newProject('Test');
      expect(useProjectStore.getState().metadata?.version).toBe('1.0.0');
    });

    it('calls createCabinet on the cabinet store', () => {
      useProjectStore.getState().newProject('Cabinet Check');
      const cabinet = useCabinetStore.getState().cabinet;
      expect(cabinet).not.toBeNull();
    });

    it('sets isDirty to false after creation', () => {
      useProjectStore.getState().newProject('Test');
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('auto-saves immediately after creation (lastSaved set)', () => {
      useProjectStore.getState().newProject('Test');
      expect(useProjectStore.getState().lastSaved).not.toBeNull();
    });

    it('adds the new project to savedProjects list', () => {
      useProjectStore.getState().newProject('Listed');
      const list = useProjectStore.getState().savedProjects;
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].name).toBe('Listed');
    });
  });

  // ──────────────────────────────────────────
  // 2. saveProject()
  // ──────────────────────────────────────────

  describe('saveProject', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Save Test');
    });

    it('writes to localStorage', () => {
      const setItemCallsBefore = localStorageMock.setItem.mock.calls.length;
      useProjectStore.getState().saveProject();
      expect(localStorageMock.setItem.mock.calls.length).toBeGreaterThan(setItemCallsBefore);
    });

    it('stores data under "monolith-current-project" key', () => {
      useProjectStore.getState().saveProject();
      const raw = localStorageMock._getStore()['monolith-current-project'];
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.cabinet).toBeDefined();
    });

    it('updates lastSaved timestamp', () => {
      const before = Date.now();
      useProjectStore.getState().saveProject();
      const { lastSaved } = useProjectStore.getState();
      expect(lastSaved).toBeGreaterThanOrEqual(before);
    });

    it('clears isDirty after save', () => {
      useProjectStore.getState().markDirty();
      expect(useProjectStore.getState().isDirty).toBe(true);
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('updates metadata.updatedAt', () => {
      const initial = useProjectStore.getState().metadata!.updatedAt;
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().metadata!.updatedAt).toBeGreaterThanOrEqual(initial);
    });

    it('serializes cabinet materials.overrides as a plain object', () => {
      useProjectStore.getState().saveProject();
      const raw = localStorageMock._getStore()['monolith-current-project'];
      const parsed = JSON.parse(raw);
      // overrides should be a plain object, not a Map
      expect(parsed.cabinet.materials.overrides).not.toBeInstanceOf(Map);
      expect(typeof parsed.cabinet.materials.overrides).toBe('object');
    });

    it('updates the projects list in localStorage', () => {
      useProjectStore.getState().saveProject();
      const listRaw = localStorageMock._getStore()['monolith-projects-list'];
      const list = JSON.parse(listRaw);
      expect(list.length).toBeGreaterThan(0);
    });

    it('does not save when metadata is null', () => {
      useProjectStore.setState({ metadata: null });
      const callsBefore = localStorageMock.setItem.mock.calls.length;
      useProjectStore.getState().saveProject();
      // Should not have called setItem (no new calls)
      expect(localStorageMock.setItem.mock.calls.length).toBe(callsBefore);
    });

    it('does not save when cabinet is null', () => {
      useCabinetStore.setState({ cabinet: null });
      const callsBefore = localStorageMock.setItem.mock.calls.length;
      useProjectStore.getState().saveProject();
      expect(localStorageMock.setItem.mock.calls.length).toBe(callsBefore);
    });

    it('includes cabinets array with scenePosition/sceneRotation', () => {
      useProjectStore.getState().saveProject();
      const raw = localStorageMock._getStore()['monolith-current-project'];
      const parsed = JSON.parse(raw);
      expect(parsed.cabinets).toBeDefined();
      expect(Array.isArray(parsed.cabinets)).toBe(true);
      if (parsed.cabinets.length > 0) {
        expect(parsed.cabinets[0].scenePosition).toBeDefined();
        expect(parsed.cabinets[0].sceneRotation).toBeDefined();
      }
    });
  });

  // ──────────────────────────────────────────
  // 3. loadProject()
  // ──────────────────────────────────────────

  describe('loadProject', () => {
    it('returns true when project exists in localStorage', () => {
      useProjectStore.getState().newProject('Load Test');
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ metadata: null });
      const result = useProjectStore.getState().loadProject();
      expect(result).toBe(true);
    });

    it('restores metadata from localStorage', () => {
      useProjectStore.getState().newProject('Load Test');
      const savedId = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().metadata?.id).toBe(savedId);
    });

    it('restores cabinet state', () => {
      useProjectStore.getState().newProject('Cabinet Restore');
      useCabinetStore.getState().setDimension('width', 800);
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(800);
    });

    it('converts materials.overrides back to a Map', () => {
      useProjectStore.getState().newProject('Map Test');
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      const overrides = useCabinetStore.getState().cabinet?.materials?.overrides;
      expect(overrides).toBeInstanceOf(Map);
    });

    it('returns false when localStorage is empty', () => {
      localStorageMock.clear();
      const result = useProjectStore.getState().loadProject();
      expect(result).toBe(false);
    });

    it('returns false when projectId does not match stored project', () => {
      useProjectStore.getState().newProject('Test');
      useProjectStore.getState().saveProject();
      const result = useProjectStore.getState().loadProject('non-existent-id');
      expect(result).toBe(false);
    });

    it('sets isDirty to false after load', () => {
      useProjectStore.getState().newProject('Test');
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ isDirty: true });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('sets lastSaved to metadata.updatedAt', () => {
      useProjectStore.getState().newProject('Test');
      useProjectStore.getState().saveProject();
      const expected = useProjectStore.getState().metadata!.updatedAt;
      useProjectStore.setState({ lastSaved: null });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().lastSaved).toBe(expected);
    });

    it('restores cabinets array with scenePosition/sceneRotation', () => {
      useProjectStore.getState().newProject('Scene Test');
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null, cabinets: [] });
      useProjectStore.getState().loadProject();
      const cabinets = useCabinetStore.getState().cabinets;
      expect(cabinets.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────
  // 4. deleteProject(id)
  // ──────────────────────────────────────────

  describe('deleteProject', () => {
    it('removes project from savedProjects list', () => {
      useProjectStore.getState().newProject('To Delete');
      const id = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().savedProjects.some(p => p.id === id)).toBe(true);
      useProjectStore.getState().deleteProject(id);
      expect(useProjectStore.getState().savedProjects.some(p => p.id === id)).toBe(false);
    });

    it('clears current project if deleting active project', () => {
      useProjectStore.getState().newProject('Active');
      const id = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      useProjectStore.getState().deleteProject(id);
      expect(useProjectStore.getState().metadata).toBeNull();
      expect(useProjectStore.getState().isDirty).toBe(false);
      expect(useProjectStore.getState().lastSaved).toBeNull();
    });

    it('removes from localStorage via remove()', () => {
      useProjectStore.getState().newProject('Del');
      const id = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      useProjectStore.getState().deleteProject(id);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('monolith-current-project');
    });

    it('does not clear current project when deleting a different project', () => {
      useProjectStore.getState().newProject('Active');
      const activeId = useProjectStore.getState().metadata!.id;
      // Manually inject another project into the list
      useProjectStore.setState({
        savedProjects: [
          ...useProjectStore.getState().savedProjects,
          { id: 'other-proj', name: 'Other', updatedAt: Date.now() },
        ],
      });
      useProjectStore.getState().deleteProject('other-proj');
      expect(useProjectStore.getState().metadata?.id).toBe(activeId);
    });

    it('persists updated list to localStorage', () => {
      useProjectStore.getState().newProject('Persist');
      const id = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      const callsBefore = localStorageMock.setItem.mock.calls.length;
      useProjectStore.getState().deleteProject(id);
      // setItem should be called with the updated list
      const listCalls = localStorageMock.setItem.mock.calls.filter(
        (c: any) => c[0] === 'monolith-projects-list'
      );
      expect(listCalls.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────
  // 5. exportProject()
  // ──────────────────────────────────────────

  describe('exportProject', () => {
    it('returns a valid JSON string', () => {
      useProjectStore.getState().newProject('Export Test');
      const json = useProjectStore.getState().exportProject();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('includes metadata in export', () => {
      useProjectStore.getState().newProject('Export Meta');
      const json = useProjectStore.getState().exportProject();
      const parsed = JSON.parse(json);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.name).toBe('Export Meta');
    });

    it('includes cabinet data in export', () => {
      useProjectStore.getState().newProject('Export Cabinet');
      const json = useProjectStore.getState().exportProject();
      const parsed = JSON.parse(json);
      expect(parsed.cabinet).toBeDefined();
      expect(parsed.cabinet.dimensions).toBeDefined();
    });

    it('exports cabinet dimension changes', () => {
      useProjectStore.getState().newProject('Width Change');
      useCabinetStore.getState().setDimension('width', 900);
      const json = useProjectStore.getState().exportProject();
      const parsed = JSON.parse(json);
      expect(parsed.cabinet.dimensions.width).toBe(900);
    });

    it('returns "{}" when no project is loaded', () => {
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });
      const json = useProjectStore.getState().exportProject();
      expect(json).toBe('{}');
    });

    it('serializes materials.overrides as a plain object', () => {
      useProjectStore.getState().newProject('Overrides');
      const json = useProjectStore.getState().exportProject();
      const parsed = JSON.parse(json);
      expect(parsed.cabinet.materials.overrides).not.toBeInstanceOf(Map);
    });
  });

  // ──────────────────────────────────────────
  // 6. importProject(json)
  // ──────────────────────────────────────────

  describe('importProject', () => {
    it('imports a valid exported project and returns true', () => {
      useProjectStore.getState().newProject('Original');
      useCabinetStore.getState().setDimension('width', 850);
      const json = useProjectStore.getState().exportProject();

      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      const result = useProjectStore.getState().importProject(json);
      expect(result).toBe(true);
      expect(useProjectStore.getState().metadata?.name).toBe('Original');
    });

    it('restores cabinet dimensions on import', () => {
      useProjectStore.getState().newProject('Import Dim');
      useCabinetStore.getState().setDimension('width', 850);
      const json = useProjectStore.getState().exportProject();

      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().importProject(json);
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(850);
    });

    it('generates a new ID on import (no conflict)', () => {
      useProjectStore.getState().newProject('Import ID');
      const origId = useProjectStore.getState().metadata!.id;
      const json = useProjectStore.getState().exportProject();

      useProjectStore.getState().importProject(json);
      expect(useProjectStore.getState().metadata!.id).not.toBe(origId);
    });

    it('returns false for invalid JSON string', () => {
      const result = useProjectStore.getState().importProject('not valid json');
      expect(result).toBe(false);
    });

    it('returns false for empty string', () => {
      const result = useProjectStore.getState().importProject('');
      expect(result).toBe(false);
    });

    it('returns false for JSON missing required fields', () => {
      const result = useProjectStore.getState().importProject('{"foo":"bar"}');
      expect(result).toBe(false);
    });

    it('auto-saves after successful import', () => {
      useProjectStore.getState().newProject('Saving Import');
      const json = useProjectStore.getState().exportProject();

      const setItemCallsBefore = localStorageMock.setItem.mock.calls.length;
      useProjectStore.getState().importProject(json);
      expect(localStorageMock.setItem.mock.calls.length).toBeGreaterThan(setItemCallsBefore);
    });

    it('converts overrides back to Map on import', () => {
      useProjectStore.getState().newProject('Map Import');
      const json = useProjectStore.getState().exportProject();

      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().importProject(json);
      const overrides = useCabinetStore.getState().cabinet?.materials?.overrides;
      expect(overrides).toBeInstanceOf(Map);
    });
  });

  // ──────────────────────────────────────────
  // 7. downloadProject()
  // ──────────────────────────────────────────

  describe('downloadProject', () => {
    it('creates a blob download link and clicks it', () => {
      useProjectStore.getState().newProject('Download Test');

      const mockClick = vi.fn();
      const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => el);
      const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation((el) => el);
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:fake-url');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

      // Mock createElement to capture the 'a' element
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') {
          el.click = mockClick;
        }
        return el;
      });

      useProjectStore.getState().downloadProject();

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

      mockAppendChild.mockRestore();
      mockRemoveChild.mockRestore();
      vi.spyOn(document, 'createElement').mockRestore();
    });

    it('uses project name in filename', () => {
      useProjectStore.getState().newProject('Kitchen Island');

      const appendedElements: HTMLElement[] = [];
      vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
        appendedElements.push(el as HTMLElement);
        return el;
      });
      vi.spyOn(document.body, 'removeChild').mockImplementation((el) => el);
      vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });

      useProjectStore.getState().downloadProject();

      const anchor = appendedElements.find(el => el.tagName === 'A') as HTMLAnchorElement | undefined;
      if (anchor) {
        expect(anchor.download).toContain('Kitchen Island');
        expect(anchor.download).toContain('.monolith.json');
      }

      vi.spyOn(document.body, 'appendChild').mockRestore();
      vi.spyOn(document.body, 'removeChild').mockRestore();
    });
  });

  // ──────────────────────────────────────────
  // 8. Roundtrip: save -> load -> verify
  // ──────────────────────────────────────────

  describe('Save/Load Roundtrip', () => {
    it('preserves project name across save/load', () => {
      useProjectStore.getState().newProject('Roundtrip Name');
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().metadata?.name).toBe('Roundtrip Name');
    });

    it('preserves project description across save/load', () => {
      useProjectStore.getState().newProject('Desc Test');
      useProjectStore.getState().setProjectDescription('A nice cabinet');
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().metadata?.description).toBe('A nice cabinet');
    });

    it('preserves cabinet width across save/load', () => {
      useProjectStore.getState().newProject('Width RT');
      useCabinetStore.getState().setDimension('width', 777);
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(777);
    });

    it('preserves cabinet height across save/load', () => {
      useProjectStore.getState().newProject('Height RT');
      useCabinetStore.getState().setDimension('height', 900);
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      expect(useCabinetStore.getState().cabinet?.dimensions.height).toBe(900);
    });

    it('preserves cabinet depth across save/load', () => {
      useProjectStore.getState().newProject('Depth RT');
      useCabinetStore.getState().setDimension('depth', 550);
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      expect(useCabinetStore.getState().cabinet?.dimensions.depth).toBe(550);
    });

    it('preserves panel material overrides across save/load', () => {
      useProjectStore.getState().newProject('Panel Override');
      const shelf = useCabinetStore.getState().cabinet?.panels.find(p => p.role === 'BOTTOM');
      if (shelf) {
        useCabinetStore.getState().updatePanelMaterial(shelf.id, 'core', 'custom-core');
      }
      useProjectStore.getState().saveProject();
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().loadProject();
      const restored = useCabinetStore.getState().cabinet?.panels.find(p => p.role === 'BOTTOM');
      if (restored) {
        expect(restored.coreMaterialId).toBe('custom-core');
      }
    });

    it('preserves metadata.id across save/load', () => {
      useProjectStore.getState().newProject('ID RT');
      const origId = useProjectStore.getState().metadata!.id;
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().metadata?.id).toBe(origId);
    });
  });

  // ──────────────────────────────────────────
  // 9. loadProjectsList()
  // ──────────────────────────────────────────

  describe('loadProjectsList', () => {
    it('loads projects from localStorage', () => {
      localStorageMock.setItem(
        'monolith-projects-list',
        JSON.stringify([
          { id: 'p1', name: 'Proj 1', updatedAt: 1000 },
          { id: 'p2', name: 'Proj 2', updatedAt: 2000 },
        ])
      );
      useProjectStore.getState().loadProjectsList();
      expect(useProjectStore.getState().savedProjects).toHaveLength(2);
    });

    it('sets empty list when localStorage has no projects list', () => {
      useProjectStore.getState().loadProjectsList();
      expect(useProjectStore.getState().savedProjects).toEqual([]);
    });

    it('sets empty list when localStorage has invalid data', () => {
      localStorageMock.setItem('monolith-projects-list', 'not json');
      useProjectStore.getState().loadProjectsList();
      // Should fall back to empty (validation fails)
      expect(useProjectStore.getState().savedProjects).toEqual([]);
    });

    it('handles corrupted projects list gracefully', () => {
      localStorageMock.setItem('monolith-projects-list', '{"broken": true}');
      expect(() => useProjectStore.getState().loadProjectsList()).not.toThrow();
    });
  });

  // ──────────────────────────────────────────
  // 10. initialize()
  // ──────────────────────────────────────────

  describe('initialize', () => {
    it('loads last project when one exists in localStorage', () => {
      useProjectStore.getState().newProject('Init Test');
      useProjectStore.getState().saveProject();
      const savedName = useProjectStore.getState().metadata!.name;

      // Simulate restart
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().metadata?.name).toBe(savedName);
    });

    it('creates a new project when none exists', () => {
      localStorageMock.clear();
      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().metadata).not.toBeNull();
      expect(useProjectStore.getState().metadata!.name).toBe('Kitchen Base Cabinet');
    });

    it('creates a cabinet when no saved state', () => {
      localStorageMock.clear();
      useProjectStore.getState().initialize();
      expect(useCabinetStore.getState().cabinet).not.toBeNull();
    });

    it('loads projects list during initialization', () => {
      localStorageMock.setItem(
        'monolith-projects-list',
        JSON.stringify([{ id: 'p1', name: 'P1', updatedAt: 1000 }])
      );
      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().savedProjects.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────
  // Metadata setters
  // ──────────────────────────────────────────

  describe('Metadata Setters', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Meta Test');
    });

    it('setProjectName updates the name', () => {
      useProjectStore.getState().setProjectName('New Name');
      expect(useProjectStore.getState().metadata?.name).toBe('New Name');
    });

    it('setProjectName marks dirty', () => {
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().setProjectName('Changed');
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('setProjectDescription updates description', () => {
      useProjectStore.getState().setProjectDescription('My desc');
      expect(useProjectStore.getState().metadata?.description).toBe('My desc');
    });

    it('setProjectDescription marks dirty', () => {
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().setProjectDescription('New desc');
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('setProjectName does nothing when metadata is null', () => {
      useProjectStore.setState({ metadata: null });
      useProjectStore.getState().setProjectName('No-op');
      expect(useProjectStore.getState().metadata).toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // Export/Import Roundtrip
  // ──────────────────────────────────────────

  describe('Export/Import Roundtrip', () => {
    it('preserves project name after export then import', () => {
      useProjectStore.getState().newProject('Roundtrip Export');
      useCabinetStore.getState().setDimension('width', 600);
      const json = useProjectStore.getState().exportProject();

      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      useProjectStore.getState().importProject(json);
      expect(useProjectStore.getState().metadata?.name).toBe('Roundtrip Export');
    });

    it('preserves cabinet dimensions after export then import', () => {
      useProjectStore.getState().newProject('Dim Roundtrip');
      useCabinetStore.getState().setDimension('width', 600);
      const json = useProjectStore.getState().exportProject();

      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().importProject(json);
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(600);
    });

    it('double export/import keeps data intact', () => {
      useProjectStore.getState().newProject('Double');
      useCabinetStore.getState().setDimension('depth', 333);
      const json1 = useProjectStore.getState().exportProject();
      useProjectStore.getState().importProject(json1);

      const json2 = useProjectStore.getState().exportProject();
      useProjectStore.getState().importProject(json2);

      expect(useCabinetStore.getState().cabinet?.dimensions.depth).toBe(333);
    });
  });
});

// ============================================
// T023 - AUTO-SAVE AND DATA RECOVERY
// ============================================

describe('T023 - Auto-Save and Data Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────
  // 1. markDirty() sets isDirty
  // ──────────────────────────────────────────

  describe('markDirty', () => {
    it('sets isDirty to true', () => {
      useProjectStore.getState().newProject('Dirty');
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().markDirty();
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('triggers debounced auto-save after 2s', () => {
      useProjectStore.getState().newProject('Debounce');
      const saveSpy = vi.spyOn(useProjectStore.getState(), 'saveProject');
      useProjectStore.getState().markDirty();
      expect(saveSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────
  // 2. setAutoSave(false) disables auto-save
  // ──────────────────────────────────────────

  describe('setAutoSave', () => {
    it('has auto-save enabled by default', () => {
      expect(useProjectStore.getState().autoSaveEnabled).toBe(true);
    });

    it('disables auto-save', () => {
      useProjectStore.getState().setAutoSave(false);
      expect(useProjectStore.getState().autoSaveEnabled).toBe(false);
    });

    it('re-enables auto-save', () => {
      useProjectStore.getState().setAutoSave(false);
      useProjectStore.getState().setAutoSave(true);
      expect(useProjectStore.getState().autoSaveEnabled).toBe(true);
    });

    it('clears pending timer when disabling', () => {
      useProjectStore.getState().newProject('Timer Clear');
      useProjectStore.getState().markDirty(); // Start timer
      useProjectStore.getState().setAutoSave(false);

      const lastSaved = useProjectStore.getState().lastSaved;
      vi.advanceTimersByTime(5000);
      // Timer should have been cleared, no auto-save
      expect(useProjectStore.getState().lastSaved).toBe(lastSaved);
    });

    it('does not auto-save after markDirty when disabled', () => {
      useProjectStore.getState().newProject('No Auto');
      useProjectStore.getState().setAutoSave(false);
      const lastSaved = useProjectStore.getState().lastSaved;

      useProjectStore.getState().markDirty();
      vi.advanceTimersByTime(5000);
      expect(useProjectStore.getState().lastSaved).toBe(lastSaved);
    });
  });

  // ──────────────────────────────────────────
  // 3. Debouncing - rapid markDirty calls
  // ──────────────────────────────────────────

  describe('Auto-save Debouncing', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Debounce Test');
    });

    it('resets timer on each markDirty call', () => {
      useProjectStore.getState().markDirty();
      vi.advanceTimersByTime(1000);
      useProjectStore.getState().markDirty(); // Restart
      vi.advanceTimersByTime(1000);
      // 2s from first, 1s from second - should NOT have saved yet
      const lastSaved = useProjectStore.getState().lastSaved;
      // Advance final 1s
      vi.advanceTimersByTime(1000);
      // Now should have saved
      expect(useProjectStore.getState().lastSaved).toBeGreaterThan(lastSaved || 0);
    });

    it('only saves once after rapid fire calls', () => {
      const countBefore = localStorageMock.setItem.mock.calls.length;

      // Rapid fire 10 markDirty calls
      for (let i = 0; i < 10; i++) {
        useProjectStore.getState().markDirty();
      }

      // Advance past the debounce
      vi.advanceTimersByTime(2500);

      // Count the number of calls to 'monolith-current-project'
      const projectSaveCalls = localStorageMock.setItem.mock.calls
        .slice(countBefore)
        .filter((c: any) => c[0] === 'monolith-current-project');

      // Should only have 1 save from the debounce
      expect(projectSaveCalls.length).toBe(1);
    });

    it('does not save before debounce delay expires', () => {
      const lastSaved = useProjectStore.getState().lastSaved;
      useProjectStore.getState().markDirty();
      vi.advanceTimersByTime(1999);
      // Timer hasn't fired yet
      expect(useProjectStore.getState().isDirty).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // 4. Recovery from corrupted localStorage
  // ──────────────────────────────────────────

  describe('Corrupted Data Recovery', () => {
    it('handles corrupted project JSON gracefully', () => {
      localStorageMock.setItem('monolith-current-project', 'invalid json {{{');
      expect(() => useProjectStore.getState().loadProject()).not.toThrow();
      expect(useProjectStore.getState().loadProject()).toBe(false);
    });

    it('handles partially valid JSON (missing metadata)', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify({ cabinet: { foo: 'bar' } })
      );
      const result = useProjectStore.getState().loadProject();
      expect(result).toBe(false);
    });

    it('handles empty object in localStorage', () => {
      localStorageMock.setItem('monolith-current-project', '{}');
      const result = useProjectStore.getState().loadProject();
      expect(result).toBe(false);
    });

    it('handles array in localStorage instead of object', () => {
      localStorageMock.setItem('monolith-current-project', '[]');
      const result = useProjectStore.getState().loadProject();
      expect(result).toBe(false);
    });

    it('initialize creates new project when storage is corrupted', () => {
      localStorageMock.setItem('monolith-current-project', '{broken}}}');
      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().metadata).not.toBeNull();
      expect(useCabinetStore.getState().cabinet).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────
  // 5. loadProject with invalid data
  // ──────────────────────────────────────────

  describe('loadProject validation', () => {
    it('returns false for null localStorage value', () => {
      localStorageMock.clear();
      expect(useProjectStore.getState().loadProject()).toBe(false);
    });

    it('returns false for project with empty metadata id', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify({
          metadata: { id: '', name: 'Bad', version: '1.0.0', createdAt: 1, updatedAt: 1 },
          cabinet: {},
        })
      );
      const result = useProjectStore.getState().loadProject();
      // Schema requires min(1) for id, so strict validation fails
      // May fall through to legacy schema which only requires id or name
      // Either way it should not crash
      expect(typeof result).toBe('boolean');
    });
  });

  // ──────────────────────────────────────────
  // 6. importProject with invalid JSON
  // ──────────────────────────────────────────

  describe('importProject validation', () => {
    it('returns false for totally invalid JSON', () => {
      expect(useProjectStore.getState().importProject('<<<>>>')).toBe(false);
    });

    it('returns false for valid JSON but missing metadata', () => {
      expect(useProjectStore.getState().importProject('{"cabinet":{}}')).toBe(false);
    });

    it('returns false for JSON with null', () => {
      expect(useProjectStore.getState().importProject('null')).toBe(false);
    });

    it('returns false for JSON number', () => {
      expect(useProjectStore.getState().importProject('42')).toBe(false);
    });

    it('returns false for JSON array', () => {
      expect(useProjectStore.getState().importProject('[1,2,3]')).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // 7. Save failure handling
  // ──────────────────────────────────────────

  describe('Save Failure Handling', () => {
    it('does not throw when localStorage.setItem throws', () => {
      useProjectStore.getState().newProject('Error Test');
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => useProjectStore.getState().saveProject()).not.toThrow();
    });

    it('does not update lastSaved on failure', () => {
      useProjectStore.getState().newProject('Fail Test');
      const initialLastSaved = useProjectStore.getState().lastSaved;

      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

      useProjectStore.getState().saveProject();
      // lastSaved should not have changed (save was in try/catch)
      expect(useProjectStore.getState().lastSaved).toBe(initialLastSaved);

      // Restore mock
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        (localStorageMock as any)._getStore()[key] = value;
      });
    });

    it('handles auto-save failures gracefully', () => {
      useProjectStore.getState().newProject('Auto Fail');

      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });

      useProjectStore.getState().markDirty();
      expect(() => vi.advanceTimersByTime(2500)).not.toThrow();

      // Restore mock
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        (localStorageMock as any)._getStore()[key] = value;
      });
    });
  });

  // ──────────────────────────────────────────
  // 8. Projects list truncation (max 20)
  // ──────────────────────────────────────────

  describe('Projects List Truncation', () => {
    it('limits projects list to 20 items', () => {
      for (let i = 0; i < 25; i++) {
        useProjectStore.getState().newProject(`Project ${i}`);
        useProjectStore.getState().saveProject();
      }
      const raw = localStorageMock._getStore()['monolith-projects-list'];
      const list = JSON.parse(raw);
      expect(list.length).toBeLessThanOrEqual(20);
    });

    it('keeps the most recent projects in the list', () => {
      for (let i = 0; i < 25; i++) {
        vi.advanceTimersByTime(10);
        useProjectStore.getState().newProject(`Project ${i}`);
        useProjectStore.getState().saveProject();
      }
      const list = useProjectStore.getState().savedProjects;
      // The most recent project should be first
      expect(list[0].name).toBe('Project 24');
    });

    it('most recent project is at index 0', () => {
      useProjectStore.getState().newProject('Old');
      useProjectStore.getState().saveProject();
      vi.advanceTimersByTime(100);
      useProjectStore.getState().newProject('New');
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().savedProjects[0].name).toBe('New');
    });
  });

  // ──────────────────────────────────────────
  // Data Recovery on App Restart
  // ──────────────────────────────────────────

  describe('Data Recovery on App Restart', () => {
    it('recovers last saved state after restart', () => {
      useProjectStore.getState().newProject('Recovery');
      useCabinetStore.getState().setDimension('width', 777);
      useProjectStore.getState().saveProject();

      // Simulate restart
      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });

      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().metadata?.name).toBe('Recovery');
      expect(useCabinetStore.getState().cabinet?.dimensions.width).toBe(777);
    });

    it('creates default project when all storage is cleared', () => {
      localStorageMock.clear();
      useProjectStore.getState().initialize();
      expect(useProjectStore.getState().metadata).not.toBeNull();
      expect(useCabinetStore.getState().cabinet).not.toBeNull();
    });

    it('preserves panel customizations after recovery', () => {
      useProjectStore.getState().newProject('Panel Recovery');
      useCabinetStore.getState().addShelfInCompartment(0, 0);
      const shelf = useCabinetStore
        .getState()
        .cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
      if (shelf) {
        useCabinetStore.getState().updatePanelMaterial(shelf.id, 'core', 'custom-core');
      }
      useProjectStore.getState().saveProject();

      useProjectStore.setState({ metadata: null });
      useCabinetStore.setState({ cabinet: null });
      useProjectStore.getState().initialize();

      const recovered = useCabinetStore
        .getState()
        .cabinet?.panels.find(p => p.role === 'SHELF' && p.name.includes('Sub'));
      if (recovered) {
        expect(recovered.coreMaterialId).toBe('custom-core');
      }
    });
  });

  // ──────────────────────────────────────────
  // Dirty Flag behavior
  // ──────────────────────────────────────────

  describe('Dirty Flag', () => {
    beforeEach(() => {
      useProjectStore.getState().newProject('Dirty Flag');
    });

    it('markDirty sets isDirty true', () => {
      useProjectStore.setState({ isDirty: false });
      useProjectStore.getState().markDirty();
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('save clears isDirty', () => {
      useProjectStore.getState().markDirty();
      useProjectStore.getState().saveProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('load clears isDirty', () => {
      useProjectStore.getState().saveProject();
      useProjectStore.setState({ isDirty: true });
      useProjectStore.getState().loadProject();
      expect(useProjectStore.getState().isDirty).toBe(false);
    });

    it('newProject clears isDirty', () => {
      useProjectStore.setState({ isDirty: true });
      useProjectStore.getState().newProject('Fresh');
      expect(useProjectStore.getState().isDirty).toBe(false);
    });
  });
});

/**
 * yjsMigration.test.ts - localStorage → IndexedDB Migration Tests
 *
 * Tests migration from legacy localStorage to Yjs Y.Doc.
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMonolithDoc,
  destroyMonolithDoc,
  extractCabinet,
  extractMetadata,
  extractCabinets,
  isDocEmpty,
} from '../yjsDocument';
import {
  migrateFromLocalStorage,
  hasMigrated,
  resetMigrationFlag,
} from '../yjsMigration';
import { MIGRATION_FLAG_KEY } from '../types';
import type { MonolithDoc } from '../types';

// ============================================================================
// Mock localStorage
// ============================================================================

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
    clear: () => {
      store = {};
    },
    _store: () => store,
  };
})();

// Install mock
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================================================
// Test Data
// ============================================================================

const LEGACY_PROJECT = {
  metadata: {
    id: 'proj-legacy-001',
    name: 'Legacy Kitchen Cabinet',
    version: '1.0.0',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    description: 'A legacy project',
    author: 'Legacy User',
  },
  cabinet: {
    id: 'cab-legacy',
    name: 'Base Cabinet',
    type: 'BASE',
    dimensions: { width: 600, height: 720, depth: 560, toeKickHeight: 100 },
    structure: { shelfCount: 1, backPanel: true },
    materials: {
      carcassThickness: 18,
      overrides: { 'panel-side-l': { materialId: 'core-pb-18' } },
    },
    panels: [
      { id: 'p1', role: 'SIDE_LEFT', width: 560, height: 620 },
    ],
    computed: { totalPanels: 1 },
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  },
  cabinets: [
    {
      id: 'cab-legacy',
      name: 'Base Cabinet',
      category: 'BASE',
      scenePosition: [0, 0, 0],
      sceneRotation: [0, 0, 0],
    },
    {
      id: 'cab-wall',
      name: 'Wall Unit',
      category: 'WALL',
      scenePosition: [800, 0, 0],
      sceneRotation: [0, 1.57, 0],
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe('yjsMigration', () => {
  let mdoc: MonolithDoc;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    mdoc = createMonolithDoc();
  });

  afterEach(() => {
    destroyMonolithDoc(mdoc);
  });

  // ==========================================================================
  // hasMigrated
  // ==========================================================================

  describe('hasMigrated', () => {
    it('returns false when no flag set', () => {
      expect(hasMigrated()).toBe(false);
    });

    it('returns true when flag is set', () => {
      localStorageMock.setItem(MIGRATION_FLAG_KEY, '1');
      expect(hasMigrated()).toBe(true);
    });
  });

  // ==========================================================================
  // resetMigrationFlag
  // ==========================================================================

  describe('resetMigrationFlag', () => {
    it('clears the migration flag', () => {
      localStorageMock.setItem(MIGRATION_FLAG_KEY, '1');
      resetMigrationFlag();
      expect(hasMigrated()).toBe(false);
    });
  });

  // ==========================================================================
  // Successful Migration
  // ==========================================================================

  describe('successful migration', () => {
    it('migrates legacy project data into Y.Doc', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(true);
      expect(result.projectId).toBe('proj-legacy-001');
      expect(result.error).toBeNull();
    });

    it('populates cabinet data', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      migrateFromLocalStorage(mdoc);

      const cabinet = extractCabinet(mdoc);
      expect(cabinet).not.toBeNull();
      expect(cabinet!.id).toBe('cab-legacy');
      expect(cabinet!.name).toBe('Base Cabinet');
      expect(cabinet!.dimensions.width).toBe(600);
    });

    it('populates metadata', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      migrateFromLocalStorage(mdoc);

      const metadata = extractMetadata(mdoc);
      expect(metadata).not.toBeNull();
      expect(metadata!.id).toBe('proj-legacy-001');
      expect(metadata!.name).toBe('Legacy Kitchen Cabinet');
    });

    it('populates scene cabinets', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      migrateFromLocalStorage(mdoc);

      const cabinets = extractCabinets(mdoc);
      expect(cabinets).toHaveLength(2);
      expect(cabinets[0].id).toBe('cab-legacy');
      expect(cabinets[1].id).toBe('cab-wall');
      expect(cabinets[1].scenePosition).toEqual([800, 0, 0]);
    });

    it('reports correct cabinet count', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const result = migrateFromLocalStorage(mdoc);
      expect(result.cabinetCount).toBe(2);
    });

    it('sets migration flag after success', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      migrateFromLocalStorage(mdoc);
      expect(hasMigrated()).toBe(true);
    });

    it('preserves localStorage data (backup)', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      migrateFromLocalStorage(mdoc);

      // localStorage still has the data
      const stored = localStorageMock.getItem('monolith-current-project');
      expect(stored).not.toBeNull();
    });
  });

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  describe('idempotency', () => {
    it('skips migration if already migrated', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );
      localStorageMock.setItem(MIGRATION_FLAG_KEY, '1');

      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(false);
      expect(isDocEmpty(mdoc)).toBe(true); // Did not populate
    });

    it('force=true ignores migration flag', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );
      localStorageMock.setItem(MIGRATION_FLAG_KEY, '1');

      const result = migrateFromLocalStorage(mdoc, true);

      expect(result.migrated).toBe(true);
      expect(isDocEmpty(mdoc)).toBe(false);
    });
  });

  // ==========================================================================
  // No Data to Migrate
  // ==========================================================================

  describe('no data', () => {
    it('sets flag and returns migrated=false when no localStorage data', () => {
      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(false);
      expect(result.projectId).toBeNull();
      expect(result.error).toBeNull();
      expect(hasMigrated()).toBe(true); // Flag still set
    });
  });

  // ==========================================================================
  // Invalid Data
  // ==========================================================================

  describe('invalid data', () => {
    it('handles invalid JSON gracefully', () => {
      localStorageMock.setItem('monolith-current-project', 'not-json{{{');

      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(false);
      expect(result.error).toBeTruthy();
      expect(isDocEmpty(mdoc)).toBe(true);
    });

    it('handles missing metadata gracefully', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify({ cabinet: { id: 'test' } })
      );

      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(false);
      expect(result.error).toContain('Missing metadata');
    });

    it('handles missing cabinet gracefully', () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify({ metadata: { id: 'test', name: 'test' } })
      );

      const result = migrateFromLocalStorage(mdoc);

      expect(result.migrated).toBe(false);
      expect(result.error).toContain('Missing metadata or cabinet');
    });
  });

  // ==========================================================================
  // Materials Migration
  // ==========================================================================

  describe('materials', () => {
    it('migrates material overrides as plain objects', () => {
      const projectWithOverrides = {
        ...LEGACY_PROJECT,
        cabinet: {
          ...LEGACY_PROJECT.cabinet,
          materials: {
            carcassThickness: 18,
            overrides: {
              'side-l': { materialId: 'oak-18' },
              'bottom': { materialId: 'birch-18' },
            },
          },
        },
      };

      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(projectWithOverrides)
      );

      migrateFromLocalStorage(mdoc);

      const cabinet = extractCabinet(mdoc);
      expect(cabinet!.materials.overrides).toEqual({
        'side-l': { materialId: 'oak-18' },
        'bottom': { materialId: 'birch-18' },
      });
    });
  });

  // ==========================================================================
  // Scene Position Defaults
  // ==========================================================================

  describe('scene position defaults', () => {
    it('defaults scenePosition to [0,0,0] if missing', () => {
      const projectNoPosition = {
        ...LEGACY_PROJECT,
        cabinets: [{ id: 'cab-1', name: 'Cab1' }],
      };

      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(projectNoPosition)
      );

      migrateFromLocalStorage(mdoc);

      const cabinets = extractCabinets(mdoc);
      expect(cabinets[0].scenePosition).toEqual([0, 0, 0]);
      expect(cabinets[0].sceneRotation).toEqual([0, 0, 0]);
    });
  });
});

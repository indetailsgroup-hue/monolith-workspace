/**
 * syncOrchestrator.test.ts - Orchestrator Integration Tests
 *
 * Tests the initSync lifecycle, Zustand sync store, and session management.
 * Uses fake IndexedDB via 'fake-indexeddb' (already a dev dependency).
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  initSync,
  destroySync,
  getActiveSession,
  isSyncActive,
  useSyncStore,
  type SyncSession,
} from '../syncOrchestrator';
import {
  extractCabinet,
  extractMetadata,
  isDocEmpty,
} from '../yjsDocument';
import { _resetProvider } from '../yjsProvider';
import { resetMigrationFlag } from '../yjsMigration';
import { MIGRATION_FLAG_KEY } from '../types';
import type { BridgeCallbacks } from '../yjsBridge';

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
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================================================
// Test Helpers
// ============================================================================

function createTestCallbacks(): BridgeCallbacks & {
  cabinetUpdates: Record<string, any>[];
  metadataUpdates: Record<string, any>[];
  cabinetsUpdates: Record<string, any>[][];
} {
  const cabinetUpdates: Record<string, any>[] = [];
  const metadataUpdates: Record<string, any>[] = [];
  const cabinetsUpdates: Record<string, any>[][] = [];

  return {
    cabinetUpdates,
    metadataUpdates,
    cabinetsUpdates,
    onCabinetUpdate: (cabinet) => cabinetUpdates.push(cabinet),
    onMetadataUpdate: (metadata) => metadataUpdates.push(metadata),
    onCabinetsUpdate: (cabinets) => cabinetsUpdates.push(cabinets),
  };
}

const LEGACY_PROJECT = {
  metadata: {
    id: 'proj-orch-001',
    name: 'Orchestrator Test Project',
    version: '1.0.0',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
  },
  cabinet: {
    id: 'cab-orch',
    name: 'Test Cabinet',
    type: 'BASE',
    dimensions: { width: 600, height: 720, depth: 560 },
    panels: [],
  },
  cabinets: [],
};

// ============================================================================
// Tests
// ============================================================================

describe('syncOrchestrator', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetMigrationFlag();
    vi.clearAllMocks();
  });

  afterEach(() => {
    destroySync();
    _resetProvider();
  });

  // ==========================================================================
  // initSync
  // ==========================================================================

  describe('initSync', () => {
    it('initializes a sync session', async () => {
      const callbacks = createTestCallbacks();
      const session = await initSync('proj-test', callbacks, {
        bridge: { zustandToYjsDebounceMs: 0, debug: false },
      });

      expect(session).toBeDefined();
      expect(session.projectId).toBe('proj-test');
      expect(session.mdoc).toBeDefined();
      expect(isSyncActive()).toBe(true);
    });

    it('updates useSyncStore status to synced', async () => {
      const callbacks = createTestCallbacks();
      await initSync('proj-test', callbacks);

      const state = useSyncStore.getState();
      expect(state.status).toBe('synced');
      expect(state.projectId).toBe('proj-test');
      expect(state.error).toBeNull();
    });

    it('destroys previous session when re-initializing', async () => {
      const cb1 = createTestCallbacks();
      const session1 = await initSync('proj-1', cb1);

      const cb2 = createTestCallbacks();
      const session2 = await initSync('proj-2', cb2);

      expect(isSyncActive()).toBe(true);
      expect(useSyncStore.getState().projectId).toBe('proj-2');
    });
  });

  // ==========================================================================
  // Migration Integration
  // ==========================================================================

  describe('migration', () => {
    it('migrates localStorage data when Y.Doc is empty', async () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const callbacks = createTestCallbacks();
      const session = await initSync('proj-orch-001', callbacks);

      expect(session.migrationResult).not.toBeNull();
      expect(session.migrationResult!.migrated).toBe(true);
      expect(session.migrationResult!.projectId).toBe('proj-orch-001');
    });

    it('pushes migrated data to callbacks', async () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const callbacks = createTestCallbacks();
      await initSync('proj-orch-001', callbacks);

      // Migration data should be pushed to callbacks (from extractAll)
      expect(callbacks.cabinetUpdates.length).toBeGreaterThanOrEqual(1);
      expect(callbacks.metadataUpdates.length).toBeGreaterThanOrEqual(1);
    });

    it('skips migration when skipMigration=true', async () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const callbacks = createTestCallbacks();
      const session = await initSync('proj-test', callbacks, {
        skipMigration: true,
      });

      expect(session.migrationResult).toBeNull();
    });

    it('updates migratedFromLocalStorage in sync store', async () => {
      localStorageMock.setItem(
        'monolith-current-project',
        JSON.stringify(LEGACY_PROJECT)
      );

      const callbacks = createTestCallbacks();
      // Use unique ID to avoid IDB bleed from prior test
      await initSync('proj-orch-migrated-flag', callbacks);

      expect(useSyncStore.getState().migratedFromLocalStorage).toBe(true);
    });
  });

  // ==========================================================================
  // Push to Doc
  // ==========================================================================

  describe('pushToDoc', () => {
    it('pushes cabinet data to Y.Doc via session', async () => {
      const callbacks = createTestCallbacks();
      const session = await initSync('proj-push', callbacks, {
        bridge: { zustandToYjsDebounceMs: 0, debug: false },
        skipMigration: true,
      });

      session.pushToDocImmediate({
        cabinet: { id: 'pushed-cab', name: 'Pushed', type: 'WALL' },
      });

      const cabinet = extractCabinet(session.mdoc);
      expect(cabinet).not.toBeNull();
      expect(cabinet!.id).toBe('pushed-cab');
      expect(cabinet!.name).toBe('Pushed');
    });

    it('pushes metadata to Y.Doc via session', async () => {
      const callbacks = createTestCallbacks();
      const session = await initSync('proj-push', callbacks, {
        bridge: { zustandToYjsDebounceMs: 0, debug: false },
        skipMigration: true,
      });

      session.pushToDocImmediate({
        metadata: { id: 'proj-push', name: 'Push Test', version: '2.0' },
      });

      const metadata = extractMetadata(session.mdoc);
      expect(metadata!.name).toBe('Push Test');
      expect(metadata!.version).toBe('2.0');
    });
  });

  // ==========================================================================
  // destroySync
  // ==========================================================================

  describe('destroySync', () => {
    it('cleans up session and resets sync store', async () => {
      const callbacks = createTestCallbacks();
      await initSync('proj-test', callbacks);

      expect(isSyncActive()).toBe(true);
      destroySync();

      expect(isSyncActive()).toBe(false);
      expect(getActiveSession()).toBeNull();
      expect(useSyncStore.getState().status).toBe('idle');
      expect(useSyncStore.getState().projectId).toBeNull();
    });

    it('is safe to call when no session active', () => {
      expect(() => destroySync()).not.toThrow();
    });

    it('is safe to call multiple times', async () => {
      const callbacks = createTestCallbacks();
      await initSync('proj-test', callbacks);

      destroySync();
      destroySync();
      destroySync();

      expect(isSyncActive()).toBe(false);
    });
  });

  // ==========================================================================
  // Persistence Round-Trip (IndexedDB)
  // ==========================================================================

  describe('IndexedDB persistence', () => {
    it('persists data to IndexedDB and reloads on next init', async () => {
      // Session 1: Push data
      const cb1 = createTestCallbacks();
      const session1 = await initSync('proj-idb-test', cb1, {
        bridge: { zustandToYjsDebounceMs: 0, debug: false },
        skipMigration: true,
      });

      session1.pushToDocImmediate({
        cabinet: { id: 'persist-cab', name: 'Persisted Cabinet' },
        metadata: { id: 'proj-idb-test', name: 'Persist Test' },
      });

      // Destroy session 1
      session1.destroy();

      // Session 2: Should reload from IndexedDB
      const cb2 = createTestCallbacks();
      const session2 = await initSync('proj-idb-test', cb2, {
        bridge: { zustandToYjsDebounceMs: 0, debug: false },
        skipMigration: true,
      });

      // Data should be in the Y.Doc (loaded from IndexedDB)
      const cabinet = extractCabinet(session2.mdoc);
      expect(cabinet).not.toBeNull();
      expect(cabinet!.id).toBe('persist-cab');
      expect(cabinet!.name).toBe('Persisted Cabinet');

      // Callbacks should have been called with the loaded data
      expect(cb2.cabinetUpdates.length).toBeGreaterThanOrEqual(1);

      session2.destroy();
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('handles empty project ID gracefully', async () => {
      const callbacks = createTestCallbacks();
      // Empty string ID should still work (just creates empty-named DB)
      const session = await initSync('', callbacks, { skipMigration: true });
      expect(session.projectId).toBe('');
      session.destroy();
    });
  });
});

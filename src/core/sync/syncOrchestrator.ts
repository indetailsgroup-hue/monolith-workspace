/**
 * syncOrchestrator.ts - Sync Lifecycle Orchestrator
 *
 * High-level orchestrator that manages the complete sync lifecycle:
 *
 * ```
 * initSync(projectId)
 *   → Create Y.Doc
 *   → Connect IndexedDB provider
 *   → Wait for initial sync
 *   → If empty: migrate from localStorage
 *   → Set up Zustand ↔ Yjs bridge
 *   → Return controls
 * ```
 *
 * ## Usage (in app initialization):
 * ```typescript
 * const sync = await initSync('proj-123', {
 *   onCabinetUpdate: (cabinet) => useCabinetStore.setState({ cabinet }),
 *   onMetadataUpdate: (metadata) => useProjectStore.setState({ metadata }),
 *   onCabinetsUpdate: (cabinets) => useCabinetStore.setState({ cabinets }),
 * });
 *
 * // Push local changes:
 * sync.pushToDoc({ cabinet: serializeCabinet(currentCabinet) });
 *
 * // Cleanup:
 * sync.destroy();
 * ```
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { create } from 'zustand';
import {
  createMonolithDoc,
  destroyMonolithDoc,
  isDocEmpty,
  extractAll,
} from './yjsDocument';
import { connect, disconnect } from './yjsProvider';
import { setupBridge, disposeBridge, type BridgeCallbacks } from './yjsBridge';
import { migrateFromLocalStorage, hasMigrated } from './yjsMigration';
import type {
  MonolithDoc,
  SyncState,
  PersistenceConfig,
  BridgeConfig,
  MigrationResult,
} from './types';
import {
  DEFAULT_PERSISTENCE_CONFIG,
  DEFAULT_BRIDGE_CONFIG,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Sync session returned by initSync.
 */
export interface SyncSession {
  /** The underlying Y.Doc */
  mdoc: MonolithDoc;
  /** Project ID */
  projectId: string;
  /** Migration result (null if not attempted) */
  migrationResult: MigrationResult | null;
  /** Push Zustand state changes to Y.Doc (debounced) */
  pushToDoc: (data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }) => void;
  /** Push immediately (no debounce) */
  pushToDocImmediate: (data: {
    cabinet?: Record<string, any>;
    metadata?: Record<string, any>;
    cabinets?: Record<string, any>[];
    materials?: Record<string, any>;
  }) => void;
  /** Destroy the sync session and clean up all resources */
  destroy: () => void;
}

/**
 * Configuration for initSync.
 */
export interface InitSyncConfig {
  persistence?: PersistenceConfig;
  bridge?: BridgeConfig;
  /** Skip migration even if not done yet */
  skipMigration?: boolean;
}

// ============================================================================
// Sync State Store (Zustand)
// ============================================================================

/**
 * Zustand store for sync UI state.
 *
 * Exposed to React components via `useSyncStore`.
 */
export const useSyncStore = create<SyncState>()(() => ({
  status: 'idle',
  projectId: null,
  lastSavedAt: null,
  pendingChanges: 0,
  error: null,
  migratedFromLocalStorage: false,
}));

// ============================================================================
// Active Session
// ============================================================================

let _activeSession: SyncSession | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize sync for a project.
 *
 * This is the main entry point for the sync system.
 *
 * ## Steps:
 * 1. Creates a Y.Doc
 * 2. Connects IndexedDB persistence (y-indexeddb)
 * 3. Waits for initial data load from IndexedDB
 * 4. If Y.Doc is empty and localStorage has data → migrates
 * 5. Sets up Zustand ↔ Yjs bridge with callbacks
 * 6. Returns SyncSession for ongoing sync
 *
 * @param projectId - Project to sync
 * @param callbacks - Callbacks for Y.Doc → Zustand direction
 * @param config - Optional sync configuration
 * @returns SyncSession with push/destroy methods
 */
export async function initSync(
  projectId: string,
  callbacks: BridgeCallbacks,
  config: InitSyncConfig = {}
): Promise<SyncSession> {
  const persistConfig = config.persistence ?? DEFAULT_PERSISTENCE_CONFIG;
  const bridgeConfig = config.bridge ?? DEFAULT_BRIDGE_CONFIG;

  // Destroy previous session if any
  if (_activeSession) {
    _activeSession.destroy();
    _activeSession = null;
  }

  // Update UI state
  useSyncStore.setState({
    status: 'loading',
    projectId,
    error: null,
  });

  try {
    // Step 1: Create Y.Doc
    const mdoc = createMonolithDoc();

    // Step 2: Connect IndexedDB provider
    const provider = connect(projectId, mdoc.doc, persistConfig);

    // Step 3: Wait for initial sync (loads existing IndexedDB data)
    await provider.whenSynced;

    // Step 4: Migration (if Y.Doc is empty)
    let migrationResult: MigrationResult | null = null;
    if (!config.skipMigration && isDocEmpty(mdoc)) {
      migrationResult = migrateFromLocalStorage(mdoc);
    }

    // Step 5: Set up bridge
    const bridge = setupBridge(mdoc, callbacks, bridgeConfig);

    // Step 6: If Y.Doc has data (from IndexedDB or migration), push to Zustand
    if (!isDocEmpty(mdoc)) {
      const data = extractAll(mdoc);
      if (data.cabinet) {
        callbacks.onCabinetUpdate(data.cabinet);
      }
      if (data.metadata) {
        callbacks.onMetadataUpdate(data.metadata);
      }
      if (data.cabinets.length > 0) {
        callbacks.onCabinetsUpdate(data.cabinets);
      }
      if (data.materials && callbacks.onMaterialsUpdate) {
        callbacks.onMaterialsUpdate(data.materials);
      }
    }

    // Update UI state
    useSyncStore.setState({
      status: 'synced',
      projectId,
      lastSavedAt: Date.now(),
      pendingChanges: 0,
      error: null,
      migratedFromLocalStorage: migrationResult?.migrated ?? false,
    });

    // Track doc updates for lastSavedAt
    const updateHandler = () => {
      useSyncStore.setState({
        lastSavedAt: Date.now(),
        pendingChanges: 0,
      });
    };
    mdoc.doc.on('afterTransaction', updateHandler);

    // Build session
    const session: SyncSession = {
      mdoc,
      projectId,
      migrationResult,
      pushToDoc: bridge.pushToDoc,
      pushToDocImmediate: bridge.pushToDocImmediate,
      destroy: () => {
        mdoc.doc.off('afterTransaction', updateHandler);
        bridge.dispose();
        disconnect();
        destroyMonolithDoc(mdoc);

        useSyncStore.setState({
          status: 'idle',
          projectId: null,
          lastSavedAt: null,
          pendingChanges: 0,
          error: null,
        });

        if (_activeSession === session) {
          _activeSession = null;
        }
      },
    };

    _activeSession = session;
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Sync] initSync failed:', message);

    useSyncStore.setState({
      status: 'error',
      error: message,
    });

    throw error;
  }
}

/**
 * Get the currently active sync session.
 *
 * @returns Active session or null
 */
export function getActiveSession(): SyncSession | null {
  return _activeSession;
}

/**
 * Destroy the active sync session.
 * Safe to call when no session is active (no-op).
 */
export function destroySync(): void {
  if (_activeSession) {
    _activeSession.destroy();
    _activeSession = null;
  }
}

/**
 * Check if sync is currently active.
 */
export function isSyncActive(): boolean {
  return _activeSession !== null;
}

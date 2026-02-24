/**
 * yjsProvider.ts - IndexedDB Persistence Provider
 *
 * Manages y-indexeddb provider for local persistence of the Y.Doc.
 * Each project gets its own IndexedDB database, keyed by project ID.
 *
 * ## Storage Model
 * ```
 * IndexedDB: monolith-yjs-{projectId}
 * └── y-indexeddb internal stores (updates, state vectors)
 * ```
 *
 * ## Lifecycle
 * 1. `connect(projectId, ydoc)` → opens IndexedDB, loads existing data
 * 2. Auto-flush: y-indexeddb persists every Y.Doc update automatically
 * 3. `disconnect()` → closes provider, releases IndexedDB
 *
 * @version 1.0.0 - T029 Phase 1
 */

import { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';
import {
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistenceConfig,
  type SyncStatus,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider instance with lifecycle methods.
 */
export interface PersistenceProvider {
  /** The y-indexeddb provider instance */
  provider: IndexeddbPersistence;
  /** Project ID this provider is connected to */
  projectId: string;
  /** Whether the provider has finished loading initial data */
  synced: boolean;
  /** Promise that resolves when initial sync is complete */
  whenSynced: Promise<void>;
  /** Disconnect and clean up */
  destroy: () => void;
}

// ============================================================================
// State
// ============================================================================

let _activeProvider: PersistenceProvider | null = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Connect a Y.Doc to IndexedDB persistence for a project.
 *
 * If already connected to a different project, disconnects first.
 * If already connected to the same project, returns existing provider.
 *
 * @param projectId - Project identifier (used as IndexedDB name suffix)
 * @param ydoc - Yjs document to persist
 * @param config - Persistence configuration
 * @returns PersistenceProvider with lifecycle methods
 */
export function connect(
  projectId: string,
  ydoc: Y.Doc,
  config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG
): PersistenceProvider {
  // Already connected to this project?
  if (_activeProvider && _activeProvider.projectId === projectId) {
    return _activeProvider;
  }

  // Disconnect existing provider if different project
  if (_activeProvider) {
    disconnect();
  }

  const dbName = `${config.dbPrefix}-${projectId}`;

  const provider = new IndexeddbPersistence(dbName, ydoc);

  let synced = false;

  const whenSynced = new Promise<void>((resolve) => {
    provider.once('synced', () => {
      synced = true;
      resolve();
    });
  });

  _activeProvider = {
    provider,
    projectId,
    get synced() {
      return synced;
    },
    whenSynced,
    destroy: () => {
      provider.destroy();
      if (_activeProvider?.projectId === projectId) {
        _activeProvider = null;
      }
    },
  };

  return _activeProvider;
}

/**
 * Disconnect the current persistence provider.
 *
 * Safe to call when no provider is connected (no-op).
 */
export function disconnect(): void {
  if (_activeProvider) {
    _activeProvider.destroy();
    _activeProvider = null;
  }
}

/**
 * Get the currently active provider, if any.
 *
 * @returns Active provider or null
 */
export function getActiveProvider(): PersistenceProvider | null {
  return _activeProvider;
}

/**
 * Check if currently connected to a project.
 *
 * @returns true if a provider is active
 */
export function isConnected(): boolean {
  return _activeProvider !== null;
}

/**
 * Get the current sync status.
 *
 * @returns SyncStatus based on provider state
 */
export function getSyncStatus(): SyncStatus {
  if (!_activeProvider) return 'idle';
  if (!_activeProvider.synced) return 'loading';
  return 'synced';
}

/**
 * Delete the IndexedDB database for a project.
 *
 * Use with caution — this permanently removes all local persistence data.
 *
 * @param projectId - Project to clear
 * @param config - Persistence configuration
 * @returns Promise that resolves when database is deleted
 */
export async function clearProjectData(
  projectId: string,
  config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG
): Promise<void> {
  // Disconnect if this is the active project
  if (_activeProvider?.projectId === projectId) {
    disconnect();
  }

  const dbName = `${config.dbPrefix}-${projectId}`;

  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn(`[Sync] IndexedDB "${dbName}" delete blocked — close other tabs`);
      // Still resolve, the delete will complete when other connections close
      resolve();
    };
  });
}

/**
 * List all Monolith Yjs databases in IndexedDB.
 *
 * Uses the IndexedDB databases() API (Chrome 71+, Firefox 126+).
 * Falls back to empty array if not supported.
 *
 * @param config - Persistence configuration
 * @returns Array of project IDs that have local data
 */
export async function listPersistedProjects(
  config: PersistenceConfig = DEFAULT_PERSISTENCE_CONFIG
): Promise<string[]> {
  if (!('databases' in indexedDB)) {
    // API not available — can't enumerate
    return [];
  }

  try {
    const databases = await indexedDB.databases();
    const prefix = `${config.dbPrefix}-`;
    return databases
      .map((db) => db.name)
      .filter((name): name is string => !!name && name.startsWith(prefix))
      .map((name) => name.slice(prefix.length));
  } catch {
    return [];
  }
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Reset provider state. For testing only.
 * @internal
 */
export function _resetProvider(): void {
  if (_activeProvider) {
    try {
      _activeProvider.destroy();
    } catch {
      // Ignore destroy errors during test cleanup
    }
  }
  _activeProvider = null;
}

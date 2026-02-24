/**
 * Cloud Sync Module - T029 Phase 1
 *
 * Local-first persistence layer using Yjs CRDTs + IndexedDB.
 *
 * ## Architecture
 * ```
 * Zustand Stores ←→ Bridge ←→ Y.Doc ←→ IndexedDB (y-indexeddb)
 * ```
 *
 * ## Public API
 *
 * ### Orchestrator (main entry point)
 * - `initSync(projectId, callbacks)` - Start sync for a project
 * - `destroySync()` - Stop syncing
 * - `useSyncStore` - React hook for sync status UI
 *
 * ### Document
 * - `createMonolithDoc()` - Create a new Y.Doc
 * - `populateDoc()` - Fill Y.Doc from plain objects
 * - `extractAll()` - Read all data from Y.Doc
 *
 * ### Provider
 * - `connect()` / `disconnect()` - IndexedDB provider lifecycle
 * - `clearProjectData()` - Delete project's IndexedDB
 *
 * ### Bridge
 * - `setupBridge()` - Wire Zustand ↔ Y.Doc observers
 * - `disposeBridge()` - Tear down bridge
 *
 * ### Migration
 * - `migrateFromLocalStorage()` - One-time localStorage → Y.Doc
 * - `hasMigrated()` - Check migration status
 *
 * @module core/sync
 * @version 1.0.0 - T029 Phase 1
 */

// Orchestrator (primary API)
export {
  initSync,
  destroySync,
  getActiveSession,
  isSyncActive,
  useSyncStore,
  type SyncSession,
  type InitSyncConfig,
} from './syncOrchestrator';

// Document
export {
  createMonolithDoc,
  destroyMonolithDoc,
  populateDoc,
  extractCabinet,
  extractMetadata,
  extractCabinets,
  extractMaterials,
  extractAll,
  getSnapshot,
  applyUpdate,
  isDocEmpty,
} from './yjsDocument';

// Provider
export {
  connect,
  disconnect,
  getActiveProvider,
  isConnected,
  getSyncStatus,
  clearProjectData,
  listPersistedProjects,
  type PersistenceProvider,
} from './yjsProvider';

// Bridge
export {
  setupBridge,
  disposeBridge,
  isBridgeActive,
  type BridgeCallbacks,
  type BridgeDisposer,
} from './yjsBridge';

// Migration
export {
  migrateFromLocalStorage,
  hasMigrated,
  resetMigrationFlag,
} from './yjsMigration';

// Types
export type {
  SyncStatus,
  SyncState,
  MonolithDoc,
  SerializedCabinet,
  SerializedMetadata,
  SerializedSceneCabinet,
  PersistenceConfig,
  BridgeConfig,
  MigrationResult,
} from './types';

/**
 * types.ts - Cloud Sync Types
 *
 * Type definitions for the Yjs-based sync layer.
 * Phase 1: Local persistence only (IndexedDB via y-indexeddb).
 *
 * @version 1.0.0 - T029 Phase 1
 */

import type * as Y from 'yjs';

// ============================================================================
// Sync Status
// ============================================================================

/**
 * Current sync connection state.
 *
 * Phase 1 only uses 'local' (IndexedDB).
 * Phase 3+ will add 'connecting' | 'connected' | 'disconnected'.
 */
export type SyncStatus =
  | 'idle'           // Not yet initialized
  | 'loading'        // Loading from IndexedDB
  | 'synced'         // Local state synced to IndexedDB
  | 'error';         // Error occurred

/**
 * Sync provider state exposed to UI.
 */
export interface SyncState {
  /** Current sync status */
  status: SyncStatus;
  /** Active project ID being synced */
  projectId: string | null;
  /** Last successful save timestamp (epoch ms) */
  lastSavedAt: number | null;
  /** Number of pending local changes not yet flushed */
  pendingChanges: number;
  /** Error message if status is 'error' */
  error: string | null;
  /** Whether migration from localStorage was performed */
  migratedFromLocalStorage: boolean;
}

// ============================================================================
// Document Structure Types
// ============================================================================

/**
 * Monolith Y.Doc shared type names.
 *
 * These are the top-level keys in the Y.Doc:
 * - `cabinet`: Y.Map<any> - Active cabinet data (dimensions, structure, etc.)
 * - `metadata`: Y.Map<any> - Project metadata (name, version, timestamps)
 * - `cabinets`: Y.Array<Y.Map<any>> - Scene cabinet list with positions
 * - `materials`: Y.Map<any> - Material overrides and defaults
 */
export const DOC_KEYS = {
  CABINET: 'cabinet',
  METADATA: 'metadata',
  CABINETS: 'cabinets',
  MATERIALS: 'materials',
} as const;

/**
 * MonolithDoc: Typed wrapper around Y.Doc.
 *
 * Provides named access to each shared type in the document.
 * Each shared type corresponds to a section of the project data.
 */
export interface MonolithDoc {
  /** The underlying Yjs document */
  doc: Y.Doc;
  /** Active cabinet state (dimensions, structure, panels, hardware) */
  cabinet: Y.Map<any>;
  /** Project metadata (id, name, version, timestamps) */
  metadata: Y.Map<any>;
  /** Scene cabinets list (id, name, position, rotation) */
  cabinets: Y.Array<Y.Map<any>>;
  /** Material system data (defaults, overrides) */
  materials: Y.Map<any>;
}

// ============================================================================
// Serialization Types
// ============================================================================

/**
 * Serialized cabinet data for Yjs storage.
 *
 * Matches the shape saved by useProjectStore.saveProject() but with
 * Map objects converted to plain objects for CRDT compatibility.
 */
export interface SerializedCabinet {
  id: string;
  name: string;
  type: string;
  dimensions: Record<string, number>;
  structure: Record<string, any>;
  materials: Record<string, any>;
  manufacturing: Record<string, any>;
  hardware?: Record<string, any>;
  hardwareOverrides?: Record<string, any>;
  panels: Record<string, any>[];
  computed: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Serialized metadata for Yjs storage.
 */
export interface SerializedMetadata {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  author?: string;
}

/**
 * Serialized scene cabinet entry.
 */
export interface SerializedSceneCabinet {
  id: string;
  name: string;
  category?: string;
  scenePosition: [number, number, number];
  sceneRotation: [number, number, number];
}

// ============================================================================
// Provider Config
// ============================================================================

/**
 * IndexedDB persistence provider configuration.
 */
export interface PersistenceConfig {
  /** IndexedDB database name prefix */
  dbPrefix: string;
  /** Whether to auto-flush on every change (default: true) */
  autoFlush: boolean;
}

/**
 * Default persistence configuration.
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  dbPrefix: 'monolith-yjs',
  autoFlush: true,
};

// ============================================================================
// Bridge Config
// ============================================================================

/**
 * Configuration for the Zustand ↔ Yjs bridge.
 */
export interface BridgeConfig {
  /** Debounce delay for Zustand → Yjs writes (ms) */
  zustandToYjsDebounceMs: number;
  /** Whether to log sync operations (debug mode) */
  debug: boolean;
}

/**
 * Default bridge configuration.
 */
export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  zustandToYjsDebounceMs: 300,
  debug: false,
};

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Migration result from localStorage → IndexedDB.
 */
export interface MigrationResult {
  /** Whether migration was performed */
  migrated: boolean;
  /** Project ID that was migrated */
  projectId: string | null;
  /** Number of cabinets migrated */
  cabinetCount: number;
  /** Migration timestamp */
  migratedAt: number;
  /** Error if migration failed */
  error: string | null;
}

/**
 * localStorage key for tracking migration status.
 */
export const MIGRATION_FLAG_KEY = 'monolith-yjs-migrated';

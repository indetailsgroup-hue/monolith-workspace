/**
 * indexedDbCncStore.ts - IndexedDB Storage for CNC Bundles
 *
 * Persists generated CNC bundles for cache hits across sessions.
 * Uses deterministic cache keys from cncCacheKey.ts.
 *
 * Database structure:
 * - `bundles`: Stores CNC bundle ZIP bytes by cache key
 * - `metadata`: Stores bundle metadata for listing/management
 *
 * @version 1.0.0 - Phase D3.2
 */

import { openDb, tx, reqToPromise, iterateCursor } from '../../core/infra/idb/idb';
import type { CncManifest, CncPostIdentity } from '../bundle/cncManifest';

// ============================================================================
// Database Configuration
// ============================================================================

const DB_NAME = 'monolith-cnc-cache';
const DB_VERSION = 1;

const STORE_BUNDLES = 'bundles';
const STORE_METADATA = 'metadata';

// ============================================================================
// Types
// ============================================================================

/**
 * Stored CNC bundle metadata (for listing/management).
 */
export interface StoredCncMetadata {
  /** Deterministic cache key (SHA-256 hex) */
  cacheKey: string;

  /** Job ID from manifest */
  jobId: string;

  /** Machine ID */
  machineId: string;

  /** Post processor identity */
  post: CncPostIdentity;

  /** Source packet content hash */
  packetContentHash: string;

  /** G-code SHA-256 (for verification) */
  gcodeSha256: string;

  /** Bundle ZIP size in bytes */
  bundleBytes: number;

  /** Bundle filename */
  filename: string;

  /** When bundle was cached (ISO string) */
  cachedAt: string;

  /** Optional: operation count for display */
  opCount?: number;
}

/**
 * Full stored entry (metadata + bytes).
 */
export interface StoredCncBundle {
  metadata: StoredCncMetadata;
  zipBytes: Uint8Array;
}

/**
 * Cache statistics.
 */
export interface CncCacheStats {
  /** Number of cached bundles */
  bundleCount: number;
  /** Total cache size in bytes */
  totalBytes: number;
  /** List of cached job IDs */
  jobIds: string[];
}

// ============================================================================
// IndexedDB CNC Store
// ============================================================================

/**
 * IndexedDB-backed CNC bundle cache.
 *
 * Provides persistence for CNC bundles across browser sessions.
 * Cache hits avoid expensive G-code regeneration.
 */
export class IndexedDbCncStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openDb({
      dbName: DB_NAME,
      version: DB_VERSION,
      onUpgrade: (db, oldVersion) => {
        // Version 1: Initial schema
        if (oldVersion < 1) {
          // Bundles store: cache key → ZIP bytes
          db.createObjectStore(STORE_BUNDLES);

          // Metadata store: cache key → metadata object
          const metaStore = db.createObjectStore(STORE_METADATA, {
            keyPath: 'cacheKey',
          });

          // Index by jobId for listing bundles per job
          metaStore.createIndex('jobId', 'jobId', { unique: false });

          // Index by cachedAt for TTL/cleanup
          metaStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      },
    });
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Store a CNC bundle in the cache.
   *
   * @param cacheKey - Deterministic cache key
   * @param zipBytes - Bundle ZIP bytes
   * @param manifest - CNC manifest for metadata extraction
   * @param filename - Bundle filename
   */
  async put(
    cacheKey: string,
    zipBytes: Uint8Array,
    manifest: CncManifest,
    filename: string
  ): Promise<void> {
    const db = await this.dbPromise;

    const metadata: StoredCncMetadata = {
      cacheKey,
      jobId: manifest.jobId,
      machineId: manifest.machineId,
      post: manifest.post,
      packetContentHash: manifest.packetContentHash || '',
      gcodeSha256: manifest.gcodeSha256,
      bundleBytes: zipBytes.length,
      filename,
      cachedAt: new Date().toISOString(),
      opCount: manifest.stats?.opCount,
    };

    // Store both in single transaction for atomicity
    const t = db.transaction([STORE_BUNDLES, STORE_METADATA], 'readwrite');
    const bundleStore = t.objectStore(STORE_BUNDLES);
    const metaStore = t.objectStore(STORE_METADATA);

    bundleStore.put(zipBytes, cacheKey);
    metaStore.put(metadata);

    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    });
  }

  /**
   * Get a cached CNC bundle by cache key.
   *
   * @param cacheKey - Deterministic cache key
   * @returns Bundle with metadata and bytes, or null if not found
   */
  async get(cacheKey: string): Promise<StoredCncBundle | null> {
    const db = await this.dbPromise;

    const t = db.transaction([STORE_BUNDLES, STORE_METADATA], 'readonly');
    const bundleStore = t.objectStore(STORE_BUNDLES);
    const metaStore = t.objectStore(STORE_METADATA);

    const [zipBytes, metadata] = await Promise.all([
      reqToPromise<Uint8Array | undefined>(bundleStore.get(cacheKey)),
      reqToPromise<StoredCncMetadata | undefined>(metaStore.get(cacheKey)),
    ]);

    if (!zipBytes || !metadata) {
      return null;
    }

    return { metadata, zipBytes };
  }

  /**
   * Check if a cache key exists.
   *
   * @param cacheKey - Deterministic cache key
   * @returns true if bundle is cached
   */
  async has(cacheKey: string): Promise<boolean> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const result = await reqToPromise<StoredCncMetadata | undefined>(store.get(cacheKey));
    return result !== undefined;
  }

  /**
   * Get only the metadata for a cache key (without loading bytes).
   *
   * @param cacheKey - Deterministic cache key
   * @returns Metadata or null if not found
   */
  async getMetadata(cacheKey: string): Promise<StoredCncMetadata | null> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const result = await reqToPromise<StoredCncMetadata | undefined>(store.get(cacheKey));
    return result ?? null;
  }

  /**
   * Delete a cached bundle.
   *
   * @param cacheKey - Deterministic cache key
   * @returns true if deleted, false if not found
   */
  async delete(cacheKey: string): Promise<boolean> {
    const db = await this.dbPromise;

    const exists = await this.has(cacheKey);
    if (!exists) return false;

    const t = db.transaction([STORE_BUNDLES, STORE_METADATA], 'readwrite');
    const bundleStore = t.objectStore(STORE_BUNDLES);
    const metaStore = t.objectStore(STORE_METADATA);

    bundleStore.delete(cacheKey);
    metaStore.delete(cacheKey);

    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });

    return true;
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * List all cached bundles for a job.
   *
   * @param jobId - Job ID to filter by
   * @returns List of metadata entries
   */
  async listByJob(jobId: string): Promise<StoredCncMetadata[]> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const index = store.index('jobId');

    const results: StoredCncMetadata[] = [];

    await iterateCursor<StoredCncMetadata>(
      index,
      'next',
      (value) => {
        if (value.jobId === jobId) {
          results.push(value);
        }
        return true; // Continue iteration
      }
    );

    // Sort by cachedAt descending (most recent first)
    return results.sort((a, b) => b.cachedAt.localeCompare(a.cachedAt));
  }

  /**
   * List all cached bundles.
   *
   * @param limit - Maximum number of entries (default 100)
   * @returns List of metadata entries (most recent first)
   */
  async listAll(limit = 100): Promise<StoredCncMetadata[]> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const index = store.index('cachedAt');

    const results: StoredCncMetadata[] = [];

    await iterateCursor<StoredCncMetadata>(
      index,
      'prev', // Descending by cachedAt
      (value) => {
        results.push(value);
        return results.length < limit;
      }
    );

    return results;
  }

  /**
   * Get all cache keys.
   *
   * @returns Array of cache key strings
   */
  async listKeys(): Promise<string[]> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const keys = await reqToPromise<IDBValidKey[]>(store.getAllKeys());
    return keys.map((k) => String(k));
  }

  // ==========================================================================
  // Management Operations
  // ==========================================================================

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<CncCacheStats> {
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);

    let bundleCount = 0;
    let totalBytes = 0;
    const jobIdSet = new Set<string>();

    await iterateCursor<StoredCncMetadata>(
      store,
      'next',
      (value) => {
        bundleCount++;
        totalBytes += value.bundleBytes;
        jobIdSet.add(value.jobId);
        return true;
      }
    );

    return {
      bundleCount,
      totalBytes,
      jobIds: Array.from(jobIdSet),
    };
  }

  /**
   * Clear all cached bundles for a job.
   *
   * @param jobId - Job ID to clear
   * @returns Number of bundles deleted
   */
  async clearJob(jobId: string): Promise<number> {
    const entries = await this.listByJob(jobId);

    for (const entry of entries) {
      await this.delete(entry.cacheKey);
    }

    return entries.length;
  }

  /**
   * Clear all cached bundles.
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise;
    const t = db.transaction([STORE_BUNDLES, STORE_METADATA], 'readwrite');
    const bundleStore = t.objectStore(STORE_BUNDLES);
    const metaStore = t.objectStore(STORE_METADATA);

    bundleStore.clear();
    metaStore.clear();

    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  /**
   * Evict oldest entries to keep cache under a size limit.
   *
   * @param maxBytes - Maximum cache size in bytes
   * @returns Number of entries evicted
   */
  async evictToSize(maxBytes: number): Promise<number> {
    const stats = await this.getStats();

    if (stats.totalBytes <= maxBytes) {
      return 0;
    }

    // Get all entries sorted by cachedAt (oldest first)
    const db = await this.dbPromise;
    const t = db.transaction(STORE_METADATA, 'readonly');
    const store = t.objectStore(STORE_METADATA);
    const index = store.index('cachedAt');

    const entries: StoredCncMetadata[] = [];
    await iterateCursor<StoredCncMetadata>(
      index,
      'next', // Ascending (oldest first)
      (value) => {
        entries.push(value);
        return true;
      }
    );

    // Evict oldest until under limit
    let currentSize = stats.totalBytes;
    let evicted = 0;

    for (const entry of entries) {
      if (currentSize <= maxBytes) break;

      await this.delete(entry.cacheKey);
      currentSize -= entry.bundleBytes;
      evicted++;
    }

    return evicted;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: IndexedDbCncStore | null = null;

/**
 * Get the singleton CNC cache store instance.
 */
export function getCncStore(): IndexedDbCncStore {
  if (!_instance) {
    _instance = new IndexedDbCncStore();
  }
  return _instance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function _resetCncStore(): void {
  _instance = null;
}

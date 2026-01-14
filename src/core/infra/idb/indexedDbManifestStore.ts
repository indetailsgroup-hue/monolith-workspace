/**
 * indexedDbManifestStore.ts - IndexedDB Manifest Store Implementation
 *
 * APPEND-ONLY storage for signed manifests in browser.
 *
 * STORES:
 * - manifests: Key by manifestHashHex, stores full SignedJobManifest
 * - heads: Key by jobId, stores current HEAD hashHex
 * - jobIndex: Key by `${jobId}::${timestamp}::${hash}`, for listing
 *
 * INVARIANTS:
 * - Once written, manifests are never modified
 * - HEAD only moves forward (newer manifests)
 */

import type { ManifestStore } from '../../manifest/manifestStoreTypes';
import type { SignedJobManifest } from '../../trust/manifestChainTypes';
import { openDb, reqToPromise } from './idb';

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'iimos-manifests';
const DB_VERSION = 1;

const STORE_MANIFESTS = 'manifests';
const STORE_HEADS = 'heads';
const STORE_JOB_INDEX = 'jobIndex';

// ============================================
// SCHEMA UPGRADE
// ============================================

function upgradeSchema(db: IDBDatabase, oldVersion: number, _newVersion: number): void {
  // Version 1: Initial schema
  if (oldVersion < 1) {
    // Manifests store: key = manifestHashHex
    if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
      db.createObjectStore(STORE_MANIFESTS, { keyPath: 'manifestHashHex' });
    }

    // Heads store: key = jobId, value = headHashHex
    if (!db.objectStoreNames.contains(STORE_HEADS)) {
      db.createObjectStore(STORE_HEADS);
    }

    // Job index: key = `${jobId}::${timestamp}::${hash}`, value = hash
    // Allows listing manifests by job, sorted by time
    if (!db.objectStoreNames.contains(STORE_JOB_INDEX)) {
      db.createObjectStore(STORE_JOB_INDEX);
    }
  }
}

// ============================================
// IMPLEMENTATION
// ============================================

export class IndexedDbManifestStore implements ManifestStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openDb({
      dbName: DB_NAME,
      version: DB_VERSION,
      onUpgrade: upgradeSchema,
    });
  }

  /**
   * Store manifest (append-only)
   */
  async put(manifest: SignedJobManifest): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([STORE_MANIFESTS, STORE_JOB_INDEX], 'readwrite');
      const manifestStore = t.objectStore(STORE_MANIFESTS);
      const indexStore = t.objectStore(STORE_JOB_INDEX);

      // Store manifest by hash
      manifestStore.put(manifest);

      // Build index key: jobId::timestamp::hash for chronological listing
      const timestamp = manifest.createdIso ?? new Date().toISOString();
      const indexKey = `${manifest.jobId}::${timestamp}::${manifest.manifestHashHex}`;
      indexStore.put(manifest.manifestHashHex, indexKey);

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    });
  }

  /**
   * Load manifest by hash
   */
  async loadByHash(hashHex: string): Promise<SignedJobManifest | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_MANIFESTS], 'readonly');
      const store = t.objectStore(STORE_MANIFESTS);
      const req = store.get(hashHex);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Set HEAD pointer for job
   */
  async setHead(jobId: string, headHashHex: string): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([STORE_HEADS], 'readwrite');
      t.objectStore(STORE_HEADS).put(headHashHex, jobId);

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    });
  }

  /**
   * Get HEAD hash for job
   */
  async getHead(jobId: string): Promise<string | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_HEADS], 'readonly');
      const store = t.objectStore(STORE_HEADS);
      const req = store.get(jobId);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * List recent manifests for job (newest first)
   */
  async listRecent(jobId: string, limit: number): Promise<SignedJobManifest[]> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const results: SignedJobManifest[] = [];

      const t = db.transaction([STORE_JOB_INDEX, STORE_MANIFESTS], 'readonly');
      const indexStore = t.objectStore(STORE_JOB_INDEX);
      const manifestStore = t.objectStore(STORE_MANIFESTS);

      // Use cursor to iterate backwards (newest first by lexicographic key)
      const req = indexStore.openCursor(null, 'prev');

      req.onsuccess = async () => {
        const cursor = req.result;

        if (!cursor || results.length >= limit) {
          // Done iterating
          return;
        }

        const key = String(cursor.key);

        // Check if this belongs to our job
        if (key.startsWith(`${jobId}::`)) {
          const hashHex = cursor.value as string;

          // Load the manifest
          const manifestReq = manifestStore.get(hashHex);
          manifestReq.onsuccess = () => {
            if (manifestReq.result) {
              results.push(manifestReq.result);
            }
          };
        }

        cursor.continue();
      };

      t.oncomplete = () => resolve(results);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    });
  }

  /**
   * Check if manifest exists by hash
   */
  async exists(hashHex: string): Promise<boolean> {
    const manifest = await this.loadByHash(hashHex);
    return manifest !== null;
  }

  /**
   * Count manifests for a job
   */
  async countForJob(jobId: string): Promise<number> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      let count = 0;

      const t = db.transaction([STORE_JOB_INDEX], 'readonly');
      const indexStore = t.objectStore(STORE_JOB_INDEX);
      const req = indexStore.openCursor();

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;

        const key = String(cursor.key);
        if (key.startsWith(`${jobId}::`)) {
          count++;
        }
        cursor.continue();
      };

      t.oncomplete = () => resolve(count);
      t.onerror = () => reject(t.error);
    });
  }

  /**
   * Delete all data (for testing/reset)
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(
        [STORE_MANIFESTS, STORE_HEADS, STORE_JOB_INDEX],
        'readwrite'
      );

      t.objectStore(STORE_MANIFESTS).clear();
      t.objectStore(STORE_HEADS).clear();
      t.objectStore(STORE_JOB_INDEX).clear();

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let _instance: IndexedDbManifestStore | null = null;

export function getManifestStore(): IndexedDbManifestStore {
  if (!_instance) {
    _instance = new IndexedDbManifestStore();
  }
  return _instance;
}

/**
 * indexedDbPacketStore.ts - IndexedDB Packet Blob Storage
 *
 * Persists verified factory packet blobs for offline access.
 * Works alongside factoryStore's verifiedPacketByJobId metadata.
 *
 * STORES:
 * - blobs: Key by jobId, stores Uint8Array of ZIP data
 * - metadata: Key by jobId, stores verification timestamp + metadata
 *
 * @version 1.0.0 - Phase D0: Verified Packet Persistence
 */

import { openDb, reqToPromise } from '../../core/infra/idb/idb';

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'monolith-factory-packets';
const DB_VERSION = 1;

const STORE_BLOBS = 'blobs';
const STORE_METADATA = 'metadata';

// ============================================
// TYPES
// ============================================

export interface StoredPacketMetadata {
  /** Job ID */
  jobId: string;
  /** Original filename */
  fileName: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA-256 content hash */
  contentHash: string | null;
  /** Verification passed */
  verified: boolean;
  /** Timestamp stored */
  storedAt: string;
  /** Part count */
  partCount: number;
}

// ============================================
// SCHEMA UPGRADE
// ============================================

function upgradeSchema(db: IDBDatabase, oldVersion: number, _newVersion: number): void {
  // Version 1: Initial schema
  if (oldVersion < 1) {
    // Blobs store: key = jobId, value = Uint8Array (ZIP data)
    if (!db.objectStoreNames.contains(STORE_BLOBS)) {
      db.createObjectStore(STORE_BLOBS);
    }

    // Metadata store: key = jobId, value = StoredPacketMetadata
    if (!db.objectStoreNames.contains(STORE_METADATA)) {
      db.createObjectStore(STORE_METADATA, { keyPath: 'jobId' });
    }
  }
}

// ============================================
// IMPLEMENTATION
// ============================================

export class IndexedDbPacketStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = openDb({
      dbName: DB_NAME,
      version: DB_VERSION,
      onUpgrade: upgradeSchema,
    });
  }

  /**
   * Store packet blob with metadata
   */
  async storePacket(
    jobId: string,
    blob: Uint8Array,
    metadata: Omit<StoredPacketMetadata, 'jobId' | 'storedAt'>
  ): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([STORE_BLOBS, STORE_METADATA], 'readwrite');
      const blobStore = t.objectStore(STORE_BLOBS);
      const metaStore = t.objectStore(STORE_METADATA);

      // Store blob by jobId
      blobStore.put(blob, jobId);

      // Store metadata
      const fullMetadata: StoredPacketMetadata = {
        ...metadata,
        jobId,
        storedAt: new Date().toISOString(),
      };
      metaStore.put(fullMetadata);

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    });
  }

  /**
   * Load packet blob by job ID
   */
  async loadBlob(jobId: string): Promise<Uint8Array | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_BLOBS], 'readonly');
      const store = t.objectStore(STORE_BLOBS);
      const req = store.get(jobId);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Load packet metadata by job ID
   */
  async loadMetadata(jobId: string): Promise<StoredPacketMetadata | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_METADATA], 'readonly');
      const store = t.objectStore(STORE_METADATA);
      const req = store.get(jobId);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Check if packet exists for job
   */
  async hasPacket(jobId: string): Promise<boolean> {
    const metadata = await this.loadMetadata(jobId);
    return metadata !== null;
  }

  /**
   * Delete packet for job
   */
  async deletePacket(jobId: string): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([STORE_BLOBS, STORE_METADATA], 'readwrite');

      t.objectStore(STORE_BLOBS).delete(jobId);
      t.objectStore(STORE_METADATA).delete(jobId);

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  /**
   * List all stored packet job IDs
   */
  async listJobIds(): Promise<string[]> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_METADATA], 'readonly');
      const store = t.objectStore(STORE_METADATA);
      const req = store.getAllKeys();

      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<{
    packetCount: number;
    totalSizeBytes: number;
    jobIds: string[];
  }> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORE_METADATA], 'readonly');
      const store = t.objectStore(STORE_METADATA);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result || []) as StoredPacketMetadata[];
        resolve({
          packetCount: items.length,
          totalSizeBytes: items.reduce((sum, m) => sum + (m.sizeBytes || 0), 0),
          jobIds: items.map((m) => m.jobId),
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Clear all stored packets (for testing/reset)
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise;

    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([STORE_BLOBS, STORE_METADATA], 'readwrite');

      t.objectStore(STORE_BLOBS).clear();
      t.objectStore(STORE_METADATA).clear();

      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let _instance: IndexedDbPacketStore | null = null;

export function getPacketStore(): IndexedDbPacketStore {
  if (!_instance) {
    _instance = new IndexedDbPacketStore();
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetPacketStore(): void {
  _instance = null;
}

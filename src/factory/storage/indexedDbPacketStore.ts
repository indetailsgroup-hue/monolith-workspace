/**
 * indexedDbPacketStore.ts - IndexedDB Packet Storage
 *
 * Provides persistent storage for factory packet blobs and metadata.
 *
 * @version 1.0.0 - Phase D3.3
 */

export interface PacketMetadata {
  jobId: string;
  contentHash: string;
  createdAt: number;
  machineId?: string;
}

export interface PacketStore {
  saveBlob(jobId: string, blob: Blob): Promise<void>;
  loadBlob(jobId: string): Promise<Blob | null>;
  saveMetadata(jobId: string, metadata: PacketMetadata): Promise<void>;
  loadMetadata(jobId: string): Promise<PacketMetadata | null>;
  deletePacket(jobId: string): Promise<void>;
  listJobIds(): Promise<string[]>;
}

const DB_NAME = 'monolith-packets';
const DB_VERSION = 1;
const BLOB_STORE = 'blobs';
const META_STORE = 'metadata';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createStore(): PacketStore {
  return {
    async saveBlob(jobId, blob) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readwrite');
        tx.objectStore(BLOB_STORE).put(blob, jobId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    },

    async loadBlob(jobId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readonly');
        const req = tx.objectStore(BLOB_STORE).get(jobId);
        req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    },

    async saveMetadata(jobId, metadata) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put(metadata, jobId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    },

    async loadMetadata(jobId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).get(jobId);
        req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    },

    async deletePacket(jobId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([BLOB_STORE, META_STORE], 'readwrite');
        tx.objectStore(BLOB_STORE).delete(jobId);
        tx.objectStore(META_STORE).delete(jobId);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    },

    async listJobIds() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).getAllKeys();
        req.onsuccess = () => { db.close(); resolve(req.result as string[]); };
        req.onerror = () => { db.close(); reject(req.error); };
      });
    },
  };
}

let _store: PacketStore | null = null;

/** Get the singleton packet store instance. */
export function getPacketStore(): PacketStore {
  if (!_store) _store = createStore();
  return _store;
}

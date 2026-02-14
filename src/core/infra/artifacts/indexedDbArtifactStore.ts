/**
 * indexedDbArtifactStore.ts - IndexedDB Artifact Store
 *
 * USAGE:
 * - Production artifact storage
 * - Persists across page reloads
 * - Uses single database with artifacts store
 */

import { sha256Hex } from '../../crypto/sha256';
import { makeArtifactId } from '../../export/exportBundleTypes';
import { openDb, tx } from '../idb/idb';
import type {
  ArtifactStore,
  PutArtifactInput,
  PutArtifactOutput,
  StoredArtifact,
} from './artifactStoreTypes';

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'monolith-artifacts';
const DB_VERSION = 1;
const STORE_NAME = 'artifacts';

// ============================================
// INDEXEDDB ARTIFACT STORE
// ============================================

/**
 * Create IndexedDB artifact store
 *
 * @returns Promise resolving to ArtifactStore implementation
 */
export async function createIndexedDbArtifactStore(): Promise<ArtifactStore> {
  // Open database with schema upgrade
  const db = await openDb({
    dbName: DB_NAME,
    version: DB_VERSION,
    onUpgrade: (database) => {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'artifactId' });
      }
    },
  });

  // Helper: get artifact by ID
  async function getArtifact(artifactId: string): Promise<StoredArtifact | null> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const req = objectStore.get(artifactId);

      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  // Build store object
  const store: ArtifactStore = {
    async put(input: PutArtifactInput): Promise<PutArtifactOutput> {
      // Compute SHA-256 hash of content
      const sha256HexValue = await sha256Hex(input.bytes);
      const artifactId = makeArtifactId(sha256HexValue);

      // Store with metadata
      const stored: StoredArtifact = {
        artifactId,
        bytes: input.bytes,
        mime: input.mime,
        filename: input.filename,
        sha256Hex: sha256HexValue,
        storedIso: new Date().toISOString(),
      };

      await tx(db, STORE_NAME, 'readwrite', (stores) => {
        stores[STORE_NAME].put(stored);
      });

      return {
        artifactId,
        bytes: input.bytes.byteLength,
        sha256Hex: sha256HexValue,
      };
    },

    async get(artifactId: string): Promise<StoredArtifact | null> {
      return getArtifact(artifactId);
    },

    async has(artifactId: string): Promise<boolean> {
      const result = await getArtifact(artifactId);
      return result !== null;
    },

    async delete(artifactId: string): Promise<boolean> {
      const exists = await getArtifact(artifactId);
      if (!exists) return false;

      await tx(db, STORE_NAME, 'readwrite', (stores) => {
        stores[STORE_NAME].delete(artifactId);
      });

      return true;
    },

    async listIds(): Promise<string[]> {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const req = objectStore.getAllKeys();

        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      });
    },

    async clear(): Promise<void> {
      await tx(db, STORE_NAME, 'readwrite', (stores) => {
        stores[STORE_NAME].clear();
      });
    },
  };

  return store;
}

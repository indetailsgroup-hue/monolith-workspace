/**
 * memoryArtifactStore.ts - In-Memory Artifact Store
 *
 * USAGE:
 * - Development and testing
 * - Data is lost on page reload
 * - For production, use IndexedDB implementation
 */

import { sha256Hex } from '../../crypto/sha256';
import { makeArtifactId } from '../../export/exportBundleTypes';
import type {
  ArtifactStore,
  PutArtifactInput,
  PutArtifactOutput,
  StoredArtifact,
} from './artifactStoreTypes';

// ============================================
// MEMORY ARTIFACT STORE
// ============================================

/**
 * Create in-memory artifact store
 *
 * @returns ArtifactStore implementation
 */
export function createMemoryArtifactStore(): ArtifactStore {
  const map = new Map<string, StoredArtifact>();

  return {
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

      map.set(artifactId, stored);

      return {
        artifactId,
        bytes: input.bytes.byteLength,
        sha256Hex: sha256HexValue,
      };
    },

    async get(artifactId: string): Promise<StoredArtifact | null> {
      return map.get(artifactId) ?? null;
    },

    async has(artifactId: string): Promise<boolean> {
      return map.has(artifactId);
    },

    async delete(artifactId: string): Promise<boolean> {
      return map.delete(artifactId);
    },

    async listIds(): Promise<string[]> {
      return Array.from(map.keys());
    },

    async clear(): Promise<void> {
      map.clear();
    },
  };
}

/**
 * Artifacts Module Index
 *
 * Binary artifact storage for export bundles.
 */

// Types
export type {
  ArtifactStore,
  PutArtifactInput,
  PutArtifactOutput,
  StoredArtifact,
} from './artifactStoreTypes';

// Memory implementation (dev/test)
export { createMemoryArtifactStore } from './memoryArtifactStore';

// IndexedDB implementation (production)
export { createIndexedDbArtifactStore } from './indexedDbArtifactStore';

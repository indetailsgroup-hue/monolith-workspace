/**
 * In-Memory Artifact Store
 *
 * Mock/dev implementation. Replace with object storage for production.
 * Bundles are immutable once stored - no updates allowed.
 */

import type {
  ArtifactBundle,
  ArtifactRecord,
  ArtifactStore,
  ArtifactPath,
} from './types';

class InMemoryArtifactStore implements ArtifactStore {
  private bundles = new Map<string, ArtifactBundle>();

  putBundle(bundle: ArtifactBundle): void {
    if (this.bundles.has(bundle.bundleId)) {
      throw new Error(
        `Bundle ${bundle.bundleId} already exists. Bundles are immutable.`
      );
    }
    // Deep freeze to prevent mutations
    Object.freeze(bundle);
    Object.freeze(bundle.items);
    bundle.items.forEach((item) => Object.freeze(item));

    this.bundles.set(bundle.bundleId, bundle);
  }

  getBundle(bundleId: string): ArtifactBundle | undefined {
    return this.bundles.get(bundleId);
  }

  getArtifact(
    bundleId: string,
    path: ArtifactPath
  ): ArtifactRecord | undefined {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return undefined;
    return bundle.items.find((item) => item.path === path);
  }

  listBundleIds(): string[] {
    return Array.from(this.bundles.keys());
  }

  /** Debug: clear all bundles (use only in tests) */
  _clear(): void {
    this.bundles.clear();
  }
}

/**
 * Global artifact store singleton
 *
 * Use this throughout the application for consistent artifact access.
 */
export const artifactStore: ArtifactStore = new InMemoryArtifactStore();

/**
 * Get the internal store instance for testing
 */
export function getArtifactStoreForTesting(): InMemoryArtifactStore {
  return artifactStore as InMemoryArtifactStore;
}

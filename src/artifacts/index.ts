/**
 * Artifacts Module Index
 *
 * Re-exports artifact types, verification, and store access.
 *
 * @version 1.0.0
 */

export type { ArtifactBundle, ArtifactBundleItem } from './types';
export type { VerifyResult, VerifyError, VerifyOptions } from './verify';
export { verifyBundleAgainstManifest, verifyArtifactContent, formatVerifyErrors } from './verify';

// Re-export artifact store from core infrastructure
import { createMemoryArtifactStore } from '../core/infra/artifacts/memoryArtifactStore';
export type { ArtifactStore } from '../core/infra/artifacts/artifactStoreTypes';

/** Singleton artifact store instance */
export const artifactStore = createMemoryArtifactStore();

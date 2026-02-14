/**
 * MONOLITH Artifact Store Module
 *
 * Immutable artifact storage for released factory packages.
 */

// Types
export type {
  ArtifactPath,
  ArtifactRecord,
  ArtifactBundle,
  ArtifactStore,
} from './types';

// Store
export { artifactStore, getArtifactStoreForTesting } from './store';

// Verification
export type { VerifyError, VerifyResult } from './verify';
export {
  verifyBundleAgainstManifest,
  verifyArtifactContent,
  formatVerifyErrors,
} from './verify';

// Strict Enforcement
export { requireVerifiedRelease, getVerifiedArtifact } from './requireVerified';

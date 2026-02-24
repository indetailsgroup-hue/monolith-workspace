/**
 * Release Manifest Module
 *
 * Signed manifests with SHA-256 integrity hashes for factory artifacts.
 */

// Types
export type {
  ManifestFile,
  SignedManifest,
  ArtifactContent,
} from './types';

// Builder
export type {
  ArtifactInput,
  BuildManifestInput,
  BuildSignedManifestWithArtifactsInput,
  BuildReleasePackageManifestInput,
} from './buildManifest';
export {
  buildSignedManifest,
  buildSignedManifestWithArtifacts,
  buildReleasePackageManifest,
  createArtifact,
  ARTIFACT_TYPES,
  verifyArtifactHash,
  verifyManifestArtifacts,
} from './buildManifest';

// Signing
export {
  signManifestJson,
  verifyManifestJsonSignature,
} from './signManifest';

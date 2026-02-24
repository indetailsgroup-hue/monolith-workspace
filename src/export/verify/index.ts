/**
 * Verify Module - Bundle Verification
 *
 * Step 7-8 of Plasticity-Style Modeling Layer.
 * - v1 (mock): FNV-1a hashes, mock signatures
 * - v2 (real): SHA-256 hashes, ECDSA P-256 signatures
 */

export type { VerifySeverity, VerifyIssue, VerifyReport } from './verifyTypes';

// v1 (mock crypto - for backwards compatibility)
export { verifyManifestSigMock } from './verifyManifestSig';
export { verifyArtifactBundle, extractManifestFromArtifact } from './verifyBundle';

// v2 (real crypto - Step 8)
export { verifyManifestSigV2 } from './verifyManifestSigV2';
export { verifyArtifactBundleV2, extractManifestFromArtifactV2 } from './verifyBundleV2';

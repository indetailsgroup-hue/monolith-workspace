// src/core/manufacturing/manifest/index.ts
/**
 * Manifest Module.
 *
 * Toolpath manifest for chain-of-custody factory export.
 *
 * v0.10.8.3 - Signed Toolpath Manifest
 */

// Manifest schema types
export {
  // Types
  type HashAlgo,
  type HashRef,
  type ArtifactKind,
  type ArtifactRef,
  type SignatureScheme,
  type SignatureBlock,
  type ManifestSpecState,
  type ManifestJob,
  type ManifestManufacturingTruth,
  type ManifestToolpath,
  type ManifestGate,
  type ManifestChain,
  type ToolpathManifestV1,
  type FactoryPackStructure,

  // Helpers
  createHashRef,
  createArtifactRef,
  createEmptySignatureBlock,
  isManifestSigned,
  getAllArtifactRefs,
  findArtifactRef,
  getFactoryPackStructure,
} from "./toolpathManifest.v1";

// Manifest builder
export {
  // Types
  type BuildManifestRequest,
  type BuildManifestResult,
  type HashFileEntry,

  // Functions
  buildToolpathManifest,
  buildMinimalManifest,
  attachSignature,
  createSignatureBlock,
  generateHashesFile,
  extractHashEntries,
} from "./buildToolpathManifest";

// Manifest verification
export {
  // Types
  type ManifestVerifySeverity,
  type ManifestVerifyIssueCode,
  type ManifestVerifyIssue,
  type ManifestVerifyVerdict,
  type ManifestVerifyResult,
  type ArtifactContentProvider,
  type VerifyManifestOptions,

  // Functions
  verifyManifestHash,
  computeManifestHash,
  verifyArtifactHash,
  verifyAllArtifacts,
  validateManifestSchema,
  verifyManifest,
  quickVerifyManifest,
  parseAndVerifyManifest,
} from "./verifyManifest";

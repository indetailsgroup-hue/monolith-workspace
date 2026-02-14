// src/core/manufacturing/export/index.ts
/**
 * Export Module.
 *
 * Factory export with gate enforcement and signing.
 * Nothing reaches the factory without passing ALL gates.
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// Export gate contracts
export {
  // Types
  type ExportKind,
  type ExportRequest,
  type ExportPacketFile,
  type ExportPacketInfo,
  type ExportResult,
  type ExportBlockCode,

  // Constants
  EXPORT_BLOCK_DESCRIPTIONS,

  // Helpers
  getBlockDescription,
  createExportRequest,
  createBlockedResult,
  createSuccessResult,
  isBlocked,
  isExportOk,
} from "./exportGate.v1";

// Enforcement
export {
  // Types
  type GateSpecState,
  type GateVerdict,
  type ExportGateContext,
  type EnforcementDecision,
  type ExportPolicy,
  type ExportGateSummary,

  // Constants
  DEFAULT_EXPORT_POLICY,
  PRODUCTION_EXPORT_POLICY,

  // Functions
  enforceExportGate,
  quickExportGateCheck,
  isSignatureRequired,
  getExportGateSummary,
} from "./enforceExportGate";

// Packet builder
export {
  // Types
  type PacketArtifact,
  type PacketReports,
  type PacketFiles,
  type BuildPacketRequest,
  type BuildPacketResult,

  // Functions
  buildFactoryPacketArtifacts,
  normalizeNewlines,
  ensureTrailingNewline,
  computeContentHash,
  generatePacketId,
  parsePacketId,
  verifyPacketArtifact,
  verifyPacketArtifacts,
} from "./factoryPacketBuilder";

// Export worker
export {
  // Types
  type JobSnapshot,
  type StoredGateReport,
  type StoredSimReport,
  type StoredVerifierReport,
  type StoredConsistencyReport,
  type StoredNcFile,
  type StoredDxfFile,
  type StoredIrFile,
  type ExportStorageProvider,
  type ExportWorkerOptions,

  // Functions
  exportFactoryPacket,
  createMockStorageProvider,
} from "./exportWorker";

// Packet schema
export {
  // Types
  type PacketFileEntry,
  type FactoryPacketIndexV1,
  type ManifestToolpathWithFiles,

  // Functions
  createPacketFileEntry,
  normalizePath,
  createPacketIndex,
  validatePacketFileEntry,
  validatePacketFiles,
  buildPacketPath,

  // Constants
  PACKET_DIRS,
  PACKET_FILES,
} from "./packetSchema.v1";

// Signer client
export {
  // Types
  type SignManifestRequest,
  type SignManifestResponse,
  type SignerClientOptions,

  // Classes
  SignerClient,
  SignerClientError,

  // Functions
  createSignerClient,
  signManifestAndGetBlock,

  // Constants
  DEFAULT_SIGNER_URL,
} from "./signerClient";

// Signature verification
export {
  // Types
  type PinnedKey,
  type PinnedKeySetV1,
  type SignatureVerifyResult,
  type SignatureVerifyErrorCode,

  // Functions
  verifySignatureWithPinnedKeys,
  validatePinnedKeySet,
  findKeyById,
  isKeyAllowed,
  isKeyExpired,
  getValidKeys,
  createEmptyKeySet,
  addKeyToSet,
  removeKeyFromSet,
} from "./sigVerify";

// Pinned keys configuration
export {
  // Constants
  DEVELOPMENT_KEY_SET,
  PRODUCTION_KEY_SET,

  // Types
  type KeySetSource,
  type KeySetLoaderOptions,
  type RuntimeEnv,

  // Functions
  loadKeySet,
  getActiveKeySet,
  isKeySetInitialized,
  initializeKeySet,
  clearKeySet,
  getRuntimeEnv,
  getKeySetForEnv,
  autoInitializeKeySet,
  exportKeySetForFactory,
  createFactoryKeyFile,
  // Signer API integration
  fetchPinnedKeyFromSigner,
  initializeKeySetFromSigner,
  loadKeySetFromPublicPath,
  initializeKeySetFromPublicPath,
} from "./pinnedKeys.config";

// ZIP builder
export {
  // Types
  type ZipOptions,
  type ZipResult,

  // Functions
  buildFactoryPacketZip,
  buildCompleteFactoryPacket,
  arrayBufferToBase64,
  downloadZip,
  generatePacketFilename,
  verifyZipHash,
  extractManifestFromZip,
} from "./buildFactoryPacketZip";

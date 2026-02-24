/**
 * Trust Module Index
 *
 * Factory-grade validation and traceability system
 */

// Trust Report Types
export type {
  TrustCollisionSummary,
  TrustReportVersion,
  TrustReport,
} from './trustReportTypes';
export {
  createEmptyCollisionSummary,
  createEmptyTrustReport,
  isTrustReportValid,
  getTrustReportStatus,
  formatTrustReportSummary,
} from './trustReportTypes';

// Trust Report Builder
export {
  summarizeCollision,
  buildTrustReport,
  buildMinimalTrustReport,
  canExportWithTrustReport,
  getBlockingReasons,
} from './buildTrustReport';

// Hash Utilities
export {
  sha256Json,
  sha256String,
  verifyHash,
  createHashedObject,
  hashSync,
  verifyHashSync,
} from './hashTrustReport';

// Manifest Types
export type {
  ExportKind,
  ExportArtifact,
  ManifestVersion,
  JobManifest,
} from './manifestTypes';
export {
  createJobManifest,
  addExportToManifest,
  isManifestValidForExport,
  getManifestExportStatus,
} from './manifestTypes';

// Export Guard (Legacy)
export type { ExportGuardResult as LegacyExportGuardResult } from './exportGuard';
export {
  assertExportAllowed as assertExportAllowedLegacy,
  assertExportAllowedSync,
  guardExport,
  withExportGuard,
  canExport,
  getExportBlockingReasons,
} from './exportGuard';

// ============================================
// SIGNED TRUST CHAIN v1 (Ed25519)
// ============================================

// Signed Trust Types
export type {
  SignatureAlgorithm,
  SignedTrustReport,
  TrustVerificationResult,
} from './signedTrustTypes';
export {
  isValidSignedTrustStructure,
  extractTrustUnsafe,
  isApprovedTrust,
} from './signedTrustTypes';

// Sign Trust Report
export {
  signTrustReport,
  reSignTrustReport,
  createUnsignedTrustEnvelope,
} from './signTrustReport';

// Verify Trust Report
export {
  verifySignedTrustReport,
  verifySignedTrustWithGate,
  assertSignedTrustValid,
  canUseForExport,
} from './verifyTrustReport';

// Manifest Chain Types
export type {
  ExportKind as ChainExportKind,
  ExportArtifactRecord,
  ManifestChainVersion,
  SignedJobManifest,
  ManifestCore,
} from './manifestChainTypes';
export {
  extractManifestCore,
  isGenesisManifest,
  getChainDepth,
  isValidManifestStructure,
} from './manifestChainTypes';

// Build Manifest
export {
  buildSignedManifest,
  buildGenesisManifest,
  buildChildManifest,
  createExportArtifact,
  createExportArtifactFromString,
} from './buildManifest';

// Verify Manifest Chain
export type {
  ManifestStore,
  ManifestVerificationResult,
  ChainVerificationResult,
  ExportGuardResult,
} from './verifyManifestChain';
export {
  verifyManifest,
  verifyChain,
  assertExportAllowedWithChain,
  assertExportAllowed,
} from './verifyManifestChain';

// ============================================
// APPROVAL SIGNER
// ============================================

// Approval Signer Interface
export type { ApprovalSigner } from './approvalSigner';

// Approval Signer Factory
export { makeApprovalSigner } from './makeApprovalSigner';

/**
 * Manufacturing Module - Factory Operations & Gate System
 *
 * Step 5-6 of Plasticity-Style Modeling Layer:
 * - OperationGraph: Machine-readable operations from DesignIntent
 * - Gate: Pre-freeze validation combining Preflight + OpGraph
 * - Snapshot: Immutable frozen state with hash verification
 * - Release: FROZEN → RELEASED workflow with approval signatures
 *
 * v1.1: Added release module (Step 6)
 */

// ============================================================================
// OperationGraph
// ============================================================================

export type {
  OpId,
  OpKind,
  TargetKind,
  OpTarget,
  OpNode,
  OperationGraph,
  OpSummary,
} from './opgraph';
export {
  getOpSummary,
  buildOpGraphFromIntents,
  buildOpGraphForCabinet,
  resetOpCounter,
} from './opgraph';

// ============================================================================
// Gate
// ============================================================================

export type {
  GateStatus,
  GateReport,
  CabinetGateReport,
  GateBlocker,
} from './gate';
export {
  getBlockers,
  runGate,
  runCabinetGate,
  canFreeze,
  getGateSummary,
} from './gate';

// ============================================================================
// Snapshot
// ============================================================================

export type {
  FrozenSnapshot,
  CabinetFrozenSnapshot,
} from './gate';
export {
  createFrozenSnapshot,
  createCabinetFrozenSnapshot,
  verifySnapshot,
  exportSnapshot,
  importSnapshot,
} from './gate';

// ============================================================================
// Release (Step 6)
// ============================================================================

export type {
  ApprovalRole,
  ApprovalSignature,
  ApprovalRequirement,
  ReleaseFile,
  ReleaseBundle,
  ReleaseBundleMeta,
} from './release';
export {
  DEFAULT_APPROVAL_REQUIREMENT,
  getBundleMeta,
  fnv1aHash,
  signPayloadMock,
  createApprovalSignature,
  verifyApprovalSignature,
  signManifest,
  buildReleaseBundle,
  extractManifest,
  verifyBundleIntegrity,
  exportBundleAsJson,
  downloadBundle,
  downloadBundleFile,
  useReleaseStore,
  useApprovals,
  useLastBundle,
  useApprovalModalOpen,
  useCanRelease,
} from './release';

// ============================================================================
// Toolpath Manifest (v0.10.8.3)
// ============================================================================

export type {
  // Schema types
  HashAlgo,
  HashRef,
  ArtifactKind,
  ArtifactRef,
  SignatureScheme,
  SignatureBlock,
  ManifestSpecState,
  ManifestJob,
  ManifestManufacturingTruth,
  ManifestToolpath,
  ManifestGate,
  ManifestChain,
  ToolpathManifestV1,
  FactoryPackStructure,

  // Builder types
  BuildManifestRequest,
  BuildManifestResult,
  HashFileEntry,

  // Verification types
  ManifestVerifySeverity,
  ManifestVerifyIssueCode,
  ManifestVerifyIssue,
  ManifestVerifyVerdict,
  ManifestVerifyResult,
  ArtifactContentProvider,
  VerifyManifestOptions,
} from './manifest';

export {
  // Schema helpers
  createHashRef,
  createArtifactRef,
  createEmptySignatureBlock,
  isManifestSigned,
  getAllArtifactRefs,
  findArtifactRef,
  getFactoryPackStructure,

  // Builder functions
  buildToolpathManifest,
  buildMinimalManifest,
  attachSignature,
  createSignatureBlock,
  generateHashesFile,
  extractHashEntries,

  // Verification functions
  verifyManifestHash,
  computeManifestHash,
  verifyArtifactHash,
  verifyAllArtifacts,
  validateManifestSchema,
  verifyManifest,
  quickVerifyManifest,
  parseAndVerifyManifest,
} from './manifest';

// ============================================================================
// Export Gate Enforcement (v0.10.8.4)
// ============================================================================

export type {
  // Export contracts
  ExportKind,
  ExportRequest,
  ExportPacketFile,
  ExportPacketInfo,
  ExportResult,
  ExportBlockCode,

  // Enforcement types
  GateSpecState,
  GateVerdict,
  ExportGateContext,
  EnforcementDecision,
  ExportPolicy,
  ExportGateSummary,

  // Packet builder types
  PacketArtifact,
  PacketReports,
  PacketFiles,
  BuildPacketRequest,
  BuildPacketResult,

  // Worker types
  JobSnapshot,
  StoredGateReport,
  StoredSimReport,
  StoredVerifierReport,
  StoredConsistencyReport,
  StoredNcFile,
  StoredDxfFile,
  StoredIrFile,
  ExportStorageProvider,
  ExportWorkerOptions,
} from './export';

export {
  // Block descriptions
  EXPORT_BLOCK_DESCRIPTIONS,
  getBlockDescription,

  // Export request helpers
  createExportRequest,
  createBlockedResult,
  createSuccessResult,
  isBlocked,
  isExportOk,

  // Enforcement
  enforceExportGate,
  quickExportGateCheck,
  isSignatureRequired,
  getExportGateSummary,
  DEFAULT_EXPORT_POLICY,
  PRODUCTION_EXPORT_POLICY,

  // Packet builder
  buildFactoryPacketArtifacts,
  normalizeNewlines,
  ensureTrailingNewline,
  computeContentHash,
  generatePacketId,
  parsePacketId,
  verifyPacketArtifact,
  verifyPacketArtifacts,

  // Export worker
  exportFactoryPacket,
  createMockStorageProvider,
} from './export';

// ============================================================================
// P14A FlatPart Manufacturing (v0.14.x)
// ============================================================================

export type {
  // Schema types
  FlatPartVersion,
  Point2D,
  Rect2D,
  Polyline2D,
  OuterContour,
  InnerContour,
  DrillFeature,
  PocketFeature,
  GrooveFeature,
  EdgeSide,
  EdgeBand,
  MaterialLayer,
  CompositeStack,
  ManufacturingMeta,
  FlatPart,
  FlatPartFromPanelInput,
  FlatPartIssueCode,
  FlatPartIssueSeverity,
  FlatPartIssue,
  FlatPartValidationResult,
} from '../types/FlatPart';

export { FLAT_PART_VERSION } from '../types/FlatPart';

// FlatPart Builder
export {
  flatPartFromPanel,
  flatPartsFromCabinet,
} from './flatPartBuilder';

// FlatPart Gate Validation
export {
  validateFlatPart,
  validateFlatParts,
  canExportFlatParts,
  DEFAULT_GATE_CONFIG as FLATPART_GATE_CONFIG,
} from './flatPartGate';
export type { GateConfig as FlatPartGateConfig } from './flatPartGate';

// DXF R12 Export
export {
  flatPartToDxfR12,
  exportFlatPartToDxf,
  exportFlatPartsToDxf,
  DEFAULT_DXF_CONFIG,
} from './dxfR12Writer';
export type { DxfWriterConfig } from './dxfR12Writer';

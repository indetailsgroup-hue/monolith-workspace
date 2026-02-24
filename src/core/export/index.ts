/**
 * Export Module Index
 *
 * Guarded export and commit pipelines
 */

// Export Pipeline
export type {
  ExportArtifact,
  ExportPipelineConfig,
  ExportPipelineResult,
} from './exportPipeline';

export {
  guardedExport,
  canExportJob,
  createBrowserDownloader,
} from './exportPipeline';

// Commit Approved State
export type {
  CabinetForGate,
  CommitConfig,
  CommitResult,
} from './commitApprovedState';

export {
  commitApprovedState,
  createGenesisManifest,
  canCommit,
} from './commitApprovedState';

// Text/Bytes utilities
export {
  textToBytes,
  bytesToText,
  isBinary,
  normalizeToBytes,
  getByteLength,
} from './textToBytes';

// Download utilities
export type { DownloadOptions } from './downloadArtifacts';

export {
  downloadFile,
  downloadJson,
  downloadArtifacts,
  downloadFileAuto,
  getMimeType,
  contentToDataUrl,
  readFileAsBytes,
  readFileAsText,
} from './downloadArtifacts';

// Export Bundle Types (for Trust Chain integration)
export type {
  ExportPackageKind,
  ExportArtifactRef,
  ExportBundleProof,
  ExportRecord,
  ExportBundleCore,
} from './exportBundleTypes';

export {
  makeExportId,
  makeArtifactId,
} from './exportBundleTypes';

// Factory Package Exporter
export type {
  FactoryPackageOutputFile,
  FactoryPackageExporter,
} from './factoryPackageExporter';

export {
  createStubFactoryPackageExporter,
} from './factoryPackageExporter';

// Factory Package Profiles
export type {
  FactoryProfileId,
  FactoryPackageProfile,
} from './factoryPackageProfiles';

export {
  DEFAULT_FACTORY_PROFILE,
  KDT_FACTORY_PROFILE,
  getFactoryProfile,
  listFactoryProfileIds,
} from './factoryPackageProfiles';

// Factory Package Planning
export type {
  PlannedSheet,
  PlannedCutListRow,
  PlannedCutList,
  PlannedReport,
  FactoryPackagePlan,
  PlanFactoryPackageInput,
} from './planFactoryPackage';

export {
  planFactoryPackage,
  validatePlan,
  getSheetByIndex,
  getSheetById,
} from './planFactoryPackage';

// MONOLITH Export Module (complete exporter with context provider)
export * from './monolith';

// OperationGraph to DXF (AGENT-T008: source of truth for DXF export)
export type {
  OperationGraphDxfOptions,
  OperationGraphDxfStats,
  DxfValidationResult,
} from './operationGraphToDxf';

export {
  operationGraphToDxf,
  getOperationGraphDxfStats,
  validateOperationGraphForDxf,
  operationGraphBatchToDxf,
} from './operationGraphToDxf';

// DXF Export from OperationGraph (AGENT-T008: FactoryPacket → OperationGraph → DXF)
export type {
  PanelDxfResult,
  DxfExportResult,
  DxfExportError,
  DxfExportFromPacketResult,
  DxfExportOptions,
} from './dxfExportFromOperationGraph';

export {
  exportDxfFromPacket,
  downloadDxfZipFromPacket,
  canExportDxfFromOperationGraph,
} from './dxfExportFromOperationGraph';

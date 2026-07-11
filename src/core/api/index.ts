/**
 * API Module Index
 *
 * Priority 2: Centralized API exports
 */

// Client
export {
  API_BASE_URL,
  USE_MOCK,
  ApiRequestError,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  checkHealth,
  testConnection,
} from './client';
export type { ApiError, ApiResponse, RequestOptions, HealthResponse } from './client';

// Verify API
export {
  uploadBundle,
  getVerifyReport,
  verifyCurrentSpec,
  getVerifyStatus,
  canProceedWithVerify,
} from './verifyApi';
export type {
  IssueSeverity,
  IssueStatus,
  VerifyIssue,
  VerifyReport,
  UploadBundleRequest,
  UploadBundleResponse,
  VerifyStatus,
} from './verifyApi';

// Export API
export {
  getExportOptions,
  createExportZip,
  downloadExportZip,
  queryAudit,
  getAuditStats,
  triggerDownload,
  exportAndDownload,
} from './exportApi';
export type {
  ExportFormat,
  CsvDialect,
  DxfVersion,
  GcodeProfile,
  CutlistCsvOptions,
  DxfOptions,
  GcodeOptions,
  ExportOptionsResponse,
  ExportZipRequest,
  ExportZipResponse,
  AuditStatus,
  AuditEntry,
  AuditQuery,
  AuditStats,
} from './exportApi';

// State API (P10/P11)
export {
  getJobState,
  freezeJob,
  releaseJob,
  revokeJob,
  checkCanExport,
  getSyncStatus,
  isServerReachable,
  getProofBundle,
} from './stateApi';
export type {
  ServerSpecState,
  StateResponse,
  CanExportResponse,
  TransitionRequest,
  SyncStatus,
  ProofBundle,
  ProofState,
  ProofVerify,
  ProofExport,
  ProofLineageHead,
  ProofWarning,
  ProofWarningCode,
} from './stateApi';
export { PROOF_VERSION } from './stateApi';

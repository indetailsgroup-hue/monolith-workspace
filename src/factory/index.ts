/**
 * Factory Module - Public API
 * P1.1 Factory Ops UX
 *
 * @version 0.12.0
 */

// Types
export type {
  JobStatus,
  GateStatus,
  SignatureStatus,
  AuditStatus,
  TrustStatus,
  MachineType,
  MaterialSummary,
  JobSummary,
  JobDetailData,
  // Verification - Factory Grade
  VerifyVerdict,
  VerifyResult, // @deprecated - use VerifyVerdict
  VerifyErrorCategory,
  VerifyErrorCode,
  VerifyApiResponse,
  VerifyDetails,
  VerifyResponse, // @deprecated - use VerifyApiResponse
  VerifyCheck,
  // Export
  ExportRequest,
  ExportResponse,
  // Activity
  ActivityType,
  ActivityLogEntry,
} from "./types/job";

// Type helpers
export {
  canVerify,
  canExport,
  canArchive,
  getStatusColor,
  getStatusLabel,
  getTrustColor,
  // Verify helpers
  getErrorCategory,
  isRetryable,
} from "./types/job";

// Store
export {
  useFactoryStore,
  selectJobs,
  selectSelectedJob,
  selectVerifyResult,
  selectVerifyByJobId,
  createSelectJobVerifyState,
  selectIncident,
} from "./state/factoryStore";

export type {
  JobFilter,
  JobSort,
  SortDirection,
  VerifyStatus,
  JobVerifyState,
} from "./state/factoryStore";

// Components
export { StatusBadge, StatusIcon } from "./components/StatusBadge";
export type { StatusBadgeProps, StatusIconProps } from "./components/StatusBadge";

export { TrustStrip, TrustBadge } from "./components/TrustStrip";
export type { TrustStripProps, TrustBadgeProps } from "./components/TrustStrip";

export { VerifyConsole } from "./components/VerifyConsole";
export type { VerifyConsoleProps } from "./components/VerifyConsole";

export { MachineSelector } from "./components/MachineSelector";
export type { MachineSelectorProps } from "./components/MachineSelector";

export { IncidentBanner } from "./components/IncidentBanner";
export type { IncidentBannerProps } from "./components/IncidentBanner";

export {
  ErrorPanel,
  ConnectionErrorPanel,
  NotFoundErrorPanel,
} from "./components/ErrorPanel";
export type { ErrorPanelProps } from "./components/ErrorPanel";

export {
  Skeleton,
  TextSkeleton,
  JobCardSkeleton,
  JobListSkeleton,
  DashboardHeaderSkeleton,
  JobDetailSkeleton,
  InfoCardSkeleton,
  VerifyConsoleSkeleton,
  DashboardPageSkeleton,
} from "./components/LoadingSkeleton";
export type { SkeletonProps, TextSkeletonProps, JobListSkeletonProps } from "./components/LoadingSkeleton";

// Layouts
export {
  FactoryLayout,
  PageContent,
  SplitLayout,
  CardGrid,
} from "./layouts/FactoryLayout";
export type {
  FactoryLayoutProps,
  PageContentProps,
  SplitLayoutProps,
  CardGridProps,
} from "./layouts/FactoryLayout";

// Pages
export { Dashboard } from "./pages/Dashboard";
export type { DashboardProps } from "./pages/Dashboard";

export { JobDetail } from "./pages/JobDetail";
export type { JobDetailProps } from "./pages/JobDetail";

// App (main entry point)
export { FactoryApp } from "./FactoryApp";
export type { FactoryAppProps } from "./FactoryApp";

// Normalizer utility
export {
  normalizeVerifyResult,
  normalizeError,
  EXIT_CODE_MAP,
  PATTERN_RULES,
} from "./utils/verifyNormalizer";
export type { VerifyRawResult } from "./utils/verifyNormalizer";

// Golden parser (for wrapper services)
export {
  parseGoldenOutput,
  validateGoldenKV,
  extractGoldenDetails,
  isGoldenFormat,
  buildGoldenOutput,
  buildTimeoutGolden,
  GOLDEN_HEADER,
  LOG_SEPARATOR,
  REQUIRED_KEYS,
  VALID_VERDICTS,
  OPTIONAL_KEYS,
} from "./utils/goldenParser";
export type {
  GoldenParseResult,
  GoldenValidationResult,
} from "./utils/goldenParser";

// Mock API (for development)
export {
  enableMockApi,
  disableMockApi,
  mockJobSummaries,
  getMockJobDetail,
  getMockVerifyResponse,
  getMockVerifyApiResponse,
  getMockExportResponse,
} from "./api/mockData";

// Phase C: Packet Ingest & Verify Components
export { PacketIngestPanel } from "./components/PacketIngestPanel";
export type { PacketIngestPanelProps } from "./components/PacketIngestPanel";

export { VerifiedCutListView } from "./components/VerifiedCutListView";
export type { VerifiedCutListViewProps } from "./components/VerifiedCutListView";

// Phase C: Packet Verification (re-export from packet module)
export {
  unzipPacket,
  unzipPacketFromFile,
  verifyPacket,
  verifyPacketFromFile,
  quickVerifyPacket,
  formatVerifyResult,
  getVerifyErrors,
  getVerifyWarnings,
  isValidZip,
} from "./packet";
export type {
  UnzipResult,
  VerifyPacketResult,
  VerifyCheck as PacketVerifyCheck, // Renamed to avoid conflict with types/job.ts VerifyCheck
  VerifyOptions,
} from "./packet";

// Server-side Verifier Integration (PR-P1.1-B.3)
// IMPORTANT: Server exports are NOT included in the browser bundle.
// For Node.js server environments, import directly from "./factory/server":
//   import { verifyJob, runVerifier, ... } from "./factory/server";
// This prevents Node.js modules (child_process, fs, path) from being bundled for browser.

// Phase D2.2: CNC G-code Generation
export { CncGeneratePanel, GcodePreviewPanel } from "./components/cnc";
export type { CncGeneratePanelProps, GcodePreviewPanelProps } from "./components/cnc";

export {
  generateGcodeForJob,
  buildOperationGraphPreview,
  getAvailableMachines,
  getDefaultMachineId,
  canGenerateGcode,
  getGenerationValidation,
} from "./cnc";
export type {
  CncCacheEntry,
  CncGenerationStatus,
  CncGenerateRequest,
  CncGenerateResponse,
  CncValidationIssue,
  CncMachineOption,
  CncErrorCode,
  GcodePreviewState,
} from "./cnc";

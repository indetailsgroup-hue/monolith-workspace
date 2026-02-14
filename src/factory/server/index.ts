/**
 * Factory Server Module - Backend Verifier Integration
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * This module provides server-side verification functionality:
 * - Spawn monolith-verify binary
 * - Handle timeouts and errors
 * - Normalize output to VerifyApiResponse
 * - Audit logging
 *
 * @version 0.12.0
 */

// Configuration
export {
  loadVerifyConfig,
  getVerifyConfig,
  clearConfigCache,
  isVerifyMockMode,
  createMockConfig,
  VerifyConfigError,
} from "./verifyConfig";
export type { VerifyConfig } from "./verifyConfig";

// Path Resolution
export {
  resolveVerifierBin,
  resolveProdKeys,
  getJobPacketDir,
  getJobPacketPath,
  getValidatedPacketPath,
  validateJobId,
  isValidJobId,
  fileExists,
  fileExistsSync,
  safeBasename,
  sanitizePathForLog,
  // Errors
  VerifierMissingError,
  KeysMissingError,
  PacketNotFoundError,
  PathTraversalError,
  InvalidJobIdError,
} from "./verifierPaths";

// Process Runner
export {
  runVerifier,
  combineOutput,
  isTimeout,
  isVerifierMissing,
  EXIT_CODE_TIMEOUT,
  EXIT_CODE_EXEC_ERROR,
} from "./runVerifier";
export type { RunVerifierArgs, RunVerifierResult } from "./runVerifier";

// Synthetic Golden Builder
export {
  buildSyntheticGolden,
  buildTimeoutGolden,
  buildExecErrorGolden,
  buildPacketMissingGolden,
  buildCrashGolden,
} from "./syntheticGolden";
export type {
  SyntheticGoldenParams,
  SyntheticGoldenResult,
} from "./syntheticGolden";

// Main Service
export { verifyJob, verifyJobs, VerifyServiceError } from "./verifyService";

// Audit Logging
export {
  recordVerifyRun,
  getRecentAuditEntries,
  getJobAuditEntries,
  getErrorAuditEntries,
  getSecurityAlertEntries,
  getAuditStats,
  clearAuditLog,
} from "./verifyAudit";
export type {
  VerifyAuditEntry,
  RecordVerifyRunParams,
} from "./verifyAudit";

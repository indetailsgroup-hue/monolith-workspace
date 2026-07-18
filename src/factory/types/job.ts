/**
 * Factory Job Types
 * P1.1 Factory Ops UX
 *
 * @version 0.11.2
 */

// ============================================================================
// Job Status State Machine
// ============================================================================
// SIGNED → verify(PASS) → VERIFIED → export → IN_PRODUCTION → complete → ARCHIVED
//       ↘ verify(FAIL) → BLOCKED
//
// Illegal transitions:
//   SIGNED → EXPORT ❌
//   BLOCKED → EXPORT ❌
// ============================================================================

export type JobStatus =
  | "SIGNED" // Ready for verification
  | "VERIFIED" // Passed verification, ready for export
  | "BLOCKED" // Failed verification, cannot proceed
  | "IN_PRODUCTION" // Exported to machine
  | "ARCHIVED"; // Completed

export type GateStatus = "PASS" | "FAIL" | "PENDING";
export type SignatureStatus = "VALID" | "INVALID" | "PENDING";
export type AuditStatus = "OK" | "MISSING" | "PENDING";

export interface TrustStatus {
  gate: GateStatus;
  signature: SignatureStatus;
  audit: AuditStatus;
}

export type MachineType = "KDT" | "BIESSE" | "HOMAG";

export interface MaterialSummary {
  code: string;
  name: string;
  thickness: number;
  sheetCount: number;
}

export interface JobSummary {
  jobId: string;
  projectName: string;
  customerName: string;
  status: JobStatus;
  trust: TrustStatus;
  panelCount: number;
  sheetCount: number;
  machineSupport: MachineType[];
  createdAt: string;
  updatedAt: string;
}

export interface JobDetailData extends JobSummary {
  packetUrl: string;
  materials: MaterialSummary[];
  estimatedRuntime: Record<MachineType, number>; // minutes
  toolCount: Record<MachineType, number>;
  verifyLog?: string;
  lastVerifiedAt?: string;
  lastExportedAt?: string;
  lastExportedMachine?: MachineType;
}

// ============================================================================
// Verification - Factory-Grade Edge Cases
// ============================================================================

/**
 * Verification Verdict
 * - PASS: Safe to produce
 * - FAIL: DO NOT produce
 * - PASS_WITH_WARN: Can produce but with warning (e.g., audit unknown)
 */
export type VerifyVerdict =
  | "PASS"
  | "FAIL"
  | "PASS_WITH_WARN"
  | "ERROR"
  // FS-B1-02: server storage-integrity check (whole-ZIP hash vs recorded
  // digest). Deliberately NOT "PASS": it proves bytes-at-rest only — no
  // signature, authority, gate, or NFP verification happened.
  | "STORAGE_HASH_MATCH";

/** @deprecated Use VerifyVerdict instead */
export type VerifyResult = VerifyVerdict;

/**
 * Error Categories (for operator understanding)
 * - SYSTEM: Infrastructure/tool issues (timeout, verifier missing)
 * - PACKET: File corruption/missing fields
 * - TRUST: Signature/key/audit failures
 * - GATE: Manufacturing rules failures (depth, tools, etc.)
 * - ENV: Machine profile/config mismatch
 */
export type VerifyErrorCategory = "SYSTEM" | "PACKET" | "TRUST" | "GATE" | "ENV";

/**
 * Factory-Grade Error Codes
 * Deterministic mapping from verifier output (canonical exit codes)
 *
 * Exit Code Ranges:
 *   0     = OK (PASS)
 *   31-34 = TRUST errors (key/signature/hash)
 *   40-43 = AUDIT errors (proof verification)
 *   50    = GATE errors (manufacturing rules)
 *   60-61 = PACKET errors (file format)
 *   70-71 = SYSTEM errors (verifier issues)
 *   80    = Warnings (PASS_WITH_WARN)
 *   90    = Unknown errors
 */
export type VerifyErrorCode =
  // SYSTEM errors (70-71)
  | "E_VERIFY_TIMEOUT"      // Exit 71: Verifier process exceeded timeout
  | "E_VERIFY_EXEC"         // Exit 70: Verifier binary missing/not executable
  | "E_VERIFY_CRASH"        // Verifier crashed unexpectedly
  | "E_VERIFY_UNKNOWN"      // Exit 90: Unknown verification error
  // PACKET errors (60-61)
  | "E_PACKET_PARSE"        // Exit 61: JSON parse failed
  | "E_PACKET_SCHEMA"       // Exit 60: Schema validation failed
  | "E_PACKET_CHECKSUM"     // Checksum mismatch
  | "E_PACKET_MISSING"      // Required files missing
  // TRUST errors - Signature/Key (31-34)
  | "E_SIGNATURE_INVALID"   // Exit 32: Signature verification failed
  | "E_KEY_NOT_ALLOWED"     // Exit 31: Key not in allowed keyset
  | "E_KEY_REVOKED"         // Key has been revoked
  | "E_KEY_EXPIRED"         // Key validity period expired
  | "E_ROOT_HASH_MISMATCH"  // Exit 33: Manifest/root hash mismatch (tamper)
  | "E_COUNT_MISMATCH"      // Exit 34: Package count mismatch
  // TRUST errors - Audit Proof (40-43)
  | "E_PROOF_SCHEMA_INVALID"    // Exit 40: Audit proof schema invalid
  | "E_PROOF_ROOT_MISMATCH"     // Exit 41: Audit proof root mismatch
  | "E_PROOF_SIGNATURE_INVALID" // Exit 42: Audit proof signature invalid
  | "E_PROOF_KEY_NOT_ALLOWED"   // Exit 43: Audit proof key not allowed
  // GATE errors (50)
  | "E_GATE_FAIL"           // Exit 50: Manufacturing rules failed
  | "E_GATE_DEPTH"          // Depth exceeds material thickness
  | "E_GATE_TOOL"           // Required tool not available
  | "E_GATE_CLEARANCE"      // Insufficient clearance
  // Warnings (80) - not blockers
  | "W_AUDIT_UNKNOWN"       // Exit 80: Audit verification unavailable (still PASS)
  | "W_AUDIT_PENDING"       // Audit not yet processed
  // Success (0)
  | "OK";                   // Exit 0: All checks passed

/**
 * Structured Verify API Response (v1)
 * Frontend renders based on this contract
 */
export interface VerifyApiResponse {
  /** Overall verdict: PASS | FAIL | PASS_WITH_WARN */
  verdict: VerifyVerdict;
  /** Error code for programmatic handling */
  code: VerifyErrorCode;
  /** Short operator-facing message (Thai) */
  summary: string;
  /** Human-readable error/status message */
  message?: string;
  /** Verifier stdout/stderr (VERBATIM - never rewrite) */
  log: string;
  /** Timestamp of verification */
  timestamp: string;
  /** Optional structured details for debugging */
  details?: VerifyDetails;
  /** Structured check results */
  checks: VerifyCheck[];
}

export interface VerifyDetails {
  publicKeyId?: string;
  manifestHash?: string;
  exitCode?: number;
  packetHash?: string;
  verifierVersion?: string;
  [key: string]: unknown;
}

/** @deprecated Use VerifyApiResponse instead */
export interface VerifyResponse {
  result: VerifyResult;
  verifierLog: string;
  timestamp: string;
  checks: VerifyCheck[];
}

export interface VerifyCheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message?: string;
}

/**
 * Error Category Mapping
 */
export function getErrorCategory(code: VerifyErrorCode): VerifyErrorCategory {
  // SYSTEM errors (verifier issues)
  if (code.startsWith("E_VERIFY_")) {
    return "SYSTEM";
  }
  // PACKET errors (file format)
  if (code.startsWith("E_PACKET_")) {
    return "PACKET";
  }
  // TRUST errors (signature, key, hash, proof)
  if (
    code.startsWith("E_SIGNATURE_") ||
    code.startsWith("E_KEY_") ||
    code.startsWith("E_ROOT_") ||
    code.startsWith("E_COUNT_") ||
    code.startsWith("E_PROOF_") ||
    code.startsWith("W_AUDIT_")
  ) {
    return "TRUST";
  }
  // GATE errors (manufacturing rules)
  if (code.startsWith("E_GATE_")) {
    return "GATE";
  }
  return "SYSTEM";
}

/**
 * Check if error code allows retry
 */
export function isRetryable(code: VerifyErrorCode): boolean {
  // Only SYSTEM errors and audit warnings allow retry
  const retryableCodes: VerifyErrorCode[] = [
    "E_VERIFY_TIMEOUT",
    "E_VERIFY_EXEC",
    "E_VERIFY_CRASH",
    "W_AUDIT_UNKNOWN",
    "W_AUDIT_PENDING",
  ];
  return retryableCodes.includes(code);
}

// ============================================================================
// Export
// ============================================================================

export interface ExportRequest {
  jobId: string;
  machine: MachineType;
  format: "per_sheet" | "per_job";
}

export interface ExportResponse {
  downloadUrl: string;
  filename: string;
  machine: MachineType;
  sheetCount: number;
  timestamp: string;
}

// ============================================================================
// Activity Log
// ============================================================================

export type ActivityType =
  | "JOB_RECEIVED"
  | "VERIFY_STARTED"
  | "VERIFY_PASSED"
  | "VERIFY_FAILED"
  | "EXPORT_STARTED"
  | "EXPORT_COMPLETED"
  | "STATUS_CHANGED";

export interface ActivityLogEntry {
  id: string;
  jobId: string;
  type: ActivityType;
  actor: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// State Machine Helpers
// ============================================================================

export function canVerify(status: JobStatus): boolean {
  return status === "SIGNED";
}

export function canExport(status: JobStatus): boolean {
  return status === "VERIFIED";
}

export function canArchive(status: JobStatus): boolean {
  return status === "IN_PRODUCTION";
}

export function getStatusColor(status: JobStatus): string {
  switch (status) {
    case "SIGNED":
      return "#22c55e"; // green - ready
    case "VERIFIED":
      return "#3b82f6"; // blue - verified
    case "BLOCKED":
      return "#ef4444"; // red - blocked
    case "IN_PRODUCTION":
      return "#f59e0b"; // amber - in progress
    case "ARCHIVED":
      return "#6b7280"; // gray - done
    default:
      return "#6b7280";
  }
}

export function getStatusLabel(status: JobStatus): string {
  switch (status) {
    case "SIGNED":
      return "พร้อมตรวจ";
    case "VERIFIED":
      return "ตรวจแล้ว";
    case "BLOCKED":
      return "ห้ามผลิต";
    case "IN_PRODUCTION":
      return "กำลังผลิต";
    case "ARCHIVED":
      return "เสร็จสิ้น";
    default:
      return status;
  }
}

export function getTrustColor(
  gate: GateStatus,
  signature: SignatureStatus
): string {
  if (gate === "FAIL" || signature === "INVALID") {
    return "#ef4444"; // red
  }
  if (gate === "PASS" && signature === "VALID") {
    return "#22c55e"; // green
  }
  return "#f59e0b"; // amber - pending
}

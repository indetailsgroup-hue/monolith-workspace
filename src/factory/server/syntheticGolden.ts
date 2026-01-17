/**
 * Synthetic Golden Output Builder
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Generates golden-format output for system errors (timeout, exec failure)
 * so the frontend always receives consistent VerifyApiResponse format.
 *
 * @version 0.12.0
 */

import { GOLDEN_HEADER, LOG_SEPARATOR } from "../utils/goldenParser";
import type { VerifyErrorCode } from "../types/job";

// ============================================================================
// Types
// ============================================================================

export interface SyntheticGoldenParams {
  /** Error code (E_VERIFY_TIMEOUT, E_VERIFY_EXEC, etc.) */
  code: VerifyErrorCode;
  /** Detailed error message for log */
  errorMessage: string;
  /** Job ID for context */
  jobId?: string;
  /** Duration in milliseconds (if available) */
  durationMs?: number;
  /** Timeout value that was exceeded (if timeout) */
  timeoutMs?: number;
}

export interface SyntheticGoldenResult {
  /** Golden-formatted stdout */
  stdout: string;
  /** Exit code to use */
  exitCode: number;
}

// ============================================================================
// Error Code to Exit Code Mapping
// Uses only valid VerifyErrorCode values from types/job.ts
// ============================================================================

const ERROR_TO_EXIT_CODE: Partial<Record<VerifyErrorCode, number>> = {
  // System errors (70-71)
  E_VERIFY_EXEC: 70,
  E_VERIFY_TIMEOUT: 71,
  E_VERIFY_CRASH: 70,
  E_VERIFY_UNKNOWN: 90,

  // Packet errors (60-61)
  E_PACKET_PARSE: 61,
  E_PACKET_SCHEMA: 60,
  E_PACKET_CHECKSUM: 61,
  E_PACKET_MISSING: 60,

  // Trust errors - Signature/Key (31-34)
  E_SIGNATURE_INVALID: 32,
  E_KEY_NOT_ALLOWED: 31,
  E_KEY_REVOKED: 31,
  E_KEY_EXPIRED: 34,
  E_ROOT_HASH_MISMATCH: 33,
  E_COUNT_MISMATCH: 34,

  // Trust errors - Audit Proof (40-43)
  E_PROOF_SCHEMA_INVALID: 40,
  E_PROOF_ROOT_MISMATCH: 41,
  E_PROOF_SIGNATURE_INVALID: 42,
  E_PROOF_KEY_NOT_ALLOWED: 43,

  // Gate errors (50)
  E_GATE_FAIL: 50,
  E_GATE_DEPTH: 50,
  E_GATE_TOOL: 50,
  E_GATE_CLEARANCE: 50,

  // Warnings (80)
  W_AUDIT_UNKNOWN: 80,
  W_AUDIT_PENDING: 80,
};

// ============================================================================
// Summary Messages (Thai)
// ============================================================================

const SUMMARY_MESSAGES: Partial<Record<VerifyErrorCode, string>> = {
  // System errors
  E_VERIFY_EXEC: "เรียกใช้ verifier ไม่สำเร็จ (ห้ามผลิต)",
  E_VERIFY_TIMEOUT: "ตรวจสอบเกินเวลา (ห้ามผลิต)",
  E_VERIFY_CRASH: "verifier หยุดทำงาน (ห้ามผลิต)",
  E_VERIFY_UNKNOWN: "เกิดข้อผิดพลาดไม่ทราบสาเหตุ (ห้ามผลิต)",

  // Packet errors
  E_PACKET_PARSE: "อ่าน packet ไม่ได้ (ห้ามผลิต)",
  E_PACKET_SCHEMA: "รูปแบบ packet ไม่ถูกต้อง (ห้ามผลิต)",
  E_PACKET_CHECKSUM: "checksum ไม่ตรงกัน (ห้ามผลิต)",
  E_PACKET_MISSING: "ไม่พบไฟล์ packet (ห้ามผลิต)",

  // Trust errors - Signature/Key
  E_SIGNATURE_INVALID: "ลายเซ็นดิจิทัลไม่ถูกต้อง (ห้ามผลิต)",
  E_KEY_NOT_ALLOWED: "กุญแจไม่ได้รับอนุญาต (ห้ามผลิต)",
  E_KEY_REVOKED: "กุญแจถูกเพิกถอน (ห้ามผลิต)",
  E_KEY_EXPIRED: "กุญแจหมดอายุ (ห้ามผลิต)",
  E_ROOT_HASH_MISMATCH: "root hash ไม่ตรงกัน (ห้ามผลิต)",
  E_COUNT_MISMATCH: "จำนวนไม่ตรงกัน (ห้ามผลิต)",

  // Trust errors - Audit Proof
  E_PROOF_SCHEMA_INVALID: "audit proof schema ไม่ถูกต้อง (ห้ามผลิต)",
  E_PROOF_ROOT_MISMATCH: "audit proof root ไม่ตรงกัน (ห้ามผลิต)",
  E_PROOF_SIGNATURE_INVALID: "audit proof signature ไม่ถูกต้อง (ห้ามผลิต)",
  E_PROOF_KEY_NOT_ALLOWED: "audit proof key ไม่ได้รับอนุญาต (ห้ามผลิต)",

  // Gate errors
  E_GATE_FAIL: "ไม่ผ่านเงื่อนไข Gate (ห้ามผลิต)",
  E_GATE_DEPTH: "ความลึกเกินความหนาวัสดุ (ห้ามผลิต)",
  E_GATE_TOOL: "ไม่มี tool ที่ต้องการ (ห้ามผลิต)",
  E_GATE_CLEARANCE: "clearance ไม่เพียงพอ (ห้ามผลิต)",

  // Warnings
  W_AUDIT_UNKNOWN: "ไม่สามารถตรวจสอบ audit ได้ (ผลิตได้แต่มีคำเตือน)",
  W_AUDIT_PENDING: "audit ยังไม่เสร็จ (ผลิตได้แต่มีคำเตือน)",
};

// ============================================================================
// Version Info
// ============================================================================

const TOOL_NAME = "factory-service";
const TOOL_VERSION = process.env.IIMOS_BUILD_SHA || "dev";

// ============================================================================
// Synthetic Golden Builder
// ============================================================================

/**
 * Build a synthetic golden output for system errors.
 *
 * This ensures the frontend always receives a golden-format response,
 * even when the verifier binary fails to run.
 */
export function buildSyntheticGolden(params: SyntheticGoldenParams): SyntheticGoldenResult {
  const {
    code,
    errorMessage,
    jobId,
    durationMs,
    timeoutMs,
  } = params;

  const timestamp = new Date().toISOString();
  const exitCode = ERROR_TO_EXIT_CODE[code] ?? 90;
  const summary = SUMMARY_MESSAGES[code] ?? "เกิดข้อผิดพลาดไม่ทราบสาเหตุ (ห้ามผลิต)";

  // Determine verdict based on code
  const isWarning = code.startsWith("W_");
  const verdict = isWarning ? "PASS_WITH_WARN" : "FAIL";

  // Build key-value section
  const kvLines = [
    GOLDEN_HEADER,
    `VERDICT=${verdict}`,
    `CODE=${code}`,
    `TOOL=${TOOL_NAME}`,
    `TOOL_VERSION=${TOOL_VERSION}`,
    `TIMESTAMP=${timestamp}`,
    `SUMMARY_TH=${summary}`,
  ];

  // Add optional fields
  if (jobId) {
    kvLines.push(`JOB_ID=${jobId}`);
  }
  if (durationMs !== undefined) {
    kvLines.push(`DURATION_MS=${durationMs}`);
  }
  if (timeoutMs !== undefined) {
    kvLines.push(`TIMEOUT_MS=${timeoutMs}`);
  }

  // Build log section
  const logLines = [
    LOG_SEPARATOR,
    `[${TOOL_NAME}] Synthetic error response`,
    `Error: ${errorMessage}`,
  ];

  if (code === "E_VERIFY_TIMEOUT" && timeoutMs) {
    logLines.push(`Timeout: Process exceeded ${Math.floor(timeoutMs / 1000)} seconds`);
  }

  if (code === "E_VERIFY_EXEC") {
    logLines.push(`Execution failed: Unable to start verifier process`);
    logLines.push(`Check that IIMOS_VERIFIER_BIN_PATH is correct and executable`);
  }

  logLines.push("");
  logLines.push("This is a synthetic response generated by factory-service.");
  logLines.push("The actual verifier binary did not produce output.");

  const stdout = [...kvLines, "", ...logLines].join("\n");

  return {
    stdout,
    exitCode,
  };
}

// ============================================================================
// Convenience Builders
// ============================================================================

/**
 * Build synthetic golden for timeout error
 */
export function buildTimeoutGolden(
  jobId: string,
  timeoutMs: number,
  durationMs: number
): SyntheticGoldenResult {
  return buildSyntheticGolden({
    code: "E_VERIFY_TIMEOUT",
    errorMessage: `Verification timed out after ${Math.floor(timeoutMs / 1000)} seconds`,
    jobId,
    durationMs,
    timeoutMs,
  });
}

/**
 * Build synthetic golden for exec error (binary not found, spawn failed)
 */
export function buildExecErrorGolden(
  jobId: string,
  errorMessage: string,
  durationMs?: number
): SyntheticGoldenResult {
  return buildSyntheticGolden({
    code: "E_VERIFY_EXEC",
    errorMessage,
    jobId,
    durationMs,
  });
}

/**
 * Build synthetic golden for packet not found
 */
export function buildPacketMissingGolden(
  jobId: string,
  packetPath: string
): SyntheticGoldenResult {
  return buildSyntheticGolden({
    code: "E_PACKET_MISSING",
    errorMessage: `Packet file not found: ${packetPath}`,
    jobId,
  });
}

/**
 * Build synthetic golden for crash/unknown error
 */
export function buildCrashGolden(
  jobId: string,
  errorMessage: string,
  durationMs?: number
): SyntheticGoldenResult {
  return buildSyntheticGolden({
    code: "E_VERIFY_CRASH",
    errorMessage,
    jobId,
    durationMs,
  });
}

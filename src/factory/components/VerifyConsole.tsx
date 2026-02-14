/**
 * VerifyConsole - Factory-Grade Verification UI
 * P1.1 Factory Ops UX - Heart of Factory Ops
 *
 * Rules:
 * - PASS = green, export enabled
 * - FAIL = red, export DISABLED
 * - PASS_WITH_WARN = green with warning badge
 * - Verifier output displayed VERBATIM (no rewording)
 *
 * Edge Cases Handled:
 * - SYSTEM: Timeout, verifier missing, crash
 * - PACKET: Corrupted, schema invalid, checksum fail
 * - TRUST: Signature invalid, key not allowed, key revoked
 * - GATE: Manufacturing rules fail
 *
 * @version 0.11.3
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import type {
  VerifyApiResponse,
  VerifyVerdict,
  VerifyErrorCode,
  VerifyErrorCategory,
  VerifyDetails,
} from "../types/job";
import { getErrorCategory, isRetryable } from "../types/job";
import { useFactoryStore } from "../state/factoryStore";

// ============================================================================
// Types
// ============================================================================

export interface VerifyConsoleProps {
  jobId: string;
  onVerifyComplete?: (result: VerifyApiResponse) => void;
  onVerifyError?: (code: VerifyErrorCode) => void;
  disabled?: boolean;
  /** Timeout in milliseconds (default: 60000 = 60s) */
  timeout?: number;
  /** Max retry attempts (default: 1) */
  maxRetries?: number;
}

// ============================================================================
// Error Messages (Thai + English + Action)
// ============================================================================

interface ErrorMessage {
  th: string;
  en: string;
  action: string;
  banner: string;
}

const ERROR_MESSAGES: Record<VerifyErrorCode, ErrorMessage> = {
  // SYSTEM
  E_VERIFY_TIMEOUT: {
    th: "หมดเวลาการตรวจสอบ",
    en: "Verification timed out",
    action: "ลอง Retry 1 ครั้ง ถ้ายังไม่ผ่าน ให้ใช้ Offline verifier",
    banner: "VERIFY TIMEOUT — ห้ามผลิต",
  },
  E_VERIFY_EXEC: {
    th: "ไม่พบโปรแกรม Verifier",
    en: "Verifier not available",
    action: "ติดต่อ IT Support เพื่อติดตั้ง/ซ่อม Verifier",
    banner: "VERIFIER NOT AVAILABLE — ต้องติดตั้ง/ซ่อมระบบ",
  },
  E_VERIFY_CRASH: {
    th: "โปรแกรม Verifier หยุดทำงาน",
    en: "Verifier crashed",
    action: "ลอง Retry หรือติดต่อ IT Support",
    banner: "VERIFIER CRASH — ห้ามผลิต",
  },
  E_VERIFY_UNKNOWN: {
    th: "ตรวจไม่สำเร็จ (unknown)",
    en: "Verification failed (unknown error)",
    action: "ติดต่อ IT Support พร้อมแนบ log",
    banner: "UNKNOWN ERROR — ห้ามผลิต",
  },
  // PACKET
  E_PACKET_PARSE: {
    th: "ไฟล์ Packet เสียหาย (อ่านไม่ได้)",
    en: "Packet file is corrupted (parse error)",
    action: "ติดต่อผู้ส่งงานเพื่อขอ Packet ใหม่",
    banner: "PACKET CORRUPTED — ห้ามผลิต",
  },
  E_PACKET_SCHEMA: {
    th: "ไฟล์ Packet ไม่ครบถ้วน",
    en: "Packet schema validation failed",
    action: "ติดต่อผู้ส่งงานเพื่อขอ Packet ใหม่",
    banner: "PACKET INVALID — ห้ามผลิต",
  },
  E_PACKET_CHECKSUM: {
    th: "Checksum ไม่ตรง (ไฟล์อาจถูกแก้)",
    en: "Packet checksum mismatch",
    action: "ดาวน์โหลด Packet ใหม่จาก source",
    banner: "CHECKSUM MISMATCH — ห้ามผลิต",
  },
  E_PACKET_MISSING: {
    th: "ไฟล์ใน Packet ไม่ครบ",
    en: "Required files missing in packet",
    action: "ติดต่อผู้ส่งงานเพื่อขอ Packet ใหม่",
    banner: "FILES MISSING — ห้ามผลิต",
  },
  // TRUST
  E_SIGNATURE_INVALID: {
    th: "ลายเซ็นดิจิทัลไม่ถูกต้อง",
    en: "Signature verification failed",
    action: "ห้ามรันเด็ดขาด — file อาจถูกแก้ไข",
    banner: "SIGNATURE INVALID — ห้ามผลิต",
  },
  E_KEY_NOT_ALLOWED: {
    th: "Key ที่ใช้ไม่อยู่ในรายการอนุญาต",
    en: "Signing key not in allowed keyset",
    action: "อัปเดต Keyset หรือติดต่อ IT Support",
    banner: "KEY NOT ALLOWED — ต้องอัปเดต Keyset",
  },
  E_KEY_REVOKED: {
    th: "Key ถูกเพิกถอนแล้ว",
    en: "Signing key has been revoked",
    action: "ติดต่อผู้ส่งงานเพื่อ re-sign ด้วย key ใหม่",
    banner: "KEY REVOKED — ห้ามผลิต",
  },
  E_KEY_EXPIRED: {
    th: "Key หมดอายุแล้ว",
    en: "Signing key has expired",
    action: "ติดต่อผู้ส่งงานเพื่อ re-sign ด้วย key ใหม่",
    banner: "KEY EXPIRED — ห้ามผลิต",
  },
  E_ROOT_HASH_MISMATCH: {
    th: "ข้อมูลถูกแก้ไขหลังเซ็น",
    en: "Manifest root hash mismatch",
    action: "ห้ามรันเด็ดขาด — file ถูก tamper",
    banner: "HASH MISMATCH — ห้ามผลิต",
  },
  E_COUNT_MISMATCH: {
    th: "แพ็กเกจไม่ครบ/จำนวนไม่ตรง",
    en: "Panel/file count mismatch",
    action: "ดาวน์โหลด Packet ใหม่จาก source",
    banner: "COUNT MISMATCH — ห้ามผลิต",
  },
  // TRUST - Audit Proof
  E_PROOF_SCHEMA_INVALID: {
    th: "หลักฐาน audit รูปแบบผิด",
    en: "Audit proof schema invalid",
    action: "ติดต่อ IT Support เพื่อตรวจสอบ audit server",
    banner: "PROOF INVALID — ห้ามผลิต",
  },
  E_PROOF_ROOT_MISMATCH: {
    th: "หลักฐาน audit ไม่ตรงกับ root",
    en: "Audit proof root mismatch",
    action: "ห้ามรันเด็ดขาด — audit ไม่ match",
    banner: "PROOF MISMATCH — ห้ามผลิต",
  },
  E_PROOF_SIGNATURE_INVALID: {
    th: "ลายเซ็น audit ไม่ถูกต้อง",
    en: "Audit proof signature invalid",
    action: "ห้ามรันเด็ดขาด — audit signature fail",
    banner: "PROOF SIG FAIL — ห้ามผลิต",
  },
  E_PROOF_KEY_NOT_ALLOWED: {
    th: "คีย์ audit ไม่อนุญาต",
    en: "Audit proof key not allowed",
    action: "อัปเดต Keyset หรือติดต่อ IT Support",
    banner: "PROOF KEY FAIL — ห้ามผลิต",
  },
  // GATE
  E_GATE_FAIL: {
    th: "ไม่ผ่านเกณฑ์การผลิต",
    en: "Manufacturing gate check failed",
    action: "ส่งกลับให้ Designer แก้ไข",
    banner: "GATE FAIL — ห้ามผลิต",
  },
  E_GATE_DEPTH: {
    th: "ความลึกเกินความหนาวัสดุ",
    en: "Cut depth exceeds material thickness",
    action: "ส่งกลับให้ Designer แก้ไข depth",
    banner: "DEPTH ERROR — ห้ามผลิต",
  },
  E_GATE_TOOL: {
    th: "ไม่มี tool ที่ต้องใช้",
    en: "Required tool not available",
    action: "ตรวจสอบ tool ในเครื่อง หรือติดต่อ Designer",
    banner: "TOOL MISSING — ห้ามผลิต",
  },
  E_GATE_CLEARANCE: {
    th: "ระยะห่างไม่เพียงพอ",
    en: "Insufficient clearance",
    action: "ส่งกลับให้ Designer แก้ไข spacing",
    banner: "CLEARANCE ERROR — ห้ามผลิต",
  },
  // Warnings
  W_AUDIT_UNKNOWN: {
    th: "ตรวจ Audit ไม่ได้ (offline)",
    en: "Audit verification unavailable",
    action: "ผลิตได้ แต่บันทึกตรวจย้อนหลังยังไม่สมบูรณ์",
    banner: "AUDIT UNKNOWN — ผลิตได้ (มีคำเตือน)",
  },
  W_AUDIT_PENDING: {
    th: "Audit กำลังประมวลผล",
    en: "Audit verification pending",
    action: "รอ Audit เสร็จ หรือผลิตได้เลย",
    banner: "AUDIT PENDING — ผลิตได้ (มีคำเตือน)",
  },
  // Success
  OK: {
    th: "ผ่านทุกการตรวจสอบ",
    en: "All checks passed",
    action: "พร้อมผลิต",
    banner: "PASS — พร้อมผลิต",
  },
};

// Category colors and labels
const CATEGORY_INFO: Record<VerifyErrorCategory, { color: string; label: string; icon: string }> = {
  SYSTEM: { color: "#f59e0b", label: "SYSTEM", icon: "⚙️" },
  PACKET: { color: "#ef4444", label: "PACKET", icon: "📦" },
  TRUST: { color: "#ef4444", label: "TRUST", icon: "🔐" },
  GATE: { color: "#ef4444", label: "GATE", icon: "🚧" },
  ENV: { color: "#3b82f6", label: "ENV", icon: "🏭" },
};

// ============================================================================
// Main Component
// ============================================================================

export function VerifyConsole({
  jobId,
  onVerifyComplete,
  onVerifyError,
  disabled = false,
  timeout = 60000,
  maxRetries = 1,
}: VerifyConsoleProps): React.ReactElement {
  const {
    verifying,
    startVerify,
    clearVerifyResult,
    setVerifying,
    setJobVerifyStatus,
    setJobVerifyResponse,
    getJobVerifyState,
  } = useFactoryStore();

  const [apiResponse, setApiResponse] = useState<VerifyApiResponse | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showOfflineSteps, setShowOfflineSteps] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load cached verify state on mount
  useEffect(() => {
    const cachedState = getJobVerifyState(jobId);
    if (cachedState.response) {
      setApiResponse(cachedState.response);
      setRetryCount(cachedState.retryCount);
    }
  }, [jobId, getJobVerifyState]);

  // Elapsed time counter
  useEffect(() => {
    if (verifying) {
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [verifying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleVerify = useCallback(async () => {
    setApiResponse(null);
    setJobVerifyStatus(jobId, "RUNNING");
    abortControllerRef.current = new AbortController();

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("TIMEOUT"));
      }, timeout);
    });

    try {
      // Race between verify and timeout
      // startVerify now returns VerifyApiResponse directly
      const response = await Promise.race([
        startVerify(jobId),
        timeoutPromise,
      ]);

      setApiResponse(response);
      setJobVerifyResponse(jobId, response);
      setRetryCount(0);
      onVerifyComplete?.(response);
    } catch (err) {
      const response = parseErrorToApiResponse(err, timeout);
      setApiResponse(response);
      setJobVerifyResponse(jobId, response);
      onVerifyError?.(response.code);
    }
  }, [jobId, startVerify, timeout, onVerifyComplete, onVerifyError, setJobVerifyStatus, setJobVerifyResponse]);

  const handleRetry = useCallback(() => {
    if (apiResponse && isRetryable(apiResponse.code) && retryCount < maxRetries) {
      setRetryCount((c) => c + 1);
      setApiResponse(null);
      clearVerifyResult();
      handleVerify();
    }
  }, [apiResponse, retryCount, maxRetries, clearVerifyResult, handleVerify]);

  const handleClear = useCallback(() => {
    clearVerifyResult();
    setApiResponse(null);
    setShowFullLog(false);
    setShowDetails(false);
    setRetryCount(0);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, [clearVerifyResult]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setVerifying(false);
    setApiResponse({
      verdict: "FAIL",
      code: "E_VERIFY_TIMEOUT",
      summary: "ยกเลิกโดยผู้ใช้",
      log: "Verification cancelled by user",
      timestamp: new Date().toISOString(),
      checks: [],
    });
  }, [setVerifying]);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const canRetry = apiResponse && isRetryable(apiResponse.code) && retryCount < maxRetries;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          🔍 Packet Verification
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowOfflineSteps(true)}
            style={{
              padding: "4px 12px",
              backgroundColor: "transparent",
              border: "1px solid #3a3a5a",
              borderRadius: 6,
              color: "#888",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Offline Steps
          </button>
          {apiResponse && !verifying && (
            <button
              onClick={handleClear}
              style={{
                padding: "4px 12px",
                backgroundColor: "transparent",
                border: "1px solid #3a3a5a",
                borderRadius: 6,
                color: "#888",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Verify Button */}
      {!apiResponse && !verifying && (
        <VerifyButton onClick={handleVerify} disabled={disabled} />
      )}

      {/* Loading State with Progress */}
      {verifying && (
        <VerifyProgress
          elapsedTime={elapsedTime}
          timeout={timeout}
          onCancel={handleCancel}
        />
      )}

      {/* Result Display */}
      {apiResponse && !verifying && (
        <>
          {/* Verdict Banner */}
          <VerdictBanner
            verdict={apiResponse.verdict}
            code={apiResponse.code}
            summary={apiResponse.summary}
          />

          {/* Category Badge */}
          {apiResponse.code !== "OK" && (
            <CategoryBadge code={apiResponse.code} />
          )}

          {/* Action Hint */}
          <ActionHint code={apiResponse.code} />

          {/* Verifier Log (VERBATIM) */}
          <VerifierLog
            log={apiResponse.log}
            verdict={apiResponse.verdict}
            showFullLog={showFullLog}
            onToggle={() => setShowFullLog(!showFullLog)}
            onCopy={() => handleCopy(apiResponse.log, "log")}
            copied={copied === "log"}
          />

          {/* Details Viewer */}
          {apiResponse.details && (
            <DetailsViewer
              details={apiResponse.details}
              showDetails={showDetails}
              onToggle={() => setShowDetails(!showDetails)}
              onCopy={() => handleCopy(JSON.stringify(apiResponse.details, null, 2), "details")}
              copied={copied === "details"}
            />
          )}

          {/* Checks List */}
          {apiResponse.checks.length > 0 && (
            <VerifyChecks checks={apiResponse.checks} />
          )}

          {/* Retry Button */}
          {canRetry && (
            <RetryButton
              onClick={handleRetry}
              retryCount={retryCount}
              maxRetries={maxRetries}
            />
          )}

          {/* Max Retries Reached */}
          {apiResponse.code !== "OK" && !canRetry && isRetryable(apiResponse.code) && (
            <MaxRetriesReached maxRetries={maxRetries} />
          )}
        </>
      )}

      {/* Offline Steps Modal */}
      {showOfflineSteps && (
        <OfflineStepsModal onClose={() => setShowOfflineSteps(false)} />
      )}
    </div>
  );
}

// ============================================================================
// Response Converters
// ============================================================================

function parseErrorToApiResponse(err: unknown, timeoutMs: number): VerifyApiResponse {
  let code: VerifyErrorCode = "E_VERIFY_CRASH";
  let log = "Unknown error occurred";

  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    log = err.message + (err.stack ? `\n\n${err.stack}` : "");

    if (message === "timeout" || message.includes("timeout")) {
      code = "E_VERIFY_TIMEOUT";
      log = `Verification exceeded ${Math.floor(timeoutMs / 1000)} seconds timeout`;
    } else if (message.includes("network") || message.includes("fetch") || message.includes("connection")) {
      code = "E_VERIFY_EXEC";
    } else if (message.includes("corrupt") || message.includes("invalid zip") || message.includes("malformed")) {
      code = "E_PACKET_PARSE";
    } else if (message.includes("schema") || message.includes("missing field")) {
      code = "E_PACKET_SCHEMA";
    } else if (message.includes("signature") || message.includes("invalid sign")) {
      code = "E_SIGNATURE_INVALID";
    } else if (message.includes("key not allowed") || message.includes("unknown key")) {
      code = "E_KEY_NOT_ALLOWED";
    } else if (message.includes("500") || message.includes("502") || message.includes("503")) {
      code = "E_VERIFY_CRASH";
    }
  }

  return {
    verdict: "FAIL",
    code,
    summary: ERROR_MESSAGES[code].th,
    log,
    timestamp: new Date().toISOString(),
    checks: [],
  };
}

// ============================================================================
// Verify Button
// ============================================================================

interface VerifyButtonProps {
  onClick: () => void;
  disabled: boolean;
}

function VerifyButton({ onClick, disabled }: VerifyButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "16px 24px",
        backgroundColor: disabled ? "#3a3a5a" : "#8b5cf6",
        border: "none",
        borderRadius: 8,
        color: "#fff",
        fontSize: 16,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s",
      }}
    >
      <span style={{ fontSize: 20 }}>✓</span>
      <span>VERIFY PACKET</span>
    </button>
  );
}

// ============================================================================
// Verify Progress
// ============================================================================

interface VerifyProgressProps {
  elapsedTime: number;
  timeout: number;
  onCancel: () => void;
}

function VerifyProgress({ elapsedTime, timeout, onCancel }: VerifyProgressProps): React.ReactElement {
  const timeoutSeconds = Math.floor(timeout / 1000);
  const progress = Math.min((elapsedTime / timeoutSeconds) * 100, 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        backgroundColor: "#8b5cf620",
        border: "1px solid #8b5cf640",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <LoadingSpinner size={24} />
        <span style={{ fontSize: 16, fontWeight: 600, color: "#8b5cf6" }}>
          กำลังตรวจสอบ Packet...
        </span>
      </div>

      <div style={{ height: 6, backgroundColor: "#3a3a5a", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: progress > 80 ? "#f59e0b" : "#8b5cf6",
            transition: "width 1s linear",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888" }}>
        <span>Elapsed: {elapsedTime}s</span>
        <span>Timeout: {timeoutSeconds}s</span>
      </div>

      <button
        onClick={onCancel}
        style={{
          padding: "8px 16px",
          backgroundColor: "transparent",
          border: "1px solid #ef4444",
          borderRadius: 6,
          color: "#ef4444",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Cancel Verification
      </button>
    </div>
  );
}

// ============================================================================
// Verdict Banner
// ============================================================================

interface VerdictBannerProps {
  verdict: VerifyVerdict;
  code: VerifyErrorCode;
  summary: string;
}

function VerdictBanner({ verdict, code, summary }: VerdictBannerProps): React.ReactElement {
  const isPass = verdict === "PASS";
  const isWarn = verdict === "PASS_WITH_WARN";
  const bgColor = isPass ? "#22c55e20" : isWarn ? "#f59e0b20" : "#ef444420";
  const borderColor = isPass ? "#22c55e" : isWarn ? "#f59e0b" : "#ef4444";
  const textColor = isPass ? "#22c55e" : isWarn ? "#f59e0b" : "#ef4444";
  const icon = isPass ? "✓" : isWarn ? "⚠" : "✕";
  const banner = ERROR_MESSAGES[code]?.banner || summary;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 20,
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: 12,
      }}
    >
      <span style={{ fontSize: 32, color: textColor }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: textColor }}>
          {verdict}
        </span>
        <span style={{ fontSize: 14, color: textColor }}>
          {banner}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Category Badge
// ============================================================================

interface CategoryBadgeProps {
  code: VerifyErrorCode;
}

function CategoryBadge({ code }: CategoryBadgeProps): React.ReactElement {
  const category = getErrorCategory(code);
  const info = CATEGORY_INFO[category];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        backgroundColor: `${info.color}20`,
        border: `1px solid ${info.color}40`,
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color: info.color,
        alignSelf: "flex-start",
      }}
    >
      <span>{info.icon}</span>
      <span>{info.label}</span>
      <span style={{ opacity: 0.7 }}>|</span>
      <span style={{ fontFamily: "monospace" }}>{code}</span>
    </div>
  );
}

// ============================================================================
// Action Hint
// ============================================================================

interface ActionHintProps {
  code: VerifyErrorCode;
}

function ActionHint({ code }: ActionHintProps): React.ReactElement {
  const message = ERROR_MESSAGES[code];

  return (
    <div
      style={{
        padding: "10px 14px",
        backgroundColor: "#0a0a15",
        borderRadius: 8,
        fontSize: 13,
        color: "#ccc",
      }}
    >
      <span style={{ marginRight: 8 }}>💡</span>
      {message.action}
    </div>
  );
}

// ============================================================================
// Verifier Log
// ============================================================================

interface VerifierLogProps {
  log: string;
  verdict: VerifyVerdict;
  showFullLog: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}

function VerifierLog({ log, verdict, showFullLog, onToggle, onCopy, copied }: VerifierLogProps): React.ReactElement {
  const isPass = verdict === "PASS" || verdict === "PASS_WITH_WARN";
  const borderColor = isPass ? "#22c55e40" : "#ef444440";
  const textColor = isPass ? "#22c55e" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#888", textTransform: "uppercase" }}>
          Verifier Output (VERBATIM)
        </span>
        <button
          onClick={onCopy}
          style={{
            padding: "4px 8px",
            backgroundColor: "transparent",
            border: "1px solid #3a3a5a",
            borderRadius: 4,
            color: copied ? "#22c55e" : "#888",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
      </div>
      <div
        style={{
          padding: 12,
          backgroundColor: "#0a0a15",
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 12,
          color: textColor,
          whiteSpace: "pre-wrap",
          maxHeight: showFullLog ? "none" : 150,
          overflow: "hidden",
        }}
      >
        {log}
      </div>
      {log.length > 200 && (
        <button
          onClick={onToggle}
          style={{
            padding: "4px 8px",
            backgroundColor: "transparent",
            border: "none",
            color: "#888",
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "underline",
            alignSelf: "flex-start",
          }}
        >
          {showFullLog ? "Show less" : "Show full log"}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Details Viewer
// ============================================================================

interface DetailsViewerProps {
  details: VerifyDetails;
  showDetails: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}

function DetailsViewer({ details, showDetails, onToggle, onCopy, copied }: DetailsViewerProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          backgroundColor: "#0a0a15",
          border: "1px solid #3a3a5a",
          borderRadius: 6,
          color: "#888",
          fontSize: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>{showDetails ? "▼" : "▶"}</span>
        <span>Technical Details</span>
        {showDetails && (
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(); }}
            style={{
              marginLeft: "auto",
              padding: "2px 6px",
              backgroundColor: "transparent",
              border: "1px solid #3a3a5a",
              borderRadius: 4,
              color: copied ? "#22c55e" : "#666",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {copied ? "✓" : "📋"}
          </button>
        )}
      </button>
      {showDetails && (
        <div
          style={{
            padding: 12,
            backgroundColor: "#0a0a15",
            border: "1px solid #3a3a5a",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#888",
          }}
        >
          {Object.entries(details).map(([key, value]) => (
            <div key={key} style={{ marginBottom: 4 }}>
              <span style={{ color: "#666" }}>{key}:</span>{" "}
              <span style={{ color: "#ccc" }}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Verify Checks
// ============================================================================

interface VerifyChecksProps {
  checks: VerifyApiResponse["checks"];
}

function VerifyChecks({ checks }: VerifyChecksProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase" }}>
        Verification Checks
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {checks.map((check, index) => {
          const isPass = check.status === "PASS";
          const isWarn = check.status === "WARN";
          const color = isPass ? "#22c55e" : isWarn ? "#f59e0b" : "#ef4444";
          const icon = isPass ? "✓" : isWarn ? "⚠" : "✕";

          return (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                backgroundColor: `${color}10`,
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 14, color }}>{icon}</span>
              <span style={{ fontSize: 13, color: "#ccc", flex: 1 }}>{check.name}</span>
              {check.message && (
                <span style={{ fontSize: 11, color: "#888" }}>{check.message}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Retry Button
// ============================================================================

interface RetryButtonProps {
  onClick: () => void;
  retryCount: number;
  maxRetries: number;
}

function RetryButton({ onClick, retryCount, maxRetries }: RetryButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 20px",
        backgroundColor: "#8b5cf6",
        border: "none",
        borderRadius: 8,
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      🔄 ลองอีกครั้ง ({retryCount + 1}/{maxRetries + 1})
    </button>
  );
}

// ============================================================================
// Max Retries Reached
// ============================================================================

interface MaxRetriesReachedProps {
  maxRetries: number;
}

function MaxRetriesReached({ maxRetries }: MaxRetriesReachedProps): React.ReactElement {
  return (
    <div
      style={{
        padding: "8px 12px",
        backgroundColor: "#ef444420",
        border: "1px solid #ef444440",
        borderRadius: 6,
        fontSize: 13,
        color: "#ef4444",
        textAlign: "center",
      }}
    >
      ลองใหม่ครบ {maxRetries + 1} ครั้งแล้ว กรุณาติดต่อ IT Support
    </div>
  );
}

// ============================================================================
// Offline Steps Modal
// ============================================================================

interface OfflineStepsModalProps {
  onClose: () => void;
}

function OfflineStepsModal({ onClose }: OfflineStepsModalProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const command = `monolith-verify verify packet.json --keys production.pubkeys.v1.json`;

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 500,
          backgroundColor: "#1a1a2e",
          border: "1px solid #3a3a5a",
          borderRadius: 12,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 18 }}>
            📟 Offline Verification Steps
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: "4px 8px",
              backgroundColor: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <StepItem number={1}>
            วาง <code>packet.json</code> + <code>production.pubkeys.v1.json</code> ไว้โฟลเดอร์เดียวกัน
          </StepItem>

          <StepItem number={2}>
            เปิด CMD/Terminal ในโฟลเดอร์นั้น
          </StepItem>

          <StepItem number={3}>
            <div style={{ marginBottom: 8 }}>รันคำสั่ง:</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                backgroundColor: "#0a0a15",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 12,
                color: "#22c55e",
              }}
            >
              <span style={{ flex: 1, overflow: "auto" }}>{command}</span>
              <button
                onClick={handleCopy}
                style={{
                  padding: "4px 8px",
                  backgroundColor: "transparent",
                  border: "1px solid #3a3a5a",
                  borderRadius: 4,
                  color: copied ? "#22c55e" : "#888",
                  fontSize: 11,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
          </StepItem>

          <StepItem number={4}>
            <strong style={{ color: "#22c55e" }}>PASS</strong> เท่านั้นจึงผลิตได้
          </StepItem>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "10px 14px",
            backgroundColor: "#ef444420",
            border: "1px solid #ef444440",
            borderRadius: 8,
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          ⚠️ <strong>สำคัญ:</strong> ตรวจไม่จบ = ถือว่าไม่ผ่าน = ห้ามผลิต
        </div>
      </div>
    </div>
  );
}

interface StepItemProps {
  number: number;
  children: React.ReactNode;
}

function StepItem({ number, children }: StepItemProps): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          backgroundColor: "#8b5cf6",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {number}
      </div>
      <div style={{ fontSize: 14, color: "#ccc", paddingTop: 2 }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Loading Spinner
// ============================================================================

interface LoadingSpinnerProps {
  size?: number;
}

function LoadingSpinner({ size = 18 }: LoadingSpinnerProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `2px solid #ffffff40`,
        borderTop: `2px solid #fff`,
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    >
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}

// Re-export types for backward compatibility
export type { VerifyApiResponse, VerifyVerdict, VerifyErrorCode };

export default VerifyConsole;

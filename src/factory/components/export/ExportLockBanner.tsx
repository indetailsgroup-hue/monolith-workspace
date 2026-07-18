/**
 * Export Lock Banner - Shows export locked state when verify not PASS
 * P2.2 Export UX (Gated)
 *
 * @version 0.12.0
 */

import React from "react";
import type { VerifyApiResponse } from "../../types/job";

// ============================================================================
// Types
// ============================================================================

interface ExportLockBannerProps {
  /** Current verify result for this job */
  verifyResult: VerifyApiResponse | null;
  /** Job status from job data */
  jobStatus: string;
  /** Callback to trigger verify */
  onRunVerify?: () => void;
  /** Whether verify is currently running */
  isVerifying?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function isVerifyPassed(result: VerifyApiResponse | null): boolean {
  if (!result) return false;
  // STORAGE_HASH_MATCH: bytes-at-rest integrity — enough to export the stored
  // packet, not a manufacturing verification (FS-B1-02)
  return (
    result.verdict === "PASS" ||
    result.verdict === "PASS_WITH_WARN" ||
    result.verdict === "STORAGE_HASH_MATCH"
  );
}

function getLockedReason(
  result: VerifyApiResponse | null,
  jobStatus: string
): string {
  if (!result) {
    return "Verification required before export";
  }
  if (result.verdict === "FAIL") {
    return result.summary || "Verification failed - export blocked";
  }
  if (jobStatus === "BLOCKED") {
    return "Job is blocked - export not available";
  }
  return "Unknown lock reason";
}

// ============================================================================
// Component
// ============================================================================

export function ExportLockBanner({
  verifyResult,
  jobStatus,
  onRunVerify,
  isVerifying = false,
}: ExportLockBannerProps) {
  const isPassed = isVerifyPassed(verifyResult);

  // Don't show banner if export is unlocked
  if (isPassed && jobStatus !== "BLOCKED") {
    return null;
  }

  const lockedReason = getLockedReason(verifyResult, jobStatus);
  const canVerify = !isVerifying && jobStatus !== "BLOCKED";

  return (
    <div style={styles.container}>
      <div style={styles.iconContainer}>
        <LockIcon />
      </div>
      <div style={styles.content}>
        <div style={styles.title}>Export Locked</div>
        <div style={styles.reason}>{lockedReason}</div>
        {verifyResult?.code && (
          <div style={styles.code}>Code: {verifyResult.code}</div>
        )}
      </div>
      {canVerify && onRunVerify && (
        <button
          style={styles.verifyButton}
          onClick={onRunVerify}
          disabled={isVerifying}
        >
          {isVerifying ? "Verifying..." : "Run Verify"}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function LockIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px 20px",
    background: "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
    borderRadius: "8px",
    border: "1px solid #dc2626",
    marginBottom: "16px",
  },
  iconContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    background: "rgba(0, 0, 0, 0.2)",
    color: "#fecaca",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fecaca",
    marginBottom: "4px",
  },
  reason: {
    fontSize: "13px",
    color: "#fca5a5",
    lineHeight: 1.4,
  },
  code: {
    fontSize: "11px",
    color: "#f87171",
    marginTop: "4px",
    fontFamily: "monospace",
  },
  verifyButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #fca5a5",
    background: "rgba(0, 0, 0, 0.3)",
    color: "#fecaca",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    flexShrink: 0,
  },
};

export default ExportLockBanner;

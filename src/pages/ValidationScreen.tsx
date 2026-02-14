/**
 * ValidationScreen - Server-Authoritative Verification UI
 * P2.1 Factory Ops UX
 *
 * Calls real backend verify API - no local fallback.
 * Shows verdict/summary + verbatim log from verifier.
 *
 * @version 0.12.0
 */

import React, { useState, useCallback } from "react";
import { verifyJobApi } from "../factory/api/verifyApi";
import type {
  VerifyApiResponse,
  VerifyVerdict,
  VerifyErrorCode,
} from "../factory/types/job";
import { getErrorCategory, isRetryable } from "../factory/types/job";

// ============================================================================
// Types
// ============================================================================

interface ValidationScreenProps {
  jobId: string;
}

type LoadingState = "idle" | "loading" | "done" | "error";

// ============================================================================
// Verdict Pill Component
// ============================================================================

interface VerdictPillProps {
  verdict: VerifyVerdict;
  code: VerifyErrorCode;
}

function VerdictPill({ verdict, code }: VerdictPillProps) {
  const getVerdictStyle = (): React.CSSProperties => {
    switch (verdict) {
      case "PASS":
        return {
          background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          color: "white",
        };
      case "PASS_WITH_WARN":
        return {
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          color: "white",
        };
      case "FAIL":
        return {
          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          color: "white",
        };
      default:
        return {
          background: "#374151",
          color: "white",
        };
    }
  };

  const getVerdictIcon = (): string => {
    switch (verdict) {
      case "PASS":
        return "\u2713"; // checkmark
      case "PASS_WITH_WARN":
        return "\u26A0"; // warning
      case "FAIL":
        return "\u2717"; // X
      default:
        return "\u2717";
    }
  };

  const getVerdictLabel = (): string => {
    switch (verdict) {
      case "PASS":
        return "PASS - Safe to Produce";
      case "PASS_WITH_WARN":
        return "PASS WITH WARNING";
      case "FAIL":
        return "FAIL - DO NOT PRODUCE";
      default:
        return String(verdict);
    }
  };

  return (
    <div style={styles.verdictContainer}>
      <div style={{ ...styles.verdictPill, ...getVerdictStyle() }}>
        <span style={styles.verdictIcon}>{getVerdictIcon()}</span>
        <span style={styles.verdictLabel}>{getVerdictLabel()}</span>
      </div>
      <div style={styles.codeRow}>
        <span style={styles.codeLabel}>Code:</span>
        <code style={styles.codeValue}>{code}</code>
        <span style={styles.categoryBadge}>{getErrorCategory(code)}</span>
        {isRetryable(code) && <span style={styles.retryBadge}>Retryable</span>}
      </div>
    </div>
  );
}

// ============================================================================
// Check Item Component
// ============================================================================

interface CheckItemProps {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message?: string;
}

function CheckItem({ name, status, message }: CheckItemProps) {
  const getStatusIcon = (): string => {
    switch (status) {
      case "PASS":
        return "\u2713";
      case "WARN":
        return "\u26A0";
      case "FAIL":
        return "\u2717";
    }
  };

  const getStatusColor = (): string => {
    switch (status) {
      case "PASS":
        return "#22c55e";
      case "WARN":
        return "#f59e0b";
      case "FAIL":
        return "#ef4444";
    }
  };

  return (
    <div style={styles.checkItem}>
      <span style={{ ...styles.checkIcon, color: getStatusColor() }}>
        {getStatusIcon()}
      </span>
      <span style={styles.checkName}>{name}</span>
      {message && <span style={styles.checkMessage}>{message}</span>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ValidationScreen({ jobId }: ValidationScreenProps) {
  const [state, setState] = useState<LoadingState>("idle");
  const [result, setResult] = useState<VerifyApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const runVerify = useCallback(async () => {
    setState("loading");
    setError(null);
    setResult(null);

    try {
      const response = await verifyJobApi(jobId);
      setResult(response);
      setState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setState("error");
    }
  }, [jobId]);

  const copyLog = useCallback(() => {
    if (result?.log) {
      navigator.clipboard.writeText(result.log);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result?.log]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Factory Verification</h2>
        <div style={styles.jobIdBadge}>Job: {jobId}</div>
      </div>

      {/* Run Button */}
      <div style={styles.actionSection}>
        <button
          style={{
            ...styles.runButton,
            ...(state === "loading" ? styles.runButtonDisabled : {}),
          }}
          onClick={runVerify}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <>
              <Spinner />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <ShieldIcon />
              <span>Run Factory Check</span>
            </>
          )}
        </button>
        <div style={styles.hint}>
          Server-authoritative verification. No local fallback.
        </div>
      </div>

      {/* Error State */}
      {state === "error" && error && (
        <div style={styles.errorBox}>
          <div style={styles.errorTitle}>Verification Failed</div>
          <div style={styles.errorMessage}>{error}</div>
          <button style={styles.retryButton} onClick={runVerify}>
            Retry
          </button>
        </div>
      )}

      {/* Result State */}
      {state === "done" && result && (
        <div style={styles.resultSection}>
          {/* Verdict */}
          <VerdictPill verdict={result.verdict} code={result.code} />

          {/* Summary */}
          <div style={styles.summaryBox}>
            <div style={styles.summaryLabel}>Summary</div>
            <div style={styles.summaryText}>{result.summary}</div>
            <div style={styles.timestamp}>
              Verified at {new Date(result.timestamp).toLocaleString("th-TH")}
            </div>
          </div>

          {/* Checks */}
          {result.checks && result.checks.length > 0 && (
            <div style={styles.checksSection}>
              <div style={styles.checksHeader}>Verification Checks</div>
              <div style={styles.checksList}>
                {result.checks.map((check, i) => (
                  <CheckItem
                    key={i}
                    name={check.name}
                    status={check.status}
                    message={check.message}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Verbatim Log */}
          <div style={styles.logSection}>
            <div style={styles.logHeader}>
              <span style={styles.logTitle}>Verifier Log (Verbatim)</span>
              <button
                style={styles.copyButton}
                onClick={copyLog}
                title="Copy log to clipboard"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={styles.logContent}>{result.log}</pre>
          </div>

          {/* Details (Raw) */}
          {result.details && (
            <div style={styles.detailsSection}>
              <button
                style={styles.detailsToggle}
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? "\u25BC" : "\u25B6"} Details (Raw)
              </button>
              {showDetails && (
                <pre style={styles.detailsContent}>
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Idle State */}
      {state === "idle" && (
        <div style={styles.idleHint}>
          Click "Run Factory Check" to verify this job against the production
          server.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        animation: "spin 1s linear infinite",
      }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    padding: "24px",
    maxWidth: "800px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  title: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#f3f4f6",
    margin: 0,
  },
  jobIdBadge: {
    padding: "6px 12px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "6px",
    fontSize: "13px",
    color: "#9ca3af",
    fontFamily: "monospace",
  },
  actionSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  runButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    border: "none",
    borderRadius: "8px",
    color: "white",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  runButtonDisabled: {
    background: "#374151",
    color: "#6b7280",
    cursor: "not-allowed",
  },
  hint: {
    fontSize: "12px",
    color: "#6b7280",
    textAlign: "center",
  },
  errorBox: {
    padding: "16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid #dc2626",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  errorTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fca5a5",
  },
  errorMessage: {
    fontSize: "13px",
    color: "#f87171",
  },
  retryButton: {
    alignSelf: "flex-start",
    padding: "8px 16px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "6px",
    color: "#d1d5db",
    fontSize: "13px",
    cursor: "pointer",
    marginTop: "8px",
  },
  resultSection: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  verdictContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  verdictPill: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: 600,
  },
  verdictIcon: {
    fontSize: "20px",
  },
  verdictLabel: {
    flex: 1,
  },
  codeRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
  },
  codeLabel: {
    color: "#6b7280",
  },
  codeValue: {
    padding: "2px 6px",
    background: "#1f2937",
    borderRadius: "4px",
    color: "#d1d5db",
    fontFamily: "monospace",
  },
  categoryBadge: {
    padding: "2px 6px",
    background: "rgba(139, 92, 246, 0.2)",
    borderRadius: "4px",
    color: "#a78bfa",
    fontSize: "10px",
    fontWeight: 500,
  },
  retryBadge: {
    padding: "2px 6px",
    background: "rgba(34, 197, 94, 0.2)",
    borderRadius: "4px",
    color: "#86efac",
    fontSize: "10px",
    fontWeight: 500,
  },
  summaryBox: {
    padding: "16px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
  },
  summaryLabel: {
    fontSize: "11px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  },
  summaryText: {
    fontSize: "14px",
    color: "#e5e7eb",
    lineHeight: 1.5,
  },
  timestamp: {
    fontSize: "11px",
    color: "#6b7280",
    marginTop: "12px",
  },
  checksSection: {
    padding: "16px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
  },
  checksHeader: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "12px",
  },
  checksList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  checkItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    background: "rgba(0, 0, 0, 0.2)",
    borderRadius: "6px",
  },
  checkIcon: {
    fontSize: "14px",
    fontWeight: 700,
  },
  checkName: {
    fontSize: "13px",
    color: "#d1d5db",
    flex: 1,
  },
  checkMessage: {
    fontSize: "12px",
    color: "#6b7280",
  },
  logSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  copyButton: {
    padding: "4px 10px",
    background: "#374151",
    border: "none",
    borderRadius: "4px",
    color: "#9ca3af",
    fontSize: "11px",
    cursor: "pointer",
  },
  logContent: {
    padding: "16px",
    background: "#0f0f1a",
    border: "1px solid #374151",
    borderRadius: "8px",
    fontSize: "12px",
    fontFamily: "monospace",
    color: "#9ca3af",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: "300px",
    overflow: "auto",
    margin: 0,
  },
  detailsSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  detailsToggle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    background: "transparent",
    border: "1px solid #374151",
    borderRadius: "6px",
    color: "#6b7280",
    fontSize: "12px",
    cursor: "pointer",
    width: "fit-content",
  },
  detailsContent: {
    padding: "12px",
    background: "#0f0f1a",
    border: "1px solid #374151",
    borderRadius: "6px",
    fontSize: "11px",
    fontFamily: "monospace",
    color: "#6b7280",
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  idleHint: {
    padding: "32px",
    textAlign: "center",
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: 1.6,
  },
};

export default ValidationScreen;

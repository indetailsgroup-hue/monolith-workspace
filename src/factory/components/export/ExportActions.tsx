/**
 * Export Actions - Export button, progress, and result display
 * P2.2 Export UX (Gated)
 * P6A: Export UX hardening - Copy SHA256 + Copy Download Link
 *
 * @version 0.12.7
 */

import React, { useState, useCallback } from "react";
import type {
  ExportRequest,
  ExportResponseSuccess,
  ExportResponseError,
  ExportStatus,
} from "./exportTypes";

// ============================================================================
// Types
// ============================================================================

interface ExportActionsProps {
  /** Current export configuration */
  config: ExportRequest | null;
  /** Whether export is allowed (verify PASS) */
  exportAllowed: boolean;
  /** Current export status */
  status: ExportStatus;
  /** Last successful export result */
  lastExport?: ExportResponseSuccess;
  /** Export error if any */
  error?: ExportResponseError;
  /** Callback to trigger export */
  onExport: () => void;
  /** Callback to download last export */
  onDownload?: () => void;
  /** Download URL for copy (optional, derives from lastExport if not provided) */
  downloadUrl?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ExportActions({
  config,
  exportAllowed,
  status,
  lastExport,
  error,
  onExport,
  onDownload,
  downloadUrl,
}: ExportActionsProps) {
  const isExporting = status === "EXPORTING";
  const hasExport = status === "DONE" && lastExport;
  const hasError = status === "ERROR" && error;

  // Copy feedback state
  const [copiedSha, setCopiedSha] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Copy SHA256 to clipboard
  const handleCopySha = useCallback(async () => {
    if (!lastExport?.sha256) return;
    try {
      await navigator.clipboard.writeText(lastExport.sha256);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    } catch (err) {
      console.error("Failed to copy SHA256:", err);
    }
  }, [lastExport?.sha256]);

  // Copy download link to clipboard
  const handleCopyLink = useCallback(async () => {
    const url = downloadUrl || (lastExport ? `/api/export/${lastExport.exportId}/download` : null);
    if (!url) return;
    try {
      // Build full URL if relative
      const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy download link:", err);
    }
  }, [downloadUrl, lastExport]);

  return (
    <div style={styles.container}>
      {/* Export Button */}
      <div style={styles.buttonSection}>
        <button
          style={{
            ...styles.exportButton,
            ...(exportAllowed && !isExporting
              ? styles.exportButtonEnabled
              : styles.exportButtonDisabled),
          }}
          onClick={onExport}
          disabled={!exportAllowed || isExporting || !config}
        >
          {isExporting ? (
            <>
              <Spinner />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <ExportIcon />
              <span>Export G-Code</span>
            </>
          )}
        </button>

        {!exportAllowed && (
          <div style={styles.lockHint}>
            Verify must pass before export is allowed
          </div>
        )}
      </div>

      {/* Error Display */}
      {hasError && (
        <div style={styles.errorBox}>
          <div style={styles.errorTitle}>Export Failed</div>
          <div style={styles.errorMessage}>{error.message}</div>
          <div style={styles.errorCode}>Code: {error.code}</div>
          {error.details?.verifyCode && (
            <div style={styles.errorDetail}>
              Verify blocked: {error.details.verifyCode}
            </div>
          )}
        </div>
      )}

      {/* Success Result */}
      {hasExport && (
        <div style={styles.successBox}>
          <div style={styles.successHeader}>
            <CheckIcon />
            <span style={styles.successTitle}>Export Complete</span>
          </div>

          <div style={styles.resultGrid}>
            <div style={styles.resultItem}>
              <div style={styles.resultLabel}>Export ID</div>
              <div style={styles.resultValue}>{lastExport.exportId}</div>
            </div>
            <div style={styles.resultItem}>
              <div style={styles.resultLabel}>Filename</div>
              <div style={styles.resultValue}>{lastExport.filename}</div>
            </div>
            <div style={styles.resultItem}>
              <div style={styles.resultLabel}>Size</div>
              <div style={styles.resultValue}>
                {formatBytes(lastExport.sizeBytes)}
              </div>
            </div>
            <div style={styles.resultItem}>
              <div style={styles.resultLabel}>Dialect</div>
              <div style={styles.resultValue}>{lastExport.dialect}</div>
            </div>
          </div>

          {/* SHA-256 Hash */}
          <div style={styles.hashSection}>
            <div style={styles.hashHeader}>
              <div style={styles.hashLabel}>SHA-256</div>
              <button
                style={{
                  ...styles.copyButton,
                  ...(copiedSha ? styles.copyButtonCopied : {}),
                }}
                onClick={handleCopySha}
                title="Copy SHA-256 hash"
              >
                {copiedSha ? (
                  <>
                    <CheckIcon size={12} />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <CopyIcon />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div style={styles.hashValue}>{lastExport.sha256}</div>
          </div>

          {/* Contents Summary */}
          <div style={styles.contentsSummary}>
            <span>{lastExport.contents.sheets} sheets</span>
            <span style={styles.separator}>|</span>
            <span>{lastExport.contents.files} files</span>
            {lastExport.contents.hasManifest && (
              <>
                <span style={styles.separator}>|</span>
                <span style={styles.badge}>Manifest</span>
              </>
            )}
          </div>

          {/* Download Actions */}
          <div style={styles.downloadActions}>
            {onDownload && (
              <button style={styles.downloadButton} onClick={onDownload}>
                <DownloadIcon />
                <span>Download Bundle</span>
              </button>
            )}
            <button
              style={{
                ...styles.copyLinkButton,
                ...(copiedLink ? styles.copyButtonCopied : {}),
              }}
              onClick={handleCopyLink}
              title="Copy download link"
            >
              {copiedLink ? (
                <>
                  <CheckIcon size={14} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <LinkIcon />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          {/* Export Timestamp */}
          <div style={styles.timestamp}>
            Exported at {formatTimestamp(lastExport.exportedAt)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// Icons
// ============================================================================

function ExportIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
    gap: "16px",
  },
  buttonSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  exportButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "14px 24px",
    borderRadius: "8px",
    border: "none",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
    width: "100%",
  },
  exportButtonEnabled: {
    background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
    color: "white",
  },
  exportButtonDisabled: {
    background: "#374151",
    color: "#6b7280",
    cursor: "not-allowed",
  },
  lockHint: {
    fontSize: "12px",
    color: "#9ca3af",
    textAlign: "center",
  },
  errorBox: {
    padding: "16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid #dc2626",
    borderRadius: "8px",
  },
  errorTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fca5a5",
    marginBottom: "8px",
  },
  errorMessage: {
    fontSize: "13px",
    color: "#f87171",
    marginBottom: "4px",
  },
  errorCode: {
    fontSize: "11px",
    color: "#ef4444",
    fontFamily: "monospace",
  },
  errorDetail: {
    fontSize: "11px",
    color: "#f87171",
    marginTop: "4px",
  },
  successBox: {
    padding: "16px",
    background: "rgba(34, 197, 94, 0.05)",
    border: "1px solid #22c55e",
    borderRadius: "8px",
  },
  successHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },
  successTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#86efac",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    marginBottom: "12px",
  },
  resultItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  resultLabel: {
    fontSize: "11px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  resultValue: {
    fontSize: "13px",
    color: "#d1d5db",
    fontFamily: "monospace",
    wordBreak: "break-all",
  },
  hashSection: {
    padding: "10px 12px",
    background: "rgba(0, 0, 0, 0.2)",
    borderRadius: "6px",
    marginBottom: "12px",
  },
  hashHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "4px",
  },
  hashLabel: {
    fontSize: "10px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  copyButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 8px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "4px",
    color: "#9ca3af",
    fontSize: "10px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  copyButtonCopied: {
    background: "rgba(34, 197, 94, 0.15)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    color: "#86efac",
  },
  hashValue: {
    fontSize: "11px",
    color: "#9ca3af",
    fontFamily: "monospace",
    wordBreak: "break-all",
    lineHeight: 1.4,
  },
  contentsSummary: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "#9ca3af",
    marginBottom: "12px",
  },
  separator: {
    color: "#4b5563",
  },
  badge: {
    padding: "2px 6px",
    background: "rgba(139, 92, 246, 0.2)",
    borderRadius: "4px",
    color: "#a78bfa",
    fontSize: "10px",
    fontWeight: 500,
  },
  downloadActions: {
    display: "flex",
    gap: "8px",
    marginBottom: "4px",
  },
  downloadButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "10px 16px",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "6px",
    color: "#d1d5db",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    flex: 1,
    transition: "all 0.15s ease",
  },
  copyLinkButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "10px 14px",
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: "6px",
    color: "#93c5fd",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  },
  timestamp: {
    fontSize: "11px",
    color: "#6b7280",
    textAlign: "center",
    marginTop: "8px",
  },
};

export default ExportActions;

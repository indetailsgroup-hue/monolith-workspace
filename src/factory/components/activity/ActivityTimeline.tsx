/**
 * ActivityTimeline - Server-authoritative audit trail display
 * P7A: Activity / Audit Timeline
 * P7A.1: Hardening - Stable ordering + Defensive rendering
 *
 * Read-only timeline showing verify runs, export attempts, and downloads.
 * Groups by day, shows copy buttons for SHA256/links.
 *
 * Hardening:
 * - Stable sort: at DESC, id ASC tiebreaker (prevents timeline jumping)
 * - Defensive: unknown types render as "Unknown: {type}" with ❓ icon
 * - Defensive: invalid timestamps render as "Invalid time"
 *
 * @version 0.12.8
 */

import React, { useState, useCallback } from "react";
import type { ActivityRecord } from "../../types/activity";
import {
  getActivityLabel,
  getActivityIcon,
  getActivityColor,
  groupActivitiesByDay,
  isKnownActivityType,
  isValidTimestamp,
} from "../../types/activity";

// ============================================================================
// Types
// ============================================================================

interface ActivityTimelineProps {
  /** Job ID for context */
  jobId: string;
  /** Activity records (newest first) */
  items: ActivityRecord[];
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string;
  /** Callback to refresh */
  onRefresh?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ActivityTimeline({
  jobId,
  items,
  loading = false,
  error,
  onRefresh,
}: ActivityTimelineProps): React.ReactElement {
  const groupedItems = groupActivitiesByDay(items);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Activity</h3>
          <div style={styles.subtitle}>
            Read-only audit trail (server authoritative)
          </div>
        </div>
        {onRefresh && (
          <button
            style={styles.refreshButton}
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "⟳" : "↻"} Refresh
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div style={styles.errorBox}>
          <span style={styles.errorIcon}>⚠️</span>
          <span style={styles.errorText}>{error}</span>
          {onRefresh && (
            <button style={styles.retryButton} onClick={onRefresh}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && items.length === 0 && (
        <div style={styles.loadingBox}>
          <span style={styles.spinner}>⟳</span>
          <span>Loading activity...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div style={styles.emptyBox}>
          <span style={styles.emptyIcon}>📜</span>
          <span style={styles.emptyText}>No activity yet</span>
        </div>
      )}

      {/* Timeline */}
      {items.length > 0 && (
        <div style={styles.timeline}>
          {Array.from(groupedItems.entries()).map(([dayLabel, dayItems]) => (
            <div key={dayLabel} style={styles.dayGroup}>
              <div style={styles.dayLabel}>{dayLabel}</div>
              <div style={styles.dayItems}>
                {dayItems.map((item) => (
                  <ActivityCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Activity Card
// ============================================================================

interface ActivityCardProps {
  item: ActivityRecord;
}

function ActivityCard({ item }: ActivityCardProps): React.ReactElement {
  const [copiedSha, setCopiedSha] = useState(false);

  // Defensive: check if type is known
  const isKnown = isKnownActivityType(item.type);
  const colors = isKnown
    ? getActivityColor(item.type)
    : { bg: "rgba(107, 114, 128, 0.1)", border: "#4b5563", text: "#9ca3af" };
  const icon = isKnown ? getActivityIcon(item.type) : "❓";
  const label = isKnown ? getActivityLabel(item.type) : `Unknown: ${item.type}`;

  // Defensive: check if timestamp is valid
  const hasValidTimestamp = isValidTimestamp(item.at);
  const timeStr = hasValidTimestamp
    ? new Date(item.at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Invalid time";
  const isoStr = hasValidTimestamp ? item.at : "Invalid timestamp";

  // Copy SHA256
  const handleCopySha = useCallback(async () => {
    const sha = item.export?.artifactSha256;
    if (!sha) return;
    try {
      await navigator.clipboard.writeText(sha);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    } catch (err) {
      console.error("Failed to copy SHA256:", err);
    }
  }, [item.export?.artifactSha256]);

  return (
    <div
      style={{
        ...styles.card,
        background: colors.bg,
        borderColor: colors.border,
      }}
    >
      {/* Card Header */}
      <div style={styles.cardHeader}>
        <div style={styles.cardLeft}>
          <span style={styles.cardIcon}>{icon}</span>
          <span style={{ ...styles.cardLabel, color: colors.text }}>{label}</span>
          {/* Verdict pill for verify */}
          {item.type === "VERIFY_RUN" && item.verify && (
            <VerdictPill verdict={item.verify.verdict} />
          )}
        </div>
        <div style={styles.cardRight}>
          <span style={styles.cardTime} title={isoStr}>
            {timeStr}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div style={styles.cardBody}>
        {/* Actor */}
        {item.actor && (
          <div style={styles.actorRow}>
            <span style={styles.actorLabel}>by</span>
            <span style={styles.actorBadge}>
              {item.actor.role || "Unknown"}
              {item.actor.name && ` • ${item.actor.name}`}
            </span>
          </div>
        )}

        {/* Verify details */}
        {item.type === "VERIFY_RUN" && item.verify && (
          <div style={styles.detailsRow}>
            <span style={styles.detailLabel}>Code:</span>
            <span style={styles.detailValue}>{item.verify.code}</span>
            {item.verify.summary && (
              <>
                <span style={styles.detailSeparator}>•</span>
                <span style={styles.detailValue}>{item.verify.summary}</span>
              </>
            )}
          </div>
        )}

        {/* Export details */}
        {(item.type === "EXPORT_SUCCESS" || item.type === "EXPORT_BLOCKED" || item.type === "EXPORT_ATTEMPT") &&
          item.export && (
            <>
              <div style={styles.detailsRow}>
                {item.export.dialect && (
                  <>
                    <span style={styles.detailLabel}>Dialect:</span>
                    <span style={styles.detailValue}>{item.export.dialect}</span>
                  </>
                )}
                {item.export.profileId && (
                  <>
                    <span style={styles.detailSeparator}>•</span>
                    <span style={styles.detailValue}>{item.export.profileId}</span>
                  </>
                )}
              </div>

              {/* SHA256 for successful exports */}
              {item.type === "EXPORT_SUCCESS" && item.export.artifactSha256 && (
                <div style={styles.shaRow}>
                  <div style={styles.shaHeader}>
                    <span style={styles.shaLabel}>SHA-256</span>
                    <button
                      style={{
                        ...styles.copyButton,
                        ...(copiedSha ? styles.copyButtonCopied : {}),
                      }}
                      onClick={handleCopySha}
                      title="Copy SHA-256"
                    >
                      {copiedSha ? "✓ Copied" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={styles.shaValue}>
                    {item.export.artifactSha256}
                  </div>
                  {item.export.artifactName && (
                    <div style={styles.fileName}>{item.export.artifactName}</div>
                  )}
                </div>
              )}

              {/* Blocked reason */}
              {item.type === "EXPORT_BLOCKED" && item.export.reason && (
                <div style={styles.blockedReason}>
                  ⚠️ {item.export.reason}
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

// ============================================================================
// Verdict Pill
// ============================================================================

interface VerdictPillProps {
  verdict: "PASS" | "PASS_WITH_WARN" | "FAIL";
}

function VerdictPill({ verdict }: VerdictPillProps): React.ReactElement {
  const getVerdictStyle = () => {
    switch (verdict) {
      case "PASS":
        return { bg: "rgba(34, 197, 94, 0.2)", color: "#86efac", text: "PASS" };
      case "PASS_WITH_WARN":
        return { bg: "rgba(245, 158, 11, 0.2)", color: "#fcd34d", text: "WARN" };
      case "FAIL":
        return { bg: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", text: "FAIL" };
    }
  };

  const style = getVerdictStyle();

  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "4px",
        background: style.bg,
        color: style.color,
        fontSize: "11px",
        fontWeight: 600,
        marginLeft: "8px",
      }}
    >
      {style.text}
    </span>
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
    maxWidth: "700px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  title: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#f5f5f5",
  },
  subtitle: {
    fontSize: "12px",
    color: "#6b7280",
    marginTop: "4px",
  },
  refreshButton: {
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#9ca3af",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid #ef4444",
    borderRadius: "8px",
  },
  errorIcon: {
    fontSize: "18px",
  },
  errorText: {
    flex: 1,
    fontSize: "13px",
    color: "#fca5a5",
  },
  retryButton: {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid #ef4444",
    background: "transparent",
    color: "#fca5a5",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  },
  loadingBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    padding: "40px",
    color: "#6b7280",
  },
  spinner: {
    fontSize: "24px",
    animation: "spin 1s linear infinite",
  },
  emptyBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "60px 20px",
    color: "#6b7280",
  },
  emptyIcon: {
    fontSize: "40px",
    opacity: 0.5,
  },
  emptyText: {
    fontSize: "14px",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  dayGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  dayLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    paddingBottom: "8px",
    borderBottom: "1px solid #374151",
  },
  dayItems: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  card: {
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
  },
  cardLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  cardRight: {
    display: "flex",
    alignItems: "center",
  },
  cardIcon: {
    fontSize: "16px",
  },
  cardLabel: {
    fontSize: "14px",
    fontWeight: 600,
  },
  cardTime: {
    fontSize: "12px",
    color: "#6b7280",
    cursor: "help",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  actorRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
  },
  actorLabel: {
    color: "#6b7280",
  },
  actorBadge: {
    padding: "2px 8px",
    background: "rgba(107, 114, 128, 0.2)",
    borderRadius: "4px",
    color: "#9ca3af",
    fontSize: "11px",
    fontWeight: 500,
  },
  detailsRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#9ca3af",
    flexWrap: "wrap",
  },
  detailLabel: {
    color: "#6b7280",
  },
  detailValue: {
    color: "#d1d5db",
  },
  detailSeparator: {
    color: "#4b5563",
  },
  shaRow: {
    marginTop: "8px",
    padding: "10px",
    background: "rgba(0, 0, 0, 0.2)",
    borderRadius: "6px",
  },
  shaHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "6px",
  },
  shaLabel: {
    fontSize: "10px",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  copyButton: {
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
    borderColor: "rgba(34, 197, 94, 0.3)",
    color: "#86efac",
  },
  shaValue: {
    fontSize: "10px",
    color: "#9ca3af",
    fontFamily: "monospace",
    wordBreak: "break-all",
    lineHeight: 1.4,
  },
  fileName: {
    marginTop: "4px",
    fontSize: "11px",
    color: "#6b7280",
  },
  blockedReason: {
    fontSize: "12px",
    color: "#fca5a5",
    padding: "8px",
    background: "rgba(239, 68, 68, 0.1)",
    borderRadius: "4px",
  },
};

export default ActivityTimeline;

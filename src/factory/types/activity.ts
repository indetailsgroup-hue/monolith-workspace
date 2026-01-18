/**
 * Activity / Audit Timeline Types
 * P7A: Server-authoritative audit trail
 *
 * @version 0.12.7
 */

// ============================================================================
// Activity Type Taxonomy (canonical)
// ============================================================================

export type ActivityType =
  | "VERIFY_RUN"
  | "EXPORT_ATTEMPT"
  | "EXPORT_SUCCESS"
  | "EXPORT_BLOCKED"
  | "EXPORT_DOWNLOAD"
  | "PACKET_VIEW";

// ============================================================================
// Activity Record (Server → UI contract)
// ============================================================================

export interface ActivityRecord {
  /** Deterministic ID (sha256 of type+at+jobId+key fields) */
  id: string;
  /** Activity type */
  type: ActivityType;
  /** ISO timestamp from server */
  at: string;
  /** Actor information */
  actor?: {
    role?: "FACTORY" | "ADMIN" | "DESIGNER" | "SYSTEM";
    name?: string;
  };
  /** Job ID this activity belongs to */
  jobId: string;

  // ========================================================================
  // Verify fields (for VERIFY_RUN)
  // ========================================================================
  verify?: {
    verdict: "PASS" | "PASS_WITH_WARN" | "FAIL";
    code?: string;
    summary?: string;
    logRef?: string;
  };

  // ========================================================================
  // Export fields (for EXPORT_* events)
  // ========================================================================
  export?: {
    dialect?: "KDT" | "BIESSE" | "HOMAG";
    profileId?: string;
    mode?: "PER_SHEET" | "PER_JOB";
    target?: "GCODE" | "BUNDLE";
    ok?: boolean;
    reason?: string;
    artifactSha256?: string;
    artifactName?: string;
  };

  // ========================================================================
  // Packet integrity anchor (optional)
  // ========================================================================
  packet?: {
    packetSha256?: string;
    manifestSha256?: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ActivityApiResponse {
  ok: true;
  items: ActivityRecord[];
  /** Server timestamp for cache validation */
  fetchedAt: string;
}

export interface ActivityApiError {
  ok: false;
  code: string;
  message: string;
}

export type ActivityResponse = ActivityApiResponse | ActivityApiError;

// ============================================================================
// Store Cache Entry
// ============================================================================

export type ActivityFetchStatus = "IDLE" | "LOADING" | "DONE" | "ERROR";

export interface ActivityCacheEntry {
  status: ActivityFetchStatus;
  items: ActivityRecord[];
  error?: string;
  fetchedAt?: string;
}

// ============================================================================
// Helpers
// ============================================================================

export function isActivitySuccess(response: ActivityResponse): response is ActivityApiResponse {
  return response.ok === true;
}

/**
 * Get display label for activity type
 */
export function getActivityLabel(type: ActivityType): string {
  switch (type) {
    case "VERIFY_RUN":
      return "Factory Check";
    case "EXPORT_ATTEMPT":
      return "Export Attempt";
    case "EXPORT_SUCCESS":
      return "Export Success";
    case "EXPORT_BLOCKED":
      return "Export Blocked";
    case "EXPORT_DOWNLOAD":
      return "Download";
    case "PACKET_VIEW":
      return "Packet Viewed";
    default:
      return type;
  }
}

/**
 * Get icon for activity type
 */
export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case "VERIFY_RUN":
      return "🛡️";
    case "EXPORT_ATTEMPT":
      return "📤";
    case "EXPORT_SUCCESS":
      return "✅";
    case "EXPORT_BLOCKED":
      return "🚫";
    case "EXPORT_DOWNLOAD":
      return "📥";
    case "PACKET_VIEW":
      return "👁️";
    default:
      return "📌";
  }
}

/**
 * Get color scheme for activity type
 */
export function getActivityColor(type: ActivityType): { bg: string; border: string; text: string } {
  switch (type) {
    case "VERIFY_RUN":
      return { bg: "rgba(139, 92, 246, 0.1)", border: "#8b5cf6", text: "#c4b5fd" };
    case "EXPORT_SUCCESS":
      return { bg: "rgba(34, 197, 94, 0.1)", border: "#22c55e", text: "#86efac" };
    case "EXPORT_BLOCKED":
      return { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#fca5a5" };
    case "EXPORT_ATTEMPT":
    case "EXPORT_DOWNLOAD":
      return { bg: "rgba(59, 130, 246, 0.1)", border: "#3b82f6", text: "#93c5fd" };
    case "PACKET_VIEW":
      return { bg: "rgba(107, 114, 128, 0.1)", border: "#6b7280", text: "#9ca3af" };
    default:
      return { bg: "rgba(107, 114, 128, 0.1)", border: "#6b7280", text: "#9ca3af" };
  }
}

/**
 * Group activities by day
 */
export function groupActivitiesByDay(items: ActivityRecord[]): Map<string, ActivityRecord[]> {
  const groups = new Map<string, ActivityRecord[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDate = (date: Date): string => date.toISOString().split("T")[0];
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);

  for (const item of items) {
    const itemDate = new Date(item.at);
    const dateStr = formatDate(itemDate);

    let groupKey: string;
    if (dateStr === todayStr) {
      groupKey = "Today";
    } else if (dateStr === yesterdayStr) {
      groupKey = "Yesterday";
    } else {
      groupKey = itemDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  }

  return groups;
}

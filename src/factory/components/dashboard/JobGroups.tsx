/**
 * JobGroups - Renders grouped job sections
 * PR-P1.1-C.2 Dashboard Filters
 *
 * Groups: Incoming (SIGNED) | Blocked (BLOCKED) | History (VERIFIED, IN_PRODUCTION, ARCHIVED)
 *
 * @version 0.12.0
 */

import React from "react";
import type { GroupedJobs } from "../../state/factoryStore";
import { JobSection } from "./JobSection";

export interface JobGroupsProps {
  /** Grouped jobs from store */
  groups: GroupedJobs;
  /** Callback when job is clicked */
  onOpenJob: (jobId: string) => void;
  /** Whether all groups are empty (for global empty state) */
  isEmpty?: boolean;
}

// Group configuration
const GROUP_CONFIG = {
  incoming: {
    title: "Incoming",
    color: "#22c55e", // Green - new jobs
    emptyHint: "No new jobs awaiting verification",
    defaultCollapsed: false,
  },
  blocked: {
    title: "Blocked",
    color: "#ef4444", // Red - blocked jobs
    emptyHint: "No blocked jobs",
    defaultCollapsed: false,
  },
  history: {
    title: "History",
    color: "#6b7280", // Gray - completed jobs
    emptyHint: "No completed jobs in history",
    defaultCollapsed: true, // Default collapsed to focus on active work
  },
} as const;

export function JobGroups({
  groups,
  onOpenJob,
  isEmpty = false,
}: JobGroupsProps): React.ReactElement {
  // Show global empty state if all groups are empty
  if (isEmpty) {
    return <GlobalEmptyState />;
  }

  return (
    <div>
      {/* Incoming Section */}
      <JobSection
        title={GROUP_CONFIG.incoming.title}
        count={groups.incoming.length}
        jobs={groups.incoming}
        emptyHint={GROUP_CONFIG.incoming.emptyHint}
        onOpenJob={onOpenJob}
        color={GROUP_CONFIG.incoming.color}
        defaultCollapsed={GROUP_CONFIG.incoming.defaultCollapsed}
      />

      {/* Blocked Section */}
      <JobSection
        title={GROUP_CONFIG.blocked.title}
        count={groups.blocked.length}
        jobs={groups.blocked}
        emptyHint={GROUP_CONFIG.blocked.emptyHint}
        onOpenJob={onOpenJob}
        color={GROUP_CONFIG.blocked.color}
        defaultCollapsed={GROUP_CONFIG.blocked.defaultCollapsed}
      />

      {/* History Section */}
      <JobSection
        title={GROUP_CONFIG.history.title}
        count={groups.history.length}
        jobs={groups.history}
        emptyHint={GROUP_CONFIG.history.emptyHint}
        onOpenJob={onOpenJob}
        color={GROUP_CONFIG.history.color}
        defaultCollapsed={GROUP_CONFIG.history.defaultCollapsed}
      />
    </div>
  );
}

// ============================================================================
// Global Empty State
// ============================================================================

function GlobalEmptyState(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
        color: "#888",
      }}
    >
      <span style={{ fontSize: 64, marginBottom: 16, opacity: 0.5 }}>&#128230;</span>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#ccc",
          marginBottom: 8,
        }}
      >
        No jobs in the system
      </div>
      <div style={{ fontSize: 14, textAlign: "center", maxWidth: 300 }}>
        Jobs will appear here once they are created and signed by the designer.
      </div>
    </div>
  );
}

// ============================================================================
// Filter Empty State (when filters yield no results)
// ============================================================================

export interface FilterEmptyStateProps {
  onClearFilters: () => void;
}

export function FilterEmptyState({
  onClearFilters,
}: FilterEmptyStateProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
        color: "#888",
      }}
    >
      <span style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>&#128269;</span>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#ccc",
          marginBottom: 8,
        }}
      >
        No matching jobs found
      </div>
      <div style={{ fontSize: 14, textAlign: "center", maxWidth: 300, marginBottom: 16 }}>
        Try adjusting your search or filters to find what you're looking for.
      </div>
      <button
        onClick={onClearFilters}
        style={{
          padding: "10px 20px",
          backgroundColor: "#3a3a5a",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Clear Filters
      </button>
    </div>
  );
}

export default JobGroups;

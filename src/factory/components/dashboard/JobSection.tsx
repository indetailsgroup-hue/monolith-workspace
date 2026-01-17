/**
 * JobSection - Collapsible job group section
 * PR-P1.1-C.2 Dashboard Filters
 *
 * @version 0.12.0
 */

import React, { useState } from "react";
import type { JobSummary } from "../../types/job";
import { StatusBadge } from "../StatusBadge";
import { TrustBadge } from "../TrustStrip";

export interface JobSectionProps {
  /** Section title */
  title: string;
  /** Number of jobs in section */
  count: number;
  /** Jobs to display */
  jobs: JobSummary[];
  /** Hint text when section is empty */
  emptyHint: string;
  /** Callback when job is clicked */
  onOpenJob: (jobId: string) => void;
  /** Section color theme */
  color?: string;
  /** Initially collapsed */
  defaultCollapsed?: boolean;
}

export function JobSection({
  title,
  count,
  jobs,
  emptyHint,
  onOpenJob,
  color = "#8b5cf6",
  defaultCollapsed = false,
}: JobSectionProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
      style={{
        marginBottom: 24,
      }}
    >
      {/* Section Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 16px",
          backgroundColor: "#1a1a2e",
          border: "1px solid #3a3a5a",
          borderRadius: collapsed ? 8 : "8px 8px 0 0",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        {/* Collapse Icon */}
        <span
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            fontSize: 12,
          }}
        >
          &#9660;
        </span>

        {/* Color Indicator */}
        <span
          style={{
            display: "inline-block",
            width: 4,
            height: 20,
            backgroundColor: color,
            borderRadius: 2,
          }}
        />

        {/* Title */}
        <span style={{ flex: 1, textAlign: "left" }}>{title}</span>

        {/* Count Badge */}
        <span
          style={{
            padding: "4px 10px",
            backgroundColor: count > 0 ? `${color}20` : "#3a3a5a",
            border: `1px solid ${count > 0 ? color : "#3a3a5a"}40`,
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            color: count > 0 ? color : "#888",
          }}
        >
          {count}
        </span>
      </button>

      {/* Section Content */}
      {!collapsed && (
        <div
          style={{
            border: "1px solid #3a3a5a",
            borderTop: "none",
            borderRadius: "0 0 8px 8px",
            overflow: "hidden",
          }}
        >
          {jobs.length === 0 ? (
            <EmptyHint hint={emptyHint} />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              {jobs.map((job, idx) => (
                <JobRow
                  key={job.jobId}
                  job={job}
                  onClick={() => onOpenJob(job.jobId)}
                  isLast={idx === jobs.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Job Row
// ============================================================================

interface JobRowProps {
  job: JobSummary;
  onClick: () => void;
  isLast: boolean;
}

function JobRow({ job, onClick, isLast }: JobRowProps): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        backgroundColor: "#0a0a15",
        borderBottom: isLast ? "none" : "1px solid #3a3a5a20",
        cursor: "pointer",
        transition: "background-color 0.1s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#1a1a2e";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#0a0a15";
      }}
    >
      {/* Job ID + Status */}
      <div style={{ minWidth: 180 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {job.jobId}
          </span>
          <StatusBadge status={job.status} size="sm" />
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#666",
          }}
        >
          {formatRelativeTime(job.updatedAt)}
        </div>
      </div>

      {/* Project + Customer */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "#ccc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.projectName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#888",
          }}
        >
          {job.customerName}
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "#888",
        }}
      >
        <span>{job.panelCount} panels</span>
        <span>{job.sheetCount} sheets</span>
      </div>

      {/* Trust Badge */}
      <TrustBadge trust={job.trust} />

      {/* Arrow */}
      <span style={{ color: "#666", fontSize: 16 }}>&#8250;</span>
    </div>
  );
}

// ============================================================================
// Empty Hint
// ============================================================================

interface EmptyHintProps {
  hint: string;
}

function EmptyHint({ hint }: EmptyHintProps): React.ReactElement {
  return (
    <div
      style={{
        padding: "32px 16px",
        textAlign: "center",
        color: "#666",
        fontSize: 13,
        backgroundColor: "#0a0a15",
      }}
    >
      {hint}
    </div>
  );
}

// ============================================================================
// Helper
// ============================================================================

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("th-TH");
}

export default JobSection;

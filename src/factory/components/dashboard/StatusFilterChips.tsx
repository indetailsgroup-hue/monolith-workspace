/**
 * StatusFilterChips - Multi-select status filter
 * PR-P1.1-C.2 Dashboard Filters
 *
 * @version 0.12.0
 */

import React from "react";
import type { JobStatus } from "../../types/job";
import { getStatusColor, getStatusLabel } from "../../types/job";

export interface StatusFilterChipsProps {
  /** Currently selected statuses (empty = ALL) */
  selected: Set<JobStatus>;
  /** Toggle a status filter */
  onToggle: (status: JobStatus) => void;
  /** Clear all filters */
  onClear: () => void;
}

const STATUS_OPTIONS: JobStatus[] = [
  "SIGNED",
  "VERIFIED",
  "BLOCKED",
  "IN_PRODUCTION",
];

export function StatusFilterChips({
  selected,
  onToggle,
  onClear,
}: StatusFilterChipsProps): React.ReactElement {
  const hasSelection = selected.size > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {STATUS_OPTIONS.map((status) => {
        const isSelected = selected.has(status);
        const color = getStatusColor(status);

        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              backgroundColor: isSelected ? `${color}20` : "transparent",
              border: `1px solid ${isSelected ? color : "#3a3a5a"}`,
              borderRadius: 16,
              color: isSelected ? color : "#888",
              fontSize: 13,
              fontWeight: isSelected ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <StatusDot color={color} active={isSelected} />
            <span>{getStatusLabel(status)}</span>
          </button>
        );
      })}

      {/* Clear button - only show when filters active */}
      {hasSelection && (
        <button
          onClick={onClear}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 10px",
            backgroundColor: "transparent",
            border: "1px solid #3a3a5a",
            borderRadius: 16,
            color: "#888",
            fontSize: 12,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <span style={{ fontSize: 14 }}>×</span>
          <span>Clear</span>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Status Dot Indicator
// ============================================================================

interface StatusDotProps {
  color: string;
  active: boolean;
}

function StatusDot({ color, active }: StatusDotProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: active ? color : "#3a3a5a",
        transition: "background-color 0.15s ease",
      }}
    />
  );
}

export default StatusFilterChips;

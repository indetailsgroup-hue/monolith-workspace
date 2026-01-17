/**
 * StatusBadge - Job status indicator
 * P1.1 Factory Ops UX
 *
 * Visual rules:
 * 🟢 SIGNED → พร้อมตรวจ (green)
 * 🔵 VERIFIED → ตรวจแล้ว (blue)
 * 🔴 BLOCKED → ห้ามผลิต (red)
 * 🟡 IN_PRODUCTION → กำลังผลิต (amber)
 * ⚪ ARCHIVED → เสร็จสิ้น (gray)
 *
 * @version 0.11.0
 */

import React from "react";
import type { JobStatus } from "../types/job";
import { getStatusColor, getStatusLabel } from "../types/job";

export interface StatusBadgeProps {
  status: JobStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  pulsate?: boolean;
}

const sizeStyles = {
  sm: {
    padding: "2px 8px",
    fontSize: "11px",
    dotSize: 6,
  },
  md: {
    padding: "4px 12px",
    fontSize: "12px",
    dotSize: 8,
  },
  lg: {
    padding: "6px 16px",
    fontSize: "14px",
    dotSize: 10,
  },
};

export function StatusBadge({
  status,
  size = "md",
  showLabel = true,
  pulsate = false,
}: StatusBadgeProps): React.ReactElement {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  const sizeStyle = sizeStyles[size];

  const shouldPulsate =
    pulsate || status === "SIGNED" || status === "IN_PRODUCTION";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: sizeStyle.padding,
        backgroundColor: `${color}20`,
        border: `1px solid ${color}40`,
        borderRadius: "9999px",
        fontSize: sizeStyle.fontSize,
        fontWeight: 500,
        color: color,
        whiteSpace: "nowrap",
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: sizeStyle.dotSize,
          height: sizeStyle.dotSize,
          borderRadius: "50%",
          backgroundColor: color,
          animation: shouldPulsate ? "pulse 2s infinite" : undefined,
        }}
      />

      {/* Label */}
      {showLabel && <span>{label}</span>}

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Status Icon (for compact displays)
// ============================================================================

export interface StatusIconProps {
  status: JobStatus;
  size?: number;
  title?: string;
}

export function StatusIcon({
  status,
  size = 16,
  title,
}: StatusIconProps): React.ReactElement {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  const icon = getStatusIcon(status);

  return (
    <span
      title={title || label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        color: color,
        fontSize: size * 0.75,
      }}
    >
      {icon}
    </span>
  );
}

function getStatusIcon(status: JobStatus): string {
  switch (status) {
    case "SIGNED":
      return "●"; // Ready
    case "VERIFIED":
      return "✓"; // Verified
    case "BLOCKED":
      return "✕"; // Blocked
    case "IN_PRODUCTION":
      return "◐"; // In progress
    case "ARCHIVED":
      return "○"; // Done
    default:
      return "?";
  }
}

export default StatusBadge;

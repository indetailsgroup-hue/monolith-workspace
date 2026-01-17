/**
 * TrustStrip - Gate, Signature, Audit status display
 * P1.1 Factory Ops UX
 *
 * Always visible to build operator confidence.
 * Shows verbatim status from verifier.
 *
 * @version 0.11.0
 */

import React from "react";
import type { TrustStatus, GateStatus, SignatureStatus, AuditStatus } from "../types/job";

export interface TrustStripProps {
  trust: TrustStatus;
  layout?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
}

const sizeStyles = {
  sm: {
    gap: 8,
    iconSize: 14,
    fontSize: 10,
    padding: "4px 8px",
  },
  md: {
    gap: 12,
    iconSize: 18,
    fontSize: 12,
    padding: "6px 12px",
  },
  lg: {
    gap: 16,
    iconSize: 24,
    fontSize: 14,
    padding: "8px 16px",
  },
};

export function TrustStrip({
  trust,
  layout = "horizontal",
  size = "md",
  showLabels = true,
}: TrustStripProps): React.ReactElement {
  const sizeStyle = sizeStyles[size];

  const isAllGreen =
    trust.gate === "PASS" &&
    trust.signature === "VALID" &&
    trust.audit === "OK";

  const hasAnyFail =
    trust.gate === "FAIL" ||
    trust.signature === "INVALID" ||
    trust.audit === "MISSING";

  const borderColor = hasAnyFail
    ? "#ef4444"
    : isAllGreen
    ? "#22c55e"
    : "#f59e0b";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: layout === "vertical" ? "column" : "row",
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        backgroundColor: "#1a1a2e",
        border: `1px solid ${borderColor}40`,
        borderRadius: "8px",
      }}
    >
      <TrustItem
        label="Gate"
        status={trust.gate}
        icon={getGateIcon(trust.gate)}
        color={getGateColor(trust.gate)}
        size={size}
        showLabel={showLabels}
      />
      <TrustItem
        label="Signature"
        status={trust.signature}
        icon={getSignatureIcon(trust.signature)}
        color={getSignatureColor(trust.signature)}
        size={size}
        showLabel={showLabels}
      />
      <TrustItem
        label="Audit"
        status={trust.audit}
        icon={getAuditIcon(trust.audit)}
        color={getAuditColor(trust.audit)}
        size={size}
        showLabel={showLabels}
      />
    </div>
  );
}

// ============================================================================
// Trust Item
// ============================================================================

interface TrustItemProps {
  label: string;
  status: string;
  icon: string;
  color: string;
  size: "sm" | "md" | "lg";
  showLabel: boolean;
}

function TrustItem({
  label,
  status,
  icon,
  color,
  size,
  showLabel,
}: TrustItemProps): React.ReactElement {
  const sizeStyle = sizeStyles[size];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
      title={`${label}: ${status}`}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: sizeStyle.iconSize,
          color: color,
          lineHeight: 1,
        }}
      >
        {icon}
      </span>

      {/* Label & Status */}
      {showLabel && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <span
            style={{
              fontSize: sizeStyle.fontSize * 0.85,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: sizeStyle.fontSize,
              color: color,
              fontWeight: 600,
            }}
          >
            {status}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Status Icons & Colors
// ============================================================================

function getGateIcon(status: GateStatus): string {
  switch (status) {
    case "PASS":
      return "✓";
    case "FAIL":
      return "✕";
    case "PENDING":
      return "○";
  }
}

function getGateColor(status: GateStatus): string {
  switch (status) {
    case "PASS":
      return "#22c55e";
    case "FAIL":
      return "#ef4444";
    case "PENDING":
      return "#f59e0b";
  }
}

function getSignatureIcon(status: SignatureStatus): string {
  switch (status) {
    case "VALID":
      return "🔒";
    case "INVALID":
      return "🔓";
    case "PENDING":
      return "○";
  }
}

function getSignatureColor(status: SignatureStatus): string {
  switch (status) {
    case "VALID":
      return "#22c55e";
    case "INVALID":
      return "#ef4444";
    case "PENDING":
      return "#f59e0b";
  }
}

function getAuditIcon(status: AuditStatus): string {
  switch (status) {
    case "OK":
      return "📋";
    case "MISSING":
      return "⚠";
    case "PENDING":
      return "○";
  }
}

function getAuditColor(status: AuditStatus): string {
  switch (status) {
    case "OK":
      return "#22c55e";
    case "MISSING":
      return "#ef4444";
    case "PENDING":
      return "#f59e0b";
  }
}

// ============================================================================
// Compact Trust Badge (single-line)
// ============================================================================

export interface TrustBadgeProps {
  trust: TrustStatus;
}

export function TrustBadge({ trust }: TrustBadgeProps): React.ReactElement {
  const isAllGreen =
    trust.gate === "PASS" &&
    trust.signature === "VALID" &&
    trust.audit === "OK";

  const hasAnyFail =
    trust.gate === "FAIL" ||
    trust.signature === "INVALID" ||
    trust.audit === "MISSING";

  const bgColor = hasAnyFail ? "#ef444420" : isAllGreen ? "#22c55e20" : "#f59e0b20";
  const textColor = hasAnyFail ? "#ef4444" : isAllGreen ? "#22c55e" : "#f59e0b";
  const label = hasAnyFail ? "UNTRUSTED" : isAllGreen ? "TRUSTED" : "PENDING";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        backgroundColor: bgColor,
        border: `1px solid ${textColor}40`,
        borderRadius: "4px",
        fontSize: 11,
        fontWeight: 600,
        color: textColor,
      }}
    >
      {isAllGreen ? "✓" : hasAnyFail ? "✕" : "○"} {label}
    </span>
  );
}

export default TrustStrip;

/**
 * ErrorPanel - Reusable error display component
 * PR-P1.1-C.1 Factory Dashboard Integration
 *
 * Shows errors with category-based styling and retry actions.
 *
 * @version 0.12.0
 */

import React from "react";
import type { VerifyErrorCategory, VerifyErrorCode } from "../types/job";
import { getErrorCategory, isRetryable } from "../types/job";

export interface ErrorPanelProps {
  /** Error title or code */
  title?: string;
  /** Error message to display */
  message: string;
  /** Optional error code for category styling */
  code?: VerifyErrorCode;
  /** Optional error category (overrides code-based detection) */
  category?: VerifyErrorCategory | "UNKNOWN";
  /** Callback for retry action */
  onRetry?: () => void;
  /** Callback for dismiss action */
  onDismiss?: () => void;
  /** Whether retry is in progress */
  retrying?: boolean;
  /** Additional details to show */
  details?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const CATEGORY_STYLES: Record<
  VerifyErrorCategory | "UNKNOWN",
  { color: string; bgColor: string; icon: string }
> = {
  TRUST: {
    color: "#ef4444",
    bgColor: "#ef444420",
    icon: "🔒",
  },
  PACKET: {
    color: "#f59e0b",
    bgColor: "#f59e0b20",
    icon: "📁",
  },
  GATE: {
    color: "#ec4899",
    bgColor: "#ec489920",
    icon: "🚧",
  },
  ENV: {
    color: "#3b82f6",
    bgColor: "#3b82f620",
    icon: "🏭",
  },
  SYSTEM: {
    color: "#6366f1",
    bgColor: "#6366f120",
    icon: "⚙️",
  },
  UNKNOWN: {
    color: "#6b7280",
    bgColor: "#6b728020",
    icon: "❓",
  },
};

const SIZE_STYLES = {
  sm: { padding: 12, fontSize: 13, iconSize: 20 },
  md: { padding: 16, fontSize: 14, iconSize: 24 },
  lg: { padding: 20, fontSize: 15, iconSize: 32 },
};

export function ErrorPanel({
  title,
  message,
  code,
  category: categoryOverride,
  onRetry,
  onDismiss,
  retrying = false,
  details,
  size = "md",
}: ErrorPanelProps): React.ReactElement {
  // Determine category from code or use override
  const category = categoryOverride ?? (code ? getErrorCategory(code) : "UNKNOWN");
  const style = CATEGORY_STYLES[category];
  const sizeStyle = SIZE_STYLES[size];
  const canRetry = code ? isRetryable(code) : true;

  return (
    <div
      style={{
        padding: sizeStyle.padding,
        backgroundColor: style.bgColor,
        border: `1px solid ${style.color}40`,
        borderRadius: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        {/* Icon */}
        <span style={{ fontSize: sizeStyle.iconSize }}>{style.icon}</span>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {/* Title */}
          {title && (
            <div
              style={{
                fontSize: sizeStyle.fontSize,
                fontWeight: 600,
                color: style.color,
                marginBottom: 4,
              }}
            >
              {title}
            </div>
          )}

          {/* Message */}
          <div
            style={{
              fontSize: sizeStyle.fontSize,
              color: title ? "#ccc" : style.color,
              lineHeight: 1.4,
            }}
          >
            {message}
          </div>

          {/* Details */}
          {details && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                backgroundColor: "#00000020",
                borderRadius: 4,
                fontSize: sizeStyle.fontSize - 1,
                fontFamily: "monospace",
                color: "#888",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {details}
            </div>
          )}

          {/* Code Badge */}
          {code && (
            <div
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "2px 8px",
                backgroundColor: "#00000020",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                color: "#888",
              }}
            >
              {code}
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: 4,
              backgroundColor: "transparent",
              border: "none",
              color: "#888",
              fontSize: 16,
              cursor: "pointer",
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Actions */}
      {onRetry && canRetry && (
        <div style={{ marginTop: 12, paddingLeft: sizeStyle.iconSize + 12 }}>
          <button
            onClick={onRetry}
            disabled={retrying}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              backgroundColor: style.color,
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: sizeStyle.fontSize - 1,
              fontWeight: 500,
              cursor: retrying ? "not-allowed" : "pointer",
              opacity: retrying ? 0.7 : 1,
            }}
          >
            {retrying ? "⟳ Retrying..." : "⟳ Retry"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Specialized Error Panels
// ============================================================================

export interface ConnectionErrorPanelProps {
  onRetry?: () => void;
  retrying?: boolean;
}

export function ConnectionErrorPanel({
  onRetry,
  retrying,
}: ConnectionErrorPanelProps): React.ReactElement {
  return (
    <ErrorPanel
      title="Connection Error"
      message="Unable to connect to the server. Please check your network connection and try again."
      category="SYSTEM"
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}

export interface NotFoundErrorPanelProps {
  resourceType?: string;
  resourceId?: string;
  onBack?: () => void;
}

export function NotFoundErrorPanel({
  resourceType = "Resource",
  resourceId,
  onBack,
}: NotFoundErrorPanelProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        color: "#888",
      }}
    >
      <span style={{ fontSize: 64, marginBottom: 16 }}>🔍</span>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        {resourceType} Not Found
      </div>
      {resourceId && (
        <div style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          ID: {resourceId}
        </div>
      )}
      {onBack && (
        <button
          onClick={onBack}
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
          ← Go Back
        </button>
      )}
    </div>
  );
}

export default ErrorPanel;

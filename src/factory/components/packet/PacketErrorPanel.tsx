/**
 * PacketErrorPanel - Error display for packet viewer
 * P2.1 Packet Viewer (Read-only)
 *
 * Shows packet loading/parsing errors with helpful messages.
 *
 * @version 0.12.0
 */

import React from "react";
import type { PacketResponseError, PacketErrorCode } from "./packetTypes";

export interface PacketErrorPanelProps {
  error: PacketResponseError;
  onRetry?: () => void;
}

// Error code descriptions
const ERROR_DESCRIPTIONS: Record<PacketErrorCode, { title: string; description: string }> = {
  E_PACKET_MISSING: {
    title: "Packet Not Found",
    description: "The packet file for this job could not be found. It may not have been generated yet.",
  },
  E_PACKET_PARSE: {
    title: "Invalid JSON",
    description: "The packet file contains invalid JSON and could not be parsed.",
  },
  E_PACKET_SCHEMA: {
    title: "Invalid Schema",
    description: "The packet file does not match the expected schema format.",
  },
  E_PACKET_TOO_LARGE: {
    title: "File Too Large",
    description: "The packet file exceeds the maximum allowed size for viewing.",
  },
  E_PACKET_FETCH: {
    title: "Network Error",
    description: "Failed to fetch the packet from the server. Please check your connection.",
  },
};

export function PacketErrorPanel({ error, onRetry }: PacketErrorPanelProps): React.ReactElement {
  const errorInfo = ERROR_DESCRIPTIONS[error.code] || {
    title: "Unknown Error",
    description: error.message || "An unexpected error occurred.",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        color: "#888",
        minHeight: 300,
      }}
    >
      {/* Error Icon */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: "#ef444420",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 28, color: "#ef4444" }}>!</span>
      </div>

      {/* Error Title */}
      <h3
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 18,
          fontWeight: 600,
          color: "#ef4444",
        }}
      >
        {errorInfo.title}
      </h3>

      {/* Error Description */}
      <p
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 14,
          color: "#888",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        {errorInfo.description}
      </p>

      {/* Error Details */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#1a1a2e",
          border: "1px solid #3a3a5a",
          borderRadius: 8,
          marginBottom: 20,
          maxWidth: 500,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              padding: "2px 8px",
              backgroundColor: "#ef444430",
              color: "#ef4444",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              fontFamily: "monospace",
            }}
          >
            {error.code}
          </span>
        </div>

        <pre
          style={{
            margin: 0,
            fontSize: 12,
            fontFamily: "monospace",
            color: "#ccc",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </pre>

        {/* JSON Snippet (for parse errors) */}
        {error.snippet && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: "#666",
                marginBottom: 4,
              }}
            >
              Near:
            </div>
            <pre
              style={{
                margin: 0,
                padding: 8,
                backgroundColor: "#0a0a15",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                color: "#f59e0b",
                overflow: "auto",
              }}
            >
              {error.snippet}
            </pre>
          </div>
        )}
      </div>

      {/* Retry Button */}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "10px 24px",
            backgroundColor: "#3a3a5a",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default PacketErrorPanel;

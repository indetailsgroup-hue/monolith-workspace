/**
 * PacketJsonViewer - Raw JSON view for packet data
 * P2.1 Packet Viewer (Read-only)
 *
 * Collapsible JSON tree viewer with syntax highlighting.
 *
 * @version 0.12.0
 */

import React, { useState, useCallback } from "react";
import type { PacketData } from "./packetTypes";

export interface PacketJsonViewerProps {
  packet: PacketData;
  packetSha256: string;
  sizeBytes: number;
}

export function PacketJsonViewer({
  packet,
  packetSha256,
  sizeBytes,
}: PacketJsonViewerProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const [searchQuery, setSearchQuery] = useState("");

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
  }, [packet]);

  // Download as file
  const handleDownload = useCallback(() => {
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packet-${packet.jobId || "export"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [packet]);

  return (
    <div style={{ padding: 16, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
        }}
      >
        {/* View Mode Toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          <ToggleButton active={viewMode === "tree"} onClick={() => setViewMode("tree")}>
            Tree
          </ToggleButton>
          <ToggleButton active={viewMode === "raw"} onClick={() => setViewMode("raw")}>
            Raw
          </ToggleButton>
        </div>

        {/* Search (for tree mode) */}
        {viewMode === "tree" && (
          <input
            type="text"
            placeholder="Search keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              maxWidth: 200,
              padding: "6px 12px",
              backgroundColor: "#0a0a15",
              border: "1px solid #3a3a5a",
              borderRadius: 6,
              color: "#fff",
              fontSize: 13,
              outline: "none",
            }}
          />
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton onClick={handleCopy}>Copy</ActionButton>
          <ActionButton onClick={handleDownload}>Download</ActionButton>
        </div>
      </div>

      {/* Info Bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 12,
          fontSize: 12,
          color: "#666",
        }}
      >
        <span>Size: {formatSize(sizeBytes)}</span>
        <span>SHA-256: {truncateHash(packetSha256)}</span>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#0a0a15",
          border: "1px solid #3a3a5a",
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {viewMode === "tree" ? (
          <JsonTree data={packet} searchQuery={searchQuery} />
        ) : (
          <pre
            style={{
              margin: 0,
              padding: 16,
              fontSize: 12,
              fontFamily: "monospace",
              color: "#ccc",
              lineHeight: 1.6,
            }}
          >
            {JSON.stringify(packet, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Toggle Button
// ============================================================================

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, children }: ToggleButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        backgroundColor: active ? "#3b82f6" : "#1a1a2e",
        border: `1px solid ${active ? "#3b82f6" : "#3a3a5a"}`,
        borderRadius: 6,
        color: active ? "#fff" : "#888",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Action Button
// ============================================================================

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

function ActionButton({ onClick, children }: ActionButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        backgroundColor: "#3a3a5a",
        border: "none",
        borderRadius: 6,
        color: "#ccc",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// JSON Tree
// ============================================================================

interface JsonTreeProps {
  data: unknown;
  searchQuery?: string;
}

function JsonTree({ data, searchQuery }: JsonTreeProps): React.ReactElement {
  return (
    <div style={{ padding: 16 }}>
      <JsonNode value={data} keyName="" depth={0} searchQuery={searchQuery?.toLowerCase()} />
    </div>
  );
}

interface JsonNodeProps {
  value: unknown;
  keyName: string;
  depth: number;
  searchQuery?: string;
}

function JsonNode({ value, keyName, depth, searchQuery }: JsonNodeProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(depth > 2);

  const isObject = typeof value === "object" && value !== null;
  const isArray = Array.isArray(value);
  const type = isArray ? "array" : isObject ? "object" : typeof value;

  // Check if key matches search
  const keyMatches = searchQuery && keyName.toLowerCase().includes(searchQuery);

  // For objects/arrays, check if any child matches
  const childMatches =
    searchQuery && isObject
      ? Object.keys(value as Record<string, unknown>).some((k) =>
          k.toLowerCase().includes(searchQuery)
        )
      : false;

  // Expand if search matches
  const forceExpand = searchQuery && (keyMatches || childMatches);

  const effectiveCollapsed = forceExpand ? false : collapsed;

  // Render primitive value
  if (!isObject) {
    return (
      <div style={{ marginLeft: depth * 16, display: "flex", gap: 4 }}>
        {keyName && (
          <span
            style={{
              color: keyMatches ? "#f59e0b" : "#8b5cf6",
              backgroundColor: keyMatches ? "#f59e0b20" : "transparent",
              padding: keyMatches ? "0 4px" : 0,
              borderRadius: 2,
            }}
          >
            "{keyName}"
          </span>
        )}
        {keyName && <span style={{ color: "#666" }}>:</span>}
        <span style={{ color: getValueColor(value) }}>{formatValue(value)}</span>
      </div>
    );
  }

  // Render object/array
  const entries = Object.entries(value as Record<string, unknown>);
  const bracket = isArray ? ["[", "]"] : ["{", "}"];

  return (
    <div style={{ marginLeft: depth * 16 }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!effectiveCollapsed)}
        style={{
          display: "flex",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#666", width: 12 }}>{effectiveCollapsed ? "\u25B6" : "\u25BC"}</span>
        {keyName && (
          <span
            style={{
              color: keyMatches ? "#f59e0b" : "#8b5cf6",
              backgroundColor: keyMatches ? "#f59e0b20" : "transparent",
              padding: keyMatches ? "0 4px" : 0,
              borderRadius: 2,
            }}
          >
            "{keyName}"
          </span>
        )}
        {keyName && <span style={{ color: "#666" }}>:</span>}
        <span style={{ color: "#666" }}>{bracket[0]}</span>
        {effectiveCollapsed && (
          <span style={{ color: "#666" }}>
            {isArray ? `${entries.length} items` : `${entries.length} keys`}
          </span>
        )}
        {effectiveCollapsed && <span style={{ color: "#666" }}>{bracket[1]}</span>}
      </div>

      {/* Children */}
      {!effectiveCollapsed && (
        <>
          {entries.map(([k, v], idx) => (
            <div key={k}>
              <JsonNode value={v} keyName={k} depth={depth + 1} searchQuery={searchQuery} />
              {idx < entries.length - 1 && (
                <span style={{ marginLeft: (depth + 1) * 16, color: "#666" }}>,</span>
              )}
            </div>
          ))}
          <div style={{ marginLeft: depth * 16 + 12, color: "#666" }}>{bracket[1]}</div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getValueColor(value: unknown): string {
  if (value === null) return "#ef4444";
  if (typeof value === "boolean") return "#f59e0b";
  if (typeof value === "number") return "#22c55e";
  if (typeof value === "string") return "#3b82f6";
  return "#ccc";
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncateHash(hash: string, length = 12): string {
  if (hash.length <= length * 2 + 3) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-6)}`;
}

export default PacketJsonViewer;

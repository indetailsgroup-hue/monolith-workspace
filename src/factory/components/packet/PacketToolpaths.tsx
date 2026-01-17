/**
 * PacketToolpaths - Toolpath plan view for packet data
 * P2.1 Packet Viewer (Read-only)
 *
 * Shows toolpath plan details including tools, operations, and G-code snippets.
 *
 * @version 0.12.0
 */

import React, { useState } from "react";
import type { PacketData, PacketTool, PacketOperation, PacketToolpathPlan } from "./packetTypes";

export interface PacketToolpathsProps {
  packet: PacketData;
}

type ViewMode = "overview" | "tools" | "gcode";

export function PacketToolpaths({ packet }: PacketToolpathsProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  const toolpathPlan = packet.toolpathPlan;

  if (!toolpathPlan) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#666",
        }}
      >
        No toolpath plan available in this packet
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* View Mode Toggle */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <TabButton active={viewMode === "overview"} onClick={() => setViewMode("overview")}>
          Overview
        </TabButton>
        <TabButton active={viewMode === "tools"} onClick={() => setViewMode("tools")}>
          Tools ({toolpathPlan.tools?.length || 0})
        </TabButton>
        <TabButton active={viewMode === "gcode"} onClick={() => setViewMode("gcode")}>
          G-Code
        </TabButton>
      </div>

      {/* Overview View */}
      {viewMode === "overview" && <OverviewView toolpathPlan={toolpathPlan} />}

      {/* Tools View */}
      {viewMode === "tools" && <ToolsView tools={toolpathPlan.tools || []} />}

      {/* G-Code View */}
      {viewMode === "gcode" && <GCodeView gcodeSnippets={toolpathPlan.gcodeSnippets || {}} />}
    </div>
  );
}

// ============================================================================
// Tab Button
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        backgroundColor: active ? "#8b5cf6" : "#1a1a2e",
        border: `1px solid ${active ? "#8b5cf6" : "#3a3a5a"}`,
        borderRadius: 8,
        color: active ? "#fff" : "#888",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Overview View
// ============================================================================

interface OverviewViewProps {
  toolpathPlan: PacketToolpathPlan;
}

function OverviewView({ toolpathPlan }: OverviewViewProps): React.ReactElement {
  const opsByType = toolpathPlan.opsByType || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        <SummaryCard
          label="Total Operations"
          value={toolpathPlan.totalOps?.toString() || "0"}
          color="#8b5cf6"
        />
        <SummaryCard
          label="Machine"
          value={toolpathPlan.machine || "-"}
          color="#3b82f6"
        />
        <SummaryCard
          label="Est. Runtime"
          value={
            toolpathPlan.estimatedRuntime
              ? `${toolpathPlan.estimatedRuntime.toFixed(1)} min`
              : "-"
          }
          color="#22c55e"
        />
      </div>

      {/* Operations by Type */}
      {Object.keys(opsByType).length > 0 && (
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h4
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
            }}
          >
            Operations by Type
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(opsByType).map(([type, count]) => (
              <OpTypeRow key={type} type={type} count={count} total={toolpathPlan.totalOps || 1} />
            ))}
          </div>
        </div>
      )}

      {/* Tools Summary */}
      {toolpathPlan.tools && toolpathPlan.tools.length > 0 && (
        <div
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h4
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 14,
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
            }}
          >
            Tools Required
          </h4>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {toolpathPlan.tools.map((tool) => (
              <span
                key={tool.id}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#0a0a15",
                  border: "1px solid #2a2a4a",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#ccc",
                }}
              >
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>{tool.id}</span>
                {tool.name && ` - ${tool.name}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tools View
// ============================================================================

interface ToolsViewProps {
  tools: PacketTool[];
}

function ToolsView({ tools }: ToolsViewProps): React.ReactElement {
  if (tools.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        No tools defined in this toolpath plan
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}

interface ToolCardProps {
  tool: PacketTool;
}

function ToolCard({ tool }: ToolCardProps): React.ReactElement {
  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            padding: "4px 12px",
            backgroundColor: "#f59e0b20",
            color: "#f59e0b",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 4,
            fontFamily: "monospace",
          }}
        >
          {tool.id}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>
          {tool.name || "Unnamed Tool"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#666" }}>Type</span>
          <span style={{ color: "#ccc" }}>{tool.type || "-"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#666" }}>Diameter</span>
          <span style={{ color: "#ccc" }}>
            {tool.diameter ? `${tool.diameter} mm` : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// G-Code View
// ============================================================================

interface GCodeViewProps {
  gcodeSnippets: Record<string, string>;
}

function GCodeView({ gcodeSnippets }: GCodeViewProps): React.ReactElement {
  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(
    Object.keys(gcodeSnippets)[0] || null
  );

  const snippetKeys = Object.keys(gcodeSnippets);

  if (snippetKeys.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        No G-code snippets available
      </div>
    );
  }

  return (
    <div>
      {/* Snippet Selector */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {snippetKeys.map((key) => (
          <button
            key={key}
            onClick={() => setSelectedSnippet(key)}
            style={{
              padding: "6px 12px",
              backgroundColor: selectedSnippet === key ? "#3b82f6" : "#1a1a2e",
              border: `1px solid ${selectedSnippet === key ? "#3b82f6" : "#3a3a5a"}`,
              borderRadius: 6,
              color: selectedSnippet === key ? "#fff" : "#888",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* G-Code Display */}
      {selectedSnippet && gcodeSnippets[selectedSnippet] && (
        <div
          style={{
            backgroundColor: "#0a0a15",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              backgroundColor: "#1a1a2e",
              borderBottom: "1px solid #3a3a5a",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: "#888" }}>{selectedSnippet}</span>
            <button
              onClick={() => navigator.clipboard.writeText(gcodeSnippets[selectedSnippet])}
              style={{
                padding: "4px 12px",
                backgroundColor: "#3a3a5a",
                border: "none",
                borderRadius: 4,
                color: "#ccc",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Copy
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              fontSize: 12,
              fontFamily: "monospace",
              color: "#22c55e",
              overflow: "auto",
              maxHeight: 400,
              lineHeight: 1.5,
            }}
          >
            {gcodeSnippets[selectedSnippet]}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface SummaryCardProps {
  label: string;
  value: string;
  color: string;
}

function SummaryCard({ label, value, color }: SummaryCardProps): React.ReactElement {
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
    </div>
  );
}

interface OpTypeRowProps {
  type: string;
  count: number;
  total: number;
}

function OpTypeRow({ type, count, total }: OpTypeRowProps): React.ReactElement {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            padding: "2px 8px",
            backgroundColor: getOpTypeColor(type),
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 3,
          }}
        >
          {type}
        </span>
        <span style={{ fontSize: 12, color: "#ccc" }}>
          {count} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div
        style={{
          height: 4,
          backgroundColor: "#2a2a4a",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            backgroundColor: getOpTypeColor(type),
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getOpTypeColor(type: string): string {
  const colors: Record<string, string> = {
    PROFILE: "#3b82f6",
    DRILL: "#22c55e",
    GROOVE: "#f59e0b",
    POCKET: "#8b5cf6",
    ENGRAVE: "#ec4899",
    CUTOUT: "#ef4444",
  };
  return colors[type] || "#666";
}

export default PacketToolpaths;

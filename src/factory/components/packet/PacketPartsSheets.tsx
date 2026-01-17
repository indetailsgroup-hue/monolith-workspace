/**
 * PacketPartsSheets - Parts and sheets view for packet data
 * P2.1 Packet Viewer (Read-only)
 *
 * Shows detailed lists of parts and sheets with their properties.
 *
 * @version 0.12.0
 */

import React, { useState } from "react";
import type { PacketData, PacketPart, PacketSheet, PacketMaterial } from "./packetTypes";

export interface PacketPartsSheetsProps {
  packet: PacketData;
}

type ViewMode = "parts" | "sheets";

export function PacketPartsSheets({ packet }: PacketPartsSheetsProps): React.ReactElement {
  const [viewMode, setViewMode] = useState<ViewMode>("parts");

  const parts = packet.parts || [];
  const sheets = packet.sheets || [];
  const materials = packet.materials || [];

  // Create material lookup
  const materialMap = new Map<string, PacketMaterial>();
  for (const mat of materials) {
    materialMap.set(mat.id, mat);
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
        <ToggleButton
          active={viewMode === "parts"}
          onClick={() => setViewMode("parts")}
          count={parts.length}
        >
          Parts
        </ToggleButton>
        <ToggleButton
          active={viewMode === "sheets"}
          onClick={() => setViewMode("sheets")}
          count={sheets.length}
        >
          Sheets
        </ToggleButton>
      </div>

      {/* Parts View */}
      {viewMode === "parts" && (
        <div>
          {parts.length === 0 ? (
            <EmptyState message="No parts in this packet" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {parts.map((part) => (
                <PartCard key={part.id} part={part} material={materialMap.get(part.materialId || "")} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sheets View */}
      {viewMode === "sheets" && (
        <div>
          {sheets.length === 0 ? (
            <EmptyState message="No sheets in this packet" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sheets.map((sheet) => (
                <SheetCard
                  key={sheet.id}
                  sheet={sheet}
                  material={materialMap.get(sheet.materialId || "")}
                  parts={parts}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Toggle Button
// ============================================================================

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}

function ToggleButton({ active, onClick, count, children }: ToggleButtonProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        backgroundColor: active ? "#3b82f6" : "#1a1a2e",
        border: `1px solid ${active ? "#3b82f6" : "#3a3a5a"}`,
        borderRadius: 8,
        color: active ? "#fff" : "#888",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {children}
      <span
        style={{
          padding: "2px 8px",
          backgroundColor: active ? "rgba(255,255,255,0.2)" : "#2a2a4a",
          borderRadius: 10,
          fontSize: 11,
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// Part Card
// ============================================================================

interface PartCardProps {
  part: PacketPart;
  material?: PacketMaterial;
}

function PartCard({ part, material }: PartCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const operations = part.operations || [];

  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {part.name || part.id}
          </span>
          {material && (
            <span
              style={{
                padding: "2px 8px",
                backgroundColor: "#f59e0b20",
                color: "#f59e0b",
                fontSize: 11,
                borderRadius: 4,
              }}
            >
              {material.code || material.name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Dimensions */}
          <span style={{ fontSize: 12, color: "#888" }}>
            {part.width || 0} x {part.height || 0} x {part.thickness || 0} mm
          </span>

          {/* Operations count */}
          {operations.length > 0 && (
            <span
              style={{
                padding: "2px 8px",
                backgroundColor: "#22c55e20",
                color: "#22c55e",
                fontSize: 11,
                borderRadius: 4,
              }}
            >
              {operations.length} ops
            </span>
          )}

          {/* Expand arrow */}
          <span
            style={{
              color: "#666",
              fontSize: 12,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            \u25BC
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 12px",
            borderTop: "1px solid #2a2a4a",
          }}
        >
          {/* Part Details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              padding: "12px 0",
              fontSize: 12,
            }}
          >
            <DetailItem label="ID" value={part.id} mono />
            <DetailItem label="Material ID" value={part.materialId || "-"} mono />
            <DetailItem label="Width" value={`${part.width || 0} mm`} />
            <DetailItem label="Height" value={`${part.height || 0} mm`} />
            <DetailItem label="Thickness" value={`${part.thickness || 0} mm`} />
          </div>

          {/* Operations List */}
          {operations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                Operations
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {operations.map((op, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "6px 10px",
                      backgroundColor: "#0a0a15",
                      borderRadius: 4,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 6px",
                        backgroundColor: getOpTypeColor(op.type),
                        color: "#fff",
                        fontSize: 10,
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                    >
                      {op.type}
                    </span>
                    {op.toolId && <span style={{ color: "#888" }}>Tool: {op.toolId}</span>}
                    {op.depth && <span style={{ color: "#888" }}>Depth: {op.depth}mm</span>}
                    {op.tabs && <span style={{ color: "#888" }}>Tabs: {op.tabs}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sheet Card
// ============================================================================

interface SheetCardProps {
  sheet: PacketSheet;
  material?: PacketMaterial;
  parts: PacketPart[];
}

function SheetCard({ sheet, material, parts }: SheetCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const sheetParts = sheet.parts || [];

  // Get part names
  const partMap = new Map<string, PacketPart>();
  for (const p of parts) {
    partMap.set(p.id, p);
  }

  return (
    <div
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            {sheet.name || sheet.id}
          </span>
          {material && (
            <span
              style={{
                padding: "2px 8px",
                backgroundColor: "#3b82f620",
                color: "#3b82f6",
                fontSize: 11,
                borderRadius: 4,
              }}
            >
              {material.code || material.name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Dimensions */}
          <span style={{ fontSize: 12, color: "#888" }}>
            {sheet.width || 0} x {sheet.height || 0} mm
          </span>

          {/* Parts count */}
          <span
            style={{
              padding: "2px 8px",
              backgroundColor: "#22c55e20",
              color: "#22c55e",
              fontSize: 11,
              borderRadius: 4,
            }}
          >
            {sheetParts.length} parts
          </span>

          {/* Expand arrow */}
          <span
            style={{
              color: "#666",
              fontSize: 12,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            \u25BC
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div
          style={{
            padding: "0 16px 12px",
            borderTop: "1px solid #2a2a4a",
          }}
        >
          {/* Sheet Details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              padding: "12px 0",
              fontSize: 12,
            }}
          >
            <DetailItem label="ID" value={sheet.id} mono />
            <DetailItem label="Material ID" value={sheet.materialId || "-"} mono />
            <DetailItem label="Width" value={`${sheet.width || 0} mm`} />
            <DetailItem label="Height" value={`${sheet.height || 0} mm`} />
          </div>

          {/* Parts Placement */}
          {sheetParts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#666",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                Part Placements
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sheetParts.map((sp, idx) => {
                  const partInfo = partMap.get(sp.partId);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "6px 10px",
                        backgroundColor: "#0a0a15",
                        borderRadius: 4,
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#ccc" }}>
                        {partInfo?.name || sp.partId}
                      </span>
                      <span style={{ color: "#888" }}>
                        @ ({sp.x}, {sp.y}) {sp.rotation ? `rot ${sp.rotation}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface DetailItemProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailItem({ label, value, mono }: DetailItemProps): React.ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span
        style={{
          color: "#ccc",
          fontFamily: mono ? "monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        color: "#666",
      }}
    >
      {message}
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

export default PacketPartsSheets;

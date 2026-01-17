/**
 * PacketOverview - Summary view for packet data
 * P2.1 Packet Viewer (Read-only)
 *
 * Shows packet metadata, counts, and hash information.
 *
 * @version 0.12.0
 */

import React from "react";
import type { PacketData } from "./packetTypes";
import { getPacketCounts } from "./packetTypes";

export interface PacketOverviewProps {
  packet: PacketData;
  packetSha256: string;
  sizeBytes: number;
}

export function PacketOverview({
  packet,
  packetSha256,
  sizeBytes,
}: PacketOverviewProps): React.ReactElement {
  const counts = getPacketCounts(packet);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format date
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleString("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Metadata Section */}
      <Section title="Packet Info">
        <InfoRow label="Job ID" value={packet.jobId} mono />
        <InfoRow label="Version" value={packet.version} />
        <InfoRow label="Tool Version" value={packet.toolVersion || "-"} />
        <InfoRow label="Created" value={formatDate(packet.createdAt)} />
        <InfoRow label="Signed" value={formatDate(packet.signedAt)} />
      </Section>

      {/* Counts Section */}
      <Section title="Contents">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginTop: 12,
          }}
        >
          <CountCard label="Sheets" count={counts.sheets} color="#3b82f6" />
          <CountCard label="Parts" count={counts.parts} color="#22c55e" />
          <CountCard label="Operations" count={counts.operations} color="#f59e0b" />
        </div>

        {/* Operations by Type */}
        {Object.keys(counts.opsByType).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: "#666",
                marginBottom: 8,
              }}
            >
              Operations by Type
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {Object.entries(counts.opsByType).map(([type, count]) => (
                <span
                  key={type}
                  style={{
                    padding: "4px 10px",
                    backgroundColor: "#1a1a2e",
                    border: "1px solid #3a3a5a",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "#ccc",
                  }}
                >
                  {type}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Manifest Section */}
      {packet.manifest && (
        <Section title="Manifest">
          <InfoRow label="Algorithm" value={packet.manifest.algorithm || "-"} />
          <InfoRow label="Key ID" value={packet.manifest.publicKeyId || "-"} mono />
          <InfoRow
            label="Hash"
            value={packet.manifest.hash ? truncateHash(packet.manifest.hash) : "-"}
            mono
          />
        </Section>
      )}

      {/* Hash & Size Section */}
      <Section title="Integrity">
        <InfoRow label="SHA-256" value={truncateHash(packetSha256)} mono />
        <InfoRow label="File Size" value={formatSize(sizeBytes)} />
      </Section>

      {/* Toolpath Plan */}
      {packet.toolpathPlan && (
        <Section title="Toolpath Plan">
          <InfoRow label="Machine" value={packet.toolpathPlan.machine || "-"} />
          <InfoRow
            label="Est. Runtime"
            value={
              packet.toolpathPlan.estimatedRuntime
                ? `${packet.toolpathPlan.estimatedRuntime.toFixed(1)} min`
                : "-"
            }
          />
          <InfoRow
            label="Tools"
            value={`${packet.toolpathPlan.tools?.length || 0} tools`}
          />
        </Section>
      )}

      {/* Gate Results */}
      {packet.gateResults && (
        <Section title="Gate Results">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                padding: "4px 12px",
                backgroundColor: packet.gateResults.passed ? "#22c55e20" : "#ef444420",
                color: packet.gateResults.passed ? "#22c55e" : "#ef4444",
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {packet.gateResults.passed ? "PASSED" : "FAILED"}
            </span>
            {packet.gateResults.timestamp && (
              <span style={{ fontSize: 12, color: "#666" }}>
                {formatDate(packet.gateResults.timestamp)}
              </span>
            )}
          </div>

          {packet.gateResults.checks && packet.gateResults.checks.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {packet.gateResults.checks.map((check, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <CheckIcon status={check.status} />
                  <span style={{ color: "#ccc" }}>{check.name}</span>
                  {check.message && (
                    <span style={{ color: "#888", fontSize: 12 }}>
                      ({check.message})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: 16,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 8,
      }}
    >
      <h4
        style={{
          margin: 0,
          marginBottom: 12,
          fontSize: 14,
          fontWeight: 600,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid #2a2a4a",
      }}
    >
      <span style={{ color: "#888", fontSize: 13 }}>{label}</span>
      <span
        style={{
          color: "#fff",
          fontSize: 13,
          fontFamily: mono ? "monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}

interface CountCardProps {
  label: string;
  count: number;
  color: string;
}

function CountCard({ label, count, color }: CountCardProps): React.ReactElement {
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: "#0a0a15",
        border: "1px solid #2a2a4a",
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color,
          marginBottom: 4,
        }}
      >
        {count}
      </div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
    </div>
  );
}

interface CheckIconProps {
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
}

function CheckIcon({ status }: CheckIconProps): React.ReactElement {
  const config = {
    PASS: { symbol: "\u2713", color: "#22c55e" },
    FAIL: { symbol: "\u2717", color: "#ef4444" },
    WARN: { symbol: "!", color: "#f59e0b" },
    SKIP: { symbol: "-", color: "#666" },
  };

  const { symbol, color } = config[status] || config.SKIP;

  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: `${color}20`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {symbol}
    </span>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function truncateHash(hash: string, length = 16): string {
  if (hash.length <= length * 2 + 3) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-8)}`;
}

export default PacketOverview;

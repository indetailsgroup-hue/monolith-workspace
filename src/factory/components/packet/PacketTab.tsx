/**
 * PacketTab - Container for packet viewer tabs
 * P2.1 Packet Viewer (Read-only)
 *
 * Manages packet data fetching and tab navigation.
 *
 * @version 0.12.0
 */

import React, { useEffect, useState, useCallback } from "react";
import { useFactoryStore } from "../../state/factoryStore";
import type { PacketResponseSuccess } from "./packetTypes";
import { isPacketSuccess } from "./packetTypes";
import { PacketErrorPanel } from "./PacketErrorPanel";
import { PacketOverview } from "./PacketOverview";
import { PacketPartsSheets } from "./PacketPartsSheets";
import { PacketToolpaths } from "./PacketToolpaths";
import { PacketJsonViewer } from "./PacketJsonViewer";

export interface PacketTabProps {
  jobId: string;
}

type PacketViewTab = "overview" | "parts" | "toolpaths" | "json";

const TAB_CONFIG: Array<{ id: PacketViewTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "parts", label: "Parts & Sheets" },
  { id: "toolpaths", label: "Toolpaths" },
  { id: "json", label: "JSON" },
];

export function PacketTab({ jobId }: PacketTabProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<PacketViewTab>("overview");

  const { getPacketCacheEntry, fetchPacket, clearPacketCache } = useFactoryStore();
  const cacheEntry = getPacketCacheEntry(jobId);

  // Fetch packet on mount
  useEffect(() => {
    if (cacheEntry.status === "IDLE") {
      fetchPacket(jobId);
    }
  }, [jobId, cacheEntry.status, fetchPacket]);

  // Handle retry
  const handleRetry = useCallback(() => {
    clearPacketCache(jobId);
    fetchPacket(jobId);
  }, [jobId, clearPacketCache, fetchPacket]);

  // Loading state
  if (cacheEntry.status === "LOADING") {
    return <LoadingState />;
  }

  // Error state
  if (cacheEntry.status === "ERROR" && cacheEntry.error) {
    return <PacketErrorPanel error={cacheEntry.error} onRetry={handleRetry} />;
  }

  // No data yet
  if (!cacheEntry.data || !isPacketSuccess(cacheEntry.data)) {
    return <LoadingState />;
  }

  const packetData = cacheEntry.data as PacketResponseSuccess;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #3a3a5a",
          backgroundColor: "#1a1a2e",
          padding: "0 16px",
        }}
      >
        {TAB_CONFIG.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}

        {/* Refresh Button */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <button
            onClick={handleRetry}
            style={{
              padding: "6px 12px",
              backgroundColor: "transparent",
              border: "none",
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
            }}
            title="Refresh packet data"
          >
            Refresh
          </button>

          {/* Last fetched */}
          {cacheEntry.fetchedAt && (
            <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>
              {formatTimeAgo(cacheEntry.fetchedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "overview" && (
          <PacketOverview
            packet={packetData.packet}
            packetSha256={packetData.packetSha256}
            sizeBytes={packetData.sizeBytes}
          />
        )}
        {activeTab === "parts" && <PacketPartsSheets packet={packetData.packet} />}
        {activeTab === "toolpaths" && <PacketToolpaths packet={packetData.packet} />}
        {activeTab === "json" && (
          <PacketJsonViewer
            packet={packetData.packet}
            packetSha256={packetData.packetSha256}
            sizeBytes={packetData.sizeBytes}
          />
        )}
      </div>
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
        padding: "12px 20px",
        backgroundColor: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        color: active ? "#fff" : "#888",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
        color: "#888",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid #3a3a5a",
          borderTopColor: "#3b82f6",
          animation: "spin 1s linear infinite",
          marginBottom: 16,
        }}
      />
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <span style={{ fontSize: 14 }}>Loading packet data...</span>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return date.toLocaleDateString();
}

export default PacketTab;

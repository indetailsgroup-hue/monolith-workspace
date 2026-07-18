/**
 * JobDetail - Individual job view with verify & export
 * P1.1 Factory Ops UX + P2.1 Packet Viewer + P2.2 Gated Export + P7A Activity Timeline + D2.2 CNC
 *
 * Flow: Overview → Packet → Factory Check → Export → CNC
 * 100% read-only - no editing capabilities.
 *
 * @version 0.12.8 - D2.2 CNC Integration
 */

import React, { useEffect, useCallback, useState } from "react";
import { useFactoryStore, createSelectVerifiedPacketCacheEntry } from "../state/factoryStore";
import type { MachineType, ExportResponse, JobDetailData, MaterialSummary } from "../types/job";
import { canVerify, canExport } from "../types/job";
import { StatusBadge } from "../components/StatusBadge";
import { TrustStrip } from "../components/TrustStrip";
import { VerifyConsole } from "../components/VerifyConsole";
import { MachineSelector } from "../components/MachineSelector";
import { IncidentBanner } from "../components/IncidentBanner";
import { PacketTab } from "../components/packet";
import {
  ExportLockBanner,
  ExportConfigurator,
  ExportActions,
  type ExportRequest,
} from "../components/export";
import { ActivityTimeline } from "../components/activity/ActivityTimeline";
import { CncGeneratePanel, GcodePreviewPanel } from "../components/cnc";
import type { GcodeBundle } from "../../cnc/post/types";

export interface JobDetailProps {
  jobId: string;
  onBack: () => void;
}

type Tab = "overview" | "packet" | "validation" | "verify" | "export" | "cnc" | "activity";

export function JobDetail({ jobId, onBack }: JobDetailProps): React.ReactElement {
  const {
    selectedJob,
    selectedJobLoading,
    loadJobDetailData,
    selectedMachine,
    setSelectedMachine,
    exporting,
    exportResult,
    startExport,
    clearExportResult,
    // P2.2 Gated Export
    verifyResult,
    verifying,
    startVerify,
    exportOptions,
    exportOptionsLoading,
    fetchExportOptions,
    getExportCacheEntry,
    runGatedExport,
    // P7A Activity Timeline
    getServerActivityCacheEntry,
    fetchServerActivity,
  } = useFactoryStore();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [exportConfig, setExportConfig] = useState<ExportRequest | null>(null);

  // D2.2: CNC G-code generation state
  const [gcodeBundle, setGcodeBundle] = useState<GcodeBundle | null>(null);
  const [showGcodePreview, setShowGcodePreview] = useState(false);

  // D0: Verified packet cache
  const verifiedPacketEntry = useFactoryStore(createSelectVerifiedPacketCacheEntry(jobId));

  // Load job on mount
  useEffect(() => {
    loadJobDetailData(jobId);
  }, [jobId, loadJobDetailData]);

  // Fetch export options when export tab is active
  useEffect(() => {
    if (activeTab === "export" && !exportOptions && !exportOptionsLoading) {
      fetchExportOptions();
    }
  }, [activeTab, exportOptions, exportOptionsLoading, fetchExportOptions]);

  // Get gated export state for this job
  const gatedExportState = getExportCacheEntry(jobId);

  // Check if export is allowed. STORAGE_HASH_MATCH unlocks export of the
  // STORED packet (bytes-at-rest integrity is the right gate for download) —
  // it is NOT full verification and must never widen beyond export (FS-B1-02).
  const isVerifyPassed =
    verifyResult?.verdict === "PASS" ||
    verifyResult?.verdict === "STORAGE_HASH_MATCH" ||
    selectedJob?.trust?.gate === "PASS";

  // Handle legacy export
  const handleExport = useCallback(async () => {
    if (!selectedMachine) return;
    await startExport(jobId, selectedMachine);
  }, [jobId, selectedMachine, startExport]);

  // Handle gated export (P2.2)
  const handleGatedExport = useCallback(async () => {
    if (!exportConfig) return;
    await runGatedExport(jobId, exportConfig);
  }, [jobId, exportConfig, runGatedExport]);

  // Handle verify for export unlock
  const handleRunVerify = useCallback(async () => {
    await startVerify(jobId);
  }, [jobId, startVerify]);

  // Download handler
  const handleDownload = useCallback(() => {
    if (exportResult?.downloadUrl) {
      window.open(exportResult.downloadUrl, "_blank");
    }
  }, [exportResult]);

  if (selectedJobLoading || !selectedJob) {
    return <LoadingState />;
  }

  const showVerify = canVerify(selectedJob.status);
  const showExport = canExport(selectedJob.status);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#0a0a15",
        color: "#fff",
      }}
    >
      {/* Incident Banner */}
      <IncidentBanner />

      {/* Header */}
      <JobHeader job={selectedJob} onBack={onBack} />

      {/* Tabs */}
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          // Verify tab redirects to Factory Check
          if (tab === "verify") {
            setActiveTab("validation");
            return;
          }

          // Export requires verify PASS (Factory Check first)
          if (tab === "export" && !isVerifyPassed) {
            setActiveTab("validation");
            return;
          }

          setActiveTab(tab);
        }}
        showVerifyTab={showVerify}
        showExportTab={showExport}
      />

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 20,
        }}
      >
        {activeTab === "overview" && (
          <OverviewTab job={selectedJob} verifiedPacketEntry={verifiedPacketEntry} />
        )}

        {activeTab === "packet" && <PacketTab jobId={jobId} />}

        {activeTab === "validation" && (
          <FactoryCheckTab jobId={jobId} onPassed={() => setActiveTab("export")} />
        )}

        {/* verify tab redirects to validation via onTabChange */}

        {activeTab === "export" && (
          <ExportTab
            job={selectedJob}
            jobId={jobId}
            selectedMachine={selectedMachine}
            onMachineSelect={setSelectedMachine}
            onExport={handleExport}
            exporting={exporting}
            exportResult={exportResult}
            onDownload={handleDownload}
            onClear={clearExportResult}
            // P2.2 Gated Export
            verifyResult={verifyResult}
            isVerifying={verifying}
            onRunVerify={handleRunVerify}
            exportOptions={exportOptions}
            exportOptionsLoading={exportOptionsLoading}
            isVerifyPassed={isVerifyPassed}
            exportConfig={exportConfig}
            onConfigChange={setExportConfig}
            gatedExportState={gatedExportState}
            onGatedExport={handleGatedExport}
          />
        )}

        {activeTab === "cnc" && (
          <CncTab
            jobId={jobId}
            packet={verifiedPacketEntry.packet}
            onGenerateComplete={(bundle) => setGcodeBundle(bundle)}
            onPreviewRequest={(bundle) => {
              setGcodeBundle(bundle);
              setShowGcodePreview(true);
            }}
          />
        )}

        {activeTab === "activity" && (
          <ActivityTab
            jobId={jobId}
            fetchServerActivity={fetchServerActivity}
            getServerActivityCacheEntry={getServerActivityCacheEntry}
          />
        )}
      </div>

      {/* G-code Preview Modal (D2.2) */}
      <GcodePreviewPanel
        bundle={gcodeBundle}
        visible={showGcodePreview}
        onClose={() => setShowGcodePreview(false)}
      />
    </div>
  );
}

// ============================================================================
// Job Header
// ============================================================================

interface JobHeaderProps {
  job: JobDetailData;
  onBack: () => void;
}

function JobHeader({ job, onBack }: JobHeaderProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: 20,
        borderBottom: "1px solid #3a3a5a",
        backgroundColor: "#1a1a2e",
      }}
    >
      {/* Back Button */}
      <button
        onClick={onBack}
        style={{
          padding: "8px 12px",
          backgroundColor: "transparent",
          border: "1px solid #3a3a5a",
          borderRadius: 8,
          color: "#888",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        ← Back
      </button>

      {/* Job Info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {job.jobId}
          </h1>
          <StatusBadge status={job.status} />
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#888",
          }}
        >
          {job.projectName} • {job.customerName}
        </div>
      </div>

      {/* Trust Strip */}
      <TrustStrip trust={job.trust} size="sm" />
    </div>
  );
}

// ============================================================================
// Tab Bar
// ============================================================================

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  showVerifyTab: boolean;
  showExportTab: boolean;
}

function TabBar({
  activeTab,
  onTabChange,
  showVerifyTab,
  showExportTab,
}: TabBarProps): React.ReactElement {
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "overview", label: "📋 Overview", show: true },
    { id: "packet", label: "📦 Packet", show: true },
    { id: "validation", label: "🛡️ Factory Check", show: true },
    // Legacy verify tab hidden - Factory Check is canonical
    { id: "verify", label: "✓ Verify", show: false },
    { id: "export", label: "📤 Export", show: showExportTab },
    { id: "cnc", label: "⚙️ CNC", show: true },
    { id: "activity", label: "📜 Activity", show: true },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "0 20px",
        borderBottom: "1px solid #3a3a5a",
        backgroundColor: "#1a1a2e",
      }}
    >
      {tabs
        .filter((t) => t.show)
        .map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: "12px 20px",
              backgroundColor: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.id ? "2px solid #8b5cf6" : "2px solid transparent",
              color: activeTab === tab.id ? "#8b5cf6" : "#888",
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
    </div>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  job: JobDetailData;
  verifiedPacketEntry: import("../state/factoryStore").VerifiedPacketCacheEntry;
}

function OverviewTab({ job, verifiedPacketEntry }: OverviewTabProps): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 20,
      }}
    >
      {/* Job Summary Card */}
      <InfoCard title="📋 Job Summary">
        <InfoRow label="Job ID" value={job.jobId} />
        <InfoRow label="Project" value={job.projectName} />
        <InfoRow label="Customer" value={job.customerName} />
        <InfoRow label="Panels" value={`${job.panelCount} pcs`} />
        <InfoRow label="Sheets" value={`${job.sheetCount} sheets`} />
        <InfoRow
          label="Created"
          value={new Date(job.createdAt).toLocaleString("th-TH")}
        />
      </InfoCard>

      {/* Materials Card */}
      <InfoCard title="🪵 Materials">
        {job.materials.map((mat: MaterialSummary, idx: number) => (
          <InfoRow
            key={idx}
            label={mat.code}
            value={`${mat.name} ${mat.thickness}mm × ${mat.sheetCount} sheets`}
          />
        ))}
      </InfoCard>

      {/* Machine Compatibility Card */}
      <InfoCard title="🏭 Machine Compatibility">
        {job.machineSupport.map((machine: MachineType) => (
          <InfoRow
            key={machine}
            label={machine}
            value={`${job.toolCount[machine]} tools, ~${Math.round(
              job.estimatedRuntime[machine]
            )} min`}
          />
        ))}
        {job.machineSupport.length === 0 && (
          <div style={{ color: "#ef4444" }}>⚠️ No compatible machines</div>
        )}
      </InfoCard>

      {/* Trust Status Card */}
      <InfoCard title="🔒 Trust Status">
        <TrustStrip trust={job.trust} layout="vertical" size="lg" />
        {job.lastVerifiedAt && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#888",
            }}
          >
            Last verified: {new Date(job.lastVerifiedAt).toLocaleString("th-TH")}
          </div>
        )}
      </InfoCard>

      {/* Verified Packet Card (D0) */}
      {verifiedPacketEntry.status !== "IDLE" && (
        <VerifiedPacketCard entry={verifiedPacketEntry} />
      )}
    </div>
  );
}

// ============================================================================
// Factory Check (Validation) Tab — canonical step before export
// ============================================================================

interface FactoryCheckTabProps {
  jobId: string;
  onPassed: () => void;
}

function FactoryCheckTab({ jobId, onPassed }: FactoryCheckTabProps): React.ReactElement {
  const handleComplete = useCallback(
    (result: { verdict: string }) => {
      // PASS / STORAGE_HASH_MATCH only - WARN does not unlock export
      if (result.verdict === "PASS" || result.verdict === "STORAGE_HASH_MATCH") {
        // Keep the short delay: operator sees result, then we advance
        setTimeout(onPassed, 800);
      }
    },
    [onPassed]
  );

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ color: "#888", fontSize: 13 }}>
        Server-authoritative factory verification. Verbatim log. No frontend trust.
      </div>

      <VerifyConsole jobId={jobId} onVerifyComplete={handleComplete} />

      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
        Policy: Export unlocks only on PASS. Warnings require remediation or re-run after fixes.
      </div>
    </div>
  );
}

// ============================================================================
// Export Tab (P2.2 Gated Export)
// ============================================================================

interface ExportTabProps {
  job: JobDetailData;
  jobId: string;
  selectedMachine: MachineType | null;
  onMachineSelect: (machine: MachineType) => void;
  onExport: () => void;
  exporting: boolean;
  exportResult: ExportResponse | null;
  onDownload: () => void;
  onClear: () => void;
  // P2.2 Gated Export
  verifyResult: import("../types/job").VerifyApiResponse | null;
  isVerifying: boolean;
  onRunVerify: () => void;
  exportOptions: import("../components/export").ExportOptionsResponse | null;
  exportOptionsLoading: boolean;
  isVerifyPassed: boolean;
  exportConfig: ExportRequest | null;
  onConfigChange: (config: ExportRequest) => void;
  gatedExportState: import("../components/export").ExportCacheEntry;
  onGatedExport: () => void;
}

function ExportTab({
  job,
  jobId,
  selectedMachine,
  onMachineSelect,
  onExport,
  exporting,
  exportResult,
  onDownload,
  onClear,
  // P2.2 Gated Export
  verifyResult,
  isVerifying,
  onRunVerify,
  exportOptions,
  exportOptionsLoading,
  isVerifyPassed,
  exportConfig,
  onConfigChange,
  gatedExportState,
  onGatedExport,
}: ExportTabProps): React.ReactElement {
  // Use gated export mode
  const useGatedExport = true;

  if (useGatedExport) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        {/* Export Lock Banner */}
        <ExportLockBanner
          verifyResult={verifyResult}
          jobStatus={job.status}
          onRunVerify={onRunVerify}
          isVerifying={isVerifying}
        />

        {/* Export Configurator */}
        <ExportConfigurator
          options={exportOptions}
          optionsLoading={exportOptionsLoading}
          exportAllowed={isVerifyPassed}
          onConfigChange={onConfigChange}
        />

        {/* Export Actions */}
        <ExportActions
          config={exportConfig}
          exportAllowed={isVerifyPassed}
          status={gatedExportState.status}
          lastExport={gatedExportState.lastExport}
          error={gatedExportState.error}
          onExport={onGatedExport}
          onDownload={
            gatedExportState.lastExport
              ? () => {
                  const downloadPath = gatedExportState.lastExport?.downloadPath;
                  if (downloadPath) {
                    window.open(downloadPath, "_blank");
                  }
                }
              : undefined
          }
        />
      </div>
    );
  }

  // Legacy export (fallback)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      {/* Machine Selector */}
      <MachineSelector
        job={job}
        selectedMachine={selectedMachine}
        onSelect={onMachineSelect}
        disabled={false}
      />

      {/* Export Button */}
      {selectedMachine && !exportResult && (
        <button
          onClick={onExport}
          disabled={exporting}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "16px 24px",
            backgroundColor: exporting ? "#3a3a5a" : "#22c55e",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: exporting ? "not-allowed" : "pointer",
          }}
        >
          {exporting ? "⟳ Exporting..." : `📤 Export for ${selectedMachine}`}
        </button>
      )}

      {/* Export Result */}
      {exportResult && (
        <ExportResultCard
          result={exportResult}
          onDownload={onDownload}
          onClear={onClear}
        />
      )}
    </div>
  );
}

interface ExportResultCardProps {
  result: ExportResponse;
  onDownload: () => void;
  onClear: () => void;
}

function ExportResultCard({
  result,
  onDownload,
  onClear,
}: ExportResultCardProps): React.ReactElement {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "#22c55e20",
        border: "2px solid #22c55e",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 32 }}>✓</span>
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#22c55e",
            }}
          >
            Export Complete
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>
            {result.sheetCount} sheets for {result.machine}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
        }}
      >
        <button
          onClick={onDownload}
          style={{
            flex: 1,
            padding: "12px 20px",
            backgroundColor: "#22c55e",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📥 Download {result.filename}
        </button>
        <button
          onClick={onClear}
          style={{
            padding: "12px 16px",
            backgroundColor: "transparent",
            border: "1px solid #3a3a5a",
            borderRadius: 8,
            color: "#888",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Activity Tab (P7A Server-Authoritative)
// ============================================================================

interface ActivityTabProps {
  jobId: string;
  fetchServerActivity: (jobId: string) => Promise<unknown>;
  getServerActivityCacheEntry: (jobId: string) => {
    status: "IDLE" | "LOADING" | "DONE" | "ERROR";
    items: import("../types/activity").ActivityRecord[];
    error?: string;
  };
}

function ActivityTab({
  jobId,
  fetchServerActivity,
  getServerActivityCacheEntry,
}: ActivityTabProps): React.ReactElement {
  const activityState = getServerActivityCacheEntry(jobId);

  // Auto-fetch on mount
  useEffect(() => {
    if (activityState.status === "IDLE") {
      fetchServerActivity(jobId);
    }
  }, [jobId, activityState.status, fetchServerActivity]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchServerActivity(jobId);
  }, [jobId, fetchServerActivity]);

  return (
    <ActivityTimeline
      jobId={jobId}
      items={activityState.items}
      loading={activityState.status === "LOADING"}
      error={activityState.error}
      onRefresh={handleRefresh}
    />
  );
}

// ============================================================================
// CNC Tab (D2.2)
// ============================================================================

interface CncTabProps {
  jobId: string;
  packet: import("../packet/types").FactoryPacket | null;
  onGenerateComplete: (bundle: GcodeBundle) => void;
  onPreviewRequest: (bundle: GcodeBundle) => void;
}

function CncTab({
  jobId,
  packet,
  onGenerateComplete,
  onPreviewRequest,
}: CncTabProps): React.ReactElement {
  return (
    <div
      style={{
        maxWidth: 700,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ color: "#888", fontSize: 13 }}>
        Generate machine-specific G-code from verified packet data.
        Requires a verified packet with drill map data.
      </div>

      <CncGeneratePanel
        jobId={jobId}
        packet={packet}
        onGenerateComplete={onGenerateComplete}
        onPreviewRequest={onPreviewRequest}
      />

      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
        G-code includes SHA-256 hash for traceability. Generated output is deterministic.
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface InfoCardProps {
  title: string;
  children: React.ReactNode;
}

function InfoCard({ title, children }: InfoCardProps): React.ReactElement {
  return (
    <div
      style={{
        padding: 20,
        backgroundColor: "#1a1a2e",
        border: "1px solid #3a3a5a",
        borderRadius: 12,
      }}
    >
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 14,
          fontWeight: 600,
          color: "#888",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ color: "#888", fontSize: 13 }}>{label}</span>
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#0a0a15",
        color: "#888",
      }}
    >
      <span style={{ fontSize: 48 }}>⟳</span>
    </div>
  );
}

// ============================================================================
// Verified Packet Card (D0)
// ============================================================================

interface VerifiedPacketCardProps {
  entry: import("../state/factoryStore").VerifiedPacketCacheEntry;
}

function VerifiedPacketCard({ entry }: VerifiedPacketCardProps): React.ReactElement {
  const isVerified = entry.status === "VERIFIED";
  const borderColor = isVerified ? "#22c55e" : "#ef4444";
  const bgColor = isVerified ? "#22c55e20" : "#ef444420";

  // Format file size
  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Get summary from verify result
  const summary = entry.verifyResult?.summary;
  const packet = entry.packet;

  return (
    <div
      style={{
        padding: 20,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
      }}
    >
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: 14,
          fontWeight: 600,
          color: borderColor,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {isVerified ? "✓" : "✗"} Ingested Packet
      </h3>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <InfoRow label="File" value={entry.fileName || "Unknown"} />
        <InfoRow label="Size" value={formatBytes(entry.fileSizeBytes)} />
        <InfoRow
          label="Status"
          value={isVerified ? "Verified" : "Invalid"}
        />

        {summary && (
          <InfoRow
            label="Checks"
            value={`${summary.passed} passed, ${summary.failed} failed, ${summary.warned} warned`}
          />
        )}

        {packet && (
          <>
            <InfoRow label="Parts" value={`${packet.cutList?.summary?.totalParts || 0} pcs`} />
            <InfoRow label="Drills" value={`${packet.drillMap?.summary?.totalDrills || 0} holes`} />
          </>
        )}

        {entry.verifiedAt && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "#888",
            }}
          >
            Ingested: {new Date(entry.verifiedAt).toLocaleString("th-TH")}
          </div>
        )}
      </div>
    </div>
  );
}

export default JobDetail;

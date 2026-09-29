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
import { PacketIngestPanel } from "../components/PacketIngestPanel";
import {
  ExportLockBanner,
  ExportConfigurator,
  ExportActions,
  isVerifyPassed as isVerifyPassedResult,
  type ExportRequest,
} from "../components/export";
import { ActivityTimeline } from "../components/activity/ActivityTimeline";
import { CncGeneratePanel, GcodePreviewPanel } from "../components/cnc";
import type { GcodeBundle } from "../../cnc/post/types";
import { ExportOptionsDialog } from "../../components/ui/ExportOptionsDialog";
import { buildCutListXlsx } from "../../core/export/monolith/builders/buildCutListXlsx";
import { NestingSheetReport } from "../components/nesting/NestingSheetReport";
import { DxfPreviewPanel } from "../components/nesting/DxfPreviewPanel";
import { exportNestingPdf } from "../components/nesting/exportNestingPdf";
import { exportCurvedDxfBatch } from "../components/nesting/exportCurvedDxfBatch";

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
    exportOptionsError,
    fetchExportOptions,
    getExportCacheEntry,
    runGatedExport,
    // P7A Activity Timeline
    getServerActivityCacheEntry,
    fetchServerActivity,
  } = useFactoryStore();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [exportConfig, setExportConfig] = useState<ExportRequest | null>(null);

  // ExportOptionsDialog overlay state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Feature 2: XLSX cut-list download state
  const [xlsxDownloading, setXlsxDownloading] = useState(false);

  // Feature 3: Nesting sheet report visibility
  const [nestingReportOpen, setNestingReportOpen] = useState(false);

  // PDF export state
  const [pdfExporting, setPdfExporting] = useState(false);

  // Feature 4: DXF batch export state
  const [dxfBatchExporting, setDxfBatchExporting] = useState(false);

  // D2.2: CNC G-code generation state
  const [gcodeBundle, setGcodeBundle] = useState<GcodeBundle | null>(null);
  const [showGcodePreview, setShowGcodePreview] = useState(false);

  // D0: Verified packet cache
  const verifiedPacketEntry = useFactoryStore(createSelectVerifiedPacketCacheEntry(jobId));

  // Load job on mount
  useEffect(() => {
    loadJobDetailData(jobId);
  }, [jobId, loadJobDetailData]);

  // Fetch export options when export tab is active.
  // exportOptionsError guard (S18 L2): after a failed fetch the store keeps
  // the error — without it this effect refires forever against a dead
  // endpoint (options=null + loading=false again after every failure).
  useEffect(() => {
    if (
      activeTab === "export" &&
      !exportOptions &&
      !exportOptionsLoading &&
      !exportOptionsError
    ) {
      fetchExportOptions();
    }
  }, [activeTab, exportOptions, exportOptionsLoading, exportOptionsError, fetchExportOptions]);

  // Get gated export state for this job
  const gatedExportState = getExportCacheEntry(jobId);

  // Check if export is allowed — SAME rule as ExportLockBanner (S18 L2):
  // PASS / PASS_WITH_WARN (amber banner explains the warning) /
  // STORAGE_HASH_MATCH. STORAGE_HASH_MATCH unlocks export of the STORED
  // packet (bytes-at-rest integrity is the right gate for download) — it is
  // NOT full verification and must never widen beyond export (FS-B1-02).
  const isVerifyPassed =
    isVerifyPassedResult(verifyResult) || selectedJob?.trust?.gate === "PASS";

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
    try {
      await startVerify(jobId);
    } catch {
      // Intentionally silent (S18 L2 PR #22 fix): startVerify rethrows by
      // design for callers that need the raw error, but the UI state is
      // already fully handled inside the store — normalizeError →
      // setVerifyResult(errorResult), and `finally` clears `verifying`.
      // Without this catch every failed verify becomes an unhandled
      // promise rejection.
    }
  }, [jobId, startVerify]);

  // Retry export-options fetch (S18 L2 PR #22 fix): fetchExportOptions
  // clears exportOptionsError before refetching, so this both dismisses the
  // error UI and re-arms the request. fetchExportOptions never rejects
  // (errors are captured into exportOptionsError).
  const handleRetryExportOptions = useCallback(() => {
    void fetchExportOptions();
  }, [fetchExportOptions]);

  // Download handler
  const handleDownload = useCallback(() => {
    if (exportResult?.downloadUrl) {
      window.open(exportResult.downloadUrl, "_blank");
    }
  }, [exportResult]);

  // Feature 2: XLSX cut-list download
  const handleXlsxDownload = useCallback(async () => {
    const cutList = verifiedPacketEntry?.packet?.cutList;
    if (!cutList) return;
    setXlsxDownloading(true);
    try {
      const buffer = await buildCutListXlsx({ cutList, jobId });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cutlist_${jobId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setXlsxDownloading(false);
    }
  }, [verifiedPacketEntry, jobId]);

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

        {activeTab === "packet" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* S18 L2 Slice 4: local ingest + verify (Phase C) — lets the
                operator drop a packet ZIP even when the server packet
                endpoint has nothing for this job */}
            <PacketIngestPanel jobId={jobId} />
            <PacketTab jobId={jobId} />
          </div>
        )}

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
            exportOptionsError={exportOptionsError}
            onRetryExportOptions={handleRetryExportOptions}
            isVerifyPassed={isVerifyPassed}
            exportConfig={exportConfig}
            onConfigChange={setExportConfig}
            gatedExportState={gatedExportState}
            onGatedExport={handleGatedExport}
            onOpenExportDialog={() => setExportDialogOpen(true)}
            packet={verifiedPacketEntry?.packet}
            xlsxDownloading={xlsxDownloading}
            onXlsxDownload={handleXlsxDownload}
            nestingReportOpen={nestingReportOpen}
            onToggleNestingReport={() => setNestingReportOpen((v) => !v)}
            pdfExporting={pdfExporting}
            onPdfExport={async () => {
              setPdfExporting(true);
              try {
                const container = document.getElementById("nesting-report-container");
                if (container) {
                  await exportNestingPdf(container, jobId);
                }
              } finally {
                setPdfExporting(false);
              }
            }}
            dxfBatchExporting={dxfBatchExporting}
            onDxfBatchExport={async () => {
              setDxfBatchExporting(true);
              try {
                const sheets = verifiedPacketEntry?.packet?.nestingSheets ?? [];
                await exportCurvedDxfBatch(sheets, jobId);
              } finally {
                setDxfBatchExporting(false);
              }
            }}
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

      {/* Export Options Dialog (Phase 6.2) — verifyResult + jobStatus from store */}
      <ExportOptionsDialog
        open={exportDialogOpen}
        jobId={jobId}
        verifyResult={verifyResult}
        jobStatus={selectedJob.status}
        onClose={() => setExportDialogOpen(false)}
        onExportSuccess={() => {
          setExportDialogOpen(false);
          loadJobDetailData(jobId);
        }}
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
    (result: import("../types/job").VerifyApiResponse) => {
      // Shared unlock rule (S18 L2): PASS / PASS_WITH_WARN / STORAGE_HASH_MATCH
      if (isVerifyPassedResult(result)) {
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
        Policy: Export unlocks on PASS. PASS_WITH_WARN unlocks too — with an
        amber caution banner on the Export tab. FAIL blocks export.
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
  /** Last export-options fetch failure — non-null means the auto-fetch gave
   *  up and the operator needs a manual retry (S18 L2 PR #22 fix). */
  exportOptionsError: string | null;
  /** Re-runs fetchExportOptions (clears the error first in the store). */
  onRetryExportOptions: () => void;
  isVerifyPassed: boolean;
  exportConfig: ExportRequest | null;
  onConfigChange: (config: ExportRequest) => void;
  gatedExportState: import("../components/export").ExportCacheEntry;
  onGatedExport: () => void;
  /** Opens the ExportOptionsDialog overlay (Phase 6.2) */
  onOpenExportDialog: () => void;
  /** Verified FactoryPacket — provides cutList for XLSX export (Feature 2) */
  packet?: import("../packet/types").FactoryPacket | null;
  /** XLSX download in-progress flag */
  xlsxDownloading: boolean;
  /** Trigger XLSX cut-list download */
  onXlsxDownload: () => void;
  /** Whether the nesting sheet report panel is visible */
  nestingReportOpen: boolean;
  /** Toggle nesting sheet report panel */
  onToggleNestingReport: () => void;
  /** PDF export in-progress flag */
  pdfExporting: boolean;
  /** Trigger PDF nesting export */
  onPdfExport: () => void;
  /** DXF batch export in-progress flag */
  dxfBatchExporting: boolean;
  /** Trigger DXF batch zip export */
  onDxfBatchExport: () => void;
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
  exportOptionsError,
  onRetryExportOptions,
  isVerifyPassed,
  exportConfig,
  onConfigChange,
  gatedExportState,
  onGatedExport,
  onOpenExportDialog,
  packet,
  xlsxDownloading,
  onXlsxDownload,
  nestingReportOpen,
  onToggleNestingReport,
  pdfExporting,
  onPdfExport,
  dxfBatchExporting,
  onDxfBatchExport,
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
        {/* Export Options Dialog trigger */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onOpenExportDialog}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              backgroundColor: "transparent",
              border: "1px solid #8b5cf6",
              borderRadius: 8,
              color: "#8b5cf6",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#8b5cf620";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            ⚙️ Export Options
          </button>
        </div>

        {/* Export Lock Banner */}
        <ExportLockBanner
          verifyResult={verifyResult}
          jobStatus={job.status}
          onRunVerify={onRunVerify}
          isVerifying={isVerifying}
        />

        {/* Export options fetch error + retry (S18 L2 PR #22 fix): the
            auto-fetch effect stops after one failure by design — without
            this panel a single transient failure leaves the Export tab
            dead until a full page reload. */}
        {exportOptionsError && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              backgroundColor: "#ef444420",
              border: "1px solid #ef4444",
              borderRadius: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fecaca",
                  marginBottom: 4,
                }}
              >
                โหลดตัวเลือก Export ไม่สำเร็จ
              </div>
              <div style={{ fontSize: 13, color: "#fca5a5" }}>
                {exportOptionsError}
              </div>
            </div>
            <button
              onClick={onRetryExportOptions}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #fca5a5",
                backgroundColor: "transparent",
                color: "#fecaca",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ↻ ลองใหม่
            </button>
          </div>
        )}

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

        {/* Feature 2: XLSX Cut-List Download */}
        {packet?.cutList && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => void onXlsxDownload()}
              disabled={xlsxDownloading}
              data-testid="xlsx-download-button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                backgroundColor: xlsxDownloading ? "#1e293b" : "#0d9488",
                border: "1px solid #0f766e",
                borderRadius: 8,
                color: xlsxDownloading ? "#94a3b8" : "#fff",
                fontSize: 13,
                fontWeight: 500,
                cursor: xlsxDownloading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {xlsxDownloading ? "⟳ Generating…" : "⬇ Download Cut List (.xlsx)"}
            </button>

            {/* Feature 3: Nesting Sheet Report toggle */}
            <button
              onClick={onToggleNestingReport}
              data-testid="nesting-report-toggle"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                backgroundColor: nestingReportOpen ? "#0d9488" : "transparent",
                border: "1px solid #0d9488",
                borderRadius: 8,
                color: nestingReportOpen ? "#fff" : "#0d9488",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              ⬚ Nesting Report
            </button>
          </div>
        )}

        {/* Feature 3: Nesting Sheet Report panel */}
        {nestingReportOpen && (
          <div
            style={{
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: 16,
              backgroundColor: "#0f172a",
            }}
          >
            <NestingSheetReport
              sheets={packet?.nestingSheets ?? []}
              jobId={jobId}
            />
            {/* DXF Preview Panel */}
            {(packet?.nestingSheets?.length ?? 0) > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid #1e293b', background: '#020617' }}>
                <DxfPreviewPanel sheets={packet?.nestingSheets ?? []} jobId={jobId} />
              </div>
            )}

            {/* PDF Export + DXF Batch buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                data-testid="btn-pdf-nesting"
                disabled={pdfExporting || !(packet?.nestingSheets?.length)}
                onClick={onPdfExport}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #7c3aed",
                  background: pdfExporting ? "#4c1d95" : "transparent",
                  color: "#a78bfa",
                  cursor: pdfExporting ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                {pdfExporting ? "Exporting PDF…" : "📄 Export PDF"}
              </button>

              <button
                data-testid="btn-dxf-batch"
                disabled={dxfBatchExporting || !(packet?.nestingSheets?.length)}
                onClick={onDxfBatchExport}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #059669",
                  background: dxfBatchExporting ? "#064e3b" : "transparent",
                  color: "#6ee7b7",
                  cursor: dxfBatchExporting ? "wait" : "pointer",
                  fontSize: 13,
                }}
              >
                {dxfBatchExporting ? "Zipping DXF…" : "📐 DXF Batch (ZIP)"}
              </button>
            </div>
          </div>
        )}
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

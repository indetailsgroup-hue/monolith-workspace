/**
 * @vitest-environment jsdom
 */

// S18 L2 Slice 3: JobDetail must apply the SAME unlock rule as
// ExportLockBanner — a PASS_WITH_WARN operator can reach the Export tab and
// sees the amber warning banner there (not a silent redirect to Factory
// Check while the banner claims everything is unlocked).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { JobDetailData, VerifyApiResponse } from "../../types/job";

const jobDetail: JobDetailData = {
  jobId: "JOB-0001",
  projectName: "Warn Cabinet",
  customerName: "Test Customer",
  status: "VERIFIED",
  trust: { gate: "PENDING", signature: "VALID", audit: "OK" },
  panelCount: 4,
  sheetCount: 2,
  machineSupport: ["KDT"],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  packetUrl: "/packets/JOB-0001.zip",
  materials: [],
  estimatedRuntime: { KDT: 10, BIESSE: 0, HOMAG: 0 },
  toolCount: { KDT: 3, BIESSE: 0, HOMAG: 0 },
};

vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: vi.fn().mockResolvedValue([]),
  fetchJobDetailApi: vi.fn().mockImplementation(async () => jobDetail),
  triggerLegacyExportApi: vi.fn(),
}));

vi.mock("../../api/exportApi", () => ({
  fetchExportOptionsApi: vi.fn().mockRejectedValue(new Error("offline")),
  runGatedExportApi: vi.fn(),
}));

import { JobDetail } from "../JobDetail";
import { useFactoryStore } from "../../state/factoryStore";

const warnResult: VerifyApiResponse = {
  verdict: "PASS_WITH_WARN",
  code: "W_AUDIT_UNKNOWN",
  summary: "ตรวจ Audit ไม่ได้ (offline)",
  log: "audit endpoint unreachable",
  timestamp: "2026-07-18T00:00:00.000Z",
  checks: [],
};

describe("JobDetail — PASS_WITH_WARN alignment (S18 L2 Slice 3)", () => {
  beforeEach(() => {
    useFactoryStore.setState({
      selectedJobId: null,
      selectedJob: null,
      selectedJobLoading: false,
      verifyResult: warnResult,
      verifying: false,
      exportOptions: null,
      exportOptionsLoading: false,
      gatedExportByJobId: {},
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lets a PASS_WITH_WARN operator open the Export tab and see the amber warning", async () => {
    render(<JobDetail jobId="JOB-0001" onBack={() => {}} />);

    // Wait for job load (job id appears in header + overview card)
    await screen.findAllByText("JOB-0001");

    fireEvent.click(screen.getByRole("button", { name: /📤 Export/ }));

    // Aligned rule: WARN unlocks export — we are ON the export tab, and the
    // amber banner explains the warning (no red "Export Locked").
    expect(await screen.findByText(/with warning/i)).toBeInTheDocument();
    expect(screen.queryByText("Export Locked")).toBeNull();
    // Not redirected to Factory Check
    expect(
      screen.queryByText(/Server-authoritative factory verification/)
    ).toBeNull();
  });
});

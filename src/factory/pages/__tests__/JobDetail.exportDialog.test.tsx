/**
 * @vitest-environment jsdom
 *
 * Integration tests: ExportOptionsDialog wired into JobDetail (Phase 6.2).
 *
 * Covers:
 *  - "⚙️ Export Options" button is visible on the Export tab
 *  - clicking it opens the dialog (title "Export CNC Program" visible)
 *  - dialog with FAIL verifyResult → "Export Locked" shown in dialog
 *  - dialog with PASS verifyResult → export button enabled after options load
 *  - export success → fetchJobDetailApi called twice (initial load + reload)
 *  - dialog closes after successful export
 *
 * Note: ExportTab itself also renders ExportLockBanner / ExportActions, so
 * queries for those elements are scoped to `within(dialog)` to avoid
 * "multiple elements" failures.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { JobDetailData, VerifyApiResponse } from "../../types/job";
import type {
  ExportOptionsResponse,
  ExportResponseSuccess,
} from "../../components/export/exportTypes";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const jobDetail: JobDetailData = {
  jobId: "JOB-DIALOG",
  projectName: "Dialog Test Cabinet",
  customerName: "Test Customer",
  status: "VERIFIED",
  // trust.gate PASS → Export tab reachable even with verifyResult=null
  trust: { gate: "PASS", signature: "VALID", audit: "OK" },
  panelCount: 4,
  sheetCount: 2,
  machineSupport: ["KDT"],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  packetUrl: "/packets/JOB-DIALOG.zip",
  materials: [],
  estimatedRuntime: { KDT: 10, BIESSE: 0, HOMAG: 0 },
  toolCount: { KDT: 3, BIESSE: 0, HOMAG: 0 },
};

const exportOptions: ExportOptionsResponse = {
  dialects: [
    {
      id: "KDT",
      name: "KDT Nesting",
      profiles: [
        { id: "kdt_mvp_v1", name: "KDT MVP v1", dialect: "KDT", enabled: true },
      ],
    },
  ],
  modes: [{ id: "PER_JOB", name: "Per Job", description: "One bundle per job" }],
  targets: [
    { id: "BUNDLE", name: "Bundle", description: "ZIP bundle", enabled: true },
  ],
};

const passVerify: VerifyApiResponse = {
  verdict: "PASS",
  code: "OK",
  summary: "All checks passed",
  log: "",
  timestamp: "2026-07-18T00:00:00.000Z",
  checks: [],
};

const failVerify: VerifyApiResponse = {
  verdict: "FAIL",
  code: "E_GATE_FAIL",
  summary: "Verification failed",
  log: "",
  timestamp: "2026-07-18T00:00:00.000Z",
  checks: [],
};

const exportSuccess: ExportResponseSuccess = {
  ok: true,
  exportId: "exp-dialog-001",
  sha256: "cafebabe1234",
  sizeBytes: 4096,
  filename: "job-JOB-DIALOG.zip",
  downloadPath: "/downloads/job-JOB-DIALOG.zip",
  exportedAt: "2026-07-18T12:00:00.000Z",
  dialect: "KDT",
  profileId: "kdt_mvp_v1",
  contents: { sheets: 4, files: 12, hasManifest: true, hasPacket: false },
};

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: vi.fn().mockResolvedValue([]),
  fetchJobDetailApi: vi.fn().mockImplementation(async () => jobDetail),
  triggerLegacyExportApi: vi.fn(),
}));

const fetchExportOptionsApiMock = vi.fn();
const runGatedExportApiMock = vi.fn();
vi.mock("../../api/exportApi", () => ({
  fetchExportOptionsApi: (...args: unknown[]) => fetchExportOptionsApiMock(...args),
  runGatedExportApi: (...args: unknown[]) => runGatedExportApiMock(...args),
  downloadExportApi: vi.fn(),
  triggerBrowserDownload: vi.fn(),
  getFilenameFromHeaders: vi.fn().mockReturnValue("job-JOB-DIALOG.zip"),
}));

const verifyJobApiMock = vi.fn();
vi.mock("../../api/verifyApi", () => ({
  verifyJobApi: (...args: unknown[]) => verifyJobApiMock(...args),
}));

// Imports after vi.mock so Vitest hoisting works correctly
import { JobDetail } from "../JobDetail";
import { useFactoryStore } from "../../state/factoryStore";
import { fetchJobDetailApi } from "../../api/jobsApi";

// ── Suite ──────────────────────────────────────────────────────────────────────

describe("JobDetail — ExportOptionsDialog integration (Phase 6.2)", () => {
  beforeEach(() => {
    fetchExportOptionsApiMock.mockReset();
    runGatedExportApiMock.mockReset();
    verifyJobApiMock.mockReset();
    vi.mocked(fetchJobDetailApi).mockClear();
    vi.mocked(fetchJobDetailApi).mockImplementation(async () => jobDetail);

    // Happy-path defaults
    fetchExportOptionsApiMock.mockResolvedValue({
      data: exportOptions,
      headers: new Headers(),
    });
    runGatedExportApiMock.mockResolvedValue({
      response: exportSuccess,
      sha256: exportSuccess.sha256,
    });

    // Reset factory store to a clean slate (mirrors reference test pattern)
    useFactoryStore.setState({
      selectedJobId: null,
      selectedJob: null,
      selectedJobLoading: false,
      verifyResult: null,
      verifying: false,
      exportOptions: null,
      exportOptionsLoading: false,
      exportOptionsError: null,
      gatedExportByJobId: {},
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Helper: render JobDetail and navigate to Export tab ───────────────────

  /**
   * Renders <JobDetail jobId="JOB-DIALOG" />, waits for the job to load,
   * clicks the "📤 Export" tab, then resolves the "⚙️ Export Options" button.
   */
  async function renderAndGoToExport(): Promise<HTMLElement> {
    render(<JobDetail jobId="JOB-DIALOG" onBack={vi.fn()} />);
    // Wait for job load — job ID heading appears once selectedJob is set
    await screen.findAllByText("JOB-DIALOG");
    // Navigate to Export tab (trust.gate PASS → navigation succeeds)
    fireEvent.click(screen.getByRole("button", { name: /📤 Export/ }));
    // Resolve the dialog trigger button
    return screen.findByRole("button", { name: /Export Options/i });
  }

  // ── 1. Export Options button is visible on Export tab ────────────────────

  it("renders the ⚙️ Export Options button on the Export tab", async () => {
    const btn = await renderAndGoToExport();
    expect(btn).toBeInTheDocument();
  });

  // ── 2. Clicking the button opens ExportOptionsDialog ─────────────────────

  it("opens ExportOptionsDialog with title 'Export CNC Program' when clicked", async () => {
    const btn = await renderAndGoToExport();
    fireEvent.click(btn);
    expect(await screen.findByText("Export CNC Program")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // ── 3. FAIL verifyResult → Export Locked banner in dialog ────────────────

  it("shows 'Export Locked' in dialog when verifyResult verdict is FAIL", async () => {
    // Pre-set FAIL result — loadJobDetailData does not reset verifyResult
    useFactoryStore.setState({ verifyResult: failVerify });

    const btn = await renderAndGoToExport();
    fireEvent.click(btn);

    // ExportTab also renders ExportLockBanner → scope to dialog only
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(within(dialog).getByText("Export Locked")).toBeInTheDocument();
    });
  });

  // ── 4. PASS verifyResult → export button enabled in dialog ───────────────

  it("enables the export button in dialog when verifyResult verdict is PASS", async () => {
    useFactoryStore.setState({ verifyResult: passVerify });

    const btn = await renderAndGoToExport();
    fireEvent.click(btn);

    // ExportTab also renders its own ExportActions → scope to dialog
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      const exportBtn = within(dialog).getByRole("button", { name: /Export G-Code/i });
      expect(exportBtn).not.toBeDisabled();
    });
  });

  // ── 5. Export success → fetchJobDetailApi called twice ────────────────────

  it("reloads job data (fetchJobDetailApi ×2) after a successful export", async () => {
    useFactoryStore.setState({ verifyResult: passVerify });

    const btn = await renderAndGoToExport();
    // Initial mount calls loadJobDetailData once
    expect(vi.mocked(fetchJobDetailApi)).toHaveBeenCalledTimes(1);

    fireEvent.click(btn);

    const dialog = await screen.findByRole("dialog");
    const exportBtn = await within(dialog).findByRole("button", {
      name: /Export G-Code/i,
    });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());

    fireEvent.click(exportBtn);

    // onExportSuccess → setExportDialogOpen(false) + loadJobDetailData(jobId)
    // → fetchJobDetailApi called a second time
    await waitFor(() => {
      expect(vi.mocked(fetchJobDetailApi)).toHaveBeenCalledTimes(2);
    });
  });

  // ── 6. Dialog closes after successful export ──────────────────────────────

  it("closes ExportOptionsDialog after a successful export", async () => {
    useFactoryStore.setState({ verifyResult: passVerify });

    const btn = await renderAndGoToExport();
    fireEvent.click(btn);

    const dialog = await screen.findByRole("dialog");
    const exportBtn = await within(dialog).findByRole("button", {
      name: /Export G-Code/i,
    });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());

    fireEvent.click(exportBtn);

    await waitFor(() => {
      // open=false → ExportOptionsDialog returns null → no dialog in DOM
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

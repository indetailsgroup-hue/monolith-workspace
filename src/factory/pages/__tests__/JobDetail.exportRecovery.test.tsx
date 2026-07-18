/**
 * @vitest-environment jsdom
 */

// S18 L2 review fixes (PR #22 — NEEDS_FIXES):
//
// 1. Export tab dead-end: the exportOptionsError guard correctly stops the
//    auto-fetch loop, but nothing ever calls fetchExportOptions again and
//    ExportTab never shows the error — one transient failure bricks the
//    Export tab until a full page reload. The tab must surface the error and
//    offer a retry button that calls fetchExportOptions (which clears the
//    error before refetching).
//
// 2. handleRunVerify unhandled rejection: startVerify rethrows by design,
//    but the JobDetail click handler never catches — every failed verify
//    produces an unhandled promise rejection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { JobDetailData } from "../../types/job";
import type { ExportOptionsResponse } from "../../components/export/exportTypes";

const jobDetail: JobDetailData = {
  jobId: "JOB-0002",
  projectName: "Recovery Cabinet",
  customerName: "Test Customer",
  status: "VERIFIED",
  // trust gate PASS → Export tab reachable without a fresh verifyResult
  trust: { gate: "PASS", signature: "VALID", audit: "OK" },
  panelCount: 4,
  sheetCount: 2,
  machineSupport: ["KDT"],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  packetUrl: "/packets/JOB-0002.zip",
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

vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: vi.fn().mockResolvedValue([]),
  fetchJobDetailApi: vi.fn().mockImplementation(async () => jobDetail),
  triggerLegacyExportApi: vi.fn(),
}));

const fetchExportOptionsApiMock = vi.fn();
vi.mock("../../api/exportApi", () => ({
  fetchExportOptionsApi: (...args: unknown[]) => fetchExportOptionsApiMock(...args),
  runGatedExportApi: vi.fn(),
}));

const verifyJobApiMock = vi.fn();
vi.mock("../../api/verifyApi", () => ({
  verifyJobApi: (...args: unknown[]) => verifyJobApiMock(...args),
}));

import { JobDetail } from "../JobDetail";
import { useFactoryStore } from "../../state/factoryStore";

describe("JobDetail — Export tab recovery (S18 L2 PR #22 fixes)", () => {
  beforeEach(() => {
    fetchExportOptionsApiMock.mockReset();
    verifyJobApiMock.mockReset();
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

  it("shows the export-options error with a retry button that refetches", async () => {
    // First fetch fails (transient), retry succeeds
    fetchExportOptionsApiMock
      .mockRejectedValueOnce(new Error("server down"))
      .mockResolvedValueOnce({ data: exportOptions, headers: new Headers() });

    render(<JobDetail jobId="JOB-0002" onBack={() => {}} />);
    await screen.findAllByText("JOB-0002");

    fireEvent.click(screen.getByRole("button", { name: /📤 Export/ }));

    // Auto-fetch fires once, fails, and the error is surfaced (not a silent
    // dead tab)
    const retryButton = await screen.findByRole("button", { name: /ลองใหม่/ });
    expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/server down/)).toBeInTheDocument();

    // Retry calls fetchExportOptions again (store clears the error first)
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(2);
      expect(useFactoryStore.getState().exportOptions).not.toBeNull();
    });

    // Error UI is gone after a successful retry
    expect(screen.queryByText(/server down/)).toBeNull();
    expect(screen.queryByRole("button", { name: /ลองใหม่/ })).toBeNull();
  });

  it("does not emit an unhandled rejection when Run Verify fails", async () => {
    fetchExportOptionsApiMock.mockResolvedValue({
      data: exportOptions,
      headers: new Headers(),
    });
    verifyJobApiMock.mockRejectedValue(new Error("verify endpoint down"));

    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);

    try {
      render(<JobDetail jobId="JOB-0002" onBack={() => {}} />);
      await screen.findAllByText("JOB-0002");

      fireEvent.click(screen.getByRole("button", { name: /📤 Export/ }));

      // trust gate PASS + verifyResult null → ExportLockBanner offers Run Verify
      const runVerify = await screen.findByRole("button", { name: /Run Verify/ });
      fireEvent.click(runVerify);

      // Verify flow settles: store handled the failure via normalizeError
      await waitFor(() => {
        expect(useFactoryStore.getState().verifying).toBe(false);
        expect(useFactoryStore.getState().verifyResult).not.toBeNull();
      });

      // Give Node macrotask turns so any unhandled rejection event fires
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
  });
});

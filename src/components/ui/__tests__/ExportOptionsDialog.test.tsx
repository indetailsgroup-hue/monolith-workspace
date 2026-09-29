/**
 * @vitest-environment jsdom
 *
 * Isolated unit tests for ExportOptionsDialog (Phase 6.2).
 *
 * Covers:
 *  - closed state renders nothing
 *  - open state renders dialog title
 *  - fetchExportOptionsApi called on open / not called when closed
 *  - Export Locked banner (verifyResult=null, verdict=FAIL)
 *  - export button disabled gate-blocked / enabled gate-open
 *  - options error surface
 *  - successful export → "Export Complete" + onExportSuccess callback
 *  - export failure → "Export Failed"
 *  - close via ✕ button, Escape key, backdrop click
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { VerifyApiResponse } from "../../../factory/types/job";
import type {
  ExportOptionsResponse,
  ExportResponseSuccess,
} from "../../../factory/components/export/exportTypes";

// ── Mock exportApi BEFORE component import (vi.mock is hoisted) ──────────────

const fetchExportOptionsApiMock = vi.fn();
const runGatedExportApiMock = vi.fn();
const downloadExportApiMock = vi.fn();
const triggerBrowserDownloadMock = vi.fn();
const getFilenameFromHeadersMock = vi.fn();

vi.mock("../../../factory/api/exportApi", () => ({
  fetchExportOptionsApi: (...args: unknown[]) => fetchExportOptionsApiMock(...args),
  runGatedExportApi: (...args: unknown[]) => runGatedExportApiMock(...args),
  downloadExportApi: (...args: unknown[]) => downloadExportApiMock(...args),
  triggerBrowserDownload: (...args: unknown[]) => triggerBrowserDownloadMock(...args),
  getFilenameFromHeaders: (...args: unknown[]) => getFilenameFromHeadersMock(...args),
}));

import { ExportOptionsDialog } from "../ExportOptionsDialog";

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
  exportId: "exp-001",
  sha256: "abc123def456",
  sizeBytes: 2048,
  filename: "job-JOB-001.zip",
  downloadPath: "/downloads/job-JOB-001.zip",
  exportedAt: "2026-07-18T12:00:00.000Z",
  dialect: "KDT",
  profileId: "kdt_mvp_v1",
  contents: { sheets: 4, files: 12, hasManifest: true, hasPacket: false },
};

// ── Helper ────────────────────────────────────────────────────────────────────

type DialogProps = Parameters<typeof ExportOptionsDialog>[0];

function defaultProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    open: true,
    jobId: "JOB-001",
    verifyResult: null,
    jobStatus: "VERIFIED",
    onClose: vi.fn(),
    onExportSuccess: vi.fn(),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("ExportOptionsDialog", () => {
  beforeEach(() => {
    fetchExportOptionsApiMock.mockReset();
    runGatedExportApiMock.mockReset();
    downloadExportApiMock.mockReset();
    triggerBrowserDownloadMock.mockReset();
    getFilenameFromHeadersMock.mockReset();

    // Happy-path defaults
    fetchExportOptionsApiMock.mockResolvedValue({
      data: exportOptions,
      headers: new Headers(),
    });
    runGatedExportApiMock.mockResolvedValue({
      response: exportSuccess,
      sha256: exportSuccess.sha256,
    });
    getFilenameFromHeadersMock.mockReturnValue("job-JOB-001.zip");
  });

  afterEach(() => {
    cleanup();
  });

  // ── Closed ────────────────────────────────────────────────────────────────

  it("renders nothing when open=false", () => {
    render(<ExportOptionsDialog {...defaultProps({ open: false })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchExportOptionsApiMock).not.toHaveBeenCalled();
  });

  // ── Open ──────────────────────────────────────────────────────────────────

  it("renders dialog with title when open=true", () => {
    render(<ExportOptionsDialog {...defaultProps()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Export CNC Program")).toBeInTheDocument();
  });

  it("calls fetchExportOptionsApi once when dialog opens", async () => {
    render(<ExportOptionsDialog {...defaultProps()} />);
    await waitFor(() => {
      expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(1);
    });
  });

  it("does NOT call fetchExportOptionsApi when open=false", () => {
    render(<ExportOptionsDialog {...defaultProps({ open: false })} />);
    expect(fetchExportOptionsApiMock).not.toHaveBeenCalled();
  });

  // ── Gate-blocked: verifyResult=null ──────────────────────────────────────

  it("shows Export Locked banner when verifyResult=null", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: null })} />);
    await waitFor(() => {
      expect(screen.getByText("Export Locked")).toBeInTheDocument();
    });
  });

  it("export button is disabled when verifyResult=null", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: null })} />);
    // Let ExportConfigurator's useEffect run so config is set
    await waitFor(() => {
      expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(1);
    });
    const exportBtn = screen.getByRole("button", { name: /Export G-Code/i });
    expect(exportBtn).toBeDisabled();
  });

  // ── Gate-blocked: verdict=FAIL ────────────────────────────────────────────

  it("shows Export Locked banner when verdict=FAIL", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: failVerify })} />);
    await waitFor(() => {
      expect(screen.getByText("Export Locked")).toBeInTheDocument();
    });
  });

  it("export button is disabled when verdict=FAIL", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: failVerify })} />);
    await waitFor(() => {
      expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(1);
    });
    const exportBtn = screen.getByRole("button", { name: /Export G-Code/i });
    expect(exportBtn).toBeDisabled();
  });

  // ── Gate-open: verdict=PASS ───────────────────────────────────────────────

  it("export button is enabled when verdict=PASS", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: passVerify })} />);
    await waitFor(() => {
      const exportBtn = screen.getByRole("button", { name: /Export G-Code/i });
      expect(exportBtn).not.toBeDisabled();
    });
  });

  it("does NOT show Export Locked banner when verdict=PASS", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: passVerify })} />);
    await waitFor(() => {
      expect(fetchExportOptionsApiMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Export Locked")).toBeNull();
  });

  // ── Options fetch error ───────────────────────────────────────────────────

  it("surfaces error alert when fetchExportOptionsApi fails", async () => {
    fetchExportOptionsApiMock.mockRejectedValueOnce(new Error("network failure"));
    render(<ExportOptionsDialog {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/network failure/i)).toBeInTheDocument();
  });

  // ── Successful export ─────────────────────────────────────────────────────

  it("shows Export Complete after successful export", async () => {
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: passVerify })} />);

    // Wait until export button is enabled (ExportConfigurator has fired config)
    const exportBtn = await screen.findByRole("button", { name: /Export G-Code/i });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText("Export Complete")).toBeInTheDocument();
    });
    expect(runGatedExportApiMock).toHaveBeenCalledTimes(1);
  });

  it("fires onExportSuccess with the export result after success", async () => {
    const onExportSuccess = vi.fn();
    render(
      <ExportOptionsDialog
        {...defaultProps({ verifyResult: passVerify, onExportSuccess })}
      />
    );

    const exportBtn = await screen.findByRole("button", { name: /Export G-Code/i });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(onExportSuccess).toHaveBeenCalledTimes(1);
      expect(onExportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, exportId: "exp-001" })
      );
    });
  });

  // ── Export failure ────────────────────────────────────────────────────────

  it("shows Export Failed when runGatedExportApi rejects", async () => {
    runGatedExportApiMock.mockRejectedValueOnce(new Error("machine offline"));
    render(<ExportOptionsDialog {...defaultProps({ verifyResult: passVerify })} />);

    const exportBtn = await screen.findByRole("button", { name: /Export G-Code/i });
    await waitFor(() => expect(exportBtn).not.toBeDisabled());

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText("Export Failed")).toBeInTheDocument();
    });
  });

  // ── Close actions ─────────────────────────────────────────────────────────

  it("calls onClose when close button (✕) is clicked", () => {
    const onClose = vi.fn();
    render(<ExportOptionsDialog {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: /Close export dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<ExportOptionsDialog {...defaultProps({ onClose })} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked directly", () => {
    const onClose = vi.fn();
    render(<ExportOptionsDialog {...defaultProps({ onClose })} />);
    const backdrop = screen.getByRole("dialog");
    // Simulates a click that lands directly on the backdrop (not a child element)
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

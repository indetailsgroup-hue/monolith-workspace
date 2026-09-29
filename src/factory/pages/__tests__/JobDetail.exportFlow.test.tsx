/**
 * @vitest-environment jsdom
 *
 * E2E test: JobDetail export flow
 *
 * Verifies the full export workflow:
 *  1. Render JobDetail → navigate to Export tab
 *  2. XLSX download button triggers blob download
 *  3. Open Nesting Report → PDF export button triggers jsPDF pipeline
 *  4. DXF Batch button triggers ZIP download
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { JobDetailData } from "../../types/job";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const jobDetail: JobDetailData = {
  jobId: "JOB-E2E-EXPORT",
  projectName: "E2E Export Cabinet",
  customerName: "Test Customer",
  status: "VERIFIED",
  trust: { gate: "PASS", signature: "VALID", audit: "OK" },
  panelCount: 4,
  sheetCount: 2,
  machineSupport: ["KDT"],
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
  packetUrl: "/packets/JOB-E2E-EXPORT.zip",
  materials: [],
  estimatedRuntime: { KDT: 10, BIESSE: 0, HOMAG: 0 },
  toolCount: { KDT: 3, BIESSE: 0, HOMAG: 0 },
};

const mockCutList = [
  { partId: "SIDE_L", materialId: "PB_WHITE_18", cutW: 600, cutH: 800, qty: 2 },
  { partId: "SHELF_01", materialId: "MDF_OAK_18", cutW: 800, cutH: 400, qty: 4 },
];

const mockNestingSheets = [
  {
    index1: 1,
    label: "NEST_01",
    materialId: "PB_WHITE_18",
    sheetW: 1220,
    sheetH: 2440,
    sheetThickness: 18,
    placements: [
      { partId: "SIDE_L", x: 10, y: 10, rotation: 0, cutW: 600, cutH: 800 },
      { partId: "CURVE_A", x: 10, y: 820, rotation: 0, cutW: 500, cutH: 700, isCurved: true, kerfCount: 8 },
    ],
    utilization: 70,
  },
];

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: vi.fn().mockResolvedValue([]),
  fetchJobDetailApi: vi.fn().mockImplementation(async () => jobDetail),
  triggerLegacyExportApi: vi.fn(),
}));

vi.mock("../../api/exportApi", () => ({
  fetchExportOptionsApi: vi.fn().mockResolvedValue({
    data: {
      dialects: [{ id: "KDT", name: "KDT Nesting", profiles: [{ id: "kdt_mvp_v1", name: "KDT MVP v1", dialect: "KDT", enabled: true }] }],
      modes: [{ id: "PER_JOB", name: "Per Job", description: "One bundle per job" }],
      targets: [{ id: "BUNDLE", name: "Bundle", description: "ZIP", enabled: true }],
    },
    headers: new Headers(),
  }),
  runGatedExportApi: vi.fn(),
  downloadExportApi: vi.fn(),
  triggerBrowserDownload: vi.fn(),
  getFilenameFromHeaders: vi.fn().mockReturnValue("export.zip"),
}));

vi.mock("../../api/verifyApi", () => ({
  verifyJobApi: vi.fn(),
}));

// Mock buildCutListXlsx to return a fake ArrayBuffer
const mockBuildCutListXlsx = vi.fn().mockResolvedValue(new ArrayBuffer(128));
vi.mock("../../../core/export/monolith/builders/buildCutListXlsx", () => ({
  buildCutListXlsx: (...args: unknown[]) => mockBuildCutListXlsx(...args),
}));

// Mock exportNestingPdf (relative from JobDetail.tsx → ../components/nesting/exportNestingPdf)
const mockExportNestingPdf = vi.fn().mockResolvedValue(undefined);
vi.mock("../../components/nesting/exportNestingPdf", () => ({
  exportNestingPdf: (...args: unknown[]) => mockExportNestingPdf(...args),
}));

// Mock exportCurvedDxfBatch
const mockExportCurvedDxfBatch = vi.fn().mockResolvedValue(undefined);
vi.mock("../../components/nesting/exportCurvedDxfBatch", () => ({
  exportCurvedDxfBatch: (...args: unknown[]) => mockExportCurvedDxfBatch(...args),
}));

// Imports after mocks (hoisting)
import { JobDetail } from "../JobDetail";
import { useFactoryStore } from "../../state/factoryStore";

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("JobDetail — Export Flow E2E", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    mockBuildCutListXlsx.mockClear();
    mockExportNestingPdf.mockClear();
    mockExportCurvedDxfBatch.mockClear();

    // Stub URL.createObjectURL / revokeObjectURL
    createObjectURLSpy = vi.fn<(obj: Blob | MediaSource) => string>().mockReturnValue("blob:fake-url");
    revokeObjectURLSpy = vi.fn<(url: string) => void>();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    // Set up store with a verified packet containing cutList + nestingSheets
    useFactoryStore.setState({
      selectedJobId: "JOB-E2E-EXPORT",
      selectedJob: jobDetail,
      selectedJobLoading: false,
      verifyResult: { verdict: "PASS", code: "OK", summary: "All passed", log: "", timestamp: "", checks: [] } as any,
      verifying: false,
      exportOptions: null,
      exportOptionsLoading: false,
      exportOptionsError: null,
      gatedExportByJobId: {},
      verifiedPacketByJobId: {
        "JOB-E2E-EXPORT": {
          status: "VERIFIED", fileSizeBytes: 4096, verifiedAt: "2026-08-27T00:00:00Z",
          fileName: "packet.zip",
          verifyResult: { verdict: "PASS", errors: [], warnings: [] } as any,
          packet: {
            manifest: { jobId: "JOB-E2E-EXPORT", projectId: "proj-1", toolVersion: "13.3.0", exportedAt: "2026-08-27" },
            drillMap: null,
            connectors: [],
            cutList: mockCutList,
            gateResult: { verdict: "PASS", code: "STORAGE_HASH_MATCH", checks: [] },
            nestingSheets: mockNestingSheets,
          } as any,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Helper: render & navigate to Export tab ────────────────────────────────

  async function renderAndGoToExport(): Promise<void> {
    render(<JobDetail jobId="JOB-E2E-EXPORT" onBack={vi.fn()} />);
    await screen.findAllByText("JOB-E2E-EXPORT");
    // Click Export tab
    fireEvent.click(screen.getByRole("button", { name: /📤 Export/ }));
  }

  // ── 1. XLSX Download button triggers export ────────────────────────────────

  it("XLSX download button calls buildCutListXlsx and triggers blob download", async () => {
    await renderAndGoToExport();

    const xlsxBtn = await screen.findByTestId("xlsx-download-button");
    expect(xlsxBtn).toBeTruthy();
    expect(xlsxBtn.textContent).toContain("Download Cut List");

    fireEvent.click(xlsxBtn);

    await waitFor(() => {
      expect(mockBuildCutListXlsx).toHaveBeenCalledTimes(1);
    });

    // Verify blob was created and download triggered
    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── 2. Nesting Report toggle opens the panel ──────────────────────────────

  it("Nesting Report toggle shows the NestingSheetReport panel", async () => {
    await renderAndGoToExport();

    const toggleBtn = await screen.findByTestId("nesting-report-toggle");
    fireEvent.click(toggleBtn);

    // Report container should appear (contains SVG sheets)
    await waitFor(() => {
      expect(screen.getByTestId("sheet-svg-1")).toBeTruthy();
    });
  });

  // ── 3. PDF Export button triggers pipeline ─────────────────────────────────

  it("PDF Export button triggers exportNestingPdf", async () => {
    await renderAndGoToExport();

    // Open nesting report first
    fireEvent.click(screen.getByTestId("nesting-report-toggle"));
    await waitFor(() => expect(screen.getByTestId("sheet-svg-1")).toBeTruthy());

    const pdfBtn = screen.getByTestId("btn-pdf-nesting");
    expect(pdfBtn).toBeTruthy();

    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(mockExportNestingPdf).toHaveBeenCalledTimes(1);
    });

    // Verify correct args passed
    const [container, passedJobId] = mockExportNestingPdf.mock.calls[0];
    expect(container).toBeInstanceOf(HTMLElement);
    expect(passedJobId).toBe("JOB-E2E-EXPORT");
  });

  // ── 4. DXF Batch button triggers ZIP export ────────────────────────────────

  it("DXF Batch button triggers exportCurvedDxfBatch with nesting sheets", async () => {
    await renderAndGoToExport();

    // Open nesting report first
    fireEvent.click(screen.getByTestId("nesting-report-toggle"));
    await waitFor(() => expect(screen.getByTestId("sheet-svg-1")).toBeTruthy());

    const dxfBtn = screen.getByTestId("btn-dxf-batch");
    expect(dxfBtn).toBeTruthy();

    fireEvent.click(dxfBtn);

    await waitFor(() => {
      expect(mockExportCurvedDxfBatch).toHaveBeenCalledTimes(1);
    });

    // Verify sheets passed
    const [sheets, passedJobId] = mockExportCurvedDxfBatch.mock.calls[0];
    expect(sheets).toEqual(mockNestingSheets);
    expect(passedJobId).toBe("JOB-E2E-EXPORT");
  });

  // ── 5. Export buttons show loading states ──────────────────────────────────

  it("XLSX button shows loading text while generating", async () => {
    // Make buildCutListXlsx hang
    mockBuildCutListXlsx.mockReturnValue(new Promise(() => {}));

    await renderAndGoToExport();
    const xlsxBtn = screen.getByTestId("xlsx-download-button");
    fireEvent.click(xlsxBtn);

    await waitFor(() => {
      expect(xlsxBtn.textContent).toContain("Generating");
    });
  });

  // ── 6. Gate-blocked: buttons disabled when no cutList ──────────────────────

  it("XLSX button not rendered when packet has no cutList", async () => {
    useFactoryStore.setState({
      verifiedPacketByJobId: {
        "JOB-E2E-EXPORT": {
          status: "VERIFIED", fileSizeBytes: 4096, verifiedAt: "2026-08-27T00:00:00Z",
          fileName: "packet.zip",
          verifyResult: { verdict: "PASS", errors: [], warnings: [] } as any,
          packet: {
            manifest: { jobId: "JOB-E2E-EXPORT", projectId: "proj-1", toolVersion: "13.3.0", exportedAt: "2026-08-27" },
            drillMap: null,
            connectors: [],
            cutList: null as any,
            gateResult: { verdict: "PASS", code: "STORAGE_HASH_MATCH", checks: [] },
          } as any,
        },
      },
    });

    await renderAndGoToExport();
    expect(screen.queryByTestId("xlsx-download-button")).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 */

// S18 L2 Slice 4: PacketIngestPanel (Phase C, fully tested) was never
// mounted anywhere. The Packet tab of JobDetail must offer the dropzone so
// an operator can ingest + verify a packet ZIP without a server packet.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { JobDetailData } from "../../types/job";

const jobDetail: JobDetailData = {
  jobId: "JOB-0002",
  projectName: "Ingest Cabinet",
  customerName: "Test Customer",
  status: "SIGNED",
  trust: { gate: "PENDING", signature: "VALID", audit: "PENDING" },
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

vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: vi.fn().mockResolvedValue([]),
  fetchJobDetailApi: vi.fn().mockImplementation(async () => jobDetail),
  triggerLegacyExportApi: vi.fn(),
}));

import { JobDetail } from "../JobDetail";
import { useFactoryStore } from "../../state/factoryStore";

describe("JobDetail Packet tab — ingest dropzone (S18 L2 Slice 4)", () => {
  beforeEach(() => {
    // Packet fetch goes over raw fetch; keep it failing offline
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    useFactoryStore.setState({
      selectedJobId: null,
      selectedJob: null,
      selectedJobLoading: false,
      packetByJobId: {},
      verifiedPacketByJobId: {},
      verifyResult: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mounts the PacketIngestPanel dropzone inside the Packet tab", async () => {
    render(<JobDetail jobId="JOB-0002" onBack={() => {}} />);

    await screen.findAllByText("JOB-0002");

    fireEvent.click(screen.getByRole("button", { name: /📦 Packet/ }));

    expect(
      await screen.findByText("Drop Factory Packet here")
    ).toBeInTheDocument();
    expect(screen.getByText(/click to browse \(\.zip\)/)).toBeInTheDocument();
  });
});

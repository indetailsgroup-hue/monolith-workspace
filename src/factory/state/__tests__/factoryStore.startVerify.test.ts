// S18 L2: the factory VERIFY button must go through the auth-aware adapter
// (verifyJobApi, FS-B1-02) — never a raw fetch without Authorization headers.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyApiResponse } from "../../types/job";

const verifyJobApi = vi.fn();
vi.mock("../../api/verifyApi", () => ({
  verifyJobApi: (...args: unknown[]) => verifyJobApi(...args),
}));

const fetchJobsApi = vi.fn();
vi.mock("../../api/jobsApi", () => ({
  fetchJobsApi: (...args: unknown[]) => fetchJobsApi(...args),
  fetchJobDetailApi: vi.fn(),
  triggerLegacyExportApi: vi.fn(),
}));

import { useFactoryStore } from "../factoryStore";

const storageHashResponse: VerifyApiResponse = {
  verdict: "STORAGE_HASH_MATCH",
  code: "OK",
  summary:
    "ไบต์ตรงกับที่บันทึกไว้ (8092 bytes) — ตรวจ storage integrity เท่านั้น ไม่ใช่การ verify packet เต็มรูป",
  log: '{"ok":true}',
  timestamp: new Date().toISOString(),
  checks: [],
};

describe("factoryStore.startVerify — adapter wiring (S18 L2 Slice 1)", () => {
  beforeEach(() => {
    verifyJobApi.mockReset();
    fetchJobsApi.mockReset();
    fetchJobsApi.mockResolvedValue([]);
    useFactoryStore.setState({
      verifying: false,
      verifyResult: null,
      activityLog: [],
      jobs: [],
      jobsError: null,
    });
  });

  it("calls verifyJobApi (not raw fetch) and lands STORAGE_HASH_MATCH in state", async () => {
    // Any raw fetch here means the store bypassed the adapter (no auth headers)
    const rawFetch = vi.fn();
    vi.stubGlobal("fetch", rawFetch);

    verifyJobApi.mockResolvedValueOnce(storageHashResponse);

    const result = await useFactoryStore.getState().startVerify("JOB-0001");

    expect(verifyJobApi).toHaveBeenCalledTimes(1);
    expect(verifyJobApi).toHaveBeenCalledWith("JOB-0001");
    expect(rawFetch).not.toHaveBeenCalled();

    expect(result.verdict).toBe("STORAGE_HASH_MATCH");
    expect(useFactoryStore.getState().verifyResult?.verdict).toBe(
      "STORAGE_HASH_MATCH"
    );
    expect(useFactoryStore.getState().verifying).toBe(false);

    vi.unstubAllGlobals();
  });

  it("records VERIFY_PASSED activity for STORAGE_HASH_MATCH (storage scope in details)", async () => {
    verifyJobApi.mockResolvedValueOnce(storageHashResponse);

    await useFactoryStore.getState().startVerify("JOB-0001");

    const log = useFactoryStore.getState().activityLog;
    expect(log.some((e) => e.type === "VERIFY_PASSED")).toBe(true);
    expect(log.some((e) => e.type === "VERIFY_STARTED")).toBe(true);
  });

  it("normalizes adapter errors into verifyResult and rethrows", async () => {
    verifyJobApi.mockRejectedValueOnce(new Error("API 401"));

    await expect(
      useFactoryStore.getState().startVerify("JOB-0001")
    ).rejects.toThrow("API 401");

    const state = useFactoryStore.getState();
    expect(state.verifyResult).not.toBeNull();
    expect(state.verifyResult?.verdict).not.toBe("PASS");
    expect(state.verifying).toBe(false);
  });
});

// S18 L2 Slice 2: the audit timeline must never lie. When the endpoint is
// down the API rejects — it must NOT fabricate mock activity (fake VERIFY
// PASS entries poison the audit trail).

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("../client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { fetchJobActivityApi } from "../activityApi";

describe("fetchJobActivityApi — honest errors (S18 L2 Slice 2)", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("rejects when the endpoint is unreachable — no fabricated activity", async () => {
    apiFetch.mockRejectedValueOnce(new Error("API 500"));

    await expect(fetchJobActivityApi("JOB-0001")).rejects.toThrow("API 500");
  });

  it("rejects when the server answers ok:false — empty timeline is not the truth", async () => {
    apiFetch.mockResolvedValueOnce({
      data: { ok: false, code: "E_ACTIVITY_DB", message: "db unavailable" },
    });

    await expect(fetchJobActivityApi("JOB-0001")).rejects.toThrow(
      /db unavailable/
    );
  });

  it("passes real server items through untouched", async () => {
    const items = [
      {
        id: "act_1",
        type: "VERIFY_RUN",
        at: "2026-07-18T00:00:00.000Z",
        jobId: "JOB-0001",
        verify: { verdict: "FAIL", code: "E_GATE_DEPTH" },
      },
    ];
    apiFetch.mockResolvedValueOnce({
      data: { ok: true, items, fetchedAt: "2026-07-18T00:00:01.000Z" },
    });

    const response = await fetchJobActivityApi("JOB-0001");
    expect(response.items).toEqual(items);
  });
});

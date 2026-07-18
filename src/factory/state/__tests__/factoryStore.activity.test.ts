// S18 L2 Slice 2 (store integration): endpoint down → ERROR state in the
// activity cache (retryable), never fabricated "VERIFY PASS" items.
// Uses the REAL activityApi with only the transport (client) mocked, so a
// mock-data fallback inside activityApi would make these tests fail.

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("../../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { useFactoryStore } from "../factoryStore";

describe("factoryStore.fetchServerActivity — no fake audit (S18 L2 Slice 2)", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    useFactoryStore.setState({ serverActivityByJobId: {} });
  });

  it("sets ERROR state with empty items when the endpoint is down", async () => {
    apiFetch.mockRejectedValueOnce(new Error("API 503"));

    const items = await useFactoryStore
      .getState()
      .fetchServerActivity("JOB-0001");

    expect(items).toEqual([]);
    const entry = useFactoryStore
      .getState()
      .getServerActivityCacheEntry("JOB-0001");
    expect(entry.status).toBe("ERROR");
    expect(entry.error).toContain("503");
    expect(entry.items).toEqual([]);
  });

  it("can retry after an error and land real server items", async () => {
    apiFetch.mockRejectedValueOnce(new Error("API 503"));
    await useFactoryStore.getState().fetchServerActivity("JOB-0001");
    expect(
      useFactoryStore.getState().getServerActivityCacheEntry("JOB-0001").status
    ).toBe("ERROR");

    const items = [
      {
        id: "act_real",
        type: "VERIFY_RUN",
        at: "2026-07-18T00:00:00.000Z",
        jobId: "JOB-0001",
        verify: { verdict: "PASS", code: "OK" },
      },
    ];
    apiFetch.mockResolvedValueOnce({
      data: { ok: true, items, fetchedAt: "2026-07-18T00:00:01.000Z" },
    });

    const retried = await useFactoryStore
      .getState()
      .fetchServerActivity("JOB-0001");

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(retried).toEqual(items);
    const entry = useFactoryStore
      .getState()
      .getServerActivityCacheEntry("JOB-0001");
    expect(entry.status).toBe("DONE");
    expect(entry.items).toEqual(items);
  });
});

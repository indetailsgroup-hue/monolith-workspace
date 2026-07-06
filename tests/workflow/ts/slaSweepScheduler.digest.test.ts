/**
 * Unit test — Daily_Digest orchestration in sla-sweep-scheduler.
 * monolith-workflow-copilot. Spec task: 11.12 · Requirements: 6.4
 *
 * The "combine into ONE message per site" semantics live in SQL
 * (rpc_assemble_daily_digest / rpc_assemble_pending_digests — migrations
 * 0060/0061, incl. the no-orphan null-site sweep). This unit test covers the
 * scheduler-side orchestration contract that Req 6.4 depends on:
 *   * a digest round invokes assembleDigests exactly once and reports the count
 *   * a normal sweep round NEVER assembles digests (digest cadence is separate)
 *   * best-effort semantics: a missing dep or a throwing assemble returns 0
 *     without failing the sweep (digest_pending rows survive to the next round)
 */
import { describe, it, expect } from "vitest";
import {
  runScheduler,
  runDigest,
  handleSlaSweep,
  type SchedulerDeps,
  type SweepItem,
} from "../../../supabase/functions/sla-sweep-scheduler/index";

function makeDeps(overrides: Partial<SchedulerDeps> = {}) {
  const dispatched: SweepItem[] = [];
  let assembleCalls = 0;
  const deps: SchedulerDeps = {
    sweep: async () => [],
    dispatch: async (item) => {
      dispatched.push(item);
    },
    assembleDigests: async () => {
      assembleCalls += 1;
      return 3;
    },
    ...overrides,
  };
  return { deps, dispatched, counters: { get assembleCalls() { return assembleCalls; } } };
}

describe("runDigest — Daily_Digest best-effort contract (Req 6.4)", () => {
  it("returns the assembled digest count from the dep", async () => {
    const { deps } = makeDeps();
    await expect(runDigest(deps)).resolves.toBe(3);
  });

  it("returns 0 when the dep is absent (digest round not wired) without throwing", async () => {
    const { deps } = makeDeps({ assembleDigests: undefined });
    await expect(runDigest(deps)).resolves.toBe(0);
  });

  it("returns 0 when assemble throws — digest_pending rows survive to the next round", async () => {
    const { deps } = makeDeps({
      assembleDigests: async () => {
        throw new Error("db unavailable");
      },
    });
    await expect(runDigest(deps)).resolves.toBe(0);
  });
});

describe("handleSlaSweep — digest cadence is separate from the sweep cadence", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/sla-sweep", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("digest round (assemble_digest: true): assembles exactly once and reports the count", async () => {
    const { deps, counters } = makeDeps();
    const res = await handleSlaSweep(post({ assemble_digest: true }), deps);
    const summary = (await res.json()) as { digests?: number };
    expect(res.status).toBe(200);
    expect(counters.assembleCalls).toBe(1);
    expect(summary.digests).toBe(3);
  });

  it("normal sweep round: never assembles digests (no digests field)", async () => {
    const { deps, counters } = makeDeps();
    const res = await handleSlaSweep(post({}), deps);
    const summary = (await res.json()) as { digests?: number };
    expect(counters.assembleCalls).toBe(0);
    expect(summary.digests).toBeUndefined();
  });

  it("sweep failures do not block the digest round (best-effort per item)", async () => {
    const item: SweepItem = {
      approval_request_id: "ar-1",
      work_item_id: "wi-1",
      process_step: "Designer",
      site_code: "HQ",
      action: "reminder_50",
    };
    const { deps, counters } = makeDeps({
      sweep: async () => [item],
      dispatch: async () => {
        throw new Error("line down");
      },
    });
    const res = await handleSlaSweep(post({ assemble_digest: true }), deps);
    const summary = (await res.json()) as { failures: number; digests?: number };
    expect(summary.failures).toBe(1);
    expect(summary.digests).toBe(3); // digest ยังประกอบสำเร็จแม้ dispatch ล้ม
    expect(counters.assembleCalls).toBe(1);
  });
});

describe("runScheduler — per-item best effort (supporting Req 13)", () => {
  it("counts dispatched vs failures without failing the batch", async () => {
    const items: SweepItem[] = [
      { approval_request_id: "a", work_item_id: "w", process_step: "Designer", site_code: null, action: "reminder_50" },
      { approval_request_id: "b", work_item_id: "w", process_step: "Designer", site_code: null, action: "timeout" },
    ];
    const { deps } = makeDeps({
      sweep: async () => items,
      dispatch: async (i) => {
        if (i.action === "timeout") throw new Error("boom");
      },
    });
    await expect(runScheduler(deps)).resolves.toEqual({ swept: 2, dispatched: 1, failures: 1 });
  });
});

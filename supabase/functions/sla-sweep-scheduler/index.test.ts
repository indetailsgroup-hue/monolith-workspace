// Feature: monolith-workflow-copilot — transport tests for sla-sweep-scheduler (Req 13)
import { describe, it, expect } from "vitest";
import { runScheduler, runDigest, handleSlaSweep, buildDispatchParams, type SweepItem } from "./index";

const items: SweepItem[] = [
  { approval_request_id: "r1", work_item_id: "w1", process_step: "Designer", site_code: "S0", action: "reminder_50" },
  { approval_request_id: "r2", work_item_id: "w2", process_step: "Designer", site_code: "S0", action: "timeout" },
];

describe("sla-sweep-scheduler orchestration", () => {
  it("dispatches every swept item", async () => {
    const dispatched: string[] = [];
    const summary = await runScheduler({
      sweep: async () => items,
      dispatch: async (i) => { dispatched.push(i.action); },
    });
    expect(summary).toEqual({ swept: 2, dispatched: 2, failures: 0 });
    expect(dispatched).toEqual(["reminder_50", "timeout"]);
  });

  it("D1: runDigest กวาด digest_pending ทุก site (ไม่ orphan) → คืนจำนวน digest", async () => {
    let called = 0;
    const n = await runDigest({
      sweep: async () => [],
      dispatch: async () => {},
      assembleDigests: async () => { called += 1; return 2; },
    });
    expect(called).toBe(1);
    expect(n).toBe(2);
  });

  it("D1: handleSlaSweep includes digests only when assemble_digest=true", async () => {
    const deps = {
      sweep: async () => [] as SweepItem[],
      dispatch: async () => {},
      assembleDigests: async () => 3,
    };
    const noDigest = await (await handleSlaSweep(new Request("https://x", { method: "POST", body: JSON.stringify({}) }), deps)).json();
    expect(noDigest.digests).toBeUndefined();
    const withDigest = await (await handleSlaSweep(new Request("https://x", { method: "POST", body: JSON.stringify({ assemble_digest: true }) }), deps)).json();
    expect(withDigest.digests).toBe(3);
  });

  it("per-item dispatch failure does not abort the batch", async () => {
    const summary = await runScheduler({
      sweep: async () => items,
      dispatch: async (i) => { if (i.action === "timeout") throw new Error("dispatch boom"); },
    });
    expect(summary).toEqual({ swept: 2, dispatched: 1, failures: 1 });
  });

  it("empty sweep → zero summary", async () => {
    expect(await runScheduler({ sweep: async () => [], dispatch: async () => {} }))
      .toEqual({ swept: 0, dispatched: 0, failures: 0 });
  });

  it("405 on non-POST", async () => {
    const res = await handleSlaSweep(new Request("https://x", { method: "GET" }), {
      sweep: async () => [], dispatch: async () => {},
    });
    expect(res.status).toBe(405);
  });
});

describe("buildDispatchParams routing (Req 20.11)", () => {
  it("customer timeout → tpl_sla_timeout_pm + escalate_to project_manager", () => {
    const p = buildDispatchParams({
      approval_request_id: "r", work_item_id: "w", process_step: "Designer", site_code: "S0",
      action: "timeout", approver_kind: "customer", escalate_to: "project_manager",
    });
    expect(p.p_template_key).toBe("tpl_sla_timeout_pm");
    expect((p.p_slots as Record<string, unknown>).escalate_to).toBe("project_manager");
  });

  it("employee timeout → tpl_sla_timeout (workflow default)", () => {
    const p = buildDispatchParams({
      approval_request_id: "r", work_item_id: "w", process_step: "Designer", site_code: "S0",
      action: "timeout", approver_kind: "employee", escalate_to: "workflow_default",
    });
    expect(p.p_template_key).toBe("tpl_sla_timeout");
  });

  it("reminder → tpl_sla_reminder, personal_responsibility (Direct)", () => {
    const p = buildDispatchParams({
      approval_request_id: "r", work_item_id: "w", process_step: "Designer", site_code: "S0",
      action: "reminder_50",
    });
    expect(p.p_template_key).toBe("tpl_sla_reminder");
    expect(p.p_intent).toBe("personal_responsibility");
  });
});

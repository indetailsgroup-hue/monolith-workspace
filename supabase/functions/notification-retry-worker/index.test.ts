// Feature: monolith-workflow-copilot — transport tests for notification-retry-worker (Req 18)
// Updated 2026-07-06 for the Phase-13 close-out contract (0081): rows arrive with the
// recipient/text/token RESOLVED by the claim RPC; recordResult carries the row's
// retry_count; the summary reports unresolvable rows. Deeper scenarios live in
// tests/workflow/ts/notificationRetryWorker.integration.test.ts.
import { describe, it, expect } from "vitest";
import { runWorker, handleRetryWorker, type NotificationRow } from "./index";

function rows(n: number): NotificationRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    channel: "direct_push",
    template_key: "t",
    retry_count: 0,
    line_user_id: `U${i}`,
    rendered_text: `msg ${i}`,
    token_ref: "tok-ref",
  }));
}

describe("notification-retry-worker orchestration", () => {
  it("records success and failure per row", async () => {
    const recorded: Array<{ id: string; ok: boolean; err: string | null; retry: number }> = [];
    const summary = await runWorker({
      claim: async () => rows(3),
      send: async (r) => r.id !== "n1", // n1 fails
      recordResult: async (id, ok, err, retry) => { recorded.push({ id, ok, err, retry }); },
    });
    expect(summary).toEqual({ claimed: 3, sent: 2, failed: 1, unresolvable: 0 });
    expect(recorded.find((r) => r.id === "n1")).toEqual({ id: "n1", ok: false, err: "send_returned_false", retry: 0 });
  });

  it("send throwing is recorded as failure with error detail", async () => {
    let recordedErr: string | null = "";
    const summary = await runWorker({
      claim: async () => rows(1),
      send: async () => { throw new Error("LINE 500"); },
      recordResult: async (_id, _ok, err) => { recordedErr = err; },
    });
    expect(summary).toEqual({ claimed: 1, sent: 0, failed: 1, unresolvable: 0 });
    expect(recordedErr).toBe("LINE 500");
  });

  it("empty claim → zero summary", async () => {
    expect(await runWorker({ claim: async () => [], send: async () => true, recordResult: async () => {} }))
      .toEqual({ claimed: 0, sent: 0, failed: 0, unresolvable: 0 });
  });

  it("405 on non-POST", async () => {
    const res = await handleRetryWorker(new Request("https://x", { method: "GET" }), {
      claim: async () => [], send: async () => true, recordResult: async () => {},
    });
    expect(res.status).toBe(405);
  });
});

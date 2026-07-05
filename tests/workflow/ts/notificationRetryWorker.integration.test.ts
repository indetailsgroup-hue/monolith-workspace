/**
 * Integration test — notification-retry-worker claim → send → record wiring (mocked deps).
 * monolith-workflow-copilot Phase 13. Spec task: 17.4 (delivery + retry close-out).
 *
 * Requirements validated:
 *   18.1/18.2 — a failed send is recorded with the retry count of the row (the
 *     backoff schedule is exponential per attempt: base 1000ms · factor 2 ·
 *     cap 300000ms — asserted on the exported nextBackoffDelayMs mirror).
 *   18.3 — a send that reports failure is never counted as sent; every claimed
 *     row terminates in exactly one recordResult call.
 *   6.7 (free-text ban, DB side) — rows the claim RPC could not resolve
 *     (recipient/template null) are recorded as failures WITHOUT invoking the
 *     LINE send at all (no delivery may bypass the resolved-template path).
 *
 * This exercises the real runWorker orchestration against spy deps — no
 * network, no database (the resolution itself lives in
 * rpc_claim_pending_notifications, migration 0081).
 */

import { describe, it, expect } from "vitest";
import {
  runWorker,
  nextBackoffDelayMs,
  RETRY_MAX_DELAY_MS,
  type NotificationRow,
  type WorkerDeps,
} from "../../../supabase/functions/notification-retry-worker/index";

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: crypto.randomUUID(),
    channel: "direct_push",
    template_key: "wf_task_assigned",
    slots: {},
    retry_count: 0,
    line_user_id: "U0123456789abcdef",
    rendered_text: "งานใหม่: ติดตั้งครัว บ้าน A",
    token_ref: "line_channel_token_monolith",
    ...overrides,
  };
}

interface Recorded {
  id: string;
  success: boolean;
  errorDetail: string | null;
  retryCount: number;
}

function makeDeps(rows: NotificationRow[], sendOutcome: (r: NotificationRow) => boolean | Error) {
  const sends: NotificationRow[] = [];
  const recorded: Recorded[] = [];
  const deps: WorkerDeps = {
    claim: async () => rows,
    send: async (r) => {
      sends.push(r);
      const outcome = sendOutcome(r);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    recordResult: async (id, success, errorDetail, retryCount) => {
      recorded.push({ id, success, errorDetail, retryCount });
    },
  };
  return { deps, sends, recorded };
}

describe("notification-retry-worker — runWorker orchestration", () => {
  it("sends a resolvable row and records it as sent exactly once", async () => {
    const r = row({});
    const { deps, sends, recorded } = makeDeps([r], () => true);

    const summary = await runWorker(deps);

    expect(summary).toEqual({ claimed: 1, sent: 1, failed: 0, unresolvable: 0 });
    expect(sends).toHaveLength(1);
    expect(recorded).toEqual([
      { id: r.id, success: true, errorDetail: null, retryCount: 0 },
    ]);
  });

  it("records a failed send with the row's retry count and never marks it sent (Req 18.3)", async () => {
    const r = row({ retry_count: 3 });
    const { deps, recorded } = makeDeps([r], () => new Error("line_push_http_500"));

    const summary = await runWorker(deps);

    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(1);
    expect(recorded).toEqual([
      { id: r.id, success: false, errorDetail: "line_push_http_500", retryCount: 3 },
    ]);
  });

  it("does NOT invoke LINE send for rows the DB could not resolve (recipient/template)", async () => {
    const noRecipient = row({ line_user_id: null });
    const noTemplate = row({ rendered_text: null, retry_count: 2 });
    const { deps, sends, recorded } = makeDeps([noRecipient, noTemplate], () => true);

    const summary = await runWorker(deps);

    expect(sends).toHaveLength(0); // free-text/unresolved rows never reach the send path
    expect(summary).toEqual({ claimed: 2, sent: 0, failed: 2, unresolvable: 2 });
    expect(recorded).toEqual([
      { id: noRecipient.id, success: false, errorDetail: "recipient_unresolvable", retryCount: 0 },
      { id: noTemplate.id, success: false, errorDetail: "template_unresolvable", retryCount: 2 },
    ]);
  });

  it("every claimed row terminates in exactly one recordResult, even when a send throws mid-batch", async () => {
    const a = row({});
    const b = row({ retry_count: 1 });
    const c = row({});
    const { deps, recorded } = makeDeps([a, b, c], (r) =>
      r.id === b.id ? new Error("line_push_http_429") : true,
    );

    const summary = await runWorker(deps);

    expect(summary).toEqual({ claimed: 3, sent: 2, failed: 1, unresolvable: 0 });
    expect(recorded.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(recorded.filter((x) => !x.success)).toEqual([
      { id: b.id, success: false, errorDetail: "line_push_http_429", retryCount: 1 },
    ]);
  });
});

describe("notification-retry-worker — backoff mirror (Req 18.2)", () => {
  it("grows exponentially from 1s and caps at 5 minutes (mirror backoff.ts defaults)", () => {
    expect(nextBackoffDelayMs(0)).toBe(1000);
    expect(nextBackoffDelayMs(1)).toBe(2000);
    expect(nextBackoffDelayMs(2)).toBe(4000);
    expect(nextBackoffDelayMs(4)).toBe(16000);
    // beyond the cap
    expect(nextBackoffDelayMs(20)).toBe(RETRY_MAX_DELAY_MS);
    // negative attempts clamp to the base delay
    expect(nextBackoffDelayMs(-5)).toBe(1000);
  });
});

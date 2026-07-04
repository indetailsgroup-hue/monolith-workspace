// Feature: monolith-mcp-layer — transport tests for mcp-approval-callback (task 5.3)
import { describe, it, expect } from "vitest";
import { handleApprovalCallback, type CallbackDeps } from "./index";

function deps(over: Partial<CallbackDeps> = {}): CallbackDeps {
  return {
    findPendingId: async () => ({ data: "pend-1", error: null }),
    resolve: async () => ({ data: { status: "executed" }, error: null }),
    ...over,
  };
}
const post = (b: unknown) => new Request("https://x/mcp-approval-callback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("mcp-approval-callback", () => {
  it("405 non-POST; 400 invalid payload", async () => {
    expect((await handleApprovalCallback(new Request("https://x", { method: "GET" }), deps())).status).toBe(405);
    expect((await handleApprovalCallback(post({ decision: "approved" }), deps())).status).toBe(400);
    expect((await handleApprovalCallback(post({ approval_request_id: "a", decision: "maybe" }), deps())).status).toBe(400);
  });

  it("404 no-op when approval_request ไม่ได้มาจาก MCP (no pending)", async () => {
    const res = await handleApprovalCallback(post({ approval_request_id: "a", decision: "approved" }), deps({ findPendingId: async () => ({ data: null, error: null }) }));
    expect(res.status).toBe(404);
  });

  it("resolves matched pending and returns result", async () => {
    let resolvedWith: unknown = null;
    const res = await handleApprovalCallback(
      post({ approval_request_id: "ar-9", decision: "approved", webhook_event_id: "w1", expected_version: 2 }),
      deps({ resolve: async (a) => { resolvedWith = a; return { data: { status: "executed" }, error: null }; } }),
    );
    expect(res.status).toBe(200);
    expect(resolvedWith).toEqual({ pendingId: "pend-1", decision: "approved", webhookEventId: "w1", expectedVersion: 2 });
  });

  it("409 when already resolved/expired (check_violation)", async () => {
    const res = await handleApprovalCallback(post({ approval_request_id: "a", decision: "approved", webhook_event_id: "w" }), deps({ resolve: async () => ({ data: null, error: { code: "check_violation" } }) }));
    expect(res.status).toBe(409);
  });
});

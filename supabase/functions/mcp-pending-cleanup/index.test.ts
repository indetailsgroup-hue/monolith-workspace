// Feature: monolith-mcp-layer — transport tests for mcp-pending-cleanup (task 5.2)
import { describe, it, expect } from "vitest";
import { handlePendingCleanup } from "./index";

const post = () => new Request("https://x/mcp-pending-cleanup", { method: "POST" });

describe("mcp-pending-cleanup", () => {
  it("405 on non-POST", async () => {
    expect((await handlePendingCleanup(new Request("https://x", { method: "GET" }), async () => ({ data: 0, error: null }))).status).toBe(405);
  });
  it("200 + expired count from rpc_mcp_expire_pending", async () => {
    const res = await handlePendingCleanup(post(), async () => ({ data: 3, error: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 3 });
  });
  it("500 on rpc error", async () => {
    const res = await handlePendingCleanup(post(), async () => ({ data: null, error: { code: "XX" } }));
    expect(res.status).toBe(500);
  });
});

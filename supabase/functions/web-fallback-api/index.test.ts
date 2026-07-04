// Feature: monolith-workflow-copilot — transport tests for web-fallback-api (fix B: user-scoped JWT)
import { describe, it, expect } from "vitest";
import { handleWebFallback, parseWebDecision } from "./index";

function postReq(body: string, auth = "Bearer user-jwt"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth.length > 0) headers["authorization"] = auth;
  return new Request("https://x/web-fallback-api", { method: "POST", headers, body });
}

const validBody = JSON.stringify({
  approval_request_id: "r",
  webhook_event_id: "e",
  decision: "approved",
  expected_version: 0,
});

describe("web-fallback-api", () => {
  it("parses valid body; rejects malformed", () => {
    expect(parseWebDecision(validBody)).not.toBeNull();
    expect(parseWebDecision(JSON.stringify({ approval_request_id: "r" }))).toBeNull();
    expect(parseWebDecision("nope")).toBeNull();
  });

  it("401 when Authorization header missing (fix B: end-user JWT required)", async () => {
    const res = await handleWebFallback(postReq(validBody, ""), async () => ({ data: "approved", error: null }));
    expect(res.status).toBe(401);
  });

  it("forwards caller Authorization to the RPC client (user-scoped, not service-role)", async () => {
    let seenAuth = "";
    const res = await handleWebFallback(postReq(validBody, "Bearer abc.def"), async (_args, authHeader) => {
      seenAuth = authHeader;
      return { data: "approved", error: null };
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "approved" });
    expect(seenAuth).toBe("Bearer abc.def");
  });

  it("403 / 409 / 400 error mapping (+42501 insufficient privilege → 403)", async () => {
    const mk = (code: string) => handleWebFallback(postReq(validBody), async () => ({ data: null, error: { code } }));
    expect((await mk("28000")).status).toBe(403);
    expect((await mk("42501")).status).toBe(403);
    expect((await mk("40001")).status).toBe(409);
    expect((await mk("23999")).status).toBe(400);
  });

  it("403 when RPC returns 'unauthorized' outcome (#2 committed-audit reject)", async () => {
    const res = await handleWebFallback(postReq(validBody), async () => ({ data: "unauthorized", error: null }));
    expect(res.status).toBe(403);
  });

  it("405 on non-POST", async () => {
    expect((await handleWebFallback(new Request("https://x", { method: "GET" }))).status).toBe(405);
  });
});

// Feature: monolith-workflow-copilot — transport tests for approval-postback (hardened per scrutinize #1)
import { describe, it, expect } from "vitest";
import { handleApprovalPostback, deriveChannelIdentifier } from "./index";

function postReq(body: string, opts?: { sig?: string; path?: string }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.sig !== undefined) headers["x-line-signature"] = opts.sig;
  return new Request(`https://x/${opts?.path ?? "approval-postback/chanA"}`, { method: "POST", headers, body });
}

describe("approval-postback channel derivation", () => {
  it("derives channel from path segment", () => {
    const r = new Request("https://x/approval-postback/chanA", { method: "POST" });
    expect(deriveChannelIdentifier(r, "{}")).toBe("chanA");
  });
  it("derives channel from body.destination when no path/query", () => {
    const r = new Request("https://x/approval-postback", { method: "POST" });
    expect(deriveChannelIdentifier(r, JSON.stringify({ destination: "botX" }))).toBe("botX");
  });
  it("returns null when unresolved", () => {
    const r = new Request("https://x/approval-postback", { method: "POST" });
    expect(deriveChannelIdentifier(r, "{}")).toBeNull();
  });
});

describe("approval-postback transport (forwards to signature-verifying RPC)", () => {
  it("405 on non-POST", async () => {
    expect((await handleApprovalPostback(new Request("https://x", { method: "GET" }))).status).toBe(405);
  });

  it("400 when channel cannot be derived", async () => {
    const res = await handleApprovalPostback(
      new Request("https://x/approval-postback", { method: "POST", body: "{}" }),
      async () => ({ data: "approved", error: null }),
    );
    expect(res.status).toBe(400);
  });

  it("forwards raw body + signature (no client identity parsing) and 200 on success", async () => {
    let forwarded: { channel: string; sig: string } | null = null;
    const res = await handleApprovalPostback(
      postReq(JSON.stringify({ events: [{ source: { userId: "U1" }, postback: { data: "x=1" } }] }), { sig: "good-sig" }),
      async (args) => {
        forwarded = { channel: args.channel_identifier, sig: args.signature };
        return { data: "approved", error: null };
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "approved" });
    expect(forwarded).toEqual({ channel: "chanA", sig: "good-sig" });
  });

  it("401 on invalid signature / unknown channel (28000 / P0002)", async () => {
    const mk = (code: string) => handleApprovalPostback(postReq("{}", { sig: "bad" }), async () => ({ data: null, error: { code } }));
    expect((await mk("28000")).status).toBe(401);
    expect((await mk("P0002")).status).toBe(401);
  });

  it("403 when RPC returns 'unauthorized' (committed-audit reject, #2)", async () => {
    const res = await handleApprovalPostback(postReq("{}", { sig: "good" }), async () => ({ data: "unauthorized", error: null }));
    expect(res.status).toBe(403);
  });

  it("409 on version conflict (40001); 400 on malformed signed payload (22023)", async () => {
    expect((await handleApprovalPostback(postReq("{}", { sig: "g" }), async () => ({ data: null, error: { code: "40001" } }))).status).toBe(409);
    expect((await handleApprovalPostback(postReq("{}", { sig: "g" }), async () => ({ data: null, error: { code: "22023" } }))).status).toBe(400);
  });
});

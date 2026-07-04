// Feature: capture-spine — transport tests for capture-ingest (task 5.1)
import { describe, it, expect } from "vitest";
import { handleCaptureIngest, sha256Hex, type CaptureIngestDeps } from "./index";

const AUTH = "Bearer u";
function deps(over: Partial<CaptureIngestDeps> = {}): CaptureIngestDeps {
  return {
    hashContent: async () => "deadbeef",
    ingest: async () => ({ data: "art-1", error: null }),
    ...over,
  };
}
const post = (b: unknown, auth = AUTH) =>
  new Request("https://x/capture-ingest", { method: "POST", headers: auth ? { "content-type": "application/json", authorization: auth } : { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("capture-ingest", () => {
  it("401 missing auth; 405 non-POST; 400 invalid", async () => {
    expect((await handleCaptureIngest(post({ capture_type: "x", source: "line", raw_uri: "f" }, ""), deps())).status).toBe(401);
    expect((await handleCaptureIngest(new Request("https://x", { method: "GET", headers: { authorization: AUTH } }), deps())).status).toBe(405);
    expect((await handleCaptureIngest(post({ source: "line", raw_uri: "f" }), deps())).status).toBe(400);
    expect((await handleCaptureIngest(post({ capture_type: "x", source: "bad", raw_uri: "f" }), deps())).status).toBe(400);
  });

  it("builds scoped idempotency_key = capture_type:hash and returns artifact_id", async () => {
    let key: string | null = null;
    const res = await handleCaptureIngest(post({ capture_type: "expense_document", source: "line", raw_uri: "f", content: "abc" }),
      deps({ hashContent: async () => "h1", ingest: async (a) => { key = a.idempotencyKey; return { data: "art-9", error: null }; } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ artifact_id: "art-9" });
    expect(key).toBe("expense_document:h1");
  });

  it("404 unknown capture_type; 403 insufficient", async () => {
    expect((await handleCaptureIngest(post({ capture_type: "x", source: "line", raw_uri: "f" }), deps({ ingest: async () => ({ data: null, error: { code: "no_data_found" } }) }))).status).toBe(404);
    expect((await handleCaptureIngest(post({ capture_type: "x", source: "line", raw_uri: "f" }), deps({ ingest: async () => ({ data: null, error: { code: "insufficient_privilege" } }) }))).status).toBe(403);
  });

  it("sha256Hex deterministic + stable", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

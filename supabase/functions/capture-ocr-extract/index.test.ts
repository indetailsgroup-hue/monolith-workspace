// Feature: capture-spine — transport tests for capture-ocr-extract (task 5.2) + Property 8 on-prem smoke
import { describe, it, expect } from "vitest";
import { handleCaptureOcrExtract, isOnPremEndpoint, type CaptureOcrDeps, type ExtractionResult } from "./index";

const AUTH = "Bearer u";
const EXT: ExtractionResult = { fields: { total: 100 }, confidence: { total: 0.9 }, fraudSignals: [], aiProvider: "typhoon", modelVersion: "v1" };
function deps(over: Partial<CaptureOcrDeps> = {}): CaptureOcrDeps {
  return {
    ocrStage1: async () => "ocr text",
    extractStage2: async () => EXT,
    setExtraction: async () => ({ error: null }),
    logFailure: async () => {},
    ...over,
  };
}
const post = (b: unknown, auth = AUTH) =>
  new Request("https://x/capture-ocr-extract", { method: "POST", headers: auth ? { "content-type": "application/json", authorization: auth } : { "content-type": "application/json" }, body: JSON.stringify(b) });

describe("capture-ocr-extract — Property 8 (on-prem boundary)", () => {
  it("on-prem endpoints allowed; public/cross-border rejected", () => {
    expect(isOnPremEndpoint("http://10.0.0.5:8000")).toBe(true);
    expect(isOnPremEndpoint("http://192.168.1.10/ocr")).toBe(true);
    expect(isOnPremEndpoint("http://172.16.0.3")).toBe(true);
    expect(isOnPremEndpoint("http://localhost:8000")).toBe(true);
    expect(isOnPremEndpoint("https://typhoon.ocr.internal")).toBe(true);
    expect(isOnPremEndpoint("https://api.openai.com/v1")).toBe(false);
    expect(isOnPremEndpoint("https://8.8.8.8/ocr")).toBe(false);
    expect(isOnPremEndpoint("not-a-url")).toBe(false);
  });

  it("M1: hostname หลอกที่ขึ้นต้นด้วย private octet ต้องถูก reject (ไม่ใช่ IPv4 literal)", () => {
    expect(isOnPremEndpoint("http://10.evil.com")).toBe(false);
    expect(isOnPremEndpoint("https://192.168.attacker.com/ocr")).toBe(false);
    expect(isOnPremEndpoint("http://172.16.evil.net")).toBe(false);
    expect(isOnPremEndpoint("http://10.0.0.299")).toBe(false); // octet > 255
  });
});

describe("capture-ocr-extract transport", () => {
  it("401 missing auth; 405 non-POST; 400 invalid", async () => {
    expect((await handleCaptureOcrExtract(post({ artifact_id: "a", raw_uri: "f", capture_type: "x" }, ""), deps())).status).toBe(401);
    expect((await handleCaptureOcrExtract(new Request("https://x", { method: "GET", headers: { authorization: AUTH } }), deps())).status).toBe(405);
    expect((await handleCaptureOcrExtract(post({ artifact_id: "a" }), deps())).status).toBe(400);
  });

  it("Stage1→Stage2→setExtraction → 200", async () => {
    let setArgs: unknown = null;
    const res = await handleCaptureOcrExtract(post({ artifact_id: "a1", raw_uri: "f", capture_type: "expense_document" }),
      deps({ setExtraction: async (a) => { setArgs = a; return { error: null }; } }));
    expect(res.status).toBe(200);
    expect((setArgs as { id: string }).id).toBe("a1");
  });

  it("extraction throw → logFailure (best-effort) + 502 (fail-safe no-guess)", async () => {
    let logged = false;
    const res = await handleCaptureOcrExtract(post({ artifact_id: "a2", raw_uri: "f", capture_type: "x" }),
      deps({ extractStage2: async () => { throw new Error("ocr down"); }, logFailure: async () => { logged = true; } }));
    expect(res.status).toBe(502);
    expect(logged).toBe(true);
  });

  it("set_extraction authz error → 403", async () => {
    const res = await handleCaptureOcrExtract(post({ artifact_id: "a", raw_uri: "f", capture_type: "x" }),
      deps({ setExtraction: async () => ({ error: { code: "insufficient_privilege" } }) }));
    expect(res.status).toBe(403);
  });
});

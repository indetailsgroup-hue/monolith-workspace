// Feature: monolith-workflow-copilot — transport tests for field-capture Edge Function (§1, Req 7.7/7.9)
import { describe, it, expect } from "vitest";
import { handleFieldCapture, parseCaptureRequest } from "./index";

function postReq(body: string): Request {
  return new Request("https://x/field-capture", { method: "POST", body });
}

const validBody = JSON.stringify({
  work_item_id: "wi-1",
  process_step: "Sale",
  capture: { measurement: 123 },
});

describe("field-capture parsing", () => {
  it("parses valid capture request", () => {
    expect(parseCaptureRequest(validBody)).toEqual({
      work_item_id: "wi-1",
      process_step: "Sale",
      capture: { measurement: 123 },
    });
  });
  it("rejects malformed", () => {
    expect(parseCaptureRequest("{}")).toBeNull();
    expect(parseCaptureRequest(JSON.stringify({ work_item_id: "x", process_step: "Sale" }))).toBeNull();
  });
});

describe("field-capture orchestration (§1, Property 40 parity)", () => {
  it("200 on success", async () => {
    const res = await handleFieldCapture(postReq(validBody), {
      recordCapture: async () => "cap-1",
      logCaptureFailure: async () => {},
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ capture_item_id: "cap-1" });
  });

  it("business fail + log success → 422 failure_logged:true (audit ติด)", async () => {
    let logged = false;
    const res = await handleFieldCapture(postReq(validBody), {
      recordCapture: async () => {
        throw new Error("atomic rollback");
      },
      logCaptureFailure: async () => {
        logged = true;
      },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "capture_failed", failure_logged: true });
    expect(logged).toBe(true);
  });

  it("business fail + log fail → 422 failure_logged:false (best-effort lost)", async () => {
    const res = await handleFieldCapture(postReq(validBody), {
      recordCapture: async () => {
        throw new Error("atomic rollback");
      },
      logCaptureFailure: async () => {
        throw new Error("edge died");
      },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "capture_failed", failure_logged: false });
  });

  it("405 on non-POST", async () => {
    const res = await handleFieldCapture(new Request("https://x", { method: "GET" }));
    expect(res.status).toBe(405);
  });
});

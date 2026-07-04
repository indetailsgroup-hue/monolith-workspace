// Feature: monolith-workflow-copilot — transport tests for customer-design-view (Req 20.12)
import { describe, it, expect } from "vitest";
import { handleDesignView, parseRequest, type DesignViewDeps } from "./index";

function postReq(body: string): Request {
  return new Request("https://x/customer-design-view", { method: "POST", body });
}

const validBody = JSON.stringify({ id_token: "tok", work_item_id: "wi-1" });

const okDeps: DesignViewDeps = {
  verifyIdToken: async () => "U-line-1",
  resolveCustomer: async () => "cust-1",
  fetchView: async () => ({ work_item_id: "wi-1", artifacts: { layout: "x" } }),
};

describe("customer-design-view gatekeeper", () => {
  it("parses request; rejects malformed", () => {
    expect(parseRequest(validBody)).toEqual({ id_token: "tok", work_item_id: "wi-1" });
    expect(parseRequest(JSON.stringify({ id_token: "t" }))).toBeNull();
    expect(parseRequest("nope")).toBeNull();
  });

  it("200 + view on full success", async () => {
    const res = await handleDesignView(postReq(validBody), okDeps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ view: { work_item_id: "wi-1", artifacts: { layout: "x" } } });
  });

  it("401 when LIFF idToken invalid", async () => {
    const res = await handleDesignView(postReq(validBody), { ...okDeps, verifyIdToken: async () => null });
    expect(res.status).toBe(401);
  });

  it("403 when no customer identity bound", async () => {
    const res = await handleDesignView(postReq(validBody), { ...okDeps, resolveCustomer: async () => null });
    expect(res.status).toBe(403);
  });

  it("404 when view null (other project / not found — no existence leak)", async () => {
    const res = await handleDesignView(postReq(validBody), { ...okDeps, fetchView: async () => null });
    expect(res.status).toBe(404);
  });

  it("405 on non-POST", async () => {
    expect((await handleDesignView(new Request("https://x", { method: "GET" }), okDeps)).status).toBe(405);
  });

  it("does not call fetchView before identity resolves (gatekeeper order)", async () => {
    let fetched = false;
    await handleDesignView(postReq(validBody), {
      verifyIdToken: async () => null,
      resolveCustomer: async () => "cust-1",
      fetchView: async () => { fetched = true; return {}; },
    });
    expect(fetched).toBe(false);
  });
});

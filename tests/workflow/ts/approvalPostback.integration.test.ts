/**
 * Unit/integration test — approval-postback: LINE Flex button (Encrypted_Postback) consume path.
 * monolith-workflow-copilot. Spec task: 8.10 · Requirements: 4.1, 4.2, 4.5
 *
 * Scope note: the Flex card itself is a governance-approved template stored in
 * line_oa_message_templates (DB content, no renderer code to unit test) — the code
 * unit for the Encrypted_Postback button is the CONSUME path: the webhook handler
 * that receives the button press, derives the channel, forwards the raw signed
 * payload to rpc_record_customer_approval_from_webhook (HMAC verification lives in
 * the RPC), and maps every RPC error class to the right HTTP status without ever
 * interpreting the payload itself.
 */
import { describe, it, expect } from "vitest";
import {
  deriveChannelIdentifier,
  handleApprovalPostback,
  type RecordFromWebhookFn,
  type WebhookArgs,
} from "../../../supabase/functions/approval-postback/index";

const BODY = JSON.stringify({ destination: "U_channel_dest", events: [] });

function post(url: string, body: string, signature = "sig-abc"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "x-line-signature": signature },
    body,
  });
}

function recordSpy(result: { data: string | null; error: { code?: string } | null }) {
  const calls: WebhookArgs[] = [];
  const record: RecordFromWebhookFn = async (args) => {
    calls.push(args);
    return result;
  };
  return { record, calls };
}

describe("deriveChannelIdentifier — channel from route / query / destination", () => {
  it("prefers the path segment after /approval-postback/", () => {
    const req = post("http://x/functions/v1/approval-postback/CH123", BODY);
    expect(deriveChannelIdentifier(req, BODY)).toBe("CH123");
  });
  it("falls back to ?channel= then the LINE destination field", () => {
    expect(
      deriveChannelIdentifier(post("http://x/approval-postback?channel=CHQ", BODY), BODY),
    ).toBe("CHQ");
    expect(deriveChannelIdentifier(post("http://x/approval-postback", BODY), BODY)).toBe(
      "U_channel_dest",
    );
  });
});

describe("handleApprovalPostback — Encrypted_Postback consume contract (Req 4.1/4.2/4.5)", () => {
  const url = "http://x/functions/v1/approval-postback/CH123";

  it("forwards the RAW signed payload + signature + channel to the RPC and returns the outcome", async () => {
    const { record, calls } = recordSpy({ data: "approved", error: null });
    const res = await handleApprovalPostback(post(url, BODY, "sig-xyz"), record);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ outcome: "approved" });
    // ตัว handler ห้ามตีความ payload เอง — ส่ง raw body + signature ตรงไป RPC (HMAC verify ใน DB)
    expect(calls).toEqual([
      { channel_identifier: "CH123", raw_body: BODY, signature: "sig-xyz" },
    ]);
  });

  it("maps signature/channel verification failure to 401 (button press with bad HMAC never records)", async () => {
    const { record } = recordSpy({ data: null, error: { code: "28000" } });
    const res = await handleApprovalPostback(post(url, BODY), record);
    expect(res.status).toBe(401);
  });

  it("maps malformed postback payload to 400", async () => {
    const { record } = recordSpy({ data: null, error: { code: "22023" } });
    const res = await handleApprovalPostback(post(url, BODY), record);
    expect(res.status).toBe(400);
  });

  it("maps optimistic-lock conflict to 409 (stale card version)", async () => {
    const { record } = recordSpy({ data: null, error: { code: "40001" } });
    const res = await handleApprovalPostback(post(url, BODY), record);
    expect(res.status).toBe(409);
  });

  it("maps committed-audit unauthorized to 403 and replay to 200 'replayed' (idempotent button)", async () => {
    const unauthorized = recordSpy({ data: "unauthorized", error: null });
    expect((await handleApprovalPostback(post(url, BODY), unauthorized.record)).status).toBe(403);

    const replayed = recordSpy({ data: "replayed", error: null });
    const res = await handleApprovalPostback(post(url, BODY), replayed.record);
    await expect(res.json()).resolves.toEqual({ outcome: "replayed" });
  });

  it("rejects when no channel can be derived (400) without calling the RPC", async () => {
    const bodyNoDest = JSON.stringify({ events: [] });
    const { record, calls } = recordSpy({ data: "approved", error: null });
    const res = await handleApprovalPostback(
      post("http://x/functions/v1/approval-postback", bodyNoDest),
      record,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

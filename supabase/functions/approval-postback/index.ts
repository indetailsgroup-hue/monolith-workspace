// Edge Function: approval-postback
// Feature: monolith-workflow-copilot (Phase 1) — hardened per scrutinize #1
// Spec task: 17.1 — รับ LINE postback ของ Customer_Approver แล้วส่งให้ RPC ที่ verify signature
//
// Trust boundary (Req 20.3, 20.4): ฟังก์ชันนี้ **ไม่ parse/เชื่อ** identity หรือ params จาก body.
//   มันส่ง (channel_identifier, raw_body, x-line-signature) เข้า
//   rpc_record_customer_approval_from_webhook ซึ่ง:
//     * verify HMAC ลายเซ็นด้วย Vault secret (line_oa_verify_signature)
//     * derive line_user_id จาก events[].source.userId ของ body ที่ verify แล้ว
//     * parse approval params จาก signed postback.data
//   → ปิดช่อง impersonation ที่เคยรับ line_user_id จาก client.
//
// พนักงานอนุมัติผ่าน web-fallback-api (JWT session + has_any_app_role) ไม่ผ่านช่องนี้.

export interface RpcError {
  code?: string;
  message?: string;
}

export interface WebhookArgs {
  channel_identifier: string;
  raw_body: string;
  signature: string;
}

export type RecordFromWebhookFn = (
  args: WebhookArgs,
) => Promise<{ data: string | null; error: RpcError | null }>;

/** derive channel จาก path/query/destination (ไม่แตะ/แก้ raw body) — แบบเดียวกับ line-webhook */
export function deriveChannelIdentifier(req: Request, rawBody: string): string | null {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  const idx = segments.lastIndexOf("approval-postback");
  if (idx >= 0 && idx + 1 < segments.length && segments[idx + 1].length > 0) {
    return decodeURIComponent(segments[idx + 1]);
  }
  const q = url.searchParams.get("channel") ?? url.searchParams.get("channel_identifier");
  if (q !== null && q.length > 0) return q;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed !== null && typeof parsed === "object" && "destination" in parsed) {
      const d = (parsed as { destination?: unknown }).destination;
      if (typeof d === "string" && d.length > 0) return d;
    }
  } catch {
    // ignore — channel must come from route/query then
  }
  return null;
}

export async function handleApprovalPostback(
  req: Request,
  record: RecordFromWebhookFn = defaultRecord,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const signature = req.headers.get("x-line-signature") ?? "";
  const rawBody = await req.text();
  const channel = deriveChannelIdentifier(req, rawBody);
  if (channel === null) return json(400, { error: "unresolved_channel_identifier" });

  const { data, error } = await record({ channel_identifier: channel, raw_body: rawBody, signature });

  if (error !== null) {
    // invalid signature / unknown channel → 401 (verification gate inside RPC)
    if (error.code === "28000" || error.code === "P0002") return json(401, { error: "signature_invalid" });
    // malformed / incomplete signed payload
    if (error.code === "22P02" || error.code === "22023") return json(400, { error: "malformed_postback" });
    // optimistic lock conflict
    if (error.code === "40001") return json(409, { error: "version_conflict" });
    return json(400, { error: "decision_error" });
  }
  if (data === null) return json(502, { error: "no_result" });
  if (data === "unauthorized") return json(403, { error: "not_authorized" }); // #2: committed-audit reject
  return json(200, { outcome: data }); // 'approved' | 'rejected' | 'pending' | 'replayed'
}

// ---------------------------------------------------------------------------
// Default forwarder (Supabase service-role client)
// ---------------------------------------------------------------------------

interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
let cachedClient: RpcClient | null = null;

async function getServiceClient(): Promise<RpcClient> {
  if (cachedClient !== null) return cachedClient;
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const specifier = "https://esm.sh/@supabase/supabase-js@2";
  const mod = await import(specifier);
  cachedClient = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    supabaseUrl,
    serviceKey,
    { auth: { persistSession: false } },
  );
  return cachedClient;
}

const defaultRecord: RecordFromWebhookFn = async (args) => {
  const client = await getServiceClient();
  const { data, error } = await client.rpc("rpc_record_customer_approval_from_webhook", {
    p_channel_identifier: args.channel_identifier,
    p_raw_body: args.raw_body,
    p_signature: args.signature,
  });
  return { data: typeof data === "string" ? data : null, error: (error as RpcError | null) ?? null };
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getEnv(key: string): string {
  const value = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

if (typeof Deno !== "undefined" && import.meta.main) {
  Deno.serve(handleApprovalPostback);
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

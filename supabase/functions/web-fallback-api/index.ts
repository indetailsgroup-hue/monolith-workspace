// Edge Function: web-fallback-api
// Feature: monolith-workflow-copilot (Phase 1)
// Spec task: 17.2 — endpoint สำรอง บันทึก Approval_Decision ผ่าน rpc_record_approval_decision
//
// เส้นทางเดียวกับ LINE postback (Req 18.4, 18.5): authz/idempotency/quorum เหมือนกันทุกประการ
// เพราะใช้ RPC ตัวเดียวกัน — ต่างแค่ channel='web'. ไม่มี business logic ที่นี่.
// (TO authenticated: Supabase Auth ของ caller จะถูก resolve เป็น actor ภายใน RPC ผ่าน resolve_actor.)

export type Decision = "approved" | "rejected";

export interface WebDecisionBody {
  approval_request_id: string;
  webhook_event_id: string;
  decision: Decision;
  expected_version: number;
}

export interface RpcError {
  code?: string;
  message?: string;
}

export type RecordDecisionFn = (
  args: WebDecisionBody,
  authHeader: string,
) => Promise<{ data: string | null; error: RpcError | null }>;

export function parseWebDecision(rawBody: string): WebDecisionBody | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const reqId = o["approval_request_id"];
    const eventId = o["webhook_event_id"];
    const decision = o["decision"];
    const version = o["expected_version"];
    if (typeof reqId !== "string" || reqId.length === 0) return null;
    if (typeof eventId !== "string" || eventId.length === 0) return null;
    if (decision !== "approved" && decision !== "rejected") return null;
    if (typeof version !== "number" || !Number.isInteger(version)) return null;
    return { approval_request_id: reqId, webhook_event_id: eventId, decision, expected_version: version };
  } catch {
    return null;
  }
}

export async function handleWebFallback(
  req: Request,
  record: RecordDecisionFn = defaultRecord,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // authenticated endpoint: ต้องมี end-user JWT เพื่อให้ has_any_app_role/resolve_actor ใน RPC
  // สะท้อนผู้ใช้จริง (Req 4.3) — ไม่ใช้ service-role identity (fix B)
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.length === 0) return json(401, { error: "missing_authorization" });

  const body = await req.text();
  const parsed = parseWebDecision(body);
  if (parsed === null) return json(400, { error: "malformed_body" });

  const { data, error } = await record(parsed, authHeader);
  if (error !== null) {
    if (error.code === "28000" || error.code === "42501") return json(403, { error: "not_authorized" });
    if (error.code === "40001") return json(409, { error: "version_conflict" });
    return json(400, { error: "decision_error" });
  }
  if (data === null) return json(502, { error: "no_result" });
  if (data === "unauthorized") return json(403, { error: "not_authorized" }); // #2 committed-audit reject
  return json(200, { outcome: data });
}

// ---------------------------------------------------------------------------
// Default forwarder — USER-SCOPED client (forward end-user JWT) — channel = 'web'
// ใช้ anon key + Authorization ของ caller เพื่อให้ auth.jwt() ใน RPC = end-user จริง
// (RPC ถูก grant ให้ authenticated + authz เองด้วย has_any_app_role) — fix B
// ---------------------------------------------------------------------------

interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

async function getUserScopedClient(authHeader: string): Promise<RpcClient> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const mod = await import("npm:@supabase/supabase-js@2");
  return (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    supabaseUrl,
    anonKey,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

const defaultRecord: RecordDecisionFn = async (args, authHeader) => {
  const client = await getUserScopedClient(authHeader);
  const { data, error } = await client.rpc("rpc_record_approval_decision", {
    p_approval_request_id: args.approval_request_id,
    p_webhook_event_id: args.webhook_event_id,
    p_decision: args.decision,
    p_channel: "web",
    p_expected_version: args.expected_version,
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

if (typeof Deno !== "undefined") {
  Deno.serve((req) => handleWebFallback(req));
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

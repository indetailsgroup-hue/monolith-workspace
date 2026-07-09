// Edge Function: mcp-approval-callback
// Feature: monolith-mcp-layer (Phase 2) — task 5.3 (Req 5.2, 5.3, 8.1)
// เมื่อ workflow บันทึก Approval_Decision ของ approval_request ที่ผูก Pending_Invocation (Approval_Tool) →
//   หา pending_id แล้วเรียก rpc_mcp_resolve_pending เพื่อ execute/reject + คืนผล async ให้ client.
// Thin transport; lookup + resolve อยู่ใน RPC/DB.

export interface RpcError { code?: string; message?: string }

export interface CallbackBody {
  approval_request_id: string;
  decision: "approved" | "rejected";
  webhook_event_id?: string;
  expected_version?: number;
}

export interface CallbackDeps {
  findPendingId: (approvalRequestId: string) => Promise<{ data: string | null; error: RpcError | null }>;
  resolve: (args: { pendingId: string; decision: string; webhookEventId?: string; expectedVersion?: number }) => Promise<{ data: unknown; error: RpcError | null }>;
}

function statusForError(error: RpcError): number {
  switch (error.code) {
    case "insufficient_privilege": return 403;
    case "no_data_found": return 404;
    case "check_violation": return 409; // already resolved / expired
    default: return 400;
  }
}

export async function handleApprovalCallback(req: Request, deps: CallbackDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: CallbackBody;
  try { body = (await req.json()) as CallbackBody; } catch { return json(400, { error: "invalid_json" }); }
  if (typeof body?.approval_request_id !== "string" || (body.decision !== "approved" && body.decision !== "rejected")) {
    return json(400, { error: "invalid_payload" });
  }

  const found = await deps.findPendingId(body.approval_request_id);
  if (found.error !== null) return json(statusForError(found.error), { error: "lookup_failed" });
  if (found.data === null) return json(404, { error: "no_pending_for_approval" }); // ไม่ใช่ MCP-originated → no-op

  const { data, error } = await deps.resolve({
    pendingId: found.data, decision: body.decision,
    webhookEventId: body.webhook_event_id, expectedVersion: body.expected_version,
  });
  if (error !== null) return json(statusForError(error), { error: "resolve_failed", code: error.code });
  return json(200, { result: data });
}

interface RpcClient { rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
let cachedClient: RpcClient | null = null;
async function getServiceClient(): Promise<RpcClient> {
  if (cachedClient !== null) return cachedClient;
  const mod = await import("npm:@supabase/supabase-js@2");
  cachedClient = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } },
  );
  return cachedClient;
}
export function defaultDeps(): CallbackDeps {
  return {
    findPendingId: async (arId) => {
      const c = await getServiceClient();
      const { data, error } = await c.rpc("rpc_mcp_pending_for_approval", { p_approval_request_id: arId });
      return { data: typeof data === "string" ? data : null, error: (error as RpcError | null) ?? null };
    },
    resolve: async (a) => {
      const c = await getServiceClient();
      const { data, error } = await c.rpc("rpc_mcp_resolve_pending", {
        p_pending_id: a.pendingId, p_decision: a.decision,
        p_webhook_event_id: a.webhookEventId ?? null, p_expected_version: a.expectedVersion ?? null,
      });
      return { data, error: (error as RpcError | null) ?? null };
    },
  };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function getEnv(key: string): string {
  const v = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (v === undefined || v.length === 0) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}
if (typeof Deno !== "undefined") { const d = defaultDeps(); Deno.serve((req) => handleApprovalCallback(req, d)); }
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } } & Record<string, unknown>;

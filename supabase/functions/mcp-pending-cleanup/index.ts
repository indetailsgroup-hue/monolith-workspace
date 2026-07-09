// Edge Function: mcp-pending-cleanup
// Feature: monolith-mcp-layer (Phase 2) — task 5.2 (Req 16.4)
// cron ≤ 5 นาที → เรียก rpc_mcp_expire_pending() กวาด Pending_Invocation ที่พ้น Invocation_Expiry → expired.
// Thin transport; logic อยู่ใน RPC.

export interface RpcError { code?: string; message?: string }
export type ExpireFn = () => Promise<{ data: number | null; error: RpcError | null }>;

export async function handlePendingCleanup(
  req: Request,
  expire: ExpireFn = defaultExpire,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const { data, error } = await expire();
  if (error !== null) return json(500, { error: "cleanup_failed" });
  return json(200, { expired: data ?? 0 });
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
const defaultExpire: ExpireFn = async () => {
  const c = await getServiceClient();
  const { data, error } = await c.rpc("rpc_mcp_expire_pending", {});
  return { data: typeof data === "number" ? data : null, error: (error as RpcError | null) ?? null };
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function getEnv(key: string): string {
  const v = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (v === undefined || v.length === 0) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}
if (typeof Deno !== "undefined") Deno.serve((req) => handlePendingCleanup(req));
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } } & Record<string, unknown>;

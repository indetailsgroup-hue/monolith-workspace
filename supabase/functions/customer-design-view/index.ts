// Edge Function: customer-design-view (LIFF gatekeeper)
// Feature: monolith-workflow-copilot (Phase 1)
// Spec task: 21.5 — Req 20.12 customer-facing design-presentation view
//
// Gatekeeper (NOT a DB VIEW + RLS — ลูกค้าไม่เป็น DB principal):
//   1. verify LINE identity (LIFF idToken) → line_user_id  (ไม่เชื่อ client id)
//   2. resolve canonical customer_id ผ่าน line_oa_resolve_customer_identity
//   3. ดึง view ผ่าน rpc_customer_design_view(work_item_id, customer_id) — server-side allowlist
//      (board/3D/layout/drawing + คำขออนุมัติ) ของ work_item ที่ primary_customer_id ตรงเท่านั้น
//   ซ่อน cost/BOM/PFMEA/RACI/production internals/โครงการอื่น (บังคับใน RPC).
//
// การ filter ทั้งหมดอยู่ฝั่ง server (RPC) — ฟังก์ชันนี้เป็น transport + identity binding เท่านั้น.

export interface DesignViewRequest {
  id_token: string;
  work_item_id: string;
}

export type VerifyIdTokenFn = (idToken: string) => Promise<string | null>; // → line_user_id | null
export type ResolveCustomerFn = (lineUserId: string) => Promise<string | null>; // → customer_id | null
export type FetchViewFn = (workItemId: string, customerId: string) => Promise<unknown | null>;

export interface DesignViewDeps {
  verifyIdToken: VerifyIdTokenFn;
  resolveCustomer: ResolveCustomerFn;
  fetchView: FetchViewFn;
}

export function parseRequest(rawBody: string): DesignViewRequest | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const token = o["id_token"];
    const wi = o["work_item_id"];
    if (typeof token !== "string" || token.length === 0) return null;
    if (typeof wi !== "string" || wi.length === 0) return null;
    return { id_token: token, work_item_id: wi };
  } catch {
    return null;
  }
}

export async function handleDesignView(
  req: Request,
  deps: DesignViewDeps = defaultDeps,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const parsed = parseRequest(await req.text());
  if (parsed === null) return json(400, { error: "malformed_request" });

  const lineUserId = await deps.verifyIdToken(parsed.id_token);
  if (lineUserId === null) return json(401, { error: "invalid_id_token" });

  const customerId = await deps.resolveCustomer(lineUserId);
  if (customerId === null) return json(403, { error: "no_customer_identity" });

  const view = await deps.fetchView(parsed.work_item_id, customerId);
  // null = ไม่ใช่โครงการของลูกค้าคนนี้ / ไม่มี → 404 (ไม่เปิดเผยการมีอยู่ของโครงการอื่น)
  if (view === null || view === undefined) return json(404, { error: "not_found" });

  return json(200, { view: view as Record<string, unknown> });
}

// ---------------------------------------------------------------------------
// Default deps (LINE LIFF verify + Supabase service-role client)
// ---------------------------------------------------------------------------

interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
let cachedClient: RpcClient | null = null;

async function getServiceClient(): Promise<RpcClient> {
  if (cachedClient !== null) return cachedClient;
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const mod = await import("npm:@supabase/supabase-js@2");
  cachedClient = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    supabaseUrl,
    serviceKey,
    { auth: { persistSession: false } },
  );
  return cachedClient;
}

const defaultDeps: DesignViewDeps = {
  // verify LIFF idToken กับ LINE platform (https://api.line.me/oauth2/v2.1/verify)
  verifyIdToken: async (idToken) => {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: getEnv("LINE_LIFF_CHANNEL_ID") }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string };
    return typeof data.sub === "string" && data.sub.length > 0 ? data.sub : null;
  },
  resolveCustomer: async (lineUserId) => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("line_oa_resolve_customer_identity", {
      p_line_user_id: lineUserId,
      p_vertical_context: "line_oa",
    });
    if (error !== null) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (row !== null && typeof row === "object" && "customer_id" in (row as Record<string, unknown>)) {
      const cid = (row as Record<string, unknown>)["customer_id"];
      return typeof cid === "string" ? cid : null;
    }
    return null;
  },
  fetchView: async (workItemId, customerId) => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("rpc_customer_design_view", {
      p_work_item_id: workItemId,
      p_customer_id: customerId,
    });
    if (error !== null) return null;
    return data ?? null;
  },
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
  Deno.serve((req) => handleDesignView(req));
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

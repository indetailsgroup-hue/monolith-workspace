// Edge Function: mcp-server
// Feature: monolith-mcp-layer (Phase 2) — task 5.1 (hardened per scrutinize Wave 4: I1 auth-binding, I2 redaction)
// Spec: Req 1.2, 2.1-2.6, 3, 4, 9, 13, 19
//
// Thin transport (Deno). business logic อยู่ใน SECURITY DEFINER RPC (authz/autonomy/idempotency/audit) — reuse-not-fork.
// I1 (Req 2.2/2.3/2.5): require Authorization (end-user JWT) → 401 ถ้าไม่มี; forward JWT เข้า user-scoped client
//   เพื่อให้ resolve_actor()/RLS สะท้อน Principal จริง (mirror web-fallback "fix B") — ไม่ใช้ service-role identity.
// pipeline (invoke): rate-limit → lookup tool_class → route (Read→invoke_read / Write+Approval→create_pending) → redact → map.
// I2 (Req 9.1/9.4): redact/minimize ที่ boundary ก่อนคืน output; redact ไม่สำเร็จ (ไม่ใช่ object) → block fail-safe.
// Untrusted_Content (Req 19.1/19.2): input ส่งเป็น data param ของ RPC เท่านั้น — ไม่ตีความเป็นคำสั่ง; authz re-derive ใน RPC.

export interface RpcError { code?: string; message?: string }
export type ToolClass = "Read_Tool" | "Write_Tool" | "Approval_Tool";

export interface RedactionPolicy {
  piiFields: string[];
  allowedFields?: string[];
  mask?: string;
}

export interface McpServerDeps {
  listTools: (authHeader: string) => Promise<{ data: Array<{ tool_name: string; tool_class: ToolClass; requires_approval: boolean }> | null; error: RpcError | null }>;
  getTool: (name: string, authHeader: string) => Promise<{ tool_class: ToolClass } | null>;
  checkRateLimit: (input: InvokeBody, authHeader: string) => Promise<{ ok: boolean; reason?: string; error: RpcError | null }>;
  invokeRead: (input: InvokeBody, authHeader: string) => Promise<{ data: unknown; error: RpcError | null }>;
  createPending: (input: InvokeBody, authHeader: string) => Promise<{ data: unknown; error: RpcError | null }>;
  /** Redaction_Policy ที่ boundary (config; Req 9.5) — default ไม่มี PII field */
  redactionPolicy?: RedactionPolicy;
}

export interface InvokeBody {
  tool: string;
  input?: Record<string, unknown>;
  idempotency_key?: string;
  model_provenance?: Record<string, unknown>;
  est_cost?: number;
  site_code?: string | null;
}

export const SERVER_IDENTITY = { name: "monolith-mcp-server", version: "1.0.0", spec: "mcp-2025-11" };

function statusForError(error: RpcError): number {
  switch (error.code) {
    case "28000": return 401;
    case "insufficient_privilege": return 403;
    case "no_data_found": return 404;
    case "unique_violation": return 409;
    case "check_violation": return 400;
    case "serialization_failure": return 409;
    default: return 400;
  }
}

/** I2 — redaction + data-minimization ที่ boundary (Req 9). result ไม่ใช่ object → block (fail-safe). */
export function redactBoundary(
  result: unknown,
  policy: RedactionPolicy,
): { ok: true; output: Record<string, unknown> } | { ok: false } {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return { ok: false };
  const src = result as Record<string, unknown>;
  const minimized: Record<string, unknown> =
    policy.allowedFields === undefined
      ? { ...src }
      : Object.fromEntries(Object.entries(src).filter(([k]) => policy.allowedFields!.includes(k)));
  for (const f of policy.piiFields) if (f in minimized) minimized[f] = policy.mask ?? "[REDACTED]";
  return { ok: true, output: minimized };
}

export async function handleMcpServer(req: Request, deps: McpServerDeps): Promise<Response> {
  // I1 (Req 2.3): ต้องมี end-user JWT — ไม่มี → 401 (ไม่ forward, ไม่ใช้ service-role identity)
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.length === 0) return json(401, { error: "missing_authorization" });

  const policy = deps.redactionPolicy ?? { piiFields: [] };

  // discovery — Req 1.2 (catalog ผ่าน RLS ของ user-scoped client)
  if (req.method === "GET") {
    const { data, error } = await deps.listTools(authHeader);
    if (error !== null) return json(statusForError(error), { error: "discovery_failed" });
    return json(200, { server: SERVER_IDENTITY, tools: data ?? [] });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: InvokeBody;
  try {
    body = (await req.json()) as InvokeBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (typeof body?.tool !== "string" || body.tool.length === 0) return json(400, { error: "missing_tool" });

  // 1) rate-limit (Req 15) — เกิน → 429 (no side effects)
  const rl = await deps.checkRateLimit(body, authHeader);
  if (rl.error !== null) return json(statusForError(rl.error), { error: "rate_limit_check_failed" });
  if (!rl.ok) return json(429, { error: "rate_limited", reason: rl.reason });

  // 2) lookup tool_class → 404 ถ้าไม่รู้จัก (Req 1.5)
  const tool = await deps.getTool(body.tool, authHeader);
  if (tool === null) return json(404, { error: "unknown_tool" });

  // 3) route ตาม Tool_Class (Read auto / Write+Approval → human gate)
  const { data, error } =
    tool.tool_class === "Read_Tool"
      ? await deps.invokeRead(body, authHeader)
      : await deps.createPending(body, authHeader);

  if (error !== null) return json(statusForError(error), { error: "tool_error", code: error.code });

  // 4) I2 — redact ที่ boundary ก่อนคืน; redact ไม่สำเร็จ → block (Req 9.4 fail-safe)
  const red = redactBoundary(data, policy);
  if (!red.ok) return json(500, { error: "redaction_failed" });
  return json(200, { result: red.output });
}

// ---------------------------------------------------------------------------
// Default forwarders — USER-SCOPED client (forward end-user JWT) — mirror web-fallback "fix B"
// ---------------------------------------------------------------------------
interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  from(t: string): { select: (c: string) => Promise<{ data: unknown; error: unknown }> };
}
async function getUserScopedClient(authHeader: string): Promise<RpcClient> {
  const mod = await import("https://esm.sh/@supabase/supabase-js@2");
  return (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

export function defaultDeps(): McpServerDeps {
  return {
    listTools: async (auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.from("mcp_tool_registry").select("tool_name, tool_class, requires_approval");
      return {
        data: (data as Array<{ tool_name: string; tool_class: ToolClass; requires_approval: boolean }> | null) ?? null,
        error: (error as RpcError | null) ?? null,
      };
    },
    getTool: async (name, auth) => {
      const c = await getUserScopedClient(auth);
      const { data } = await c.rpc("rpc_mcp_tool_class", { p_tool_name: name });
      return typeof data === "string" ? { tool_class: data as ToolClass } : null;
    },
    checkRateLimit: async (b, auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.rpc("rpc_mcp_check_rate_limit", {
        p_scopes: [], p_window_start: new Date().toISOString(), p_est_cost: b.est_cost ?? 0, p_tool_name: b.tool,
      });
      const d = data as { ok?: boolean; reason?: string } | null;
      return { ok: d?.ok ?? false, reason: d?.reason, error: (error as RpcError | null) ?? null };
    },
    invokeRead: async (b, auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.rpc("rpc_mcp_invoke_read", {
        p_tool_name: b.tool, p_input: b.input ?? {}, p_site_code: b.site_code ?? null, p_model_provenance: b.model_provenance ?? null,
      });
      return { data, error: (error as RpcError | null) ?? null };
    },
    createPending: async (b, auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.rpc("rpc_mcp_create_pending", {
        p_tool_name: b.tool, p_input: b.input ?? {}, p_idempotency_key: b.idempotency_key ?? null,
        p_site_code: b.site_code ?? null, p_model_provenance: b.model_provenance ?? null,
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

if (typeof Deno !== "undefined" && import.meta.main) {
  const deps = defaultDeps();
  Deno.serve((req) => handleMcpServer(req, deps));
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

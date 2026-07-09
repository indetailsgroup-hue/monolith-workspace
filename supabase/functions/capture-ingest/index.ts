// Edge Function: capture-ingest
// Feature: capture-spine (Phase 2) — task 5.1 (Req 1.1, 1.2, 2.1)
// LINE/Gmail webhook → require end-user JWT → hash content → rpc_capture_ingest (proposed); raw_uri on-prem.
// idempotency_key = `${capture_type}:${contentHash}` (J2 scope) → ส่งซ้ำ → คืน artifact เดิม.
// Thin transport; user-scoped client (resolve_actor = ผู้ส่งจริง) — mirror web-fallback "fix B".

export interface RpcError { code?: string; message?: string }
export type CaptureSource = "line" | "email" | "app";

export interface IngestBody {
  capture_type: string;
  source: CaptureSource;
  raw_uri: string;
  content?: string;       // เนื้อหาสำหรับ hash (ถ้าไม่ส่ง ใช้ raw_uri)
  site_code?: string | null;
}

export interface CaptureIngestDeps {
  hashContent: (s: string) => Promise<string>;
  ingest: (
    args: { captureType: string; source: CaptureSource; rawUri: string; idempotencyKey: string; siteCode: string | null },
    authHeader: string,
  ) => Promise<{ data: string | null; error: RpcError | null }>;
}

function statusForError(error: RpcError): number {
  switch (error.code) {
    case "28000": return 401;
    case "insufficient_privilege": return 403;
    case "no_data_found": return 404;   // unknown/inactive capture_type
    case "check_violation": return 400;
    default: return 400;
  }
}

export async function handleCaptureIngest(req: Request, deps: CaptureIngestDeps): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.length === 0) return json(401, { error: "missing_authorization" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: IngestBody;
  try { body = (await req.json()) as IngestBody; } catch { return json(400, { error: "invalid_json" }); }
  if (typeof body?.capture_type !== "string" || body.capture_type.length === 0) return json(400, { error: "missing_capture_type" });
  if (body.source !== "line" && body.source !== "email" && body.source !== "app") return json(400, { error: "invalid_source" });
  if (typeof body?.raw_uri !== "string" || body.raw_uri.length === 0) return json(400, { error: "missing_raw_uri" });

  const contentHash = await deps.hashContent(body.content ?? body.raw_uri);
  const idempotencyKey = `${body.capture_type}:${contentHash}`;

  const { data, error } = await deps.ingest(
    { captureType: body.capture_type, source: body.source, rawUri: body.raw_uri, idempotencyKey, siteCode: body.site_code ?? null },
    authHeader,
  );
  if (error !== null) return json(statusForError(error), { error: "ingest_error", code: error.code });
  return json(200, { artifact_id: data });
}

// ---------------------------------------------------------------------------
// Default forwarders — user-scoped client (end-user JWT) + sha256 (Web Crypto, Deno/Node)
// ---------------------------------------------------------------------------
interface RpcClient { rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
async function getUserScopedClient(authHeader: string): Promise<RpcClient> {
  const mod = await import("npm:@supabase/supabase-js@2");
  return (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function defaultDeps(): CaptureIngestDeps {
  return {
    hashContent: sha256Hex,
    ingest: async (a, auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.rpc("rpc_capture_ingest", {
        p_capture_type: a.captureType, p_source: a.source, p_raw_uri: a.rawUri,
        p_idempotency_key: a.idempotencyKey, p_site_code: a.siteCode,
      });
      return { data: typeof data === "string" ? data : null, error: (error as RpcError | null) ?? null };
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
if (typeof Deno !== "undefined") { const d = defaultDeps(); Deno.serve((req) => handleCaptureIngest(req, d)); }
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } } & Record<string, unknown>;
declare const crypto: { subtle: { digest: (alg: string, data: Uint8Array) => Promise<ArrayBuffer> } };

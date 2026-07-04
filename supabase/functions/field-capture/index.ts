// Edge Function: field-capture
// Feature: monolith-workflow-copilot (Phase 1)
// Spec task: 17.5 — orchestrate capture + failure-audit (§1)
//
// เรียก rpc_record_capture (atomic business tx). ถ้า throw → catch แล้วเรียก
// rpc_log_capture_failure ในการเรียกครั้งใหม่ (transaction แยก) เพื่อให้ failure-audit
// ติดแม้ business tx roll back ทั้งก้อน (Property 40). best-effort: ถ้า log เองก็ล้มเหลว
// (Edge ตาย) → audit อาจหาย (ยอมรับสำหรับ capture failure). **ไม่ใช้ dblink/pg_background.**
//
// ตรรกะ orchestration ตรงกับ src/workflow/field/capture-orchestrate.ts (verified, Property 40).

export interface CaptureRequest {
  work_item_id: string;
  process_step: string;
  capture: Record<string, unknown>;
}

export interface RpcError {
  code?: string;
  message?: string;
}

/** เรียก rpc_record_capture — คืน capture_item id; throw เมื่อ business fail. */
export type RecordCaptureFn = (args: CaptureRequest) => Promise<string>;
/** เรียก rpc_log_capture_failure (tx แยก) — best-effort. */
export type LogCaptureFailureFn = (
  args: CaptureRequest & { failure_reason: string },
) => Promise<void>;

export interface OrchestrationDeps {
  recordCapture: RecordCaptureFn;
  logCaptureFailure: LogCaptureFailureFn;
}

/**
 * Public entrypoint. parse → orchestrate → map status.
 *   success → 200 { capture_item_id }
 *   business fail + failure-audit logged → 422 { failure_logged: true }
 *   business fail + log also failed → 422 { failure_logged: false } (best-effort lost)
 */
export async function handleFieldCapture(
  req: Request,
  deps: OrchestrationDeps = defaultDeps,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const body = await req.text();
  const parsed = parseCaptureRequest(body);
  if (parsed === null) return json(400, { error: "malformed_capture" });

  let captureId: string;
  try {
    captureId = await deps.recordCapture(parsed);
  } catch (businessErr) {
    const reason = errMessage(businessErr);
    // caller-driven separate transaction (ไม่ใช่ dblink/pg_background)
    try {
      await deps.logCaptureFailure({ ...parsed, failure_reason: reason });
      return json(422, { error: "capture_failed", failure_logged: true });
    } catch {
      return json(422, { error: "capture_failed", failure_logged: false }); // best-effort
    }
  }
  return json(200, { capture_item_id: captureId });
}

export function parseCaptureRequest(rawBody: string): CaptureRequest | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const wi = o["work_item_id"];
    const step = o["process_step"];
    const cap = o["capture"];
    if (typeof wi !== "string" || wi.length === 0) return null;
    if (typeof step !== "string" || step.length === 0) return null;
    if (cap === null || typeof cap !== "object") return null;
    return { work_item_id: wi, process_step: step, capture: cap as Record<string, unknown> };
  } catch {
    return null;
  }
}

function errMessage(e: unknown): string {
  if (e !== null && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o["message"] === "string") return o["message"] as string;
  }
  return String(e);
}

// ---------------------------------------------------------------------------
// Default deps (Supabase service-role client)
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

const defaultDeps: OrchestrationDeps = {
  recordCapture: async (args) => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("rpc_record_capture", {
      p_work_item_id: args.work_item_id,
      p_process_step: args.process_step,
      p_capture: args.capture,
    });
    if (error !== null) {
      const e = error as RpcError;
      throw new Error(e.message ?? "rpc_record_capture failed");
    }
    return typeof data === "string" ? data : String(data);
  },
  logCaptureFailure: async (args) => {
    const client = await getServiceClient();
    const { error } = await client.rpc("rpc_log_capture_failure", {
      p_work_item_id: args.work_item_id,
      p_process_step: args.process_step,
      p_failure_reason: args.failure_reason,
      p_actor_hint: null,
    });
    if (error !== null) {
      const e = error as RpcError;
      throw new Error(e.message ?? "rpc_log_capture_failure failed");
    }
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  Deno.serve(handleFieldCapture);
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

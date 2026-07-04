// Edge Function: notification-retry-worker
// Feature: monolith-workflow-copilot (Phase 1)
// Spec task: 17.4 — claim pending notifications, ส่งผ่าน LINE, แล้ว record result (retry/backoff)
//
// Thin worker (Req 18.1, 18.2, 18.3): claim ทำใน rpc_claim_pending_notifications (lease กัน
// double-claim), record ทำใน rpc_record_notification_result (retry/backoff + Delivery_Failure ถาวร).
// การส่งจริงผ่าน LINE reuse line-outbound-sender (inject เป็น send). ไม่มี business logic ที่นี่.

export interface NotificationRow {
  id: string;
  target: Record<string, unknown>;
  channel: string;
  template_key: string;
  slots?: Record<string, unknown>;
  retry_count: number;
}

export type ClaimFn = (limit: number) => Promise<NotificationRow[]>;
export type SendFn = (row: NotificationRow) => Promise<boolean>; // true = sent ok
export type RecordResultFn = (id: string, success: boolean, errorDetail: string | null) => Promise<void>;

export interface WorkerDeps {
  claim: ClaimFn;
  send: SendFn;
  recordResult: RecordResultFn;
}

export interface WorkerSummary {
  claimed: number;
  sent: number;
  failed: number;
}

/** orchestrate: claim → ส่งแต่ละแถว → record ผล. แถวที่ throw นับ failed (record fail). */
export async function runWorker(deps: WorkerDeps, limit = 20): Promise<WorkerSummary> {
  const rows = await deps.claim(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    let ok = false;
    let errorDetail: string | null = null;
    try {
      ok = await deps.send(row);
      if (!ok) errorDetail = "send_returned_false";
    } catch (e) {
      ok = false;
      errorDetail = e instanceof Error ? e.message : String(e);
    }
    await deps.recordResult(row.id, ok, errorDetail);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { claimed: rows.length, sent, failed };
}

export async function handleRetryWorker(
  req: Request,
  deps: WorkerDeps = defaultDeps,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const summary = await runWorker(deps);
  return json(200, summary as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Default deps (Supabase service-role client + LINE outbound)
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

const MAX_ATTEMPTS = 5;

const defaultDeps: WorkerDeps = {
  claim: async (limit) => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("rpc_claim_pending_notifications", {
      p_limit: limit,
      p_lease_seconds: 60,
    });
    if (error !== null) throw new Error("rpc_claim_pending_notifications failed");
    return Array.isArray(data) ? (data as NotificationRow[]) : [];
  },
  // ส่งจริงผ่าน LINE: invoke line-outbound-sender (reuse). คืน true เมื่อ HTTP 2xx.
  send: async (row) => {
    const url = `${getEnv("SUPABASE_URL")}/functions/v1/line-outbound-sender`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ target: row.target, template_key: row.template_key, slots: row.slots ?? {} }),
    });
    return res.ok;
  },
  recordResult: async (id, success, errorDetail) => {
    const client = await getServiceClient();
    const nextAttempt = success
      ? null
      : new Date(Date.now() + 1000 * Math.pow(2, 1)).toISOString();
    const { error } = await client.rpc("rpc_record_notification_result", {
      p_notification_id: id,
      p_success: success,
      p_error_detail: errorDetail,
      p_max_attempts: MAX_ATTEMPTS,
      p_next_attempt_at: nextAttempt,
    });
    if (error !== null) throw new Error("rpc_record_notification_result failed");
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

if (typeof Deno !== "undefined" && import.meta.main) {
  Deno.serve(handleRetryWorker);
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

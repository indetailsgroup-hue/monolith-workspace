// Edge Function: notification-retry-worker
// Feature: monolith-workflow-copilot (Phase 13)
// Spec task: 17.4 — claim pending notifications, ส่งผ่าน LINE จริง, record result (retry/backoff)
//
// Thin worker (Req 18.1, 18.2, 18.3, 6.7):
//   * claim + resolution ทำใน rpc_claim_pending_notifications (0081): lease กัน double-claim,
//     resolve ผู้รับจาก identity_binding, render ข้อความจาก template ที่ approve แล้ว (free-text
//     ban อยู่ที่ DB), คืน Vault token *ref* (ไม่ใช่ token)
//   * ส่งจริง: LINE Messaging API push ตรงถึง line_user_id ของพนักงาน — ไม่ผ่าน
//     line_oa_outbound_messages เพราะตารางนั้นผูก conversation ของลูกค้า (Req 4) ส่วน
//     notification ภายในผูก identity_binding (Req 1)
//   * record ทำใน rpc_record_notification_result (0019): retry/backoff + Delivery_Failure ถาวร
//   * backoff mirror src/workflow/notification/backoff.ts + DEFAULT_WORKFLOW_CONFIG.retry:
//     base 1000ms · factor 2 · cap 300000ms · maxAttempts 5
//   * token ไม่ปรากฏใน log/error ทุกกรณี — error string มีเฉพาะ status code
//
// Scheduling: เรียกเป็นรอบ (pg_cron → http หรือ scheduled invocation) — การลงทะเบียน cron
// เป็นเรื่อง ops (pattern เดียวกับ 00000000000061)

export interface NotificationRow {
  id: string;
  channel: string;
  category?: string;
  template_key: string;
  slots?: Record<string, unknown>;
  retry_count: number;
  site_code?: string | null;
  /** ผู้รับที่ resolve แล้วจาก identity_binding — null = recipient_unresolvable */
  line_user_id: string | null;
  /** ข้อความที่ render จาก template ที่ approve แล้ว — null = template_unresolvable */
  rendered_text: string | null;
  /** Vault reference ของ channel access token (ไม่ใช่ตัว token) */
  token_ref: string | null;
}

export type ClaimFn = (limit: number) => Promise<NotificationRow[]>;
export type SendFn = (row: NotificationRow) => Promise<boolean>; // true = LINE ตอบ 2xx
export type RecordResultFn = (
  id: string,
  success: boolean,
  errorDetail: string | null,
  retryCount: number,
) => Promise<void>;

export interface WorkerDeps {
  claim: ClaimFn;
  send: SendFn;
  recordResult: RecordResultFn;
}

export interface WorkerSummary {
  claimed: number;
  sent: number;
  failed: number;
  /** แถวที่ resolve ไม่ได้ (ผู้รับ/template) — record fail โดยไม่เรียก send */
  unresolvable: number;
}

// ---------------------------------------------------------------------------
// Backoff (mirror src/workflow/notification/backoff.ts — Req 18.2)
// ---------------------------------------------------------------------------
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_BACKOFF_FACTOR = 2;
export const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
export const RETRY_MAX_ATTEMPTS = 5;

/** หน่วงครั้งถัดไปตามจำนวนครั้งที่ล้มเหลวไปแล้ว: base * factor^attempt, เพดาน maxDelay. */
export function nextBackoffDelayMs(attempt: number): number {
  const raw = RETRY_BASE_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, Math.max(0, attempt));
  return Math.min(raw, RETRY_MAX_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Orchestration: claim → validate → send → record (แถวละหนึ่งผลลัพธ์เสมอ)
// ---------------------------------------------------------------------------
export async function runWorker(deps: WorkerDeps, limit = 20): Promise<WorkerSummary> {
  const rows = await deps.claim(limit);
  let sent = 0;
  let failed = 0;
  let unresolvable = 0;
  for (const row of rows) {
    // Poison rows: resolve ไม่ได้ → record fail ทันที (ไม่เรียก send) — retry ตาม backoff
    // เผื่อ binding/template ถูกเพิ่มภายหลัง; ครบ maxAttempts → failed ถาวร + audit (0019)
    if (row.line_user_id === null || row.line_user_id === "") {
      await deps.recordResult(row.id, false, "recipient_unresolvable", row.retry_count);
      unresolvable += 1;
      failed += 1;
      continue;
    }
    if (row.rendered_text === null || row.rendered_text === "") {
      await deps.recordResult(row.id, false, "template_unresolvable", row.retry_count);
      unresolvable += 1;
      failed += 1;
      continue;
    }
    let ok = false;
    let errorDetail: string | null = null;
    try {
      ok = await deps.send(row);
      if (!ok) errorDetail = "send_returned_false";
    } catch (e) {
      ok = false;
      errorDetail = e instanceof Error ? e.message : String(e);
    }
    await deps.recordResult(row.id, ok, errorDetail, row.retry_count);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { claimed: rows.length, sent, failed, unresolvable };
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
// Default deps (Supabase service-role client + LINE Messaging API push)
// ---------------------------------------------------------------------------

interface VaultQuery {
  select(cols: string): {
    eq(col: string, val: string): {
      limit(n: number): { maybeSingle(): Promise<{ data: { decrypted_secret?: unknown } | null }> };
    };
  };
}
interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  schema(name: string): { from(table: string): VaultQuery };
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

/**
 * Vault ref → token (pattern เดียวกับ line-outbound-sender: ลองตาม name ก่อน แล้วตาม id).
 * cache ต่อ invocation — token ไม่หลุดออกนอกเส้นทางส่ง
 */
const tokenCache = new Map<string, string | null>();
async function resolveAccessToken(ref: string): Promise<string | null> {
  const cached = tokenCache.get(ref);
  if (cached !== undefined) return cached;
  const client = await getServiceClient();
  let token: string | null = null;
  for (const col of ["name", "id"] as const) {
    const { data } = await client
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq(col, ref)
      .limit(1)
      .maybeSingle();
    const secret = data?.decrypted_secret;
    if (typeof secret === "string" && secret.length > 0) {
      token = secret;
      break;
    }
  }
  tokenCache.set(ref, token);
  return token;
}

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
  // ส่งจริง: LINE Messaging API push ถึงพนักงาน (identity_binding.line_user_id).
  // ห้ามใส่ token/response body ลง error string — คืนเฉพาะ status code.
  send: async (row) => {
    if (row.token_ref === null || row.token_ref === "") {
      throw new Error("channel_token_ref_missing");
    }
    const token = await resolveAccessToken(row.token_ref);
    if (token === null) {
      throw new Error("channel_token_unresolvable");
    }
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: row.line_user_id,
        messages: [{ type: "text", text: row.rendered_text }],
      }),
    });
    if (!res.ok) {
      // อ่าน body ทิ้งเพื่อคืน connection — ไม่เอาเนื้อหาไปไว้ใน error (กัน echo token/PII)
      await res.text().catch(() => "");
      throw new Error(`line_push_http_${res.status}`);
    }
    return true;
  },
  recordResult: async (id, success, errorDetail, retryCount) => {
    const client = await getServiceClient();
    // Req 18.2 — exponential backoff ตามจำนวนครั้งที่ล้มเหลวไปแล้วจริง (mirror backoff.ts)
    const nextAttempt = success
      ? null
      : new Date(Date.now() + nextBackoffDelayMs(retryCount)).toISOString();
    const { error } = await client.rpc("rpc_record_notification_result", {
      p_notification_id: id,
      p_success: success,
      p_error_detail: errorDetail,
      p_max_attempts: RETRY_MAX_ATTEMPTS,
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

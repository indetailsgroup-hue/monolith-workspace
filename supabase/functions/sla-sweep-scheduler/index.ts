// Edge Function: sla-sweep-scheduler
// Feature: monolith-workflow-copilot (Phase 1)
// Spec task: 17.3 — cron: เรียก rpc_sla_sweep → dispatch reminder/timeout notifications
//
// Thin cron orchestration (Req 13.2, 13.3, 13.4, 6.4): ไม่มี business logic — sweep ทำใน RPC,
// dispatch ทำใน rpc_dispatch_notification. ที่นี่แค่วนรายการที่ถึงกำหนดแล้วสั่ง dispatch.
// reminder = Direct_Responsibility_Item; timeout = escalation (RPC ตั้ง status='escalated' + audit แล้ว).

export interface SweepItem {
  approval_request_id: string;
  work_item_id: string;
  process_step: string;
  site_code: string | null;
  action: "reminder_50" | "reminder_100" | "timeout";
  /** 'employee' | 'customer' (Req 20.11) */
  approver_kind?: string;
  /** 'project_manager' | 'workflow_default' | null — timeout target (Req 20.11) */
  escalate_to?: string | null;
}

export type SweepFn = () => Promise<SweepItem[]>;
export type DispatchFn = (item: SweepItem) => Promise<void>;

export interface SchedulerDeps {
  sweep: SweepFn;
  dispatch: DispatchFn;
  /** D1 — รอบ Daily_Digest: กวาด digest_pending ทุก site (รวม null) เป็นข้อความเดียวต่อ site → คืนจำนวน digest ที่ทำ */
  assembleDigests?: () => Promise<number>;
}

/**
 * Pure: สร้าง params ของ rpc_dispatch_notification จาก sweep item.
 * customer timeout → template tpl_sla_timeout_pm + escalate_to=project_manager (Req 20.11).
 */
export function buildDispatchParams(item: SweepItem): Record<string, unknown> {
  const isReminder = item.action !== "timeout";
  const toPm = item.action === "timeout" && item.escalate_to === "project_manager";
  const templateKey = isReminder
    ? "tpl_sla_reminder"
    : toPm
      ? "tpl_sla_timeout_pm"
      : "tpl_sla_timeout";
  return {
    p_target: { approval_request_id: item.approval_request_id, escalate_to: item.escalate_to ?? null },
    p_intent: isReminder ? "personal_responsibility" : "cross_team_handoff",
    p_category: item.action,
    p_template_key: templateKey,
    p_slots: {
      work_item_id: item.work_item_id,
      process_step: item.process_step,
      approver_kind: item.approver_kind ?? "employee",
      escalate_to: item.escalate_to ?? null,
    },
    p_muted: false,
    p_in_quiet_hours: false,
    p_has_active_binding: true,
    p_dept_head_target: null,
    p_site_code: item.site_code,
  };
}

export interface SweepSummary {
  swept: number;
  dispatched: number;
  failures: number;
  digests?: number;
}

/** orchestrate: sweep → dispatch each due item. dispatch ที่ล้มเหลวนับ failures ไม่ทำให้ทั้ง batch ล้ม. */
export async function runScheduler(deps: SchedulerDeps): Promise<SweepSummary> {
  const items = await deps.sweep();
  let dispatched = 0;
  let failures = 0;
  for (const item of items) {
    try {
      await deps.dispatch(item);
      dispatched += 1;
    } catch {
      failures += 1; // best-effort per item; cron จะ retry รอบถัดไป
    }
  }
  return { swept: items.length, dispatched, failures };
}

/** D1 — รอบ Daily_Digest: กวาด digest_pending ทุก site (รวม null, no orphan) เป็นข้อความเดียวต่อ site (Req 6.4). */
export async function runDigest(deps: SchedulerDeps): Promise<number> {
  if (deps.assembleDigests === undefined) return 0;
  try {
    return await deps.assembleDigests();
  } catch {
    return 0; // best-effort; รอบถัดไป assemble ใหม่ (digest_pending ยังคงอยู่)
  }
}

export async function handleSlaSweep(
  req: Request,
  deps: SchedulerDeps = defaultDeps,
): Promise<Response> {
  // cron trigger (POST) หรือ manual invoke
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // body.assemble_digest === true → รอบ Daily_Digest (แยกจาก SLA sweep ที่ถี่กว่า)
  let assembleDigest = false;
  try {
    const body = (await req.json()) as { assemble_digest?: boolean } | null;
    assembleDigest = body?.assemble_digest === true;
  } catch {
    assembleDigest = false; // ไม่มี body → sweep ปกติ
  }

  const summary = await runScheduler(deps);
  if (assembleDigest) summary.digests = await runDigest(deps);
  return json(200, summary as unknown as Record<string, unknown>);
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

const defaultDeps: SchedulerDeps = {
  sweep: async () => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("rpc_sla_sweep", {});
    if (error !== null) throw new Error("rpc_sla_sweep failed");
    return Array.isArray(data) ? (data as SweepItem[]) : [];
  },
  dispatch: async (item) => {
    const client = await getServiceClient();
    const { error } = await client.rpc("rpc_dispatch_notification", buildDispatchParams(item));
    if (error !== null) throw new Error("rpc_dispatch_notification failed");
  },
  assembleDigests: async () => {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("rpc_assemble_pending_digests", {});
    if (error !== null) throw new Error("rpc_assemble_pending_digests failed");
    return typeof data === "number" ? data : 0;
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
  Deno.serve(handleSlaSweep);
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

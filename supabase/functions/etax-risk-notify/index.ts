// supabase/functions/etax-risk-notify/index.ts
// pg_notify consumer for `etax_risk_rank_changed`
// Delivers LINE Notify + webhook alerts on CRITICAL / WARNING tier transitions
// Invoked via: pg_net HTTP POST from fn_check_risk_tier_changes trigger, or cron poll mode

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Environment ──────────────────────────────────────────────────────────────
const SUPABASE_URL               = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_NOTIFY_DEFAULT_TOKEN  = Deno.env.get("LINE_NOTIFY_TOKEN") ?? "";
const GLOBAL_WEBHOOK_URL         = Deno.env.get("ALERT_WEBHOOK_URL") ?? "";
const FUNCTION_SECRET            = Deno.env.get("FUNCTION_SECRET") ?? "";  // shared-secret header

// ─── Types ───────────────────────────────────────────────────────────────────
interface RiskTierPayload {
  org_id:           string;
  org_name:         string;
  previous_tier:    "CRITICAL" | "WARNING" | "HEALTHY";
  new_tier:         "CRITICAL" | "WARNING" | "HEALTHY";
  health_score:     number;
  risk_rank:        number;
  health_status:    string;
  is_priority_review: boolean;
  transitioned_at:  string;
}

interface NotificationSettings {
  line_notify_token?:  string;
  webhook_url?:        string;
  webhook_secret?:     string;  // added as Authorization: Bearer {secret}
  alert_on_critical?:  boolean;
  alert_on_warning?:   boolean;
  alert_channels?:     Array<"line" | "webhook">;
  mention_admin?:      boolean; // prepend @admin in LINE message
}

interface AlertResult {
  org_id:    string;
  org_name:  string;
  new_tier:  string;
  channels:  string[];
  errors:    string[];
  skipped:   boolean;
  reason?:   string;
}

// ─── LINE Notify ─────────────────────────────────────────────────────────────
async function sendLineNotify(
  token: string,
  message: string,
  stickerPackageId?: number,
  stickerId?: number,
): Promise<{ ok: boolean; status: number; body: string }> {
  const form = new FormData();
  form.append("message", message);
  if (stickerPackageId != null) form.append("stickerPackageId", String(stickerPackageId));
  if (stickerId        != null) form.append("stickerId",        String(stickerId));

  const res = await fetch("https://notify-api.line.me/api/notify", {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
async function sendWebhook(
  url:     string,
  payload: RiskTierPayload,
  secret?: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  headers["X-Monolith-Event"] = "etax_risk_rank_changed";
  headers["X-Monolith-Org"]   = payload.org_id;

  const res = await fetch(url, {
    method:  "POST",
    headers,
    body:    JSON.stringify({ event: "etax_risk_rank_changed", data: payload }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// ─── Message Builder ──────────────────────────────────────────────────────────
function buildLineMessage(p: RiskTierPayload, settings: NotificationSettings): string {
  const tierEmoji: Record<string, string> = {
    CRITICAL: "🔴",
    WARNING:  "🟡",
    HEALTHY:  "🟢",
  };
  const prev = tierEmoji[p.previous_tier] ?? "⚪";
  const next = tierEmoji[p.new_tier]      ?? "⚪";

  const lines = [
    "",
    `⚠️ [MONOLITH] eTax Risk Tier Changed`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Org       : ${p.org_name}`,
    `Transition: ${prev} ${p.previous_tier} → ${next} ${p.new_tier}`,
    `Health    : ${p.health_score}/100 (${p.health_status})`,
    `Risk Rank : #${p.risk_rank}`,
    `Priority  : ${p.is_priority_review ? "YES — Immediate Review Required" : "No"}`,
    `Time      : ${new Date(p.transitioned_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
  ];

  if (p.new_tier === "CRITICAL") {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("🚨 ACTION REQUIRED: eTax submissions are critically degraded.");
    lines.push("   Please review submissions immediately.");
  }

  if (settings.mention_admin) lines.unshift("@admin");

  return lines.join("\n");
}

// ─── Alert Dispatcher ─────────────────────────────────────────────────────────
async function dispatchAlert(
  payload:  RiskTierPayload,
  settings: NotificationSettings,
): Promise<AlertResult> {
  const result: AlertResult = {
    org_id:   payload.org_id,
    org_name: payload.org_name,
    new_tier: payload.new_tier,
    channels: [],
    errors:   [],
    skipped:  false,
  };

  // Check whether this tier change warrants alerting
  const alertCritical = settings.alert_on_critical ?? true;
  const alertWarning  = settings.alert_on_warning  ?? false;

  if (payload.new_tier === "CRITICAL" && !alertCritical) {
    result.skipped = true;
    result.reason  = "alert_on_critical=false in notification_settings";
    return result;
  }
  if (payload.new_tier === "WARNING" && !alertWarning) {
    result.skipped = true;
    result.reason  = "alert_on_warning=false in notification_settings";
    return result;
  }
  if (payload.new_tier === "HEALTHY") {
    // Recovery notice — only send if org had been CRITICAL
    if (payload.previous_tier !== "CRITICAL" && payload.previous_tier !== "WARNING") {
      result.skipped = true;
      result.reason  = "No alert needed for HEALTHY (no prior degraded state)";
      return result;
    }
  }

  const channels = settings.alert_channels ?? ["line", "webhook"];
  const lineMsg  = buildLineMessage(payload, settings);

  // ── LINE Notify ──────────────────────────────────────────────────────────
  if (channels.includes("line")) {
    const token = settings.line_notify_token || LINE_NOTIFY_DEFAULT_TOKEN;
    if (token) {
      // Use sticker 2 pack-1 (thumbs-up) for HEALTHY recovery, 6 pack-108 (warning) for others
      const [pkg, stk] =
        payload.new_tier === "HEALTHY"  ? [2, 144]  :
        payload.new_tier === "CRITICAL" ? [11539, 52114120] : [11539, 52114116];

      const r = await sendLineNotify(token, lineMsg, pkg, stk);
      if (r.ok) {
        result.channels.push("line");
      } else {
        result.errors.push(`LINE Notify HTTP ${r.status}: ${r.body.slice(0, 120)}`);
      }
    } else {
      result.errors.push("LINE Notify token not configured");
    }
  }

  // ── Webhook ───────────────────────────────────────────────────────────────
  if (channels.includes("webhook")) {
    const url = settings.webhook_url || GLOBAL_WEBHOOK_URL;
    if (url) {
      const r = await sendWebhook(url, payload, settings.webhook_secret);
      if (r.ok) {
        result.channels.push("webhook");
      } else {
        result.errors.push(`Webhook HTTP ${r.status}: ${r.body.slice(0, 120)}`);
      }
    } else {
      result.errors.push("Webhook URL not configured");
    }
  }

  return result;
}

// ─── Cron / Poll Mode ─────────────────────────────────────────────────────────
// Called without a body: fetches orgs that transitioned in the last 10 minutes
// from etax_risk_tier_state and builds synthetic payloads for any that match.
async function runPollMode(
  supabase: ReturnType<typeof createClient>,
): Promise<AlertResult[]> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // etax_risk_tier_state stores: org_id, risk_tier, health_score, risk_rank, updated_at
  // We also need the org_name + notification_settings from organizations
  const { data, error } = await supabase
    .from("etax_risk_tier_state")
    .select(`
      org_id,
      risk_tier,
      health_score,
      risk_rank,
      updated_at,
      organizations (
        name,
        notification_settings
      )
    `)
    .gte("updated_at", tenMinutesAgo);

  if (error) {
    console.error("Poll mode query error:", error.message);
    return [];
  }

  const results: AlertResult[] = [];

  for (const row of data ?? []) {
    const org  = (row as any).organizations ?? {};
    const ns   = (org.notification_settings ?? {}) as NotificationSettings;

    // In poll mode we don't know previous_tier — treat any CRITICAL as requiring alert
    if (row.risk_tier !== "CRITICAL" && row.risk_tier !== "WARNING") continue;

    const payload: RiskTierPayload = {
      org_id:             row.org_id,
      org_name:           org.name ?? row.org_id,
      previous_tier:      "HEALTHY",   // conservative assumption for poll mode
      new_tier:           row.risk_tier as "CRITICAL" | "WARNING",
      health_score:       row.health_score ?? 0,
      risk_rank:          row.risk_rank ?? 0,
      health_status:      row.risk_tier === "CRITICAL" ? "critical" : "warning",
      is_priority_review: row.risk_tier === "CRITICAL",
      transitioned_at:    row.updated_at,
    };

    const r = await dispatchAlert(payload, ns);
    results.push(r);
  }

  return results;
}

// ─── Request Handler ──────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // ── Auth check ────────────────────────────────────────────────────────────
  if (FUNCTION_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const provided   = authHeader.replace(/^Bearer\s+/i, "");
    if (provided !== FUNCTION_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Poll mode: GET or empty POST ──────────────────────────────────────────
  const contentType = req.headers.get("content-type") ?? "";
  if (req.method === "GET" || !contentType.includes("application/json")) {
    console.log("Running in poll mode…");
    const results = await runPollMode(supabase);
    return new Response(JSON.stringify({ mode: "poll", results }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Trigger mode: POST with pg_notify payload ─────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Body may be a single payload or an array (batch from pg_net)
  const payloads: RiskTierPayload[] = Array.isArray(body) ? body : [body as RiskTierPayload];

  const results: AlertResult[] = [];

  for (const payload of payloads) {
    // Validate required fields
    if (!payload.org_id || !payload.new_tier) {
      results.push({
        org_id:   payload.org_id ?? "unknown",
        org_name: payload.org_name ?? "unknown",
        new_tier: payload.new_tier ?? "unknown",
        channels: [],
        errors:   ["Missing required fields: org_id or new_tier"],
        skipped:  true,
        reason:   "invalid_payload",
      });
      continue;
    }

    // Fetch org notification_settings
    const { data: orgData } = await supabase
      .from("organizations")
      .select("notification_settings")
      .eq("id", payload.org_id)
      .maybeSingle();

    const settings: NotificationSettings = (orgData?.notification_settings ?? {}) as NotificationSettings;

    const r = await dispatchAlert(payload, settings);
    results.push(r);

    // Audit: log alert dispatch to etax_submissions_audit_log if available
    await supabase.from("etax_submissions_audit_log").insert({
      org_id:      payload.org_id,
      action:      "risk_tier_alert_dispatched",
      actor_id:    null,
      actor_role:  "system",
      changes: {
        previous_tier:    payload.previous_tier,
        new_tier:         payload.new_tier,
        health_score:     payload.health_score,
        channels_sent:    r.channels,
        errors:           r.errors,
        skipped:          r.skipped,
      },
    }).catch(() => { /* audit failure is non-fatal */ });
  }

  const sentCount    = results.filter(r => r.channels.length > 0).length;
  const skippedCount = results.filter(r => r.skipped).length;
  const errorCount   = results.filter(r => r.errors.length > 0 && !r.skipped).length;

  console.log(`etax-risk-notify: sent=${sentCount} skipped=${skippedCount} errors=${errorCount}`);

  return new Response(
    JSON.stringify({ mode: "trigger", sent: sentCount, skipped: skippedCount, errors: errorCount, results }),
    { headers: { "Content-Type": "application/json" } },
  );
});

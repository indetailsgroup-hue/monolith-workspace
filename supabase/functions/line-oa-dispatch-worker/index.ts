/**
 * line_oa_dispatch_worker.ts
 * Monolith Manufacturing OS – DAPH Decor / IIMOS
 * Migration context: supports 0197 (pg_notify trigger) + 0193/0196 (outbound messages)
 *
 * Deno Edge Function (HTTP POST, ephemeral invocation)
 * ----------------------------------------------------
 * Accepts a JSON body:  { ids?: string[], limit?: number }
 *   - ids   → directed mode: process only these line_oa_outbound_messages.id values
 *   - empty → drain mode: process up to `limit` (default DISPATCH_LIMIT) pending rows
 *
 * Auth: Bearer SERVICE_ROLE_KEY  OR  x-invoke-key: WORKER_INVOKE_KEY header
 *
 * Env vars required:
 *   SUPABASE_URL                — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Service-role JWT (never exposed to client)
 *   LINE_CHANNEL_ACCESS_TOKEN   — LINE Messaging API channel token
 * Env vars optional:
 *   LINE_API_BASE               — Default: https://api.line.me
 *   DISPATCH_LIMIT              — Max rows per invocation (default 50)
 *   VERTICAL                    — Template vertical_context filter (default "field_purchase")
 *   WORKER_INVOKE_KEY           — Shared secret for cron/relay invocations
 *
 * Design constraints (Monolith patterns):
 *   - No client write path: all DB writes via service-role only
 *   - Lost-race-safe: UPDATE ... WHERE id = X AND status = 'pending'
 *   - Sequential dispatch (LINE rate-limit safety, ~50 req/s budget)
 *   - Template cache: module-level Map<string, TemplateRow>
 *   - Append-only audit: status transitions written inline (no delete)
 *   - Returns: { ok, dispatched, failed, ids, results }
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutboundRow {
  id: string;
  send_type: "push" | "reply";
  status: "pending" | "sent" | "failed";
  template_key: string;
  slot_values: Record<string, string>;
  target_type: "user" | "group";
  target_id: string;
  created_at: string;
  reply_token?: string | null;
}

interface TemplateRow {
  template_key: string;
  vertical_context: string;
  body: string | null;
  message_kind: "text" | "quick_reply" | "flex";
  flex_payload: Record<string, unknown> | null;
  is_active: boolean;
}

interface DispatchResult {
  id: string;
  status: "sent" | "failed";
  error?: string;
}

interface WorkerResponse {
  ok: boolean;
  dispatched: number;
  failed: number;
  ids: string[];
  results: DispatchResult[];
}

// ---------------------------------------------------------------------------
// Module-level template cache (survives warm invocations within same isolate)
// ---------------------------------------------------------------------------
const _templateCache = new Map<string, TemplateRow>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render {{slot}} placeholders in a string value */
function renderSlots(template: string, slots: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => slots[key] ?? `{{${key}}}`);
}

/** Deep-render slot placeholders inside a JSON object (flex_payload) */
function renderSlotsDeep(
  obj: Record<string, unknown>,
  slots: Record<string, string>
): Record<string, unknown> {
  const rendered = JSON.stringify(obj);
  const replaced = renderSlots(rendered, slots);
  return JSON.parse(replaced) as Record<string, unknown>;
}

/** Resolve template from cache or DB */
async function resolveTemplate(
  supabase: SupabaseClient,
  templateKey: string,
  vertical: string
): Promise<TemplateRow | null> {
  const cacheKey = `${vertical}::${templateKey}`;
  if (_templateCache.has(cacheKey)) {
    return _templateCache.get(cacheKey)!;
  }

  const { data, error } = await supabase
    .from("line_oa_message_templates")
    .select("template_key, vertical_context, body, message_kind, flex_payload, is_active")
    .eq("template_key", templateKey)
    .eq("vertical_context", vertical)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    console.warn(`[worker] template not found: ${cacheKey}`, error?.message);
    return null;
  }

  _templateCache.set(cacheKey, data as TemplateRow);
  return data as TemplateRow;
}

/** Build LINE API message object from template + slots */
function buildLineMessage(
  tpl: TemplateRow,
  slots: Record<string, string>
): Record<string, unknown> {
  if (tpl.message_kind === "flex" && tpl.flex_payload) {
    return {
      type: "flex",
      altText: tpl.body ? renderSlots(tpl.body, slots) : "Field Purchase Request",
      contents: renderSlotsDeep(tpl.flex_payload, slots),
    };
  }

  if (tpl.message_kind === "quick_reply" && tpl.flex_payload) {
    const renderedFlex = renderSlotsDeep(tpl.flex_payload, slots);
    return {
      type: "text",
      text: tpl.body ? renderSlots(tpl.body, slots) : "",
      quickReply: renderedFlex,
    };
  }

  // Default: plain text
  return {
    type: "text",
    text: tpl.body ? renderSlots(tpl.body, slots) : "",
  };
}

/** POST to LINE Messaging API */
async function sendToLine(
  lineApiBase: string,
  token: string,
  row: OutboundRow,
  message: Record<string, unknown>
): Promise<void> {
  let endpoint: string;
  let payload: Record<string, unknown>;

  if (row.send_type === "reply" && row.reply_token) {
    endpoint = `${lineApiBase}/v2/bot/message/reply`;
    payload = { replyToken: row.reply_token, messages: [message] };
  } else {
    // push (default, also fallback when reply_token missing)
    endpoint = `${lineApiBase}/v2/bot/message/push`;
    payload = { to: row.target_id, messages: [message] };
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`LINE API ${res.status}: ${body}`);
  }
}

/** Mark row sent — lost-race-safe (WHERE status='pending') */
async function markRowSent(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("line_oa_outbound_messages")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("status", "pending"); // lost-race guard

  if (error) {
    console.warn(`[worker] markRowSent(${id}) db error:`, error.message);
  }
}

/**
 * Mark row failed — delegates to fn_outbound_mark_failed (0208) which
 * atomically increments retried_count and promotes to 'dead' after 3 attempts.
 * Lost-race guard is enforced inside the DB function (WHERE status='pending').
 */
async function markRowFailed(
  supabase: SupabaseClient,
  id: string,
  errorMsg?: string,
): Promise<void> {
  // Store error detail in slot_values metadata before marking failed/dead
  if (errorMsg) {
    await supabase
      .from("line_oa_outbound_messages")
      .update({ slot_values: { _dispatch_error: errorMsg } })
      .eq("id", id)
      .eq("status", "pending");
  }

  const { error } = await supabase.rpc("fn_outbound_mark_failed", { p_id: id });
  if (error) {
    console.warn(`[worker] fn_outbound_mark_failed(${id}) rpc error:`, error.message);
  }
}

/** @deprecated Use markRowSent / markRowFailed instead. Kept for backward-compat. */
async function markRow(
  supabase: SupabaseClient,
  id: string,
  newStatus: "sent" | "failed",
  errorMsg?: string,
): Promise<void> {
  if (newStatus === "sent") {
    return markRowSent(supabase, id);
  }
  return markRowFailed(supabase, id, errorMsg);
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isAuthorised(req: Request, serviceKey: string, invokeKey: string | undefined): boolean {
  // Option A: Bearer service-role key
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader === `Bearer ${serviceKey}`) return true;

  // Option B: x-invoke-key shared secret (for pg_notify relay / cron)
  if (invokeKey) {
    const invokeHeader = req.headers.get("x-invoke-key") ?? "";
    if (invokeHeader === invokeKey) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main dispatch loop
// ---------------------------------------------------------------------------

async function dispatch(
  supabase: SupabaseClient,
  lineApiBase: string,
  lineToken: string,
  vertical: string,
  rows: OutboundRow[]
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  for (const row of rows) {
    // 1. Resolve template
    const tpl = await resolveTemplate(supabase, row.template_key, vertical);
    if (!tpl) {
      const errMsg = `template not found: ${row.template_key} [${vertical}]`;
      console.error(`[worker] ${errMsg} for row ${row.id}`);
      await markRowFailed(supabase, row.id, errMsg);
      results.push({ id: row.id, status: "failed", error: errMsg });
      continue;
    }

    // 2. Build LINE message
    const message = buildLineMessage(tpl, row.slot_values ?? {});

    // 3. Send to LINE
    try {
      await sendToLine(lineApiBase, lineToken, row, message);
      await markRowSent(supabase, row.id);
      results.push({ id: row.id, status: "sent" });
      console.log(`[worker] sent row ${row.id} (${row.template_key} → ${row.target_id})`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] failed row ${row.id}:`, errMsg);
      await markRowFailed(supabase, row.id, errMsg);
      results.push({ id: row.id, status: "failed", error: errMsg });
    }

    // Small yield between messages (LINE rate-limit courtesy)
    await new Promise((r) => setTimeout(r, 20));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Test utility: clear module-level template cache between test runs
// ---------------------------------------------------------------------------

export function clearTemplateCache(): void {
  _templateCache.clear();
}

// ---------------------------------------------------------------------------
// Exported handler — extracted so tests can import it without starting a server
// ---------------------------------------------------------------------------

export async function handleDispatch(req: Request): Promise<Response> {
  // Read env
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
  const lineApiBase = Deno.env.get("LINE_API_BASE") ?? "https://api.line.me";
  const dispatchLimit = parseInt(Deno.env.get("DISPATCH_LIMIT") ?? "50", 10);
  const vertical = Deno.env.get("VERTICAL") ?? "field_purchase";
  const invokeKey = Deno.env.get("WORKER_INVOKE_KEY");

  // Validate required env vars
  if (!supabaseUrl || !serviceKey || !lineToken) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing required environment variables" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Auth gate
  if (!isAuthorised(req, serviceKey, invokeKey)) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorised" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse body
  let body: { ids?: string[]; limit?: number } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Supabase client (service-role — server side only)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fetch pending rows
  let query = supabase
    .from("line_oa_outbound_messages")
    .select(
      "id, send_type, status, template_key, slot_values, target_type, target_id, created_at, reply_token"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const isDirected = Array.isArray(body.ids) && body.ids.length > 0;

  if (isDirected) {
    // Directed mode: only process the requested IDs (from pg_notify relay)
    query = query.in("id", body.ids!);
  } else {
    // Drain mode: up to limit
    const limit = body.limit ?? dispatchLimit;
    query = query.limit(Math.min(limit, dispatchLimit));
  }

  const { data: rows, error: fetchError } = await query;

  if (fetchError) {
    console.error("[worker] fetch pending rows error:", fetchError.message);
    return new Response(
      JSON.stringify({ ok: false, error: fetchError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!rows || rows.length === 0) {
    const response: WorkerResponse = {
      ok: true,
      dispatched: 0,
      failed: 0,
      ids: [],
      results: [],
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[worker] processing ${rows.length} pending rows (directed=${isDirected})`);

  // Run dispatch loop
  const results = await dispatch(
    supabase,
    lineApiBase,
    lineToken,
    vertical,
    rows as OutboundRow[]
  );

  const dispatched = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;

  const response: WorkerResponse = {
    ok: failed === 0,
    dispatched,
    failed,
    ids: results.map((r) => r.id),
    results,
  };

  console.log(`[worker] done: dispatched=${dispatched} failed=${failed}`);

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Deno.serve entry point (only when executed directly — not during tests)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  Deno.serve(handleDispatch);
}

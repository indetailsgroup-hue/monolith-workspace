// Edge Function: field-purchase-line
// Supabase path: supabase/functions/field-purchase-line/index.ts
// Feature: field-purchase (Module FPR)
// Spec: .kiro/specs/field-purchase/design.md
//
// HTTP boundary for inbound LINE webhooks on the FPR channel.
// This function:
//   * verifies LINE HMAC-SHA256 signature inline (LINE_FPR_CHANNEL_SECRET).
//   * routes group/room events → fn_line_handle_group_event (session creation, FPR initiation).
//   * routes postback events    → rpc_handle_fpr_postback   (approve/reject/confirm/amount).
//   * detects active DM rejection-note sessions and routes DM text
//     → rpc_handle_fpr_postback('fpr_reject_note').
//   * dispatches LINE replies/pushes using LINE_FPR_CHANNEL_ACCESS_TOKEN.
//
// Trust boundary (ADR-031):
//   * Channel secret (HMAC verification) lives only in env — never stored in DB or logged.
//   * Channel access token (outbound sends) lives only in env — never stored in DB or logged.
//   * Postback token HMAC is verified inside rpc_handle_fpr_postback (SECURITY DEFINER).
//   * Caller identity is derived from events[].source.userId in the verified body — never
//     trusted from headers or query params (mirrors approval-postback trust boundary).
//
// Response mapping:
//   * 200  — accepted (all events processed, including idempotent acks).
//   * 401  — missing / invalid LINE HMAC-SHA256 signature.
//   * 400  — malformed JSON body.
//   * 405  — non-POST method.

// ---------------------------------------------------------------------------
// Rate limiting (Phase 10 hardening)
// Limits inbound LINE events per userId to RATE_LIMIT_PER_MIN per minute.
// Module-level state is safe: each Deno Edge Function instance is single-tenant.
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  windowStart: number; // Unix ms
}

/** Module-level rate-limit state (reset on each function cold-start). */
const _rateLimitMap = new Map<string, RateLimitBucket>();

/**
 * Returns true if the userId is within the rate limit window, false if exceeded.
 * Sliding window: resets every 60 000 ms from the first event in the window.
 */
export function checkRateLimit(userId: string, limitPerMin: number): boolean {
  const now = Date.now();
  const bucket = _rateLimitMap.get(userId);

  if (!bucket || now - bucket.windowStart >= 60_000) {
    // New window
    _rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= limitPerMin) {
    return false; // exceeded
  }

  bucket.count += 1;
  return true;
}

/** Test utility: clear rate-limit state between tests. */
export function clearRateLimitMap(): void {
  _rateLimitMap.clear();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LineEventSource {
  type: "user" | "group" | "room";
  userId: string;
  groupId?: string;
  roomId?: string;
}

export interface LineMessage {
  type: string;
  id: string;
  text?: string;
  contentProvider?: { type: string };
}

export interface LinePostback {
  data: string;
  params?: Record<string, string>;
}

export interface LineEvent {
  type: string;
  mode: string;
  timestamp: number;
  webhookEventId?: string;
  source: LineEventSource;
  replyToken?: string;
  message?: LineMessage;
  postback?: LinePostback;
}

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

/** Shape returned by fn_line_handle_group_event (text/JSON) and rpc_handle_fpr_postback (jsonb). */
export interface RouteResult {
  reply_token?: string | null;
  messages?: unknown[];
  push_to?: string | null;
}

/** PostgREST / pg error surfaced in fetch response body. */
export interface RpcError {
  code?: string;
  message?: string;
}

/** Injected DB connection details (for testability). */
export interface DbDeps {
  supabaseUrl: string;
  serviceKey: string;
}

/** Injected LINE outbound credentials (for testability). */
export interface LineDeps {
  accessToken: string;
}

/** Full dependency bundle injectable for testing. */
export interface FprWebhookDeps {
  channelSecret?: string;
  db?: DbDeps;
  line?: LineDeps;
}

// ---------------------------------------------------------------------------
// LINE signature verification  (ADR-031: inline HMAC — no vault round-trip)
// ---------------------------------------------------------------------------

/**
 * Verifies the LINE webhook HMAC-SHA256 signature.
 * LINE signs the raw body: signature = base64( HMAC-SHA256(rawBody, channelSecret) )
 * Returns false for an empty or invalid signature.
 */
export async function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  if (signature.length === 0) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return expected === signature;
}

// ---------------------------------------------------------------------------
// Postback data parsing
// ---------------------------------------------------------------------------

/**
 * Parses the postback.data string into action + full params object.
 *
 * Postback data format (from 0177 flex card builder):
 *   JSON: {"action":"fpr_approve","request_id":"…","token":"…","iat":…}
 * Falls back to URLSearchParams for non-JSON payloads.
 *
 * The `action` field drives rpc_handle_fpr_postback routing.
 * The full params object (including token) is forwarded for DB-side HMAC verification.
 */
export function parsePostbackData(data: string): {
  action: string;
  params: Record<string, unknown>;
} {
  let parsed: Record<string, unknown> = {};
  try {
    const j: unknown = JSON.parse(data);
    if (j !== null && typeof j === "object" && !Array.isArray(j)) {
      parsed = j as Record<string, unknown>;
    }
  } catch {
    // Fall back to URL-encoded format
    const sp = new URLSearchParams(data);
    for (const [k, v] of sp.entries()) {
      parsed[k] = v;
    }
  }
  const action = typeof parsed.action === "string" ? parsed.action : "";
  return { action, params: parsed };
}

// ---------------------------------------------------------------------------
// PostgREST helpers (raw fetch — no npm client, consistent with line-webhook)
// ---------------------------------------------------------------------------

/**
 * Calls a PostgREST RPC and normalises the result to a single record.
 * Returns { data, error } in the same shape as @supabase/supabase-js for symmetry.
 */
async function rpcCall(
  fnName: string,
  params: Record<string, unknown>,
  db: DbDeps,
): Promise<{ data: unknown; error: RpcError | null }> {
  const res = await fetch(`${db.supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": db.serviceKey,
      "authorization": `Bearer ${db.serviceKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as RpcError;
    return { data: null, error: { code: err.code, message: err.message } };
  }

  const raw: unknown = await res.json().catch(() => null);
  // PostgREST wraps SETOF results in an array; unwrap to first element.
  const data = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  return { data, error: null };
}

/**
 * Queries a PostgREST table with equality filters.
 * Used only for the lightweight DM-session existence check.
 */
async function tableSelect(
  table: string,
  filters: Record<string, string>,
  db: DbDeps,
): Promise<unknown[]> {
  const params = new URLSearchParams({ ...filters, select: "id" });
  const res = await fetch(`${db.supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    headers: {
      "apikey": db.serviceKey,
      "authorization": `Bearer ${db.serviceKey}`,
    },
  });
  if (!res.ok) return [];
  const data: unknown = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// LINE Messaging API dispatch
// ---------------------------------------------------------------------------

/** Sends a reply message using the one-time reply token provided in the event. */
async function sendLineReply(
  replyToken: string,
  messages: unknown[],
  accessToken: string,
): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

/** Sends a push message to a user, group, or room ID. */
async function sendLinePush(
  to: string,
  messages: unknown[],
  accessToken: string,
): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages }),
  });
}

// ---------------------------------------------------------------------------
// Event routers
// ---------------------------------------------------------------------------

/**
 * Routes a group/room message (image / text) to fn_line_handle_group_event.
 *
 * DB function signature (0177):
 *   fn_line_handle_group_event(p_event jsonb, p_vertical text, p_actor text) RETURNS text
 *
 * Returns text (JSON-encoded RouteResult) or NULL when the event is not actionable
 * (e.g. non-image text before session is open). The edge function parses the text and
 * dispatches the reply.
 */
async function routeGroupEvent(
  event: LineEvent,
  db: DbDeps,
): Promise<RouteResult | null> {
  const { data, error } = await rpcCall("fn_line_handle_group_event", {
    p_event: event,
    p_vertical: "installation_pm",
    p_actor: event.source.userId,
  }, db);

  if (error !== null || data === null) return null;

  // fn_line_handle_group_event returns RETURNS text — may be a JSON string.
  let parsed: unknown = data;
  if (typeof data === "string" && data.trim().startsWith("{")) {
    try { parsed = JSON.parse(data); } catch { return null; }
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as RouteResult;
  }
  return null;
}

/**
 * Routes a postback event to rpc_handle_fpr_postback.
 *
 * DB function signature (0177):
 *   rpc_handle_fpr_postback(
 *     p_action text, p_line_user_id text, p_line_group_id text,
 *     p_webhook_event_id text, p_params jsonb, p_message_text text
 *   ) RETURNS jsonb
 *
 * The postback.data carries {action, request_id, token, iat}.
 * DB-side HMAC token verification is performed inside rpc_handle_fpr_postback.
 */
async function routePostback(
  event: LineEvent,
  db: DbDeps,
): Promise<RouteResult | null> {
  const rawData = event.postback?.data ?? "";
  if (rawData.length === 0) return null;

  const { action, params } = parsePostbackData(rawData);
  if (action.length === 0) return null;

  const { data, error } = await rpcCall("rpc_handle_fpr_postback", {
    p_action: action,
    p_line_user_id: event.source.userId,
    p_line_group_id: event.source.groupId ?? null,
    p_webhook_event_id: event.webhookEventId ?? null,
    p_params: params,
    p_message_text: null,
  }, db);

  if (error !== null || data === null) return null;
  return data as RouteResult;
}

/**
 * Checks whether an active DM rejection-note session exists for this user.
 *
 * Session record in fpr_line_session (0177):
 *   line_group_id = 'dm:' || line_user_id
 *   state         = 'await_reject_note'
 *   expires_at    > now()   (DM sessions expire in 30 minutes per design doc)
 */
async function hasDmRejectSession(
  userId: string,
  db: DbDeps,
): Promise<boolean> {
  const rows = await tableSelect("fpr_line_session", {
    "line_group_id": `eq.dm:${userId}`,
    "state": "eq.await_reject_note",
    "expires_at": `gt.${new Date().toISOString()}`,
  }, db);
  return rows.length > 0;
}

/**
 * Routes a DM rejection note to rpc_handle_fpr_postback('fpr_reject_note').
 *
 * Called only after hasDmRejectSession confirms an open session.
 * The DB function resolves the pending request_id from the session record,
 * validates the actor, and advances the state machine to 'done'.
 */
async function routeDmRejectNote(
  event: LineEvent,
  db: DbDeps,
): Promise<RouteResult | null> {
  const userId = event.source.userId;
  const messageText = event.message?.text ?? "";
  if (messageText.length === 0) return null;

  const { data, error } = await rpcCall("rpc_handle_fpr_postback", {
    p_action: "fpr_reject_note",
    p_line_user_id: userId,
    p_line_group_id: `dm:${userId}`,
    p_webhook_event_id: event.webhookEventId ?? null,
    p_params: null,
    p_message_text: messageText,
  }, db);

  if (error !== null || data === null) return null;
  return data as RouteResult;
}

// ---------------------------------------------------------------------------
// Single-event dispatcher
// ---------------------------------------------------------------------------

/**
 * Processes one LINE event: routes to the appropriate DB RPC, then dispatches
 * any reply or push produced by the RPC result.
 *
 * Routing table:
 *   message / group|room   → routeGroupEvent (FPR creation flow)
 *   postback               → routePostback (approve / reject / confirm)
 *   message / user (DM)    → routeDmRejectNote if session open, else ignored
 *   all other event types  → ignored (follow / unfollow / join / leave)
 */
async function dispatchEvent(
  event: LineEvent,
  db: DbDeps,
  line: LineDeps,
): Promise<void> {
  let result: RouteResult | null = null;

  if (event.type === "message") {
    const srcType = event.source.type;

    if (srcType === "group" || srcType === "room") {
      // Technician sends photo or text in the field-purchase group/room.
      result = await routeGroupEvent(event, db);
    } else if (srcType === "user" && event.message?.type === "text") {
      // DM from approver: check if a rejection-note session is open.
      const hasDm = await hasDmRejectSession(event.source.userId, db);
      if (hasDm) {
        result = await routeDmRejectNote(event, db);
      }
      // No open session → ignore DM (bot is not a general chat endpoint).
    }
  } else if (event.type === "postback") {
    result = await routePostback(event, db);
  }
  // follow / unfollow / join / leave / memberJoined / memberLeft → ignored.

  if (result === null) return;

  const msgs = Array.isArray(result.messages) ? result.messages : [];
  if (msgs.length === 0) return;

  // reply_token has priority (cheaper, one-time use within 30 s of the event).
  if (result.reply_token) {
    await sendLineReply(result.reply_token, msgs, line.accessToken);
  } else if (result.push_to) {
    await sendLinePush(result.push_to, msgs, line.accessToken);
  }
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

/**
 * Public webhook entrypoint for the FPR LINE channel.
 *
 * 1. Reject non-POST.
 * 2. Verify LINE HMAC-SHA256 signature inline (LINE_FPR_CHANNEL_SECRET).
 * 3. Parse events array from the raw body.
 * 4. Dispatch each event independently (Promise.allSettled — one event failure
 *    does NOT block the 200 ACK; prevents LINE from retrying the whole delivery).
 *
 * @param req   incoming webhook request from the LINE Messaging API
 * @param deps  injectable dependencies (channelSecret, db, line) for unit testing
 */
export async function handleFprWebhook(
  req: Request,
  deps: FprWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // Resolve env / injected deps
  const channelSecret = deps.channelSecret ?? getEnv("LINE_FPR_CHANNEL_SECRET");
  const db: DbDeps = deps.db ?? {
    supabaseUrl: getEnv("SUPABASE_URL"),
    serviceKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
  const line: LineDeps = deps.line ?? {
    accessToken: getEnv("LINE_FPR_CHANNEL_ACCESS_TOKEN"),
  };

  // Read raw body ONCE — must reach HMAC verification byte-for-byte.
  const signature = req.headers.get("x-line-signature") ?? "";
  const rawBody = await req.text();

  // Signature verification (inline HMAC, ADR-031).
  const valid = await verifyLineSignature(rawBody, signature, channelSecret);
  if (!valid) {
    return json(401, { error: "signature_invalid" });
  }

  // Parse event array.
  let body: LineWebhookBody;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("events" in parsed) ||
      !Array.isArray((parsed as { events: unknown }).events)
    ) {
      return json(400, { error: "malformed_body" });
    }
    body = parsed as LineWebhookBody;
  } catch {
    return json(400, { error: "malformed_json" });
  }

  // Dispatch events in parallel; individual failures are absorbed so LINE
  // receives a clean 200 and does not re-deliver the whole batch.
  // Phase 10: apply per-userId rate limit before dispatching each event.
  const rateLimitPerMin = (() => {
    try {
      const raw = typeof Deno !== "undefined"
        ? Deno.env.get("RATE_LIMIT_PER_MIN")
        : undefined;
      const parsed = parseInt(raw ?? "30", 10);
      return isNaN(parsed) || parsed < 1 ? 30 : parsed;
    } catch {
      return 30;
    }
  })();

  await Promise.allSettled(
    body.events.map((event) => {
      const userId = event.source?.userId;
      if (userId && !checkRateLimit(userId, rateLimitPerMin)) {
        // Rate limit exceeded — silently drop the event and return 429-like
        // response to LINE. Because we are inside allSettled, we return a
        // resolved promise so the 200 ACK is still sent to LINE (prevents
        // retry storms). The 429 is logged but not propagated upstream.
        console.warn(`[webhook] rate limit exceeded for userId=${userId}`);
        return Promise.resolve();
      }
      return dispatchEvent(event, db, line);
    }),
  );

  return json(200, { status: "accepted" });
}

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

// ---------------------------------------------------------------------------
// Runtime entrypoint
// ---------------------------------------------------------------------------

// Deno Deploy / Supabase Edge runtime entrypoint. Guarded so the module can be
// imported by unit tests without starting an HTTP server.
if (typeof Deno !== "undefined") {
  Deno.serve((req) => handleFprWebhook(req));
}

// Minimal ambient declaration so this module type-checks outside the Deno
// runtime (e.g. in editors using the Node/TS toolchain). Replaced by Deno's
// built-in types when deployed.
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

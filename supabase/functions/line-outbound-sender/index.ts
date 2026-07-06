// Edge Function: line-outbound-sender
// Feature: line-oa-commerce (Module B5)
// Spec task: 19.3 Implement the line-outbound-sender Edge Function
//
// Worker that performs the ONLY outbound HTTPS to the LINE Messaging API
// (Design Decision 2 — the staged `pending -> sent/failed` model). It:
//   * claims `pending` rows from `line_oa_outbound_messages`,
//   * resolves the Channel_Access_Token from Supabase Vault (by the channel's
//     `channel_access_token_ref`),
//   * renders the bound Message_Template with the row's `slot_values`,
//   * calls the LINE Messaging API (reply or push, per the row's `send_type`),
//   * calls `rpc_record_line_send_result` to mark the row `sent` or `failed`.
//
// Secret hygiene (Req 4.6): the Channel_Access_Token NEVER appears in any log
// line or error message. All logging goes through a scrubbing logger that
// redacts every resolved token value plus any `Bearer <token>`-shaped material,
// and the failure `error_detail` forwarded into `rpc_record_line_send_result`
// is scrubbed before it leaves this function (the RPC scrubs again as defence in
// depth).
//
// Requirements: 4.1 (reply uses the resolved token), 4.2 (push uses the resolved
// token), 4.4 (a send failure is recorded and never marked delivered), 4.6
// (token excluded from all logs/errors).
//
// Design notes / boundaries:
//   * This function is the server-side worker. It uses the Supabase service
//     context to read `pending` rows and Vault secrets; it never exposes the
//     `service_role` to a client and never returns secret material to a caller.
//   * The centralized-per-vertical topology means a Conversation does not carry
//     a `channel_identifier`; the active channel (and therefore the token ref)
//     is resolved by the Conversation's `vertical_context`.
//   * Reply tokens are not persisted on the staged row (the schema stores only
//     `send_type`, `template_key`, `slot_values`). A `reply` row whose reply
//     token is unavailable at send time falls back to `push`, consistent with
//     the reply->push fallback contract (Req 4.5). When a reply token is made
//     available to the claim context it is used for the reply endpoint.
//
// The module is structured around small injectable dependencies so the
// claim-and-record wiring and the LINE calls can be exercised with mocks by the
// integration tests (tasks 19.2 / 19.4) without reaching the network.

import {
  resolveTemplate,
  substituteSlots,
  type MessageTemplate,
} from "../_shared/line-oa/templates.ts";

// ===========================================================================
// Domain types
// ===========================================================================

/** Delivery kind of a staged outbound row (mirrors `line_oa_send_type`). */
export type SendType = "reply" | "push";

/** Terminal delivery status recorded back to the DB (mirrors the RPC contract). */
export type SendResultStatus = "sent" | "failed";

/**
 * A `pending` outbound row joined with everything needed to render and send it.
 *
 * Produced by {@link SenderDataAccess.claimPending}. Carries no secret values —
 * only the Vault *reference* for the channel access token; the token itself is
 * resolved separately via {@link VaultTokenResolver}.
 */
export interface ClaimedOutbound {
  /** `line_oa_outbound_messages.id`. */
  readonly outboundId: string;
  /** Owning conversation id — null สำหรับแถวส่งเข้ากลุ่ม (0097: target_type='group'). */
  readonly conversationId: string | null;
  /** Resolved send kind from the staged row. */
  readonly sendType: SendType;
  /** Template the row is bound to. */
  readonly templateKey: string;
  /** Named-slot values recorded at composition time (Req 5.6). */
  readonly slotValues: Readonly<Record<string, string>>;
  /**
   * Push target: LINE userId (1:1 จาก conversation) หรือ LINE groupId
   * (แถว group — LINE push API รับ groupId ใน `to` ตรง ๆ เหมือน userId)
   */
  readonly lineUserId: string;
  /** Conversation vertical, selecting the template scope + channel. */
  readonly verticalContext: string;
  /** Vault reference (name/uuid) for the channel access token — NOT the token. */
  readonly channelAccessTokenRef: string;
  /**
   * Candidate templates for `(templateKey, verticalContext)` (vertical-scoped
   * and shared). Resolution + slot substitution happen in pure logic here.
   */
  readonly candidateTemplates: readonly MessageTemplate[];
  /**
   * A LINE reply token if one is available for this row. Not persisted by the
   * current schema, so normally `undefined`; when absent a `reply` row falls
   * back to `push` (Req 4.5).
   */
  readonly replyToken?: string;
}

/** A LINE message object (text only in this wave). */
export interface LineTextMessage {
  readonly type: "text";
  readonly text: string;
}

/** A fully-built LINE Messaging API request (endpoint + body), no token yet. */
export type LineSendRequest =
  | {
      readonly endpoint: "reply";
      readonly replyToken: string;
      readonly messages: readonly LineTextMessage[];
    }
  | {
      readonly endpoint: "push";
      readonly to: string;
      readonly messages: readonly LineTextMessage[];
    };

/** Outcome of a single LINE API call. */
export interface LineSendOutcome {
  readonly ok: boolean;
  /** Non-secret failure detail when `ok` is false. */
  readonly errorDetail?: string;
}

// ===========================================================================
// Injectable dependencies (real impls built in the production factory)
// ===========================================================================

/** Reads/claims pending rows. Backed by the Supabase service context. */
export interface SenderDataAccess {
  /** Claim up to `limit` pending outbound rows with their render context. */
  claimPending(limit: number): Promise<ClaimedOutbound[]>;
  /** Record the terminal result via `rpc_record_line_send_result`. */
  recordResult(
    outboundId: string,
    status: SendResultStatus,
    errorDetail: string | null,
  ): Promise<void>;
}

/** Resolves a channel access token from Supabase Vault by its reference. */
export interface VaultTokenResolver {
  /** Return the plaintext token for a Vault reference, or null if unresolved. */
  resolveAccessToken(channelAccessTokenRef: string): Promise<string | null>;
}

/** Performs the actual LINE Messaging API call with the resolved token. */
export interface LineMessagingClient {
  send(request: LineSendRequest, accessToken: string): Promise<LineSendOutcome>;
}

/** Logger whose output is guaranteed free of token values (Req 4.6). */
export interface SenderLogger {
  info(message: string): void;
  error(message: string): void;
  /** Register a secret value to be redacted from all subsequent output. */
  registerSecret(secret: string): void;
}

/** Everything the batch processor needs. */
export interface SenderDeps {
  readonly data: SenderDataAccess;
  readonly vault: VaultTokenResolver;
  readonly line: LineMessagingClient;
  readonly logger: SenderLogger;
}

/** Tunables for a batch run. */
export interface SenderOptions {
  /** Max rows to claim per invocation. */
  readonly batchSize: number;
}

/** Per-row processing outcome (returned in the batch summary). */
export interface ProcessedRow {
  readonly outboundId: string;
  readonly status: SendResultStatus;
  /** Why a row failed (already scrubbed). Present only on failure. */
  readonly reason?: string;
}

/** Summary of a batch run, safe to serialize into the HTTP response. */
export interface BatchSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly failed: number;
  readonly results: readonly ProcessedRow[];
}

// ===========================================================================
// Secret scrubbing (Req 4.6)
// ===========================================================================

/**
 * Redact `Bearer <token>`-shaped material and any explicitly-registered secret
 * values from a string. Used for every log line and for the failure
 * `error_detail` before it is persisted.
 */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
  let scrubbed = text;
  // Redact any explicitly known secret values first (exact substring).
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      scrubbed = scrubbed.split(secret).join("[REDACTED]");
    }
  }
  // Redact `Bearer <token>` headers.
  scrubbed = scrubbed.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]");
  // Redact long opaque token-like runs (LINE channel tokens are long base64-ish).
  scrubbed = scrubbed.replace(/[A-Za-z0-9._\-+/=]{40,}/g, "[REDACTED]");
  return scrubbed;
}

/**
 * Build a {@link SenderLogger} that scrubs every registered secret plus
 * token-shaped material before delegating to `sink` (defaults to `console`).
 */
export function createScrubbingLogger(
  sink: { info: (m: string) => void; error: (m: string) => void } = console,
): SenderLogger {
  const secrets: string[] = [];
  return {
    registerSecret(secret: string) {
      if (secret && !secrets.includes(secret)) {
        secrets.push(secret);
      }
    },
    info(message: string) {
      sink.info(scrubSecrets(message, secrets));
    },
    error(message: string) {
      sink.error(scrubSecrets(message, secrets));
    },
  };
}

// ===========================================================================
// Pure rendering / request building
// ===========================================================================

/**
 * Render the bound template body with the row's slot values.
 *
 * Resolves the active template for `(templateKey, verticalContext)` from the
 * candidate set, then substitutes only its named slots. Returns a rejection
 * reason if the template is absent/inactive or a declared slot has no value —
 * these are recorded as failures rather than sent.
 */
export function renderOutboundText(
  row: ClaimedOutbound,
):
  | { ok: true; text: string }
  | { ok: false; reason: string } {
  const resolution = resolveTemplate(
    row.candidateTemplates,
    row.templateKey,
    row.verticalContext,
  );
  if (!resolution.ok) {
    return { ok: false, reason: `template_${resolution.reason}` };
  }
  const substitution = substituteSlots(resolution.template.body, row.slotValues);
  if (!substitution.ok) {
    return { ok: false, reason: `missing_slot:${substitution.missing.join(",")}` };
  }
  return { ok: true, text: substitution.body };
}

/**
 * Decide the concrete LINE request for a row.
 *
 * A `reply` row is sent via the reply endpoint only when a usable reply token is
 * present; otherwise it falls back to `push` to the conversation's LINE userId
 * (Req 4.5). A `push` row always targets the LINE userId.
 */
export function buildLineRequest(
  row: ClaimedOutbound,
  text: string,
): LineSendRequest {
  const messages: LineTextMessage[] = [{ type: "text", text }];
  const hasUsableReplyToken =
    row.sendType === "reply" &&
    typeof row.replyToken === "string" &&
    row.replyToken.trim().length > 0;

  if (hasUsableReplyToken) {
    return { endpoint: "reply", replyToken: row.replyToken as string, messages };
  }
  return { endpoint: "push", to: row.lineUserId, messages };
}

// ===========================================================================
// Batch orchestration
// ===========================================================================

/**
 * Claim a batch of pending rows and process each: resolve the token from Vault,
 * render the template, call LINE, and record the terminal result. Returns a
 * non-secret summary.
 *
 * Each row is processed independently — one row's failure never aborts the
 * batch. Every row terminates in a recorded `sent` or `failed` status; a row
 * whose result cannot even be recorded is surfaced in the summary as a failure
 * but does not throw.
 */
export async function processOutboundBatch(
  deps: SenderDeps,
  options: SenderOptions,
): Promise<BatchSummary> {
  const { data, vault, line, logger } = deps;

  const claimed = await data.claimPending(options.batchSize);
  logger.info(`line-outbound-sender: claimed ${claimed.length} pending row(s)`);

  const results: ProcessedRow[] = [];
  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    const outcome = await processOne(row, { vault, line, logger });
    results.push(outcome);
    if (outcome.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
    }

    try {
      await data.recordResult(
        row.outboundId,
        outcome.status,
        outcome.status === "failed" ? outcome.reason ?? "send failed" : null,
      );
    } catch (err) {
      // Recording failed — log (scrubbed) and continue; the row stays pending
      // and will be retried on a later sweep.
      logger.error(
        `line-outbound-sender: failed to record result for ${row.outboundId}: ${stringifyError(err)}`,
      );
    }
  }

  logger.info(
    `line-outbound-sender: batch complete (sent=${sent}, failed=${failed})`,
  );
  return { claimed: claimed.length, sent, failed, results };
}

/**
 * Process a single claimed row through token resolution -> render -> LINE call.
 * Never throws; returns a {@link ProcessedRow} with a scrubbed failure reason.
 */
async function processOne(
  row: ClaimedOutbound,
  deps: Pick<SenderDeps, "vault" | "line" | "logger">,
): Promise<ProcessedRow> {
  const { vault, line, logger } = deps;

  // 1. Resolve the channel access token from Vault and register it for scrubbing
  //    BEFORE it is ever used, so no later log/error can leak it (Req 4.6).
  let token: string | null;
  try {
    token = await vault.resolveAccessToken(row.channelAccessTokenRef);
  } catch (err) {
    return failure(row, `token_resolution_error: ${stringifyError(err)}`, logger);
  }
  if (!token) {
    return failure(row, "channel_access_token_unresolved", logger);
  }
  logger.registerSecret(token);

  // 2. Render the bound template with the row's slot values.
  const rendered = renderOutboundText(row);
  if (!rendered.ok) {
    return failure(row, rendered.reason, logger);
  }

  // 3. Build the concrete LINE request and send it with the resolved token.
  const request = buildLineRequest(row, rendered.text);
  let outcome: LineSendOutcome;
  try {
    outcome = await line.send(request, token);
  } catch (err) {
    return failure(row, `line_api_error: ${stringifyError(err)}`, logger);
  }

  if (!outcome.ok) {
    return failure(row, outcome.errorDetail ?? "line_api_send_failed", logger);
  }

  logger.info(
    `line-outbound-sender: sent ${row.outboundId} via ${request.endpoint}`,
  );
  return { outboundId: row.outboundId, status: "sent" };
}

/** Build a scrubbed failure result and log it. */
function failure(
  row: ClaimedOutbound,
  rawReason: string,
  logger: SenderLogger,
): ProcessedRow {
  // The logger already scrubs registered secrets + Bearer material; scrub here
  // too so the reason persisted via recordResult carries no token (Req 4.6).
  const reason = scrubSecrets(rawReason, []);
  logger.error(`line-outbound-sender: ${row.outboundId} failed: ${reason}`);
  return { outboundId: row.outboundId, status: "failed", reason };
}

/** Coerce an unknown thrown value into a string without leaking structure. */
function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// ===========================================================================
// Production wiring (Supabase service context)
// ===========================================================================

/** LINE Messaging API base URL. */
const LINE_API_BASE = "https://api.line.me/v2/bot/message";

/**
 * The real LINE Messaging API client. Sends a reply or push with the resolved
 * token in the Authorization header. The token is never logged here.
 */
export function createLineMessagingClient(): LineMessagingClient {
  return {
    async send(request, accessToken) {
      const url = `${LINE_API_BASE}/${request.endpoint}`;
      const body =
        request.endpoint === "reply"
          ? { replyToken: request.replyToken, messages: request.messages }
          : { to: request.to, messages: request.messages };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return { ok: true };
      }
      // Capture a non-secret error detail. The body may echo nothing sensitive,
      // but we scrub defensively before returning.
      let detail = `LINE API responded ${res.status}`;
      try {
        const textBody = await res.text();
        if (textBody) {
          detail = `${detail}: ${textBody}`;
        }
      } catch {
        // ignore body read errors
      }
      return { ok: false, errorDetail: scrubSecrets(detail, [accessToken]) };
    },
  };
}

/**
 * Build the production dependencies from environment variables and a Supabase
 * service client. Imported lazily so the module can be unit-tested without the
 * Supabase SDK or any environment.
 */
export async function createSupabaseSenderDeps(): Promise<SenderDeps> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const { createClient } = await import(
    "https://esm.sh/@supabase/supabase-js@2"
  );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const logger = createScrubbingLogger();

  const data: SenderDataAccess = {
    async claimPending(limit) {
      // Read pending rows joined with their conversation (left join — แถว group
      // ไม่มี conversation; 0097). Template candidates and the channel token ref
      // are fetched per row. Ordered oldest-first.
      const { data: rows, error } = await client
        .from("line_oa_outbound_messages")
        .select(
          "id, conversation_id, send_type, template_key, slot_values, " +
            "target_type, target_id, " +
            "line_oa_conversations(line_user_id, vertical_context)",
        )
        .eq("status", "pending")
        .order("id", { ascending: true })
        .limit(limit);
      if (error) {
        throw new Error(error.message);
      }
      const claimed: ClaimedOutbound[] = [];
      for (const r of rows ?? []) {
        const convo = Array.isArray(r.line_oa_conversations)
          ? r.line_oa_conversations[0]
          : r.line_oa_conversations;
        const isGroup = r.target_type === "group";

        // แถว group: push ไปที่ groupId ตรง ๆ; vertical จาก line_groups (จำตอน #ผูก — 0097)
        let groupVertical: string | undefined;
        if (isGroup) {
          const { data: grp } = await client
            .from("line_groups")
            .select("vertical_context")
            .eq("line_group_id", r.target_id)
            .maybeSingle();
          groupVertical = grp?.vertical_context ?? undefined;
        }
        const verticalContext: string = isGroup
          ? (groupVertical ?? "monolith")
          : convo?.vertical_context;

        // Resolve the active channel for this vertical (centralized topology).
        const { data: channel } = await client
          .from("line_oa_channels")
          .select("channel_access_token_ref")
          .eq("vertical_context", verticalContext)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        // Candidate templates for resolution + slot substitution.
        const { data: templates } = await client
          .from("line_oa_message_templates")
          .select("template_key, vertical_context, body, is_active")
          .eq("template_key", r.template_key)
          .or(`vertical_context.eq.${verticalContext},vertical_context.is.null`);

        claimed.push({
          outboundId: r.id,
          conversationId: r.conversation_id ?? null,
          sendType: r.send_type as SendType,
          templateKey: r.template_key,
          slotValues: (r.slot_values ?? {}) as Record<string, string>,
          lineUserId: isGroup ? r.target_id : convo?.line_user_id,
          verticalContext,
          channelAccessTokenRef: channel?.channel_access_token_ref ?? "",
          candidateTemplates: (templates ?? []).map((t) => ({
            templateKey: t.template_key,
            verticalContext: t.vertical_context,
            body: t.body,
            isActive: t.is_active,
          })),
        });
      }
      return claimed;
    },

    async recordResult(outboundId, status, errorDetail) {
      const { error } = await client.rpc("rpc_record_line_send_result", {
        p_outbound_id: outboundId,
        p_status: status,
        p_error_detail: errorDetail,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };

  const vault: VaultTokenResolver = {
    async resolveAccessToken(ref) {
      if (!ref) {
        return null;
      }
      // Supabase Vault exposes decrypted secrets via vault.decrypted_secrets.
      // The ref may be a secret name or id; try by name then by id.
      const { data: byName } = await client
        .schema("vault")
        .from("decrypted_secrets")
        .select("decrypted_secret")
        .eq("name", ref)
        .limit(1)
        .maybeSingle();
      if (byName?.decrypted_secret) {
        return byName.decrypted_secret as string;
      }
      const { data: byId } = await client
        .schema("vault")
        .from("decrypted_secrets")
        .select("decrypted_secret")
        .eq("id", ref)
        .limit(1)
        .maybeSingle();
      return (byId?.decrypted_secret as string | undefined) ?? null;
    },
  };

  return { data, vault, line: createLineMessagingClient(), logger };
}

/** Read a required environment variable or throw a non-secret error. */
function requireEnv(name: string): string {
  const value = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get(name);
  if (!value) {
    throw new Error(`line-outbound-sender: missing required env var ${name}`);
  }
  return value;
}

/**
 * HTTP entrypoint. Builds the production dependencies, processes one batch, and
 * returns a non-secret JSON summary. Any unexpected error is logged (scrubbed)
 * and surfaced as a 500 with a generic message.
 */
export async function runOutboundSender(req: Request): Promise<Response> {
  const batchSize = readBatchSize(req);
  let logger: SenderLogger | undefined;
  try {
    const deps = await createSupabaseSenderDeps();
    logger = deps.logger;
    const summary = await processOutboundBatch(deps, { batchSize });
    return new Response(JSON.stringify({ status: "ok", ...summary }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = stringifyError(err);
    if (logger) {
      logger.error(`line-outbound-sender: batch error: ${message}`);
    } else {
      console.error(scrubSecrets(`line-outbound-sender: batch error: ${message}`, []));
    }
    return new Response(
      JSON.stringify({ status: "error", error: "outbound batch failed" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

/** Parse an optional `batchSize` query param (default 25, clamped 1..100). */
function readBatchSize(req: Request): number {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("batchSize");
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) {
        return Math.min(100, Math.max(1, n));
      }
    }
  } catch {
    // ignore malformed URL; fall through to default
  }
  return 25;
}

// Deno Deploy / Supabase Edge runtime entrypoint.
// Guarded so the module can be imported by tests without starting a server.
if (typeof Deno !== "undefined" && import.meta.main) {
  Deno.serve(runOutboundSender);
}

// Minimal ambient declaration so this module type-checks outside the Deno
// runtime (e.g. editors using the Node/TS toolchain). Replaced by Deno's
// built-in types when deployed.
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get(key: string): string | undefined };
} & Record<string, unknown>;

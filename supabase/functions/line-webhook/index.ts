// Edge Function: line-webhook
// Feature: line-oa-commerce (Module B5)
// Spec task: 19.1 — Implement the line-webhook Edge Function
//
// Public HTTP boundary for inbound LINE webhooks. This function:
//   * reads the raw request body and the `x-line-signature` header,
//   * derives `channel_identifier` from the route/destination,
//   * forwards (raw_body, signature, channel_identifier) into the
//     `rpc_ingest_line_webhook` SECURITY DEFINER RPC, which performs the
//     cryptographic signature verification using the Vault-resolved secret and
//     all persistence in a single transaction.
//
// Trust boundary (Req 1.2, 1.3, 1.4, 2.2):
//   * This function holds NO LINE channel secrets (Channel_Secret /
//     Channel_Access_Token) and performs NO verification or business logic.
//     Signature verification, idempotency, routing, identity resolution and
//     auditing all happen inside `rpc_ingest_line_webhook`.
//   * The only credential it carries is the Supabase platform connection
//     (SUPABASE_URL + service-role key, read from the environment) used to
//     invoke the RPC server-side. The client never talks to LINE.
//
// Response mapping:
//   * 200 — verified delivery accepted, including idempotent duplicate-ack.
//   * 401 — missing / invalid LINE signature (rejected by the RPC).
//   * 404 — channel_identifier cannot be resolved to a configured channel.
//   * 400 — channel_identifier could not be derived, malformed payload, or
//           any other ingestion rejection.
//   * 405 — non-POST method.

// ---------------------------------------------------------------------------
// RPC contract (see supabase/migrations/00000000000022_line_oa_ingest_webhook.sql)
// ---------------------------------------------------------------------------

/** The OUT record returned by `public.rpc_ingest_line_webhook`. */
export interface IngestResult {
  accepted: boolean;
  reason: string | null;
  events_processed?: number;
  events_duplicate?: number;
  events_skipped?: number;
}

/** Minimal shape of a PostgREST / postgres error surfaced by the client. */
export interface IngestError {
  code?: string;
  message?: string;
}

/** Arguments forwarded verbatim into the ingestion RPC. */
export interface IngestArgs {
  raw_body: string;
  signature: string;
  channel_identifier: string;
}

/**
 * Forwards a webhook delivery into `rpc_ingest_line_webhook`. Abstracted so the
 * pure request-handling logic can be exercised without a live database (tasks
 * 19.2 / 19.4 supply the integration wiring).
 */
export type IngestFn = (
  args: IngestArgs,
) => Promise<{ data: IngestResult | null; error: IngestError | null }>;

// ---------------------------------------------------------------------------
// Request handler (pure transport logic, no secrets, no verification)
// ---------------------------------------------------------------------------

/**
 * Public webhook entrypoint.
 *
 * Reads the raw body + `x-line-signature`, derives the `channel_identifier`,
 * and forwards everything to the ingestion RPC. The RPC is the sole authority
 * for verification, persistence, and auditing.
 *
 * @param req    incoming webhook request from the LINE Messaging API
 * @param ingest RPC forwarder (defaults to the Supabase service-role client)
 */
export async function handleLineWebhook(
  req: Request,
  ingest: IngestFn = defaultIngest,
): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // The signature is forwarded as-is (empty string when absent) so the RPC is
  // the single place that rejects and audits missing/invalid signatures.
  const signature = req.headers.get("x-line-signature") ?? "";

  // Read the EXACT raw body once; it must reach the RPC byte-for-byte so the
  // HMAC verification inside the database matches what LINE signed.
  const rawBody = await req.text();

  const channelIdentifier = deriveChannelIdentifier(req, rawBody);
  if (channelIdentifier === null) {
    return json(400, { error: "unresolved_channel_identifier" });
  }

  const { data, error } = await ingest({
    raw_body: rawBody,
    signature,
    channel_identifier: channelIdentifier,
  });

  if (error !== null) {
    // The RPC raises (errcode P0002) for an unknown/inactive channel, carrying
    // no secret in its message (Req 1.6).
    if (error.code === "P0002") {
      return json(404, { error: "channel_not_found" });
    }
    return json(400, { error: "ingest_error" });
  }

  if (data === null) {
    return json(502, { error: "no_result" });
  }

  if (data.accepted) {
    // Includes first-time acceptance and idempotent duplicate-ack (Req 2.2).
    return json(200, { status: "accepted" });
  }

  // Rejected by the RPC. Missing/invalid signature is an auth failure (401);
  // everything else (e.g. malformed payload) is a 400.
  if (data.reason === "signature_invalid") {
    return json(401, { error: "signature_invalid" });
  }
  return json(400, { error: data.reason ?? "rejected" });
}

/**
 * Derives the receiving `channel_identifier` from the route or the LINE
 * `destination`, without consuming or mutating the raw body.
 *
 * Resolution order:
 *   1. Path segment after `line-webhook` (e.g. `/line-webhook/{channel}`).
 *   2. `?channel=` / `?channel_identifier=` query parameter.
 *   3. The LINE `destination` field (the bot's user id) in the payload.
 *
 * Returns `null` when no identifier can be derived. Reading `destination` is a
 * read-only routing lookup, not business logic — verification still happens in
 * the RPC against the untouched raw body.
 */
export function deriveChannelIdentifier(
  req: Request,
  rawBody: string,
): string | null {
  const url = new URL(req.url);

  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  const idx = segments.lastIndexOf("line-webhook");
  if (idx >= 0 && idx + 1 < segments.length) {
    const seg = segments[idx + 1];
    if (seg.length > 0) {
      return decodeURIComponent(seg);
    }
  }

  const queryValue = url.searchParams.get("channel") ??
    url.searchParams.get("channel_identifier");
  if (queryValue !== null && queryValue.length > 0) {
    return queryValue;
  }

  const destination = readDestination(rawBody);
  if (destination !== null && destination.length > 0) {
    return destination;
  }

  return null;
}

/** Safely extracts the LINE `destination` from the raw body (read-only). */
function readDestination(rawBody: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed !== null && typeof parsed === "object" && "destination" in parsed) {
      const value = (parsed as { destination?: unknown }).destination;
      if (typeof value === "string") {
        return value;
      }
    }
  } catch {
    // Not JSON / malformed: leave channel derivation to the route, and let the
    // RPC reject a malformed payload after signature verification.
  }
  return null;
}

// ---------------------------------------------------------------------------
// Default RPC forwarder (Supabase service-role client)
// ---------------------------------------------------------------------------

/** Production forwarder: invokes the ingestion RPC via PostgREST over fetch.
 *  No third-party client dependency — `fetch` is native to the Deno edge
 *  runtime, avoiding remote-module resolution failures at deploy time. */
const defaultIngest: IngestFn = async (args) => {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/rpc_ingest_line_webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      p_raw_body: args.raw_body,
      p_signature: args.signature,
      p_channel_identifier: args.channel_identifier,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as IngestError;
    return { data: null, error: { code: err.code, message: err.message } };
  }
  return { data: normalizeResult(await res.json()), error: null };
};

/** Normalizes the RPC payload (object or single-element array) to one record. */
function normalizeResult(data: unknown): IngestResult | null {
  if (data === null || data === undefined) {
    return null;
  }
  const record = Array.isArray(data) ? data[0] : data;
  if (record === null || record === undefined || typeof record !== "object") {
    return null;
  }
  return record as IngestResult;
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
// imported by tests without starting a server.
if (typeof Deno !== "undefined") {
  // Wrap so Deno.serve's 2nd arg (ServeHandlerInfo) does not clobber the
  // handler's defaulted `ingest` parameter.
  Deno.serve((req) => handleLineWebhook(req));
}

// Minimal ambient declaration so this module type-checks outside the Deno
// runtime (e.g. in editors using the Node/TS toolchain). Replaced by Deno's
// built-in types when deployed.
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

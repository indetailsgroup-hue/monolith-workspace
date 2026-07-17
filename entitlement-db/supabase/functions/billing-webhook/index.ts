// Edge Function: billing-webhook (MONOLITH Entitlement DB — separate project, ADR-034)
// Feature: entitlement-tier Phase 2.1 — provider webhook → subscriptions (service role)
//
// Two provider modes (spec task 2.1 "Stripe (หรือ manual)"):
//   BILLING_WEBHOOK_PROVIDER = "stripe": verifies the `stripe-signature` header
//     (t=<unix>,v1=<hmac-sha256(t + "." + rawBody, secret)>, 5-minute tolerance,
//     constant-time compare) then maps the event to the DB contract.
//   BILLING_WEBHOOK_PROVIDER = "manual": Authorization: Bearer <secret> + a direct
//     JSON contract — the no-Stripe path for early tenants / internal ops.
//
// Thin transport: ALL writes go through the two service-role-only RPCs
// (billing_apply_subscription / billing_reset_usage, SSOT v0.3.2 [F6]) so the DB
// stays the last gate. Idempotent by construction: apply is an upsert keyed by
// org_id; reset only clears the current period — provider retries are safe.
//
// Deployment to a real project is human-driven only (ADR-066).

export interface RpcError { code?: string; message?: string }

export interface BillingDeps {
  applySubscription: (a: {
    orgId: string; planCode: string; status: string;
    periodStart: string; periodEnd: string | null;
    provider?: string; providerCustomerId?: string; providerSubId?: string;
  }) => Promise<{ error: RpcError | null }>;
  resetUsage: (orgId: string) => Promise<{ error: RpcError | null }>;
  /** injectable clock (ms epoch) so signature-tolerance tests are deterministic */
  nowMs: () => number;
}

export interface BillingConfig {
  provider: "stripe" | "manual";
  secret: string;
}

const SUB_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "paused"]);

/** Stripe subscription.status → public.sub_status (conservative; unknown = not provisionable) */
export function mapStripeStatus(s: string): string | null {
  switch (s) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "unpaid": return "past_due";
    case "canceled": return "canceled";
    case "paused": return "paused";
    default: return null; // incomplete / incomplete_expired / unknown → do not provision
  }
}

export type MappedEvent =
  | { kind: "apply"; apply: Parameters<BillingDeps["applySubscription"]>[0] }
  | { kind: "reset"; orgId: string }
  | { kind: "ignore"; reason: string }
  | { kind: "error"; status: number; code: string };

/** Pure mapping from a Stripe event envelope to the DB contract. org_id + plan_code
 *  must ride in subscription metadata (set at Checkout) — no metadata, no write. */
export function mapStripeEvent(evt: Record<string, unknown>): MappedEvent {
  const type = typeof evt?.type === "string" ? evt.type : "";
  const obj = ((evt?.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;

  const subscriptionEvents = new Set([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]);
  if (!subscriptionEvents.has(type) && type !== "invoice.paid") {
    return { kind: "ignore", reason: `unhandled_event:${type || "unknown"}` };
  }

  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  const orgId = typeof meta.org_id === "string" ? meta.org_id : null;
  if (orgId === null) return { kind: "error", status: 422, code: "missing_metadata_org_id" };

  if (type === "invoice.paid") {
    // New billing period paid → reset current-period usage (task 2.2); period data
    // rides on the subscription events, so invoice.paid is reset-only.
    return { kind: "reset", orgId };
  }

  const planCode = typeof meta.plan_code === "string" ? meta.plan_code : null;
  if (planCode === null) return { kind: "error", status: 422, code: "missing_metadata_plan_code" };

  const rawStatus = type === "customer.subscription.deleted"
    ? "canceled"
    : (typeof obj.status === "string" ? obj.status : "");
  const status = mapStripeStatus(rawStatus);
  if (status === null) return { kind: "ignore", reason: `unprovisionable_status:${rawStatus}` };

  const toIso = (v: unknown): string | null =>
    typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;
  const periodStart = toIso(obj.current_period_start);
  const periodEnd = toIso(obj.current_period_end);
  if (periodStart === null) return { kind: "error", status: 422, code: "missing_period" };

  return {
    kind: "apply",
    apply: {
      orgId, planCode, status, periodStart, periodEnd,
      provider: "stripe",
      providerCustomerId: typeof obj.customer === "string" ? obj.customer : undefined,
      providerSubId: typeof obj.id === "string" ? obj.id : undefined,
    },
  };
}

/** Stripe signature scheme: `stripe-signature: t=<unix>,v1=<hex>` over `${t}.${raw}` */
export async function verifyStripeSignature(
  rawBody: string, header: string | null, secret: string, nowMs: number, toleranceSec = 300,
): Promise<boolean> {
  if (header === null || header === "") return false;
  const parts = new Map<string, string[]>();
  for (const kv of header.split(",")) {
    const i = kv.indexOf("=");
    if (i <= 0) continue;
    const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim();
    parts.set(k, [...(parts.get(k) ?? []), v]);
  }
  const t = parts.get("t")?.[0];
  const v1s = parts.get("v1") ?? [];
  if (t === undefined || v1s.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSec) return false;

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return v1s.some((v) => timingSafeEqualHex(v, expected));
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface ManualBody {
  org_id: string; plan_code: string; status: string;
  current_period_start: string; current_period_end?: string | null;
  reset_usage?: boolean;
}

function validManualBody(b: unknown): b is ManualBody {
  const x = b as ManualBody;
  return typeof x?.org_id === "string" && typeof x?.plan_code === "string"
    && typeof x?.status === "string" && SUB_STATUSES.has(x.status)
    && typeof x?.current_period_start === "string";
}

function rpcStatus(error: RpcError): number {
  switch (error.code) {
    case "insufficient_privilege": return 500; // service key missing/miswired — our fault, not caller's
    case "foreign_key_violation": return 422;  // unknown_plan
    default: return 500;
  }
}

export async function handleBillingWebhook(
  req: Request, deps: BillingDeps, cfg: BillingConfig,
): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (cfg.secret === "") return json(500, { error: "webhook_secret_not_configured" }); // fail closed
  const raw = await req.text();

  if (cfg.provider === "stripe") {
    const okSig = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), cfg.secret, deps.nowMs());
    if (!okSig) return json(401, { error: "invalid_signature" });

    let evt: Record<string, unknown>;
    try { evt = JSON.parse(raw) as Record<string, unknown>; } catch { return json(400, { error: "invalid_json" }); }

    const mapped = mapStripeEvent(evt);
    if (mapped.kind === "ignore") return json(200, { ignored: true, reason: mapped.reason });
    if (mapped.kind === "error") return json(mapped.status, { error: mapped.code });

    if (mapped.kind === "reset") {
      const r = await deps.resetUsage(mapped.orgId);
      if (r.error !== null) return json(rpcStatus(r.error), { error: "reset_failed", code: r.error.code });
      return json(200, { applied: true, reset: true });
    }
    const a = await deps.applySubscription(mapped.apply);
    if (a.error !== null) return json(rpcStatus(a.error), { error: "apply_failed", code: a.error.code });
    return json(200, { applied: true });
  }

  // manual mode
  const auth = req.headers.get("authorization") ?? "";
  if (!timingSafeEqualHex(auth, `Bearer ${cfg.secret}`)) return json(401, { error: "invalid_token" });

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid_json" }); }
  if (!validManualBody(body)) return json(422, { error: "invalid_payload" });

  const a = await deps.applySubscription({
    orgId: body.org_id, planCode: body.plan_code, status: body.status,
    periodStart: body.current_period_start, periodEnd: body.current_period_end ?? null,
    provider: "manual",
  });
  if (a.error !== null) return json(rpcStatus(a.error), { error: "apply_failed", code: a.error.code });

  if (body.reset_usage === true) {
    const r = await deps.resetUsage(body.org_id);
    if (r.error !== null) return json(rpcStatus(r.error), { error: "reset_failed", code: r.error.code });
    return json(200, { applied: true, reset: true });
  }
  return json(200, { applied: true });
}

// ---------------------------------------------------------------- default wiring
interface RpcClient { rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
let cachedClient: RpcClient | null = null;
async function getServiceClient(): Promise<RpcClient> {
  if (cachedClient !== null) return cachedClient;
  const mod = await import("npm:@supabase/supabase-js@2");
  cachedClient = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } },
  );
  return cachedClient;
}

export function defaultDeps(): BillingDeps {
  return {
    applySubscription: async (a) => {
      const c = await getServiceClient();
      const { error } = await c.rpc("billing_apply_subscription", {
        p_org: a.orgId, p_plan_code: a.planCode, p_status: a.status,
        p_period_start: a.periodStart, p_period_end: a.periodEnd,
        p_provider: a.provider ?? null,
        p_provider_customer_id: a.providerCustomerId ?? null,
        p_provider_sub_id: a.providerSubId ?? null,
      });
      return { error: (error as RpcError | null) ?? null };
    },
    resetUsage: async (orgId) => {
      const c = await getServiceClient();
      const { error } = await c.rpc("billing_reset_usage", { p_org: orgId });
      return { error: (error as RpcError | null) ?? null };
    },
    nowMs: () => Date.now(),
  };
}

export function defaultConfig(): BillingConfig {
  const provider = getEnv("BILLING_WEBHOOK_PROVIDER", "manual");
  return {
    provider: provider === "stripe" ? "stripe" : "manual",
    secret: provider === "stripe"
      ? getEnv("STRIPE_WEBHOOK_SECRET", "")
      : getEnv("BILLING_WEBHOOK_SECRET", ""),
  };
}

function getEnv(name: string, fallback?: string): string {
  const v = (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name);
  if (v !== undefined) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing env: ${name}`);
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Deno entrypoint (not executed under vitest)
if ((globalThis as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno?.serve !== undefined) {
  (globalThis as unknown as { Deno: { serve: (h: (r: Request) => Promise<Response>) => void } })
    .Deno.serve((req) => handleBillingWebhook(req, defaultDeps(), defaultConfig()));
}

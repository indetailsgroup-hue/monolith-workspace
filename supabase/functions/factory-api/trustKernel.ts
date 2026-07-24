// trustKernel.ts — user-token V3 Edge transport for the Production Trust Kernel
// (plan Task 5; design §7.2 verified-action-context / service-role boundary, §10
// release choreography). Deno Edge Function surface, but written as a PURE,
// dependency-injected transport handler so it is unit-testable under vitest with
// no DB/network: `index.ts` constructs the real Supabase adapters and passes them
// in as `TrustKernelDeps`.
//
// Security invariants encoded here (not delegated to the DB):
//   - The handler NEVER accepts a client-supplied actor role/name/tenant/site.
//     Only per-action content/authorization hashes survive `filterActionBody`.
//   - `createActionContext` receives the INCOMING user bearer; the service-role
//     key is never substituted for a user-authority operation.
//   - Service-role helpers are reserved for downstream worker/outbox work and
//     reject any user-authority operation (`assertWorkerServiceOperation`).
//   - RELEASE is never queued offline / auto-replayed: an offline-replay marker
//     is refused before any authority is created (design §10.5, §constraint 27).
//
// Phase: NOT_FOR_PRODUCTION.

// ---------------------------------------------------------------------------
// Reason-code vocabulary (local mirror of the canonical registry at
// server/src/trust-kernel/reasonCodes.ts, §13). Kept local so this Deno edge
// module stays self-contained; adding a code there is a versioned change that
// must be mirrored here and in HTTP_STATUS_BY_REASON.
// ---------------------------------------------------------------------------
export type TrustReasonCode =
  // AUTH
  | "AUTH_REQUIRED"
  | "AUTH_ANON_NOT_ALLOWED"
  | "AUTH_MEMBERSHIP_REVOKED"
  | "AUTH_SCOPE_DENIED"
  | "AUTH_SOD_VIOLATION"
  | "AUTH_ACTION_CONTEXT_INVALID"
  | "AUTH_ACTION_CONTEXT_EXPIRED"
  // STATE
  | "STATE_CANDIDATE_STALE"
  | "STATE_RELEASE_AUTHORIZATION_STALE"
  | "STATE_CONFLICT"
  | "STATE_RELEASE_REVOKED"
  | "STATE_IDEMPOTENCY_MISMATCH"
  // GATE
  | "GATE_HARD_BLOCKER"
  | "GATE_WARNING_EXCEPTION_EXPIRED"
  | "GATE_WARNING_EXCEPTION_MISMATCH"
  // CAP
  | "CAP_UNKNOWN_TOOL"
  | "CAP_UNSUPPORTED_OPERATION"
  | "CAP_PROFILE_MISMATCH"
  | "CAP_PROFILE_ATTESTATION_INVALID"
  | "CAP_PROFILE_ATTESTATION_EXPIRED"
  | "CAP_PARAMETER_RANGE"
  // PACKET
  | "PACKET_SCHEMA_UNSUPPORTED"
  | "PACKET_HASH_MISMATCH"
  | "PACKET_EXTRA_FILE"
  | "PACKET_RESOURCE_LIMIT"
  // CRYPTO
  | "CRYPTO_SIGNER_UNAVAILABLE"
  | "CRYPTO_SIGNATURE_INVALID"
  | "CRYPTO_ALGORITHM_DENIED"
  // TRUST
  | "TRUST_BUNDLE_EXPIRED"
  | "TRUST_SEQUENCE_ROLLBACK"
  | "TRUST_SCOPE_MISMATCH"
  | "TRUST_CLOCK_UNAVAILABLE"
  | "TRUST_CHECKPOINT_REQUIRED"
  | "TRUST_FRESHNESS_UNPROVEN"
  // STORE
  | "STORE_QUARANTINE_FAILED"
  | "STORE_HASH_MISMATCH"
  | "STORE_ARTIFACT_UNAVAILABLE"
  | "STORE_PLAINTEXT_ACCESS_DENIED"
  // SAFETY (versioned addition — deny-only content-revocation registry)
  | "SAFETY_CONTENT_REVOKED"
  | "SAFETY_CONTENT_BLOCKED"
  | "SAFETY_CONTENT_UNBLOCKED";

/** Typed Trust Kernel result mirroring server/src/trust-kernel/result.ts. */
export type TrustResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TrustReasonCode; detail?: Readonly<Record<string, string>> };

/** User-authority actions the transport creates a context for (design §10). */
export type PermittedAction = "FREEZE" | "RELEASE" | "REVOKE";

// ---------------------------------------------------------------------------
// Dependency seam (constructed with real Supabase clients in index.ts)
// ---------------------------------------------------------------------------

/** Filtered, actor-authority-free input the transport hands to the DB layer. */
export interface UserActionInput {
  /** The INCOMING Authorization header, forwarded verbatim (never a service key). */
  bearer: string;
  action: PermittedAction;
  /** Business id from the path (:id); a job/candidate/revision selector, not authority. */
  resourceId: string;
  candidateHash?: string;
  releaseAuthorizationHash?: string;
  idempotencyKey?: string;
  requestHash?: string;
  snapshotHash?: string;
  gateInputsHash?: string;
  machineProfileHash?: string;
  attestationId?: string;
  attestationHash?: string;
  policyVersion?: string;
  reason?: string;
  /** Required revocation reason class for REVOKE (migration 0185; design §10.4). */
  reasonClass?: string;
}

export interface AuthorityRequest extends Omit<UserActionInput, "action"> {
  kind: PermittedAction | "STATUS";
  /** The action-context id returned by createActionContext (mutations only). */
  contextId?: string;
}

/** Server projection returned to the client; never carries P2 plaintext/locators. */
export interface AuthorityResponse {
  status: string;
  [k: string]: unknown;
}

export type TrustKernelDeps = Readonly<{
  createActionContext(input: UserActionInput): Promise<TrustResult<{ contextId: string }>>;
  invokeAuthority(input: AuthorityRequest): Promise<TrustResult<AuthorityResponse>>;
}>;

// ---------------------------------------------------------------------------
// Deterministic HTTP ↔ reason-code mapping (design §13). Every stable code has
// an explicit status; an unknown string (protocol drift) fails closed to 500.
// ---------------------------------------------------------------------------
const HTTP_STATUS_BY_REASON: Readonly<Record<TrustReasonCode, number>> = {
  AUTH_REQUIRED: 401,
  AUTH_ANON_NOT_ALLOWED: 401,
  AUTH_ACTION_CONTEXT_INVALID: 401,
  AUTH_ACTION_CONTEXT_EXPIRED: 401,
  AUTH_MEMBERSHIP_REVOKED: 403,
  AUTH_SCOPE_DENIED: 403,
  AUTH_SOD_VIOLATION: 403,
  STATE_CANDIDATE_STALE: 409,
  STATE_RELEASE_AUTHORIZATION_STALE: 409,
  STATE_CONFLICT: 409,
  STATE_RELEASE_REVOKED: 409,
  STATE_IDEMPOTENCY_MISMATCH: 409,
  GATE_HARD_BLOCKER: 403,
  GATE_WARNING_EXCEPTION_EXPIRED: 403,
  GATE_WARNING_EXCEPTION_MISMATCH: 403,
  CAP_UNKNOWN_TOOL: 422,
  CAP_UNSUPPORTED_OPERATION: 422,
  CAP_PROFILE_MISMATCH: 422,
  CAP_PROFILE_ATTESTATION_INVALID: 422,
  CAP_PROFILE_ATTESTATION_EXPIRED: 422,
  CAP_PARAMETER_RANGE: 422,
  PACKET_SCHEMA_UNSUPPORTED: 422,
  PACKET_HASH_MISMATCH: 422,
  PACKET_EXTRA_FILE: 422,
  PACKET_RESOURCE_LIMIT: 413,
  CRYPTO_SIGNER_UNAVAILABLE: 503,
  CRYPTO_SIGNATURE_INVALID: 502,
  CRYPTO_ALGORITHM_DENIED: 400,
  TRUST_BUNDLE_EXPIRED: 409,
  TRUST_SEQUENCE_ROLLBACK: 409,
  TRUST_SCOPE_MISMATCH: 403,
  TRUST_CLOCK_UNAVAILABLE: 503,
  TRUST_CHECKPOINT_REQUIRED: 409,
  TRUST_FRESHNESS_UNPROVEN: 409,
  STORE_QUARANTINE_FAILED: 500,
  STORE_HASH_MISMATCH: 500,
  STORE_ARTIFACT_UNAVAILABLE: 409,
  STORE_PLAINTEXT_ACCESS_DENIED: 403,
  // SAFETY — content-revocation registry (design §10.4 upgrade). REVOKED is the
  // client-visible outcome when a BLOCKED content_hash is refused at commit_release
  // → 409 Conflict. BLOCKED/UNBLOCKED are internal audit/event codes; they receive an
  // explicit 409 too so httpStatusForReason never falls through to the 500 default.
  SAFETY_CONTENT_REVOKED: 409,
  SAFETY_CONTENT_BLOCKED: 409,
  SAFETY_CONTENT_UNBLOCKED: 409,
};

/** Map a stable reason code to its HTTP status; unknown codes fail closed to 500. */
export function httpStatusForReason(code: TrustReasonCode): number {
  return HTTP_STATUS_BY_REASON[code] ?? 500;
}

// ---------------------------------------------------------------------------
// Per-action request-body allow-lists. Anything not listed — actor role/name,
// tenant/site, and any spoof field — is dropped before it can reach the DB.
// Values must be strings; a non-string smuggled under an allowed key is dropped.
// ---------------------------------------------------------------------------
const ALLOWED_BODY_FIELDS: Readonly<Record<PermittedAction, readonly string[]>> = {
  // §10.1: freeze carries the frozen candidate's content hashes + attestation.
  FREEZE: [
    "candidateHash",
    "snapshotHash",
    "gateInputsHash",
    "machineProfileHash",
    "attestationId",
    "attestationHash",
    "policyVersion",
    "requestHash",
  ],
  // §10.2: release carries exactly candidate / release-authorization / idempotency
  // / request hashes (plan Task 5 binding).
  RELEASE: ["candidateHash", "releaseAuthorizationHash", "idempotencyKey", "requestHash"],
  // §10.4: revoke carries a reason and its required reason class (migration 0185);
  // its request hash is derived server-side.
  REVOKE: ["reason", "reasonClass"],
};

/** Keep only the allow-listed string fields for `action`; drop everything else. */
export function filterActionBody(action: PermittedAction, body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALLOWED_BODY_FIELDS[action]) {
    const v = body[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Service-role containment (design §7.2). Downstream worker/outbox operations
// only; a service-role client can never mint or perform human authority.
// ---------------------------------------------------------------------------
export const WORKER_SERVICE_OPERATIONS = [
  "DRAIN_OUTBOX",
  "MATERIALIZE_ARTIFACT",
  "MARK_ARTIFACT_AVAILABLE",
  "VOID_ARTIFACT",
] as const;
export type WorkerServiceOperation = (typeof WORKER_SERVICE_OPERATIONS)[number];

/** A service-role client may run ONLY these worker ops; user authority is denied. */
export function assertWorkerServiceOperation(op: string): TrustResult<WorkerServiceOperation> {
  if ((WORKER_SERVICE_OPERATIONS as readonly string[]).includes(op)) {
    return { ok: true, value: op as WorkerServiceOperation };
  }
  return {
    ok: false,
    code: "AUTH_SCOPE_DENIED",
    detail: { op, boundary: "service-role helpers are reserved for worker/outbox work (§7.2)" },
  };
}

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

function fail(code: TrustReasonCode, detail?: Readonly<Record<string, string>>): Response {
  return json(httpStatusForReason(code), { ok: false, reason: code, detail });
}

/** Extract a well-formed bearer token; null if missing or not a Bearer scheme. */
function readBearer(req: Request): string | null {
  const raw = req.headers.get("authorization");
  if (!raw || !/^Bearer\s+\S+/i.test(raw)) return null;
  return raw;
}

/** RELEASE (and every mutation) is never queued offline or auto-replayed (§10.5). */
function hasOfflineReplayMarker(req: Request): boolean {
  const marker = req.headers.get("x-trust-offline-replay") ?? req.headers.get("x-offline-replay");
  return marker !== null && marker.trim().length > 0;
}

const PATH_ACTION: Readonly<Record<string, PermittedAction>> = {
  freeze: "FREEZE",
  release: "RELEASE",
  revoke: "REVOKE",
};

// ---------------------------------------------------------------------------
// The pure transport handler
// ---------------------------------------------------------------------------
export async function handleTrustKernelRequest(req: Request, deps: TrustKernelDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const segments = new URL(req.url).pathname.split("/").filter((s) => s.length > 0);
  const v3 = segments.indexOf("v3");
  if (v3 < 0 || segments[v3 + 1] !== "factory") {
    return json(404, { ok: false, error: "unknown route" });
  }
  const collection = segments[v3 + 2];
  const resourceId = segments[v3 + 3] ? decodeURIComponent(segments[v3 + 3]) : "";
  const tail = segments[v3 + 4] ?? "";

  try {
    if (collection === "jobs") {
      const action = PATH_ACTION[tail];
      if (!action) return json(404, { ok: false, error: "unknown route" });
      if (req.method !== "POST") return json(405, { ok: false, error: "method not allowed" });
      return await handleMutation(req, deps, action, resourceId);
    }
    if (collection === "releases" && tail === "status") {
      if (req.method !== "GET") return json(405, { ok: false, error: "method not allowed" });
      return await handleStatus(req, deps, resourceId);
    }
    return json(404, { ok: false, error: "unknown route" });
  } catch (e) {
    // Deps are expected to return TrustResult; an unexpected throw is fail-closed.
    console.error(`trust-kernel transport: ${String(e)}`);
    return json(500, { ok: false, error: "trust-kernel internal error" });
  }
}

async function handleMutation(
  req: Request,
  deps: TrustKernelDeps,
  action: PermittedAction,
  resourceId: string,
): Promise<Response> {
  const bearer = readBearer(req);
  if (bearer === null) return fail("AUTH_REQUIRED", { detail: "a user bearer token is required" });

  // Refuse an offline-replayed authority request before any context is created.
  if (hasOfflineReplayMarker(req)) {
    return fail("TRUST_FRESHNESS_UNPROVEN", {
      detail: "RELEASE cannot be queued offline or auto-replayed (§10.5)",
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, reason: "INVALID_JSON", error: "request body is not valid JSON" });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return json(400, { ok: false, reason: "INVALID_JSON", error: "request body must be a JSON object" });
  }

  const filtered = filterActionBody(action, raw as Record<string, unknown>);
  const input: UserActionInput = { bearer, action, resourceId, ...filtered };

  const ctx = await deps.createActionContext(input);
  if (!ctx.ok) return fail(ctx.code, ctx.detail);

  const authority = await deps.invokeAuthority({
    kind: action,
    bearer,
    resourceId,
    contextId: ctx.value.contextId,
    ...filtered,
  });
  if (!authority.ok) return fail(authority.code, authority.detail);

  // 202: the user-authorized record exists; deterministic build/materialization
  // is finished asynchronously by the service worker (design §10.2 steps 4–10).
  return json(202, { ok: true, ...authority.value });
}

async function handleStatus(req: Request, deps: TrustKernelDeps, resourceId: string): Promise<Response> {
  const bearer = readBearer(req);
  if (bearer === null) return fail("AUTH_REQUIRED", { detail: "a user bearer token is required" });

  // A user-scoped read projection; no action context, no service role.
  const res = await deps.invokeAuthority({ kind: "STATUS", bearer, resourceId });
  if (!res.ok) return fail(res.code, res.detail);
  return json(200, { ok: true, ...res.value });
}

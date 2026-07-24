// Edge Function: factory-api (ADR-060 — P10/P11/P12 Factory State Server)
// S17-1: end-user identity and authorization are derived only from a verified JWT.
// S17-2: every packet/output path is RELEASED-only at both Edge and SQL boundaries.

export type FactoryCapability = "DESIGNER" | "FACTORY" | "INSTALLER" | "FINANCE" | "ADMIN";

export interface ServerActor {
  subjectId: string;
  name: string;
  /** Exact, server-verified app_metadata.roles values (deduplicated and byte-sorted). */
  roles: string[];
  /** Exact, server-verified app_metadata.site_codes values (deduplicated and byte-sorted). */
  siteCodes: string[];
  capabilities: FactoryCapability[];
  authorizationContextId: string;
}

export interface FactoryApiDeps {
  authenticate: (authorization: string) => Promise<ServerActor>;
  callRpc: (fn: string, body: Record<string, unknown>) => Promise<unknown>;
  // storagePut/storageSign are REMOVED (Task 11 §9/§15): no client packet upload
  // and no reusable signed URL. Only the internal hash-verify read remains.
  storageGet: (path: string) => Promise<Uint8Array>;
}

export class FactoryAuthenticationError extends Error {
  constructor(message = "invalid authorization") {
    super(message);
    this.name = "FactoryAuthenticationError";
  }
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  // Actor headers are intentionally absent: caller-supplied identity is not part of the contract.
  "access-control-allow-headers": "authorization, apikey, content-type",
};

// State availability is operationally useful to all recognized roles. Evidence
// surfaces are narrower because activity/proof expose other actors and lineage.
const STATE_READ_CAPABILITIES: readonly FactoryCapability[] = [
  "ADMIN", "DESIGNER", "FACTORY", "INSTALLER", "FINANCE",
];
const EVIDENCE_READ_CAPABILITIES: readonly FactoryCapability[] = [
  "ADMIN", "DESIGNER", "FACTORY",
];
const DESIGN_CAPABILITIES: readonly FactoryCapability[] = ["ADMIN", "DESIGNER"];
const FACTORY_CAPABILITIES: readonly FactoryCapability[] = ["ADMIN", "FACTORY"];

// JWT role vocabulary is lower-case in C12. Upper-case entries preserve compatibility
// with already-issued MONOLITH role claims; every value is still signed server metadata.
const CLAIM_CAPABILITY: Readonly<Record<string, FactoryCapability>> = {
  designer: "DESIGNER",
  DESIGNER: "DESIGNER",
  factory: "FACTORY",
  factory_operator: "FACTORY",
  FACTORY: "FACTORY",
  installer: "INSTALLER",
  INSTALLER: "INSTALLER",
  finance: "FINANCE",
  FINANCE: "FINANCE",
  admin: "ADMIN",
  operations: "ADMIN",
  executive_owner: "ADMIN",
  ADMIN: "ADMIN",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
// ADR-060 → Production Trust Kernel (plan Task 5): the versioned /v3/factory
// surface is the sole USER-AUTHORIZED release authority. It runs through the
// pure, injectable transport handler in ./trustKernel.ts on the caller's bearer
// + SUPABASE_ANON_KEY; SUPABASE_SERVICE_ROLE_KEY is NEVER used on that path.

import {
  handleTrustKernelRequest,
  assertWorkerServiceOperation,
  type TrustKernelDeps,
  type TrustResult,
  type TrustReasonCode,
  type UserActionInput,
  type AuthorityRequest,
  type AuthorityResponse,
  type PermittedAction,
} from "./trustKernel.ts";

function getEnv(key: string): string {
  const value = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function byteCompare(a: string, b: string): number {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const length = Math.min(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return aa.length - bb.length;
}

function verifiedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const values = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return [...new Set(values)].sort(byteCompare);
}

function parseBearerToken(authorization: string): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the identity used by factory routes from a user object returned by Supabase Auth.
 * Only app_metadata.roles and app_metadata.site_codes are authority-bearing.
 */
export async function deriveServerActor(verifiedUser: unknown): Promise<ServerActor> {
  if (!isRecord(verifiedUser) || typeof verifiedUser.id !== "string" || verifiedUser.id.length === 0) {
    throw new FactoryAuthenticationError();
  }
  const appMetadata = isRecord(verifiedUser.app_metadata) ? verifiedUser.app_metadata : {};
  const roles = verifiedStringArray(appMetadata.roles);
  const siteCodes = verifiedStringArray(appMetadata.site_codes);
  const capabilities = [...new Set(roles.map((role) => CLAIM_CAPABILITY[role]).filter(
    (role): role is FactoryCapability => role !== undefined,
  ))].sort(byteCompare) as FactoryCapability[];
  // Privacy decision F-4: actor_name is a compatibility/display field, not an
  // authority input. Persist the verified subject instead of email PII.
  const name = verifiedUser.id;
  const canonicalContext = JSON.stringify({
    actorSubjectId: verifiedUser.id,
    roles,
    siteCodes,
  });
  const authorizationContextId = await sha256Hex(new TextEncoder().encode(canonicalContext));
  return {
    subjectId: verifiedUser.id,
    name,
    roles,
    siteCodes,
    capabilities,
    authorizationContextId,
  };
}

/** Verify a strict Bearer token against Supabase Auth before deriving claims. */
export async function authenticateFactoryRequest(
  authorization: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServerActor> {
  if (parseBearerToken(authorization) === null) throw new FactoryAuthenticationError();
  const response = await fetchImpl(`${getEnv("SUPABASE_URL")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: getEnv("SUPABASE_ANON_KEY"),
      authorization,
    },
  });
  if (!response.ok) throw new FactoryAuthenticationError();
  let user: unknown;
  try {
    user = await response.json();
  } catch {
    throw new FactoryAuthenticationError();
  }
  return deriveServerActor(user);
}

async function callRpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message ?? `rpc ${fn} failed (${response.status})`);
  }
  return response.json();
}

const PACKET_BUCKET = "factory-packets";

// Trust Kernel legacy containment (Task 11, design §9/§15): the client-built packet
// upload (storagePut) and the reusable signed-URL egress (storageSign) are REMOVED.
// A production packet is compiled, signed, and sealed server-side by the V3 worker;
// a human never receives P2 plaintext, a raw storage locator, or a reusable signed
// URL. Only `storageGet` (an internal hash-verify read, verdict only) remains.
const LEGACY_P2_DENIAL = {
  ok: false as const,
  reason: "STORE_PLAINTEXT_ACCESS_DENIED",
  notForProduction: true,
  detail:
    "Client P2 packet upload/download is removed. Packets are built and sealed server-side (V3); the isolated automated verifier is the only P2 reader (design §9).",
};

const LEGACY_AUTHORITY_DENIAL = {
  ok: false as const,
  reason: "LEGACY_AUTHORITY_REMOVED",
  notForProduction: true,
  useV3: "/v3/factory/jobs/:id/{freeze|release|revoke}",
  detail:
    "The legacy state-transition authority is removed (no dual write). The sole mutable release authority is the V3 release_revision path (design §15, no dual write).",
};

async function storageGet(path: string): Promise<Uint8Array> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/storage/v1/object/${PACKET_BUCKET}/${path}`, {
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (!response.ok) throw new Error(`storage get failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export function defaultFactoryApiDeps(): FactoryApiDeps {
  return { authenticate: authenticateFactoryRequest, callRpc, storageGet };
}

function effectiveRole(
  actor: ServerActor,
  allowed: readonly FactoryCapability[],
): FactoryCapability | null {
  return allowed.find((role) => actor.capabilities.includes(role)) ?? null;
}

function actorRpcParams(actor: ServerActor, role: FactoryCapability): Record<string, unknown> {
  return {
    p_actor_subject_id: actor.subjectId,
    p_actor_roles: actor.roles,
    p_actor_site_codes: actor.siteCodes,
    p_authorization_context_id: actor.authorizationContextId,
    p_actor_role: role,
    p_actor_name: actor.name,
  };
}

function forbidden(): Response {
  return json(403, { ok: false, error: "insufficient role" });
}

type StateResult = {
  ok: boolean;
  specState?: string;
  revisionId?: string;
  error?: string;
};

type PacketInfo = StateResult & {
  canExport?: boolean;
  storagePath?: string;
  packetSha256?: string;
};

// ===========================================================================
// V3 Trust Kernel environment adapters (plan Task 5, design §7.2 / §10)
// ---------------------------------------------------------------------------
// Both adapters run on the CALLER's bearer + SUPABASE_ANON_KEY (user-scoped);
// SUPABASE_SERVICE_ROLE_KEY is never touched here. The remaining service-role
// helpers (callRpc for read projections, storageGet for the internal /verify hash
// check) are reserved for the V1/V2 read routes and the post-commit worker; per
// design §7.2 a service-role client performs downstream outbox/storage work only —
// Task 8's worker must gate every such call through assertWorkerServiceOperation.
// The client packet-upload (storagePut) and reusable signed-URL (storageSign)
// helpers were REMOVED for P2 containment (Task 11 §9/§15).
//
// SPEC DELTAS (reported, not resolved — see final report):
//  - create_verified_action_context(0180) needs tenant_id/site_id/resource_type/
//    resource_id/request_hash. Per Task-5 binding the transport never reads
//    tenant/site from the body, so scope is resolved FROM THE RESOURCE under the
//    caller's own bearer (RLS-scoped). This relies on an authenticated SELECT
//    path on the release_* tables; if 0182 exposes only RPC access, a dedicated
//    user-scoped scope-resolver RPC is required (Phase-B integration item).
//  - The plan's endpoints are job-centric (/jobs/:id/{freeze,release,revoke}) but
//    the RPCs are resource-centric: freeze binds ctx.resource_id = working
//    revision id, revoke binds ctx.resource_id = release revision id, and release
//    binds by candidate_hash. The adapter maps :id accordingly.
//  - GET /v3/factory/releases/:id/status has no backing read RPC in 0180-0182
//    (status bundles are emitted via outbox → Task 9). rpc_trust_release_status
//    is called speculatively and flagged.
// ===========================================================================

const V3_RESOURCE: Readonly<Record<PermittedAction, { type: string; table: string; key: string }>> = {
  FREEZE: { type: "WORKING_REVISION", table: "release_working_revision", key: "id" },
  RELEASE: { type: "RELEASE_CANDIDATE", table: "release_candidate", key: "candidate_hash" },
  REVOKE: { type: "RELEASE_REVISION", table: "release_revision", key: "id" },
};

/** Stable reason codes the RPCs raise as their exception message (design §13). */
const KNOWN_REASONS: readonly TrustReasonCode[] = [
  "AUTH_REQUIRED", "AUTH_ANON_NOT_ALLOWED", "AUTH_MEMBERSHIP_REVOKED", "AUTH_SCOPE_DENIED",
  "AUTH_SOD_VIOLATION", "AUTH_ACTION_CONTEXT_INVALID", "AUTH_ACTION_CONTEXT_EXPIRED",
  "STATE_CANDIDATE_STALE", "STATE_RELEASE_AUTHORIZATION_STALE", "STATE_CONFLICT",
  "STATE_RELEASE_REVOKED", "STATE_IDEMPOTENCY_MISMATCH", "GATE_HARD_BLOCKER",
  "GATE_WARNING_EXCEPTION_EXPIRED", "GATE_WARNING_EXCEPTION_MISMATCH",
  "CAP_PROFILE_ATTESTATION_INVALID", "CAP_PROFILE_ATTESTATION_EXPIRED",
];

/** User-scoped PostgREST RPC: forwards the caller bearer + anon apikey only. */
async function userRpc(fn: string, bearer: string, body: Record<string, unknown>): Promise<Response> {
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");
  return fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: bearer },
    body: JSON.stringify(body),
  });
}

/** Translate a PostgREST error envelope into a stable Trust Kernel reason code. */
async function reasonFromResponse(res: Response): Promise<TrustReasonCode> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; detail?: string; code?: string };
  const text = `${body.message ?? ""} ${body.detail ?? ""}`;
  for (const code of KNOWN_REASONS) {
    if (text.includes(code)) return code;
  }
  if (body.code === "28000" || res.status === 401) return "AUTH_REQUIRED";
  if (body.code === "insufficient_privilege" || res.status === 403) return "AUTH_SCOPE_DENIED";
  return "STATE_CONFLICT";
}

/** Resolve tenant/site FROM THE RESOURCE under the caller's bearer (RLS-scoped);
 *  the transport never trusts a client-supplied tenant/site (design §7.2/§7.5). */
async function resolveScope(
  input: UserActionInput,
): Promise<TrustResult<{ tenantId: string; siteId: string; resourceId: string }>> {
  const spec = V3_RESOURCE[input.action];
  const keyValue = input.action === "RELEASE" ? input.candidateHash : input.resourceId;
  if (!keyValue) return { ok: false, code: "STATE_CONFLICT", detail: { detail: "missing resource selector" } };
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");
  const q = `${url}/rest/v1/${spec.table}?${spec.key}=eq.${encodeURIComponent(keyValue)}&select=tenant_id,site_id&limit=1`;
  const res = await fetch(q, { headers: { apikey: anon, authorization: input.bearer } });
  if (!res.ok) return { ok: false, code: await reasonFromResponse(res) };
  const rows = (await res.json().catch(() => [])) as Array<{ tenant_id?: string; site_id?: string }>;
  const row = rows[0];
  if (!row?.tenant_id || !row?.site_id) {
    // Invisible under the caller's RLS scope ⇒ not authorized for this resource.
    return { ok: false, code: "AUTH_SCOPE_DENIED", detail: { detail: "resource not visible in caller scope" } };
  }
  return { ok: true, value: { tenantId: row.tenant_id, siteId: row.site_id, resourceId: keyValue } };
}

/** Derive a stable sha256 request hash for actions whose body carries none
 *  (FREEZE/REVOKE); RELEASE supplies its own per §10.2. create_verified_action_
 *  context requires a valid sha256 request_hash for every action, so the context
 *  is bound to a canonical hash of the action + resource + request fields. */
async function deriveRequestHash(input: UserActionInput): Promise<string> {
  const canonical = JSON.stringify([
    input.action,
    input.resourceId,
    input.candidateHash ?? null,
    input.releaseAuthorizationHash ?? null,
    input.idempotencyKey ?? null,
    input.reason ?? null,
  ]);
  return sha256Hex(new TextEncoder().encode(canonical));
}

/** Construct the user-scoped V3 transport adapters (no service-role authority). */
function buildTrustKernelDeps(): TrustKernelDeps {
  const createActionContext = async (
    input: UserActionInput,
  ): Promise<TrustResult<{ contextId: string }>> => {
    const scope = await resolveScope(input);
    if (!scope.ok) return scope;
    const spec = V3_RESOURCE[input.action];
    // RELEASE must carry a client request hash (rechecked in begin_release);
    // FREEZE/REVOKE contexts are bound to a transport-derived request hash.
    const requestHash = input.requestHash ?? (input.action === "RELEASE" ? null : await deriveRequestHash(input));
    const res = await userRpc("create_verified_action_context", input.bearer, {
      p_action: input.action,
      p_tenant_id: scope.value.tenantId,
      p_site_id: scope.value.siteId,
      p_resource_type: spec.type,
      p_resource_id: scope.value.resourceId,
      p_request_hash: requestHash,
      p_candidate_hash: input.candidateHash ?? null,
      p_release_authorization_hash: input.releaseAuthorizationHash ?? null,
    });
    if (!res.ok) return { ok: false, code: await reasonFromResponse(res) };
    const contextId = (await res.json().catch(() => null)) as string | null;
    if (!contextId) return { ok: false, code: "AUTH_ACTION_CONTEXT_INVALID" };
    return { ok: true, value: { contextId } };
  };

  const invokeAuthority = async (input: AuthorityRequest): Promise<TrustResult<AuthorityResponse>> => {
    if (input.kind === "STATUS") {
      // No action context for a read; user-scoped projection only (flagged delta).
      const res = await userRpc("rpc_trust_release_status", input.bearer, { p_release_revision_id: input.resourceId });
      if (!res.ok) return { ok: false, code: await reasonFromResponse(res) };
      const value = (await res.json().catch(() => ({}))) as AuthorityResponse;
      return { ok: true, value: { status: value?.status ?? "UNKNOWN", ...value } };
    }
    const contextId = input.contextId!;
    let res: Response;
    if (input.kind === "FREEZE") {
      res = await userRpc("rpc_trust_freeze", input.bearer, {
        p_context_id: contextId,
        p_working_revision_id: input.resourceId,
        p_candidate_hash: input.candidateHash ?? null,
        p_snapshot_hash: input.snapshotHash ?? null,
        p_gate_inputs_hash: input.gateInputsHash ?? null,
        p_machine_profile_hash: input.machineProfileHash ?? null,
        p_attestation_id: input.attestationId ?? null,
        p_attestation_hash: input.attestationHash ?? null,
        p_policy_version: input.policyVersion ?? null,
      });
    } else if (input.kind === "RELEASE") {
      res = await userRpc("rpc_trust_begin_release", input.bearer, {
        p_context_id: contextId,
        p_candidate_hash: input.candidateHash ?? null,
        p_release_authorization_hash: input.releaseAuthorizationHash ?? null,
        p_idempotency_key: input.idempotencyKey ?? null,
        p_request_hash: input.requestHash ?? null,
      });
    } else {
      res = await userRpc("rpc_trust_revoke", input.bearer, {
        p_context_id: contextId,
        p_release_revision_id: input.resourceId,
        p_reason: input.reason ?? null,
      });
    }
    if (!res.ok) return { ok: false, code: await reasonFromResponse(res) };
    const value = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: true, value: { status: "ACCEPTED", kind: input.kind, result: value } };
  };

  return { createActionContext, invokeAuthority };
}

/** Sanctioned service-role entry for Task 8's post-commit worker: a service-role
 *  RPC call is permitted ONLY for a downstream worker/outbox operation (design
 *  §7.2). A user-authority operation is refused before any service credential is
 *  used, so the service role can never mint or perform human authority. */
export async function serviceWorkerRpc(op: string, fn: string, body: Record<string, unknown>): Promise<unknown> {
  const guard = assertWorkerServiceOperation(op);
  if (!guard.ok) {
    throw new Error(`${guard.code}: '${op}' is not a permitted service-role worker operation`);
  }
  return callRpc(fn, body);
}

export async function handleFactoryApi(
  req: Request,
  deps: FactoryApiDeps = defaultFactoryApiDeps(),
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // Trust Kernel V3 (plan Task 5): user-authorized release authority. Delegated
  // to the pure transport handler with user-scoped adapters (never service role).
  if (new URL(req.url).pathname.split("/").filter((s) => s.length > 0).includes("v3")) {
    return handleTrustKernelRequest(req, buildTrustKernelDeps());
  }

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.includes("health")) return json(200, { ok: true, service: "factory-api" });

  const jobsIndex = segments.lastIndexOf("jobs");
  if (jobsIndex < 0) return json(404, { ok: false, error: "unknown route" });

  const authorization = req.headers.get("authorization") ?? "";
  if (parseBearerToken(authorization) === null) {
    return json(401, { ok: false, error: "missing or malformed authorization" });
  }

  // Trust Kernel containment (Task 11, §9/§15): legacy production-shaped surfaces
  // are denied BEFORE authentication and before any storage/RPC call:
  //  - the client packet upload (dual write) and the reusable signed-URL export
  //    return no raw locator and no signed URL (design §9);
  //  - the legacy state-transition authority is removed (no dual write, §15).
  {
    const deniedAction = segments[jobsIndex + 2] ?? "state";
    if (req.method === "POST" && deniedAction === "packet") {
      return json(403, LEGACY_P2_DENIAL);
    }
    if (req.method === "GET" && deniedAction === "export") {
      return json(403, LEGACY_P2_DENIAL);
    }
    if (req.method === "POST" && ["freeze", "release", "revoke", "unfreeze"].includes(deniedAction)) {
      return json(409, LEGACY_AUTHORITY_DENIAL);
    }
  }

  let actor: ServerActor;
  try {
    actor = await deps.authenticate(authorization);
  } catch (error) {
    if (error instanceof FactoryAuthenticationError) {
      return json(401, { ok: false, error: "invalid authorization" });
    }
    console.error(`factory-api auth: ${String(error)}`);
    return json(500, { ok: false, error: "factory-api internal error" });
  }

  try {
    // GET /factory/jobs
    if (jobsIndex + 1 >= segments.length) {
      if (req.method !== "GET") return json(404, { ok: false, error: "unknown route" });
      if (effectiveRole(actor, EVIDENCE_READ_CAPABILITIES) === null) return forbidden();
      return json(200, await deps.callRpc("rpc_factory_jobs_list", {}) as Record<string, unknown>);
    }

    const jobId = decodeURIComponent(segments[jobsIndex + 1]);
    const action = segments[jobsIndex + 2] ?? "state";

    if (req.method === "GET" && action === "state") {
      if (effectiveRole(actor, STATE_READ_CAPABILITIES) === null) return forbidden();
      return json(200, await deps.callRpc("rpc_factory_job_state", { p_job_id: jobId }) as Record<string, unknown>);
    }

    if (req.method === "GET" && action === "can-export") {
      if (effectiveRole(actor, STATE_READ_CAPABILITIES) === null) return forbidden();
      const state = await deps.callRpc("rpc_factory_job_state", { p_job_id: jobId }) as StateResult;
      if (!state.ok) return json(404, state as Record<string, unknown>);
      const canExport = state.specState === "RELEASED";
      return json(200, {
        ok: true,
        canExport,
        specState: state.specState,
        revisionId: state.revisionId,
        reason: canExport ? undefined : "Spec must be RELEASED to export",
      });
    }

    if (req.method === "GET" && action === "activity") {
      if (effectiveRole(actor, EVIDENCE_READ_CAPABILITIES) === null) return forbidden();
      return json(200, await deps.callRpc("rpc_factory_job_activity", { p_job_id: jobId }) as Record<string, unknown>);
    }

    if (req.method === "GET" && action === "proof") {
      if (effectiveRole(actor, EVIDENCE_READ_CAPABILITIES) === null) return forbidden();
      return json(200, await deps.callRpc("rpc_factory_job_proof", { p_job_id: jobId }) as Record<string, unknown>);
    }
    // Legacy /packet (client upload) and /export (signed URL) are denied above,
    // before this block — no storagePut/storageSign path remains (Task 11 §9/§15).
    // POST /verify stays as a READ_ONLY integrity check: it reads the sealed bytes
    // into the edge (service role) and returns only a verdict + hashes + byte count
    // — no raw locator, no URL, no plaintext. Its audit event carries the S17
    // server-verified actor context (migration 0162), never a client-supplied one.
    if (req.method === "POST" && action === "verify") {
      const role = effectiveRole(actor, FACTORY_CAPABILITIES);
      if (role === null) return forbidden();
      const info = await deps.callRpc("rpc_factory_job_packet_info", { p_job_id: jobId }) as PacketInfo;
      if (!info.ok) return json(404, info as Record<string, unknown>);
      if (info.specState !== "RELEASED" || !info.storagePath || !info.packetSha256) {
        return json(409, {
          ok: false,
          error: "packet verification requires RELEASED spec and recorded packet",
          specState: info.specState,
        });
      }
      const bytes = await deps.storageGet(info.storagePath);
      const computed = await sha256Hex(bytes);
      const verdict = computed === info.packetSha256 ? "PASS" : "FAIL";
      const recorded = await deps.callRpc("rpc_factory_job_verify_result", {
        p_job_id: jobId,
        p_verdict: verdict,
        p_computed_sha256: computed,
        ...actorRpcParams(actor, role),
      }) as Record<string, unknown>;
      if (recorded.ok === false) return json(409, recorded);
      return json(200, {
        ok: true,
        verdict,
        expected: info.packetSha256,
        computed,
        bytes: bytes.length,
      });
    }

    return json(404, { ok: false, error: "unknown route" });
  } catch (error) {
    console.error(`factory-api: ${String(error)}`);
    return json(500, { ok: false, error: "factory-api internal error" });
  }
}

if (typeof Deno !== "undefined") Deno.serve((req) => handleFactoryApi(req));

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

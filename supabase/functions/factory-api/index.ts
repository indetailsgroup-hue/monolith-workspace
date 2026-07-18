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
  storagePut: (path: string, bytes: Uint8Array) => Promise<void>;
  storageSign: (path: string, expiresInSec: number) => Promise<string>;
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

function b64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) output[i] = binary.charCodeAt(i);
  return output;
}

async function storagePut(path: string, bytes: Uint8Array): Promise<void> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/storage/v1/object/${PACKET_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      "content-type": "application/zip",
      "x-upsert": "true",
    },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
  if (!response.ok) throw new Error(`storage put failed (${response.status})`);
}

async function storageSign(path: string, expiresInSec: number): Promise<string> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/storage/v1/object/sign/${PACKET_BUCKET}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSec }),
  });
  if (!response.ok) throw new Error(`storage sign failed (${response.status})`);
  const result = (await response.json()) as { signedURL?: string };
  if (!result.signedURL) throw new Error("no signedURL");
  return `${url}/storage/v1${result.signedURL}`;
}

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
  return { authenticate: authenticateFactoryRequest, callRpc, storagePut, storageSign, storageGet };
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

export async function handleFactoryApi(
  req: Request,
  deps: FactoryApiDeps = defaultFactoryApiDeps(),
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.includes("health")) return json(200, { ok: true, service: "factory-api" });

  const jobsIndex = segments.lastIndexOf("jobs");
  if (jobsIndex < 0) return json(404, { ok: false, error: "unknown route" });

  const authorization = req.headers.get("authorization") ?? "";
  if (parseBearerToken(authorization) === null) {
    return json(401, { ok: false, error: "missing or malformed authorization" });
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

    if (req.method === "POST" && action === "packet") {
      const role = effectiveRole(actor, DESIGN_CAPABILITIES);
      if (role === null) return forbidden();

      // Check before any storage side effect; SQL record_packet re-checks under row lock.
      const state = await deps.callRpc("rpc_factory_job_state", { p_job_id: jobId }) as StateResult;
      if (!state.ok) return json(404, state as Record<string, unknown>);
      if (state.specState !== "RELEASED") {
        return json(409, { ok: false, error: "packet requires RELEASED spec", specState: state.specState });
      }

      const body = (await req.json().catch(() => null)) as
        { zipBase64?: string; manifestSha256?: string; jobName?: unknown; pieceCount?: unknown } | null;
      if (!body?.zipBase64) return json(400, { ok: false, error: "missing zipBase64" });
      let bytes: Uint8Array;
      try {
        bytes = b64ToBytes(body.zipBase64);
      } catch {
        return json(400, { ok: false, error: "invalid zipBase64" });
      }
      if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
        return json(400, { ok: false, error: "invalid packet size" });
      }
      // S18 (0170): display metadata from the manifest — sanitized, never authority
      // data. Anything that is not a plausible name/count degrades to null.
      const jobName = typeof body.jobName === "string" && body.jobName.trim().length > 0
        ? body.jobName.trim().slice(0, 200)
        : null;
      const pieceCount = typeof body.pieceCount === "number"
          && Number.isInteger(body.pieceCount) && body.pieceCount >= 0
        ? body.pieceCount
        : null;
      const sha256 = await sha256Hex(bytes);
      const path = `${encodeURIComponent(jobId)}/${sha256}.zip`;
      await deps.storagePut(path, bytes);
      const recorded = await deps.callRpc("rpc_factory_job_record_packet", {
        p_job_id: jobId,
        p_packet_sha256: sha256,
        p_manifest_sha256: body.manifestSha256 ?? null,
        p_storage_path: path,
        ...actorRpcParams(actor, role),
        p_job_name: jobName,
        p_piece_count: pieceCount,
      }) as Record<string, unknown>;
      return json(recorded.ok === false ? 409 : 200, recorded);
    }

    if (req.method === "GET" && action === "export") {
      const role = effectiveRole(actor, FACTORY_CAPABILITIES);
      if (role === null) return forbidden();
      const info = await deps.callRpc("rpc_factory_job_packet_info", { p_job_id: jobId }) as PacketInfo;
      if (!info.ok) return json(404, info as Record<string, unknown>);
      // Defense in depth: never trust canExport alone; state must independently be RELEASED.
      if (info.specState !== "RELEASED" || !info.canExport || !info.storagePath) {
        return json(409, {
          ok: false,
          error: "packet export requires RELEASED spec and recorded packet",
          specState: info.specState,
        });
      }
      const signedUrl = await deps.storageSign(info.storagePath, 60 * 60);
      return json(200, {
        ok: true,
        url: signedUrl,
        sha256: info.packetSha256,
        revisionId: info.revisionId,
      });
    }

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
      // FS-B1-02: this endpoint proves ONLY that the stored ZIP bytes still
      // match the recorded digest. It parses nothing and checks no signature,
      // authority, gate, or NFP contract — the verdict vocabulary must not be
      // able to impersonate the S17-5 full verifier's result.
      const verdict = computed === info.packetSha256 ? "STORAGE_HASH_MATCH" : "STORAGE_HASH_MISMATCH";
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
        scope: "STORAGE_INTEGRITY_ONLY",
        expected: info.packetSha256,
        computed,
        bytes: bytes.length,
      });
    }

    if (req.method === "POST" && ["freeze", "release", "revoke", "unfreeze"].includes(action)) {
      const role = effectiveRole(actor, DESIGN_CAPABILITIES);
      if (role === null) return forbidden();
      const body = (await req.json().catch(() => ({}))) as { note?: string; changeClass?: string };
      const result = await deps.callRpc("rpc_factory_job_transition", {
        p_job_id: jobId,
        p_action: action,
        ...actorRpcParams(actor, role),
        p_note: body.note ?? null,
        p_change_class: body.changeClass ?? null,
      });
      return json(200, result as Record<string, unknown>);
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

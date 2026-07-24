import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  deriveServerActor,
  FactoryAuthenticationError,
  handleFactoryApi,
  type FactoryApiDeps,
  type ServerActor,
} from "./index";

const AUTHORIZATION = "Bearer signed-user-jwt";
const CONTEXT_ID = "a".repeat(64);

const DESIGNER: ServerActor = {
  subjectId: "user-designer",
  name: "user-designer",
  roles: ["designer"],
  siteCodes: ["BKK-HQ-01"],
  capabilities: ["DESIGNER"],
  authorizationContextId: CONTEXT_ID,
};

const FACTORY: ServerActor = {
  subjectId: "user-factory",
  name: "user-factory",
  roles: ["factory_operator"],
  siteCodes: ["BKK-HQ-01"],
  capabilities: ["FACTORY"],
  authorizationContextId: "b".repeat(64),
};

const ADMIN: ServerActor = {
  subjectId: "user-admin",
  name: "user-admin",
  roles: ["admin", "operations"],
  siteCodes: [],
  capabilities: ["ADMIN"],
  authorizationContextId: "c".repeat(64),
};

const INSTALLER: ServerActor = {
  subjectId: "user-installer",
  name: "user-installer",
  roles: ["installer"],
  siteCodes: ["BKK-HQ-01"],
  capabilities: ["INSTALLER"],
  authorizationContextId: "d".repeat(64),
};

const FINANCE: ServerActor = {
  subjectId: "user-finance",
  name: "user-finance",
  roles: ["finance"],
  siteCodes: ["BKK-HQ-01"],
  capabilities: ["FINANCE"],
  authorizationContextId: "e".repeat(64),
};

type RpcCall = { fn: string; body: Record<string, unknown> };

function harness(
  actor: ServerActor = DESIGNER,
  over: Partial<FactoryApiDeps> = {},
): { deps: FactoryApiDeps; calls: RpcCall[]; storage: { put: number; sign: number; get: number } } {
  const calls: RpcCall[] = [];
  const storage = { put: 0, sign: 0, get: 0 };
  const deps: FactoryApiDeps = {
    authenticate: async () => actor,
    callRpc: async (fn, body) => {
      calls.push({ fn, body });
      if (fn === "rpc_factory_job_state") {
        return { ok: true, jobId: "JOB-1", specState: "RELEASED", revisionId: "REV-1" };
      }
      if (fn === "rpc_factory_job_packet_info") {
        return {
          ok: true,
          jobId: "JOB-1",
          specState: "RELEASED",
          revisionId: "REV-1",
          canExport: true,
          storagePath: "JOB-1/packet.zip",
          packetSha256: "0".repeat(64),
        };
      }
      if (fn === "rpc_factory_jobs_list") return { ok: true, jobs: [] };
      if (fn === "rpc_factory_job_activity") return { ok: true, activity: [] };
      if (fn === "rpc_factory_job_proof") return { ok: true, canExport: true };
      return { ok: true };
    },
    // storagePut/storageSign no longer exist on FactoryApiDeps (Task 11 §9/§15);
    // the put/sign counters remain to prove no legacy path can increment them.
    storageGet: async () => { storage.get += 1; return new Uint8Array([1, 2, 3]); },
    ...over,
  };
  return { deps, calls, storage };
}

function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://example.test/factory-api/api/factory/jobs${path}`, {
    method,
    headers: {
      authorization: AUTHORIZATION,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("S17-1 verified identity derivation", () => {
  it("uses only verified app_metadata.roles + site_codes and produces a stable context id", async () => {
    const first = await deriveServerActor({
      id: "user-123",
      email: "verified@example.com",
      app_metadata: {
        roles: ["designer", "admin", "designer"],
        site_codes: ["BKK-HQ-02", "BKK-HQ-01", "BKK-HQ-02"],
      },
      user_metadata: { roles: ["factory"], site_codes: ["FORGED"] },
      roles: ["factory"],
    });
    const reordered = await deriveServerActor({
      id: "user-123",
      email: "verified@example.com",
      app_metadata: {
        roles: ["admin", "designer"],
        site_codes: ["BKK-HQ-01", "BKK-HQ-02"],
      },
    });

    expect(first.subjectId).toBe("user-123");
    expect(first.name).toBe("user-123");
    expect(first.name).not.toBe("verified@example.com");
    expect(first.roles).toEqual(["admin", "designer"]);
    expect(first.siteCodes).toEqual(["BKK-HQ-01", "BKK-HQ-02"]);
    expect(first.capabilities).toEqual(["ADMIN", "DESIGNER"]);
    expect(first.authorizationContextId).toMatch(/^[0-9a-f]{64}$/);
    expect(first.authorizationContextId).toBe(reordered.authorizationContextId);
    expect(first.roles).not.toContain("factory");
    expect(first.siteCodes).not.toContain("FORGED");
  });

  it("rejects a verified-user payload without a stable subject", async () => {
    await expect(deriveServerActor({ app_metadata: { roles: ["admin"] } }))
      .rejects.toBeInstanceOf(FactoryAuthenticationError);
  });
});

describe("S17-1 least-privilege read boundaries", () => {
  it.each([
    ["jobs list", ""],
    ["activity", "/JOB-1/activity"],
    ["proof", "/JOB-1/proof"],
  ])("denies INSTALLER access to %s without calling an RPC", async (_name, path) => {
    const h = harness(INSTALLER);
    const response = await handleFactoryApi(request(path), h.deps);
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
  });

  it.each([
    ["jobs list", ""],
    ["activity", "/JOB-1/activity"],
    ["proof", "/JOB-1/proof"],
  ])("denies FINANCE access to %s without calling an RPC", async (_name, path) => {
    const h = harness(FINANCE);
    const response = await handleFactoryApi(request(path), h.deps);
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
  });

  it.each([
    ["state", "/JOB-1/state"],
    ["can-export", "/JOB-1/can-export"],
  ])("keeps %s available to INSTALLER", async (_name, path) => {
    const h = harness(INSTALLER);
    const response = await handleFactoryApi(request(path), h.deps);
    expect(response.status).toBe(200);
    expect(h.calls).toHaveLength(1);
  });

  it.each([
    ["state", "/JOB-1/state"],
    ["can-export", "/JOB-1/can-export"],
  ])("keeps %s available to FINANCE", async (_name, path) => {
    const h = harness(FINANCE);
    const response = await handleFactoryApi(request(path), h.deps);
    expect(response.status).toBe(200);
    expect(h.calls).toHaveLength(1);
  });

  it.each([
    ["ADMIN", ADMIN],
    ["DESIGNER", DESIGNER],
    ["FACTORY", FACTORY],
  ])("allows %s to read jobs, activity, and proof", async (_name, actor) => {
    const h = harness(actor as ServerActor);
    for (const path of ["", "/JOB-1/activity", "/JOB-1/proof"]) {
      expect((await handleFactoryApi(request(path), h.deps)).status).toBe(200);
    }
    expect(h.calls).toHaveLength(3);
  });
});

describe("S17-1 fail-closed authentication", () => {
  it("rejects missing and malformed Authorization without touching RPCs", async () => {
    const h = harness();
    const missing = new Request("https://example.test/api/factory/jobs/JOB-1/state");
    const malformed = new Request("https://example.test/api/factory/jobs/JOB-1/state", {
      headers: { authorization: "Basic client-value" },
    });
    expect((await handleFactoryApi(missing, h.deps)).status).toBe(401);
    expect((await handleFactoryApi(malformed, h.deps)).status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it("rejects a JWT that the authentication dependency cannot verify", async () => {
    const h = harness(DESIGNER, {
      authenticate: async () => { throw new FactoryAuthenticationError(); },
    });
    const response = await handleFactoryApi(request("/JOB-1/state"), h.deps);
    expect(response.status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  it("rejects a verified principal without a recognized factory capability", async () => {
    const h = harness({ ...DESIGNER, roles: ["unknown_role"], capabilities: [] });
    const response = await handleFactoryApi(request("/JOB-1/state"), h.deps);
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
  });

  it.each([
    ["list", "", "GET", undefined],
    ["state", "/JOB-1/state", "GET", undefined],
    ["can-export", "/JOB-1/can-export", "GET", undefined],
    ["proof", "/JOB-1/proof", "GET", undefined],
    ["activity", "/JOB-1/activity", "GET", undefined],
    ["verify", "/JOB-1/verify", "POST", {}],
  ])("authenticates the %s route before use", async (_name, path, method, body) => {
    let authCalls = 0;
    const h = harness(ADMIN, {
      authenticate: async () => { authCalls += 1; return ADMIN; },
    });
    await handleFactoryApi(request(path as string, method as string, body), h.deps);
    expect(authCalls).toBe(1);
  });

  it.each([
    ["freeze", "/JOB-1/freeze", "POST", {}],
    ["release", "/JOB-1/release", "POST", {}],
    ["revoke", "/JOB-1/revoke", "POST", {}],
    ["unfreeze", "/JOB-1/unfreeze", "POST", {}],
    ["packet", "/JOB-1/packet", "POST", { zipBase64: btoa("zip") }],
    ["export", "/JOB-1/export", "GET", undefined],
  ])("denies the legacy %s route before authentication (Task 11 containment)", async (_name, path, method, body) => {
    let authCalls = 0;
    const h = harness(ADMIN, {
      authenticate: async () => { authCalls += 1; return ADMIN; },
    });
    const response = await handleFactoryApi(request(path as string, method as string, body), h.deps);
    expect([403, 409]).toContain(response.status);
    expect(authCalls).toBe(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe("S17-1 spoof resistance and server-owned audit context", () => {
  it("ignores forged actor headers/body on /verify and writes only the verified server actor", async () => {
    const h = harness(FACTORY);
    const response = await handleFactoryApi(request(
      "/JOB-1/verify",
      "POST",
      { actorRole: "ADMIN", actorName: "body-forged" },
      { "x-actor-role": "ADMIN", "x-actor-name": "header-forged" },
    ), h.deps);
    expect(response.status).toBe(200);

    const verify = h.calls.find((call) => call.fn === "rpc_factory_job_verify_result");
    expect(verify?.body).toMatchObject({
      p_actor_subject_id: FACTORY.subjectId,
      p_actor_roles: FACTORY.roles,
      p_actor_site_codes: FACTORY.siteCodes,
      p_authorization_context_id: FACTORY.authorizationContextId,
      p_actor_role: "FACTORY",
      p_actor_name: FACTORY.name,
    });
    expect(JSON.stringify(verify?.body)).not.toContain("header-forged");
    expect(JSON.stringify(verify?.body)).not.toContain("body-forged");
  });

  it("a forged DESIGNER header cannot resurrect the removed legacy transition authority", async () => {
    const h = harness(FACTORY);
    const response = await handleFactoryApi(request(
      "/JOB-1/release",
      "POST",
      {},
      { "x-actor-role": "DESIGNER" },
    ), h.deps);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe("LEGACY_AUTHORITY_REMOVED");
    expect(h.calls.find((call) => call.fn === "rpc_factory_job_transition")).toBeUndefined();
  });

  it("a forged FACTORY header cannot resurrect the removed signed-URL export", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/export",
      "GET",
      undefined,
      { "x-actor-role": "FACTORY" },
    ), h.deps);
    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe("STORE_PLAINTEXT_ACCESS_DENIED");
    expect(h.storage.sign).toBe(0);
  });

  it("verify audit RPC receives the verified JWT context", async () => {
    const verifyHarness = harness(FACTORY);
    expect((await handleFactoryApi(request("/JOB-1/verify", "POST", {}), verifyHarness.deps)).status).toBe(200);
    const verify = verifyHarness.calls.find((call) => call.fn === "rpc_factory_job_verify_result");
    expect(verify?.body).toMatchObject({
      p_actor_subject_id: FACTORY.subjectId,
      p_actor_roles: FACTORY.roles,
      p_actor_site_codes: FACTORY.siteCodes,
      p_authorization_context_id: FACTORY.authorizationContextId,
      p_actor_role: "FACTORY",
      p_actor_name: FACTORY.name,
    });
  });
});

describe("S17-2 RELEASED-only invariant", () => {
  it("reports FROZEN as non-exportable", async () => {
    const h = harness(FACTORY, {
      callRpc: async () => ({ ok: true, specState: "FROZEN", revisionId: "REV-1" }),
    });
    const response = await handleFactoryApi(request("/JOB-1/can-export"), h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canExport: false,
      specState: "FROZEN",
      reason: "Spec must be RELEASED to export",
    });
  });

  it("denies packet upload outright before any storage or RPC side effect (Task 11)", async () => {
    const h = harness(DESIGNER, {
      callRpc: async (fn, body) => {
        h.calls.push({ fn, body });
        return { ok: true, specState: "FROZEN" };
      },
    });
    const response = await handleFactoryApi(request(
      "/JOB-1/packet", "POST", { zipBase64: btoa("packet") },
    ), h.deps);
    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe("STORE_PLAINTEXT_ACCESS_DENIED");
    expect(h.storage.put).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("denies export even if a stale/malicious canExport flag says true", async () => {
    const h = harness(FACTORY, {
      callRpc: async () => ({
        ok: true,
        specState: "FROZEN",
        canExport: true,
        storagePath: "JOB-1/packet.zip",
      }),
    });
    const response = await handleFactoryApi(request("/JOB-1/export"), h.deps);
    expect(response.status).toBe(403);
    expect(h.storage.sign).toBe(0);
  });

  it("blocks verification for FROZEN before reading packet bytes", async () => {
    const h = harness(FACTORY, {
      callRpc: async () => ({
        ok: true,
        specState: "FROZEN",
        storagePath: "JOB-1/packet.zip",
        packetSha256: "0".repeat(64),
      }),
    });
    const response = await handleFactoryApi(request("/JOB-1/verify", "POST", {}), h.deps);
    expect(response.status).toBe(409);
    expect(h.storage.get).toBe(0);
  });

  it("denies export even for a RELEASED packet and an authorized factory actor (no signed URL exists)", async () => {
    const h = harness(FACTORY);
    const response = await handleFactoryApi(request("/JOB-1/export"), h.deps);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).not.toHaveProperty("url");
    expect(h.storage.sign).toBe(0);
  });

  it("SQL migration removes legacy actor overloads and re-checks RELEASED under lock", () => {
    const sql = readFileSync(
      new URL("../../migrations/0162_factory_server_identity_released_only.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("drop function if exists public.rpc_factory_job_transition(text, text, text, text, text, text)");
    expect(sql).toContain("drop function if exists public.rpc_factory_job_record_packet(text, text, text, text, text, text)");
    expect(sql).toContain("actor_subject_id");
    expect(sql).toContain("authorization_context_id");
    expect(sql).toContain("coalesce(p_actor_role, '') not in ('DESIGNER', 'ADMIN')");
    expect(sql).toContain("coalesce(p_actor_role, '') not in ('FACTORY', 'ADMIN')");
    expect(sql).toContain("drop policy if exists factory_jobs_sel on public.factory_jobs");
    expect(sql).toContain("drop policy if exists factory_job_events_sel on public.factory_job_events");
    expect(sql).toContain("revoke all on table public.factory_jobs from public, anon, authenticated");
    expect(sql).toContain("actor_name = p_actor_subject_id");
    expect(sql).not.toContain("actor_name = p_actor_name");
    expect(sql.match(/v\.spec_state <> 'RELEASED'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("'canExport', v.spec_state = 'RELEASED'");
    expect(sql).not.toContain("v.spec_state in ('FROZEN', 'RELEASED')");
  });
});

// Feature: production-trust-kernel — Task 5 transport tests for the user-token
// V3 Edge boundary (handleTrustKernelRequest). Pure transport: environment
// adapters (Supabase clients) are injected as fakes, so no DB/network is touched.
//
// Invariants under test (plan Task 5 / design §7.2, §10):
//   - Missing/invalid bearer → 401; a valid user action → 202 (async worker).
//   - The handler NEVER accepts client-supplied actor role/name/tenant/site and
//     the spoof string never reaches createActionContext.
//   - createActionContext is called with the INCOMING bearer, never a service one.
//   - Stable HTTP↔reason-code mapping for invalid JSON, wrong method, candidate
//     mismatch, offline-replay header, expired context, and service-role spoof.
//   - Service-role helpers are reserved for worker ops and reject user authority.
import {
  handleTrustKernelRequest,
  assertWorkerServiceOperation,
  httpStatusForReason,
  filterActionBody,
  type TrustKernelDeps,
  type TrustResult,
  type UserActionInput,
  type AuthorityRequest,
  type AuthorityResponse,
} from "./trustKernel";
import { handleFactoryApi } from "./index";

const userBearer = "Bearer user-jwt-abc";
const serviceBearer = "Bearer service-role-key";
const HASH = "a".repeat(64);
const AUTHZ = "b".repeat(64);
const REQH = "c".repeat(64);

type CtxResult = TrustResult<{ contextId: string }>;
type AuthResult = TrustResult<AuthorityResponse>;

function deps(over: { ctx?: CtxResult; auth?: AuthResult } = {}) {
  const createActionContext = vi.fn(
    async (_i: UserActionInput): Promise<CtxResult> => over.ctx ?? { ok: true, value: { contextId: "ctx-1" } },
  );
  const invokeAuthority = vi.fn(
    async (_i: AuthorityRequest): Promise<AuthResult> =>
      over.auth ?? { ok: true, value: { status: "ACCEPTED", releaseAttemptId: "att-1" } },
  );
  const d = { createActionContext, invokeAuthority };
  return d as typeof d & TrustKernelDeps;
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  const h: Record<string, string> = { ...headers };
  const init: RequestInit = { method, headers: h };
  if (body !== undefined) {
    h["content-type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(`https://edge.example/functions/v1/factory-api${path}`, init);
}
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => req("POST", path, body, headers);
const get = (path: string, headers: Record<string, string> = {}) => req("GET", path, undefined, headers);

describe("trust-kernel edge transport — authentication", () => {
  it("401 when Authorization is missing (never creates a context)", async () => {
    const d = deps();
    const res = await handleTrustKernelRequest(post("/v3/factory/jobs/JOB-1/release", {}), d);
    expect(res.status).toBe(401);
    expect(d.createActionContext).not.toHaveBeenCalled();
  });

  it("401 when Authorization is present but not a bearer token", async () => {
    const d = deps();
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", {}, { authorization: "Basic abc" }),
      d,
    );
    expect(res.status).toBe(401);
    expect(d.createActionContext).not.toHaveBeenCalled();
  });
});

describe("trust-kernel edge transport — actor spoof containment (§7.2)", () => {
  it("202 on a valid user action; spoofed role/name/body never reach createActionContext", async () => {
    const d = deps();
    const body = {
      candidateHash: HASH,
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: "idem-1",
      requestHash: REQH,
      "x-actor-role": "ADMIN",
      role: "ADMIN",
      spoof: "spoof",
    };
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", body, {
        authorization: userBearer,
        "x-actor-role": "ADMIN",
        "x-actor-name": "spoof",
      }),
      d,
    );
    expect(res.status).toBe(202);
    expect(d.createActionContext).toHaveBeenCalledWith(
      expect.objectContaining({ bearer: userBearer, action: "RELEASE" }),
    );
    expect(d.createActionContext).not.toHaveBeenCalledWith(expect.objectContaining({ bearer: serviceBearer }));
    expect(JSON.stringify(d.createActionContext.mock.calls)).not.toContain("spoof");
    expect(JSON.stringify(d.createActionContext.mock.calls)).not.toContain("ADMIN");
  });

  it("forwards ONLY candidate/authorization/idempotency/request hashes to the authority", async () => {
    const d = deps();
    const body = {
      candidateHash: HASH,
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: "idem-1",
      requestHash: REQH,
      tenantId: "T-EVIL",
      siteId: "S-EVIL",
      role: "ADMIN",
      name: "mallory",
    };
    await handleTrustKernelRequest(post("/v3/factory/jobs/JOB-1/release", body, { authorization: userBearer }), d);
    const input = d.createActionContext.mock.calls[0][0] as UserActionInput;
    expect(input.candidateHash).toBe(HASH);
    expect(input.releaseAuthorizationHash).toBe(AUTHZ);
    expect(input).not.toHaveProperty("tenantId");
    expect(input).not.toHaveProperty("siteId");
    expect(input).not.toHaveProperty("role");
    expect(input).not.toHaveProperty("name");
  });

  it("the bearer forwarded is exactly the incoming one, never a service-role key", async () => {
    const d = deps();
    await handleTrustKernelRequest(post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, { authorization: userBearer }), d);
    const input = d.createActionContext.mock.calls[0][0] as UserActionInput;
    expect(input.bearer).toBe(userBearer);
    expect(input.bearer).not.toBe(serviceBearer);
  });
});

describe("trust-kernel edge transport — stable HTTP/reason mapping", () => {
  it("400 on invalid JSON body", async () => {
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", "{not json", { authorization: userBearer }),
      deps(),
    );
    expect(res.status).toBe(400);
  });

  it("405 on wrong method (GET on mutation, POST on status)", async () => {
    expect((await handleTrustKernelRequest(get("/v3/factory/jobs/JOB-1/release", { authorization: userBearer }), deps())).status).toBe(405);
    expect((await handleTrustKernelRequest(post("/v3/factory/releases/REL-1/status", {}, { authorization: userBearer }), deps())).status).toBe(405);
  });

  it("409 when the authority reports a candidate mismatch (STATE_CANDIDATE_STALE)", async () => {
    const d = deps({ auth: { ok: false, code: "STATE_CANDIDATE_STALE" } });
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, { authorization: userBearer }),
      d,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("STATE_CANDIDATE_STALE");
  });

  it("409 and NO context when an offline-replay marker header is present (TRUST_FRESHNESS_UNPROVEN)", async () => {
    const d = deps();
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, {
        authorization: userBearer,
        "x-trust-offline-replay": "1",
      }),
      d,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("TRUST_FRESHNESS_UNPROVEN");
    expect(d.createActionContext).not.toHaveBeenCalled();
  });

  it("401 when the action context is expired; never proceeds to the authority", async () => {
    const d = deps({ ctx: { ok: false, code: "AUTH_ACTION_CONTEXT_EXPIRED" } });
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, { authorization: userBearer }),
      d,
    );
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("AUTH_ACTION_CONTEXT_EXPIRED");
    expect(d.invokeAuthority).not.toHaveBeenCalled();
  });

  it("401 when the authority rejects a service/anon identity (service-role spoof)", async () => {
    const d = deps({ ctx: { ok: false, code: "AUTH_ANON_NOT_ALLOWED" } });
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, { authorization: userBearer }),
      d,
    );
    expect(res.status).toBe(401);
  });

  it("403 when scope is denied (AUTH_SCOPE_DENIED)", async () => {
    const d = deps({ ctx: { ok: false, code: "AUTH_SCOPE_DENIED" } });
    const res = await handleTrustKernelRequest(
      post("/v3/factory/jobs/JOB-1/release", { candidateHash: HASH }, { authorization: userBearer }),
      d,
    );
    expect(res.status).toBe(403);
  });
});

describe("trust-kernel edge transport — routing", () => {
  it("routes freeze and revoke to the authority with the correct action", async () => {
    const d = deps();
    expect(
      (await handleTrustKernelRequest(post("/v3/factory/jobs/WR-1/freeze", { candidateHash: HASH, snapshotHash: HASH }, { authorization: userBearer }), d)).status,
    ).toBe(202);
    expect(d.createActionContext).toHaveBeenLastCalledWith(expect.objectContaining({ action: "FREEZE" }));

    await handleTrustKernelRequest(post("/v3/factory/jobs/RR-1/revoke", { reason: "safety" }, { authorization: userBearer }), d);
    expect(d.createActionContext).toHaveBeenLastCalledWith(expect.objectContaining({ action: "REVOKE" }));
  });

  it("GET status returns 200 with the authority projection (user-scoped read)", async () => {
    const d = deps({ auth: { ok: true, value: { status: "ACTIVE", releaseRevisionId: "RR-1" } } });
    const res = await handleTrustKernelRequest(get("/v3/factory/releases/RR-1/status", { authorization: userBearer }), d);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ACTIVE");
    expect(d.invokeAuthority).toHaveBeenCalledWith(expect.objectContaining({ kind: "STATUS", resourceId: "RR-1" }));
  });

  it("404 on an unknown V3 route", async () => {
    const res = await handleTrustKernelRequest(post("/v3/factory/jobs/JOB-1/detonate", {}, { authorization: userBearer }), deps());
    expect(res.status).toBe(404);
  });
});

describe("trust-kernel edge transport — service-role containment (§7.2)", () => {
  it("assertWorkerServiceOperation rejects user-authority operations", () => {
    for (const op of ["FREEZE", "RELEASE", "REVOKE", "GRANT_WARNING_EXCEPTION"]) {
      const r = assertWorkerServiceOperation(op);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("AUTH_SCOPE_DENIED");
    }
  });

  it("assertWorkerServiceOperation allows downstream worker/outbox operations", () => {
    for (const op of ["DRAIN_OUTBOX", "MATERIALIZE_ARTIFACT", "MARK_ARTIFACT_AVAILABLE", "VOID_ARTIFACT"]) {
      expect(assertWorkerServiceOperation(op).ok).toBe(true);
    }
  });
});

describe("legacy-route containment (Task 11 §9/§15) — no P2 leak, no dual authority", () => {
  const legacy = (method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method, headers: { authorization: userBearer } };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return new Request(`https://edge.example/functions/v1/factory-api${path}`, init);
  };

  it("GET /export returns no reusable signed URL and no raw locator (STORE_PLAINTEXT_ACCESS_DENIED)", async () => {
    const res = await handleFactoryApi(legacy("GET", "/api/factory/jobs/JOB-1/export"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.reason).toBe("STORE_PLAINTEXT_ACCESS_DENIED");
    expect(body).not.toHaveProperty("url");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("signedurl");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("token=");
  });

  it("POST /packet (client-built P2 upload / dual write) is denied", async () => {
    const res = await handleFactoryApi(legacy("POST", "/api/factory/jobs/JOB-1/packet", { zipBase64: "UEsDBBQ" }));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("STORE_PLAINTEXT_ACCESS_DENIED");
  });

  it("legacy POST freeze/release/revoke/unfreeze (client actor mutable authority) is denied — no dual write", async () => {
    for (const action of ["freeze", "release", "revoke", "unfreeze"]) {
      const res = await handleFactoryApi(legacy("POST", `/api/factory/jobs/JOB-1/${action}`, { note: "x" }));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.reason).toBe("LEGACY_AUTHORITY_REMOVED");
      expect(String(body.useV3 ?? "")).toContain("/v3/factory");
    }
  });

  it("a legacy denial never reads a client actor role/name header as authority", async () => {
    const res = await handleFactoryApi(
      new Request("https://edge.example/functions/v1/factory-api/api/factory/jobs/JOB-1/freeze", {
        method: "POST",
        headers: { authorization: userBearer, "content-type": "application/json", "x-actor-role": "ADMIN", "x-actor-name": "mallory" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("ADMIN");
  });
});

describe("trust-kernel edge transport — pure helpers", () => {
  it("httpStatusForReason maps by namespace deterministically", () => {
    expect(httpStatusForReason("AUTH_REQUIRED")).toBe(401);
    expect(httpStatusForReason("AUTH_ACTION_CONTEXT_EXPIRED")).toBe(401);
    expect(httpStatusForReason("AUTH_ANON_NOT_ALLOWED")).toBe(401);
    expect(httpStatusForReason("AUTH_SCOPE_DENIED")).toBe(403);
    expect(httpStatusForReason("AUTH_SOD_VIOLATION")).toBe(403);
    expect(httpStatusForReason("STATE_CANDIDATE_STALE")).toBe(409);
    expect(httpStatusForReason("STATE_CONFLICT")).toBe(409);
    expect(httpStatusForReason("TRUST_FRESHNESS_UNPROVEN")).toBe(409);
    expect(httpStatusForReason("CAP_UNKNOWN_TOOL")).toBe(422);
  });

  it("filterActionBody keeps only allow-listed fields per action and drops authority fields", () => {
    const dirty = {
      candidateHash: HASH,
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: "k",
      requestHash: REQH,
      role: "ADMIN",
      tenantId: "T",
      siteId: "S",
      name: "x",
      spoof: "spoof",
    };
    const clean = filterActionBody("RELEASE", dirty);
    expect(clean).toEqual({
      candidateHash: HASH,
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: "k",
      requestHash: REQH,
    });
    expect(filterActionBody("REVOKE", dirty)).toEqual({});
    expect(filterActionBody("REVOKE", { reason: "safety", role: "ADMIN" })).toEqual({ reason: "safety" });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
    storagePut: async () => { storage.put += 1; },
    storageSign: async () => { storage.sign += 1; return "https://signed.example/packet.zip"; },
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
    ["freeze", "/JOB-1/freeze", "POST", {}],
    ["release", "/JOB-1/release", "POST", {}],
    ["revoke", "/JOB-1/revoke", "POST", {}],
    ["unfreeze", "/JOB-1/unfreeze", "POST", {}],
    ["can-export", "/JOB-1/can-export", "GET", undefined],
    ["proof", "/JOB-1/proof", "GET", undefined],
    ["activity", "/JOB-1/activity", "GET", undefined],
    ["packet", "/JOB-1/packet", "POST", { zipBase64: btoa("zip") }],
    ["export", "/JOB-1/export", "GET", undefined],
    ["verify", "/JOB-1/verify", "POST", {}],
  ])("authenticates the %s route before use", async (_name, path, method, body) => {
    let authCalls = 0;
    const h = harness(ADMIN, {
      authenticate: async () => { authCalls += 1; return ADMIN; },
    });
    await handleFactoryApi(request(path as string, method as string, body), h.deps);
    expect(authCalls).toBe(1);
  });
});

describe("S17-1 spoof resistance and server-owned audit context", () => {
  it("ignores forged actor headers/body and writes only the verified server actor", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/freeze",
      "POST",
      { note: "ok", actorRole: "ADMIN", actorName: "body-forged" },
      { "x-actor-role": "ADMIN", "x-actor-name": "header-forged" },
    ), h.deps);
    expect(response.status).toBe(200);

    const transition = h.calls.find((call) => call.fn === "rpc_factory_job_transition");
    expect(transition?.body).toMatchObject({
      p_actor_subject_id: DESIGNER.subjectId,
      p_actor_roles: DESIGNER.roles,
      p_actor_site_codes: DESIGNER.siteCodes,
      p_authorization_context_id: DESIGNER.authorizationContextId,
      p_actor_role: "DESIGNER",
      p_actor_name: DESIGNER.name,
    });
    expect(JSON.stringify(transition?.body)).not.toContain("header-forged");
    expect(JSON.stringify(transition?.body)).not.toContain("body-forged");
  });

  it("a forged DESIGNER header cannot give a FACTORY principal transition rights", async () => {
    const h = harness(FACTORY);
    const response = await handleFactoryApi(request(
      "/JOB-1/release",
      "POST",
      {},
      { "x-actor-role": "DESIGNER" },
    ), h.deps);
    expect(response.status).toBe(403);
    expect(h.calls.find((call) => call.fn === "rpc_factory_job_transition")).toBeUndefined();
  });

  it("a forged FACTORY header cannot give a DESIGNER principal export rights", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/export",
      "GET",
      undefined,
      { "x-actor-role": "FACTORY" },
    ), h.deps);
    expect(response.status).toBe(403);
    expect(h.storage.sign).toBe(0);
  });

  it("packet and verify audit RPCs receive the verified JWT context", async () => {
    const packetHarness = harness(ADMIN);
    expect((await handleFactoryApi(request(
      "/JOB-1/packet", "POST", { zipBase64: btoa("packet") },
    ), packetHarness.deps)).status).toBe(200);
    const packet = packetHarness.calls.find((call) => call.fn === "rpc_factory_job_record_packet");
    expect(packet?.body).toMatchObject({
      p_actor_subject_id: ADMIN.subjectId,
      p_actor_roles: ADMIN.roles,
      p_actor_site_codes: ADMIN.siteCodes,
      p_authorization_context_id: ADMIN.authorizationContextId,
      p_actor_role: "ADMIN",
      p_actor_name: ADMIN.name,
    });

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

  it("blocks packet upload for FROZEN before any storage side effect", async () => {
    const h = harness(DESIGNER, {
      callRpc: async (fn, body) => {
        h.calls.push({ fn, body });
        return { ok: true, specState: "FROZEN" };
      },
    });
    const response = await handleFactoryApi(request(
      "/JOB-1/packet", "POST", { zipBase64: btoa("packet") },
    ), h.deps);
    expect(response.status).toBe(409);
    expect(h.storage.put).toBe(0);
    expect(h.calls.find((call) => call.fn === "rpc_factory_job_record_packet")).toBeUndefined();
  });

  it("blocks export even if a stale/malicious canExport flag says true for FROZEN", async () => {
    const h = harness(FACTORY, {
      callRpc: async () => ({
        ok: true,
        specState: "FROZEN",
        canExport: true,
        storagePath: "JOB-1/packet.zip",
      }),
    });
    const response = await handleFactoryApi(request("/JOB-1/export"), h.deps);
    expect(response.status).toBe(409);
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

  it("permits export only for a RELEASED packet and an authorized factory actor", async () => {
    const h = harness(FACTORY);
    const response = await handleFactoryApi(request("/JOB-1/export"), h.deps);
    expect(response.status).toBe(200);
    expect(h.storage.sign).toBe(1);
  });

  it("SQL migration 0162 removes legacy actor overloads and re-checks RELEASED under lock", () => {
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

describe("S18 jobs list real fields (0170)", () => {
  it("forwards jobName and pieceCount from the packet body to record_packet", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/packet",
      "POST",
      { zipBase64: btoa("packet"), jobName: "  Kitchen Set A  ", pieceCount: 42 },
    ), h.deps);
    expect(response.status).toBe(200);
    const packet = h.calls.find((call) => call.fn === "rpc_factory_job_record_packet");
    expect(packet?.body).toMatchObject({ p_job_name: "Kitchen Set A", p_piece_count: 42 });
  });

  it("nulls invalid jobName/pieceCount instead of forwarding garbage", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/packet",
      "POST",
      { zipBase64: btoa("packet"), jobName: 42, pieceCount: -3 },
    ), h.deps);
    expect(response.status).toBe(200);
    const packet = h.calls.find((call) => call.fn === "rpc_factory_job_record_packet");
    expect(packet?.body).toMatchObject({ p_job_name: null, p_piece_count: null });
  });

  it("omitting the metadata still uploads the packet and forwards nulls", async () => {
    const h = harness(DESIGNER);
    const response = await handleFactoryApi(request(
      "/JOB-1/packet",
      "POST",
      { zipBase64: btoa("packet") },
    ), h.deps);
    expect(response.status).toBe(200);
    expect(h.storage.put).toBe(1);
    const packet = h.calls.find((call) => call.fn === "rpc_factory_job_record_packet");
    expect(packet?.body).toMatchObject({ p_job_name: null, p_piece_count: null });
  });

  it("edge record_packet params exactly match the 0170 signature (deploy-order gate)", async () => {
    // Edge side: the exact named-argument set the packet route sends.
    const h = harness(DESIGNER);
    expect((await handleFactoryApi(request(
      "/JOB-1/packet", "POST", { zipBase64: btoa("packet") },
    ), h.deps)).status).toBe(200);
    const packet = h.calls.find((call) => call.fn === "rpc_factory_job_record_packet");
    const edgeParams = Object.keys(packet?.body ?? {}).sort();

    // SQL side: parameter names declared by 0170's create function.
    const sql = readFileSync(
      new URL("../../migrations/0170_factory_jobs_list_real_fields.sql", import.meta.url),
      "utf8",
    );
    const declaration = /create function public\.rpc_factory_job_record_packet\(([^)]*)\)/.exec(sql);
    const sqlParams = (declaration?.[1].match(/p_[a-z0-9_]+/g) ?? []).sort();

    // PostgREST resolves an RPC by its named-argument set: any drift between
    // the two sides fails every packet upload with a signature mismatch.
    expect(sqlParams.length).toBeGreaterThan(0);
    expect(edgeParams).toEqual(sqlParams);
  });

  it("0170 keeps the old edge callable and documents the human apply order (ADR-066)", () => {
    const sql = readFileSync(
      new URL("../../migrations/0170_factory_jobs_list_real_fields.sql", import.meta.url),
      "utf8",
    );
    // Transition safety: an edge deployed before S18 omits the two new params,
    // so they must carry defaults for the function to keep resolving.
    expect(sql).toMatch(/p_job_name text default null/);
    expect(sql).toMatch(/p_piece_count integer default null/);
    // The apply order must be written where the human operator will read it:
    // apply 0170 first, deploy the new factory-api edge second.
    expect(sql).toContain("DEPLOY ORDER");
    expect(sql).toContain("apply 0170");
  });

  it("SQL migration 0170 adds jobName, pieceCount, and short packet hash to the jobs list", () => {
    const sql = readFileSync(
      new URL("../../migrations/0170_factory_jobs_list_real_fields.sql", import.meta.url),
      "utf8",
    );
    // Columns behind the new fields.
    expect(sql).toContain("add column if not exists job_name text");
    expect(sql).toContain("add column if not exists piece_count integer");
    // Jobs list tells the truth the factory can use.
    expect(sql).toContain("'jobName', j.job_name");
    expect(sql).toContain("'pieceCount', j.piece_count");
    expect(sql).toContain("'packetShaShort', left(j.packet_sha256, 12)");
    // Old record_packet signature is dropped before the new one exists —
    // PostgREST must never see an ambiguous overload pair.
    expect(sql).toContain(
      "drop function if exists public.rpc_factory_job_record_packet(text, text, text, text, text, text[], text[], text, text, text)",
    );
    expect(sql).toContain("p_job_name");
    expect(sql).toContain("p_piece_count");
    // Service-role-only stays intact for every new signature.
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});

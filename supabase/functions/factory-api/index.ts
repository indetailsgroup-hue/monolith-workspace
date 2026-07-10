// Edge Function: factory-api (ADR-060 — P10/P11/P12 Factory State Server)
//
// Server authority ของ MONOLITH Designer Workspace ที่ไม่เคยถูกสร้าง (ราก S15-1):
//   GET  .../api/factory/jobs/:id/state
//   POST .../api/factory/jobs/:id/freeze | release | revoke
//   GET  .../api/factory/jobs/:id/can-export
//   GET  .../api/factory/jobs/:id/proof
//   GET  .../api/health
// ตรรกะ state machine อยู่ใน SQL (rpc_factory_job_* — service_role only, ทุก transition ลง event)
// ฟังก์ชันนี้เป็น HTTP ชั้นบาง + CORS ให้เบราว์เซอร์ Designer เรียกตรงได้
//
// Auth: caller ต้องแนบ JWT (session จาก Field App — align ADR-058); platform verify_jwt ตรวจให้

function getEnv(key: string): string {
  const value = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-actor-role, x-actor-name",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function callRpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `rpc ${fn} failed (${res.status})`);
  }
  return res.json();
}

const PACKET_BUCKET = "factory-packets";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function storagePut(path: string, bytes: Uint8Array): Promise<void> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/storage/v1/object/${PACKET_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`, apikey: key,
      "content-type": "application/zip", "x-upsert": "true",
    },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
  if (!res.ok) throw new Error(`storage put failed (${res.status})`);
}

async function storageSign(path: string, expiresInSec: number): Promise<string> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/storage/v1/object/sign/${PACKET_BUCKET}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSec }),
  });
  if (!res.ok) throw new Error(`storage sign failed (${res.status})`);
  const j = (await res.json()) as { signedURL?: string };
  if (!j.signedURL) throw new Error("no signedURL");
  return `${url}/storage/v1${j.signedURL}`;
}

async function storageGet(path: string): Promise<Uint8Array> {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/storage/v1/object/${PACKET_BUCKET}/${path}`, {
    headers: { authorization: `Bearer ${key}`, apikey: key },
  });
  if (!res.ok) throw new Error(`storage get failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function handleFactoryApi(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  // รองรับทั้ง .../factory-api/api/factory/jobs/... และ .../factory-api/factory/jobs/...
  const segments = url.pathname.split("/").filter((s) => s.length > 0);

  if (segments.includes("health")) {
    return json(200, { ok: true, service: "factory-api" });
  }

  const jobsIdx = segments.lastIndexOf("jobs");
  if (jobsIdx < 0) {
    return json(404, { ok: false, error: "unknown route" });
  }
  // ADR-061: GET /factory/jobs — รายการงานสำหรับ FactoryApp dashboard
  if (jobsIdx + 1 >= segments.length) {
    if (req.method !== "GET") return json(404, { ok: false, error: "unknown route" });
    try {
      return json(200, await callRpc("rpc_factory_jobs_list", {}));
    } catch (e) {
      console.error(`factory-api list: ${String(e)}`);
      return json(500, { ok: false, error: "factory-api internal error" });
    }
  }
  const jobId = decodeURIComponent(segments[jobsIdx + 1]);
  const action = segments[jobsIdx + 2] ?? "state";
  const actorRole = req.headers.get("x-actor-role") ?? "DESIGNER";
  const actorName = req.headers.get("x-actor-name") ?? "Designer";

  try {
    if (req.method === "GET" && action === "state") {
      return json(200, await callRpc("rpc_factory_job_state", { p_job_id: jobId }));
    }
    if (req.method === "GET" && action === "can-export") {
      const state = (await callRpc("rpc_factory_job_state", { p_job_id: jobId })) as {
        ok: boolean; specState?: string; revisionId?: string;
      };
      const can = state.specState === "FROZEN" || state.specState === "RELEASED";
      return json(200, {
        ok: true,
        canExport: can,
        specState: state.specState,
        revisionId: state.revisionId,
        reason: can ? undefined : "Spec must be FROZEN or RELEASED to export",
      });
    }
    if (req.method === "GET" && action === "activity") {
      return json(200, await callRpc("rpc_factory_job_activity", { p_job_id: jobId }));
    }
    if (req.method === "GET" && action === "proof") {
      return json(200, await callRpc("rpc_factory_job_proof", { p_job_id: jobId }));
    }
    // ── ADR-061 packet store: ปิดลูป design→factory ──
    if (req.method === "POST" && action === "packet") {
      // Designer อัปโหลด packet ZIP (base64) — edge คำนวณ sha เอง ไม่เชื่อ client
      const body = (await req.json().catch(() => null)) as
        { zipBase64?: string; manifestSha256?: string } | null;
      if (!body?.zipBase64) return json(400, { ok: false, error: "missing zipBase64" });
      const bytes = b64ToBytes(body.zipBase64);
      if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
        return json(400, { ok: false, error: "invalid packet size" });
      }
      const sha = await sha256Hex(bytes);
      const path = `${encodeURIComponent(jobId)}/${sha}.zip`;
      await storagePut(path, bytes);
      const rec = await callRpc("rpc_factory_job_record_packet", {
        p_job_id: jobId, p_packet_sha256: sha,
        p_manifest_sha256: body.manifestSha256 ?? null,
        p_storage_path: path, p_actor_role: actorRole, p_actor_name: actorName,
      });
      return json(200, rec);
    }
    if (req.method === "GET" && action === "export") {
      const info = (await callRpc("rpc_factory_job_packet_info", { p_job_id: jobId })) as
        { ok: boolean; canExport?: boolean; storagePath?: string; packetSha256?: string; revisionId?: string; specState?: string };
      if (!info.ok) return json(404, info);
      if (!info.canExport || !info.storagePath) {
        return json(409, { ok: false, error: "no packet to export",
          reason: info.specState === "DRAFT" ? "spec is DRAFT" : "packet not uploaded yet" });
      }
      const url = await storageSign(info.storagePath, 60 * 60); // 1 ชม.
      return json(200, { ok: true, url, sha256: info.packetSha256, revisionId: info.revisionId });
    }
    if (req.method === "POST" && action === "verify") {
      const info = (await callRpc("rpc_factory_job_packet_info", { p_job_id: jobId })) as
        { ok: boolean; storagePath?: string; packetSha256?: string };
      if (!info.ok) return json(404, info);
      if (!info.storagePath || !info.packetSha256) {
        return json(409, { ok: false, error: "no packet recorded" });
      }
      const bytes = await storageGet(info.storagePath);
      const computed = await sha256Hex(bytes);
      const verdict = computed === info.packetSha256 ? "PASS" : "FAIL";
      await callRpc("rpc_factory_job_verify_result", {
        p_job_id: jobId, p_verdict: verdict, p_computed_sha256: computed,
        p_actor_role: actorRole, p_actor_name: actorName,
      });
      return json(200, { ok: true, verdict, expected: info.packetSha256, computed, bytes: bytes.length });
    }

    if (req.method === "POST" && ["freeze", "release", "revoke", "unfreeze"].includes(action)) {
      const body = (await req.json().catch(() => ({}))) as { note?: string; changeClass?: string };
      return json(200, await callRpc("rpc_factory_job_transition", {
        p_job_id: jobId,
        p_action: action,
        p_actor_role: actorRole,
        p_actor_name: actorName,
        p_note: body.note ?? null,
        p_change_class: body.changeClass ?? null,
      }));
    }
    return json(404, { ok: false, error: "unknown route" });
  } catch (e) {
    console.error(`factory-api: ${String(e)}`);
    return json(500, { ok: false, error: "factory-api internal error" });
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve((req) => handleFactoryApi(req));
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

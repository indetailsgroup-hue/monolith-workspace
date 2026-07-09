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
  if (jobsIdx < 0 || jobsIdx + 1 >= segments.length) {
    return json(404, { ok: false, error: "unknown route" });
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
    if (req.method === "GET" && action === "proof") {
      return json(200, await callRpc("rpc_factory_job_proof", { p_job_id: jobId }));
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

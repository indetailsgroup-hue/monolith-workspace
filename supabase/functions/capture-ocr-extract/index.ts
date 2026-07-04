// Edge Function: capture-ocr-extract
// Feature: capture-spine (Phase 2) — task 5.2 (Req 2.1, 2.2, 2.3, 2.4, 6.1, 7.1) + ADR-033 (Extraction_Engine seam)
// Stage1 OCR → Stage2 extract (typed fields + confidence + provenance) → rpc_capture_set_extraction.
// Engine seam (ADR-033): CAPTURE_EXTRACTION_ENGINE = 'typhoon' (default, on-prem) | 'claude' (bridge).
//   typhoon: on-prem invariant เดิม (Req 2.1/2.3, Property 8) — endpoint ต้องอยู่ใน infra DAPH.
//   claude (bridge): อนุญาตเฉพาะ capture_type ที่ cloud_allowed=true (ตรวจกับ DB ก่อน egress เสมอ — fail-safe);
//     endpoint จำกัดที่ api.anthropic.com เท่านั้น (allowlist แคบ); ai_provider/model_version บันทึกเป็น provenance.
// fail-safe (Req 6.1): สกัดไม่ได้ → ไม่เดา; throw → catch → rpc_capture_log_failure (tx แยก, best-effort).

export interface RpcError { code?: string; message?: string }

export interface OcrExtractBody {
  artifact_id: string;
  raw_uri: string;
  capture_type: string;
}

export interface ExtractionResult {
  fields: Record<string, unknown>;        // field ที่สกัดไม่ได้ = null (ไม่เดา — Req 6.1)
  confidence: Record<string, number>;
  fraudSignals: unknown[];
  aiProvider: string;
  modelVersion: string;
}

export interface CaptureOcrDeps {
  ocrStage1: (rawUri: string) => Promise<string>;
  extractStage2: (ocrText: string, captureType: string) => Promise<ExtractionResult>;
  setExtraction: (
    args: { id: string; ocrText: string; ext: ExtractionResult },
    authHeader: string,
  ) => Promise<{ error: RpcError | null }>;
  logFailure: (args: { artifactId: string; captureType: string; reason: string }) => Promise<void>;
  /** ADR-033: engine ที่ใช้ ('typhoon' default) — engine อื่นบังคับตรวจ cloudAllowed ก่อนส่งงานออก */
  engine?: string;
  /** ADR-033: ตรวจกับ DB ว่า capture_type นี้ส่งขึ้น cloud ได้ (rpc_capture_cloud_allowed) — fail-safe: ไม่มี = false */
  cloudAllowed?: (captureType: string, authHeader: string) => Promise<boolean>;
}

/** Property 8 / Req 2.1 — endpoint ต้องเป็น on-prem (private IPv4 / .internal / .local / localhost) ไม่ใช่ public/cross-border.
 *  M1 fix: ตรวจ IPv4 literal จริง (4 octets ≤255) ก่อนใช้ private-range rule — กัน hostname หลอกอย่าง "10.evil.com". */
export function isOnPremEndpoint(rawUrl: string): boolean {
  let host: string;
  try { host = new URL(rawUrl).hostname; } catch { return false; }
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".internal") || lower.endsWith(".local")) return true;

  // ต้องเป็น IPv4 literal เท่านั้นจึงใช้กฎ private-range (กัน "10.evil.com" ที่เป็น public domain)
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return false;
  const oct = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (oct.some((x) => x > 255)) return false;
  if (oct[0] === 10) return true;                          // 10.0.0.0/8
  if (oct[0] === 192 && oct[1] === 168) return true;       // 192.168.0.0/16
  if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return true; // 172.16.0.0/12
  if (oct[0] === 127) return true;                         // loopback
  return false; // public IPv4 → ไม่อนุญาต (no cross-border)
}

export async function handleCaptureOcrExtract(req: Request, deps: CaptureOcrDeps): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.length === 0) return json(401, { error: "missing_authorization" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: OcrExtractBody;
  try { body = (await req.json()) as OcrExtractBody; } catch { return json(400, { error: "invalid_json" }); }
  if (typeof body?.artifact_id !== "string" || typeof body?.raw_uri !== "string" || typeof body?.capture_type !== "string") {
    return json(400, { error: "invalid_payload" });
  }

  // ADR-033: engine ที่ไม่ใช่ on-prem ต้องผ่าน cloud_allowed ต่อ capture_type ก่อน (fail-safe: ไม่มี checker = block)
  const engine = deps.engine ?? "typhoon";
  if (engine !== "typhoon") {
    const allowed = deps.cloudAllowed === undefined
      ? false
      : await deps.cloudAllowed(body.capture_type, authHeader).catch(() => false);
    if (!allowed) return json(403, { error: "cloud_extraction_not_allowed", capture_type: body.capture_type });
  }

  try {
    const ocrText = await deps.ocrStage1(body.raw_uri);
    const ext = await deps.extractStage2(ocrText, body.capture_type);
    const { error } = await deps.setExtraction({ id: body.artifact_id, ocrText, ext }, authHeader);
    if (error !== null) return json(statusForError(error), { error: "set_extraction_error", code: error.code });
    return json(200, { artifact_id: body.artifact_id, ai_provider: ext.aiProvider });
  } catch (e) {
    // best-effort failure-audit (tx แยก) — ไม่เติมค่าเดา, ส่งให้คนกรอก (Req 6.1/7.1)
    const reason = e instanceof Error ? e.message : "extraction_failed";
    try { await deps.logFailure({ artifactId: body.artifact_id, captureType: body.capture_type, reason }); } catch { /* best-effort */ }
    return json(502, { error: "extraction_failed" });
  }
}

// ---------------------------------------------------------------------------
// Default forwarders — OCR/extract in-infra (on-prem guard) + user-scoped client
// ---------------------------------------------------------------------------
interface RpcClient { rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }
async function getUserScopedClient(authHeader: string): Promise<RpcClient> {
  const mod = await import("https://esm.sh/@supabase/supabase-js@2");
  return (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
    getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
}

function statusForError(error: RpcError): number {
  switch (error.code) {
    case "insufficient_privilege": return 403;
    case "no_data_found": return 404;
    case "check_violation": return 400;
    default: return 400;
  }
}

/** ADR-033: allowlist แคบสำหรับ engine=claude — เฉพาะ Anthropic API เท่านั้น (ไม่ใช่ egress ทั่วไป) */
export function isAllowedCloudEndpoint(rawUrl: string): boolean {
  try { return new URL(rawUrl).hostname === "api.anthropic.com"; } catch { return false; }
}

const CLAUDE_API = "https://api.anthropic.com/v1/messages";

function claudeDeps(): Pick<CaptureOcrDeps, "ocrStage1" | "extractStage2"> {
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  const model = envOr("CAPTURE_CLAUDE_MODEL", "claude-haiku-4-5");
  if (!isAllowedCloudEndpoint(CLAUDE_API)) throw new Error("capture-ocr-extract: claude endpoint not in allowlist");

  const call = async (messages: unknown[]): Promise<string> => {
    const res = await fetch(CLAUDE_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, messages }),
    });
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
    if (j.error !== undefined) throw new Error(`claude: ${j.error.message ?? "api_error"}`);
    return (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  };

  return {
    // Stage1: อ่านเอกสารจาก on-prem storage เท่านั้น (raw_uri ต้อง on-prem — ไม่ fetch URL ภายนอก) → Claude OCR
    ocrStage1: async (rawUri) => {
      if (!isOnPremEndpoint(rawUri)) {
        throw new Error("capture-ocr-extract: raw_uri must be on-prem storage (no external fetch)");
      }
      const doc = await fetch(rawUri, { method: "GET" }) as unknown as { arrayBuffer: () => Promise<ArrayBuffer> };
      const buf = new Uint8Array(await doc.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const mediaType = rawUri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      return call([{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text", text: "OCR เอกสารนี้ทั้งหมด (ไทย/อังกฤษ) ตอบเป็นข้อความล้วนตามที่ปรากฏ ไม่ต้องอธิบาย" },
        ],
      }]);
    },
    // Stage2: extract typed fields — field ที่ไม่แน่ใจ = null (no-guess Req 6.1); confidence ต่อ field
    extractStage2: async (ocrText, captureType) => {
      const text = await call([{
        role: "user",
        content: [{
          type: "text",
          text: `จากข้อความ OCR ต่อไปนี้ สกัด fields ของเอกสารประเภท "${captureType}" ` +
            `ตอบเป็น JSON เท่านั้น: {"fields": {...}, "confidence": {"<field>": 0..1}} ` +
            `field ที่อ่านไม่ได้/ไม่แน่ใจ ให้ค่า null และ confidence ต่ำ ห้ามเดา\n\n${ocrText}`,
        }],
      }]);
      const m = /\{[\s\S]*\}/.exec(text);
      if (m === null) throw new Error("claude: extraction ไม่ใช่ JSON (fail-safe no-guess)");
      const parsed = JSON.parse(m[0]) as { fields?: Record<string, unknown>; confidence?: Record<string, number> };
      return {
        fields: parsed.fields ?? {},
        confidence: parsed.confidence ?? {},
        fraudSignals: [],
        aiProvider: "claude",
        modelVersion: model,
      };
    },
  };
}

export function defaultDeps(): CaptureOcrDeps {
  const engine = envOr("CAPTURE_EXTRACTION_ENGINE", "typhoon");

  let stages: Pick<CaptureOcrDeps, "ocrStage1" | "extractStage2">;
  if (engine === "claude") {
    stages = claudeDeps();
  } else {
    const ocrEndpoint = getEnv("TYPHOON_OCR_ENDPOINT");
    // on-prem invariant — refuse ถ้า endpoint ไม่ใช่ in-infra (Property 8)
    if (!isOnPremEndpoint(ocrEndpoint)) {
      throw new Error("capture-ocr-extract: TYPHOON_OCR_ENDPOINT must be on-prem (no public/cross-border)");
    }
    stages = {
      ocrStage1: async (rawUri) => {
        const res = await fetch(`${ocrEndpoint}/ocr`, { method: "POST", body: JSON.stringify({ raw_uri: rawUri }) });
        const j = (await res.json()) as { text?: string };
        return j.text ?? "";
      },
      extractStage2: async (ocrText, captureType) => {
        const res = await fetch(`${ocrEndpoint}/extract`, { method: "POST", body: JSON.stringify({ text: ocrText, capture_type: captureType }) });
        return (await res.json()) as ExtractionResult;
      },
    };
  }

  return {
    engine,
    ...stages,
    // ADR-033: ตรวจ cloud_allowed กับ DB (user-scoped) ก่อน egress — fail-safe: error = false
    cloudAllowed: async (captureType, auth) => {
      const c = await getUserScopedClient(auth);
      const { data, error } = await c.rpc("rpc_capture_cloud_allowed", { p_capture_type: captureType });
      if (error !== null) return false;
      return data === true;
    },
    setExtraction: async (a, auth) => {
      const c = await getUserScopedClient(auth);
      const { error } = await c.rpc("rpc_capture_set_extraction", {
        p_id: a.id, p_ocr_text: a.ocrText, p_fields: a.ext.fields, p_confidence: a.ext.confidence,
        p_ai_provider: a.ext.aiProvider, p_model_version: a.ext.modelVersion, p_fraud_signals: a.ext.fraudSignals,
      });
      return { error: (error as RpcError | null) ?? null };
    },
    logFailure: async (a) => {
      // failure-audit ใช้ service client (system) — tx แยก, best-effort
      const mod = await import("https://esm.sh/@supabase/supabase-js@2");
      const c = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => RpcClient)(
        getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
      await c.rpc("rpc_capture_log_failure", {
        p_capture_artifact_id: a.artifactId, p_capture_type: a.captureType, p_event_type: "failure",
        p_detail: { reason: a.reason },
      });
    },
  };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function getEnv(key: string): string {
  const v = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (v === undefined || v.length === 0) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}
function envOr(key: string, fallback: string): string {
  const v = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  return v === undefined || v.length === 0 ? fallback : v;
}
declare function btoa(data: string): string;
if (typeof Deno !== "undefined" && import.meta.main) { const d = defaultDeps(); Deno.serve((req) => handleCaptureOcrExtract(req, d)); }
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } } & Record<string, unknown>;
declare const fetch: (url: string, init?: Record<string, unknown>) => Promise<{ json: () => Promise<unknown> }>;

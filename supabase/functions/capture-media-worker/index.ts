// Edge Function: capture-media-worker
// Feature: installation-pm — task 1.4 (D-4 ครึ่ง load-bearing)
//
// ดึง media content จาก LINE (raw_uri 'line-message://<id>' — content บน LINE มีอายุจำกัด!)
// เข้า Storage bucket 'installation-media' + บันทึก bytes เป็น storage baseline (D-4)
//
// Trust boundary (pattern เดียวกับ notification-retry-worker):
//   * ไม่ถือ secret — channel token resolve จาก Vault ด้วย token_ref ที่ DB ให้มา
//   * DB คุยผ่าน RPC เท่านั้น (rpc_claim_line_media_fetches / rpc_record_media_fetch_result)
//   * error ที่บันทึก = status/ข้อความสั้น ไม่มี token/PII
//
// compress/thumbnail: follow-up (tasks 1.4 note) — รูปต้นฉบับปลอดภัยก่อนคือหัวใจ

export interface MediaFetchJob {
  artifact_id: string;
  line_message_id: string;
  site_code: string | null;
  token_ref: string | null;
}

export interface FetchedContent {
  bytes: Uint8Array;
  contentType: string;
}

export interface MediaWorkerDeps {
  /** claim งานรอดึงจาก DB (RPC) */
  claim: (limit: number) => Promise<MediaFetchJob[]>;
  /** resolve channel access token จาก Vault ด้วย ref (name-then-id pattern) */
  resolveToken: (tokenRef: string) => Promise<string | null>;
  /** GET LINE content API — คืน bytes+content-type; โยน error เมื่อ HTTP ไม่ 200 */
  fetchLineContent: (messageId: string, token: string) => Promise<FetchedContent>;
  /** upload เข้า bucket — คืน storage path */
  uploadToStorage: (path: string, content: FetchedContent) => Promise<void>;
  /** บันทึกผล (สำเร็จ: path/bytes/type — ล้มเหลว: error) ผ่าน RPC */
  recordResult: (
    artifactId: string,
    storagePath: string | null,
    bytes: number | null,
    contentType: string | null,
    error: string | null,
  ) => Promise<void>;
}

export interface MediaWorkerSummary {
  claimed: number;
  fetched: number;
  failed: number;
  totalBytes: number;
}

/** path ใน bucket: inst/{site|no-site}/{artifactId}.{ext จาก content-type} */
export function storagePathFor(job: MediaFetchJob, contentType: string): string {
  const ext = contentType === "image/png"
    ? "png"
    : contentType === "video/mp4"
    ? "mp4"
    : contentType === "audio/m4a" || contentType === "audio/x-m4a"
    ? "m4a"
    : "jpg"; // LINE ส่งรูปเป็น jpeg เป็นหลัก
  const site = job.site_code && job.site_code.length > 0 ? job.site_code : "no-site";
  return `inst/${site}/${job.artifact_id}.${ext}`;
}

/**
 * รอบทำงานหนึ่งครั้ง: claim → (ต่อ job) resolve token → fetch → upload → record.
 * ล้มเหลวต่อ job ไม่ล้มทั้ง batch; ทุก job จบด้วย recordResult เสมอ (สำเร็จหรือนับ attempt)
 */
export async function runMediaWorker(
  deps: MediaWorkerDeps,
  batchSize = 20,
): Promise<MediaWorkerSummary> {
  const jobs = await deps.claim(batchSize);
  const summary: MediaWorkerSummary = {
    claimed: jobs.length,
    fetched: 0,
    failed: 0,
    totalBytes: 0,
  };

  for (const job of jobs) {
    try {
      if (!job.token_ref) {
        throw new Error("channel_token_ref_missing");
      }
      const token = await deps.resolveToken(job.token_ref);
      if (!token) {
        throw new Error("channel_token_unresolved");
      }
      const content = await deps.fetchLineContent(job.line_message_id, token);
      const path = storagePathFor(job, content.contentType);
      await deps.uploadToStorage(path, content);
      await deps.recordResult(job.artifact_id, path, content.bytes.byteLength, content.contentType, null);
      summary.fetched += 1;
      summary.totalBytes += content.bytes.byteLength;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      summary.failed += 1;
      try {
        await deps.recordResult(job.artifact_id, null, null, null, reason);
      } catch {
        // record ล้มเหลว — งานยังอยู่ในคิว (attempts ไม่ขยับ) รอบหน้าลองใหม่
      }
    }
  }
  return summary;
}

export async function handleMediaWorker(
  req: Request,
  deps?: MediaWorkerDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  const resolved = deps ?? (await createSupabaseDeps());
  const summary = await runMediaWorker(resolved);
  return json(200, summary as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Production deps (Supabase service-role client + Vault + LINE content API)
// ---------------------------------------------------------------------------

interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  schema(name: string): {
    from(table: string): {
      select(cols: string): {
        eq(col: string, val: string): {
          limit(n: number): { maybeSingle(): Promise<{ data: { decrypted_secret?: unknown } | null }> };
        };
      };
    };
  };
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array | Blob,
        opts: Record<string, unknown>,
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

let cachedClient: RpcClient | null = null;

async function getServiceClient(): Promise<RpcClient> {
  if (cachedClient !== null) return cachedClient;
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const specifier = "https://esm.sh/@supabase/supabase-js@2";
  const mod = await import(specifier);
  cachedClient = (mod.createClient as (
    u: string,
    k: string,
    o: Record<string, unknown>,
  ) => RpcClient)(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  return cachedClient;
}

async function createSupabaseDeps(): Promise<MediaWorkerDeps> {
  const client = await getServiceClient();
  return {
    claim: async (limit) => {
      const { data, error } = await client.rpc("rpc_claim_line_media_fetches", { p_limit: limit });
      if (error !== null) throw new Error("claim_failed");
      return Array.isArray(data) ? (data as MediaFetchJob[]) : [];
    },
    resolveToken: async (tokenRef) => {
      // Vault ref → token: ลองตาม name ก่อน แล้วตาม id (pattern เดียวกับ notification-retry-worker)
      for (const col of ["name", "id"] as const) {
        const { data } = await client
          .schema("vault")
          .from("decrypted_secrets")
          .select("decrypted_secret")
          .eq(col, tokenRef)
          .limit(1)
          .maybeSingle();
        const secret = data?.decrypted_secret;
        if (typeof secret === "string" && secret.length > 0) {
          return secret;
        }
      }
      return null;
    },
    fetchLineContent: async (messageId, token) => {
      const res = await fetch(
        `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        // ไม่มี token/PII ใน error — status เท่านั้น (LINE content หมดอายุ = 404)
        throw new Error(`line_content_http_${res.status}`);
      }
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, contentType };
    },
    uploadToStorage: async (path, content) => {
      const { error } = await client.storage.from("installation-media").upload(path, content.bytes, {
        contentType: content.contentType,
        upsert: true, // idempotent: retry เขียนทับ path เดิม (path คีย์ด้วย artifact id)
      });
      if (error !== null) throw new Error(`storage_upload_failed:${error.message}`);
    },
    recordResult: async (artifactId, storagePath, bytes, contentType, errorDetail) => {
      const { error } = await client.rpc("rpc_record_media_fetch_result", {
        p_artifact_id: artifactId,
        p_storage_path: storagePath,
        p_bytes: bytes,
        p_content_type: contentType,
        p_error: errorDetail,
      });
      if (error !== null) throw new Error("record_failed");
    },
  };
}

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

if (typeof Deno !== "undefined" && import.meta.main) {
  Deno.serve(handleMediaWorker);
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

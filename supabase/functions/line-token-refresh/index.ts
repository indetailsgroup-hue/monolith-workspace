// Edge Function: line-token-refresh (S13-2 / 0154)
//
// LINE channel access token (v2 oauth client_credentials) มีอายุ 30 วัน —
// cron (wf-line-token-refresh, pattern 0089) เรียกฟังก์ชันนี้ทุก 10 วันเพื่อ:
//   1. ดึง channel creds จาก Vault ผ่าน rpc_line_token_rotation_creds (service_role only)
//   2. ขอ token ใหม่จาก LINE oauth
//   3. เก็บลง Vault ผ่าน rpc_rotate_line_token (+audit line_token_rotated)
//
// ไม่มี secret ใดออกนอก response — คืนแค่สถานะ/อายุ token.

interface RotationCreds {
  channel_id: string;
  channel_secret: string;
}

function getEnv(key: string): string {
  const value = typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
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
    const err = await res.json().catch(() => ({}));
    throw new Error(`${fn} failed: ${(err as { message?: string }).message ?? res.status}`);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export async function handleTokenRefresh(_req: Request): Promise<Response> {
  try {
    const creds = await callRpc<RotationCreds>("rpc_line_token_rotation_creds", {});

    const oauth = await fetch("https://api.line.me/v2/oauth/accessToken", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.channel_id,
        client_secret: creds.channel_secret,
      }),
    });
    const tok = (await oauth.json()) as { access_token?: string; expires_in?: number };
    if (!oauth.ok || !tok.access_token) {
      throw new Error(`line oauth failed: ${oauth.status}`);
    }

    await callRpc("rpc_rotate_line_token", { p_token: tok.access_token });

    return new Response(
      JSON.stringify({
        status: "rotated",
        expires_days: tok.expires_in ? Math.round(tok.expires_in / 86400) : null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    // ไม่มี secret ใน error message (creds ไม่ถูก interpolate)
    console.error(`line-token-refresh: ${String(e)}`);
    return new Response(JSON.stringify({ status: "error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve((req) => handleTokenRefresh(req));
}

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get: (key: string) => string | undefined };
} & Record<string, unknown>;

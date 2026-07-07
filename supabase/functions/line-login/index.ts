// Edge Function: line-login — ADR-040 มติ 2: LINE Login = session + binding + consent จังหวะเดียว
// POST { code, redirect_uri, bind_token? } →
//   แลก code กับ LINE (client id/secret จาก Vault: 'line_login_channel_id'/'line_login_channel_secret')
//   → verify id_token → rpc_line_login_upsert (binding/consent/auth map)
//   → admin สร้าง/หา user (email placeholder ต่อ line_user_id) → generateLink magiclink
//   → คืน { email, token_hash } — client เรียก verifyOtp ได้ session
// ไม่มี secret ในคำตอบ/log (pattern เดิม)

interface LoginBody { code?: string; redirect_uri?: string; bind_token?: string }

export async function handleLineLogin(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: LoginBody;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }
  if (!body.code || !body.redirect_uri) return json(400, { error: "code_and_redirect_required" });

  const client = await getServiceClient();
  const channelId = await vaultSecret(client, "line_login_channel_id");
  const channelSecret = await vaultSecret(client, "line_login_channel_secret");
  if (!channelId || !channelSecret) return json(500, { error: "line_login_channel_not_configured" });

  // (1) แลก authorization code → id_token
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code: body.code, redirect_uri: body.redirect_uri,
      client_id: channelId, client_secret: channelSecret,
    }),
  });
  if (!tokenRes.ok) return json(401, { error: `line_token_http_${tokenRes.status}` });
  const tok = await tokenRes.json() as { id_token?: string };
  if (!tok.id_token) return json(401, { error: "no_id_token" });

  // (2) verify id_token กับ LINE (ไม่ decode เอง)
  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: tok.id_token, client_id: channelId }),
  });
  if (!verifyRes.ok) return json(401, { error: `line_verify_http_${verifyRes.status}` });
  const idt = await verifyRes.json() as { sub?: string; name?: string };
  if (!idt.sub) return json(401, { error: "no_sub" });

  // (3) auth user (email placeholder deterministic ต่อ line_user_id)
  const email = `line-${idt.sub.toLowerCase()}@field.daph.internal`;
  let userId: string | null = null;
  const created = await client.auth.admin.createUser({ email, email_confirm: true });
  if (created.data?.user) userId = created.data.user.id;
  if (!userId) {
    // มีอยู่แล้ว → generateLink คืน user เดิมด้วย
    const link0 = await client.auth.admin.generateLink({ type: "magiclink", email });
    userId = link0.data?.user?.id ?? null;
    if (!userId) return json(500, { error: "user_resolve_failed" });
  }

  // (4) binding/consent/auth map — service role RPC (ผูกครั้งแรกต้องมี bind_token จากออฟฟิศ)
  const up = await client.rpc("rpc_line_login_upsert", {
    p_line_user_id: idt.sub, p_display_name: idt.name ?? "", p_auth_user_id: userId,
    p_bind_token: body.bind_token ?? null,
  });
  if (up.error) return json(403, { error: scrub(up.error.message) });

  // (5) mint session
  const link = await client.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  if (!hash) return json(500, { error: "link_failed" });
  return json(200, { email, token_hash: hash });
}

function scrub(m: string): string { return m.replace(/[A-Za-z0-9._\-+/=]{40,}/g, "[REDACTED]"); }

interface AdminClient {
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  schema(name: string): {
    from(t: string): { select(c: string): { eq(col: string, v: string): {
      limit(n: number): { maybeSingle(): Promise<{ data: { decrypted_secret?: unknown } | null }> } } } };
  };
  auth: { admin: {
    createUser(a: { email: string; email_confirm: boolean }): Promise<{ data: { user: { id: string } | null } | null }>;
    generateLink(a: { type: string; email: string }): Promise<{ data: { user?: { id: string } | null; properties?: { hashed_token?: string } } | null }>;
  } };
}
let cached: AdminClient | null = null;
async function getServiceClient(): Promise<AdminClient> {
  if (cached) return cached;
  const mod = await import("https://esm.sh/@supabase/supabase-js@2");
  cached = (mod.createClient as (u: string, k: string, o: Record<string, unknown>) => AdminClient)(
    env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  return cached;
}
async function vaultSecret(client: AdminClient, name: string): Promise<string | null> {
  for (const col of ["name", "id"] as const) {
    const { data } = await client.schema("vault").from("decrypted_secrets")
      .select("decrypted_secret").eq(col, name).limit(1).maybeSingle();
    const s = data?.decrypted_secret;
    if (typeof s === "string" && s.length > 0) return s;
  }
  return null;
}
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json", "access-control-allow-origin": "*" } });
}
function env(k: string): string {
  const v = typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}
if (typeof Deno !== "undefined" && import.meta.main) {
  Deno.serve((req) => req.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "POST, OPTIONS" } })
    : handleLineLogin(req));
}
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => unknown; env: { get: (k: string) => string | undefined } } & Record<string, unknown>;

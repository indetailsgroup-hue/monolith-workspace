// doc-view — PK-4b (ADR-045 Q1ก/Q4ก): หน้าเว็บอ่านเอกสารเงิน/สัญญา/VO ผ่าน token อายุจำกัด
// GET ?token=<uuid> → rpc_doc_view_resolve (service role — นับการเปิด + audit ในตัว)
// ไม่มี auth ผู้ใช้: token = ความลับของลิงก์ (ลูกค้าเปิดจาก LINE ตรงๆ); หมดอายุ/ไม่พบ = หน้าอธิบายสุภาพ
// เอกสาร = HTML print-friendly (กด save เป็น PDF จากเบราว์เซอร์ได้ — มติปัดตก PDF engine)

import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function page(title: string, inner: string): Response {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — DAPH</title>
<style>
  body{margin:0;background:#f4f1ea;color:#22271f;font-family:"Noto Sans Thai","Segoe UI",sans-serif;line-height:1.7;font-size:17px}
  header{background:#1F3D2B;color:#fff;padding:18px 20px;font-weight:700}
  header small{display:block;color:#C7A86A;font-weight:600;letter-spacing:.08em}
  main{max-width:760px;margin:0 auto;padding:20px}
  .doc{background:#fffdf7;border:1px solid #ddd6c7;border-radius:12px;padding:22px;white-space:pre-wrap;word-break:break-word}
  .muted{color:#697263}
  @media print{header{-webkit-print-color-adjust:exact}main{max-width:none}.doc{border:none}}
</style></head><body>
<header><small>DAPH · IIMOS</small>${esc(title)}</header>
<main>${inner}</main>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID_RE.test(token)) {
    return page("ไม่พบเอกสาร", `<p class="muted">ลิงก์ไม่ถูกต้องครับ — ขอลิงก์ใหม่จากทีมงานผ่านกลุ่ม LINE ของท่านได้เลยครับ</p>`);
  }

  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data, error } = await client.rpc("rpc_doc_view_resolve", { p_token: token });
    if (error) throw new Error(error.message);

    const result = data as {
      ok: boolean;
      reason?: string;
      title?: string;
      body?: string;
      project_name?: string;
    };
    if (!result.ok) {
      if (result.reason === "expired") {
        return page(
          "ลิงก์หมดอายุแล้ว",
          `<p>ลิงก์เอกสารของบ้าน ${esc(result.project_name ?? "")} หมดอายุแล้วครับ (เพื่อความปลอดภัยของเอกสาร)</p>
           <p class="muted">ขอลิงก์ใหม่จากทีมงานผ่านกลุ่ม LINE ของท่านได้เลยครับ</p>`,
        );
      }
      return page("ไม่พบเอกสาร", `<p class="muted">ไม่พบเอกสารตามลิงก์นี้ครับ — ขอลิงก์ใหม่จากทีมงานได้เลยครับ</p>`);
    }
    return page(
      result.title ?? "เอกสาร",
      `<div class="doc">${esc(result.body ?? "")}</div>
       <p class="muted">เปิดจากลิงก์เฉพาะของบ้าน ${esc(result.project_name ?? "")} · พิมพ์/บันทึกเป็น PDF ได้จากเมนูเบราว์เซอร์</p>`,
    );
  } catch (err) {
    console.error(`doc-view: ${err instanceof Error ? err.message : "error"}`);
    return page("ขัดข้องชั่วคราว", `<p class="muted">ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง หรือติดต่อทีมงานครับ</p>`);
  }
});

// =============================================================================
// Edge Function : notify-overdue
// Path          : supabase/functions/notify-overdue/index.ts
// Purpose       : ส่ง notification สำหรับ overdue invoices ไปยัง LINE Notify / email
//                 ต่อ org — เรียกโดย pg_cron หรือ Supabase Scheduled Job
//
// Flow:
//   1. รับ Authorization (service role หรือ internal cron secret)
//   2. เรียก rpc_check_overdue_invoices(null, false) → สร้าง pending notifications
//   3. ดึง invoice_notifications ที่ status='pending' AND sent_at IS NULL
//   4. จัดกลุ่มตาม org_id
//   5. สำหรับแต่ละ org:
//      a. ดึง org notification settings (LINE Notify token, email)
//      b. ส่ง LINE Notify → POST https://notify-api.line.me/api/notify
//      c. หรือ ส่ง email ผ่าน Resend API
//      d. อัปเดต notification.status='sent', sent_at=now()
//   6. คืน summary { orgs_processed, sent, failed, skipped }
//
// Env vars required:
//   SUPABASE_URL              — Supabase project URL (injected automatically)
//   SUPABASE_SERVICE_ROLE_KEY — Service role key (injected automatically)
//   RESEND_API_KEY            — Resend email API key (optional; set in Supabase Secrets)
//   CRON_SECRET               — ค่า secret สำหรับยืนยัน cron caller (optional)
//   NOTIFICATION_FROM_EMAIL   — sender email (default: noreply@monolith.app)
//
// Triggered by:
//   - Supabase Scheduled Job (Dashboard → Integrations → Scheduled Jobs)
//     Schedule: "0 1 * * *" (01:00 UTC = 08:00 ICT)
//   - Manual HTTP POST (with Authorization: Bearer <CRON_SECRET>)
//
// NOTE: org notification settings are stored in organizations.notification_settings JSONB
//   Expected shape: {
//     "line_notify_token": "...",
//     "email": "finance@company.com",
//     "notify_channel": "line" | "email" | "both" | "none"
//   }
//   (เพิ่มคอลัมน์ด้วย: ALTER TABLE organizations ADD COLUMN IF NOT EXISTS
//    notification_settings JSONB DEFAULT '{}')
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceNotification {
  id: string;
  org_id: string;
  invoice_id: string;
  notification_type: string;
  status: string;
  days_overdue: number;
  amount_remaining: number;
  invoice_code: string;
  customer_name: string | null;
  snoozed_until: string | null;
  created_at: string;
}

interface OrgNotificationSettings {
  line_notify_token?: string;
  email?: string;
  notify_channel?: "line" | "email" | "both" | "none";
}

interface OrgRecord {
  org_id: string;
  name: string;
  notification_settings: OrgNotificationSettings | null;
}

interface NotificationGroup {
  org: OrgRecord;
  notifications: InvoiceNotification[];
}

interface SendResult {
  org_id: string;
  channel: string;
  sent: number;
  failed: number;
  error?: string;
}

interface FunctionSummary {
  run_at: string;
  rpc_result: unknown;
  orgs_processed: number;
  orgs_skipped: number;       // ไม่มี notification settings
  total_notifications: number;
  total_sent: number;
  total_failed: number;
  results: SendResult[];
}

// ---------------------------------------------------------------------------
// LINE Notify sender
// ---------------------------------------------------------------------------

/**
 * ส่ง message ผ่าน LINE Notify API
 * LINE Notify: POST https://notify-api.line.me/api/notify
 * Content-Type: application/x-www-form-urlencoded
 * Authorization: Bearer <token>
 */
async function sendLineNotify(
  token: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `LINE Notify HTTP ${resp.status}: ${body.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `LINE Notify fetch error: ${String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Email sender (Resend)
// ---------------------------------------------------------------------------

/**
 * ส่ง email ผ่าน Resend API
 * POST https://api.resend.com/emails
 */
async function sendEmail(
  resendApiKey: string,
  fromEmail: string,
  toEmail: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `Resend HTTP ${resp.status}: ${body.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Resend fetch error: ${String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Message formatters
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  overdue_1d:  "เลยกำหนดชำระ 1 วัน",
  overdue_7d:  "เลยกำหนดชำระ 7 วัน",
  overdue_30d: "เลยกำหนดชำระ 30 วัน",
  overdue_90d: "เลยกำหนดชำระ 90+ วัน (เสี่ยงหนี้สูญ)",
  due_soon_3d: "ใกล้ถึงกำหนดชำระ (3 วัน)",
  due_soon_7d: "ใกล้ถึงกำหนดชำระ (7 วัน)",
  partial_paid: "รับชำระบางส่วนแล้ว",
  fully_paid:  "ชำระครบแล้ว",
};

/**
 * สร้าง LINE Notify message สำหรับ org หนึ่ง
 * รวม notifications หลายรายการไว้ในข้อความเดียว (max 1000 chars)
 */
function formatLineMessage(orgName: string, notifications: InvoiceNotification[]): string {
  const lines: string[] = [
    `\n[Monolith] แจ้งเตือนใบแจ้งหนี้ — ${orgName}`,
    `วันที่: ${new Date().toLocaleDateString("th-TH")}`,
    `จำนวน: ${notifications.length} รายการ`,
    "──────────────────",
  ];

  let charCount = lines.join("\n").length;

  for (const n of notifications) {
    const label = NOTIFICATION_TYPE_LABELS[n.notification_type] ?? n.notification_type;
    const amountFormatted = new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n.amount_remaining);

    const entry = [
      `📋 ${n.invoice_code}`,
      `   ลูกค้า: ${n.customer_name ?? "Unknown"}`,
      `   สถานะ: ${label}`,
      `   ยอดค้าง: ฿${amountFormatted}`,
      `   เลยกำหนด: ${n.days_overdue} วัน`,
    ].join("\n");

    // LINE Notify max 1000 chars
    if (charCount + entry.length + 20 > 950) {
      const remaining = notifications.length - notifications.indexOf(n);
      lines.push(`\n...และอีก ${remaining} รายการ`);
      break;
    }
    lines.push("\n" + entry);
    charCount += entry.length;
  }

  return lines.join("\n");
}

/**
 * สร้าง HTML email สำหรับ org หนึ่ง
 */
function formatEmailHtml(orgName: string, notifications: InvoiceNotification[]): string {
  const rows = notifications.map((n) => {
    const label = NOTIFICATION_TYPE_LABELS[n.notification_type] ?? n.notification_type;
    const amountFormatted = new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
    }).format(n.amount_remaining);

    const riskColor = n.days_overdue >= 90
      ? "#dc2626"
      : n.days_overdue >= 30
      ? "#ea580c"
      : n.days_overdue >= 7
      ? "#d97706"
      : "#2563eb";

    return `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">${n.invoice_code}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${n.customer_name ?? "Unknown"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;color:${riskColor};font-weight:bold">${label}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">฿${amountFormatted}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;color:${riskColor}">${n.days_overdue} วัน</td>
      </tr>`;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="th">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#111827;max-width:800px;margin:0 auto;padding:24px">
  <h2 style="color:#1e3a5f">📋 รายงานใบแจ้งหนี้ค้างชำระ</h2>
  <p style="color:#6b7280">บริษัท: <strong>${orgName}</strong> &nbsp;|&nbsp; วันที่: ${new Date().toLocaleDateString("th-TH")}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">เลขที่ใบแจ้งหนี้</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">ลูกค้า</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">สถานะ</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">ยอดค้าง (THB)</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">เลยกำหนด</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:24px;font-size:13px;color:#9ca3af">
    อีเมลนี้ส่งโดยอัตโนมัติจาก Monolith Manufacturing OS — กรุณาอย่าตอบกลับ
  </p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Mark notifications as sent
// ---------------------------------------------------------------------------

async function markAsSent(
  supabase: SupabaseClient,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;

  const { error } = await supabase
    .from("invoice_notifications")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .in("id", notificationIds)
    .eq("status", "pending"); // ป้องกัน race condition

  if (error) {
    console.error("Failed to mark notifications as sent:", error.message);
  }
}

// ---------------------------------------------------------------------------
// Process one org
// ---------------------------------------------------------------------------

async function processOrg(
  supabase: SupabaseClient,
  group: NotificationGroup,
  resendApiKey: string | null,
  fromEmail: string,
): Promise<SendResult> {
  const { org, notifications } = group;
  const settings = org.notification_settings ?? {};
  const channel = settings.notify_channel ?? "none";

  const result: SendResult = {
    org_id: org.org_id,
    channel,
    sent: 0,
    failed: 0,
  };

  if (channel === "none" || (!settings.line_notify_token && !settings.email)) {
    result.error = "No notification channel configured";
    return result;
  }

  const sentIds: string[] = [];

  // ── LINE Notify ──────────────────────────────────────────────────────────
  if ((channel === "line" || channel === "both") && settings.line_notify_token) {
    const message = formatLineMessage(org.name, notifications);
    const lineResult = await sendLineNotify(settings.line_notify_token, message);

    if (lineResult.ok) {
      // LINE Notify ส่งทีละ org (1 message = all notifications) → mark all as sent
      sentIds.push(...notifications.map((n) => n.id));
      result.sent += notifications.length;
    } else {
      result.failed += notifications.length;
      result.error = lineResult.error;
      console.error(`[org:${org.org_id}] LINE Notify failed:`, lineResult.error);
    }
  }

  // ── Email (Resend) ───────────────────────────────────────────────────────
  if ((channel === "email" || channel === "both") && settings.email && resendApiKey) {
    const subject = `[Monolith] ใบแจ้งหนี้ค้างชำระ ${notifications.length} รายการ — ${org.name}`;
    const html = formatEmailHtml(org.name, notifications);
    const emailResult = await sendEmail(resendApiKey, fromEmail, settings.email, subject, html);

    if (emailResult.ok) {
      // ถ้ายังไม่ได้ mark จาก LINE step → mark ตอนนี้
      const unmarked = notifications
        .map((n) => n.id)
        .filter((id) => !sentIds.includes(id));
      sentIds.push(...unmarked);
      result.sent += unmarked.length;
    } else {
      result.failed += notifications.filter((n) => !sentIds.includes(n.id)).length;
      result.error = (result.error ? result.error + "; " : "") + emailResult.error;
      console.error(`[org:${org.org_id}] Email (Resend) failed:`, emailResult.error);
    }
  }

  // ── Mark sent in DB ──────────────────────────────────────────────────────
  if (sentIds.length > 0) {
    await markAsSent(supabase, sentIds);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // ── Auth: ยืนยัน cron caller ──────────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== cronSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // ── Supabase service role client ──────────────────────────────────────────
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? null;
  const fromEmail    = Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "noreply@monolith.app";

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const summary: FunctionSummary = {
    run_at: new Date().toISOString(),
    rpc_result: null,
    orgs_processed: 0,
    orgs_skipped: 0,
    total_notifications: 0,
    total_sent: 0,
    total_failed: 0,
    results: [],
  };

  try {
    // ── Step 1: รัน rpc_check_overdue_invoices → สร้าง pending notifications ──
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "rpc_check_overdue_invoices",
      { p_org_id: null, p_dry_run: false },
    );

    if (rpcError) {
      console.error("rpc_check_overdue_invoices failed:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "rpc_check_overdue_invoices failed", detail: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    summary.rpc_result = rpcData;

    // ── Step 2: ดึง pending notifications ──────────────────────────────────
    const { data: notifications, error: fetchError } = await supabase
      .from("invoice_notifications")
      .select("*")
      .eq("status", "pending")
      .is("sent_at", null)
      .order("org_id")
      .order("days_overdue", { ascending: false });

    if (fetchError) {
      console.error("Failed to fetch notifications:", fetchError.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch notifications", detail: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const notifs = (notifications ?? []) as InvoiceNotification[];
    summary.total_notifications = notifs.length;

    if (notifs.length === 0) {
      console.log("No pending notifications to process.");
      return new Response(JSON.stringify(summary), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Step 3: จัดกลุ่มตาม org_id ─────────────────────────────────────────
    const orgIds = [...new Set(notifs.map((n) => n.org_id))];

    // ดึง org settings ทีเดียว (1 query)
    const { data: orgs, error: orgsError } = await supabase
      .from("organizations")
      .select("org_id, name, notification_settings")
      .in("org_id", orgIds);

    if (orgsError) {
      console.error("Failed to fetch orgs:", orgsError.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch org settings", detail: orgsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const orgMap = new Map<string, OrgRecord>(
      (orgs ?? []).map((o: OrgRecord) => [o.org_id, o]),
    );

    // จัดกลุ่ม notifications ต่อ org
    const groups: NotificationGroup[] = orgIds.map((orgId) => ({
      org: orgMap.get(orgId) ?? {
        org_id: orgId,
        name: `Org ${orgId.substring(0, 8)}`,
        notification_settings: null,
      },
      notifications: notifs.filter((n) => n.org_id === orgId),
    }));

    // ── Step 4: ส่ง notifications แต่ละ org ─────────────────────────────────
    // ป้องกัน LINE rate limit: 1 request/org sequential (ไม่ parallel)
    // LINE Notify: 1,000 requests/day per token → sequential is safe
    for (const group of groups) {
      const settings = group.org.notification_settings ?? {};
      const channel = settings.notify_channel ?? "none";

      // Skip orgs ที่ไม่มี settings
      if (
        channel === "none" ||
        (!settings.line_notify_token && !settings.email)
      ) {
        summary.orgs_skipped++;
        console.log(`[org:${group.org.org_id}] Skipped — no notification channel configured`);
        continue;
      }

      console.log(
        `[org:${group.org.org_id}] Processing ${group.notifications.length} notifications via ${channel}`,
      );

      try {
        const orgResult = await processOrg(supabase, group, resendApiKey, fromEmail);
        summary.results.push(orgResult);
        summary.orgs_processed++;
        summary.total_sent  += orgResult.sent;
        summary.total_failed += orgResult.failed;
      } catch (orgErr) {
        // ไม่ให้ error ของ org หนึ่ง stop org อื่น
        const errMsg = String(orgErr);
        console.error(`[org:${group.org.org_id}] Unexpected error:`, errMsg);
        summary.results.push({
          org_id: group.org.org_id,
          channel,
          sent: 0,
          failed: group.notifications.length,
          error: errMsg,
        });
        summary.orgs_processed++;
        summary.total_failed += group.notifications.length;
      }
    }

    console.log(
      `notify-overdue complete: orgs=${summary.orgs_processed}, ` +
      `sent=${summary.total_sent}, failed=${summary.total_failed}, ` +
      `skipped_orgs=${summary.orgs_skipped}`,
    );

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Unexpected error in notify-overdue:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

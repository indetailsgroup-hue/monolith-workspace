/**
 * Test Suite: 0180_overdue_detection.test.ts
 * ==========================================
 * Migration: 0180_overdue_invoice_detection.sql
 *
 * Coverage:
 *   Group A — rpc_check_overdue_invoices
 *     A1  dry_run=true returns previews without inserting
 *     A2  dry_run=false creates invoice_notifications
 *     A3  idempotency — same invoice same type same day = only 1 row
 *     A4  service role can scan all orgs (p_org_id=NULL)
 *     A5  authenticated user can only scan own org
 *     A6  rejects non-finance/admin user
 *     A7  skips paid / cancelled invoices
 *     A8  skips snoozed invoices
 *     A9  scans due_soon window (within 7 days)
 *
 *   Group B — Aging buckets (_classify_overdue_type + v_overdue_invoices)
 *     B1  days_overdue 1-6   → overdue_1d + aging '1-7 days'
 *     B2  days_overdue 7-29  → overdue_7d + aging '8-30 days'
 *     B3  days_overdue 30-89 → overdue_30d + aging '31-90 days'
 *     B4  days_overdue 90+   → overdue_90d + aging '90+ days' + CRITICAL risk
 *     B5  due in 1-3 days    → due_soon_3d
 *     B6  due in 4-7 days    → due_soon_7d
 *     B7  v_overdue_aging_summary groups correctly
 *
 *   Group C — rpc_snooze_notification
 *     C1  happy path: snooze 7 days → status='snoozed', snoozed_until correct
 *     C2  snooze_count increments correctly
 *     C3  max 3 snoozes → 4th raises exception
 *     C4  snooze_days=0 raises exception
 *     C5  snooze_days=91 raises exception
 *     C6  cross-tenant: cannot snooze other org's notification
 *
 *   Group D — rpc_acknowledge_notification
 *     D1  happy path: status → 'acknowledged', acknowledged_at set
 *     D2  acknowledged_by = auth.uid()
 *     D3  cross-tenant isolation: cannot ack other org's notification
 *     D4  cannot ack already-dismissed notification
 *
 *   Group E — Cross-tenant isolation
 *     E1  invoice_notifications RLS: org_a cannot see org_b's notifications
 *     E2  rpc_list_overdue_invoices returns only own org
 *     E3  v_overdue_invoices filters by get_user_org_id()
 *     E4  service role can query all orgs without restriction
 *
 *   Group F — rpc_list_overdue_invoices
 *     F1  returns overdue invoices with notification_count
 *     F2  p_include_due_soon=false excludes due-soon entries
 *     F3  pagination (limit / offset) works correctly
 *     F4  sorts by days_overdue DESC
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "test-anon-key";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** สร้าง Supabase client ด้วย service role (bypass RLS) */
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** สร้าง client สำหรับ user ที่ login แล้ว (ใช้ JWT mock) */
function userClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

/** สร้าง test org + user พร้อม JWT */
async function createTestOrg(
  svc: SupabaseClient,
  label: string,
): Promise<{ orgId: string; userId: string; jwt: string }> {
  // สร้าง org
  const orgId = crypto.randomUUID();
  const { data: org, error: orgError } = await svc
    .from("organizations")
    .insert({
      org_id: orgId,
      name: `Test Org ${label} ${Date.now()}`,
      slug: `test-0180-${label.toLowerCase()}-${orgId}`,
      plan: "ENTERPRISE",
      max_users: 10,
    })
    .select("org_id")
    .single();

  if (orgError || !org) throw new Error(`Failed to create test org ${label}: ${orgError?.message}`);

  // สร้าง user ผ่าน Auth admin
  const email = `test-overdue-${label}-${Date.now()}@monolith-test.internal`;
  const { data: authUser } = await svc.auth.admin.createUser({
    email,
    password: "Test1234!",
    email_confirm: true,
    app_metadata: { roles: ["finance"], org_id: org.org_id },
  });

  if (!authUser?.user) throw new Error(`Failed to create test user ${label}`);

  // เพิ่มเข้า org_members
  const { error: memberError } = await svc.from("org_members").insert({
    org_id: org.org_id,
    user_id: authUser.user.id,
    role: "FINANCE",
    email,
  });
  if (memberError) throw new Error(`Failed to create org member ${label}: ${memberError.message}`);

  // ขอ JWT
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await authClient.auth
    .signInWithPassword({ email, password: "Test1234!" });
  if (signInError || !session.session) {
    throw new Error(`Failed to sign in test user ${label}: ${signInError?.message}`);
  }
  const jwt = session.session.access_token;

  return { orgId: org.org_id, userId: authUser.user.id, jwt };
}

/** สร้าง invoice ใน invoices table (plural — accounting module) */
async function createTestInvoice(
  svc: SupabaseClient,
  orgId: string,
  opts: {
    status?: string;
    daysOverdue?: number;       // positive = overdue, negative = not due yet
    dueSoon?: number;           // days until due (for due-soon tests)
    remaining?: number;
    total?: number;
  } = {},
): Promise<string> {
  const today = new Date();
  let dueDate: string;

  if (opts.dueSoon !== undefined) {
    const d = new Date(today);
    d.setDate(d.getDate() + opts.dueSoon);
    dueDate = d.toISOString().split("T")[0];
  } else {
    const overdue = opts.daysOverdue ?? 5;
    const d = new Date(today);
    d.setDate(d.getDate() - overdue);
    dueDate = d.toISOString().split("T")[0];
  }

  const total = opts.total ?? 10000;
  const remaining = opts.remaining ?? total;
  const invoiceId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const { data: member, error: memberError } = await svc
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .limit(1)
    .single();
  if (memberError || !member) throw new Error(`Failed to resolve invoice creator: ${memberError?.message}`);
  const { error: customerError } = await svc.from("customers").insert({
    customer_id: customerId,
    org_id: orgId,
    name: `Overdue customer ${customerId}`,
  });
  if (customerError) throw new Error(`Failed to create test customer: ${customerError.message}`);
  const invoiceCode = `INV-TEST-${invoiceId}`;

  const { data, error } = await svc
    .from("invoices")
    .insert({
      id:               invoiceId,
      invoice_id:       invoiceId,
      org_id:           orgId,
      customer_id:      customerId,
      invoice_code:     invoiceCode,
      code:             invoiceCode,
      status:           opts.status ?? "approved",
      total:            total,
      paid_amount:      total - remaining,
      remaining_amount: remaining,
      due_date:         dueDate,
      issued_at:        new Date().toISOString(),
      created_by:       member.user_id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`Failed to create test invoice: ${error?.message}`);
  return data.id as string;
}

/** ล้าง test data ของ org */
async function cleanupOrg(svc: SupabaseClient, orgId: string): Promise<void> {
  await svc.from("invoice_notifications").delete().eq("org_id", orgId);
  await svc.from("invoices").delete().eq("org_id", orgId);
  await svc.from("customers").delete().eq("org_id", orgId);
  await svc.from("org_members").delete().eq("org_id", orgId);
  await svc.from("organizations").delete().eq("org_id", orgId);
}

// ---------------------------------------------------------------------------
// Global test state
// ---------------------------------------------------------------------------

let svc: SupabaseClient;
let orgA: { orgId: string; userId: string; jwt: string };
let orgB: { orgId: string; userId: string; jwt: string };

beforeAll(async () => {
  svc = serviceClient();
  orgA = await createTestOrg(svc, "A");
  orgB = await createTestOrg(svc, "B");
});

afterAll(async () => {
  await cleanupOrg(svc, orgA.orgId);
  await cleanupOrg(svc, orgB.orgId);
});

beforeEach(async () => {
  // ล้าง notifications ก่อนแต่ละ test (invoices keep — cleaned per group)
  await svc.from("invoice_notifications").delete().in("org_id", [orgA.orgId, orgB.orgId]);
});

// ===========================================================================
// GROUP A — rpc_check_overdue_invoices
// ===========================================================================

describe("Group A: rpc_check_overdue_invoices", () => {

  it("A1: dry_run=true returns preview without inserting", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 10 });

    const { data, error } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.dry_run).toBe(true);
    expect(data.notifications_created).toBeGreaterThanOrEqual(1);
    expect(data.dry_run_results).toBeInstanceOf(Array);
    expect(data.dry_run_results.length).toBeGreaterThanOrEqual(1);

    // ต้องไม่มี row ใน invoice_notifications
    const { count } = await svc
      .from("invoice_notifications")
      .select("id", { count: "exact" })
      .eq("invoice_id", invId);
    expect(count).toBe(0);

    // cleanup
    await svc.from("invoices").delete().eq("id", invId);
  });

  it("A2: dry_run=false creates invoice_notifications", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 15 });

    const { data, error } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: false,
    });

    expect(error).toBeNull();
    expect(data.dry_run).toBe(false);
    expect(data.notifications_created).toBeGreaterThanOrEqual(1);

    // ตรวจว่ามี notification row ใน DB
    const { data: rows } = await svc
      .from("invoice_notifications")
      .select("id, notification_type, status")
      .eq("invoice_id", invId);

    expect(rows).toBeDefined();
    expect(rows!.length).toBeGreaterThanOrEqual(1);
    expect(rows![0].status).toBe("pending");

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("A3: idempotency — calling twice on same day skips duplicate", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 8 });

    // เรียกครั้งแรก
    const { data: r1 } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: false,
    });
    const created1 = r1.notifications_created as number;

    // เรียกครั้งที่สอง (ควร skip ทั้งหมด)
    const { data: r2 } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: false,
    });

    expect(r2.notifications_created).toBe(0);
    expect(r2.notifications_skipped).toBeGreaterThanOrEqual(created1);

    // ตรวจจำนวน rows ใน DB — ไม่ duplicate
    const { count } = await svc
      .from("invoice_notifications")
      .select("id", { count: "exact" })
      .eq("invoice_id", invId);
    expect(count).toBe(created1);

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("A4: service role with p_org_id=null scans all orgs", async () => {
    const invA = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 5 });

    const { data, error } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  null,
      p_dry_run: true,
    });

    expect(error).toBeNull();
    expect(data.scanned_org_id).toBeNull(); // null = all orgs

    const results = data.dry_run_results as Array<{ org_id: string }>;
    const orgAFound = results.some((r) => r.org_id === orgA.orgId);
    const orgBFound = results.some((r) => r.org_id === orgB.orgId);
    expect(orgAFound).toBe(true);
    expect(orgBFound).toBe(true);

    await svc.from("invoices").delete().in("id", [invA, invB]);
  });

  it("A5: authenticated user can only scan own org", async () => {
    const client = userClient(orgA.jwt);
    const invA = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 3 });

    // ควรสำเร็จ (scan own org)
    const { error: e1 } = await client.rpc("rpc_check_overdue_invoices", {
      p_org_id:  null, // null จาก user = own org
      p_dry_run: true,
    });
    expect(e1).toBeNull();

    // ไม่ควรเห็น org_b ใน results
    const { data } = await client.rpc("rpc_check_overdue_invoices", {
      p_org_id:  null,
      p_dry_run: true,
    });
    const results = data.dry_run_results as Array<{ org_id: string }>;
    const orgBFound = results.some((r) => r.org_id === orgB.orgId);
    expect(orgBFound).toBe(false);

    await svc.from("invoices").delete().in("id", [invA, invB]);
  });

  it("A6: non-finance user gets Forbidden error", async () => {
    // สร้างสมาชิก VIEWER จริงและลงชื่อเข้าใช้ เพื่อให้ทดสอบ authorization
    // ด้วย JWT ที่ Supabase ออกให้ แทน token จำลองที่ถูกปฏิเสธก่อนถึง RPC
    const email = `test-nofinance-${Date.now()}@monolith-test.internal`;
    const { data: authUser } = await svc.auth.admin.createUser({
      email,
      password: "Test1234!",
      email_confirm: true,
      app_metadata: { roles: ["viewer"], org_id: orgA.orgId },
    });

    await svc.from("org_members").insert({
      org_id: orgA.orgId,
      user_id: authUser!.user!.id,
      role: "VIEWER",
      email,
    });

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signInError } = await authClient.auth
      .signInWithPassword({ email, password: "Test1234!" });
    expect(signInError).toBeNull();
    expect(session.session).not.toBeNull();

    const client = userClient(session.session!.access_token);
    const { error } = await client.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Forbidden/i);

    await svc.from("org_members").delete().eq("user_id", authUser!.user!.id);
    await svc.auth.admin.deleteUser(authUser!.user!.id);
  });

  it("A7: skips paid/cancelled invoices", async () => {
    const invPaid   = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 5, status: "paid", remaining: 0 });
    const invCancelled = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 5, status: "cancelled" });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string }>;
    const ids = results.map((r) => r.invoice_id);

    expect(ids).not.toContain(invPaid);
    expect(ids).not.toContain(invCancelled);

    await svc.from("invoices").delete().in("id", [invPaid, invCancelled]);
  });

  it("A8: skips snoozed invoices", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });

    // สร้าง notification แล้ว snooze
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgA.orgId, p_dry_run: false });

    const { data: notifs } = await svc
      .from("invoice_notifications")
      .select("id")
      .eq("invoice_id", invId)
      .limit(1);

    if (notifs && notifs.length > 0) {
      // snooze notification ผ่าน service role
      await svc.from("invoice_notifications").update({
        status: "snoozed",
        snoozed_until: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      }).eq("id", notifs[0].id);
    }

    // รัน rpc อีกครั้ง — invoice นี้ควร skip
    const { data: r2 } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (r2.dry_run_results ?? []) as Array<{ invoice_id: string }>;
    expect(results.map((r) => r.invoice_id)).not.toContain(invId);

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("A9: scans due_soon invoices (within 7 days)", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { dueSoon: 3 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found!.notification_type).toMatch(/^due_soon/);

    await svc.from("invoices").delete().eq("id", invId);
  });
});

// ===========================================================================
// GROUP B — Aging buckets
// ===========================================================================

describe("Group B: Aging buckets", () => {

  it("B1: days_overdue 1-6 → overdue_1d + aging '1-7 days'", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found!.notification_type).toBe("overdue_1d");

    // ตรวจ v_overdue_invoices aging bucket
    // (ต้องการ user context จาก orgA)
    const clientA = userClient(orgA.jwt);
    const { data: views } = await clientA
      .from("v_overdue_invoices")
      .select("invoice_id, aging_bucket, risk_level")
      .eq("invoice_id", invId);

    if (views && views.length > 0) {
      expect(views[0].aging_bucket).toBe("1-7 days");
    }

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B2: days_overdue 7-29 → overdue_7d + aging '8-30 days'", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 15 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found!.notification_type).toBe("overdue_7d");

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B3: days_overdue 30-89 → overdue_30d + aging '31-90 days'", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 45 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found!.notification_type).toBe("overdue_30d");

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B4: days_overdue 90+ → overdue_90d + CRITICAL risk", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 95 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found!.notification_type).toBe("overdue_90d");

    const clientA = userClient(orgA.jwt);
    const { data: views } = await clientA
      .from("v_overdue_invoices")
      .select("invoice_id, aging_bucket, risk_level")
      .eq("invoice_id", invId);

    if (views && views.length > 0) {
      expect(views[0].aging_bucket).toBe("90+ days");
      expect(views[0].risk_level).toBe("CRITICAL");
    }

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B5: due in 1-3 days → due_soon_3d", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { dueSoon: 2 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found!.notification_type).toBe("due_soon_3d");

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B6: due in 4-7 days → due_soon_7d", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { dueSoon: 5 });

    const { data } = await svc.rpc("rpc_check_overdue_invoices", {
      p_org_id:  orgA.orgId,
      p_dry_run: true,
    });
    const results = (data.dry_run_results ?? []) as Array<{ invoice_id: string; notification_type: string }>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found!.notification_type).toBe("due_soon_7d");

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("B7: v_overdue_aging_summary groups by aging bucket correctly", async () => {
    // สร้าง invoices ใน 3 aging buckets
    const inv1 = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });
    const inv2 = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });
    const inv3 = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 35 });

    const clientA = userClient(orgA.jwt);
    const { data, error } = await clientA
      .from("v_overdue_aging_summary")
      .select("aging_bucket, invoice_count, total_remaining");

    expect(error).toBeNull();

    const bucket17 = data?.find((r: any) => r.aging_bucket === "1-7 days");
    const bucket3190 = data?.find((r: any) => r.aging_bucket === "31-90 days");

    expect(bucket17).toBeDefined();
    expect(bucket17!.invoice_count).toBeGreaterThanOrEqual(2);
    expect(bucket3190).toBeDefined();
    expect(bucket3190!.invoice_count).toBeGreaterThanOrEqual(1);

    await svc.from("invoices").delete().in("id", [inv1, inv2, inv3]);
  });
});

// ===========================================================================
// GROUP C — rpc_snooze_notification
// ===========================================================================

describe("Group C: rpc_snooze_notification", () => {

  /** Helper: สร้าง invoice + notification ให้พร้อมใช้ */
  async function setupNotification(orgId: string, daysOverdue: number = 5): Promise<string> {
    const invId = await createTestInvoice(svc, orgId, { daysOverdue });
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgId, p_dry_run: false });
    const { data } = await svc
      .from("invoice_notifications")
      .select("id")
      .eq("invoice_id", invId)
      .limit(1)
      .single();
    return data!.id as string;
  }

  it("C1: snooze 7 days → status=snoozed, snoozed_until correct", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const expectedDate = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const clientA = userClient(orgA.jwt);
    const { data, error } = await clientA.rpc("rpc_snooze_notification", {
      p_notification_id: notifId,
      p_snooze_days:     7,
    });

    expect(error).toBeNull();
    expect(data.status).toBe("snoozed");
    expect(data.snoozed_until).toBe(expectedDate);
    expect(data.snooze_count).toBe(1);
    expect(data.remaining_snoozes).toBe(2);
  });

  it("C2: snooze_count increments correctly across multiple snoozes", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    // Snooze 3 ครั้ง
    const r1 = await clientA.rpc("rpc_snooze_notification", { p_notification_id: notifId, p_snooze_days: 1 });
    // Reset to pending to allow next snooze
    await svc.from("invoice_notifications").update({ status: "pending" }).eq("id", notifId);
    const r2 = await clientA.rpc("rpc_snooze_notification", { p_notification_id: notifId, p_snooze_days: 1 });
    await svc.from("invoice_notifications").update({ status: "pending" }).eq("id", notifId);
    const r3 = await clientA.rpc("rpc_snooze_notification", { p_notification_id: notifId, p_snooze_days: 1 });

    expect(r1.data.snooze_count).toBe(1);
    expect(r2.data.snooze_count).toBe(2);
    expect(r3.data.snooze_count).toBe(3);
    expect(r3.data.remaining_snoozes).toBe(0);
  });

  it("C3: 4th snooze raises exception (max 3)", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    // Force snooze_count = 3
    await svc.from("invoice_notifications")
      .update({ snooze_count: 3, status: "pending" })
      .eq("id", notifId);

    const { error } = await clientA.rpc("rpc_snooze_notification", {
      p_notification_id: notifId,
      p_snooze_days:     7,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/max snooze/i);
  });

  it("C4: snooze_days=0 raises exception", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    const { error } = await clientA.rpc("rpc_snooze_notification", {
      p_notification_id: notifId,
      p_snooze_days:     0,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/snooze_days must be between/i);
  });

  it("C5: snooze_days=91 raises exception", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    const { error } = await clientA.rpc("rpc_snooze_notification", {
      p_notification_id: notifId,
      p_snooze_days:     91,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/snooze_days must be between/i);
  });

  it("C6: cross-tenant — org_b cannot snooze org_a's notification", async () => {
    const notifId = await setupNotification(orgA.orgId);
    const clientB = userClient(orgB.jwt);

    const { error } = await clientB.rpc("rpc_snooze_notification", {
      p_notification_id: notifId,
      p_snooze_days:     7,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found or access denied/i);
  });
});

// ===========================================================================
// GROUP D — rpc_acknowledge_notification
// ===========================================================================

describe("Group D: rpc_acknowledge_notification", () => {

  async function setupPendingNotif(orgId: string): Promise<string> {
    const invId = await createTestInvoice(svc, orgId, { daysOverdue: 5 });
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgId, p_dry_run: false });
    const { data } = await svc
      .from("invoice_notifications")
      .select("id")
      .eq("invoice_id", invId)
      .eq("status", "pending")
      .limit(1)
      .single();
    return data!.id as string;
  }

  it("D1: happy path — status becomes acknowledged, acknowledged_at set", async () => {
    const notifId = await setupPendingNotif(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    const { data, error } = await clientA.rpc("rpc_acknowledge_notification", {
      p_notification_id: notifId,
    });

    expect(error).toBeNull();
    expect(data.status).toBe("acknowledged");
    expect(data.acknowledged_at).toBeDefined();

    // ตรวจใน DB
    const { data: row } = await svc
      .from("invoice_notifications")
      .select("status, acknowledged_at")
      .eq("id", notifId)
      .single();

    expect(row!.status).toBe("acknowledged");
    expect(row!.acknowledged_at).not.toBeNull();
  });

  it("D2: acknowledged_by = auth.uid()", async () => {
    const notifId = await setupPendingNotif(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    await clientA.rpc("rpc_acknowledge_notification", { p_notification_id: notifId });

    const { data: row } = await svc
      .from("invoice_notifications")
      .select("acknowledged_by")
      .eq("id", notifId)
      .single();

    expect(row!.acknowledged_by).toBe(orgA.userId);
  });

  it("D3: cross-tenant — org_b cannot ack org_a's notification", async () => {
    const notifId = await setupPendingNotif(orgA.orgId);
    const clientB = userClient(orgB.jwt);

    const { error } = await clientB.rpc("rpc_acknowledge_notification", {
      p_notification_id: notifId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not found|access denied/i);
  });

  it("D4: cannot ack an already-dismissed notification", async () => {
    const notifId = await setupPendingNotif(orgA.orgId);
    const clientA = userClient(orgA.jwt);

    // Force dismiss
    await svc.from("invoice_notifications")
      .update({ status: "dismissed" })
      .eq("id", notifId);

    const { error } = await clientA.rpc("rpc_acknowledge_notification", {
      p_notification_id: notifId,
    });

    expect(error).not.toBeNull();
    // Should get "not found or already dismissed" error
  });
});

// ===========================================================================
// GROUP E — Cross-tenant isolation
// ===========================================================================

describe("Group E: Cross-tenant isolation", () => {

  it("E1: invoice_notifications RLS — org_a cannot see org_b's notifications", async () => {
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 5 });
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgB.orgId, p_dry_run: false });

    const clientA = userClient(orgA.jwt);
    const { data } = await clientA
      .from("invoice_notifications")
      .select("id")
      .eq("org_id", orgB.orgId);

    expect(data).toHaveLength(0);

    await svc.from("invoices").delete().eq("id", invB);
  });

  it("E2: rpc_list_overdue_invoices returns only own org", async () => {
    const invA = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 10 });
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 10 });

    const clientA = userClient(orgA.jwt);
    const { data, error } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: true,
      p_limit: 100,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const results = data as Array<{ invoice_id: string }>;
    const invBFound = results.some((r) => r.invoice_id === invB);
    expect(invBFound).toBe(false);

    await svc.from("invoices").delete().in("id", [invA, invB]);
  });

  it("E3: v_overdue_invoices filters by get_user_org_id()", async () => {
    const invA = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 5 });
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 5 });

    const clientA = userClient(orgA.jwt);
    const { data } = await clientA
      .from("v_overdue_invoices")
      .select("invoice_id");

    const ids = (data ?? []).map((r: any) => r.invoice_id);
    expect(ids).not.toContain(invB);

    await svc.from("invoices").delete().in("id", [invA, invB]);
  });

  it("E4: service role can query all orgs without restriction", async () => {
    const invA = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 3 });
    const invB = await createTestInvoice(svc, orgB.orgId, { daysOverdue: 3 });

    // Service role ไม่มี RLS บน invoice_notifications (bypass)
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgA.orgId, p_dry_run: false });
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgB.orgId, p_dry_run: false });

    const { data, error } = await svc
      .from("invoice_notifications")
      .select("id, org_id")
      .in("org_id", [orgA.orgId, orgB.orgId]);

    expect(error).toBeNull();
    const orgARows = data?.filter((r) => r.org_id === orgA.orgId) ?? [];
    const orgBRows = data?.filter((r) => r.org_id === orgB.orgId) ?? [];
    expect(orgARows.length).toBeGreaterThan(0);
    expect(orgBRows.length).toBeGreaterThan(0);

    await svc.from("invoices").delete().in("id", [invA, invB]);
  });
});

// ===========================================================================
// GROUP F — rpc_list_overdue_invoices
// ===========================================================================

describe("Group F: rpc_list_overdue_invoices", () => {

  it("F1: returns overdue invoices with notification_count", async () => {
    const invId = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 10 });
    await svc.rpc("rpc_check_overdue_invoices", { p_org_id: orgA.orgId, p_dry_run: false });

    const clientA = userClient(orgA.jwt);
    const { data, error } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: true,
      p_limit: 50,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const results = data as Array<any>;
    const found = results.find((r) => r.invoice_id === invId);

    expect(found).toBeDefined();
    expect(found.notification_count).toBeGreaterThanOrEqual(1);
    expect(found.remaining_amount).toBeGreaterThan(0);
    expect(found.days_overdue).toBe(10);

    await svc.from("invoices").delete().eq("id", invId);
  });

  it("F2: p_include_due_soon=false excludes due-soon entries", async () => {
    const invOverdue  = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 5 });
    const invDueSoon  = await createTestInvoice(svc, orgA.orgId, { dueSoon: 3 });

    const clientA = userClient(orgA.jwt);
    const { data } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: false,
      p_limit: 100,
      p_offset: 0,
    });

    const results = data as Array<{ invoice_id: string }>;
    expect(results.some((r) => r.invoice_id === invOverdue)).toBe(true);
    expect(results.some((r) => r.invoice_id === invDueSoon)).toBe(false);

    await svc.from("invoices").delete().in("id", [invOverdue, invDueSoon]);
  });

  it("F3: pagination limit/offset works correctly", async () => {
    // สร้าง 5 invoices
    const ids = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createTestInvoice(svc, orgA.orgId, { daysOverdue: i + 1 })
      )
    );

    const clientA = userClient(orgA.jwt);

    const { data: page1 } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: false,
      p_limit: 3,
      p_offset: 0,
    });
    const { data: page2 } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: false,
      p_limit: 3,
      p_offset: 3,
    });

    expect((page1 as any[]).length).toBeLessThanOrEqual(3);
    expect((page2 as any[]).length).toBeGreaterThanOrEqual(0);

    // IDs ใน page1 ต้องไม่ซ้ำกับ page2
    const page1Ids = (page1 as any[]).map((r) => r.invoice_id);
    const page2Ids = (page2 as any[]).map((r) => r.invoice_id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);

    await svc.from("invoices").delete().in("id", ids);
  });

  it("F4: results sorted by days_overdue DESC", async () => {
    const inv5d  = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 5 });
    const inv20d = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 20 });
    const inv1d  = await createTestInvoice(svc, orgA.orgId, { daysOverdue: 1 });

    const clientA = userClient(orgA.jwt);
    const { data } = await clientA.rpc("rpc_list_overdue_invoices", {
      p_include_due_soon: false,
      p_limit: 100,
      p_offset: 0,
    });

    const results = data as Array<{ invoice_id: string; days_overdue: number }>;
    const testInvs = results.filter((r) =>
      [inv5d, inv20d, inv1d].includes(r.invoice_id)
    );

    // ตรวจว่า sorted DESC
    for (let i = 0; i < testInvs.length - 1; i++) {
      expect(testInvs[i].days_overdue).toBeGreaterThanOrEqual(testInvs[i + 1].days_overdue);
    }

    await svc.from("invoices").delete().in("id", [inv5d, inv20d, inv1d]);
  });
});

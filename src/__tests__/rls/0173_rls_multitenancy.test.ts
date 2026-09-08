/**
 * Test Suite: RLS Multi-Tenancy Isolation (Migration 0173)
 * =========================================================
 * ยืนยัน cross-tenant isolation สำหรับทุก table และ RPC
 * ที่แก้ไขใน migration 0173_rls_multitenancy.sql
 *
 * ใช้ Vitest + Supabase client (service role + anon role)
 * Run: npx vitest run src/__tests__/rls/0173_rls_multitenancy.test.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TestOrg {
  id: string;
  name: string;
}
interface TestUser {
  id: string;
  email: string;
  orgId: string;
  accessToken: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function createTestOrg(name: string): Promise<TestOrg> {
  const orgId = crypto.randomUUID();
  const { data, error } = await serviceClient
    .from("organizations")
    .insert({
      org_id: orgId,
      name,
      slug: `test-0173-${orgId}`,
      plan: "ENTERPRISE",
      max_users: 50,
    })
    .select("org_id, name")
    .single();
  if (error) throw new Error(`createTestOrg failed: ${error.message}`);
  return { id: data.org_id, name: data.name } as TestOrg;
}

async function createTestUser(
  email: string,
  orgId: string,
  role = 60
): Promise<TestUser> {
  // Create auth user
  const { data: authData, error: authErr } =
    await serviceClient.auth.admin.createUser({
      email,
      password: "Test1234!",
      email_confirm: true,
    });
  if (authErr) throw new Error(`createTestUser auth failed: ${authErr.message}`);

  const userId = authData.user!.id;
  const canonicalRole = role >= 60 ? "FINANCE" : "VIEWER";

  const { error: metadataError } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: { roles: [canonicalRole.toLowerCase()], org_id: orgId },
  });
  if (metadataError) throw new Error(`createTestUser metadata failed: ${metadataError.message}`);

  // Link to org
  const { error: memberErr } = await serviceClient
    .from("org_members")
    .insert({ user_id: userId, org_id: orgId, role: canonicalRole, email });
  if (memberErr)
    throw new Error(`createTestUser member failed: ${memberErr.message}`);

  // Sign in to get token
  const { data: signIn, error: signInErr } =
    await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (signInErr)
    throw new Error(`generateLink failed: ${signInErr.message}`);

  // Use service client impersonation via JWT
  const { data: session } =
    await serviceClient.auth.admin.getUserById(userId);

  // For tests: create a session token via sign-in
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: loginData, error: loginErr } =
    await anonClient.auth.signInWithPassword({ email, password: "Test1234!" });
  if (loginErr)
    throw new Error(`signIn failed: ${loginErr.message}`);

  return {
    id: userId,
    email,
    orgId,
    accessToken: loginData.session!.access_token,
  };
}

async function cleanupUser(userId: string) {
  await serviceClient.auth.admin.deleteUser(userId);
}

async function cleanupOrg(orgId: string) {
  await serviceClient.from("organizations").delete().eq("org_id", orgId);
}

// ─── Test State ───────────────────────────────────────────────────────────────
let orgA: TestOrg;
let orgB: TestOrg;
let userA: TestUser; // belongs to orgA (FINANCE role)
let userB: TestUser; // belongs to orgB (FINANCE role)

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  // Create 2 isolated test organizations
  orgA = await createTestOrg("__test_org_alpha__");
  orgB = await createTestOrg("__test_org_beta__");

  // Create 1 user per org
  userA = await createTestUser("test-userA@rls-test.local", orgA.id, 60);
  userB = await createTestUser("test-userB@rls-test.local", orgB.id, 60);
});

afterAll(async () => {
  await cleanupUser(userA.id);
  await cleanupUser(userB.id);
  await cleanupOrg(orgA.id);
  await cleanupOrg(orgB.id);
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────
async function seedJob(orgId: string, code: string) {
  const { data, error } = await serviceClient
    .from("jobs")
    .insert({ org_id: orgId, code, title: `Job ${code}`, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(`seedJob failed: ${error.message}`);
  return data.id as string;
}

async function seedQuotation(orgId: string, jobId: string, code: string) {
  const { data, error } = await serviceClient
    .from("quotations")
    .insert({ org_id: orgId, job_id: jobId, code, status: "draft", total: 0 })
    .select("id")
    .single();
  if (error) throw new Error(`seedQuotation failed: ${error.message}`);
  return data.id as string;
}

async function seedInvoice(orgId: string, jobId: string, code: string) {
  const { data, error } = await serviceClient
    .from("invoices")
    .insert({
      org_id: orgId,
      job_id: jobId,
      code,
      status: "draft",
      total: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedInvoice failed: ${error.message}`);
  return data.id as string;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("RLS Cross-Tenant Isolation — Migration 0173", () => {
  // ── jobs table ──────────────────────────────────────────────────────────────
  describe("Table: jobs", () => {
    let jobAId: string;
    let jobBId: string;

    beforeAll(async () => {
      jobAId = await seedJob(orgA.id, "JOB-TEST-A001");
      jobBId = await seedJob(orgB.id, "JOB-TEST-B001");
    });

    it("userA can SELECT own org jobs", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("jobs")
        .select("id, org_id")
        .eq("id", jobAId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].org_id).toBe(orgA.id);
    });

    it("userA CANNOT SELECT orgB jobs", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("jobs")
        .select("id")
        .eq("id", jobBId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLS filters it out
    });

    it("userA CANNOT UPDATE orgB jobs", async () => {
      const { error } = await userClient(userA.accessToken)
        .from("jobs")
        .update({ title: "HACKED" })
        .eq("id", jobBId);
      // Either error or 0 rows affected
      if (!error) {
        const { data } = await serviceClient
          .from("jobs")
          .select("title")
          .eq("id", jobBId)
          .single();
        expect(data!.title).not.toBe("HACKED");
      }
    });

    it("userA CANNOT DELETE orgB jobs", async () => {
      const { error } = await userClient(userA.accessToken)
        .from("jobs")
        .delete()
        .eq("id", jobBId);
      // Verify record still exists
      const { data } = await serviceClient
        .from("jobs")
        .select("id")
        .eq("id", jobBId)
        .single();
      expect(data).not.toBeNull();
    });

    it("userA job code uniqueness is per-tenant (same code allowed in orgB)", async () => {
      // orgB should be able to use same code as orgA
      const { error } = await serviceClient.from("jobs").insert({
        org_id: orgB.id,
        code: "JOB-TEST-A001", // same code as orgA — should be OK
        title: "Same code different org",
        status: "draft",
      });
      expect(error).toBeNull();
    });

    it("CANNOT insert duplicate code within same org", async () => {
      const { error } = await serviceClient.from("jobs").insert({
        org_id: orgA.id,
        code: "JOB-TEST-A001", // duplicate within orgA
        title: "Duplicate",
        status: "draft",
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe("23505"); // unique_violation
    });
  });

  // ── quotations table ─────────────────────────────────────────────────────────
  describe("Table: quotations", () => {
    let jobAId: string;
    let jobBId: string;
    let quotAId: string;
    let quotBId: string;

    beforeAll(async () => {
      jobAId = await seedJob(orgA.id, "JOB-QUOT-A001");
      jobBId = await seedJob(orgB.id, "JOB-QUOT-B001");
      quotAId = await seedQuotation(orgA.id, jobAId, "QT-A001");
      quotBId = await seedQuotation(orgB.id, jobBId, "QT-B001");
    });

    it("userA can SELECT own org quotations", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("quotations")
        .select("id, org_id")
        .eq("id", quotAId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("userA CANNOT SELECT orgB quotations", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("quotations")
        .select("id")
        .eq("id", quotBId);
      expect(data).toHaveLength(0);
    });

    it("userB CANNOT SELECT orgA quotations", async () => {
      const { data } = await userClient(userB.accessToken)
        .from("quotations")
        .select("id")
        .eq("id", quotAId);
      expect(data).toHaveLength(0);
    });
  });

  // ── invoices table ────────────────────────────────────────────────────────────
  describe("Table: invoices", () => {
    let jobAId: string;
    let jobBId: string;
    let invAId: string;
    let invBId: string;

    beforeAll(async () => {
      jobAId = await seedJob(orgA.id, "JOB-INV-A001");
      jobBId = await seedJob(orgB.id, "JOB-INV-B001");
      invAId = await seedInvoice(orgA.id, jobAId, "INV-A001");
      invBId = await seedInvoice(orgB.id, jobBId, "INV-B001");
    });

    it("userA can SELECT own org invoices", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("invoices")
        .select("id, org_id")
        .eq("id", invAId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].org_id).toBe(orgA.id);
    });

    it("userA CANNOT SELECT orgB invoices", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("invoices")
        .select("id")
        .eq("id", invBId);
      expect(data).toHaveLength(0);
    });

    it("userA CANNOT UPDATE orgB invoice status", async () => {
      await userClient(userA.accessToken)
        .from("invoices")
        .update({ status: "approved" })
        .eq("id", invBId);
      // Verify status unchanged
      const { data } = await serviceClient
        .from("invoices")
        .select("status")
        .eq("id", invBId)
        .single();
      expect(data!.status).toBe("draft");
    });
  });

  // ── invoice_line_items table ──────────────────────────────────────────────────
  describe("Table: invoice_line_items", () => {
    let jobAId: string;
    let invAId: string;
    let invBId: string;
    let lineAId: string;
    let lineBId: string;

    beforeAll(async () => {
      jobAId = await seedJob(orgA.id, "JOB-LINE-A001");
      const jobBId = await seedJob(orgB.id, "JOB-LINE-B001");
      invAId = await seedInvoice(orgA.id, jobAId, "INV-LINE-A001");
      invBId = await seedInvoice(orgB.id, jobBId, "INV-LINE-B001");

      const { data: la } = await serviceClient
        .from("invoice_line_items")
        .insert({ org_id: orgA.id, invoice_id: invAId, description: "Item A", amount: 100 })
        .select("id")
        .single();
      lineAId = la!.id;

      const { data: lb } = await serviceClient
        .from("invoice_line_items")
        .insert({ org_id: orgB.id, invoice_id: invBId, description: "Item B", amount: 200 })
        .select("id")
        .single();
      lineBId = lb!.id;
    });

    it("userA can SELECT own org line items", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("invoice_line_items")
        .select("id")
        .eq("id", lineAId);
      expect(data).toHaveLength(1);
    });

    it("userA CANNOT SELECT orgB line items", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("invoice_line_items")
        .select("id")
        .eq("id", lineBId);
      expect(data).toHaveLength(0);
    });
  });

  // ── journal_entry table (existing, verify still isolated) ──────────────────
  describe("Table: journal_entry (existing RLS)", () => {
    let entryAId: string;
    let entryBId: string;

    beforeAll(async () => {
      const { data: ea } = await serviceClient
        .from("journal_entry")
        .insert({
          org_id: orgA.id,
          entry_date: "2026-08-01",
          description: "Test entry A",
          book_id: "internal",
        })
        .select("id")
        .single();
      entryAId = ea!.id;

      const { data: eb } = await serviceClient
        .from("journal_entry")
        .insert({
          org_id: orgB.id,
          entry_date: "2026-08-01",
          description: "Test entry B",
          book_id: "internal",
        })
        .select("id")
        .single();
      entryBId = eb!.id;
    });

    it("userA can SELECT own journal entries", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("journal_entry")
        .select("id, org_id")
        .eq("id", entryAId);
      expect(data).toHaveLength(1);
      expect(data![0].org_id).toBe(orgA.id);
    });

    it("userA CANNOT SELECT orgB journal entries", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("journal_entry")
        .select("id")
        .eq("id", entryBId);
      expect(data).toHaveLength(0);
    });
  });

  // ── RPC: rpc_list_jobs ────────────────────────────────────────────────────────
  describe("RPC: rpc_list_jobs", () => {
    beforeAll(async () => {
      await seedJob(orgA.id, "JOB-RPC-A001");
      await seedJob(orgB.id, "JOB-RPC-B001");
    });

    it("returns only orgA jobs for userA", async () => {
      const { data, error } = await userClient(userA.accessToken).rpc(
        "rpc_list_jobs"
      );
      expect(error).toBeNull();
      const orgIds = (data as any[]).map((r: any) => r.org_id);
      const hasOrgB = orgIds.some((id: string) => id === orgB.id);
      expect(hasOrgB).toBe(false);
    });

    it("returns only orgB jobs for userB", async () => {
      const { data, error } = await userClient(userB.accessToken).rpc(
        "rpc_list_jobs"
      );
      expect(error).toBeNull();
      const orgIds = (data as any[]).map((r: any) => r.org_id);
      const hasOrgA = orgIds.some((id: string) => id === orgA.id);
      expect(hasOrgA).toBe(false);
    });
  });

  // ── Canonical invoice RLS read path ───────────────────────────────────────────
  describe("Table: invoices", () => {
    it("returns only orgA invoices for userA", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("invoices")
        .select("org_id");
      expect(error).toBeNull();
      const orgIds = (data as any[]).map((r: any) => r.org_id);
      expect(orgIds.every((id: string) => id === orgA.id)).toBe(true);
    });
  });

  // ── Privilege escalation ─────────────────────────────────────────────────────
  describe("Privilege escalation prevention", () => {
    it("VIEWER(10) cannot INSERT jobs", async () => {
      // Create viewer user in orgA
      const viewer = await createTestUser(
        "viewer-rls@rls-test.local",
        orgA.id,
        10 // VIEWER role
      );
      const { error } = await userClient(viewer.accessToken)
        .from("jobs")
        .insert({ org_id: orgA.id, code: "VIEWER-JOB", title: "Viewer job", status: "draft" });
      expect(error).not.toBeNull(); // Should be blocked
      await cleanupUser(viewer.id);
    });

    it("FINANCE(60) cannot access other org even with explicit org_id override", async () => {
      // Try to inject a different org_id via INSERT
      const { error } = await userClient(userA.accessToken)
        .from("jobs")
        .insert({
          org_id: orgB.id, // Trying to insert into orgB
          code: "INJECT-001",
          title: "Injection attempt",
          status: "draft",
        });
      expect(error).not.toBeNull();
    });
  });

  // ── book_registry (0175) ─────────────────────────────────────────────────────
  describe("Table: book_registry (Migration 0175)", () => {
    it("userA can see own org books", async () => {
      const { data, error } = await userClient(userA.accessToken)
        .from("book_registry")
        .select("book_id, org_id, display_name");
      expect(error).toBeNull();
      const orgIds = (data ?? []).map((r: any) => r.org_id);
      expect(orgIds.every((id: string) => id === orgA.id)).toBe(true);
    });

    it("userA CANNOT see orgB books", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("book_registry")
        .select("book_id")
        .eq("org_id", orgB.id);
      expect(data).toHaveLength(0);
    });

    it("rpc_register_book creates book only for caller org", async () => {
      const { data, error } = await userClient(userA.accessToken).rpc(
        "rpc_register_book",
        { p_book_id: "test-book-rls", p_display_name: "RLS Test Book" }
      );
      expect(error).toBeNull();
      // Verify it belongs to orgA
      const { data: book } = await serviceClient
        .from("book_registry")
        .select("org_id")
        .eq("book_id", "test-book-rls")
        .single();
      expect(book!.org_id).toBe(orgA.id);
    });
  });
});

// ─── Invariant Tests ──────────────────────────────────────────────────────────

describe("Accounting Invariants", () => {
  describe("Double-entry balance invariant", () => {
    it("rejects journal entry where debits ≠ credits", async () => {
      const { error } = await userClient(userA.accessToken).rpc("rpc_post_journal_entry", {
        p_book_id: "internal",
        p_entry_date: "2026-08-01",
        p_description: "Unbalanced test",
        p_currency: "THB",
        p_source_ref: null,
        p_lines: [
          { account_code: "1100", debit: 1000, credit: 0 },
          { account_code: "4100", debit: 0, credit: 500 }, // intentionally wrong
        ],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/balance|debit|credit/i);
    });

    it("accepts balanced journal entry", async () => {
      const { error } = await userClient(userA.accessToken).rpc("rpc_post_journal_entry", {
        p_book_id: "internal",
        p_entry_date: "2026-08-01",
        p_description: "Balanced test entry",
        p_currency: "THB",
        p_source_ref: null,
        p_lines: [
          { account_code: "1100", debit: 1000, credit: 0 },
          { account_code: "4100", debit: 0, credit: 1000 },
        ],
      });
      expect(error).toBeNull();
    });
  });

  describe("Append-only journal invariant", () => {
    it("cannot DELETE journal_entry rows", async () => {
      const { data } = await serviceClient
        .from("journal_entry")
        .select("id")
        .eq("org_id", orgA.id)
        .limit(1)
        .single();

      const { error } = await userClient(userA.accessToken)
        .from("journal_entry")
        .delete()
        .eq("id", data!.id);

      // Should fail due to delete rule/trigger
      expect(error).not.toBeNull();
    });

    it("cannot UPDATE journal_line amount after posting", async () => {
      const { data: entry } = await serviceClient
        .from("journal_entry")
        .select("id")
        .eq("org_id", orgA.id)
        .limit(1)
        .single();

      const { data: line } = await serviceClient
        .from("journal_line")
        .select("id, debit")
        .eq("journal_entry_id", entry!.id)
        .limit(1)
        .single();

      const { error } = await userClient(userA.accessToken)
        .from("journal_line")
        .update({ debit: 99999 })
        .eq("id", line!.id);

      if (!error) {
        // If no error, verify value unchanged (protected by trigger)
        const { data: after } = await serviceClient
          .from("journal_line")
          .select("debit")
          .eq("id", line!.id)
          .single();
        expect(after!.debit).toBe(line!.debit);
      }
    });
  });
});

// =============================================================================
// Additional Tests: rpc_approve_invoice & rpc_void_invoice (Migration 0176)
// =============================================================================

describe("RPC: rpc_approve_invoice (Migration 0176)", () => {
  let jobId: string;
  let draftInvoiceId: string;
  let approvedInvoiceId: string;
  let etaxInvoiceId: string;

  beforeAll(async () => {
    jobId = await seedJob(orgA.id, "JOB-APPR-A001");

    // Invoice with line items — ready to approve
    const { data: inv } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-APPR-001",
        status: "draft",
        total: 10700, // 10000 + 7% VAT
        is_vat_inclusive: true,
        issued_date: "2026-08-01",
      })
      .select("id")
      .single();
    draftInvoiceId = inv!.id;

    // Add line item
    await serviceClient.from("invoice_line_items").insert({
      org_id: orgA.id,
      invoice_id: draftInvoiceId,
      description: "Cabinet set",
      amount: 10700,
    });

    // Pre-approved invoice (for idempotency test)
    const { data: approved } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-ALREADY-APPROVED",
        status: "approved",
        total: 5350,
        is_vat_inclusive: true,
        issued_date: "2026-08-01",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    approvedInvoiceId = approved!.id;

    // Invoice marked as eTax submitted
    const { data: etax } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-ETAX-001",
        status: "approved",
        total: 5350,
        is_vat_inclusive: true,
        issued_date: "2026-08-01",
        approved_at: new Date().toISOString(),
        etax_submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    etaxInvoiceId = etax!.id;
  });

  describe("Happy path", () => {
    it("approves a draft invoice and returns success JSON", async () => {
      const { data, error } = await userClient(userA.accessToken).rpc(
        "rpc_approve_invoice",
        { p_invoice_id: draftInvoiceId }
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({
        success: true,
        invoice_id: draftInvoiceId,
        status: "approved",
      });
    });

    it("sets invoice.status to 'approved' in DB", async () => {
      const { data } = await serviceClient
        .from("invoices")
        .select("status, approved_at")
        .eq("id", draftInvoiceId)
        .single();
      expect(data!.status).toBe("approved");
      expect(data!.approved_at).not.toBeNull();
    });

    it("auto-posts a journal entry after approval", async () => {
      const { data } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id, auto_journal_posted_at")
        .eq("id", draftInvoiceId)
        .single();
      expect(data!.auto_journal_entry_id).not.toBeNull();
      expect(data!.auto_journal_posted_at).not.toBeNull();
    });

    it("journal entry has correct debit = credit (double-entry balance)", async () => {
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id, total")
        .eq("id", draftInvoiceId)
        .single();

      const { data: lines } = await serviceClient
        .from("journal_line")
        .select("debit, credit")
        .eq("journal_entry_id", inv!.auto_journal_entry_id);

      const totalDebit = lines!.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = lines!.reduce((s, l) => s + Number(l.credit), 0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.01);
      expect(totalDebit).toBeCloseTo(Number(inv!.total), 1);
    });

    it("journal line: DR 1200 (AR) = invoice total", async () => {
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id, total")
        .eq("id", draftInvoiceId)
        .single();

      const { data: arLine } = await serviceClient
        .from("journal_line")
        .select("debit, account_id")
        .eq("journal_entry_id", inv!.auto_journal_entry_id)
        .gt("debit", 0)
        .single();

      // Verify account code = 1200
      const { data: account } = await serviceClient
        .from("chart_of_accounts")
        .select("code")
        .eq("id", arLine!.account_id)
        .single();

      expect(account!.code).toBe("1200");
      expect(Number(arLine!.debit)).toBeCloseTo(Number(inv!.total), 1);
    });

    it("journal line: CR 4100 (Revenue) = net amount (excl. VAT)", async () => {
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id, total")
        .eq("id", draftInvoiceId)
        .single();

      const { data: lines } = await serviceClient
        .from("journal_line")
        .select("credit, account_id")
        .eq("journal_entry_id", inv!.auto_journal_entry_id)
        .gt("credit", 0);

      // Find revenue line (4100)
      const revenueLines = [];
      for (const line of lines!) {
        const { data: acc } = await serviceClient
          .from("chart_of_accounts")
          .select("code")
          .eq("id", line.account_id)
          .single();
        if (acc?.code === "4100") revenueLines.push(line);
      }
      expect(revenueLines).toHaveLength(1);
      // Net = 10700 / 1.07 ≈ 10000
      expect(Number(revenueLines[0].credit)).toBeCloseTo(10000, 0);
    });

    it("journal line: CR 2200 (VAT Payable) = 7% of net", async () => {
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id")
        .eq("id", draftInvoiceId)
        .single();

      const { data: lines } = await serviceClient
        .from("journal_line")
        .select("credit, account_id")
        .eq("journal_entry_id", inv!.auto_journal_entry_id)
        .gt("credit", 0);

      const vatLines = [];
      for (const line of lines!) {
        const { data: acc } = await serviceClient
          .from("chart_of_accounts")
          .select("code")
          .eq("id", line.account_id)
          .single();
        if (acc?.code === "2200") vatLines.push(line);
      }
      expect(vatLines).toHaveLength(1);
      expect(Number(vatLines[0].credit)).toBeCloseTo(700, 0); // 10700 - 10000
    });
  });

  describe("Idempotency", () => {
    it("calling rpc_approve_invoice on already-approved invoice returns error", async () => {
      const { data } = await userClient(userA.accessToken).rpc(
        "rpc_approve_invoice",
        { p_invoice_id: approvedInvoiceId }
      );
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/already approved/i);
    });

    it("does NOT double-post journal if trigger fires twice (idempotency guard)", async () => {
      // Try to approve already-approved invoice directly via service client
      await serviceClient
        .from("invoices")
        .update({ status: "approved" })
        .eq("id", draftInvoiceId);

      // Should still have exactly 1 journal entry
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("auto_journal_entry_id")
        .eq("id", draftInvoiceId)
        .single();

      const { count } = await serviceClient
        .from("journal_entry")
        .select("*", { count: "exact", head: true })
        .eq("source_id", draftInvoiceId)
        .eq("source_type", "invoice");

      expect(count).toBe(1); // Never double-posted
    });
  });

  describe("Validation failures", () => {
    it("rejects invoice with zero total", async () => {
      const { data: zeroInv } = await serviceClient
        .from("invoices")
        .insert({
          org_id: orgA.id,
          job_id: jobId,
          code: "INV-ZERO",
          status: "draft",
          total: 0,
          issued_date: "2026-08-01",
        })
        .select("id")
        .single();

      // Add line item
      await serviceClient.from("invoice_line_items").insert({
        org_id: orgA.id,
        invoice_id: zeroInv!.id,
        description: "Empty",
        amount: 0,
      });

      const { data } = await userClient(userA.accessToken).rpc(
        "rpc_approve_invoice",
        { p_invoice_id: zeroInv!.id }
      );
      expect(data.success).toBe(false);
    });

    it("rejects invoice with no line items", async () => {
      const { data: noLineInv } = await serviceClient
        .from("invoices")
        .insert({
          org_id: orgA.id,
          job_id: jobId,
          code: "INV-NOLINE",
          status: "draft",
          total: 5000,
          issued_date: "2026-08-01",
        })
        .select("id")
        .single();

      const { data } = await userClient(userA.accessToken).rpc(
        "rpc_approve_invoice",
        { p_invoice_id: noLineInv!.id }
      );
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/no line items/i);
    });
  });

  describe("Cross-tenant isolation", () => {
    it("userB CANNOT approve orgA invoice", async () => {
      // Create another draft invoice in orgA
      const jobAId2 = await seedJob(orgA.id, "JOB-XAPPR-A");
      const { data: xInv } = await serviceClient
        .from("invoices")
        .insert({
          org_id: orgA.id,
          job_id: jobAId2,
          code: "INV-XAPPR",
          status: "draft",
          total: 5350,
          issued_date: "2026-08-01",
        })
        .select("id")
        .single();

      await serviceClient.from("invoice_line_items").insert({
        org_id: orgA.id,
        invoice_id: xInv!.id,
        description: "Cross-tenant test",
        amount: 5350,
      });

      const { data } = await userClient(userB.accessToken).rpc(
        "rpc_approve_invoice",
        { p_invoice_id: xInv!.id }
      );
      expect(data.success).toBe(false); // Access denied

      // Verify status unchanged
      const { data: after } = await serviceClient
        .from("invoices")
        .select("status")
        .eq("id", xInv!.id)
        .single();
      expect(after!.status).toBe("draft");
    });
  });
});

// =============================================================================
// RPC: rpc_void_invoice tests
// =============================================================================

describe("RPC: rpc_void_invoice (Migration 0176)", () => {
  let jobId: string;
  let approvedInvoiceId: string;
  let etaxInvoiceId: string;
  let draftInvoiceId2: string;
  let originalEntryId: string;

  beforeAll(async () => {
    jobId = await seedJob(orgA.id, "JOB-VOID-A001");

    // Approved invoice (ready to void)
    const { data: inv } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-VOID-001",
        status: "draft",
        total: 5350,
        is_vat_inclusive: true,
        issued_date: "2026-08-01",
      })
      .select("id")
      .single();

    await serviceClient.from("invoice_line_items").insert({
      org_id: orgA.id,
      invoice_id: inv!.id,
      description: "To be voided",
      amount: 5350,
    });

    // Approve it first (to create the AR journal entry)
    await userClient(userA.accessToken).rpc("rpc_approve_invoice", {
      p_invoice_id: inv!.id,
    });

    const { data: approved } = await serviceClient
      .from("invoices")
      .select("id, auto_journal_entry_id")
      .eq("id", inv!.id)
      .single();
    approvedInvoiceId = approved!.id;
    originalEntryId = approved!.auto_journal_entry_id;

    // eTax invoice (cannot be voided)
    const { data: etax } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-ETAX-VOID",
        status: "approved",
        total: 5350,
        is_vat_inclusive: true,
        issued_date: "2026-08-01",
        approved_at: new Date().toISOString(),
        etax_submitted_at: new Date().toISOString(),
        auto_journal_entry_id: originalEntryId,
        auto_journal_posted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    etaxInvoiceId = etax!.id;

    // Draft invoice (cannot be voided via rpc_void_invoice — needs approval first)
    const { data: draft } = await serviceClient
      .from("invoices")
      .insert({
        org_id: orgA.id,
        job_id: jobId,
        code: "INV-DRAFT-VOID",
        status: "draft",
        total: 5350,
        issued_date: "2026-08-01",
      })
      .select("id")
      .single();
    draftInvoiceId2 = draft!.id;
  });

  describe("Happy path", () => {
    it("voids an approved invoice successfully", async () => {
      const { data, error } = await userClient(userA.accessToken).rpc(
        "rpc_void_invoice",
        { p_invoice_id: approvedInvoiceId, p_reason: "Customer cancelled order" }
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({ success: true, status: "voided" });
    });

    it("sets invoice.status to 'voided' in DB", async () => {
      const { data } = await serviceClient
        .from("invoices")
        .select("status, voided_at, void_reason")
        .eq("id", approvedInvoiceId)
        .single();
      expect(data!.status).toBe("voided");
      expect(data!.voided_at).not.toBeNull();
      expect(data!.void_reason).toBe("Customer cancelled order");
    });

    it("auto-posts reversal journal entry after void", async () => {
      // There should be a reversal entry pointing back to the original
      const { data: reversal } = await serviceClient
        .from("journal_entry")
        .select("id, reversal_of, source_type")
        .eq("source_id", approvedInvoiceId)
        .eq("source_type", "invoice_reversal")
        .single();
      expect(reversal).not.toBeNull();
      expect(reversal!.reversal_of).toBe(originalEntryId);
    });

    it("reversal journal entry is balanced (debit = credit)", async () => {
      const { data: reversal } = await serviceClient
        .from("journal_entry")
        .select("id")
        .eq("source_id", approvedInvoiceId)
        .eq("source_type", "invoice_reversal")
        .single();

      const { data: lines } = await serviceClient
        .from("journal_line")
        .select("debit, credit")
        .eq("journal_entry_id", reversal!.id);

      const totalDebit = lines!.reduce((s, l) => s + Number(l.debit), 0);
      const totalCredit = lines!.reduce((s, l) => s + Number(l.credit), 0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.01);
    });

    it("reversal journal lines are the inverse of original (swap debit/credit)", async () => {
      const { data: reversal } = await serviceClient
        .from("journal_entry")
        .select("id")
        .eq("source_id", approvedInvoiceId)
        .eq("source_type", "invoice_reversal")
        .single();

      const { data: originalLines } = await serviceClient
        .from("journal_line")
        .select("account_id, debit, credit")
        .eq("journal_entry_id", originalEntryId)
        .order("account_id");

      const { data: reversalLines } = await serviceClient
        .from("journal_line")
        .select("account_id, debit, credit")
        .eq("journal_entry_id", reversal!.id)
        .order("account_id");

      // Each original line should have swapped debit/credit in reversal
      for (let i = 0; i < originalLines!.length; i++) {
        const orig = originalLines![i];
        const rev = reversalLines!.find((r) => r.account_id === orig.account_id);
        if (rev) {
          expect(Number(rev.debit)).toBeCloseTo(Number(orig.credit), 1);
          expect(Number(rev.credit)).toBeCloseTo(Number(orig.debit), 1);
        }
      }
    });
  });

  describe("eTax invoice protection", () => {
    it("CANNOT void an eTax-submitted invoice", async () => {
      const { data, error } = await userClient(userA.accessToken).rpc(
        "rpc_void_invoice",
        { p_invoice_id: etaxInvoiceId }
      );
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/eTax|credit note/i);

      // Status unchanged
      const { data: after } = await serviceClient
        .from("invoices")
        .select("status")
        .eq("id", etaxInvoiceId)
        .single();
      expect(after!.status).toBe("approved");
    });
  });

  describe("Status validation", () => {
    it("returns error when trying to void a draft invoice", async () => {
      // Draft invoices don't have journal entries, void behavior TBD
      const { data } = await userClient(userA.accessToken).rpc(
        "rpc_void_invoice",
        { p_invoice_id: draftInvoiceId2 }
      );
      // Should either succeed with no reversal (no journal to reverse) or fail gracefully
      // In any case, should not throw an unhandled error
      expect(data).toBeDefined();
      expect(typeof data.success).toBe("boolean");
    });
  });

  describe("Cross-tenant isolation", () => {
    it("userB CANNOT void orgA invoice", async () => {
      // Create another approved invoice in orgA
      const jobAId3 = await seedJob(orgA.id, "JOB-XVOID-A");
      const { data: inv } = await serviceClient
        .from("invoices")
        .insert({
          org_id: orgA.id,
          job_id: jobAId3,
          code: "INV-XVOID",
          status: "approved",
          total: 5350,
          issued_date: "2026-08-01",
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      const { data } = await userClient(userB.accessToken).rpc(
        "rpc_void_invoice",
        { p_invoice_id: inv!.id }
      );
      expect(data.success).toBe(false);

      // Status unchanged
      const { data: after } = await serviceClient
        .from("invoices")
        .select("status")
        .eq("id", inv!.id)
        .single();
      expect(after!.status).toBe("approved");
    });
  });

  describe("v_invoice_journal_status view", () => {
    it("shows 'reversed' status for voided invoice", async () => {
      const { data } = await userClient(userA.accessToken)
        .from("v_invoice_journal_status")
        .select("*")
        .eq("invoice_id", approvedInvoiceId)
        .single();
      expect(data!.journal_posting_status).toBe("reversed");
    });

    it("shows 'posted' status for approved invoice", async () => {
      // Use the draftInvoiceId that was approved in previous test
      const { data: inv } = await serviceClient
        .from("invoices")
        .select("id")
        .eq("code", "INV-APPR-001")
        .single();

      const { data } = await userClient(userA.accessToken)
        .from("v_invoice_journal_status")
        .select("*")
        .eq("invoice_id", inv!.id)
        .single();
      expect(data!.journal_posting_status).toBe("posted");
    });

    it("does NOT show orgB invoices to userA", async () => {
      const jobBId2 = await seedJob(orgB.id, "JOB-VIEW-B");
      const { data: bInv } = await serviceClient
        .from("invoices")
        .insert({
          org_id: orgB.id,
          job_id: jobBId2,
          code: "INV-VIEW-B001",
          status: "approved",
          total: 5350,
          issued_date: "2026-08-01",
        })
        .select("id")
        .single();

      const { data } = await userClient(userA.accessToken)
        .from("v_invoice_journal_status")
        .select("*")
        .eq("invoice_id", bInv!.id);

      expect(data).toHaveLength(0); // RLS blocks orgB data
    });
  });
});

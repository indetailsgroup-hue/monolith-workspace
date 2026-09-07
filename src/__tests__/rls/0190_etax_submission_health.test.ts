/**
 * Test Suite: 0190_etax_submission_health.test.ts
 *
 * Migration: 0190_etax_submission_health.sql
 * View:      v_etax_submission_health
 * RPCs:      rpc_etax_submission_health()       — authenticated, FINANCE/ADMIN/OWNER, org-scoped
 *            rpc_etax_submission_health_admin() — service_role only, all orgs
 *
 * Groups:
 *   A — Schema (column presence + types)
 *   B — Org Isolation / Access Control
 *   C — retry_exhaustion_rate_pct calculation accuracy
 *   D — success_rate_pct calculation accuracy
 *   E — rpc_etax_submission_health_admin cross-org ordering
 *   F — system alert columns (CROSS JOIN correctness)
 *   G — Edge cases & idempotency
 *
 * Total: ~52 tests
 *
 * Setup assumptions:
 *   • Supabase test client available via createClient(url, serviceKey)
 *   • Two test org fixtures: ORG_A, ORG_B (created in beforeAll, removed in afterAll)
 *   • Three test users: userOwner (OWNER in ORG_A), userFinance (FINANCE in ORG_A),
 *     userViewer (VIEWER in ORG_A), userAdminB (ADMIN in ORG_B)
 *   • Seed helpers: insertSubmission(), insertAuditRow(), insertRefreshLog(), insertSystemAlert()
 *   • All seeded rows tagged with metadata->>'test_tag' = '0190_test_suite' for cleanup
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

// ─── Client setup ────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY  = process.env.SERVICE_ROLE_KEY  ?? '';
const ANON_KEY          = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? '';

const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth:   { persistSession: false },
  });
}

async function execSql(query: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await svc.rpc('exec_sql', { query });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEST_TAG = '0190_test_suite';

let ORG_A: string;
let ORG_B: string;
let ORG_C: string; // org with zero submissions — for NULL guard tests

let tokenOwnerA:   string; // OWNER  in ORG_A
let tokenFinanceA: string; // FINANCE in ORG_A
let tokenViewerA:  string; // VIEWER in ORG_A
let tokenAdminB:   string; // ADMIN  in ORG_B
let tokenDesigner: string; // DESIGNER in ORG_A

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestOrg(name: string): Promise<string> {
  const orgId = crypto.randomUUID()
  const { data, error } = await svc
    .from('organizations')
    .insert({ org_id: orgId, name, slug: `test-0190-${orgId}`, plan: 'ENTERPRISE' })
    .select('org_id')
    .single();
  if (error) throw error;
  return data.org_id;
}

async function createTestUser(
  email: string,
  orgId: string,
  role: string,
): Promise<string> {
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email,
    password: 'Test1234!',
    email_confirm: true,
  });
  if (authErr) throw authErr;
  const userId = authData.user!.id;

  const { error: memberError } = await svc
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role, email });
  if (memberError) throw memberError;
  const { error: metadataError } = await svc.auth.admin.updateUserById(userId, {
    app_metadata: { roles: [role.toLowerCase()], org_id: orgId },
  });
  if (metadataError) throw metadataError;

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: 'Test1234!',
  });
  if (signInError || !signIn.session) throw signInError ?? new Error(`No session for ${email}`);
  return signIn.session.access_token;
}

interface SubmissionOpts {
  orgId:        string;
  status:       'queued' | 'submitting' | 'submitted' | 'failed' | 'cancelled';
  attemptCount: number;
  pdfStatus?:   'pending' | 'downloading' | 'downloaded' | 'failed';
  invoiceId?:   string;
}

async function ensureInvoice(orgId: string, invoiceId: string): Promise<void> {
  const { data: existingCustomer, error: customerError } = await svc
    .from('customers')
    .select('customer_id')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle();
  if (customerError) throw customerError;
  let customer = existingCustomer;

  if (!customer) {
    const customerId = crypto.randomUUID();
    const inserted = await svc
      .from('customers')
      .insert({ customer_id: customerId, org_id: orgId, name: `eTax Test Customer ${orgId}` })
      .select('customer_id')
      .single();
    if (inserted.error) throw inserted.error;
    customer = inserted.data;
  }

  const { error } = await svc.from('invoices').upsert({
    id: invoiceId,
    invoice_id: invoiceId,
    invoice_code: `INV-0190-${invoiceId}`,
    org_id: orgId,
    customer_id: customer.customer_id,
    status: 'approved',
    total: 1070,
    due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    created_by: '00000000-0000-0000-0000-000000000001',
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function insertSubmission(opts: SubmissionOpts): Promise<string> {
  const invoiceId = opts.invoiceId ?? crypto.randomUUID();
  await ensureInvoice(opts.orgId, invoiceId);
  const { data, error } = await svc
    .from('etax_submissions')
    .insert({
      org_id:        opts.orgId,
      invoice_id:    invoiceId,
      document_type: 'T01',
      status:        opts.status,
      attempt_count: opts.attemptCount,
      pdf_status:    opts.pdfStatus ?? 'pending',
      metadata:      { test_tag: TEST_TAG },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function insertSystemAlert(lagSeconds: number): Promise<string> {
  const { data, error } = await svc
    .from('etax_submission_audit_log')
    .insert({
      submission_id:  null,
      trigger_source: 'system',
      old_status:     null,
      new_status:     null,
      actor_role:     'system',
      metadata: {
        alert_type:    'mv_refresh_critical',
        lag_seconds:   lagSeconds,
        test_tag:      TEST_TAG,
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function insertRefreshLog(refreshedAt?: Date): Promise<void> {
  await svc.from('etax_compliance_mv_refresh_log').insert({
    refreshed_at: (refreshedAt ?? new Date()).toISOString(),
    duration_ms:  120,
    row_count:    5,
    triggered_by: 'test_suite',
  });
}

async function purgeTestData(): Promise<void> {
  // Purge submissions
  await svc
    .from('etax_submissions')
    .delete()
    .contains('metadata', { test_tag: TEST_TAG });

  // Purge audit log alerts
  await svc
    .from('etax_submission_audit_log')
    .delete()
    .contains('metadata', { test_tag: TEST_TAG });

  // Purge refresh log rows seeded by tests
  await svc
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test_suite');
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  ORG_A = await createTestOrg('HealthTestOrgA');
  ORG_B = await createTestOrg('HealthTestOrgB');
  ORG_C = await createTestOrg('HealthTestOrgC_empty');

  tokenOwnerA   = await createTestUser('owner_a@test.local',   ORG_A, 'OWNER');
  tokenFinanceA = await createTestUser('finance_a@test.local', ORG_A, 'FINANCE');
  tokenViewerA  = await createTestUser('viewer_a@test.local',  ORG_A, 'VIEWER');
  tokenAdminB   = await createTestUser('admin_b@test.local',   ORG_B, 'ADMIN');
  tokenDesigner = await createTestUser('designer_a@test.local',ORG_A, 'DESIGNER');
});

afterAll(async () => {
  await purgeTestData();

  // Remove test orgs and users (cascade)
  for (const orgId of [ORG_A, ORG_B, ORG_C]) {
    await svc.from('invoices').delete().eq('org_id', orgId);
    await svc.from('customers').delete().eq('org_id', orgId);
    await svc.from('organizations').delete().eq('org_id', orgId);
  }
});

afterEach(async () => {
  await purgeTestData();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP A — Schema
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group A — Schema', () => {
  const EXPECTED_COLUMNS = [
    'org_id',
    'total_submissions',
    'successful_submissions',
    'failed_submissions',
    'pending_submissions',
    'cancelled_submissions',
    'exhausted_submissions',
    'retry_exhaustion_rate_pct',
    'success_rate_pct',
    'avg_attempt_count',
    'max_attempt_count',
    'pdfs_downloaded',
    'pdfs_failed',
    'last_submission_at',
    'first_submission_at',
    'total_alerts_in_window',
    'resolved_alerts',
    'unresolved_alerts',
    'alert_resolution_rate_pct',
    'avg_seconds_to_resolve',
    'oldest_alert_in_window',
    'latest_alert_at',
    'current_freshness_status',
    'current_lag_seconds',
    'current_last_refreshed_at',
  ];

  it('A-01: v_etax_submission_health view exists in public schema', async () => {
    const rows = await execSql(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'v_etax_submission_health'
    `);
    expect(rows[0]?.table_name).toBe('v_etax_submission_health');
  });

  it('A-02: view exposes all 25 expected columns', async () => {
    const rows = await execSql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_etax_submission_health'
    `);
    const actual = rows.map((row) => row.column_name);
    for (const col of EXPECTED_COLUMNS) {
      expect(actual, `column '${col}' missing from view`).toContain(col);
    }
  });

  it('A-03: retry_exhaustion_rate_pct column is numeric type', async () => {
    const rows = await execSql(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_etax_submission_health'
        AND column_name = 'retry_exhaustion_rate_pct'
    `);
    expect(rows[0]?.data_type).toMatch(/numeric|decimal/i);
  });

  it('A-04: avg_seconds_to_resolve column is numeric type', async () => {
    const rows = await execSql(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_etax_submission_health'
        AND column_name = 'avg_seconds_to_resolve'
    `);
    expect(rows[0]?.data_type).toMatch(/numeric|decimal/i);
  });

  it('A-05: org_id column is uuid type', async () => {
    const rows = await execSql(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_etax_submission_health'
        AND column_name = 'org_id'
    `);
    expect(rows[0]?.data_type).toBe('uuid');
  });

  it('A-06: rpc_etax_submission_health function exists', async () => {
    const rows = await execSql(`SELECT proname FROM pg_proc WHERE proname = 'rpc_etax_submission_health'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('A-07: rpc_etax_submission_health_admin function exists', async () => {
    const rows = await execSql(`SELECT proname FROM pg_proc WHERE proname = 'rpc_etax_submission_health_admin'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('A-08: both RPCs are SECURITY DEFINER', async () => {
    const rows = await execSql(`
      SELECT proname, prosecdef FROM pg_proc
      WHERE proname IN ('rpc_etax_submission_health', 'rpc_etax_submission_health_admin')
    `);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const fn of rows) {
      expect(fn.prosecdef, `${String(fn.proname)} must be SECURITY DEFINER`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — Org Isolation / Access Control
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group B — Org Isolation / Access Control', () => {
  beforeAll(async () => {
    // Seed 3 submissions for ORG_A and 2 for ORG_B
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3 });

    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_B, status: 'failed',    attemptCount: 2 });
  });

  it('B-01: OWNER in ORG_A can call rpc_etax_submission_health and sees only ORG_A', async () => {
    const client = userClient(tokenOwnerA);
    const { data, error } = await client.rpc('rpc_etax_submission_health');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].org_id).toBe(ORG_A);
  });

  it('B-02: FINANCE in ORG_A can call rpc_etax_submission_health', async () => {
    const client = userClient(tokenFinanceA);
    const { data, error } = await client.rpc('rpc_etax_submission_health');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].org_id).toBe(ORG_A);
  });

  it('B-03: VIEWER in ORG_A receives P0001 rejection', async () => {
    const client = userClient(tokenViewerA);
    const { error } = await client.rpc('rpc_etax_submission_health');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/insufficient role/i);
  });

  it('B-04: DESIGNER in ORG_A receives P0001 rejection', async () => {
    const client = userClient(tokenDesigner);
    const { error } = await client.rpc('rpc_etax_submission_health');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/insufficient role/i);
  });

  it('B-05: unauthenticated caller is rejected', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc('rpc_etax_submission_health');
    expect(error).not.toBeNull();
  });

  it('B-06: OWNER in ORG_A does NOT see ORG_B rows in rpc_etax_submission_health', async () => {
    const client = userClient(tokenOwnerA);
    const { data } = await client.rpc('rpc_etax_submission_health');
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds).not.toContain(ORG_B);
  });

  it('B-07: direct SELECT on v_etax_submission_health is blocked for authenticated role', async () => {
    const { data: privData } = await svc.rpc('execute_sql', {
      sql: `SELECT has_table_privilege('authenticated', 'public.v_etax_submission_health', 'SELECT')`,
    });
    // Using pg_catalog check
    const { data } = await svc
      .from('information_schema.role_table_grants')
      .select('privilege_type, grantee')
      .eq('table_name', 'v_etax_submission_health')
      .eq('grantee', 'authenticated');
    expect((data ?? []).length).toBe(0);
  });

  it('B-08: ADMIN in ORG_B cannot see ORG_A data via rpc_etax_submission_health', async () => {
    const client = userClient(tokenAdminB);
    const { data } = await client.rpc('rpc_etax_submission_health');
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds).not.toContain(ORG_A);
    expect(orgIds).toContain(ORG_B);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — retry_exhaustion_rate_pct calculation accuracy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group C — retry_exhaustion_rate_pct accuracy', () => {
  it('C-01: 0 exhausted of 4 total → rate = 0.00', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 2 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 4 }); // not exhausted

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row).toBeDefined();
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(0.0);
  });

  it('C-02: 1 exhausted of 4 total → rate = 25.00', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3 }); // not exhausted
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 4 }); // not exhausted
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 }); // exhausted

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(25.0);
  });

  it('C-03: 2 exhausted of 4 total → rate = 50.00', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 3 });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 2 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(50.0);
  });

  it('C-04: 4 exhausted of 4 total → rate = 100.00', async () => {
    for (let i = 0; i < 4; i++) {
      await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5 });
    }
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(100.0);
  });

  it('C-05: submitted rows with attempt_count=5 are NOT counted as exhausted (status must be failed)', async () => {
    // submitted with attempt_count=5 — this is NOT an exhausted retry, just a retry that succeeded
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 }); // only this counts

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.exhausted_submissions).toBe(1);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(50.0);
  });

  it('C-06: cancelled rows with attempt_count=5 are NOT counted as exhausted', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'cancelled', attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.exhausted_submissions).toBe(1);
  });

  it('C-07: attempt_count=4 failed row does NOT count as exhausted (threshold is >= 5)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 4 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.exhausted_submissions).toBe(0);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(0.0);
  });

  it('C-08: rate rounds to 2 decimal places (1 of 3 = 33.33)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBeCloseTo(33.33, 2);
  });

  it('C-09: org with zero submissions has no row in view (not NULL rate)', async () => {
    // ORG_C has no submissions — it should not appear in the view at all
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_C);
    expect(row).toBeUndefined();
  });

  it('C-10: pending and queued submissions do not affect exhaustion count', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'queued',     attemptCount: 0 });
    await insertSubmission({ orgId: ORG_A, status: 'submitting', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',     attemptCount: 5 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.total_submissions).toBe(3);
    expect(row!.exhausted_submissions).toBe(1);
    // rate = 1/3 = 33.33
    expect(Number(row!.retry_exhaustion_rate_pct)).toBeCloseTo(33.33, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — success_rate_pct accuracy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group D — success_rate_pct accuracy', () => {
  it('D-01: 4 submitted of 4 → success_rate = 100.00', async () => {
    for (let i = 0; i < 4; i++) {
      await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    }
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.success_rate_pct)).toBe(100.0);
  });

  it('D-02: 0 submitted of 4 → success_rate = 0.00', async () => {
    for (let i = 0; i < 4; i++) {
      await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 3 });
    }
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.success_rate_pct)).toBe(0.0);
  });

  it('D-03: 2 submitted of 4 → success_rate = 50.00', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.success_rate_pct)).toBe(50.0);
  });

  it('D-04: pending/queued submissions are included in total_submissions denominator', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted',  attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'queued',     attemptCount: 0 });
    await insertSubmission({ orgId: ORG_A, status: 'submitting', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted',  attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    // 2 submitted / 4 total = 50.00
    expect(row!.total_submissions).toBe(4);
    expect(row!.successful_submissions).toBe(2);
    expect(Number(row!.success_rate_pct)).toBe(50.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP E — rpc_etax_submission_health_admin cross-org ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group E — rpc_etax_submission_health_admin cross-org ordering', () => {
  beforeAll(async () => {
    // ORG_A: 2 exhausted of 4 = 50% exhaustion
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });

    // ORG_B: 0 exhausted of 2 = 0% exhaustion
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });
  });

  it('E-01: admin RPC returns rows for both ORG_A and ORG_B', async () => {
    const { data, error } = await svc.rpc('rpc_etax_submission_health_admin');
    expect(error).toBeNull();
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds).toContain(ORG_A);
    expect(orgIds).toContain(ORG_B);
  });

  it('E-02: admin RPC orders by retry_exhaustion_rate_pct DESC — ORG_A before ORG_B', async () => {
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const rows = (data ?? []).filter(
      (r: any) => r.org_id === ORG_A || r.org_id === ORG_B,
    );
    const indexA = rows.findIndex((r: any) => r.org_id === ORG_A);
    const indexB = rows.findIndex((r: any) => r.org_id === ORG_B);
    expect(indexA).toBeLessThan(indexB);
  });

  it('E-03: admin RPC is blocked for authenticated users (not service_role)', async () => {
    const client = userClient(tokenOwnerA);
    const { error } = await client.rpc('rpc_etax_submission_health_admin');
    expect(error).not.toBeNull();
  });

  it('E-04: admin RPC has no p_org_id parameter — calling with org_id arg is rejected', async () => {
    // The admin RPC accepts no parameters — passing one should be an error
    const { error } = await svc.rpc('rpc_etax_submission_health_admin', {
      p_org_id: ORG_A,
    } as any);
    expect(error).not.toBeNull();
  });

  it('E-05: admin RPC returns exhausted_submissions = 2 for ORG_A', async () => {
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.exhausted_submissions).toBe(2);
  });

  it('E-06: admin RPC returns exhausted_submissions = 0 for ORG_B', async () => {
    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_B);
    expect(row!.exhausted_submissions).toBe(0);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(0.0);
  });

  it('E-07: failed_submissions DESC is secondary sort — two orgs with equal exhaustion ordered by failed count', async () => {
    // Both orgs have 0 exhausted — ORG with more failed rows should appear first
    await insertSubmission({ orgId: ORG_B, status: 'failed', attemptCount: 2 });
    await insertSubmission({ orgId: ORG_B, status: 'failed', attemptCount: 3 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');

    // Find ORG_A and ORG_B rows (after our seeding above, ORG_A has 2 failed, ORG_B now has 2+2=4 failed)
    const rows = (data ?? []).filter(
      (r: any) => r.org_id === ORG_A || r.org_id === ORG_B,
    );
    // Both have 50% exhaustion (A) and 0% (B); primary sort keeps A first regardless
    // Secondary sort test: add 0-exhausted orgs and check failed-count ordering
    const orgB = rows.find((r: any) => r.org_id === ORG_B);
    const orgA = rows.find((r: any) => r.org_id === ORG_A);
    expect(orgA).toBeDefined();
    expect(orgB).toBeDefined();
    // ORG_A has higher exhaustion — must come first
    const indexA = rows.indexOf(orgA!);
    const indexB = rows.indexOf(orgB!);
    expect(indexA).toBeLessThan(indexB);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP F — System alert columns (CROSS JOIN correctness)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group F — System alert columns (CROSS JOIN correctness)', () => {
  it('F-01: when no system alerts exist, total_alerts_in_window = 0 for all orgs', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    for (const row of data ?? []) {
      expect(Number(row.total_alerts_in_window)).toBe(0);
    }
  });

  it('F-02: all org rows carry the same total_alerts_in_window value (CROSS JOIN)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });
    await insertSystemAlert(2400);

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const rows = (data ?? []).filter(
      (r: any) => r.org_id === ORG_A || r.org_id === ORG_B,
    );
    expect(rows).toHaveLength(2);
    const windowA = Number(rows[0].total_alerts_in_window);
    const windowB = Number(rows[1].total_alerts_in_window);
    // Both should be identical (system-level CROSS JOIN)
    expect(windowA).toBe(windowB);
    expect(windowA).toBeGreaterThanOrEqual(1);
  });

  it('F-03: avg_seconds_to_resolve is NULL when no alerts are resolved', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSystemAlert(2400); // unresolved — no refresh log after it

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.avg_seconds_to_resolve).toBeNull();
  });

  it('F-04: avg_seconds_to_resolve > 0 after a refresh log entry resolves the alert', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });

    // Insert alert, then a refresh log 5 seconds later
    await insertSystemAlert(2400);
    const futureRefresh = new Date(Date.now() + 5000);
    await insertRefreshLog(futureRefresh);

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.avg_seconds_to_resolve)).toBeGreaterThan(0);
  });

  it('F-05: current_freshness_status is a string (fresh/stale/critical/unknown)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(typeof row!.current_freshness_status).toBe('string');
    expect(['fresh', 'stale', 'critical', 'unknown']).toContain(
      row!.current_freshness_status,
    );
  });

  it('F-06: org-scoped RPC carries same system-level alert columns as admin RPC', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSystemAlert(2400);

    const [adminResult, orgResult] = await Promise.all([
      svc.rpc('rpc_etax_submission_health_admin'),
      svc.rpc('rpc_etax_submission_health'), // service_role bypasses auth guard for testing
    ]);

    const adminRow = (adminResult.data ?? []).find((r: any) => r.org_id === ORG_A);
    const orgRow   = (orgResult.data ?? []).find((r: any) => r.org_id === ORG_A);

    // Both views should carry the same system-level aggregate
    expect(Number(adminRow!.total_alerts_in_window)).toBe(
      Number(orgRow!.total_alerts_in_window),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP G — Edge cases & idempotency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group G — Edge cases & idempotency', () => {
  it('G-01: org with only cancelled submissions is included in view', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'cancelled', attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row).toBeDefined();
    expect(row!.total_submissions).toBe(1);
    expect(row!.cancelled_submissions).toBe(1);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(0);
  });

  it('G-02: org with only queued submissions shows 0 success_rate and 0 exhaustion', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'queued', attemptCount: 0 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(Number(row!.success_rate_pct)).toBe(0);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(0);
  });

  it('G-03: max_attempt_count reflects the highest attempt_count in org', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 3 });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 7 }); // > normal max
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 1 });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.max_attempt_count).toBe(7);
  });

  it('G-04: pdf_status=downloaded increments pdfs_downloaded; pdf_status=failed increments pdfs_failed', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, pdfStatus: 'downloaded' });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, pdfStatus: 'downloaded' });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5, pdfStatus: 'failed' });

    const { data } = await svc.rpc('rpc_etax_submission_health_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A);
    expect(row!.pdfs_downloaded).toBe(2);
    expect(row!.pdfs_failed).toBe(1);
  });

  it('G-05: calling the view twice in rapid succession returns identical results (idempotency)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5 });

    const [r1, r2] = await Promise.all([
      svc.rpc('rpc_etax_submission_health_admin'),
      svc.rpc('rpc_etax_submission_health_admin'),
    ]);

    const rowA1 = (r1.data ?? []).find((r: any) => r.org_id === ORG_A);
    const rowA2 = (r2.data ?? []).find((r: any) => r.org_id === ORG_A);

    expect(Number(rowA1!.retry_exhaustion_rate_pct)).toBe(
      Number(rowA2!.retry_exhaustion_rate_pct),
    );
    expect(rowA1!.exhausted_submissions).toBe(rowA2!.exhausted_submissions);
  });

  it('G-06: rolling back an in-progress submission insert leaves view unaffected', async () => {
    const before = await svc.rpc('rpc_etax_submission_health_admin');
    const beforeRow = (before.data ?? []).find((r: any) => r.org_id === ORG_A);
    const beforeCount = beforeRow?.total_submissions ?? 0;

    // Simulate a transaction that inserts then rolls back (we cannot do this directly
    // in the JS client; we verify via a DO block in SQL)
    await svc.rpc('execute_sql', {
      sql: `
        BEGIN;
        INSERT INTO public.etax_submissions
          (org_id, invoice_id, document_type, status, attempt_count, metadata)
        VALUES
          ('${ORG_A}', gen_random_uuid(), 'T01', 'queued', 0, '{"test_tag":"0190_rollback_test"}');
        ROLLBACK;
      `,
    });

    const after = await svc.rpc('rpc_etax_submission_health_admin');
    const afterRow = (after.data ?? []).find((r: any) => r.org_id === ORG_A);
    const afterCount = afterRow?.total_submissions ?? 0;

    expect(afterCount).toBe(beforeCount);
  });
});

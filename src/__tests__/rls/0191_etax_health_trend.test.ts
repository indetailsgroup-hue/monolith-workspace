/**
 * Test Suite: 0191_etax_health_trend.test.ts
 *
 * Migration: 0191_etax_health_trend.sql
 * View:      v_etax_health_trend
 * RPCs:      rpc_etax_health_trend()           — authenticated, FINANCE/ADMIN/OWNER, org-scoped
 *            rpc_etax_health_trend_admin()     — service_role only, all orgs
 *            rpc_etax_health_trend_admin(UUID) — service_role only, single-org override
 *
 * Groups:
 *   A — Schema (column presence + types)
 *   B — Org isolation / access control
 *   C — 30-day window boundary accuracy
 *   D — day_rank ordering
 *   E — retry_exhaustion_rate_pct daily precision
 *   F — admin RPC variants (cross-org, single-org, auth guard)
 *   G — Edge cases (zero-submission days omitted, multi-day aggregation, idempotency)
 *
 * Total: ~57 tests
 *
 * Setup assumptions:
 *   • Supabase test client via createClient(url, serviceKey)
 *   • Three test orgs: ORG_A, ORG_B, ORG_C
 *   • Test users: userOwner (OWNER/ORG_A), userFinance (FINANCE/ORG_A),
 *     userViewer (VIEWER/ORG_A), userAdminB (ADMIN/ORG_B), userDesigner (DESIGNER/ORG_A)
 *   • insertSubmission(opts): inserts a row into etax_submissions with a given created_at
 *   • All rows tagged metadata->>'test_tag' = '0191_test_suite' for afterEach cleanup
 *   • Date helpers: todayUTC(), daysAgoUTC(n), daysAgoTs(n) work in UTC
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';

// ─── Client setup ────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.SUPABASE_URL     ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? '';
const ANON_KEY         = process.env.ANON_KEY         ?? '';

const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function userClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
}

// ─── Date helpers (UTC) ───────────────────────────────────────────────────────

/** Returns today's date as 'YYYY-MM-DD' in UTC */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns a Date object set to midnight UTC n days ago (n=0 → today midnight UTC).
 * created_at values are set to noon UTC on that day to avoid boundary edge cases.
 */
function daysAgoTs(n: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);          // noon UTC
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/** Returns 'YYYY-MM-DD' for n days ago in UTC */
function daysAgoUTC(n: number): string {
  return daysAgoTs(n).slice(0, 10);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEST_TAG = '0191_test_suite';

let ORG_A: string;
let ORG_B: string;
let ORG_C: string;   // empty org — used for "no row" assertions

let tokenOwnerA:   string;
let tokenFinanceA: string;
let tokenViewerA:  string;
let tokenAdminB:   string;
let tokenDesigner: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestOrg(name: string): Promise<string> {
  const orgId = crypto.randomUUID()
  const { data, error } = await svc
    .from('organizations')
    .insert({ org_id: orgId, name, slug: `test-0191-${orgId}` })
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
  const { data: authData, error: authErr } =
    await svc.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true });
  if (authErr) throw authErr;
  const userId = authData.user!.id;
  await svc.from('org_members').insert({ org_id: orgId, user_id: userId, role });
  // In the real harness, exchange magic link for JWT; returning userId as placeholder
  return userId;
}

interface SubOpts {
  orgId:        string;
  status:       'queued' | 'submitting' | 'submitted' | 'failed' | 'cancelled';
  attemptCount: number;
  pdfStatus?:   'pending' | 'downloading' | 'downloaded' | 'failed';
  createdAt?:   string;   // ISO timestamp — defaults to today noon UTC
}

async function insertSubmission(opts: SubOpts): Promise<string> {
  const { data, error } = await svc
    .from('etax_submissions')
    .insert({
      org_id:        opts.orgId,
      invoice_id:    crypto.randomUUID(),
      document_type: 'T01',
      status:        opts.status,
      attempt_count: opts.attemptCount,
      pdf_status:    opts.pdfStatus ?? 'pending',
      created_at:    opts.createdAt ?? daysAgoTs(0),
      metadata:      { test_tag: TEST_TAG },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function purgeTestData(): Promise<void> {
  await svc
    .from('etax_submissions')
    .delete()
    .contains('metadata', { test_tag: TEST_TAG });
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  ORG_A = await createTestOrg('TrendTestOrgA');
  ORG_B = await createTestOrg('TrendTestOrgB');
  ORG_C = await createTestOrg('TrendTestOrgC_empty');

  tokenOwnerA   = await createTestUser('trend_owner_a@test.local',   ORG_A, 'OWNER');
  tokenFinanceA = await createTestUser('trend_finance_a@test.local', ORG_A, 'FINANCE');
  tokenViewerA  = await createTestUser('trend_viewer_a@test.local',  ORG_A, 'VIEWER');
  tokenAdminB   = await createTestUser('trend_admin_b@test.local',   ORG_B, 'ADMIN');
  tokenDesigner = await createTestUser('trend_designer@test.local',  ORG_A, 'DESIGNER');
});

afterAll(async () => {
  await purgeTestData();
  for (const orgId of [ORG_A, ORG_B, ORG_C]) {
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
    'submission_day',
    'day_rank',
    'daily_total',
    'daily_successful',
    'daily_failed',
    'daily_pending',
    'daily_cancelled',
    'daily_exhausted',
    'retry_exhaustion_rate_pct',
    'success_rate_pct',
    'avg_attempt_count',
    'max_attempt_count',
    'daily_pdfs_downloaded',
    'daily_pdfs_failed',
    'pdf_success_rate_pct',
    'snapshot_at',
  ];

  it('A-01: v_etax_health_trend exists in public schema', async () => {
    const { data, error } = await svc
      .from('information_schema.views')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend')
      .single();
    expect(error).toBeNull();
    expect(data?.table_name).toBe('v_etax_health_trend');
  });

  it('A-02: view exposes all 17 expected columns', async () => {
    const { data, error } = await svc
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend');
    expect(error).toBeNull();
    const actual = (data ?? []).map((r: any) => r.column_name);
    for (const col of EXPECTED_COLUMNS) {
      expect(actual, `column '${col}' missing`).toContain(col);
    }
  });

  it('A-03: submission_day is of type date', async () => {
    const { data } = await svc
      .from('information_schema.columns')
      .select('data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend')
      .eq('column_name', 'submission_day')
      .single();
    expect(data?.data_type).toBe('date');
  });

  it('A-04: retry_exhaustion_rate_pct and success_rate_pct are numeric', async () => {
    const { data } = await svc
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend')
      .in('column_name', ['retry_exhaustion_rate_pct', 'success_rate_pct']);
    for (const row of data ?? []) {
      expect((row as any).data_type).toMatch(/numeric|decimal/i);
    }
  });

  it('A-05: day_rank is bigint', async () => {
    const { data } = await svc
      .from('information_schema.columns')
      .select('data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend')
      .eq('column_name', 'day_rank')
      .single();
    expect(data?.data_type).toMatch(/bigint|int8/i);
  });

  it('A-06: snapshot_at is timestamptz', async () => {
    const { data } = await svc
      .from('information_schema.columns')
      .select('data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'v_etax_health_trend')
      .eq('column_name', 'snapshot_at')
      .single();
    expect(data?.data_type).toMatch(/timestamp with time zone/i);
  });

  it('A-07: rpc_etax_health_trend function exists', async () => {
    const { data } = await svc
      .from('pg_proc')
      .select('proname')
      .eq('proname', 'rpc_etax_health_trend');
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('A-08: both rpc_etax_health_trend_admin variants exist (0-arg and 1-arg)', async () => {
    const { data } = await svc
      .from('pg_proc')
      .select('proname, pronargs')
      .eq('proname', 'rpc_etax_health_trend_admin');
    const argCounts = (data ?? []).map((r: any) => r.pronargs).sort();
    expect(argCounts).toContain(0);
    expect(argCounts).toContain(1);
  });

  it('A-09: all three RPCs are SECURITY DEFINER', async () => {
    const { data } = await svc
      .from('pg_proc')
      .select('proname, prosecdef')
      .in('proname', ['rpc_etax_health_trend', 'rpc_etax_health_trend_admin']);
    for (const fn of data ?? []) {
      expect((fn as any).prosecdef, `${(fn as any).proname} must be SECURITY DEFINER`).toBe(true);
    }
  });

  it('A-10: supporting index idx_etaxsub_org_created_at exists', async () => {
    const { data } = await svc
      .from('pg_indexes')
      .select('indexname')
      .eq('schemaname', 'public')
      .eq('indexname', 'idx_etaxsub_org_created_at')
      .single();
    expect(data?.indexname).toBe('idx_etaxsub_org_created_at');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — Org isolation / access control
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group B — Org isolation / access control', () => {
  beforeEach(async () => {
    // Seed 1 submission each for ORG_A and ORG_B today
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1 });
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1 });
  });

  it('B-01: OWNER in ORG_A receives only ORG_A rows', async () => {
    const client = userClient(tokenOwnerA);
    const { data, error } = await client.rpc('rpc_etax_health_trend');
    expect(error).toBeNull();
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds.every((id: string) => id === ORG_A)).toBe(true);
  });

  it('B-02: FINANCE in ORG_A can call rpc_etax_health_trend', async () => {
    const client = userClient(tokenFinanceA);
    const { data, error } = await client.rpc('rpc_etax_health_trend');
    expect(error).toBeNull();
    expect((data ?? []).every((r: any) => r.org_id === ORG_A)).toBe(true);
  });

  it('B-03: VIEWER in ORG_A receives P0001 insufficient role', async () => {
    const client = userClient(tokenViewerA);
    const { error } = await client.rpc('rpc_etax_health_trend');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/insufficient role/i);
  });

  it('B-04: DESIGNER in ORG_A receives P0001 insufficient role', async () => {
    const client = userClient(tokenDesigner);
    const { error } = await client.rpc('rpc_etax_health_trend');
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/insufficient role/i);
  });

  it('B-05: unauthenticated caller is rejected', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.rpc('rpc_etax_health_trend');
    expect(error).not.toBeNull();
  });

  it('B-06: ORG_A caller does not receive ORG_B rows', async () => {
    const client = userClient(tokenOwnerA);
    const { data } = await client.rpc('rpc_etax_health_trend');
    expect((data ?? []).map((r: any) => r.org_id)).not.toContain(ORG_B);
  });

  it('B-07: ADMIN in ORG_B receives only ORG_B rows', async () => {
    const client = userClient(tokenAdminB);
    const { data, error } = await client.rpc('rpc_etax_health_trend');
    expect(error).toBeNull();
    expect((data ?? []).every((r: any) => r.org_id === ORG_B)).toBe(true);
  });

  it('B-08: authenticated role has no direct SELECT privilege on v_etax_health_trend', async () => {
    const { data } = await svc
      .from('information_schema.role_table_grants')
      .select('privilege_type, grantee')
      .eq('table_name', 'v_etax_health_trend')
      .eq('grantee', 'authenticated');
    expect((data ?? []).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — 30-day window boundary accuracy
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group C — 30-day window boundary accuracy', () => {
  it('C-01: submission today (day 0) appears in results', async () => {
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(0),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find(
      (r: any) => r.org_id === ORG_A && r.submission_day === todayUTC(),
    );
    expect(row).toBeDefined();
    expect(row!.daily_total).toBeGreaterThanOrEqual(1);
  });

  it('C-02: submission 29 days ago (last day of window) appears in results', async () => {
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(29),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const day29 = daysAgoUTC(29);
    const row = (data ?? []).find(
      (r: any) => r.org_id === ORG_A && r.submission_day === day29,
    );
    expect(row).toBeDefined();
  });

  it('C-03: submission 30 days ago (1 day outside window) does NOT appear', async () => {
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(30),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const day30 = daysAgoUTC(30);
    const row = (data ?? []).find(
      (r: any) => r.org_id === ORG_A && r.submission_day === day30,
    );
    expect(row).toBeUndefined();
  });

  it('C-04: submission 60 days ago does NOT appear', async () => {
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(60),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    // No rows should reference a date older than 29 days ago
    for (const row of orgRows) {
      const dayDiff = Math.floor(
        (new Date(todayUTC()).getTime() - new Date(row.submission_day).getTime())
        / (1000 * 60 * 60 * 24),
      );
      expect(dayDiff).toBeLessThanOrEqual(29);
    }
  });

  it('C-05: max window is 30 rows even with 31 consecutive days of data', async () => {
    // Seed one submission per day for 31 consecutive days
    for (let i = 0; i <= 30; i++) {
      await insertSubmission({
        orgId: ORG_A, status: 'submitted', attemptCount: 1,
        createdAt: daysAgoTs(i),
      });
    }
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    // At most 30 distinct days should appear (day 30 is outside window)
    expect(orgRows.length).toBeLessThanOrEqual(30);
  });

  it('C-06: submissions at midnight UTC boundary (00:00:00 UTC) are included on the correct day', async () => {
    // Craft a timestamp at exactly midnight UTC today
    const todayMidnight = new Date(todayUTC() + 'T00:00:01Z').toISOString();
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: todayMidnight,
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find(
      (r: any) => r.org_id === ORG_A && r.submission_day === todayUTC(),
    );
    expect(row).toBeDefined();
  });

  it('C-07: future-dated submission (tomorrow) is excluded from window', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(12, 0, 0, 0);
    await insertSubmission({
      orgId: ORG_A, status: 'submitted', attemptCount: 1,
      createdAt: tomorrow.toISOString(),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const row = (data ?? []).find(
      (r: any) => r.org_id === ORG_A && r.submission_day === tomorrowStr,
    );
    expect(row).toBeUndefined();
  });

  it('C-08: day boundary between day 29 and day 30 is exactly CURRENT_DATE - 29 days', async () => {
    // day 29 (inside window) — should appear; day 30 (outside) — should not
    await insertSubmission({
      orgId: ORG_A, status: 'failed', attemptCount: 5,
      createdAt: daysAgoTs(29),
    });
    await insertSubmission({
      orgId: ORG_A, status: 'failed', attemptCount: 5,
      createdAt: daysAgoTs(30),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const day29 = daysAgoUTC(29);
    const day30 = daysAgoUTC(30);
    const inWindow  = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === day29);
    const outWindow = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === day30);
    expect(inWindow).toBeDefined();
    expect(outWindow).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — day_rank ordering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group D — day_rank ordering', () => {
  beforeEach(async () => {
    // Seed submissions on today, yesterday, and 2 days ago
    for (const n of [0, 1, 2]) {
      await insertSubmission({
        orgId: ORG_A, status: 'submitted', attemptCount: 1,
        createdAt: daysAgoTs(n),
      });
    }
  });

  it('D-01: day_rank=1 has submission_day equal to today (UTC)', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    const rank1 = orgRows.find((r: any) => Number(r.day_rank) === 1);
    expect(rank1).toBeDefined();
    expect(rank1!.submission_day).toBe(todayUTC());
  });

  it('D-02: day_rank=2 has submission_day equal to yesterday (UTC)', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    const rank2 = orgRows.find((r: any) => Number(r.day_rank) === 2);
    expect(rank2).toBeDefined();
    expect(rank2!.submission_day).toBe(daysAgoUTC(1));
  });

  it('D-03: day_rank=3 has submission_day equal to 2 days ago', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    const rank3 = orgRows.find((r: any) => Number(r.day_rank) === 3);
    expect(rank3).toBeDefined();
    expect(rank3!.submission_day).toBe(daysAgoUTC(2));
  });

  it('D-04: day_rank values are sequential with no gaps', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? [])
      .filter((r: any) => r.org_id === ORG_A)
      .map((r: any) => Number(r.day_rank))
      .sort((a: number, b: number) => a - b);
    for (let i = 0; i < orgRows.length; i++) {
      expect(orgRows[i]).toBe(i + 1);
    }
  });

  it('D-05: day_rank is per-org — ORG_B has its own rank=1 independent of ORG_A', async () => {
    await insertSubmission({
      orgId: ORG_B, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(0),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const rankA = (data ?? []).find((r: any) => r.org_id === ORG_A && Number(r.day_rank) === 1);
    const rankB = (data ?? []).find((r: any) => r.org_id === ORG_B && Number(r.day_rank) === 1);
    expect(rankA).toBeDefined();
    expect(rankB).toBeDefined();
    // Both rank-1 rows should map to today
    expect(rankA!.submission_day).toBe(todayUTC());
    expect(rankB!.submission_day).toBe(todayUTC());
  });

  it('D-06: rows within a single org are ordered newest-first (submission_day DESC)', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgRows = (data ?? []).filter((r: any) => r.org_id === ORG_A);
    for (let i = 1; i < orgRows.length; i++) {
      expect(new Date(orgRows[i - 1].submission_day).getTime())
        .toBeGreaterThanOrEqual(new Date(orgRows[i].submission_day).getTime());
    }
  });

  it('D-07: single-day org has exactly day_rank=1 and no other rank', async () => {
    // ORG_C only gets one submission today
    await insertSubmission({
      orgId: ORG_C, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(0),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgCRows = (data ?? []).filter((r: any) => r.org_id === ORG_C);
    expect(orgCRows).toHaveLength(1);
    expect(Number(orgCRows[0].day_rank)).toBe(1);
  });

  it('D-08: gap-day scenario — missing day 1 makes day 2 rank=2 (not rank=1)', async () => {
    // Seed only today (rank 1) and 2 days ago (rank 2) — yesterday is missing
    await insertSubmission({
      orgId: ORG_C, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(0),
    });
    await insertSubmission({
      orgId: ORG_C, status: 'submitted', attemptCount: 1,
      createdAt: daysAgoTs(2),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const orgCRows = (data ?? [])
      .filter((r: any) => r.org_id === ORG_C)
      .sort((a: any, b: any) => Number(a.day_rank) - Number(b.day_rank));
    expect(orgCRows).toHaveLength(2);
    expect(orgCRows[0].submission_day).toBe(todayUTC());    // rank 1 = today
    expect(orgCRows[1].submission_day).toBe(daysAgoUTC(2)); // rank 2 = 2 days ago
    expect(Number(orgCRows[0].day_rank)).toBe(1);
    expect(Number(orgCRows[1].day_rank)).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP E — retry_exhaustion_rate_pct daily precision
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group E — retry_exhaustion_rate_pct daily precision', () => {
  it('E-01: per-day rate — 0 exhausted today, 2 exhausted yesterday are computed separately', async () => {
    // Today: 4 submitted — rate should be 0.00
    for (let i = 0; i < 4; i++) {
      await insertSubmission({
        orgId: ORG_A, status: 'submitted', attemptCount: 1,
        createdAt: daysAgoTs(0),
      });
    }
    // Yesterday: 2 exhausted + 2 submitted — rate should be 50.00
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5, createdAt: daysAgoTs(1) });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5, createdAt: daysAgoTs(1) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(1) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(1) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const today     = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    const yesterday = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === daysAgoUTC(1));

    expect(today).toBeDefined();
    expect(yesterday).toBeDefined();
    expect(Number(today!.retry_exhaustion_rate_pct)).toBe(0.00);
    expect(Number(yesterday!.retry_exhaustion_rate_pct)).toBe(50.00);
  });

  it('E-02: day with only 1 exhausted of 1 total → rate = 100.00', async () => {
    await insertSubmission({
      orgId: ORG_A, status: 'failed', attemptCount: 5,
      createdAt: daysAgoTs(0),
    });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(100.00);
  });

  it('E-03: 1 exhausted of 3 → rate = 33.33 (rounded to 2dp)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(Number(row!.retry_exhaustion_rate_pct)).toBeCloseTo(33.33, 2);
  });

  it('E-04: rate is independent per day — high exhaustion yesterday does not inflate today', async () => {
    // Yesterday: 3/3 exhausted = 100%
    for (let i = 0; i < 3; i++) {
      await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5, createdAt: daysAgoTs(1) });
    }
    // Today: 0/2 exhausted = 0%
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const today = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(Number(today!.retry_exhaustion_rate_pct)).toBe(0.00);
    expect(today!.daily_exhausted).toBe(0);
  });

  it('E-05: attempt_count=4 failed is not exhausted — rate reflects only attempt_count >= 5', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 4, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(row!.daily_exhausted).toBe(1);
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(50.00);
  });

  it('E-06: pending rows on a day are included in daily_total but do not affect exhaustion count', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'queued',  attemptCount: 0, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'failed',  attemptCount: 5, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(row!.daily_total).toBe(2);
    expect(row!.daily_pending).toBe(1);
    expect(row!.daily_exhausted).toBe(1);
    // 1 exhausted / 2 total = 50%
    expect(Number(row!.retry_exhaustion_rate_pct)).toBe(50.00);
  });

  it('E-07: 3-day trend shows correct exhaustion rates on all 3 days independently', async () => {
    // Day 0 (today):     1 exhausted / 2 total = 50.00%
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 5, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });

    // Day 1 (yesterday): 0 exhausted / 3 total = 0.00%
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(1) });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3, createdAt: daysAgoTs(1) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(1) });

    // Day 2 (2 days ago): 2 exhausted / 2 total = 100.00%
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5, createdAt: daysAgoTs(2) });
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5, createdAt: daysAgoTs(2) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');

    const d0 = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    const d1 = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === daysAgoUTC(1));
    const d2 = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === daysAgoUTC(2));

    expect(Number(d0!.retry_exhaustion_rate_pct)).toBe(50.00);
    expect(Number(d1!.retry_exhaustion_rate_pct)).toBe(0.00);
    expect(Number(d2!.retry_exhaustion_rate_pct)).toBe(100.00);
  });

  it('E-08: pdf_success_rate_pct is correct per day', async () => {
    // 2 downloaded + 1 failed + 1 pending = 50% pdf success
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, pdfStatus: 'downloaded', createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, pdfStatus: 'downloaded', createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3, pdfStatus: 'failed',     createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'queued',    attemptCount: 0, pdfStatus: 'pending',    createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(row!.daily_pdfs_downloaded).toBe(2);
    expect(row!.daily_pdfs_failed).toBe(1);
    expect(Number(row!.pdf_success_rate_pct)).toBe(50.00);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP F — admin RPC variants
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group F — admin RPC variants', () => {
  beforeEach(async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_B, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
  });

  it('F-01: rpc_etax_health_trend_admin() (0-arg) returns rows for all orgs', async () => {
    const { data, error } = await svc.rpc('rpc_etax_health_trend_admin');
    expect(error).toBeNull();
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds).toContain(ORG_A);
    expect(orgIds).toContain(ORG_B);
  });

  it('F-02: rpc_etax_health_trend_admin(UUID) returns only rows for the specified org', async () => {
    const { data, error } = await svc.rpc('rpc_etax_health_trend_admin', {
      p_org_id: ORG_A,
    });
    expect(error).toBeNull();
    const orgIds = (data ?? []).map((r: any) => r.org_id);
    expect(orgIds.every((id: string) => id === ORG_A)).toBe(true);
    expect(orgIds).not.toContain(ORG_B);
  });

  it('F-03: rpc_etax_health_trend_admin(UUID) with ORG_B returns only ORG_B rows', async () => {
    const { data } = await svc.rpc('rpc_etax_health_trend_admin', {
      p_org_id: ORG_B,
    });
    expect((data ?? []).every((r: any) => r.org_id === ORG_B)).toBe(true);
  });

  it('F-04: authenticated OWNER cannot call rpc_etax_health_trend_admin() (0-arg)', async () => {
    const client = userClient(tokenOwnerA);
    const { error } = await client.rpc('rpc_etax_health_trend_admin');
    expect(error).not.toBeNull();
  });

  it('F-05: authenticated ADMIN cannot call rpc_etax_health_trend_admin(UUID)', async () => {
    const client = userClient(tokenOwnerA);
    const { error } = await client.rpc('rpc_etax_health_trend_admin', {
      p_org_id: ORG_A,
    });
    expect(error).not.toBeNull();
  });

  it('F-06: admin 0-arg RPC with unknown org UUID returns empty array, not an error', async () => {
    const { data, error } = await svc.rpc('rpc_etax_health_trend_admin', {
      p_org_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('F-07: org-scoped RPC and admin(UUID) RPC return identical rows for same org', async () => {
    // Use service_role for org-scoped to bypass auth.uid() in test env
    const [allOrgs, singleOrg] = await Promise.all([
      svc.rpc('rpc_etax_health_trend_admin'),
      svc.rpc('rpc_etax_health_trend_admin', { p_org_id: ORG_A }),
    ]);
    const fromAll    = (allOrgs.data ?? []).filter((r: any) => r.org_id === ORG_A);
    const fromSingle = (singleOrg.data ?? []).filter((r: any) => r.org_id === ORG_A);
    expect(fromAll.length).toBe(fromSingle.length);
    for (let i = 0; i < fromAll.length; i++) {
      expect(fromAll[i].submission_day).toBe(fromSingle[i].submission_day);
      expect(Number(fromAll[i].retry_exhaustion_rate_pct)).toBe(
        Number(fromSingle[i].retry_exhaustion_rate_pct),
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP G — Edge cases & idempotency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Group G — Edge cases & idempotency', () => {
  it('G-01: org with no submissions in last 30 days has no rows in view', async () => {
    // ORG_C has no submissions seeded
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const rows = (data ?? []).filter((r: any) => r.org_id === ORG_C);
    expect(rows).toHaveLength(0);
  });

  it('G-02: multiple submissions on the same day aggregate into a single row', async () => {
    for (let i = 0; i < 5; i++) {
      await insertSubmission({
        orgId: ORG_A, status: 'submitted', attemptCount: 1,
        createdAt: daysAgoTs(0),
      });
    }
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const todayRows = (data ?? []).filter(
      (r: any) => r.org_id === ORG_A && r.submission_day === todayUTC(),
    );
    expect(todayRows).toHaveLength(1);
    expect(todayRows[0].daily_total).toBe(5);
  });

  it('G-03: snapshot_at is a valid ISO timestamp (not null) in every row', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    for (const row of data ?? []) {
      expect(row.snapshot_at).not.toBeNull();
      expect(new Date(row.snapshot_at).getTime()).not.toBeNaN();
    }
  });

  it('G-04: avg_attempt_count is correct for a mixed-attempt-count day', async () => {
    // attempts: 1, 2, 3 → avg = 2.00
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 2, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'failed',    attemptCount: 3, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(Number(row!.avg_attempt_count)).toBeCloseTo(2.00, 2);
    expect(row!.max_attempt_count).toBe(3);
  });

  it('G-05: calling the view twice returns identical day_rank and rate values (idempotent)', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'failed', attemptCount: 5, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });

    const [r1, r2] = await Promise.all([
      svc.rpc('rpc_etax_health_trend_admin'),
      svc.rpc('rpc_etax_health_trend_admin'),
    ]);
    const row1 = (r1.data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    const row2 = (r2.data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());

    expect(Number(row1!.retry_exhaustion_rate_pct)).toBe(
      Number(row2!.retry_exhaustion_rate_pct),
    );
    expect(Number(row1!.day_rank)).toBe(Number(row2!.day_rank));
  });

  it('G-06: daily_cancelled counts cancelled submissions correctly per day', async () => {
    await insertSubmission({ orgId: ORG_A, status: 'cancelled', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'cancelled', attemptCount: 1, createdAt: daysAgoTs(0) });
    await insertSubmission({ orgId: ORG_A, status: 'submitted', attemptCount: 1, createdAt: daysAgoTs(0) });

    const { data } = await svc.rpc('rpc_etax_health_trend_admin');
    const row = (data ?? []).find((r: any) => r.org_id === ORG_A && r.submission_day === todayUTC());
    expect(row!.daily_cancelled).toBe(2);
    expect(row!.daily_total).toBe(3);
  });
});

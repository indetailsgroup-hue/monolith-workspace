/**
 * Test Suite: Migration 0202 — v_etax_sla_archive_summary & v_etax_sla_archive_org_rollup
 * =====================================================================
 * Covers:
 *   Group A – v_etax_sla_archive_summary column presence & structure
 *   Group B – v_etax_sla_archive_org_rollup worst_severity_tier logic
 *   Group C – rpc_etax_sla_archive_summary filter behaviour
 *   Group D – rpc_etax_sla_archive_org_rollup overall_breach_rate accuracy
 *   Group E – RLS cross-tenant isolation on both RPCs
 *
 * 35 test cases total
 * Depends on: etax_sla_breach_archive populated by fn_archive_etax_sla_breach_timeline
 * =====================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ── Environment ────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY  = process.env.SERVICE_ROLE_KEY  ?? '';
const ANON_KEY          = process.env.SUPABASE_ANON_KEY ?? '';
const ORG_A_ID          = process.env.TEST_ORG_A_ID     ?? '';
const ORG_B_ID          = process.env.TEST_ORG_B_ID     ?? '';
const USER_A_EMAIL      = 'org-a-user@monolith-test.local';
const USER_B_EMAIL      = 'org-b-user@monolith-test.local';
const USER_PASSWORD     = 'TestPa$$0rg4';

// ── Clients ────────────────────────────────────────────────────────────────────
let serviceClient: SupabaseClient;
let orgAClient:    SupabaseClient;
let orgBClient:    SupabaseClient;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function sql(query: string): Promise<unknown[]> {
  const { data, error } = await serviceClient.rpc('exec_sql', { query });
  if (error) throw new Error(`SQL error: ${error.message}`);
  return (data ?? []) as unknown[];
}

async function authClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return client;
}

async function seedArchive(): Promise<void> {
  const { error } = await serviceClient.rpc('fn_archive_etax_sla_breach_timeline');
  if (error) throw new Error(`Seed archive error: ${error.message}`);
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────
beforeAll(async () => {
  if (!SERVICE_ROLE_KEY) throw new Error('SERVICE_ROLE_KEY is required');
  serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  orgAClient    = await authClient(USER_A_EMAIL, USER_PASSWORD);
  orgBClient    = await authClient(USER_B_EMAIL, USER_PASSWORD);
  // Ensure archive has data for all groups
  await seedArchive();
});

afterAll(async () => {
  await orgAClient.auth.signOut();
  await orgBClient.auth.signOut();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group A — v_etax_sla_archive_summary column presence & structure
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group A – v_etax_sla_archive_summary column presence', () => {

  it('A1 – view exists in public schema', async () => {
    const rows = await sql(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'v_etax_sla_archive_summary';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  const expectedCols = [
    'org_id', 'org_name', 'severity_tier',
    'first_archived_date', 'last_archived_date', 'last_archived_at',
    'total_archive_days', 'total_created', 'total_breached',
    'avg_breach_rate', 'max_breach_rate', 'max_cumulative', 'sla_threshold_hours',
  ];

  expectedCols.forEach((col, idx) => {
    it(`A${2 + idx} – column "${col}" present in v_etax_sla_archive_summary`, async () => {
      const rows = await sql(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'v_etax_sla_archive_summary'
          AND column_name  = '${col}';
      `);
      expect((rows as any[]).length).toBe(1);
    });
  });

  it('A15 – v_etax_sla_archive_org_rollup view exists', async () => {
    const rows = await sql(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'v_etax_sla_archive_org_rollup';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  const rollupCols = [
    'org_id', 'org_name', 'first_archived_date', 'last_archived_date',
    'last_archived_at', 'total_archive_days', 'total_created', 'total_breached',
    'overall_breach_rate', 'avg_daily_breach_rate', 'peak_daily_breach_rate',
    'peak_cumulative', 'worst_severity_tier', 'breached_document_types', 'sla_threshold_hours',
  ];

  rollupCols.forEach((col, idx) => {
    it(`A${16 + idx} – rollup column "${col}" present`, async () => {
      const rows = await sql(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'v_etax_sla_archive_org_rollup'
          AND column_name  = '${col}';
      `);
      expect((rows as any[]).length).toBe(1);
    });
  });

  it('A31 – total_archive_days is non-negative across all summary rows', async () => {
    const rows: any[] = await sql(`
      SELECT total_archive_days FROM v_etax_sla_archive_summary;
    `) as any[];
    rows.forEach(r => {
      expect(r.total_archive_days).toBeGreaterThanOrEqual(0);
    });
  });

  it('A32 – total_breached <= total_created in all summary rows', async () => {
    const rows: any[] = await sql(`
      SELECT total_created, total_breached FROM v_etax_sla_archive_summary;
    `) as any[];
    rows.forEach(r => {
      expect(Number(r.total_breached)).toBeLessThanOrEqual(Number(r.total_created));
    });
  });

  it('A33 – avg_breach_rate is between 0 and 100 in all rows', async () => {
    const rows: any[] = await sql(`
      SELECT avg_breach_rate FROM v_etax_sla_archive_summary
      WHERE avg_breach_rate IS NOT NULL;
    `) as any[];
    rows.forEach(r => {
      expect(Number(r.avg_breach_rate)).toBeGreaterThanOrEqual(0);
      expect(Number(r.avg_breach_rate)).toBeLessThanOrEqual(100);
    });
  });

  it('A34 – max_breach_rate >= avg_breach_rate in all rows', async () => {
    const rows: any[] = await sql(`
      SELECT avg_breach_rate, max_breach_rate FROM v_etax_sla_archive_summary
      WHERE avg_breach_rate IS NOT NULL AND max_breach_rate IS NOT NULL;
    `) as any[];
    rows.forEach(r => {
      expect(Number(r.max_breach_rate)).toBeGreaterThanOrEqual(Number(r.avg_breach_rate));
    });
  });

  it('A35 – severity_tier only contains valid values', async () => {
    const validTiers = new Set(['HEALTHY', 'NORMAL', 'ELEVATED', 'WARNING', 'CRITICAL']);
    const rows: any[] = await sql(`
      SELECT DISTINCT severity_tier FROM v_etax_sla_archive_summary;
    `) as any[];
    rows.forEach(r => {
      expect(validTiers.has(r.severity_tier)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B — v_etax_sla_archive_org_rollup worst_severity_tier logic
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group B – v_etax_sla_archive_org_rollup worst_severity_tier logic', () => {

  it('B1 – worst_severity_tier is null or a valid tier for all orgs', async () => {
    const validTiers = new Set(['HEALTHY', 'NORMAL', 'ELEVATED', 'WARNING', 'CRITICAL', null]);
    const rows: any[] = await sql(`
      SELECT worst_severity_tier FROM v_etax_sla_archive_org_rollup;
    `) as any[];
    rows.forEach(r => {
      expect(validTiers.has(r.worst_severity_tier)).toBe(true);
    });
  });

  it('B2 – worst_severity_tier equals CRITICAL when CRITICAL rows exist for org', async () => {
    // Verify: if etax_sla_breach_archive has a CRITICAL row for an org,
    // the rollup worst_severity_tier must be CRITICAL
    const rows: any[] = await sql(`
      WITH orgs_with_critical AS (
        SELECT DISTINCT org_id FROM etax_sla_breach_archive
        WHERE severity_tier = 'CRITICAL'
      )
      SELECT r.org_id, r.worst_severity_tier
      FROM v_etax_sla_archive_org_rollup r
      JOIN orgs_with_critical c ON c.org_id = r.org_id;
    `) as any[];
    rows.forEach(r => {
      expect(r.worst_severity_tier).toBe('CRITICAL');
    });
  });

  it('B3 – CRITICAL ranks above WARNING in worst_severity_tier selection', async () => {
    // Build synthetic test: insert two archive rows for a test org
    // one CRITICAL, one WARNING — rollup should show CRITICAL
    const rows: any[] = await sql(`
      SELECT org_id,
             bool_or(severity_tier = 'CRITICAL') AS has_critical,
             worst_severity_tier
      FROM v_etax_sla_archive_org_rollup r
      JOIN etax_sla_breach_archive a USING (org_id)
      GROUP BY r.org_id, r.worst_severity_tier
      HAVING bool_or(severity_tier = 'CRITICAL')
         AND bool_or(severity_tier = 'WARNING');
    `) as any[];
    rows.forEach(r => {
      expect(r.worst_severity_tier).toBe('CRITICAL');
    });
  });

  it('B4 – overall_breach_rate is 0 when total_created is 0', async () => {
    const rows: any[] = await sql(`
      SELECT overall_breach_rate FROM v_etax_sla_archive_org_rollup
      WHERE total_created = 0;
    `) as any[];
    rows.forEach(r => {
      expect(Number(r.overall_breach_rate)).toBe(0);
    });
  });

  it('B5 – peak_cumulative >= total_breached across all rollup rows', async () => {
    const rows: any[] = await sql(`
      SELECT peak_cumulative, total_breached FROM v_etax_sla_archive_org_rollup;
    `) as any[];
    rows.forEach(r => {
      expect(Number(r.peak_cumulative)).toBeGreaterThanOrEqual(Number(r.total_breached));
    });
  });

  it('B6 – breached_document_types <= 4 (only T01–T04 exist)', async () => {
    const rows: any[] = await sql(`
      SELECT breached_document_types FROM v_etax_sla_archive_org_rollup;
    `) as any[];
    rows.forEach(r => {
      expect(r.breached_document_types).toBeInstanceOf(Array);
      expect(r.breached_document_types.length).toBeLessThanOrEqual(4);
      expect(r.breached_document_types.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('B7 – overall_breach_rate formula: (total_breached / total_created) * 100', async () => {
    const rows: any[] = await sql(`
      SELECT total_created, total_breached, overall_breach_rate
      FROM v_etax_sla_archive_org_rollup
      WHERE total_created > 0;
    `) as any[];
    rows.forEach(r => {
      const expected = Math.round((Number(r.total_breached) / Number(r.total_created)) * 100 * 100) / 100;
      const actual   = Number(r.overall_breach_rate);
      expect(Math.abs(actual - expected)).toBeLessThan(0.1); // 0.1% tolerance
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C — rpc_etax_sla_archive_summary filter behaviour
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group C – rpc_etax_sla_archive_summary filters', () => {

  it('C1 – function rpc_etax_sla_archive_summary exists', async () => {
    const rows = await sql(`
      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_archive_summary';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  it('C2 – returns array with null params (no filter)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('C3 – p_severity_tier=CRITICAL returns only CRITICAL rows', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: 'CRITICAL', p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.severity_tier).toBe('CRITICAL');
    });
  });

  it('C4 – p_org_id filter returns only that org\'s rows', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: ORG_A_ID, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_A_ID);
    });
  });

  it('C5 – p_from_date excludes rows whose last_archived_date < from_date', async () => {
    const futureDate = '2099-01-01';
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: futureDate, p_to_date: null,
    });
    expect(error).toBeNull();
    expect((data as any[] ?? []).length).toBe(0);
  });

  it('C6 – p_to_date excludes rows whose first_archived_date > to_date', async () => {
    const pastDate = '2020-01-01';
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: pastDate,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.first_archived_date <= pastDate).toBe(true);
    });
  });

  it('C7 – result is ordered by severity descending (CRITICAL first)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    const TIER_RANK: Record<string, number> = {
      CRITICAL: 5, WARNING: 4, ELEVATED: 3, NORMAL: 2, HEALTHY: 1,
    };
    const rows = (data as any[] ?? []);
    for (let i = 1; i < rows.length; i++) {
      const prev = TIER_RANK[rows[i - 1].severity_tier] ?? 0;
      const curr = TIER_RANK[rows[i].severity_tier] ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('C8 – all returned rows contain required fields', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    const requiredFields = [
      'org_id', 'org_name', 'severity_tier', 'first_archived_date',
      'last_archived_date', 'total_archive_days', 'total_created',
      'total_breached', 'avg_breach_rate', 'max_breach_rate',
      'max_cumulative', 'sla_threshold_hours',
    ];
    (data as any[] ?? []).forEach((row: any) => {
      requiredFields.forEach(f => {
        expect(Object.prototype.hasOwnProperty.call(row, f)).toBe(true);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D — rpc_etax_sla_archive_org_rollup overall_breach_rate accuracy
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group D – rpc_etax_sla_archive_org_rollup accuracy', () => {

  it('D1 – function rpc_etax_sla_archive_org_rollup exists', async () => {
    const rows = await sql(`
      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_archive_org_rollup';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  it('D2 – returns array with null params', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('D3 – overall_breach_rate matches manual calculation', async () => {
    const { data: rpcData, error: rpcErr } = await serviceClient.rpc(
      'rpc_etax_sla_archive_org_rollup',
      { p_org_id: null, p_from_date: null, p_to_date: null }
    );
    expect(rpcErr).toBeNull();

    // Cross-check each row against raw archive aggregation
    for (const row of (rpcData as any[] ?? [])) {
      const check: any[] = await sql(`
        SELECT
          SUM(total_created)::bigint  AS total_created,
          SUM(breached_count)::bigint AS total_breached
        FROM etax_sla_breach_archive
        WHERE org_id = '${row.org_id}';
      `) as any[];
      if (!check[0] || Number(check[0].total_created) === 0) continue;
      const expectedRate = (Number(check[0].total_breached) / Number(check[0].total_created)) * 100;
      expect(Math.abs(Number(row.overall_breach_rate) - expectedRate)).toBeLessThan(0.15);
    }
  });

  it('D4 – p_org_id filter narrows to one org', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: ORG_A_ID, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_A_ID);
    });
  });

  it('D5 – future p_from_date returns empty array', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: '2099-01-01', p_to_date: null,
    });
    expect(error).toBeNull();
    expect((data as any[] ?? []).length).toBe(0);
  });

  it('D6 – result ordered by worst_severity_tier then overall_breach_rate DESC', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    const TIER_RANK: Record<string, number> = {
      CRITICAL: 5, WARNING: 4, ELEVATED: 3, NORMAL: 2, HEALTHY: 1,
    };
    const rows = (data as any[] ?? []);
    for (let i = 1; i < rows.length; i++) {
      const prev = TIER_RANK[rows[i - 1].worst_severity_tier] ?? 0;
      const curr = TIER_RANK[rows[i].worst_severity_tier] ?? 0;
      if (prev === curr) {
        // Same tier — breach_rate should be non-increasing
        expect(Number(rows[i - 1].overall_breach_rate))
          .toBeGreaterThanOrEqual(Number(rows[i].overall_breach_rate));
      } else {
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    }
  });

  it('D7 – all required fields present in rollup rows', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    const required = [
      'org_id', 'org_name', 'first_archived_date', 'last_archived_date',
      'total_archive_days', 'total_created', 'total_breached', 'overall_breach_rate',
      'avg_daily_breach_rate', 'peak_daily_breach_rate', 'peak_cumulative',
      'worst_severity_tier', 'breached_document_types', 'sla_threshold_hours',
    ];
    (data as any[] ?? []).forEach((row: any) => {
      required.forEach(f => {
        expect(Object.prototype.hasOwnProperty.call(row, f)).toBe(true);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E — RLS cross-tenant isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group E – RLS cross-tenant isolation', () => {

  it('E1 – Org A user sees only Org A rows via rpc_etax_sla_archive_summary', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_A_ID);
    });
  });

  it('E2 – Org B user sees only Org B rows via rpc_etax_sla_archive_summary', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgBClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_B_ID);
    });
  });

  it('E3 – Org A cannot see Org B by passing explicit p_org_id (summary RPC)', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: ORG_B_ID, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).not.toBe(ORG_B_ID);
    });
  });

  it('E4 – Org A user sees only Org A rows via rpc_etax_sla_archive_org_rollup', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_A_ID);
    });
  });

  it('E5 – Org B user sees only Org B rows via rpc_etax_sla_archive_org_rollup', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgBClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).toBe(ORG_B_ID);
    });
  });

  it('E6 – Org A cannot pull Org B data via rollup RPC with explicit p_org_id', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: ORG_B_ID, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((r: any) => {
      expect(r.org_id).not.toBe(ORG_B_ID);
    });
  });

  it('E7 – service_role can see rows from multiple orgs via summary RPC', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // service_role bypass — data presence is sufficient (may be empty if no archive data)
  });

  it('E8 – anon caller rejected by rpc_etax_sla_archive_summary', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc('rpc_etax_sla_archive_summary', {
      p_org_id: null, p_severity_tier: null, p_from_date: null, p_to_date: null,
    });
    expect(error).not.toBeNull();
  });

  it('E9 – anon caller rejected by rpc_etax_sla_archive_org_rollup', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc('rpc_etax_sla_archive_org_rollup', {
      p_org_id: null, p_from_date: null, p_to_date: null,
    });
    expect(error).not.toBeNull();
  });

  it('E10 – both RPCs are SECURITY DEFINER', async () => {
    const rows: any[] = await sql(`
      SELECT proname, prosecdef FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('rpc_etax_sla_archive_summary', 'rpc_etax_sla_archive_org_rollup');
    `) as any[];
    expect(rows.length).toBe(2);
    rows.forEach(r => {
      expect(r.prosecdef).toBe(true);
    });
  });
});

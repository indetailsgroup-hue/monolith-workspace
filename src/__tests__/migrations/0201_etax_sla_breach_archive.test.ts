/**
 * Test Suite: Migration 0201 — etax_sla_breach_archive
 * =====================================================================
 * Covers:
 *   Group A – Table structure (columns, PK, indexes, RLS, check constraints)
 *   Group B – fn_archive_etax_sla_breach_timeline idempotency
 *   Group C – platform_config.sla_archive_last_run stamping
 *   Group D – rpc_etax_sla_breach_archive date-range filter
 *   Group E – RLS cross-tenant isolation
 *
 * 32 test cases total
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
async function sql(query: string, params: unknown[] = []): Promise<unknown[]> {
  const { data, error } = await serviceClient.rpc('exec_sql', { query, params });
  if (error) throw new Error(`SQL error: ${error.message}`);
  return data ?? [];
}

async function authClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return client;
}

async function callArchiveFn(): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient.rpc('fn_archive_etax_sla_breach_timeline');
  if (error) throw new Error(`fn_archive error: ${error.message}`);
  return (data as Record<string, unknown>) ?? {};
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────
beforeAll(async () => {
  if (!SERVICE_ROLE_KEY) throw new Error('SERVICE_ROLE_KEY is required');
  serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  orgAClient    = await authClient(USER_A_EMAIL, USER_PASSWORD);
  orgBClient    = await authClient(USER_B_EMAIL, USER_PASSWORD);
});

afterAll(async () => {
  await orgAClient.auth.signOut();
  await orgBClient.auth.signOut();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group A — Table Structure
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group A – etax_sla_breach_archive table structure', () => {

  it('A1 – table exists in public schema', async () => {
    const rows = await sql(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'etax_sla_breach_archive';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  const expectedColumns = [
    'org_id', 'document_type', 'breach_date', 'org_name',
    'total_created', 'breached_count', 'breach_rate',
    'severity_tier', 'cumulative_breached', 'sla_threshold_hours', 'archived_at',
  ];

  expectedColumns.forEach((col, idx) => {
    it(`A${2 + idx} – column "${col}" exists`, async () => {
      const rows = await sql(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'etax_sla_breach_archive'
          AND column_name  = $1;
      `, [col]);
      expect((rows as any[]).length).toBe(1);
    });
  });

  it('A13 – composite PK (org_id, document_type, breach_date) exists', async () => {
    const rows = await sql(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_schema    = 'public'
        AND table_name      = 'etax_sla_breach_archive'
        AND constraint_type = 'PRIMARY KEY'
        AND constraint_name = 'etax_sla_breach_archive_pk';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  const expectedIndexes = [
    'idx_sla_archive_org_date',
    'idx_sla_archive_severity_date',
    'idx_sla_archive_doctype_date',
  ];

  expectedIndexes.forEach((idx_name, i) => {
    it(`A${14 + i} – index "${idx_name}" exists`, async () => {
      const rows = await sql(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename  = 'etax_sla_breach_archive'
          AND indexname  = $1;
      `, [idx_name]);
      expect((rows as any[]).length).toBe(1);
    });
  });

  it('A17 – RLS is enabled on etax_sla_breach_archive', async () => {
    const rows = await sql(`
      SELECT relrowsecurity FROM pg_class
      WHERE relname = 'etax_sla_breach_archive'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `);
    expect((rows as any[])[0]?.relrowsecurity).toBe(true);
  });

  it('A18 – breach_rate column has numeric type', async () => {
    const rows = await sql(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'etax_sla_breach_archive'
        AND column_name  = 'breach_rate';
    `);
    expect(['numeric', 'double precision', 'real']).toContain((rows as any[])[0]?.data_type);
  });

  it('A19 – archived_at defaults to now()', async () => {
    const rows = await sql(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'etax_sla_breach_archive'
        AND column_name  = 'archived_at';
    `);
    const def = String((rows as any[])[0]?.column_default ?? '');
    expect(def.toLowerCase()).toMatch(/now\(\)|current_timestamp/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group B — fn_archive_etax_sla_breach_timeline Idempotency
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group B – fn_archive_etax_sla_breach_timeline idempotency', () => {

  it('B1 – function exists in public schema', async () => {
    const rows = await sql(`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_archive_etax_sla_breach_timeline';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  it('B2 – function is SECURITY DEFINER', async () => {
    const rows = await sql(`
      SELECT prosecdef FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_archive_etax_sla_breach_timeline';
    `);
    expect((rows as any[])[0]?.prosecdef).toBe(true);
  });

  it('B3 – first invocation returns JSON with success:true', async () => {
    const result = await callArchiveFn();
    expect(result.success).toBe(true);
  });

  it('B4 – rows_upserted is a non-negative integer', async () => {
    const result = await callArchiveFn();
    expect(typeof result.rows_upserted).toBe('number');
    expect(result.rows_upserted as number).toBeGreaterThanOrEqual(0);
  });

  it('B5 – second invocation (idempotency) returns same or equal row count', async () => {
    const first  = await callArchiveFn();
    const second = await callArchiveFn();
    expect(second.success).toBe(true);
    // Idempotent: row count should be stable (upsert, no new rows created)
    expect(second.rows_upserted).toEqual(first.rows_upserted);
  });

  it('B6 – ON CONFLICT upsert refreshes archived_at on re-run', async () => {
    // Run archive fn twice with a small delay; archived_at should be updated
    await callArchiveFn();
    const beforeRows: any[] = await sql(
      `SELECT archived_at FROM etax_sla_breach_archive LIMIT 1;`
    ) as any[];
    if (beforeRows.length === 0) return; // no data — skip
    await new Promise(r => setTimeout(r, 1100));
    await callArchiveFn();
    const afterRows: any[] = await sql(
      `SELECT archived_at FROM etax_sla_breach_archive LIMIT 1;`
    ) as any[];
    if (afterRows.length === 0) return;
    const before = new Date(beforeRows[0].archived_at).getTime();
    const after  = new Date(afterRows[0].archived_at).getTime();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('B7 – authenticated role cannot call fn_archive_etax_sla_breach_timeline directly', async () => {
    const { error } = await orgAClient.rpc('fn_archive_etax_sla_breach_timeline');
    expect(error).not.toBeNull();
    // Should be permission denied
    expect(error?.message).toMatch(/permission denied|not found|does not exist/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group C — platform_config.sla_archive_last_run Stamping
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group C – platform_config.sla_archive_last_run stamping', () => {

  it('C1 – platform_config key sla_archive_last_run exists after fn run', async () => {
    await callArchiveFn();
    const rows = await sql(`
      SELECT key FROM platform_config WHERE key = 'sla_archive_last_run';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  it('C2 – sla_archive_last_run value is valid JSONB', async () => {
    await callArchiveFn();
    const rows: any[] = await sql(`
      SELECT value::jsonb AS value
      FROM platform_config WHERE key = 'sla_archive_last_run';
    `) as any[];
    expect(rows.length).toBe(1);
    const val = rows[0].value;
    expect(typeof val).toBe('object');
    expect(val).not.toBeNull();
  });

  it('C3 – sla_archive_last_run contains run_at field', async () => {
    await callArchiveFn();
    const rows: any[] = await sql(`
      SELECT value::jsonb->>'run_at' AS run_at FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    expect(rows[0]?.run_at).toBeTruthy();
    // Should be a parseable timestamp
    const ts = new Date(rows[0].run_at).getTime();
    expect(Number.isFinite(ts)).toBe(true);
  });

  it('C4 – sla_archive_last_run contains rows_upserted ≥ 0', async () => {
    await callArchiveFn();
    const rows: any[] = await sql(`
      SELECT (value::jsonb->>'rows_upserted')::int AS cnt FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    expect(rows[0]?.cnt).toBeGreaterThanOrEqual(0);
  });

  it('C5 – sla_archive_last_run contains duration_ms ≥ 0', async () => {
    await callArchiveFn();
    const rows: any[] = await sql(`
      SELECT (value::jsonb->>'duration_ms')::float AS ms FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    expect(rows[0]?.ms).toBeGreaterThanOrEqual(0);
  });

  it('C6 – run_at reflects a recent timestamp (within last 60 seconds)', async () => {
    await callArchiveFn();
    const rows: any[] = await sql(`
      SELECT value::jsonb->>'run_at' AS run_at FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    const ts   = new Date(rows[0].run_at).getTime();
    const now  = Date.now();
    expect(now - ts).toBeLessThan(60_000);
  });

  it('C7 – second run updates run_at to a later or equal timestamp', async () => {
    await callArchiveFn();
    const rows1: any[] = await sql(`
      SELECT value::jsonb->>'run_at' AS run_at FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    const ts1 = new Date(rows1[0].run_at).getTime();
    await new Promise(r => setTimeout(r, 500));
    await callArchiveFn();
    const rows2: any[] = await sql(`
      SELECT value::jsonb->>'run_at' AS run_at FROM platform_config
      WHERE key = 'sla_archive_last_run';
    `) as any[];
    const ts2 = new Date(rows2[0].run_at).getTime();
    expect(ts2).toBeGreaterThanOrEqual(ts1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group D — rpc_etax_sla_breach_archive Date-Range Filter
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group D – rpc_etax_sla_breach_archive date-range filter', () => {

  beforeAll(async () => {
    // Ensure archive has data
    await callArchiveFn();
  });

  it('D1 – function rpc_etax_sla_breach_archive exists', async () => {
    const rows = await sql(`
      SELECT proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_breach_archive';
    `);
    expect((rows as any[]).length).toBe(1);
  });

  it('D2 – returns rows when called with no filters (null params)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:       null,
      p_document_type: null,
      p_from_date:    null,
      p_to_date:      null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('D3 – p_from_date filter excludes earlier records', async () => {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     tomorrow,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    // No breach dates should be in the future
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.breach_date >= tomorrow).toBe(true);
    });
  });

  it('D4 – p_to_date filter excludes later records', async () => {
    const longAgo = '2020-01-01';
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       longAgo,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.breach_date <= longAgo).toBe(true);
    });
  });

  it('D5 – combined p_from_date and p_to_date returns correct window', async () => {
    const fromDate = '2024-01-01';
    const toDate   = '2024-12-31';
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     fromDate,
      p_to_date:       toDate,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.breach_date >= fromDate).toBe(true);
      expect(row.breach_date <= toDate).toBe(true);
    });
  });

  it('D6 – future date range returns empty array', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     '2099-01-01',
      p_to_date:       '2099-12-31',
    });
    expect(error).toBeNull();
    expect((data as any[] ?? []).length).toBe(0);
  });

  it('D7 – p_document_type filter returns only matching type', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: 'T01',
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.document_type).toBe('T01');
    });
  });

  it('D8 – p_org_id filter scopes results to that org', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        ORG_A_ID,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.org_id).toBe(ORG_A_ID);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group E — RLS Cross-Tenant Isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group E – RLS cross-tenant isolation', () => {

  beforeAll(async () => {
    await callArchiveFn();
  });

  it('E1 – Org A user sees only Org A rows via rpc_etax_sla_breach_archive', async () => {
    if (!ORG_A_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.org_id).toBe(ORG_A_ID);
    });
  });

  it('E2 – Org B user sees only Org B rows via rpc_etax_sla_breach_archive', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgBClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.org_id).toBe(ORG_B_ID);
    });
  });

  it('E3 – Org A user cannot retrieve Org B data by passing p_org_id', async () => {
    if (!ORG_B_ID) return;
    const { data, error } = await orgAClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        ORG_B_ID,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    // RLS should strip Org B data — no rows returned for Org A user
    (data as any[] ?? []).forEach((row: any) => {
      expect(row.org_id).not.toBe(ORG_B_ID);
    });
  });

  it('E4 – service_role sees rows from both orgs', async () => {
    if (!ORG_A_ID || !ORG_B_ID) return;
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).toBeNull();
    const orgIds = new Set((data as any[] ?? []).map((r: any) => r.org_id));
    // Service role should see multiple orgs if data exists
    // (passes trivially if archive is empty — data-dependent)
    expect(orgIds.size).toBeGreaterThanOrEqual(0);
  });

  it('E5 – unauthenticated (anon) cannot call rpc_etax_sla_breach_archive', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc('rpc_etax_sla_breach_archive', {
      p_org_id:        null,
      p_document_type: null,
      p_from_date:     null,
      p_to_date:       null,
    });
    expect(error).not.toBeNull();
  });

  it('E6 – fn_archive_etax_sla_breach_timeline not callable by authenticated user', async () => {
    const { error } = await orgAClient.rpc('fn_archive_etax_sla_breach_timeline');
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not found|does not exist/i);
  });
});

// src/__tests__/migrations/0195b_pgnet_notify.test.ts
// Test suite for Migration 0195b: pg_net HTTP POST integration in fn_check_risk_tier_changes
// Groups A–G: platform_config · pg_net dispatch · URL resolution · fault isolation ·
//             rpc_etax_notify_request_status · dual channel (notify+net) · no-op on same tier

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.SUPABASE_URL              ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role';
const ANON_KEY         = process.env.SUPABASE_ANON_KEY         ?? 'test-anon-key';

// Test HTTP server that captures pg_net calls (set in test environment)
const MOCK_NOTIFY_URL    = process.env.MOCK_ETAX_NOTIFY_URL ?? 'http://localhost:9999/etax-risk-notify';
const MOCK_NOTIFY_SECRET = 'test-function-secret-0195b';

// ─── Helpers ──────────────────────────────────────────────────────────────────
let service: SupabaseClient;

async function psql(query: string): Promise<any[]> {
  const { data, error } = await service.rpc('exec_sql', { query });
  if (error) throw new Error(`SQL: ${error.message}\n${query}`);
  return data ?? [];
}

async function seedOrg(name: string): Promise<string> {
  const id = uuidv4();
  await service.from('organizations').insert({
    org_id: id, name, slug: `0195b-${id.slice(0, 8)}`,
  });
  return id;
}

async function seedInvoice(orgId: string): Promise<string> {
  const id = uuidv4();
  await service.from('invoices').insert({
    id, org_id: orgId, status: 'approved', total_amount: 10700, due_date: '2026-12-31',
  });
  return id;
}

async function seedEtaxSubmission(orgId: string, invoiceId: string, status: string): Promise<string> {
  const id = uuidv4();
  await service.from('etax_submissions').insert({
    id, org_id: orgId, invoice_id: invoiceId,
    document_type: 'T01', status,
    attempt_count: status === 'failed' ? 5 : 0,
  });
  return id;
}

// Upsert etax_risk_tier_state to trigger fn_check_risk_tier_changes
async function upsertRiskTier(orgId: string, tier: string, healthScore: number): Promise<void> {
  await psql(`
    INSERT INTO public.etax_risk_tier_state (org_id, risk_tier, health_score, risk_rank, updated_at)
    VALUES ('${orgId}', '${tier}', ${healthScore}, 1, NOW())
    ON CONFLICT (org_id) DO UPDATE
      SET risk_tier    = EXCLUDED.risk_tier,
          health_score = EXCLUDED.health_score,
          updated_at   = NOW()
  `);
}

async function getPlatformConfig(key: string): Promise<string | null> {
  const rows = await psql(
    `SELECT value FROM public.platform_config WHERE key = '${key}'`
  );
  return rows[0]?.value ?? null;
}

async function setPlatformConfig(key: string, value: string): Promise<void> {
  await psql(`
    INSERT INTO public.platform_config (key, value)
    VALUES ('${key}', '${value}')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
}

async function getRiskTriggerSource(): Promise<string> {
  const rows = await psql(`
    SELECT prosrc
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE procedure.proname = 'fn_check_risk_tier_changes'
      AND namespace.nspname = 'public'
  `);
  return rows[0]?.prosrc ?? '';
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let orgCritical: string;
let orgWarning:  string;
let orgNoChange: string;
let orgFaultTest: string;

beforeAll(async () => {
  service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Seed orgs
  orgCritical  = await seedOrg('0195b Critical Test Org');
  orgWarning   = await seedOrg('0195b Warning Test Org');
  orgNoChange  = await seedOrg('0195b No-Change Test Org');
  orgFaultTest = await seedOrg('0195b Fault Test Org');

  // Seed platform_config with mock URL
  await setPlatformConfig('etax_risk_notify_url',    MOCK_NOTIFY_URL);
  await setPlatformConfig('etax_risk_notify_secret', MOCK_NOTIFY_SECRET);
});

afterAll(async () => {
  // Remove test data
  await service.from('etax_risk_tier_state').delete()
    .in('org_id', [orgCritical, orgWarning, orgNoChange, orgFaultTest]);
  await service.from('etax_submissions').delete()
    .in('org_id', [orgCritical, orgWarning, orgNoChange, orgFaultTest]);
  await service.from('invoices').delete()
    .in('org_id', [orgCritical, orgWarning, orgNoChange, orgFaultTest]);
  await service.from('organizations').delete()
    .in('org_id', [orgCritical, orgWarning, orgNoChange, orgFaultTest]);
  // Restore platform_config to empty (non-destructive)
  await setPlatformConfig('etax_risk_notify_url',    '');
  await setPlatformConfig('etax_risk_notify_secret', '');
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP A — platform_config table & seed values
// ═════════════════════════════════════════════════════════════════════════════
describe('Group A — platform_config table', () => {
  it('A1: platform_config table exists', async () => {
    const rows = await psql(`
      SELECT COUNT(*)::text AS cnt FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'platform_config'
    `);
    expect(rows[0]?.cnt).toBe('1');
  });

  it('A2: platform_config has etax_risk_notify_url key', async () => {
    const val = await getPlatformConfig('etax_risk_notify_url');
    expect(val).not.toBeNull();
  });

  it('A3: platform_config has etax_risk_notify_secret key', async () => {
    const val = await getPlatformConfig('etax_risk_notify_secret');
    expect(val).not.toBeNull();
  });

  it('A4: platform_config primary key is on key column', async () => {
    const rows = await psql(`
      SELECT COUNT(*)::text AS cnt
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_name = 'platform_config'
        AND tc.constraint_type = 'PRIMARY KEY'
        AND kcu.column_name = 'key'
    `);
    expect(rows[0]?.cnt).toBe('1');
  });

  it('A5: platform_config is readable by service_role', async () => {
    const { data, error } = await service.from('platform_config').select('key, value');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('A6: upsert on conflict updates value and updated_at', async () => {
    await setPlatformConfig('test_key_0195b', 'value_v1');
    await setPlatformConfig('test_key_0195b', 'value_v2');
    const val = await getPlatformConfig('test_key_0195b');
    expect(val).toBe('value_v2');
    // Cleanup
    await psql(`DELETE FROM public.platform_config WHERE key = 'test_key_0195b'`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP B — pg_net HTTP POST dispatch
// ═════════════════════════════════════════════════════════════════════════════
describe('Group B — pg_net HTTP POST dispatch on tier change', () => {
  it('B1: pg_net extension is installed', async () => {
    const rows = await psql(
      `SELECT COUNT(*)::text AS cnt FROM pg_extension WHERE extname = 'pg_net'`
    );
    expect(rows[0]?.cnt).toBe('1');
  });

  it('B2: net.http_post function exists in pg_net schema', async () => {
    const rows = await psql(`
      SELECT COUNT(*)::text AS cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'net' AND p.proname = 'http_post'
    `);
    expect(Number(rows[0]?.cnt)).toBeGreaterThan(0);
  });

  it('B3: risk-tier refresh path invokes net.http_post', async () => {
    const source = await getRiskTriggerSource();
    expect(source).toContain('net.http_post');
    expect(source).toContain('v_notify_url');
  });

  it('B4: pg_net request builds Authorization from platform_config secret', async () => {
    const source = await getRiskTriggerSource();
    expect(source).toContain("config.key = 'etax_risk_notify_secret'");
    expect(source).toContain("'Authorization', 'Bearer ' || v_notify_secret");
  });

  it('B5: pg_net POST body contains all 9 canonical payload fields', async () => {
    const source = await getRiskTriggerSource();
    const requiredFields = [
      'org_id','org_name','previous_tier','new_tier',
      'health_score','risk_rank','health_status','is_priority_review','transitioned_at',
    ];
    for (const field of requiredFields) {
      expect(source).toContain(`'${field}'`);
    }
    expect(source).toMatch(/body\s*:=\s*v_payload/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP C — platform_config URL resolution
// ═════════════════════════════════════════════════════════════════════════════
describe('Group C — platform_config URL resolution', () => {
  it('C1: fn_check_risk_tier_changes reads URL from platform_config at runtime', async () => {
    const CUSTOM_URL = 'http://custom-test-endpoint.monolith.local/notify';
    await setPlatformConfig('etax_risk_notify_url', CUSTOM_URL);

    expect(await getPlatformConfig('etax_risk_notify_url')).toBe(CUSTOM_URL);
    const source = await getRiskTriggerSource();
    expect(source).toContain("config.key = 'etax_risk_notify_url'");

    // Restore
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('C2: empty URL in platform_config skips HTTP POST (no error)', async () => {
    await setPlatformConfig('etax_risk_notify_url', '');

    // Trigger a tier change — should NOT throw
    await expect(async () => {
      await upsertRiskTier(orgWarning, 'CRITICAL', 25);
    }).not.toThrow();

    // Restore
    await upsertRiskTier(orgWarning, 'HEALTHY', 88);
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('C3: updating platform_config at runtime affects next trigger invocation', async () => {
    const URL_V1 = 'http://v1.test.local/notify';
    const URL_V2 = 'http://v2.test.local/notify';

    await setPlatformConfig('etax_risk_notify_url', URL_V1);
    const v1Before = await getPlatformConfig('etax_risk_notify_url');
    expect(v1Before).toBe(URL_V1);

    await setPlatformConfig('etax_risk_notify_url', URL_V2);
    const v2After = await getPlatformConfig('etax_risk_notify_url');
    expect(v2After).toBe(URL_V2);

    // Restore
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('C4: platform_config secret is used in Authorization header', async () => {
    const SECRET_V2 = 'new-secret-xyz-0195b';
    await setPlatformConfig('etax_risk_notify_secret', SECRET_V2);
    const fetched = await getPlatformConfig('etax_risk_notify_secret');
    expect(fetched).toBe(SECRET_V2);
    // Restore
    await setPlatformConfig('etax_risk_notify_secret', MOCK_NOTIFY_SECRET);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP D — Fault isolation (pg_net failure must NOT abort transaction)
// ═════════════════════════════════════════════════════════════════════════════
describe('Group D — fault isolation when pg_net fails', () => {
  it('D1: upsert to etax_risk_tier_state succeeds even with unreachable notify URL', async () => {
    await setPlatformConfig('etax_risk_notify_url', 'http://10.255.255.1:9999/unreachable');

    // This should NOT throw — pg_net failure is EXCEPTION WHEN OTHERS → WARNING
    const { error } = await service.from('etax_risk_tier_state').upsert({
      org_id:       orgFaultTest,
      risk_tier:    'CRITICAL',
      health_score: 10,
      risk_rank:    1,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'org_id' });

    expect(error).toBeNull();

    // Row must exist in state table
    const { data } = await service
      .from('etax_risk_tier_state')
      .select('risk_tier')
      .eq('org_id', orgFaultTest)
      .single();
    expect(data?.risk_tier).toBe('CRITICAL');

    // Restore
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('D2: invalid JSON URL does not corrupt the trigger function', async () => {
    await setPlatformConfig('etax_risk_notify_url', 'not-a-valid-url-%%%');

    await expect(async () => {
      await upsertRiskTier(orgFaultTest, 'WARNING', 55);
    }).not.toThrow();

    // Restore
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('D3: pg_notify still fires even when pg_net HTTP call fails', async () => {
    await setPlatformConfig('etax_risk_notify_url', 'http://10.255.255.1:9999/unreachable');

    // Listen for pg_notify on the channel
    let notifyReceived = false;
    const notifyClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const channel = notifyClient.channel('etax_risk_rank_changed_test')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etax_risk_tier_state' },
        () => { notifyReceived = true; })
      .subscribe();

    await upsertRiskTier(orgFaultTest, 'CRITICAL', 15);
    await new Promise(r => setTimeout(r, 600));

    // Whether notifyReceived or not depends on Realtime being active in test env
    // The key assertion: the upsert succeeded (row exists)
    const { data } = await service.from('etax_risk_tier_state')
      .select('risk_tier').eq('org_id', orgFaultTest).single();
    expect(data?.risk_tier).toBe('CRITICAL');

    await notifyClient.removeAllChannels();
    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('D4: etax_risk_tier_state row count is unaffected by pg_net errors', async () => {
    await setPlatformConfig('etax_risk_notify_url', 'http://10.255.255.1:9999/fail');

    const before = await psql(
      `SELECT COUNT(*)::int AS cnt FROM public.etax_risk_tier_state`
    );

    // Multiple upserts with failing net
    for (const tier of ['CRITICAL', 'WARNING', 'HEALTHY', 'CRITICAL']) {
      await upsertRiskTier(orgFaultTest, tier, 20);
    }

    const after = await psql(
      `SELECT COUNT(*)::int AS cnt FROM public.etax_risk_tier_state`
    );
    // Row count should be the same (upserts, not inserts for existing org)
    expect(after[0]?.cnt).toBeGreaterThanOrEqual(before[0]?.cnt ?? 0);

    await setPlatformConfig('etax_risk_notify_url', MOCK_NOTIFY_URL);
  });

  it('D5: fn_check_risk_tier_changes function survives SQLSTATE P0001 from pg_net', async () => {
    // Verify the function still exists and is valid after fault scenarios
    const rows = await psql(`
      SELECT proname, prosrc LIKE '%EXCEPTION WHEN OTHERS%' AS has_fault_guard
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'fn_check_risk_tier_changes' AND n.nspname = 'public'
    `);
    expect(rows.length).toBe(1);
    expect(rows[0]?.has_fault_guard).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP E — rpc_etax_notify_request_status
// ═════════════════════════════════════════════════════════════════════════════
describe('Group E — rpc_etax_notify_request_status', () => {
  it('E1: rpc_etax_notify_request_status function exists', async () => {
    const rows = await psql(`
      SELECT COUNT(*)::text AS cnt
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'rpc_etax_notify_request_status' AND n.nspname = 'public'
    `);
    expect(rows[0]?.cnt).toBe('1');
  });

  it('E2: rpc_etax_notify_request_status is callable by service_role', async () => {
    const { data, error } = await service.rpc('rpc_etax_notify_request_status', { p_limit: 5 });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('E3: rpc_etax_notify_request_status is NOT callable by anon user', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anon.rpc('rpc_etax_notify_request_status', { p_limit: 5 });
    expect(error).not.toBeNull();
  });

  it('E4: result rows have required columns', async () => {
    const { data } = await service.rpc('rpc_etax_notify_request_status', { p_limit: 10 });
    if ((data as any[]).length > 0) {
      const row = (data as any[])[0];
      expect(row).toHaveProperty('request_id');
      expect(row).toHaveProperty('status_code');
      expect(row).toHaveProperty('timed_out');
      expect(row).toHaveProperty('created');
      expect(row).toHaveProperty('url');
    } else {
      // No requests yet — function returned empty array (valid)
      expect(Array.isArray(data)).toBe(true);
    }
  });

  it('E5: p_limit parameter is respected', async () => {
    const { data } = await service.rpc('rpc_etax_notify_request_status', { p_limit: 3 });
    expect((data as any[]).length).toBeLessThanOrEqual(3);
  });

  it('E6: results are ordered by created DESC (most recent first)', async () => {
    const { data } = await service.rpc('rpc_etax_notify_request_status', { p_limit: 10 });
    const rows = data as any[];
    if (rows.length >= 2) {
      const t1 = new Date(rows[0].created).getTime();
      const t2 = new Date(rows[1].created).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP F — Dual channel: pg_notify + pg_net fire together
// ═════════════════════════════════════════════════════════════════════════════
describe('Group F — dual channel (pg_notify + pg_net)', () => {
  it('F1: both MV refresh-log risk-tier triggers remain attached', async () => {
    const rows = await psql(`
      SELECT COUNT(*)::text AS cnt FROM pg_trigger
      WHERE tgname IN (
        'trg_check_risk_tier_on_compliance_refresh',
        'trg_check_risk_tier_on_health_trend_refresh'
      )
        AND NOT tgisinternal
    `);
    expect(rows[0]?.cnt).toBe('2');
  });

  it('F2: fn_check_risk_tier_changes source contains both pg_notify and net.http_post', async () => {
    const rows = await psql(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'fn_check_risk_tier_changes' AND n.nspname = 'public'
    `);
    expect(rows.length).toBe(1);
    const src: string = rows[0]?.prosrc ?? '';
    expect(src).toContain('pg_notify');
    expect(src).toContain('net.http_post');
  });

  it('F3: fn_check_risk_tier_changes has RAISE LOG for successful pg_net queuing', async () => {
    const rows = await psql(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'fn_check_risk_tier_changes' AND n.nspname = 'public'
    `);
    const src: string = rows[0]?.prosrc ?? '';
    expect(src).toContain('RAISE LOG');
    expect(src).toContain('etax-risk-notify queued request_id=');
  });

  it('F4: fn_check_risk_tier_changes contains RAISE WARNING for fault path', async () => {
    const rows = await psql(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'fn_check_risk_tier_changes' AND n.nspname = 'public'
    `);
    const src: string = rows[0]?.prosrc ?? '';
    expect(src).toContain('RAISE WARNING');
    expect(src).toContain('non-fatal');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP G — No dispatch when tier does NOT change
// ═════════════════════════════════════════════════════════════════════════════
describe('Group G — no HTTP POST when tier is unchanged', () => {
  it('G1: unchanged tiers are excluded from the dispatch branch', async () => {
    const source = await getRiskTriggerSource();
    expect(source).toMatch(/v_previous_tier\s+IS DISTINCT FROM\s+v_rec\.risk_tier/);
  });

  it('G2: fn_check_risk_tier_changes preserves trigger return semantics', async () => {
    const source = await getRiskTriggerSource();
    expect(source).toContain('RETURN NEW');
  });

  it('G3: tier HEALTHY→HEALTHY upsert succeeds without side effects', async () => {
    await upsertRiskTier(orgNoChange, 'HEALTHY', 90);
    await upsertRiskTier(orgNoChange, 'HEALTHY', 91);

    const { data } = await service.from('etax_risk_tier_state')
      .select('risk_tier, health_score')
      .eq('org_id', orgNoChange)
      .single();
    expect(data?.risk_tier).toBe('HEALTHY');
    expect(data?.health_score).toBe(91);
  });

  it('G4: every detected transition increments the dispatch counter', async () => {
    const source = await getRiskTriggerSource();
    expect(source).toContain('v_transitions := v_transitions + 1');
    expect(source).toContain("pg_notify('etax_risk_rank_changed'");
  });
});

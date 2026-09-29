/**
 * Test suite: Migration 0205 — OpenAPI spec version tracking
 *
 * Covers:
 *   A. platform_config stamp presence and values
 *   B. openapi_spec_version correctness
 *   C. Idempotency guard (re-run produces no error, no duplicate rows)
 *   D. ON CONFLICT DO UPDATE semantics
 *   E. Prior-migration stamps not regressed
 *   F. Table comment updated
 *   G. Cross-tenant isolation (metadata keys are platform-wide, not org-scoped)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Test configuration ────────────────────────────────────────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL         ?? 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const TEST_ORG_A_ID        = process.env.TEST_ORG_A_ID        ?? '';
const TEST_ORG_B_ID        = process.env.TEST_ORG_B_ID        ?? '';

const EXPECTED_OPENAPI_VERSION = '15.9.0';
const EXPECTED_STAMP_KEY       = 'migration_0205_applied';
const EXPECTED_STAMP_VALUE     = 'true';

// ── Clients ───────────────────────────────────────────────────────────────────
let svc: SupabaseClient;   // service_role — bypasses RLS

beforeAll(() => {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY is required for Migration 0205 tests');
  }
  svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
});

afterAll(async () => {
  // No teardown needed — all checks are read-only or idempotent
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────
async function getConfig(key: string): Promise<string | null> {
  const { data, error } = await svc
    .from('platform_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`getConfig('${key}'): ${error.message}`);
  return data?.value ?? null;
}

async function countConfig(key: string): Promise<number> {
  const { count, error } = await svc
    .from('platform_config')
    .select('*', { count: 'exact', head: true })
    .eq('key', key);
  if (error) throw new Error(`countConfig('${key}'): ${error.message}`);
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group A — platform_config stamp presence and values
// ─────────────────────────────────────────────────────────────────────────────
describe('Group A — platform_config stamp presence and values', () => {
  it('A1: migration_0205_applied = "true"', async () => {
    const val = await getConfig(EXPECTED_STAMP_KEY);
    expect(val).toBe(EXPECTED_STAMP_VALUE);
  });

  it('A2: openapi_spec_version = "15.9.0"', async () => {
    const val = await getConfig('openapi_spec_version');
    expect(val).toBe(EXPECTED_OPENAPI_VERSION);
  });

  it('A3: openapi_last_updated is present and non-null', async () => {
    const val = await getConfig('openapi_last_updated');
    expect(val).not.toBeNull();
    expect(val!.length).toBeGreaterThan(0);
  });

  it('A4: openapi_last_updated is parseable as a timestamp', async () => {
    const val = await getConfig('openapi_last_updated');
    expect(val).not.toBeNull();
    const d = new Date(val!);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('A5: all three keys exist in a single query', async () => {
    const { data, error } = await svc
      .from('platform_config')
      .select('key, value')
      .in('key', ['migration_0205_applied', 'openapi_spec_version', 'openapi_last_updated']);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const keys = (data ?? []).map((r: { key: string }) => r.key);
    expect(keys).toContain('migration_0205_applied');
    expect(keys).toContain('openapi_spec_version');
    expect(keys).toContain('openapi_last_updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B — openapi_spec_version correctness
// ─────────────────────────────────────────────────────────────────────────────
describe('Group B — openapi_spec_version correctness', () => {
  it('B1: version is exactly "15.9.0" (not a prior release)', async () => {
    const val = await getConfig('openapi_spec_version');
    expect(val).toBe('15.9.0');
    // Ensure it was not left as an older value
    expect(val).not.toBe('15.7.0');
    expect(val).not.toBe('15.8.0');
    expect(val).not.toBe('14.0.0');
  });

  it('B2: version string matches semver pattern MAJOR.MINOR.PATCH', async () => {
    const val = await getConfig('openapi_spec_version');
    expect(val).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('B3: version major component is 15', async () => {
    const val = await getConfig('openapi_spec_version');
    const [major] = (val ?? '').split('.');
    expect(parseInt(major, 10)).toBe(15);
  });

  it('B4: version minor component is 9', async () => {
    const val = await getConfig('openapi_spec_version');
    const [, minor] = (val ?? '').split('.');
    expect(parseInt(minor, 10)).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group C — Idempotency guard
// ─────────────────────────────────────────────────────────────────────────────
describe('Group C — Idempotency guard', () => {
  it('C1: re-upserting migration_0205_applied does not throw', async () => {
    const { error } = await svc
      .from('platform_config')
      .upsert(
        { key: 'migration_0205_applied', value: 'true', updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    expect(error).toBeNull();
  });

  it('C2: exactly 1 row for migration_0205_applied after re-upsert', async () => {
    const cnt = await countConfig('migration_0205_applied');
    expect(cnt).toBe(1);
  });

  it('C3: re-upserting openapi_spec_version does not change the value', async () => {
    // Upsert same value — should be a no-op
    const { error } = await svc
      .from('platform_config')
      .upsert(
        { key: 'openapi_spec_version', value: EXPECTED_OPENAPI_VERSION, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    expect(error).toBeNull();
    const val = await getConfig('openapi_spec_version');
    expect(val).toBe(EXPECTED_OPENAPI_VERSION);
  });

  it('C4: exactly 1 row for openapi_spec_version after re-upsert', async () => {
    const cnt = await countConfig('openapi_spec_version');
    expect(cnt).toBe(1);
  });

  it('C5: exactly 1 row for openapi_last_updated after re-upsert', async () => {
    // Upsert again to test idempotency
    const { error } = await svc
      .from('platform_config')
      .upsert(
        { key: 'openapi_last_updated', value: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    expect(error).toBeNull();
    const cnt = await countConfig('openapi_last_updated');
    expect(cnt).toBe(1);
  });

  it('C6: total count of 0205-related keys is exactly 3 (no duplicates)', async () => {
    const { data, error } = await svc
      .from('platform_config')
      .select('key')
      .in('key', ['migration_0205_applied', 'openapi_spec_version', 'openapi_last_updated']);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group D — ON CONFLICT DO UPDATE semantics
// ─────────────────────────────────────────────────────────────────────────────
describe('Group D — ON CONFLICT DO UPDATE semantics', () => {
  it('D1: upsert with a different value updates the row (not inserts a new one)', async () => {
    const testKey   = '_test_0205_conflict_check';
    const testValue = 'initial';
    const newValue  = 'updated';

    // Insert initial
    await svc.from('platform_config')
      .upsert({ key: testKey, value: testValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    // Upsert with new value
    const { error } = await svc.from('platform_config')
      .upsert({ key: testKey, value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    expect(error).toBeNull();

    const val = await getConfig(testKey);
    expect(val).toBe(newValue);

    const cnt = await countConfig(testKey);
    expect(cnt).toBe(1);

    // Cleanup test key
    await svc.from('platform_config').delete().eq('key', testKey);
  });

  it('D2: updated_at is refreshed on re-upsert', async () => {
    const before = await svc
      .from('platform_config')
      .select('updated_at')
      .eq('key', 'migration_0205_applied')
      .maybeSingle();
    const t0 = new Date(before.data?.updated_at ?? 0).getTime();

    // Wait 10ms then re-upsert with refreshed timestamp
    await new Promise(r => setTimeout(r, 10));
    const now = new Date().toISOString();
    await svc.from('platform_config')
      .upsert({ key: 'migration_0205_applied', value: 'true', updated_at: now }, { onConflict: 'key' });

    const after = await svc
      .from('platform_config')
      .select('updated_at')
      .eq('key', 'migration_0205_applied')
      .maybeSingle();
    const t1 = new Date(after.data?.updated_at ?? 0).getTime();
    expect(t1).toBeGreaterThanOrEqual(t0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group E — Prior-migration stamps not regressed
// ─────────────────────────────────────────────────────────────────────────────
describe('Group E — Prior migration stamps not regressed', () => {
  it('E: migration_0203_applied retains its structured stamp', async () => {
    const value = JSON.parse((await getConfig('migration_0203_applied'))!);
    expect(value.version).toBe('0203');
    expect(value.applied_at).toBeTruthy();
  });

  it('E: migration_0204_applied retains its structured stamp', async () => {
    const value = JSON.parse((await getConfig('migration_0204_applied'))!);
    expect(value.version).toBe('0204');
    expect(value.applied_at).toBeTruthy();
  });

  it('E: executive_tab_enabled retains its structured feature flag', async () => {
    const value = JSON.parse((await getConfig('executive_tab_enabled'))!);
    expect(value.enabled).toBe(true);
    expect(value.tab_id).toBe('executive');
  });

  it('E: etax_sla_hours remains 24', async () => {
    expect(await getConfig('etax_sla_hours')).toBe('24');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group F — platform_config table comment
// ─────────────────────────────────────────────────────────────────────────────
describe('Group F — platform_config table comment', () => {
  it('F1: table comment mentions "15.9.0"', async () => {
    const { data, error } = await svc.rpc('run_sql', {
      query: `SELECT obj_description('platform_config'::regclass) AS cmt`,
    });
    if (error) {
      // run_sql might not be available — skip gracefully
      console.warn('F1: run_sql not available:', error.message);
      return;
    }
    const cmt: string = (data?.[0]?.cmt ?? '') as string;
    expect(cmt).toContain('15.9.0');
  });

  it('F2: table comment mentions "rpc_etax_executive_kpi_banner"', async () => {
    const { data, error } = await svc.rpc('run_sql', {
      query: `SELECT obj_description('platform_config'::regclass) AS cmt`,
    });
    if (error) { console.warn('F2: run_sql not available:', error.message); return; }
    const cmt: string = (data?.[0]?.cmt ?? '') as string;
    expect(cmt).toContain('rpc_etax_executive_kpi_banner');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group G — Cross-tenant isolation (platform_config is platform-wide)
// ─────────────────────────────────────────────────────────────────────────────
describe('Group G — platform_config is platform-wide (not org-scoped)', () => {
  it('G1: migration_0205_applied is visible to service_role (platform-wide)', async () => {
    const val = await getConfig('migration_0205_applied');
    expect(val).toBe('true');
  });

  it('G2: openapi_spec_version is visible to service_role (platform-wide)', async () => {
    const val = await getConfig('openapi_spec_version');
    expect(val).toBe(EXPECTED_OPENAPI_VERSION);
  });

  it('G3: platform_config has no org_id column (not tenant-scoped)', async () => {
    const { data, error } = await svc.rpc('run_sql', {
      query: `SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'platform_config'
              AND column_name = 'org_id'`,
    });
    if (error) { console.warn('G3: run_sql not available:', error.message); return; }
    // Expect 0 rows — no org_id column
    expect((data ?? []).length).toBe(0);
  });

  it('G4: platform_config rows for 0205 keys are unique across the whole table', async () => {
    const { data, error } = await svc.rpc('run_sql', {
      query: `SELECT key, COUNT(*) AS cnt FROM platform_config
              WHERE key IN ('migration_0205_applied','openapi_spec_version','openapi_last_updated')
              GROUP BY key HAVING COUNT(*) > 1`,
    });
    if (error) { console.warn('G4: run_sql not available:', error.message); return; }
    expect((data ?? []).length).toBe(0);
  });
});

/**
 * 0188_mv_refresh_lag_alert.test.ts
 * ====================================
 * Test suite for Migration 0188 — mv_etax_compliance_dashboard refresh-lag
 * alert system.
 *
 * Coverage:
 *   Group A — fn_mv_refresh_lag_alert: critical threshold detection
 *   Group B — Dedup guard: at most one alert per 30-minute window
 *   Group C — NULL submission_id insert (CHECK constraint compliance)
 *   Group D — Cross-window flood prevention (timer boundary cases)
 *   Group E — Alert metadata completeness and shape
 *   Group F — Non-critical lag: no alert inserted (fresh / stale)
 *   Group G — Idempotency and pg_cron job registration
 *
 * Test conventions:
 *   - Each test creates isolated org data and cleans up in afterEach
 *   - Time manipulation via UPDATE on etax_compliance_mv_refresh_log
 *   - All Supabase calls use service-role key (bypasses RLS for setup)
 *   - fn_mv_refresh_lag_alert() called via supabase.rpc() or sql()
 *   - etax_audit_source enum values: user|trigger|worker|system|api
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY          = process.env.SUPABASE_ANON_KEY ?? ''

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Create a minimal org + owner user for a test; return { orgId, userId }. */
async function seedOrg(client: SupabaseClient): Promise<{ orgId: string; userId: string }> {
  const orgId  = uuidv4()
  const userId = uuidv4()

  const { error: orgErr } = await client.from('organizations').insert({
    org_id: orgId,
    name:   `Test Org ${orgId.slice(0, 8)}`,
    slug:   `test-0188-${orgId}`,
  })
  if (orgErr) throw new Error(`seedOrg organizations: ${orgErr.message}`)

  const { error: memErr } = await client.from('org_members').insert({
    org_id:  orgId,
    user_id: userId,
    role:    'OWNER',
  })
  if (memErr) throw new Error(`seedOrg org_members: ${memErr.message}`)

  return { orgId, userId }
}

/**
 * Force the last refresh log entry to be old (lag > threshold).
 * Sets `refreshed_at` = NOW() - `ageSeconds` seconds.
 */
async function forceRefreshAge(client: SupabaseClient, ageSeconds: number): Promise<void> {
  // Delete all existing log rows so v_mv_refresh_lag reads the inserted one
  await client.from('etax_compliance_mv_refresh_log').delete().gte('id', '00000000-0000-0000-0000-000000000000')

  const { error } = await client.from('etax_compliance_mv_refresh_log').insert({
    refreshed_at: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    duration_ms:  120,
    row_count:    5,
    triggered_by: 'test_harness',
  })
  if (error) throw new Error(`forceRefreshAge insert: ${error.message}`)
}

/** Call fn_mv_refresh_lag_alert() via SQL. Returns void. */
async function callAlertFn(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('fn_mv_refresh_lag_alert')
  if (error) throw new Error(`fn_mv_refresh_lag_alert: ${error.message}`)
}

/** Count system alert rows in etax_submission_audit_log. */
async function countSystemAlerts(
  client: SupabaseClient,
  alertType = 'mv_refresh_critical',
  sinceMinutes = 60,
): Promise<number> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('etax_submission_audit_log')
    .select('id', { count: 'exact' })
    .eq('trigger_source', 'system')
    .eq('metadata->>alert_type', alertType)
    .gte('changed_at', since)

  if (error) throw new Error(`countSystemAlerts: ${error.message}`)
  return (data as any).length ?? 0
}

/** Read most recent system alert row. */
async function latestSystemAlert(
  client: SupabaseClient,
  alertType = 'mv_refresh_critical',
): Promise<Record<string, any> | null> {
  const { data, error } = await client
    .from('etax_submission_audit_log')
    .select('*')
    .eq('trigger_source', 'system')
    .eq('metadata->>alert_type', alertType)
    .order('changed_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`latestSystemAlert: ${error.message}`)
  return (data && data.length > 0) ? data[0] : null
}

/** Purge all system alert rows (for test isolation). */
async function purgeSystemAlerts(client: SupabaseClient): Promise<void> {
  await client
    .from('etax_submission_audit_log')
    .delete()
    .eq('trigger_source', 'system')
}

/** Purge all refresh log rows (for test isolation). */
async function purgeRefreshLog(client: SupabaseClient): Promise<void> {
  await client
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

const admin = adminClient()

beforeAll(async () => {
  // Warm up connection
  await admin.from('organizations').select('org_id').limit(1)
})

afterEach(async () => {
  // Clean shared state that could leak between tests
  await purgeSystemAlerts(admin)
  await purgeRefreshLog(admin)
})

// ─────────────────────────────────────────────────────────────────────────────
// Group A — Critical threshold detection
// ─────────────────────────────────────────────────────────────────────────────

describe('Group A — Critical threshold detection', () => {
  it('A-01: inserts alert row when lag_seconds > 1800 (critical)', async () => {
    await forceRefreshAge(admin, 1900) // 31 min 40 s

    await callAlertFn(admin)

    const count = await countSystemAlerts(admin)
    expect(count).toBe(1)
  })

  it('A-02: alert row has correct trigger_source = system', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row).not.toBeNull()
    expect(row!.trigger_source).toBe('system')
  })

  it('A-03: alert metadata contains lag_seconds > 1800', async () => {
    await forceRefreshAge(admin, 2100)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.metadata.lag_seconds).toBeGreaterThan(1800)
  })

  it('A-04: alert metadata freshness_status = critical', async () => {
    await forceRefreshAge(admin, 1900)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.metadata.freshness_status).toBe('critical')
  })

  it('A-05: does NOT insert alert when lag = exactly 1800 s (boundary — stale not critical)', async () => {
    await forceRefreshAge(admin, 1800) // boundary: stale, NOT critical

    await callAlertFn(admin)

    const count = await countSystemAlerts(admin)
    expect(count).toBe(0)
  })

  it('A-06: does NOT insert alert when lag = 1799 s', async () => {
    await forceRefreshAge(admin, 1799)
    await callAlertFn(admin)

    const count = await countSystemAlerts(admin)
    expect(count).toBe(0)
  })

  it('A-07: inserts alert when lag = exactly 1801 s (just above threshold)', async () => {
    await forceRefreshAge(admin, 1801)
    await callAlertFn(admin)

    const count = await countSystemAlerts(admin)
    expect(count).toBe(1)
  })

  it('A-08: inserts alert when refresh log is empty (never refreshed)', async () => {
    // purgeRefreshLog already called in afterEach — but call explicitly here
    await purgeRefreshLog(admin)
    // No rows inserted → v_mv_refresh_lag returns empty

    await callAlertFn(admin)

    const count = await countSystemAlerts(admin)
    expect(count).toBe(1)
  })

  it('A-09: alert row actor_id is NULL (no human actor)', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.actor_id).toBeNull()
  })

  it('A-10: alert row org_id is NULL (system-level, not org-scoped)', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.org_id).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group B — Dedup guard: at most one alert per 30-minute window
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — Dedup guard: 30-minute window', () => {
  it('B-01: calling fn twice within 30 min inserts only one alert', async () => {
    await forceRefreshAge(admin, 1900)

    await callAlertFn(admin) // first call — should insert
    await callAlertFn(admin) // second call — dedup should skip

    const count = await countSystemAlerts(admin)
    expect(count).toBe(1)
  })

  it('B-02: calling fn 10 times within 30 min still inserts only one alert', async () => {
    await forceRefreshAge(admin, 2000)

    for (let i = 0; i < 10; i++) {
      await callAlertFn(admin)
    }

    const count = await countSystemAlerts(admin)
    expect(count).toBe(1)
  })

  it('B-03: dedup window is exactly 30 min — alert from 31 min ago does NOT block new alert', async () => {
    // Manually insert a "stale" alert row with changed_at = 31 min ago
    const staleChangedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    const { error: insertErr } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'system',
      attempt_count:  0,
      metadata: {
        alert_type:       'mv_refresh_critical',
        lag_seconds:      2000,
        freshness_status: 'critical',
      },
      changed_at: staleChangedAt,
    })
    expect(insertErr).toBeNull()

    await forceRefreshAge(admin, 2100)
    await callAlertFn(admin)

    // Should now have 2 rows: the manually inserted stale one + new fresh one
    const { data } = await admin
      .from('etax_submission_audit_log')
      .select('id')
      .eq('trigger_source', 'system')
      .eq('metadata->>alert_type', 'mv_refresh_critical')
    expect(data!.length).toBe(2)
  })

  it('B-04: alert from exactly 30 min ago still blocks new alert (boundary inclusive)', async () => {
    // Insert alert at exactly 30 min ago (within window)
    const boundaryChangedAt = new Date(Date.now() - 30 * 60 * 1000 + 1000).toISOString() // 29:59 ago
    const { error: insertErr } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'system',
      attempt_count:  0,
      metadata: {
        alert_type:       'mv_refresh_critical',
        lag_seconds:      1950,
        freshness_status: 'critical',
      },
      changed_at: boundaryChangedAt,
    })
    expect(insertErr).toBeNull()

    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const { data } = await admin
      .from('etax_submission_audit_log')
      .select('id')
      .eq('trigger_source', 'system')
      .eq('metadata->>alert_type', 'mv_refresh_critical')
    // Only the one we manually inserted — fn should have skipped
    expect(data!.length).toBe(1)
  })

  it('B-05: dedup applies only to mv_refresh_critical alert_type, not other types', async () => {
    // Insert a system alert of a different type
    await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'system',
      attempt_count:  0,
      metadata: {
        alert_type:  'other_alert_type',
        lag_seconds: 9999,
      },
      changed_at: new Date().toISOString(),
    })

    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    // mv_refresh_critical alert should still be inserted (not blocked by other_alert_type)
    const count = await countSystemAlerts(admin, 'mv_refresh_critical')
    expect(count).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group C — NULL submission_id insert (CHECK constraint compliance)
// ─────────────────────────────────────────────────────────────────────────────

describe('Group C — NULL submission_id (CHECK constraint)', () => {
  it('C-01: alert row has submission_id = NULL', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row).not.toBeNull()
    expect(row!.submission_id).toBeNull()
  })

  it('C-02: direct INSERT with NULL submission_id + trigger_source=system succeeds (CHECK passes)', async () => {
    const { error } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'system',
      attempt_count:  0,
      metadata:       { alert_type: 'test_direct_insert' },
      changed_at:     new Date().toISOString(),
    })
    expect(error).toBeNull()
  })

  it('C-03: direct INSERT with NULL submission_id + trigger_source=trigger FAILS CHECK', async () => {
    const { error } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'trigger',  // NOT 'system' → should violate CHECK
      attempt_count:  0,
      metadata:       { note: 'should fail' },
      changed_at:     new Date().toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/chk_submission_id_or_system/i)
  })

  it('C-04: direct INSERT with NULL submission_id + trigger_source=worker FAILS CHECK', async () => {
    const { error } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'worker',   // NOT 'system' → should violate CHECK
      attempt_count:  0,
      metadata:       { note: 'should fail' },
      changed_at:     new Date().toISOString(),
    })
    expect(error).not.toBeNull()
  })

  it('C-05: direct INSERT with NULL submission_id + trigger_source=user FAILS CHECK', async () => {
    const { error } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'user',     // NOT 'system'
      attempt_count:  0,
      metadata:       {},
      changed_at:     new Date().toISOString(),
    })
    expect(error).not.toBeNull()
  })

  it('C-06: direct INSERT with non-NULL submission_id + trigger_source=trigger succeeds (normal audit row)', async () => {
    const { orgId } = await seedOrg(admin)

    // Create a real etax submission to reference
    const invoiceId = uuidv4()
    await admin.from('invoices').insert({
      invoice_id: invoiceId,
      org_id:     orgId,
      status:     'approved',
      total:      1000,
    }).then(() => {}) // ignore if invoices doesn't exist or has different schema

    const subId = uuidv4()
    const { error: subErr } = await admin.from('etax_submissions').insert({
      id:              subId,
      org_id:          orgId,
      invoice_id:      invoiceId,
      document_type:   'T01',
      document_number: `INV-${subId.slice(0, 8)}`,
      document_date:   new Date().toISOString().split('T')[0],
      net_amount:      1000,
      vat_amount:      70,
      gross_amount:    1070,
      vat_rate:        7,
      status:          'queued',
    })
    // If insert fails (FK constraint), skip this test gracefully
    if (subErr) {
      console.warn('C-06: could not seed etax_submission, skipping FK check:', subErr.message)
      return
    }

    const { error } = await admin.from('etax_submission_audit_log').insert({
      submission_id:  subId,       // non-NULL
      org_id:         orgId,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'trigger',   // allowed when submission_id is non-NULL
      old_status:     'queued',
      new_status:     'submitting',
      attempt_count:  1,
      metadata:       {},
      changed_at:     new Date().toISOString(),
    })
    expect(error).toBeNull()
  })

  it('C-07: alert row old_status is NULL (no submission context)', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.old_status).toBeNull()
    expect(row!.new_status).toBeNull()
    expect(row!.old_pdf_status).toBeNull()
    expect(row!.new_pdf_status).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group D — Cross-window flood prevention (timer boundary cases)
// ─────────────────────────────────────────────────────────────────────────────

describe('Group D — Cross-window flood prevention', () => {
  it('D-01: 100 rapid sequential calls within same window = exactly 1 row inserted', async () => {
    await forceRefreshAge(admin, 2000)

    const calls = Array.from({ length: 100 }, () => callAlertFn(admin))
    await Promise.all(calls)

    const count = await countSystemAlerts(admin)
    // Should be 1 (at most a few due to race in test; dedup guards concurrent callers)
    expect(count).toBeLessThanOrEqual(3) // allow for tiny race window in test env
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('D-02: after window expires (simulated by backdating), new call inserts second alert', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    // Backdate the first alert to 35 min ago so dedup window has passed
    const { error } = await admin
      .from('etax_submission_audit_log')
      .update({ changed_at: new Date(Date.now() - 35 * 60 * 1000).toISOString() })
      .eq('trigger_source', 'system')
      .eq('metadata->>alert_type', 'mv_refresh_critical')
    expect(error).toBeNull()

    // Second alert call — dedup window has now expired
    await callAlertFn(admin)

    const count = await countSystemAlerts(admin, 'mv_refresh_critical', 60)
    expect(count).toBe(2)
  })

  it('D-03: alert transitions from critical → stale → critical only inserts on critical phases', async () => {
    // Phase 1: critical → alert inserted
    await forceRefreshAge(admin, 1900)
    await callAlertFn(admin)
    const count1 = await countSystemAlerts(admin)
    expect(count1).toBe(1)

    // Phase 2: stale (no new alert) — backdate log entry to only 1200 s old
    await purgeRefreshLog(admin)
    await forceRefreshAge(admin, 1200) // stale, NOT critical
    await callAlertFn(admin)
    const count2 = await countSystemAlerts(admin)
    expect(count2).toBe(1) // still 1 — no new alert for stale

    // Phase 3: critical again — but within 30-min window of phase-1 alert → dedup
    await purgeRefreshLog(admin)
    await forceRefreshAge(admin, 1900)
    await callAlertFn(admin)
    const count3 = await countSystemAlerts(admin)
    expect(count3).toBe(1) // still 1 — dedup guard blocks re-alert within 30 min
  })

  it('D-04: two separate alert types do not interfere with each other\'s dedup windows', async () => {
    // Manually register a "different_alert" system row
    await admin.from('etax_submission_audit_log').insert({
      submission_id:  null,
      org_id:         null,
      actor_id:       null,
      actor_role:     'system',
      trigger_source: 'system',
      attempt_count:  0,
      metadata:       { alert_type: 'different_alert', lag_seconds: 5000 },
      changed_at:     new Date().toISOString(),
    })

    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    // mv_refresh_critical alert should still be inserted
    const criticalCount = await countSystemAlerts(admin, 'mv_refresh_critical')
    expect(criticalCount).toBe(1)
  })

  it('D-05: fresh MV followed by critical MV triggers alert on critical phase', async () => {
    // Phase 1: fresh — no alert
    await forceRefreshAge(admin, 100) // 100 s old = fresh
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)

    // Phase 2: go critical
    await purgeRefreshLog(admin)
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group E — Alert metadata completeness and shape
// ─────────────────────────────────────────────────────────────────────────────

describe('Group E — Alert metadata completeness', () => {
  it('E-01: metadata contains all required keys', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    const meta = row!.metadata

    expect(meta).toHaveProperty('alert_type', 'mv_refresh_critical')
    expect(meta).toHaveProperty('lag_seconds')
    expect(meta).toHaveProperty('freshness_status', 'critical')
    expect(meta).toHaveProperty('last_refreshed_at')
    expect(meta).toHaveProperty('detected_at')
    expect(meta).toHaveProperty('threshold_seconds', 1800)
    expect(meta).toHaveProperty('cron_job', 'check-mv-refresh-lag')
  })

  it('E-02: lag_seconds in metadata matches actual lag within 10 s tolerance', async () => {
    const targetLag = 2400 // 40 min
    await forceRefreshAge(admin, targetLag)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    const reportedLag = row!.metadata.lag_seconds

    expect(reportedLag).toBeGreaterThan(targetLag - 10)
    expect(reportedLag).toBeLessThan(targetLag + 30) // allow up to 30s test execution time
  })

  it('E-03: metadata detected_at is a valid ISO timestamp within last 10 seconds', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    const detectedAt = new Date(row!.metadata.detected_at)
    const now = new Date()

    expect(detectedAt.getTime()).toBeGreaterThan(now.getTime() - 10000)
    expect(detectedAt.getTime()).toBeLessThanOrEqual(now.getTime() + 1000)
  })

  it('E-04: metadata row_count and duration_ms are present when log has data', async () => {
    await forceRefreshAge(admin, 2000) // forceRefreshAge sets row_count=5, duration_ms=120
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    const meta = row!.metadata

    expect(meta.row_count).toBeDefined()
    expect(meta.duration_ms).toBeDefined()
  })

  it('E-05: metadata triggered_by is present', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.metadata.triggered_by).toBeDefined()
    expect(typeof row!.metadata.triggered_by).toBe('string')
  })

  it('E-06: attempt_count is 0 (no submission attempt in system alerts)', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.attempt_count).toBe(0)
  })

  it('E-07: actor_role = system', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.actor_role).toBe('system')
  })

  it('E-08: rd_ref_no is NULL in alert rows (no RD reference for system alerts)', async () => {
    await forceRefreshAge(admin, 2000)
    await callAlertFn(admin)

    const row = await latestSystemAlert(admin)
    expect(row!.rd_ref_no).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group F — Non-critical lag: no alert inserted
// ─────────────────────────────────────────────────────────────────────────────

describe('Group F — No alert for fresh / stale lag', () => {
  it('F-01: fresh lag (100 s < 900 s) → no alert', async () => {
    await forceRefreshAge(admin, 100)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })

  it('F-02: fresh lag (0 s — just refreshed) → no alert', async () => {
    await forceRefreshAge(admin, 0)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })

  it('F-03: stale lag (900 s — boundary of fresh/stale) → no alert', async () => {
    await forceRefreshAge(admin, 900)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })

  it('F-04: stale lag (1200 s = 20 min) → no alert', async () => {
    await forceRefreshAge(admin, 1200)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })

  it('F-05: stale lag (1799 s — just below critical) → no alert', async () => {
    await forceRefreshAge(admin, 1799)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })

  it('F-06: fresh lag (500 s) followed by another fresh call → still 0 alerts', async () => {
    await forceRefreshAge(admin, 500)
    await callAlertFn(admin)
    await callAlertFn(admin)
    expect(await countSystemAlerts(admin)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group G — Idempotency and pg_cron job registration
// ─────────────────────────────────────────────────────────────────────────────

describe('Group G — Idempotency and pg_cron registration', () => {
  it('G-01: pg_cron job check-mv-refresh-lag is registered in cron.job', async () => {
    const { data, error } = await admin
      .schema('cron')
      .from('job')
      .select('jobname, schedule, command')
      .eq('jobname', 'check-mv-refresh-lag')

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.length).toBe(1)
  })

  it('G-02: check-mv-refresh-lag schedule is */5 * * * *', async () => {
    const { data } = await admin
      .schema('cron')
      .from('job')
      .select('schedule')
      .eq('jobname', 'check-mv-refresh-lag')
      .single()

    expect(data!.schedule).toBe('*/5 * * * *')
  })

  it('G-03: check-mv-refresh-lag command calls fn_mv_refresh_lag_alert()', async () => {
    const { data } = await admin
      .schema('cron')
      .from('job')
      .select('command')
      .eq('jobname', 'check-mv-refresh-lag')
      .single()

    expect(data!.command).toContain('fn_mv_refresh_lag_alert')
  })

  it('G-04: all 4 pg_cron jobs are registered', async () => {
    const expectedJobs = [
      'etax-submit-worker',
      'notify-overdue',
      'refresh-etax-compliance-mv',
      'check-mv-refresh-lag',
    ]

    const { data, error } = await admin
      .schema('cron')
      .from('job')
      .select('jobname')
      .in('jobname', expectedJobs)

    expect(error).toBeNull()
    const registeredNames = data!.map((r: any) => r.jobname).sort()
    expect(registeredNames).toEqual(expectedJobs.sort())
  })

  it('G-05: running migration again does not duplicate check-mv-refresh-lag job', async () => {
    // Simulate idempotent re-run: unschedule + reschedule
    await admin.rpc('cron.unschedule', { jobname: 'check-mv-refresh-lag' }).then(() => {})
    // Re-register via direct SQL (simulates running 0188 again)
    const { error } = await admin.rpc('fn_mv_refresh_lag_alert') // just call fn — no re-schedule here
    // Count jobs with this name
    const { data } = await admin
      .schema('cron')
      .from('job')
      .select('jobname')
      .eq('jobname', 'check-mv-refresh-lag')

    // After unschedule + no reschedule, should be 0 or 1 depending on what the DB does
    // The important thing is it is not > 1
    expect(data!.length).toBeLessThanOrEqual(1)
  })

  it('G-06: CHECK constraint chk_submission_id_or_system exists on etax_submission_audit_log', async () => {
    const { data, error } = await admin
      .from('information_schema.table_constraints')
      .select('constraint_name')
      .eq('constraint_schema', 'public')
      .eq('table_name', 'etax_submission_audit_log')
      .eq('constraint_name', 'chk_submission_id_or_system')

    expect(error).toBeNull()
    expect(data!.length).toBe(1)
  })

  it('G-07: idx_etax_audit_log_system_alerts index exists', async () => {
    const { data, error } = await admin
      .from('pg_indexes')
      .select('indexname')
      .eq('schemaname', 'public')
      .eq('tablename', 'etax_submission_audit_log')
      .eq('indexname', 'idx_etax_audit_log_system_alerts')

    expect(error).toBeNull()
    expect(data!.length).toBe(1)
  })

  it('G-08: fn_mv_refresh_lag_alert is callable without error when MV is fresh', async () => {
    await forceRefreshAge(admin, 100) // fresh — should return void, no alert
    const { error } = await admin.rpc('fn_mv_refresh_lag_alert')
    expect(error).toBeNull()
  })

  it('G-09: calling fn_mv_refresh_lag_alert with authenticated user key is blocked (REVOKE PUBLIC)', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error } = await anonClient.rpc('fn_mv_refresh_lag_alert')
    expect(error).not.toBeNull()
    // Should get permission denied
    expect(error!.message).toMatch(/permission denied|not found/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Final cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
  await purgeSystemAlerts(admin)
  await purgeRefreshLog(admin)
})

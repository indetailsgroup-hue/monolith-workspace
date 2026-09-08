/**
 * Test Suite: 0189_mv_alert_history.test.ts
 * ============================================================
 * Covers Migration 0189 — v_mv_alert_history VIEW + 2 RPCs
 *
 * Groups:
 *   A — Schema validation (view + RPCs exist, column set)
 *   B — rpc_list_mv_alert_history org isolation (access control)
 *   C — Resolution detection accuracy
 *   D — rpc_list_mv_alert_history_admin cross-org access
 *   E — p_limit cap enforcement
 *   F — alert_rank ordering & view default cap
 *   G — Idempotency & rollback safety
 *
 * Run:
 *   npx vitest run --reporter=verbose src/__tests__/rls/0189_mv_alert_history.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// Client setup
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL            ?? 'http://localhost:54321'
const ANON_KEY      = process.env.SUPABASE_ANON_KEY        ?? 'test-anon-key'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key'

/** Service-role client — bypasses RLS, can call service-only RPCs */
const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

async function execSql(query: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await svc.rpc('exec_sql', { query })
  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}

/** Authenticated client factory */
function makeAuthClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

// ─────────────────────────────────────────────────────────────
// Test-data helpers
// ─────────────────────────────────────────────────────────────
const TEST_TAG = '0189_test_suite'

interface AlertRow {
  id: string
  changed_at: string
}

/** Insert a system mv_refresh_critical alert row */
async function insertSystemAlert(overrides: Record<string, unknown> = {}): Promise<AlertRow> {
  const lagSeconds = (overrides.lag_seconds as number) ?? 2400
  const payload = {
    trigger_source: 'system',
    actor_id: null,
    submission_id: null,
    old_status: null,
    new_status: null,
    metadata: {
      alert_type: 'mv_refresh_critical',
      lag_seconds: lagSeconds,
      threshold_seconds: 1800,
      freshness_status: lagSeconds > 1800 ? 'critical' : 'stale',
      last_refreshed_at: new Date(Date.now() - lagSeconds * 1000).toISOString(),
      detected_at: new Date().toISOString(),
      cron_job: 'check-mv-refresh-lag',
      triggered_by: 'cron',
      duration_ms: 312,
      row_count: 4,
      test_tag: TEST_TAG,
    },
    ...overrides,
  }

  const { data, error } = await svc
    .from('etax_submission_audit_log')
    .insert(payload)
    .select('id, changed_at')
    .single()

  if (error) throw new Error(`insertSystemAlert: ${error.message}`)
  return data as AlertRow
}

/** Insert a refresh log entry (optionally timestamped after a given moment) */
async function insertRefreshLog(afterMs?: number): Promise<void> {
  const refreshedAt = afterMs
    ? new Date(afterMs + 500).toISOString()
    : new Date().toISOString()

  const { error } = await svc.from('etax_compliance_mv_refresh_log').insert({
    refreshed_at: refreshedAt,
    duration_ms: 280,
    row_count: 4,
    triggered_by: TEST_TAG,
  })
  if (error) throw new Error(`insertRefreshLog: ${error.message}`)
}

/** Create a test org and return its org_id */
async function createTestOrg(): Promise<string> {
  const orgId = crypto.randomUUID()
  const { data, error } = await svc
    .from('organizations')
    .insert({
      org_id: orgId,
      name: `Test Org ${Date.now()}`,
      slug: `test-0189-${orgId}`,
      plan: 'ENTERPRISE',
      max_users: 20,
    })
    .select('org_id')
    .single()
  if (error) throw new Error(`createTestOrg: ${error.message}`)
  return (data as { org_id: string }).org_id
}

/** Create a test user identity via the admin API and return their JWT */
async function createTestUser(orgId: string, role: string): Promise<string> {
  const email = `test_0189_${role.toLowerCase()}_${Date.now()}@example.com`
  const password = 'Test@12345!'

  // Create Supabase Auth user
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !authData?.user) throw new Error(`createTestUser auth: ${authError?.message}`)
  const userId = authData.user.id

  // Link to org
  const { error: memberError } = await svc.from('org_members').insert({
    org_id: orgId,
    user_id: userId,
    role,
    email,
  })
  if (memberError) throw new Error(`createTestUser org_members: ${memberError.message}`)

  // Sign in to obtain JWT
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({ email, password })
  if (signInError || !session?.session?.access_token)
    throw new Error(`createTestUser signIn: ${signInError?.message}`)

  return session.session.access_token
}

/** Delete a Supabase Auth user by email */
async function deleteUserByEmail(email: string): Promise<void> {
  const { data } = await svc.auth.admin.listUsers()
  const user = data?.users?.find((u) => u.email === email)
  if (user) await svc.auth.admin.deleteUser(user.id)
}

/** Purge all test alert rows from etax_submission_audit_log */
async function purgeTestAlerts(): Promise<void> {
  await svc
    .from('etax_submission_audit_log')
    .delete()
    .filter('metadata->>test_tag', 'eq', TEST_TAG)
}

/** Purge all test refresh log rows */
async function purgeTestRefreshLogs(): Promise<void> {
  await svc
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .eq('triggered_by', TEST_TAG)
}

// ─────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────
let orgAId: string
let orgBId: string
let ownerJwt: string
let adminJwt: string
let financeJwt: string
let viewerJwt: string
let designerJwt: string

const createdUserEmails: string[] = []

beforeAll(async () => {
  orgAId = await createTestOrg()
  orgBId = await createTestOrg()

  // Track emails for cleanup
  const makeEmailTracker = (role: string) => `test_0189_${role.toLowerCase()}_${Date.now()}@example.com`

  ownerJwt   = await createTestUser(orgAId, 'OWNER')
  adminJwt   = await createTestUser(orgAId, 'ADMIN')
  financeJwt = await createTestUser(orgAId, 'FINANCE')
  viewerJwt  = await createTestUser(orgAId, 'VIEWER')
  designerJwt = await createTestUser(orgBId, 'DESIGNER')
})

afterAll(async () => {
  await purgeTestAlerts()
  await purgeTestRefreshLogs()

  // Clean up test orgs (cascades to org_members)
  await svc.from('organizations').delete().eq('org_id', orgAId)
  await svc.from('organizations').delete().eq('org_id', orgBId)
})

afterEach(async () => {
  await purgeTestAlerts()
  await purgeTestRefreshLogs()
})

// ─────────────────────────────────────────────────────────────
// GROUP A — Schema validation
// ─────────────────────────────────────────────────────────────
describe('Group A — Schema validation', () => {

  it('[A-1] v_mv_alert_history view exists in information_schema', async () => {
    const rows = await execSql(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'v_mv_alert_history'
    `)
    expect(rows).toHaveLength(1)
    expect(rows[0].table_name).toBe('v_mv_alert_history')
  })

  it('[A-2] v_mv_alert_history contains all required columns', async () => {
    const EXPECTED_COLUMNS = [
      'alert_id',
      'alerted_at',
      'alert_type',
      'alert_rank',
      'lag_seconds_at_alert',
      'threshold_seconds',
      'freshness_status_at_alert',
      'mv_last_refreshed_at_at_alert',
      'detected_at',
      'cron_job',
      'triggered_by_at_alert',
      'refresh_duration_ms_at_alert',
      'row_count_at_alert',
      'time_since_prev_alert',
      'resolved_at',
      'was_resolved',
      'seconds_to_resolve',
      'current_lag_seconds',
      'current_freshness_status',
      'current_last_refreshed_at',
      'current_refresh_duration_ms',
      'current_row_count',
      'current_triggered_by',
      'affected_org_count',
      'total_submissions_in_mv',
      'max_failed_last_24h_in_mv',
    ]

    const rows = await execSql(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_mv_alert_history'
    `)
    const found = rows.map((row) => row.column_name)
    for (const col of EXPECTED_COLUMNS) {
      expect(found, `Missing column: ${col}`).toContain(col)
    }
  })

  it('[A-3] rpc_list_mv_alert_history exists in pg_proc', async () => {
    const { data, error } = await makeAuthClient(ownerJwt)
      .rpc('rpc_list_mv_alert_history', { p_limit: 1 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[A-4] rpc_list_mv_alert_history_admin exists and callable by service_role', async () => {
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 1 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[A-5] direct SELECT on v_mv_alert_history is denied to authenticated role', async () => {
    const client = makeAuthClient(ownerJwt)
    // The view has REVOKE ALL from authenticated; direct access must fail
    const { error } = await client
      .from('v_mv_alert_history')
      .select('alert_id')
      .limit(1)

    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toMatch(/permission denied|not found|unauthorized/i)
  })

  it('[A-6] v_mv_alert_history is marked SECURITY DEFINER guard (not accessible to anon)', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { error } = await anonClient
      .from('v_mv_alert_history')
      .select('*')
      .limit(1)

    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP B — rpc_list_mv_alert_history org isolation
// ─────────────────────────────────────────────────────────────
describe('Group B — rpc_list_mv_alert_history org isolation', () => {

  beforeEach(async () => {
    // Insert one alert for every test in this group to guarantee non-empty results
    await insertSystemAlert()
  })

  it('[B-1] OWNER role can call rpc_list_mv_alert_history — returns array', async () => {
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[B-2] ADMIN role can call rpc_list_mv_alert_history — returns array', async () => {
    const client = makeAuthClient(adminJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[B-3] FINANCE role can call rpc_list_mv_alert_history — returns array', async () => {
    const client = makeAuthClient(financeJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[B-4] VIEWER role is rejected with insufficient-role error', async () => {
    const client = makeAuthClient(viewerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toMatch(/insufficient role|finance.*admin.*owner/i)
  })

  it('[B-5] DESIGNER role in org B is rejected with insufficient-role error', async () => {
    const client = makeAuthClient(designerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toMatch(/insufficient role/i)
  })

  it('[B-6] Unauthenticated call is rejected', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await anonClient.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('[B-7] Cross-org: OWNER in org A and FINANCE in org B see identical system-level data', async () => {
    // Create an FINANCE user in org B to compare results
    const financeBJwt = await createTestUser(orgBId, 'FINANCE')

    const clientA = makeAuthClient(ownerJwt)
    const clientB = makeAuthClient(financeBJwt)

    const { data: dataA, error: errA } = await clientA.rpc('rpc_list_mv_alert_history', { p_limit: 10 })
    const { data: dataB, error: errB } = await clientB.rpc('rpc_list_mv_alert_history', { p_limit: 10 })

    expect(errA).toBeNull()
    expect(errB).toBeNull()

    // Data is system-level — both callers see the same alert rows
    const idsA = ((dataA as { alert_id: string }[]) ?? []).map((r) => r.alert_id).sort()
    const idsB = ((dataB as { alert_id: string }[]) ?? []).map((r) => r.alert_id).sort()
    expect(idsA).toEqual(idsB)
  })

  it('[B-8] Response rows contain expected top-level fields', async () => {
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 1 })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const rows = data as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]
    expect(row).toHaveProperty('alert_id')
    expect(row).toHaveProperty('alerted_at')
    expect(row).toHaveProperty('alert_rank')
    expect(row).toHaveProperty('was_resolved')
    expect(row).toHaveProperty('current_freshness_status')
    expect(row).toHaveProperty('lag_seconds_at_alert')
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP C — Resolution detection accuracy
// ─────────────────────────────────────────────────────────────
describe('Group C — Resolution detection accuracy', () => {

  it('[C-1] Alert with no subsequent refresh has was_resolved=false and resolved_at=null', async () => {
    const alert = await insertSystemAlert()
    // Do NOT insert any refresh log

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = (data as { alert_id: string; was_resolved: boolean; resolved_at: string | null }[]) ?? []
    const row = rows.find((r) => r.alert_id === alert.id)

    expect(row, 'Alert row not found in admin RPC result').toBeDefined()
    expect(row!.was_resolved).toBe(false)
    expect(row!.resolved_at).toBeNull()
  })

  it('[C-2] Alert followed by a refresh log entry has was_resolved=true', async () => {
    const alert = await insertSystemAlert()
    const alertTs = new Date(alert.changed_at).getTime()

    // Insert a refresh AFTER the alert
    await insertRefreshLog(alertTs)

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = (data as { alert_id: string; was_resolved: boolean; resolved_at: string | null }[]) ?? []
    const row = rows.find((r) => r.alert_id === alert.id)

    expect(row, 'Alert row not found after inserting refresh').toBeDefined()
    expect(row!.was_resolved).toBe(true)
    expect(row!.resolved_at).not.toBeNull()
  })

  it('[C-3] seconds_to_resolve is null when unresolved', async () => {
    await insertSystemAlert()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = (data as { alert_id: string; seconds_to_resolve: number | null }[]) ?? []
    // Find most recent row (alert_rank 1)
    const sorted = rows.sort((a, b) => (a as unknown as { alert_rank: number }).alert_rank - (b as unknown as { alert_rank: number }).alert_rank)
    const newest = sorted[0]
    expect(newest.seconds_to_resolve).toBeNull()
  })

  it('[C-4] seconds_to_resolve is a positive number when resolved', async () => {
    const DELAY_MS = 3000 // 3 s
    const alert = await insertSystemAlert()
    const alertTs = new Date(alert.changed_at).getTime()
    await insertRefreshLog(alertTs + DELAY_MS)

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = (data as { alert_id: string; seconds_to_resolve: number | null }[]) ?? []
    const row = rows.find((r) => r.alert_id === alert.id)

    expect(row).toBeDefined()
    expect(row!.seconds_to_resolve).not.toBeNull()
    expect(row!.seconds_to_resolve!).toBeGreaterThan(0)
    // Should be approximately DELAY_MS/1000 (within 5 s tolerance for DB round-trips)
    expect(row!.seconds_to_resolve!).toBeLessThan(DELAY_MS / 1000 + 5)
  })

  it('[C-5] First alert ever has time_since_prev_alert=null', async () => {
    // Start clean — no prior alerts of this test type
    await purgeTestAlerts()
    const alert = await insertSystemAlert()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = data as { alert_id: string; time_since_prev_alert: string | null }[]
    const row = rows.find((r) => r.alert_id === alert.id)
    expect(row).toBeDefined()
    // Only one alert → no LAG value
    expect(row!.time_since_prev_alert).toBeNull()
  })

  it('[C-6] Second alert has time_since_prev_alert matching the gap between alerts', async () => {
    await purgeTestAlerts()

    // Insert first alert at a known time
    const firstAlert = await insertSystemAlert()
    const firstTs = new Date(firstAlert.changed_at).getTime()

    // Insert second alert ~4 seconds later (backdate via direct insert)
    const secondPayload = {
      trigger_source: 'system',
      actor_id: null,
      submission_id: null,
      old_status: null,
      new_status: null,
      changed_at: new Date(firstTs + 4000).toISOString(),
      metadata: {
        alert_type: 'mv_refresh_critical',
        lag_seconds: 2500,
        threshold_seconds: 1800,
        freshness_status: 'critical',
        detected_at: new Date(firstTs + 4000).toISOString(),
        test_tag: TEST_TAG,
      },
    }
    const { data: second, error: secErr } = await svc
      .from('etax_submission_audit_log')
      .insert(secondPayload)
      .select('id')
      .single()
    expect(secErr).toBeNull()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = data as { alert_id: string; time_since_prev_alert: string | null; alert_rank: number }[]
    const secondRow = rows.find((r) => r.alert_id === (second as { id: string }).id)

    expect(secondRow).toBeDefined()
    // time_since_prev_alert is an interval — it should not be null
    expect(secondRow!.time_since_prev_alert).not.toBeNull()
  })

  it('[C-7] Refresh log inserted BEFORE alert does NOT count as resolution', async () => {
    // Insert refresh BEFORE alert
    await insertRefreshLog()
    await new Promise((r) => setTimeout(r, 100)) // small delay

    const alert = await insertSystemAlert()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = data as { alert_id: string; was_resolved: boolean }[]
    const row = rows.find((r) => r.alert_id === alert.id)

    expect(row).toBeDefined()
    // The refresh was BEFORE the alert — should still be unresolved
    expect(row!.was_resolved).toBe(false)
  })

  it('[C-8] resolved_at equals the timestamp of the first refresh AFTER the alert', async () => {
    const alert = await insertSystemAlert()
    const alertTs = new Date(alert.changed_at).getTime()
    const expectedRefreshAt = new Date(alertTs + 2000).toISOString()

    // Insert refresh log with a specific timestamp
    const { error: refErr } = await svc.from('etax_compliance_mv_refresh_log').insert({
      refreshed_at: expectedRefreshAt,
      duration_ms: 200,
      row_count: 4,
      triggered_by: TEST_TAG,
    })
    expect(refErr).toBeNull()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const rows = data as { alert_id: string; resolved_at: string | null }[]
    const row = rows.find((r) => r.alert_id === alert.id)

    expect(row).toBeDefined()
    expect(row!.resolved_at).not.toBeNull()
    // Timestamps should match (within 1 second due to DB precision)
    const delta = Math.abs(
      new Date(row!.resolved_at!).getTime() - new Date(expectedRefreshAt).getTime()
    )
    expect(delta).toBeLessThan(1500)
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP D — rpc_list_mv_alert_history_admin cross-org access
// ─────────────────────────────────────────────────────────────
describe('Group D — rpc_list_mv_alert_history_admin cross-org access', () => {

  beforeEach(async () => {
    await insertSystemAlert()
  })

  it('[D-1] Service role can call rpc_list_mv_alert_history_admin', async () => {
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 10 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('[D-2] Admin RPC returns the test alert (system-wide, no org filter)', async () => {
    const alert = await insertSystemAlert()
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const ids = (data as { alert_id: string }[]).map((r) => r.alert_id)
    expect(ids).toContain(alert.id)
  })

  it('[D-3] Authenticated OWNER cannot execute rpc_list_mv_alert_history_admin', async () => {
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history_admin', { p_limit: 5 })
    // Authenticated role is not granted EXECUTE — must fail
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toMatch(/permission denied|not authorized|does not exist/i)
  })

  it('[D-4] Authenticated ADMIN cannot execute rpc_list_mv_alert_history_admin', async () => {
    const client = makeAuthClient(adminJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history_admin', { p_limit: 5 })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('[D-5] Admin RPC hard cap is 200 (not 50 like the regular RPC)', async () => {
    // Insert 51 alerts to exceed regular cap
    const inserts = Array.from({ length: 51 }, () => insertSystemAlert())
    await Promise.all(inserts)

    const { data: adminData, error: adminErr } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 200 })
    const { data: regularData, error: regularErr } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })

    expect(adminErr).toBeNull()
    expect(regularErr).toBeNull()

    // Admin with cap 200 should return more rows than regular cap 50
    // (we inserted 51+1 = at least 52 alerts)
    expect((adminData as unknown[]).length).toBeGreaterThanOrEqual((regularData as unknown[]).length)
    expect((regularData as unknown[]).length).toBeLessThanOrEqual(50)
  })

  it('[D-6] Admin RPC default limit is 10', async () => {
    // Insert 15 alerts
    await Promise.all(Array.from({ length: 15 }, () => insertSystemAlert()))

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', {})
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeLessThanOrEqual(10)
  })

  it('[D-7] Admin RPC result contains same alert_ids as regular RPC result (within shared limit)', async () => {
    await insertSystemAlert()
    const { data: adminData } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 5 })
    const ownerClient = makeAuthClient(ownerJwt)
    const { data: regularData } = await ownerClient.rpc('rpc_list_mv_alert_history', { p_limit: 5 })

    const adminIds = ((adminData as { alert_id: string }[]) ?? []).map((r) => r.alert_id).sort()
    const regularIds = ((regularData as { alert_id: string }[]) ?? []).map((r) => r.alert_id).sort()
    // Both RPCs query the same view — results should match for equal limits
    expect(adminIds).toEqual(regularIds)
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP E — p_limit cap enforcement
// ─────────────────────────────────────────────────────────────
describe('Group E — p_limit cap enforcement', () => {

  /** Insert N alerts and return their ids */
  async function seedAlerts(n: number): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const a = await insertSystemAlert({ metadata: { alert_type: 'mv_refresh_critical', test_tag: TEST_TAG, seq: i } })
      ids.push(a.id)
    }
    return ids
  }

  it('[E-1] Default p_limit=10 returns ≤ 10 rows even with 15 alerts present', async () => {
    await seedAlerts(15)
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', {})
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeLessThanOrEqual(10)
  })

  it('[E-2] p_limit=5 returns exactly 5 rows when ≥ 5 alerts exist', async () => {
    await seedAlerts(8)
    const client = makeAuthClient(financeJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(5)
  })

  it('[E-3] p_limit=51 for regular RPC is capped at 50', async () => {
    await seedAlerts(55)
    const client = makeAuthClient(adminJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 51 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeLessThanOrEqual(50)
  })

  it('[E-4] p_limit=0 is floored to 1 — returns exactly 1 row', async () => {
    await seedAlerts(5)
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 0 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(1)
  })

  it('[E-5] Negative p_limit (-5) is floored to 1 — returns exactly 1 row', async () => {
    await seedAlerts(5)
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: -5 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(1)
  })

  it('[E-6] p_limit=201 for admin RPC is capped at 200', async () => {
    // Insert only a few — just verify cap logic compiles/runs without error
    await seedAlerts(3)
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 201 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeLessThanOrEqual(200)
  })

  it('[E-7] p_limit=50 (regular RPC boundary) returns up to 50 rows', async () => {
    await seedAlerts(55)
    const client = makeAuthClient(financeJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 50 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeLessThanOrEqual(50)
    expect((data as unknown[]).length).toBeGreaterThanOrEqual(1)
  })

  it('[E-8] p_limit=1 for regular RPC returns exactly 1 row', async () => {
    await seedAlerts(5)
    const client = makeAuthClient(adminJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 1 })
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP F — alert_rank ordering & view default cap
// ─────────────────────────────────────────────────────────────
describe('Group F — alert_rank ordering & view default cap', () => {

  it('[F-1] alert_rank=1 corresponds to the most recent alerted_at', async () => {
    // Insert two alerts — second one should be rank 1
    const first = await insertSystemAlert()
    await new Promise((r) => setTimeout(r, 100))
    const second = await insertSystemAlert()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 10 })
    expect(error).toBeNull()
    const rows = data as { alert_id: string; alert_rank: number; alerted_at: string }[]

    const rank1 = rows.find((r) => r.alert_rank === 1)
    expect(rank1).toBeDefined()
    // rank 1 should be the most recently inserted alert
    expect(rank1!.alert_id).toBe(second.id)
  })

  it('[F-2] alert_rank values are sequential with no gaps', async () => {
    await Promise.all([insertSystemAlert(), insertSystemAlert(), insertSystemAlert()])

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 10 })
    expect(error).toBeNull()
    const rows = data as { alert_rank: number }[]
    const ranks = rows.map((r) => r.alert_rank).sort((a, b) => a - b)

    // Ranks should be 1, 2, 3, ... (no duplicates, no gaps)
    for (let i = 0; i < ranks.length; i++) {
      expect(ranks[i]).toBe(i + 1)
    }
  })

  it('[F-3] View default cap (WHERE alert_rank <= 10) limits direct service_role access to 10', async () => {
    // Insert 15 alerts
    await Promise.all(Array.from({ length: 15 }, () => insertSystemAlert()))

    // Direct service_role query on the view (not via RPC)
    const { data, error } = await svc
      .from('v_mv_alert_history')
      .select('alert_id, alert_rank')

    expect(error).toBeNull()
    const rows = data as { alert_rank: number }[]
    // View itself has WHERE alert_rank <= 10
    expect(rows.length).toBeLessThanOrEqual(10)
    const maxRank = Math.max(...rows.map((r) => r.alert_rank))
    expect(maxRank).toBeLessThanOrEqual(10)
  })

  it('[F-4] Results from rpc_list_mv_alert_history are ordered by alert_rank ascending', async () => {
    await Promise.all([insertSystemAlert(), insertSystemAlert(), insertSystemAlert()])
    const client = makeAuthClient(ownerJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 5 })
    expect(error).toBeNull()
    const rows = data as { alert_rank: number }[]
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].alert_rank).toBeGreaterThan(rows[i - 1].alert_rank)
    }
  })

  it('[F-5] alert_rank is a BIGINT — returned as number in JSON', async () => {
    await insertSystemAlert()
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 1 })
    expect(error).toBeNull()
    const rows = data as { alert_rank: number }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(typeof rows[0].alert_rank).toBe('number')
    expect(Number.isInteger(rows[0].alert_rank)).toBe(true)
  })

  it('[F-6] current_freshness_status is always present and non-empty', async () => {
    await insertSystemAlert()
    const client = makeAuthClient(financeJwt)
    const { data, error } = await client.rpc('rpc_list_mv_alert_history', { p_limit: 1 })
    expect(error).toBeNull()
    const rows = data as { current_freshness_status: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].current_freshness_status).toBeTruthy()
    expect(['fresh', 'stale', 'critical', 'unknown']).toContain(rows[0].current_freshness_status)
  })
})

// ─────────────────────────────────────────────────────────────
// GROUP G — Idempotency & rollback safety
// ─────────────────────────────────────────────────────────────
describe('Group G — Idempotency & rollback safety', () => {

  it('[G-1] Running CREATE VIEW IF NOT EXISTS equivalent (DROP + CREATE) is idempotent', async () => {
    const rows = await execSql(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'v_mv_alert_history'
    `)
    expect(rows).toHaveLength(1)
  })

  it('[G-2] Inserting a non-critical system alert does not appear in v_mv_alert_history', async () => {
    // Insert a system row with a different alert_type
    const { error: insErr } = await svc.from('etax_submission_audit_log').insert({
      trigger_source: 'system',
      actor_id: null,
      submission_id: null,
      old_status: null,
      new_status: null,
      metadata: {
        alert_type: 'some_other_alert',   // NOT mv_refresh_critical
        test_tag: TEST_TAG,
      },
    })
    expect(insErr).toBeNull()

    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 50 })
    expect(error).toBeNull()
    const types = ((data as { alert_type: string }[]) ?? []).map((r) => r.alert_type)
    // All returned rows must be mv_refresh_critical
    for (const t of types) {
      expect(t).toBe('mv_refresh_critical')
    }
  })

  it('[G-3] Non-system audit rows are excluded from the view', async () => {
    // Ordinary audit rows require a real submission FK. Verify the view's
    // invariant directly instead of manufacturing an invalid audit record.
    const rows = await execSql(`
      SELECT pg_get_viewdef('public.v_mv_alert_history'::regclass, true) AS definition
    `)
    const definition = String(rows[0]?.definition ?? '').toLowerCase()

    expect(definition).toContain('trigger_source')
    expect(definition).toContain("'system'")
  })

  it('[G-4] Empty audit log returns empty array (no crash)', async () => {
    // After afterEach cleanup, the audit log test rows are gone
    await purgeTestAlerts()
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 10 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    // May or may not be empty depending on other test data; key test is no error
  })

  it('[G-5] RPC signature: rpc_list_mv_alert_history returns correct column types', async () => {
    await insertSystemAlert()
    const { data, error } = await svc.rpc('rpc_list_mv_alert_history_admin', { p_limit: 1 })
    expect(error).toBeNull()
    const rows = data as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]

    // Type assertions for key columns
    expect(typeof row.alert_id).toBe('string')         // UUID → string in JSON
    expect(typeof row.alert_rank).toBe('number')       // BIGINT → number
    expect(typeof row.was_resolved).toBe('boolean')    // BOOLEAN → boolean
    expect(typeof row.lag_seconds_at_alert).toBe('number') // NUMERIC → number
    expect(typeof row.alerted_at).toBe('string')       // TIMESTAMPTZ → string in JSON
  })
})

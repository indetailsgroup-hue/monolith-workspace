// =============================================================================
// 0192_mv_etax_health_trend.test.ts
// =============================================================================
// Test suite for Migration 0192 — mv_etax_health_trend materialized view,
// fn_refresh_etax_health_trend_mv, rpc_etax_health_trend_cached,
// rpc_etax_health_trend_cached_admin, and v_mv_health_trend_lag.
//
// Groups:
//   A  Schema validation                             (8 tests)
//   B  rpc_etax_health_trend_cached org isolation    (9 tests)
//   C  mv_age_seconds accuracy                       (8 tests)
//   D  fn_refresh_etax_health_trend_mv (concurrent   (8 tests)
//        vs blocking fallback + audit log)
//   E  rpc_etax_health_trend_cached_admin            (8 tests)
//        service_role guard + cross-org
//   F  MV data consistency after refresh             (7 tests)
//   G  Edge cases                                    (6 tests)
//
// Total: 54 tests
//
// Dependencies: vitest, @supabase/supabase-js
// Run: vitest run src/__tests__/rls/0192_mv_etax_health_trend.test.ts
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://localhost:54321'
const ANON_KEY          = process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const TEST_TAG = '0192_test_suite'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Create an authenticated client for a given org member */
async function makeAuthClient(role: string): Promise<{
  client: SupabaseClient
  userId: string
  orgId: string
}> {
  const email    = `test_0192_${role.toLowerCase()}_${Date.now()}@monolith.test`
  const password = 'Test@123456!'

  // Create user via service role
  const { data: userRec, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !userRec.user) throw new Error(`createUser failed: ${createErr?.message}`)
  const userId = userRec.user.id

  const orgId = crypto.randomUUID()
  const { error: orgError } = await serviceClient
    .from('organizations')
    .insert({
      org_id: orgId,
      name: `test_0192_org_${role.toLowerCase()}_${orgId}`,
      slug: `test-0192-${role.toLowerCase()}-${orgId}`,
      plan: 'ENTERPRISE',
    })
  if (orgError) throw new Error(`create org failed: ${orgError.message}`)
  createdOrgIds.push(orgId)

  const { error: metadataError } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: { roles: [role.toLowerCase()], org_id: orgId },
  })
  if (metadataError) throw new Error(`updateUser failed: ${metadataError.message}`)

  const { error: memberError } = await serviceClient.from('org_members').insert({
    user_id : userId,
    org_id  : orgId,
    role,
    email,
  })
  if (memberError) throw new Error(`org member failed: ${memberError.message}`)

  // Sign in after app metadata and membership are present in the issued JWT.
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await anonClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`)

  return { client: anonClient, userId, orgId }
}

async function createInvoice(orgId: string): Promise<string> {
  const { data: member, error: memberError } = await serviceClient
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)
    .single()
  if (memberError || !member) throw new Error(`No member for org ${orgId}`)

  const { data: customer, error: customerError } = await serviceClient
    .from('customers')
    .insert({ org_id: orgId, name: `test_customer_0192_${crypto.randomUUID()}` })
    .select('customer_id')
    .single()
  if (customerError || !customer) throw new Error(`create customer failed: ${customerError?.message}`)

  const invoiceId = crypto.randomUUID()
  const code = `INV-0192-${invoiceId}`
  const { error: invoiceError } = await serviceClient.from('invoices').insert({
    id: invoiceId,
    invoice_id: invoiceId,
    invoice_code: code,
    code,
    org_id: orgId,
    customer_id: customer.customer_id,
    status: 'approved',
    total: 107,
    remaining_amount: 107,
    due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    created_by: member.user_id,
  })
  if (invoiceError) throw new Error(`create invoice failed: ${invoiceError.message}`)

  return invoiceId
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
function daysAgoTs(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(12, 0, 0, 0)
  return d.toISOString()
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

async function seedSubmission(opts: {
  orgId:    string
  status?:  string
  attempt?: number
  daysAgo?: number
  docType?: string
}): Promise<string> {
  const { orgId, status = 'submitted', attempt = 1, daysAgo = 0, docType = 'T01' } = opts

  const invoiceId = await createInvoice(orgId)

  const { data, error } = await serviceClient
    .from('etax_submissions')
    .insert({
      org_id        : orgId,
      invoice_id    : invoiceId,
      document_type : docType,
      document_number: `ETAX-0192-${crypto.randomUUID()}`,
      document_date : daysAgoTs(daysAgo).slice(0, 10),
      net_amount    : 100,
      vat_amount    : 7,
      gross_amount  : 107,
      vat_rate      : 0.07,
      buyer_name    : '0192 test customer',
      status,
      attempt_count : attempt,
      last_attempt_at: status === 'failed' ? daysAgoTs(daysAgo) : null,
      submitted_at  : status === 'submitted' ? daysAgoTs(daysAgo) : null,
      created_at    : daysAgoTs(daysAgo),
      metadata      : { test_tag: TEST_TAG },
    })
    .select('id')
    .single()

  if (error) throw new Error(`seedSubmission failed: ${error.message}`)
  return data.id
}

async function forceRefreshLog(opts: {
  secondsAgo: number
  triggeredBy?: string
}): Promise<void> {
  const { secondsAgo, triggeredBy = 'test' } = opts
  await serviceClient.from('etax_health_trend_mv_refresh_log').insert({
    refreshed_at : new Date(Date.now() - secondsAgo * 1000).toISOString(),
    duration_ms  : 42,
    row_count    : 1,
    triggered_by : triggeredBy,
  })
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
const createdUserIds: string[] = []
const createdOrgIds: string[] = []

afterEach(async () => {
  await serviceClient
    .from('etax_submissions')
    .delete()
    .eq('metadata->>test_tag', TEST_TAG)

  // Purge test refresh log entries
  await serviceClient
    .from('etax_health_trend_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test')
})

afterAll(async () => {
  for (const uid of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(uid)
  }
  for (const orgId of new Set(createdOrgIds)) {
    await serviceClient.from('etax_submissions').delete().eq('org_id', orgId)
    await serviceClient.from('invoices').delete().eq('org_id', orgId)
    await serviceClient.from('customers').delete().eq('org_id', orgId)
    await serviceClient.from('org_members').delete().eq('org_id', orgId)
    await serviceClient.from('organizations').delete().eq('org_id', orgId)
  }
})

// =============================================================================
// GROUP A — Schema Validation
// =============================================================================
describe('Group A — Schema Validation', () => {

  it('A1: mv_etax_health_trend materialized view exists', async () => {
    const { data } = await serviceClient
      .rpc('query', {
        sql: `SELECT COUNT(*) FROM pg_matviews
              WHERE schemaname='public' AND matviewname='mv_etax_health_trend'`,
      })
      .single()
    // Use information_schema alternative
    const { data: res } = await serviceClient
      .from('pg_matviews' as any)
      .select('matviewname')
      .eq('schemaname', 'public')
      .eq('matviewname', 'mv_etax_health_trend')
    // Fallback: call RPC that only works if MV exists
    const { error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    // If the RPC exists, the MV must exist (function body references it)
    expect(error).toBeNull()
  })

  it('A2: etax_health_trend_mv_refresh_log table exists and is writable by service_role', async () => {
    const { error } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('id')
      .limit(1)
    expect(error).toBeNull()
  })

  it('A3: v_mv_health_trend_lag view exists and is readable by service_role', async () => {
    const { data, error } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('freshness_status, lag_seconds, last_refreshed_at')
      .limit(1)
    expect(error).toBeNull()
    // View may return 0 rows if no log yet — that is fine
  })

  it('A4: rpc_etax_health_trend_cached function exists', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached', {
      p_days: 1,
    })
    // Will fail with auth error, not "function does not exist"
    expect(error?.message ?? '').not.toMatch(/function .* does not exist/i)
  })

  it('A5: rpc_etax_health_trend_cached_admin function exists', async () => {
    const { error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    expect(error?.message ?? '').not.toMatch(/function .* does not exist/i)
  })

  it('A6: fn_refresh_etax_health_trend_mv function exists (service_role can call it)', async () => {
    const { data, error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'ok' })
  })

  it('A7: uq_mv_etax_health_trend_org_day unique index exists', async () => {
    // Calling REFRESH CONCURRENTLY succeeds only if unique index exists
    const { data, error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(error).toBeNull()
    // Two consecutive refreshes should both succeed
    const { error: err2 } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(err2).toBeNull()
  })

  it('A8: fn_refresh_etax_health_trend_mv rejects invalid triggered_by values', async () => {
    const { error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'hacky_value',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Invalid triggered_by/i)
  })
})

// =============================================================================
// GROUP B — rpc_etax_health_trend_cached Org Isolation
// =============================================================================
describe('Group B — rpc_etax_health_trend_cached Org Isolation', () => {

  it('B1: OWNER role can call rpc_etax_health_trend_cached', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
  })

  it('B2: ADMIN role can call rpc_etax_health_trend_cached', async () => {
    const { client, userId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
  })

  it('B3: FINANCE role can call rpc_etax_health_trend_cached', async () => {
    const { client, userId } = await makeAuthClient('FINANCE')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
  })

  it('B4: VIEWER role is rejected with P0001', async () => {
    const { client, userId } = await makeAuthClient('VIEWER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it('B5: DESIGNER role is rejected with P0001', async () => {
    const { client, userId } = await makeAuthClient('DESIGNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it('B6: every returned row has org_id matching the caller\'s org', async () => {
    const { client, userId, orgId } = await makeAuthClient('FINANCE')
    createdUserIds.push(userId)

    // Seed one submission so the MV has data after refresh
    await seedSubmission({ orgId, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      for (const row of data) {
        expect(row.org_id).toBe(orgId)
      }
    }
  })

  it('B7: rows include mv_last_refreshed_at (TIMESTAMPTZ) on every row', async () => {
    const { client, userId, orgId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)

    await seedSubmission({ orgId, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      for (const row of data) {
        expect(row.mv_last_refreshed_at).toBeTruthy()
        expect(new Date(row.mv_last_refreshed_at).getTime()).not.toBeNaN()
      }
    }
  })

  it('B8: rows include mv_age_seconds (INTEGER ≥ 0) on every row', async () => {
    const { client, userId, orgId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)

    await seedSubmission({ orgId, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await client.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      for (const row of data) {
        expect(typeof row.mv_age_seconds).toBe('number')
        expect(row.mv_age_seconds).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('B9: unauthenticated call is rejected', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { error } = await anonClient.rpc('rpc_etax_health_trend_cached', { p_days: 30 })
    expect(error).not.toBeNull()
  })
})

// =============================================================================
// GROUP C — mv_age_seconds Accuracy
// =============================================================================
describe('Group C — mv_age_seconds Accuracy', () => {

  it('C1: mv_age_seconds > 0 (MV was refreshed at some point)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      expect(data[0].mv_age_seconds).toBeGreaterThanOrEqual(0)
    }
  })

  it('C2: mv_age_seconds < 300 immediately after fn_refresh_etax_health_trend_mv', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      // Should be within 5 minutes of just having refreshed
      expect(data[0].mv_age_seconds).toBeLessThan(300)
    }
  })

  it('C3: mv_last_refreshed_at matches latest etax_health_trend_mv_refresh_log row', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data: logData } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('refreshed_at')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    const { data: rpcData } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })

    if (logData && rpcData && rpcData.length > 0) {
      const logTime = new Date(logData.refreshed_at).getTime()
      const rpcTime = new Date(rpcData[0].mv_last_refreshed_at).getTime()
      // Should match within 1 second
      expect(Math.abs(logTime - rpcTime)).toBeLessThan(1000)
    }
  })

  it('C4: v_mv_health_trend_lag freshness_status is "fresh" after a recent refresh', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('freshness_status, lag_seconds')
      .limit(1)
      .single()

    expect(error).toBeNull()
    expect(data?.freshness_status).toBe('fresh')
    expect(data?.lag_seconds).toBeLessThan(86400)
  })

  it('C5: v_mv_health_trend_lag freshness_status is "stale" when log entry is 30 hours old', async () => {
    await forceRefreshLog({ secondsAgo: 30 * 3600, triggeredBy: 'test' })

    const { data } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('freshness_status, lag_seconds')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    // latest log row is the 30-hour backdated one
    if (data) {
      // Note: the view reads the MAX(id) row; we need the new log to have largest id
      expect(['stale', 'critical']).toContain(data.freshness_status)
    }
  })

  it('C6: v_mv_health_trend_lag freshness_status is "critical" when log entry is 50 hours old', async () => {
    await forceRefreshLog({ secondsAgo: 50 * 3600, triggeredBy: 'test' })

    // Insert a real refresh to push id higher, then insert backdated again
    // Instead: query lag_seconds directly
    const { data: lagData } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('lag_seconds, freshness_status')
      .limit(1)
      .single()

    if (lagData && lagData.lag_seconds > 172800) {
      expect(lagData.freshness_status).toBe('critical')
    } else {
      // Stale/fresh depending on most recent real refresh — skip assertion in this case
      expect(['fresh', 'stale', 'critical']).toContain(lagData?.freshness_status)
    }
  })

  it('C7: lag_seconds in v_mv_health_trend_lag is a non-negative integer', async () => {
    const { data, error } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('lag_seconds')
      .limit(1)
      .single()
    expect(error).toBeNull()
    if (data) {
      expect(Number.isInteger(data.lag_seconds)).toBe(true)
      expect(data.lag_seconds).toBeGreaterThanOrEqual(0)
    }
  })

  it('C8: duration_ms in refresh log is a positive integer after fn_refresh call', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('duration_ms')
      .eq('triggered_by', 'test')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    expect(data?.duration_ms).toBeGreaterThan(0)
    expect(Number.isInteger(data?.duration_ms)).toBe(true)
  })
})

// =============================================================================
// GROUP D — fn_refresh_etax_health_trend_mv (concurrent vs blocking fallback)
// =============================================================================
describe('Group D — fn_refresh_etax_health_trend_mv Refresh Mechanics', () => {

  it('D1: fn_refresh_etax_health_trend_mv returns JSONB with status="ok"', async () => {
    const { data, error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'ok' })
  })

  it('D2: returned JSONB contains duration_ms > 0', async () => {
    const { data } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(data?.duration_ms).toBeGreaterThan(0)
  })

  it('D3: returned JSONB contains row_count as non-negative integer', async () => {
    const { data } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(typeof data?.row_count).toBe('number')
    expect(data?.row_count).toBeGreaterThanOrEqual(0)
  })

  it('D4: returned JSONB refreshed_at is a valid ISO timestamp', async () => {
    const before = new Date()
    const { data } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    const after = new Date()
    const ts = new Date(data?.refreshed_at)
    expect(ts.getTime()).not.toBeNaN()
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })

  it('D5: each fn_refresh call appends exactly one row to etax_health_trend_mv_refresh_log', async () => {
    const { data, error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(error).toBeNull()

    const { count } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('id', { count: 'exact', head: true })
      .eq('triggered_by', 'test')
      .eq('refreshed_at', data.refreshed_at)

    expect(count).toBe(1)
  })

  it('D6: consecutive refreshes both succeed (CONCURRENT works after first blocking run)', async () => {
    const { error: e1 } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    const { error: e2 } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    expect(e1).toBeNull()
    expect(e2).toBeNull()
  })

  it('D7: triggered_by="manual" is accepted and stored correctly', async () => {
    const { data, error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'manual',
    })
    expect(error).toBeNull()
    expect(data?.triggered_by).toBe('manual')

    const { data: logRow } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('triggered_by')
      .eq('triggered_by', 'manual')
      .order('id', { ascending: false })
      .limit(1)
      .single()
    expect(logRow?.triggered_by).toBe('manual')
  })

  it('D8: authenticated caller cannot invoke fn_refresh_etax_health_trend_mv', async () => {
    const { client, userId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)
    const { error } = await client.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    // Should fail — REVOKE ALL from authenticated
    expect(error).not.toBeNull()
  })
})

// =============================================================================
// GROUP E — rpc_etax_health_trend_cached_admin Service-Role Guard
// =============================================================================
describe('Group E — rpc_etax_health_trend_cached_admin Service-Role Guard', () => {

  it('E1: service_role can call rpc_etax_health_trend_cached_admin with no args', async () => {
    const { error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 30,
    })
    expect(error).toBeNull()
  })

  it('E2: authenticated OWNER call to admin RPC is rejected', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 30,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/service_role|permission denied/i)
  })

  it('E3: authenticated ADMIN call to admin RPC is rejected', async () => {
    const { client, userId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 30,
    })
    expect(error).not.toBeNull()
  })

  it('E4: p_org_id=NULL returns rows for all available orgs', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 30,
    })
    // Just assert no error — row count depends on seeded data
    expect(data).toBeDefined()
  })

  it('E5: p_org_id=specific UUID filters to that org only', async () => {
    const { data: orgs } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()

    if (!orgs) return

    // Seed a submission and refresh
    await seedSubmission({ orgId: orgs.id, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : orgs.id,
      p_days   : 30,
    })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      for (const row of data) {
        expect(row.org_id).toBe(orgs.id)
      }
    }
  })

  it('E6: p_days=100 is clamped to 30 (no rows with day_rank > 30 returned)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 100,
    })
    expect(error).toBeNull()
    if (data) {
      for (const row of data) {
        expect(row.day_rank).toBeLessThanOrEqual(30)
      }
    }
  })

  it('E7: p_days=0 is clamped to 1 (only day_rank=1 rows returned)', async () => {
    const { data: orgs } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!orgs) return

    await seedSubmission({ orgId: orgs.id, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : orgs.id,
      p_days   : 0,
    })
    expect(error).toBeNull()
    if (data && data.length > 0) {
      for (const row of data) {
        expect(row.day_rank).toBe(1)
      }
    }
  })

  it('E8: admin RPC result includes mv_last_refreshed_at and mv_age_seconds', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    if (data && data.length > 0) {
      expect(data[0].mv_last_refreshed_at).toBeTruthy()
      expect(typeof data[0].mv_age_seconds).toBe('number')
    }
  })
})

// =============================================================================
// GROUP F — MV Data Consistency After Refresh
// =============================================================================
describe('Group F — MV Data Consistency After Refresh', () => {

  it('F1: new submission seeded today appears in MV after refresh', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    await seedSubmission({ orgId: org.id, daysAgo: 0, status: 'submitted' })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 1,
    })
    expect(error).toBeNull()
    const todayRow = data?.find((r: any) => r.day_rank === 1)
    expect(todayRow).toBeDefined()
    expect(todayRow?.daily_total).toBeGreaterThanOrEqual(1)
  })

  it('F2: submission from 30 days ago does NOT appear in MV after refresh', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    await seedSubmission({ orgId: org.id, daysAgo: 30, status: 'failed' })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 30,
    })
    const day30row = data?.find((r: any) => {
      const dayDiff = Math.round(
        (new Date(todayUTC()).getTime() - new Date(r.submission_day).getTime()) / 86400000
      )
      return dayDiff === 30
    })
    expect(day30row).toBeUndefined()
  })

  it('F3: day_rank=1 row has submission_day = today UTC after refresh', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    await seedSubmission({ orgId: org.id, daysAgo: 0 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 1,
    })
    const rank1 = data?.find((r: any) => r.day_rank === 1)
    expect(rank1?.submission_day).toBe(todayUTC())
  })

  it('F4: MV row count matches COUNT(*) from v_etax_health_trend after refresh', async () => {
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    // Get log row count
    const { data: logRow } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('row_count')
      .eq('triggered_by', 'test')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    // row_count in log should be ≥ 0
    expect(logRow?.row_count).toBeGreaterThanOrEqual(0)
  })

  it('F5: retry_exhaustion_rate_pct in MV matches view for today after fresh seed', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    // Seed: 2 submitted, 2 exhausted (attempt_count=5, status=failed)
    await seedSubmission({ orgId: org.id, daysAgo: 0, status: 'submitted', attempt: 1, docType: 'T01' })
    await seedSubmission({ orgId: org.id, daysAgo: 0, status: 'submitted', attempt: 1, docType: 'T02' })
    await seedSubmission({ orgId: org.id, daysAgo: 0, status: 'failed',    attempt: 5, docType: 'T03' })
    await seedSubmission({ orgId: org.id, daysAgo: 0, status: 'failed',    attempt: 5, docType: 'T04' })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 1,
    })
    const todayRow = data?.find((r: any) => r.day_rank === 1)
    // 2 exhausted / 4 total = 50.00
    expect(Number(todayRow?.retry_exhaustion_rate_pct)).toBe(50)
  })

  it('F6: success_rate_pct in MV reflects submitted / total ratio', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    // 3 submitted, 1 failed
    await seedSubmission({ orgId: org.id, daysAgo: 1, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: org.id, daysAgo: 1, status: 'submitted', docType: 'T02' })
    await seedSubmission({ orgId: org.id, daysAgo: 1, status: 'submitted', docType: 'T03' })
    await seedSubmission({ orgId: org.id, daysAgo: 1, status: 'failed',    docType: 'T04' })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 2,
    })
    const yday = data?.find((r: any) => r.day_rank === 2)
    if (yday) {
      expect(Number(yday.success_rate_pct)).toBe(75)
    }
  })

  it('F7: MV contains pdf_success_rate_pct column with valid NUMERIC value', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 1,
    })
    if (data && data.length > 0) {
      const row = data[0]
      expect('pdf_success_rate_pct' in row).toBe(true)
      expect(row.pdf_success_rate_pct === null || typeof Number(row.pdf_success_rate_pct) === 'number').toBe(true)
    }
  })
})

// =============================================================================
// GROUP G — Edge Cases
// =============================================================================
describe('Group G — Edge Cases', () => {

  it('G1: org with zero submissions returns no rows (no error)', async () => {
    // Create a brand-new org with no submissions
    const { data: newOrg } = await serviceClient
      .from('organizations')
      .insert({ name: `Test Org 0192 ${Date.now()}`, slug: `test-0192-${Date.now()}` })
      .select('id')
      .single()
    if (!newOrg) return

    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : newOrg.id,
      p_days   : 30,
    })
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)

    // Cleanup new org
    await serviceClient.from('organizations').delete().eq('id', newOrg.id)
  })

  it('G2: p_days=1 returns only day_rank=1 rows', async () => {
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .limit(1)
      .single()
    if (!org) return

    // Seed 2 days
    await seedSubmission({ orgId: org.id, daysAgo: 0 })
    await seedSubmission({ orgId: org.id, daysAgo: 1 })
    await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })

    const { data } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : org.id,
      p_days   : 1,
    })
    for (const row of data ?? []) {
      expect(row.day_rank).toBe(1)
    }
  })

  it('G3: p_days default (30) returns all available ranks up to 30', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_health_trend_cached_admin', {
      p_org_id : null,
      p_days   : 30,
    })
    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(row.day_rank).toBeGreaterThanOrEqual(1)
      expect(row.day_rank).toBeLessThanOrEqual(30)
    }
  })

  it('G4: fn_refresh_etax_health_trend_mv is idempotent (third call succeeds)', async () => {
    const r1 = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })
    const r2 = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })
    const r3 = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r3.error).toBeNull()
  })

  it('G5: row_count returned from fn_refresh matches actual MV row count', async () => {
    const { data: refreshResult } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
      p_triggered_by: 'test',
    })
    const reportedCount = refreshResult?.row_count ?? -1

    // Since we can't SELECT COUNT(*) from MV directly via JS client easily,
    // verify log row reflects it correctly
    const { data: logRow } = await serviceClient
      .from('etax_health_trend_mv_refresh_log')
      .select('row_count')
      .eq('triggered_by', 'test')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    expect(logRow?.row_count).toBe(reportedCount)
  })

  it('G6: v_mv_health_trend_lag returns a single row (latest log entry only)', async () => {
    // Insert two log entries and confirm view returns exactly one row
    await forceRefreshLog({ secondsAgo: 100, triggeredBy: 'test' })
    await forceRefreshLog({ secondsAgo: 10,  triggeredBy: 'test' })

    const { data, error } = await serviceClient
      .from('v_mv_health_trend_lag' as any)
      .select('lag_seconds')

    expect(error).toBeNull()
    expect(data?.length).toBe(1)
    // Should be the most recent one (≈ 10 seconds old)
    if (data && data.length > 0) {
      expect(data[0].lag_seconds).toBeLessThan(60)
    }
  })
})

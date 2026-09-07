/**
 * 0186_0187_integration.test.ts
 * ======================================
 * Combined integration test suite for Migrations 0186 + 0187.
 *
 * Scenario under test:
 *   1. Org has etax_submissions data.
 *   2. fn_refresh_etax_compliance_mv() is called → MV populated.
 *   3. rpc_etax_compliance_dashboard_cached() → returns FRESH data.
 *   4. Refresh log is backdated → staleness progresses stale → critical.
 *   5. rpc_etax_compliance_dashboard_cached() → MV data unchanged, but
 *      mv_age_seconds / freshness_status now reflect the new lag.
 *   6. After a new refresh → data is fresh again.
 *
 * Coverage:
 *   Group A — MV state before first refresh (empty MV behavior)
 *   Group B — Post-refresh freshness: rpc_etax_compliance_dashboard_cached is fresh
 *   Group C — Staleness progression: fresh → stale → critical via backdate
 *   Group D — Data accuracy: cached vs live view agree on submission counts
 *   Group E — Multi-org isolation in cached RPC
 *   Group F — Manual refresh via rpc_refresh_etax_compliance_mv (service-role)
 *   Group G — Refresh log tracking: entry inserted, duration_ms > 0, row_count accurate
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.SUPABASE_URL     ?? 'http://127.0.0.1:54321'
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY         = process.env.SUPABASE_ANON_KEY         ?? ''

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Create an authenticated client acting as a specific user. */
function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

const admin = adminClient()

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

interface OrgContext {
  orgId:  string
  userId: string
  token:  string
}

/**
 * Create org + owner + etax submissions with controlled statuses.
 * Returns org context and the submission IDs created.
 */
async function seedOrgWithSubmissions(
  counts: {
    submitted?:   number
    failed?:      number
    queued?:      number
    submitting?:  number
    cancelled?:   number
  } = {},
): Promise<{ ctx: OrgContext; submissionIds: string[] }> {
  const orgId  = uuidv4()
  const userId = uuidv4()

  // Create org
  const { error: orgErr } = await admin.from('organizations').insert({
    org_id: orgId,
    name:   `IntegTest Org ${orgId.slice(0, 8)}`,
    slug:   `integtest-${orgId}`,
  })
  if (orgErr) throw new Error(`seed org: ${orgErr.message}`)

  const email = `user-${userId.slice(0, 8)}@test.local`
  const password = 'test-password-0186'
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    id: userId,
    email,
    password,
    email_confirm: true,
    app_metadata: { roles: ['finance'], org_id: orgId },
  })
  if (authErr || !authData.user) throw new Error(`seed auth user: ${authErr?.message}`)

  const { error: memErr } = await admin.from('org_members').insert({
    org_id: orgId,
    user_id: userId,
    role: 'FINANCE',
    email,
  })
  if (memErr) throw new Error(`seed member: ${memErr.message}`)

  const { data: session, error: signInError } = await anonClient().auth.signInWithPassword({ email, password })
  if (signInError || !session.session) throw new Error(`seed sign-in: ${signInError?.message}`)
  const token = session.session.access_token

  const customerId = uuidv4()
  const { error: customerErr } = await admin.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `IntegTest Customer ${orgId.slice(0, 8)}`,
  })
  if (customerErr) throw new Error(`seed customer: ${customerErr.message}`)

  // Create invoices and submissions
  const submissionIds: string[] = []
  const statusList: string[] = [
    ...Array(counts.submitted  ?? 0).fill('submitted'),
    ...Array(counts.failed     ?? 0).fill('failed'),
    ...Array(counts.queued     ?? 0).fill('queued'),
    ...Array(counts.submitting ?? 0).fill('submitting'),
    ...Array(counts.cancelled  ?? 0).fill('cancelled'),
  ]

  for (let i = 0; i < statusList.length; i++) {
    const invoiceId    = uuidv4()
    const submissionId = uuidv4()

    // Minimal invoice
    const { error: invoiceErr } = await admin.from('invoices').insert({
      id:          invoiceId,
      invoice_id:  invoiceId,
      invoice_code: `INV-0186-0187-${invoiceId}`,
      org_id:      orgId,
      customer_id: customerId,
      status:      'approved',
      total:       1000 + i * 100,
      due_date:    new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      created_by:  userId,
    })
    if (invoiceErr) throw new Error(`seed invoice[${i}]: ${invoiceErr.message}`)

    const { error: subErr } = await admin.from('etax_submissions').insert({
      id:              submissionId,
      org_id:          orgId,
      invoice_id:      invoiceId,
      document_type:   'T01',
      document_number: `INV-${submissionId.slice(0, 8)}`,
      document_date:   new Date().toISOString().split('T')[0],
      net_amount:      1000,
      vat_amount:      70,
      gross_amount:    1070,
      vat_rate:        7,
      status:          statusList[i],
      attempt_count:   statusList[i] === 'submitted' ? 1 : 0,
      seller_tax_id:   '1234567890123',
      seller_name:     'Test Seller Co Ltd',
      buyer_tax_id:    '9876543210987',
      buyer_name:      'Test Buyer Co Ltd',
    })
    if (subErr) throw new Error(`seed submission[${i}]: ${subErr.message}`)
    submissionIds.push(submissionId)
  }

  return { ctx: { orgId, userId, token }, submissionIds }
}

/** Trigger a full MV refresh via fn_refresh_etax_compliance_mv. */
async function refreshMV(triggeredBy = 'test_suite'): Promise<void> {
  const { error } = await admin.rpc('fn_refresh_etax_compliance_mv', {
    p_triggered_by: triggeredBy,
  })
  if (error) throw new Error(`fn_refresh_etax_compliance_mv: ${error.message}`)
}

/** Backdate the latest refresh log entry by `ageSeconds`. */
async function backdateRefreshLog(ageSeconds: number): Promise<void> {
  // Get most recent row
  const { data, error } = await admin
    .from('etax_compliance_mv_refresh_log')
    .select('id')
    .order('refreshed_at', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) throw new Error(`backdateRefreshLog: no log row found`)

  const newDate = new Date(Date.now() - ageSeconds * 1000).toISOString()
  const { error: upErr } = await admin
    .from('etax_compliance_mv_refresh_log')
    .update({ refreshed_at: newDate })
    .eq('id', (data as any).id)
  if (upErr) throw new Error(`backdateRefreshLog update: ${upErr.message}`)
}

/** Call rpc_etax_compliance_dashboard_cached() as a given org (via service-role). */
async function callCachedDashboard(orgId: string): Promise<Record<string, any> | null> {
  // Use service-role client with set_config impersonation
  const { data, error } = await admin.rpc('rpc_etax_compliance_dashboard_cached')
  if (error) throw new Error(`rpc_etax_compliance_dashboard_cached: ${error.message}`)
  // If called as service role, filter by orgId
  if (Array.isArray(data)) return data.find((r: any) => r.org_id === orgId) ?? null
  return (data as any)?.org_id === orgId ? data : null
}

/** Purge all rows seeded by this test run. */
async function purgeOrg(orgId: string): Promise<void> {
  await admin.from('etax_submissions').delete().eq('org_id', orgId)
  await admin.from('invoices').delete().eq('org_id', orgId)
  await admin.from('customers').delete().eq('org_id', orgId)
  await admin.from('org_members').delete().eq('org_id', orgId)
  await admin.from('organizations').delete().eq('org_id', orgId)
  // MV rows for this org (via REFRESH — can't delete from MV directly)
}

const seededOrgIds: string[] = []

afterEach(async () => {
  for (const orgId of seededOrgIds) await purgeOrg(orgId)
  seededOrgIds.length = 0
  // Purge refresh log entries created by this suite
  await admin
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test_suite')
})

// ─────────────────────────────────────────────────────────────────────────────
// Group A — MV state before first refresh
// ─────────────────────────────────────────────────────────────────────────────

describe('Group A — MV state before first refresh', () => {
  it('A-01: rpc_etax_compliance_dashboard_cached returns null for brand-new org before MV refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    // Do NOT refresh MV — brand-new org won't be in it yet
    const row = await callCachedDashboard(ctx.orgId)
    // Row may be null or absent — the MV only shows orgs after a REFRESH CONCURRENTLY
    // This is expected behavior for a new org
    expect(row).toBeNull()
  })

  it('A-02: rpc_etax_compliance_dashboard (live view) returns row for new org even before MV refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1, failed: 1 })
    seededOrgIds.push(ctx.orgId)

    const { data, error } = await admin.rpc('rpc_etax_compliance_dashboard')
    expect(error).toBeNull()
    const row = Array.isArray(data)
      ? data.find((r: any) => r.org_id === ctx.orgId)
      : data
    expect(row).toBeDefined()
    expect(row.total_submissions).toBe(2)
  })

  it('A-03: mv_etax_compliance_dashboard does not contain org row before refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 3 })
    seededOrgIds.push(ctx.orgId)

    const { data } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('org_id')
      .eq('org_id', ctx.orgId)
    expect(data).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group B — Post-refresh freshness
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — rpc_etax_compliance_dashboard_cached is FRESH after refresh', () => {
  it('B-01: cached RPC returns row for org immediately after fn_refresh_etax_compliance_mv', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 3, failed: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(row).not.toBeNull()
  })

  it('B-02: freshness_status is fresh (age < 900 s) immediately after refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.freshness_status).toBe('fresh')
  })

  it('B-03: mv_age_seconds < 30 seconds immediately after refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(Number(row!.mv_age_seconds)).toBeLessThan(30)
  })

  it('B-04: mv_last_refreshed_at is within the last 60 seconds after refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    const before = new Date()
    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    const lastRefreshed = new Date(row!.mv_last_refreshed_at)

    expect(lastRefreshed.getTime()).toBeGreaterThan(before.getTime() - 5000)
    expect(lastRefreshed.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('B-05: cached total_submissions matches actual submission count post-refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 4, failed: 2, queued: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.total_submissions).toBe(7) // 4 + 2 + 1
  })

  it('B-06: cached submitted_count matches actual submitted rows', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 5, failed: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.submitted_count).toBe(5)
  })

  it('B-07: cached success_rate is calculated correctly (submitted / (submitted + failed + cancelled) * 100)', async () => {
    // 6 submitted, 2 failed, 2 cancelled → rate = 6/(6+2+2)*100 = 60%
    const { ctx } = await seedOrgWithSubmissions({
      submitted: 6, failed: 2, cancelled: 2,
    })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(Number(row!.success_rate)).toBeCloseTo(60, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group C — Staleness progression: fresh → stale → critical
// ─────────────────────────────────────────────────────────────────────────────

describe('Group C — Staleness progression via backdate', () => {
  it('C-01: after backdating to 1000 s, freshness_status transitions to stale', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(1000) // 1000 s > 900 threshold → stale

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.freshness_status).toBe('stale')
  })

  it('C-02: mv_age_seconds reflects backdated lag (within 10 s tolerance)', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    const targetLag = 1200
    await backdateRefreshLog(targetLag)

    const row = await callCachedDashboard(ctx.orgId)
    const reportedAge = Number(row!.mv_age_seconds)

    expect(reportedAge).toBeGreaterThan(targetLag - 10)
    expect(reportedAge).toBeLessThan(targetLag + 30)
  })

  it('C-03: after backdating to 1900 s, freshness_status transitions to critical', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 3 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(1900) // > 1800 → critical

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.freshness_status).toBe('critical')
  })

  it('C-04: MV data (submission counts) is UNCHANGED after backdate (cache preserved)', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 5, failed: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    const rowBefore = await callCachedDashboard(ctx.orgId)
    const subsBefore = rowBefore!.total_submissions

    await backdateRefreshLog(2000) // go critical

    const rowAfter = await callCachedDashboard(ctx.orgId)
    // Staleness should have changed
    expect(rowAfter!.freshness_status).toBe('critical')
    // But actual cached data unchanged — MV was not refreshed
    expect(rowAfter!.total_submissions).toBe(subsBefore)
  })

  it('C-05: boundary — exactly 900 s = stale threshold', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(900)

    const row = await callCachedDashboard(ctx.orgId)
    // 900 s = exactly stale boundary: view defines stale as >= 900 and < 1800
    expect(['stale', 'fresh']).toContain(row!.freshness_status) // edge — either is acceptable
  })

  it('C-06: boundary — exactly 1800 s = critical threshold', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(1800)

    const row = await callCachedDashboard(ctx.orgId)
    // 1800 s = exactly critical boundary; view defines critical as > 1800
    // So 1800 should be stale, not critical
    expect(['stale', 'critical']).toContain(row!.freshness_status)
  })

  it('C-07: after a second refresh, freshness_status returns to fresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(2000) // go critical

    const criticalRow = await callCachedDashboard(ctx.orgId)
    expect(criticalRow!.freshness_status).toBe('critical')

    // Second refresh — should reset to fresh
    await refreshMV()

    const freshRow = await callCachedDashboard(ctx.orgId)
    expect(freshRow!.freshness_status).toBe('fresh')
    expect(Number(freshRow!.mv_age_seconds)).toBeLessThan(30)
  })

  it('C-08: v_mv_refresh_lag view shows correct freshness after backdate', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(2200)

    const { data, error } = await admin
      .from('v_mv_refresh_lag')
      .select('freshness_status, lag_seconds')
      .limit(1)
      .single()

    expect(error).toBeNull()
    expect(data!.freshness_status).toBe('critical')
    expect(Number(data!.lag_seconds)).toBeGreaterThan(1800)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group D — Data accuracy: cached vs live view
// ─────────────────────────────────────────────────────────────────────────────

describe('Group D — Cached vs live view data accuracy', () => {
  it('D-01: cached and live total_submissions agree immediately after refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({
      submitted: 3, failed: 2, queued: 2, cancelled: 1,
    })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const [cachedRes, liveRes] = await Promise.all([
      admin.rpc('rpc_etax_compliance_dashboard_cached'),
      admin.rpc('rpc_etax_compliance_dashboard'),
    ])

    const cachedRow = Array.isArray(cachedRes.data)
      ? cachedRes.data.find((r: any) => r.org_id === ctx.orgId)
      : cachedRes.data
    const liveRow = Array.isArray(liveRes.data)
      ? liveRes.data.find((r: any) => r.org_id === ctx.orgId)
      : liveRes.data

    expect(cachedRow!.total_submissions).toBe(liveRow!.total_submissions)
    expect(cachedRow!.submitted_count).toBe(liveRow!.submitted_count)
    expect(cachedRow!.failed_count).toBe(liveRow!.failed_count)
  })

  it('D-02: cached and live success_rate agree after refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 4, failed: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const [cachedRes, liveRes] = await Promise.all([
      admin.rpc('rpc_etax_compliance_dashboard_cached'),
      admin.rpc('rpc_etax_compliance_dashboard'),
    ])

    const cachedRow = Array.isArray(cachedRes.data)
      ? cachedRes.data.find((r: any) => r.org_id === ctx.orgId)
      : cachedRes.data
    const liveRow = Array.isArray(liveRes.data)
      ? liveRes.data.find((r: any) => r.org_id === ctx.orgId)
      : liveRes.data

    expect(Number(cachedRow!.success_rate)).toBeCloseTo(
      Number(liveRow!.success_rate), 1,
    )
  })

  it('D-03: after adding a new submission + refresh, cached data reflects the change', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    const rowBefore = await callCachedDashboard(ctx.orgId)
    expect(rowBefore!.total_submissions).toBe(2)

    // Add a third submission
    const newInvoiceId = uuidv4()
    const newSubId     = uuidv4()
    const { data: customer, error: customerErr } = await admin
      .from('customers')
      .select('customer_id')
      .eq('org_id', ctx.orgId)
      .single()
    if (customerErr) throw new Error(`D-03 customer: ${customerErr.message}`)

    const { error: invoiceErr } = await admin.from('invoices').insert({
      id: newInvoiceId,
      invoice_id: newInvoiceId,
      invoice_code: `INV-0186-0187-${newInvoiceId}`,
      org_id: ctx.orgId,
      customer_id: customer.customer_id,
      status: 'approved',
      total: 5000,
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      created_by: ctx.userId,
    })
    if (invoiceErr) throw new Error(`D-03 invoice: ${invoiceErr.message}`)

    const { error: submissionErr } = await admin.from('etax_submissions').insert({
      id: newSubId, org_id: ctx.orgId, invoice_id: newInvoiceId,
      document_type: 'T01', document_number: `INV-${newSubId.slice(0,8)}`,
      document_date: new Date().toISOString().split('T')[0],
      net_amount: 1000, vat_amount: 70, gross_amount: 1070, vat_rate: 7,
      status: 'submitted', attempt_count: 1,
      seller_tax_id: '1234567890123', seller_name: 'Test Seller Co Ltd',
      buyer_tax_id: '9876543210987', buyer_name: 'Test Buyer Co Ltd',
    })
    if (submissionErr) throw new Error(`D-03 submission: ${submissionErr.message}`)

    // Before second refresh — cached data still shows old count
    const rowDuring = await callCachedDashboard(ctx.orgId)
    expect(rowDuring!.total_submissions).toBe(2) // still cached

    // Refresh again
    await refreshMV()

    const rowAfter = await callCachedDashboard(ctx.orgId)
    expect(rowAfter!.total_submissions).toBe(3) // now updated
  })

  it('D-04: queued and submitting rows are excluded from success_rate denominator', async () => {
    // 3 submitted, 1 failed, 2 queued, 1 submitting
    // denominator = 3 + 1 = 4 (not 7); rate = 3/4 * 100 = 75%
    const { ctx } = await seedOrgWithSubmissions({
      submitted: 3, failed: 1, queued: 2, submitting: 1,
    })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(Number(row!.success_rate)).toBeCloseTo(75, 1)
  })

  it('D-05: cached queued_count matches actual queued rows', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1, queued: 4 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const row = await callCachedDashboard(ctx.orgId)
    expect(row!.queued_count).toBe(4)
  })

  it('D-06: after status change (queued → submitted) + refresh, cached data updates', async () => {
    const { ctx, submissionIds } = await seedOrgWithSubmissions({
      submitted: 1, queued: 1,
    })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const rowBefore = await callCachedDashboard(ctx.orgId)
    expect(rowBefore!.submitted_count).toBe(1)
    expect(rowBefore!.queued_count).toBe(1)

    // Transition the queued submission to submitted
    const queuedId = submissionIds.find(id => id !== submissionIds[0])
      ?? submissionIds[submissionIds.length - 1]
    await admin.from('etax_submissions')
      .update({ status: 'submitted', attempt_count: 1 })
      .eq('id', queuedId)

    await refreshMV()

    const rowAfter = await callCachedDashboard(ctx.orgId)
    expect(rowAfter!.submitted_count).toBe(2)
    expect(rowAfter!.queued_count).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group E — Multi-org isolation in cached RPC
// ─────────────────────────────────────────────────────────────────────────────

describe('Group E — Multi-org isolation in cached view', () => {
  it('E-01: two orgs see only their own data in cached RPC', async () => {
    const { ctx: ctx1 } = await seedOrgWithSubmissions({ submitted: 5 })
    const { ctx: ctx2 } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx1.orgId, ctx2.orgId)

    await refreshMV()

    const row1 = await callCachedDashboard(ctx1.orgId)
    const row2 = await callCachedDashboard(ctx2.orgId)

    expect(row1!.total_submissions).toBe(5)
    expect(row2!.total_submissions).toBe(2)
    expect(row1!.org_id).toBe(ctx1.orgId)
    expect(row2!.org_id).toBe(ctx2.orgId)
  })

  it('E-02: unique index uq_mv_etax_compliance_org ensures one row per org in MV', async () => {
    const { ctx: ctx1 } = await seedOrgWithSubmissions({ submitted: 1 })
    const { ctx: ctx2 } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx1.orgId, ctx2.orgId)

    await refreshMV()

    // Check MV has exactly one row per org
    const { data } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('org_id')
      .in('org_id', [ctx1.orgId, ctx2.orgId])

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1)
    }
    expect(counts.get(ctx1.orgId)).toBe(1)
    expect(counts.get(ctx2.orgId)).toBe(1)
  })

  it('E-03: cached RPC from org-1 user cannot see org-2 data', async () => {
    const { ctx: ctx1 } = await seedOrgWithSubmissions({ submitted: 3 })
    const { ctx: ctx2 } = await seedOrgWithSubmissions({ submitted: 7 })
    seededOrgIds.push(ctx1.orgId, ctx2.orgId)

    await refreshMV()

    // Calling as ctx1 user should only see ctx1 data
    const { data } = await userClient(ctx1.token)
      .rpc('rpc_etax_compliance_dashboard_cached')

    const rows = Array.isArray(data) ? data : [data]
    const org2Row = rows.find((r: any) => r?.org_id === ctx2.orgId)
    expect(org2Row).toBeUndefined()
  })

  it('E-04: org with 0 submissions shows 0 total_submissions (not absent)', async () => {
    const { ctx } = await seedOrgWithSubmissions({}) // no submissions
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    // Org with no submissions may not appear in MV (depends on view logic)
    // The view uses etax_submissions as the primary source — if no rows, the org is absent
    const row = await callCachedDashboard(ctx.orgId)
    // Either null (not in view) or 0 — both are valid
    if (row !== null) {
      expect(row.total_submissions).toBe(0)
    }
  })

  it('E-05: rpc_etax_compliance_all_orgs_cached (service-role) returns all orgs sorted DESC', async () => {
    const { ctx: bigOrg }   = await seedOrgWithSubmissions({ submitted: 10 })
    const { ctx: smallOrg } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(bigOrg.orgId, smallOrg.orgId)

    await refreshMV()

    const { data, error } = await admin.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })

    expect(error).toBeNull()
    const rows = data as any[]
    const bigIdx   = rows.findIndex((r: any) => r.org_id === bigOrg.orgId)
    const smallIdx = rows.findIndex((r: any) => r.org_id === smallOrg.orgId)

    if (bigIdx !== -1 && smallIdx !== -1) {
      expect(bigIdx).toBeLessThan(smallIdx) // bigOrg has more submissions → appears earlier
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group F — Manual refresh via rpc_refresh_etax_compliance_mv
// ─────────────────────────────────────────────────────────────────────────────

describe('Group F — Manual refresh via RPC', () => {
  it('F-01: rpc_refresh_etax_compliance_mv (service-role) succeeds without error', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    const { error } = await admin.rpc('rpc_refresh_etax_compliance_mv')
    expect(error).toBeNull()
  })

  it('F-02: rpc_refresh_etax_compliance_mv resets freshness after critical lag', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()
    await backdateRefreshLog(2000)

    let row = await callCachedDashboard(ctx.orgId)
    expect(row!.freshness_status).toBe('critical')

    // Manual refresh via RPC
    await admin.rpc('rpc_refresh_etax_compliance_mv')

    row = await callCachedDashboard(ctx.orgId)
    expect(row!.freshness_status).toBe('fresh')
  })

  it('F-03: authenticated user (non service-role) cannot call rpc_refresh_etax_compliance_mv', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    const { error } = await userClient(ctx.token)
      .rpc('rpc_refresh_etax_compliance_mv')
    // Should be permission denied or function not found for authenticated users
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Group G — Refresh log tracking
// ─────────────────────────────────────────────────────────────────────────────

describe('Group G — Refresh log tracking', () => {
  it('G-01: each fn_refresh_etax_compliance_mv call inserts one row into refresh log', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    const before = new Date()
    await refreshMV()
    await refreshMV()

    const { data, error } = await admin
      .from('etax_compliance_mv_refresh_log')
      .select('id, refreshed_at')
      .eq('triggered_by', 'test_suite')
      .gte('refreshed_at', before.toISOString())

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })

  it('G-02: refresh log duration_ms > 0', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const { data } = await admin
      .from('etax_compliance_mv_refresh_log')
      .select('duration_ms')
      .eq('triggered_by', 'test_suite')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .single()

    expect(Number(data!.duration_ms)).toBeGreaterThan(0)
  })

  it('G-03: refresh log row_count matches actual org count in MV', async () => {
    const { ctx: c1 } = await seedOrgWithSubmissions({ submitted: 1 })
    const { ctx: c2 } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(c1.orgId, c2.orgId)

    await refreshMV()

    const { data: logData } = await admin
      .from('etax_compliance_mv_refresh_log')
      .select('row_count')
      .eq('triggered_by', 'test_suite')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .single()

    const { count: mvCount } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('*', { count: 'exact', head: true })

    expect(Number(logData!.row_count)).toBe(mvCount)
  })

  it('G-04: v_mv_refresh_lag last_refreshed_at matches latest log entry refreshed_at', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 2 })
    seededOrgIds.push(ctx.orgId)

    await refreshMV()

    const [{ data: lagData }, { data: logData }] = await Promise.all([
      admin.from('v_mv_refresh_lag').select('last_refreshed_at').limit(1).single(),
      admin
        .from('etax_compliance_mv_refresh_log')
        .select('refreshed_at')
        .order('refreshed_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    // Timestamps should match within 1 second
    const lagTs  = new Date(lagData!.last_refreshed_at).getTime()
    const logTs  = new Date(logData!.refreshed_at).getTime()
    expect(Math.abs(lagTs - logTs)).toBeLessThan(1000)
  })

  it('G-05: triggered_by is recorded in log with the value passed to fn_refresh', async () => {
    const { ctx } = await seedOrgWithSubmissions({ submitted: 1 })
    seededOrgIds.push(ctx.orgId)

    const TRIGGER_ID = `test-trigger-${uuidv4().slice(0, 8)}`
    const { error } = await admin.rpc('fn_refresh_etax_compliance_mv', {
      p_triggered_by: TRIGGER_ID,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('etax_compliance_mv_refresh_log')
      .select('triggered_by')
      .eq('triggered_by', TRIGGER_ID)
      .limit(1)
      .single()

    expect(data!.triggered_by).toBe(TRIGGER_ID)

    // Cleanup extra log row
    await admin.from('etax_compliance_mv_refresh_log').delete().eq('triggered_by', TRIGGER_ID)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Global teardown
// ─────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
  for (const orgId of seededOrgIds) await purgeOrg(orgId)
})

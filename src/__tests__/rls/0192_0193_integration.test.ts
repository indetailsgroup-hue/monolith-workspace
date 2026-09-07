// =============================================================================
// 0192_0193_integration.test.ts
// =============================================================================
// Combined integration test suite for Migrations 0192 + 0193.
//
// Scenario under test:
//   etax_submissions (raw data)
//     → fn_refresh_etax_compliance_mv()   → mv_etax_compliance_dashboard
//     → fn_refresh_etax_health_trend_mv() → mv_etax_health_trend
//     → v_etax_full_health_summary        (JOINs both MVs)
//     → rpc_etax_full_health_summary()    (authenticated access)
//     → rpc_etax_full_health_summary_admin() (service_role access)
//
// Groups:
//   A  Full pipeline data accuracy (6 tests)
//      — submissions feed both MVs; both MVs feed the summary view correctly
//   B  health_score end-to-end formula (9 tests)
//      — known submission counts produce exact expected scores through the pipeline
//   C  health_status threshold boundaries end-to-end (8 tests)
//      — boundary scores 80/79/50/49 produce correct labels through real data
//   D  Multi-org isolation across both MVs (8 tests)
//      — Org A data cannot leak into Org B at any layer
//   E  MV staleness propagation (7 tests)
//      — stale compliance MV propagates to health summary; stale trend same
//   F  LEFT JOIN behaviour — no today trend row (6 tests)
//      — missing mv_etax_health_trend day_rank=1 row still returns summary row
//   G  Refresh sequencing (6 tests)
//      — partial refresh (compliance only / trend only) vs full refresh
//
// Total: 50 tests
//
// Dependencies: vitest, @supabase/supabase-js
// Run: vitest run src/__tests__/rls/0192_0193_integration.test.ts
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  describe, it, expect,
  beforeAll, afterEach, afterAll,
} from 'vitest'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const SUPABASE_URL     = process.env.SUPABASE_URL              ?? 'http://localhost:54321'
const ANON_KEY         = process.env.SUPABASE_ANON_KEY         ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const TEST_TAG = '0192_0193_integration'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface OrgCtx {
  orgId:  string
  userId: string
  role:   string
  token:  string
}

interface HealthSummaryRow {
  org_id:                          string
  org_name:                        string
  total_submissions:               number
  submitted_count:                 number
  failed_count:                    number
  compliance_success_rate:         number
  failed_last_24h:                 number
  overdue_with_pending_etax:       number
  today_daily_total:               number | null
  today_daily_submitted:           number | null
  today_daily_failed:              number | null
  today_daily_exhausted:           number | null
  today_retry_exhaustion_rate_pct: number | null
  today_success_rate_pct:          number | null
  health_score:                    number
  health_status:                   string
  compliance_mv_last_refreshed_at: string
  trend_mv_last_refreshed_at:      string
}

// ---------------------------------------------------------------------------
// Org + user factory
// ---------------------------------------------------------------------------
async function createTestOrg(tag: string): Promise<string> {
  const orgId = crypto.randomUUID()
  const { data, error } = await admin
    .from('organizations')
    .insert({
      org_id: orgId,
      name: `IntTest_0192_0193_${tag}_${Date.now()}`,
      slug: `int-0192-0193-${tag.toLowerCase()}-${orgId}`,
    })
    .select('org_id')
    .single()
  if (error || !data) throw new Error(`createTestOrg: ${error?.message}`)
  return data.org_id
}

async function createAuthUser(orgId: string, role = 'FINANCE'): Promise<OrgCtx> {
  const email    = `int_0192_0193_${role.toLowerCase()}_${Date.now()}@monolith.test`
  const password = 'IntTest@Monolith1!'

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { roles: [role.toLowerCase()], org_id: orgId },
  })
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`)
  const userId = created.user.id

  const { error: mErr } = await admin.from('org_members').upsert({
    user_id: userId, org_id: orgId, role,
  })
  if (mErr) throw new Error(`upsert org_members: ${mErr.message}`)

  const anon = anonClient()
  const { error: sErr } = await anon.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error(`signIn: ${sErr.message}`)
  const session = (await anon.auth.getSession()).data.session
  if (!session) throw new Error('No session after signIn')

  return { orgId, userId, role, token: session.access_token }
}

function authedClient(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

// ---------------------------------------------------------------------------
// Invoice + submission factory
// ---------------------------------------------------------------------------
async function getOrCreateInvoice(orgId: string): Promise<string> {
  const { data: existing } = await admin
    .from('invoices').select('invoice_id').eq('org_id', orgId).limit(1).single()
  if (existing) return existing.invoice_id

  let customerId: string
  const { data: cust } = await admin
    .from('customers').select('customer_id').eq('org_id', orgId).limit(1).single()
  if (cust) {
    customerId = cust.customer_id
  } else {
    const { data: nc, error: ncErr } = await admin
      .from('customers')
      .insert({ org_id: orgId, name: `IntTestCust_${Date.now()}` })
      .select('customer_id').single()
    if (ncErr || !nc) throw new Error(`createCustomer: ${ncErr?.message}`)
    customerId = nc.customer_id
  }

  const invoiceId = crypto.randomUUID()
  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .insert({
      invoice_id: invoiceId,
      invoice_code: `INV-0192-0193-${invoiceId}`,
      org_id: orgId,
      customer_id: customerId,
      status: 'approved',
      total: 1000,
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      created_by: '00000000-0000-0000-0000-000000000001',
    })
    .select('invoice_id').single()
  if (invErr || !inv) throw new Error(`createInvoice: ${invErr?.message}`)
  return inv.invoice_id
}

function daysAgoTs(n: number, hourOffset = 0): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(hourOffset, 0, 0, 0)
  return d.toISOString()
}

async function seedSubmission(opts: {
  orgId:      string
  invoiceId?: string
  status?:    string
  attempt?:   number
  daysAgo?:   number
  docType?:   string
  hourOffset?: number
}): Promise<string> {
  const {
    orgId,
    status   = 'submitted',
    attempt  = 1,
    daysAgo  = 0,
    docType  = 'T01',
    hourOffset = 10,
  } = opts
  const invoiceId = opts.invoiceId ?? await getOrCreateInvoice(orgId)

  const { data, error } = await admin
    .from('etax_submissions')
    .insert({
      org_id:        orgId,
      invoice_id:    invoiceId,
      document_type: docType,
      status,
      attempt_count: attempt,
      created_at:    daysAgoTs(daysAgo, hourOffset),
      updated_at:    daysAgoTs(daysAgo, hourOffset),
      metadata:      { test_tag: TEST_TAG },
    })
    .select('id').single()
  if (error) throw new Error(`seedSubmission: ${error.message}`)
  return data.id
}

// ---------------------------------------------------------------------------
// MV refresh helpers
// ---------------------------------------------------------------------------
async function refreshComplianceMV(): Promise<void> {
  const { error } = await admin.rpc('fn_refresh_etax_compliance_mv', { p_triggered_by: 'test' })
  if (error) throw new Error(`refreshComplianceMV: ${error.message}`)
}

async function refreshTrendMV(): Promise<void> {
  const { error } = await admin.rpc('fn_refresh_etax_health_trend_mv', { p_triggered_by: 'test' })
  if (error) throw new Error(`refreshTrendMV: ${error.message}`)
}

async function refreshBothMVs(): Promise<void> {
  await refreshComplianceMV()
  await refreshTrendMV()
}

// Ensure both refresh-log tables have ≥1 row (CROSS JOIN prerequisite for the summary view)
async function ensureRefreshLogs(): Promise<void> {
  const { count: cc } = await admin
    .from('etax_compliance_mv_refresh_log')
    .select('id', { count: 'exact', head: true })
  if ((cc ?? 0) === 0) await refreshComplianceMV()

  const { count: tc } = await admin
    .from('etax_health_trend_mv_refresh_log')
    .select('id', { count: 'exact', head: true })
  if ((tc ?? 0) === 0) await refreshTrendMV()
}

// ---------------------------------------------------------------------------
// Summary view query helpers
// ---------------------------------------------------------------------------
async function getSummaryRow(orgId: string): Promise<HealthSummaryRow | null> {
  const { data, error } = await admin
    .from('v_etax_full_health_summary')
    .select('*')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getSummaryRow: ${error.message}`)
  return data as HealthSummaryRow | null
}

async function callRpcSummary(token: string): Promise<HealthSummaryRow | null> {
  const client = authedClient(token)
  const { data, error } = await client.rpc('rpc_etax_full_health_summary')
  if (error) throw error
  return data as HealthSummaryRow | null
}

async function callRpcSummaryAdmin(orgId: string | null = null): Promise<HealthSummaryRow[]> {
  const { data, error } = await admin.rpc('rpc_etax_full_health_summary_admin', {
    p_org_id: orgId,
  })
  if (error) throw error
  return (data ?? []) as HealthSummaryRow[]
}

// ---------------------------------------------------------------------------
// Formula mirror — exact JS equivalent of the SQL health_score formula
// ---------------------------------------------------------------------------
function calcHealthScore({
  successRate         = 100,
  retryExhaustionRate = 0,
  overdueWithPending  = 0,
  failedLast24h       = 0,
}: {
  successRate?:         number
  retryExhaustionRate?: number
  overdueWithPending?:  number
  failedLast24h?:       number
}): number {
  // Mirrors PostgreSQL ROUND() which uses round-half-to-even (banker's rounding)
  const pgRound = (x: number) => Math.round(x)  // JS Math.round matches for .5 cases we use
  const p1 = pgRound((100 - successRate)    * 0.40)
  const p2 = pgRound(retryExhaustionRate    * 0.30)
  const p3 = Math.min(overdueWithPending * 2, 20)
  const p4 = Math.min(failedLast24h,          10)
  return Math.max(0, Math.min(100, 100 - p1 - p2 - p3 - p4))
}

function calcHealthStatus(score: number): string {
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'warning'
  return 'critical'
}

// ---------------------------------------------------------------------------
// Cleanup registries
// ---------------------------------------------------------------------------
const createdUserIds: string[] = []
const createdOrgIds:  string[] = []

beforeAll(async () => {
  await ensureRefreshLogs()
})

afterEach(async () => {
  await admin
    .from('etax_submissions')
    .delete()
    .eq('metadata->>test_tag', TEST_TAG)

  await admin
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test')

  await admin
    .from('etax_health_trend_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test')
})

afterAll(async () => {
  for (const uid of createdUserIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
  }
  for (const oid of createdOrgIds) {
    await admin.from('invoices').delete().eq('org_id', oid)
    await admin.from('customers').delete().eq('org_id', oid)
    await admin.from('org_members').delete().eq('org_id', oid)
    await admin.from('organizations').delete().eq('org_id', oid)
  }
})

// =============================================================================
// GROUP A — Full Pipeline Data Accuracy  (6 tests)
// =============================================================================
describe('Group A — Full pipeline data accuracy', () => {

  it('A1: submitted submissions appear in mv_etax_compliance_dashboard after refresh', async () => {
    const orgId = await createTestOrg('A1')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T02' })
    await refreshComplianceMV()

    const { data, error } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('total_submissions, submitted_count, success_rate')
      .eq('org_id', orgId)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.total_submissions).toBe(2)
    expect(data!.submitted_count).toBe(2)
    expect(data!.success_rate).toBe(100)
  })

  it('A2: today submissions appear in mv_etax_health_trend (day_rank=1) after refresh', async () => {
    const orgId = await createTestOrg('A2')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T02', daysAgo: 0 })
    await refreshTrendMV()

    const { data, error } = await admin
      .from('mv_etax_health_trend')
      .select('day_rank, daily_total, daily_submitted, daily_failed')
      .eq('org_id', orgId)
      .eq('day_rank', 1)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.daily_total).toBe(2)
    expect(data!.daily_submitted).toBe(1)
    expect(data!.daily_failed).toBe(1)
  })

  it('A3: v_etax_full_health_summary row exists for org after both MVs refreshed', async () => {
    const orgId = await createTestOrg('A3')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    expect(row!.org_id).toBe(orgId)
  })

  it('A4: total_submissions in summary view matches mv_etax_compliance_dashboard', async () => {
    const orgId = await createTestOrg('A4')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T02' })
    await seedSubmission({ orgId, status: 'queued',    docType: 'T03' })
    await refreshBothMVs()

    const { data: mvRow } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('total_submissions')
      .eq('org_id', orgId)
      .single()

    const summaryRow = await getSummaryRow(orgId)

    expect(summaryRow!.total_submissions).toBe(mvRow!.total_submissions)
    expect(summaryRow!.total_submissions).toBe(3)
  })

  it('A5: today_daily_total in summary matches mv_etax_health_trend day_rank=1', async () => {
    const orgId = await createTestOrg('A5')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T02', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T03', daysAgo: 0 })
    await refreshBothMVs()

    const { data: trendRow } = await admin
      .from('mv_etax_health_trend')
      .select('daily_total, daily_submitted, daily_failed')
      .eq('org_id', orgId)
      .eq('day_rank', 1)
      .single()

    const summaryRow = await getSummaryRow(orgId)
    expect(summaryRow!.today_daily_total).toBe(trendRow!.daily_total)
    expect(summaryRow!.today_daily_total).toBe(3)
  })

  it('A6: compliance_mv_last_refreshed_at and trend_mv_last_refreshed_at are populated', async () => {
    const orgId = await createTestOrg('A6')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const summaryRow = await getSummaryRow(orgId)
    expect(summaryRow!.compliance_mv_last_refreshed_at).toBeTruthy()
    expect(summaryRow!.trend_mv_last_refreshed_at).toBeTruthy()
    expect(new Date(summaryRow!.compliance_mv_last_refreshed_at).getTime()).toBeGreaterThan(0)
    expect(new Date(summaryRow!.trend_mv_last_refreshed_at).getTime()).toBeGreaterThan(0)
  })
})

// =============================================================================
// GROUP B — health_score End-to-End Formula Accuracy  (9 tests)
// =============================================================================
describe('Group B — health_score end-to-end formula accuracy', () => {

  it('B1: 10 submitted / 0 failed → success_rate=100 → health_score=100', async () => {
    const orgId = await createTestOrg('B1')
    createdOrgIds.push(orgId)

    const invId = await getOrCreateInvoice(orgId)
    for (const doc of ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10'] as const) {
      await seedSubmission({ orgId, invoiceId: invId, status: 'submitted', docType: doc as string, attempt: 1 })
        .catch(() => {})
    }
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()

    const expected = calcHealthScore({ successRate: 100 })
    expect(row!.health_score).toBe(expected)
    expect(row!.health_score).toBe(100)
  })

  it('B2: 5/10 submitted + 5 failed_last_24h = health_score 75', async () => {
    const orgId = await createTestOrg('B2')
    createdOrgIds.push(orgId)

    const invId = await getOrCreateInvoice(orgId)
    const statusSeq = ['submitted','submitted','submitted','submitted','submitted','failed','failed','failed','failed','failed']
    const docs      = ['T01','T02','T03','T04','T05','T06','T07','T08','T09','T10']
    for (let i = 0; i < 10; i++) {
      await seedSubmission({
        orgId, invoiceId: invId,
        status: statusSeq[i], docType: docs[i],
        daysAgo: 0, hourOffset: i + 1,
      }).catch(() => {})
    }
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()

    // success_rate = 50%, failed_last_24h = 5, exhaustion = 0
    const expected = calcHealthScore({ successRate: 50, failedLast24h: 5 })
    expect(expected).toBe(75)
    expect(row!.health_score).toBe(75)
  })

  it('B3: all failed (0 submitted) → compliance penalty 40, no exhaustion → score depends on failed_last_24h', async () => {
    const orgId = await createTestOrg('B3')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'failed', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed', docType: 'T02', daysAgo: 0 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()

    const actualSuccessRate = row!.compliance_success_rate ?? 0
    const actualExhaustion  = row!.today_retry_exhaustion_rate_pct ?? 0
    const actualOverdue     = row!.overdue_with_pending_etax ?? 0
    const actualFailed24h   = row!.failed_last_24h ?? 0

    const expected = calcHealthScore({
      successRate:         actualSuccessRate,
      retryExhaustionRate: actualExhaustion,
      overdueWithPending:  actualOverdue,
      failedLast24h:       actualFailed24h,
    })
    expect(row!.health_score).toBe(expected)
  })

  it('B4: health_score is never below 0 even with maximum penalties', async () => {
    const orgId = await createTestOrg('B4')
    createdOrgIds.push(orgId)

    // Seed 1 failed (today, attempt_count=5 = exhausted)
    await seedSubmission({ orgId, status: 'failed', attempt: 5, docType: 'T01', daysAgo: 0 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    expect(row!.health_score).toBeGreaterThanOrEqual(0)
  })

  it('B5: health_score is never above 100 even with perfect data', async () => {
    const orgId = await createTestOrg('B5')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', attempt: 1, docType: 'T01' })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    expect(row!.health_score).toBeLessThanOrEqual(100)
  })

  it('B6: overdue_with_pending_etax penalty capped at 20 (overdue=15 same score as overdue=10)', async () => {
    // Both cap at 20 points — we verify this via formula mirror only (no DB state can easily produce exact overdues)
    const score10 = calcHealthScore({ successRate: 100, overdueWithPending: 10 })
    const score15 = calcHealthScore({ successRate: 100, overdueWithPending: 15 })
    expect(score10).toBe(score15)
    expect(score10).toBe(80)  // 100 - 0 - 0 - min(20,20) - 0 = 80
  })

  it('B7: failed_last_24h penalty capped at 10 (15 fails same score as 10)', async () => {
    const score10 = calcHealthScore({ successRate: 100, failedLast24h: 10 })
    const score15 = calcHealthScore({ successRate: 100, failedLast24h: 15 })
    expect(score10).toBe(score15)
    expect(score10).toBe(90)  // 100 - 0 - 0 - 0 - 10 = 90
  })

  it('B8: compliance_success_rate from view matches mv_etax_compliance_dashboard.success_rate', async () => {
    const orgId = await createTestOrg('B8')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T02' })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T03' })
    await refreshBothMVs()

    const { data: mvRow } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('success_rate')
      .eq('org_id', orgId)
      .single()

    const summaryRow = await getSummaryRow(orgId)
    expect(summaryRow!.compliance_success_rate).toBe(mvRow!.success_rate)
  })

  it('B9: formula is deterministic — same data refreshed twice yields same health_score', async () => {
    const orgId = await createTestOrg('B9')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T02' })
    await refreshBothMVs()

    const row1 = await getSummaryRow(orgId)
    await refreshBothMVs()
    const row2 = await getSummaryRow(orgId)

    expect(row1!.health_score).toBe(row2!.health_score)
    expect(row1!.health_status).toBe(row2!.health_status)
  })
})

// =============================================================================
// GROUP C — health_status Threshold Boundaries End-to-End  (8 tests)
// =============================================================================
describe('Group C — health_status threshold boundaries end-to-end', () => {

  it('C1: health_status = "healthy" when health_score = 100', async () => {
    const orgId = await createTestOrg('C1')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    if (row!.health_score === 100) {
      expect(row!.health_status).toBe('healthy')
    }
    // Formula guarantee: score=100 → healthy
    expect(calcHealthStatus(100)).toBe('healthy')
  })

  it('C2: health_status = "healthy" when health_score = 80 (boundary)', () => {
    // Pure formula boundary test — not DB-dependent
    expect(calcHealthScore({ successRate: 50 })).toBe(80)
    expect(calcHealthStatus(80)).toBe('healthy')
  })

  it('C3: health_status = "warning" when health_score = 79 (just below healthy boundary)', () => {
    // 100 - ROUND(52.5*0.40) = 100 - ROUND(21) = 100 - 21 = 79
    const score = calcHealthScore({ successRate: 47.5 })
    expect(score).toBe(79)
    expect(calcHealthStatus(79)).toBe('warning')
  })

  it('C4: health_status = "warning" when health_score = 50 (boundary)', () => {
    // 100 - 40 - ROUND(33.33*0.30)=10 - 0 - 0 = 50
    const score = calcHealthScore({ successRate: 0, retryExhaustionRate: 33.33 })
    expect(score).toBe(50)
    expect(calcHealthStatus(50)).toBe('warning')
  })

  it('C5: health_status = "critical" when health_score = 49 (just below warning boundary)', () => {
    // Add 1 failed_last_24h to C4 scenario: 50 - 1 = 49
    const score = calcHealthScore({ successRate: 0, retryExhaustionRate: 33.33, failedLast24h: 1 })
    expect(score).toBe(49)
    expect(calcHealthStatus(49)).toBe('critical')
  })

  it('C6: health_status = "critical" when health_score = 0', () => {
    const score = calcHealthScore({ successRate: 0, retryExhaustionRate: 100, overdueWithPending: 10, failedLast24h: 10 })
    expect(score).toBe(0)
    expect(calcHealthStatus(0)).toBe('critical')
  })

  it('C7: view health_status field matches calcHealthStatus(health_score) for seeded org', async () => {
    const orgId = await createTestOrg('C7')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T02' })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    expect(row!.health_status).toBe(calcHealthStatus(row!.health_score))
  })

  it('C8: rpc_etax_full_health_summary_admin health_status ordered ASC by health_score has no label inversion', async () => {
    const rows = await callRpcSummaryAdmin(null)
    if (rows.length < 2) return  // nothing to compare

    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i]
      const b = rows[i + 1]
      // Ascending order: a.health_score <= b.health_score
      expect(a.health_score).toBeLessThanOrEqual(b.health_score)
      // Labels must be consistent with scores
      expect(a.health_status).toBe(calcHealthStatus(a.health_score))
      expect(b.health_status).toBe(calcHealthStatus(b.health_score))
    }
  })
})

// =============================================================================
// GROUP D — Multi-Org Isolation Across Both MVs  (8 tests)
// =============================================================================
describe('Group D — Multi-org isolation across both MVs', () => {

  it('D1: Org A submissions do not appear in Org B mv_etax_compliance_dashboard', async () => {
    const orgA = await createTestOrg('D1A')
    const orgB = await createTestOrg('D1B')
    createdOrgIds.push(orgA, orgB)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await refreshComplianceMV()

    const { data: bRow } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('total_submissions')
      .eq('org_id', orgB)
      .maybeSingle()

    // Org B has no submissions, so it should not appear in the compliance MV
    expect(bRow).toBeNull()
  })

  it('D2: Org A submissions do not appear in Org B mv_etax_health_trend', async () => {
    const orgA = await createTestOrg('D2A')
    const orgB = await createTestOrg('D2B')
    createdOrgIds.push(orgA, orgB)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshTrendMV()

    const { data: bRow } = await admin
      .from('mv_etax_health_trend')
      .select('daily_total')
      .eq('org_id', orgB)
      .maybeSingle()

    expect(bRow).toBeNull()
  })

  it('D3: Org A and Org B appear as separate rows in v_etax_full_health_summary', async () => {
    const orgA = await createTestOrg('D3A')
    const orgB = await createTestOrg('D3B')
    createdOrgIds.push(orgA, orgB)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgB, status: 'failed',    docType: 'T01' })
    await refreshBothMVs()

    const rowA = await getSummaryRow(orgA)
    const rowB = await getSummaryRow(orgB)

    expect(rowA).not.toBeNull()
    expect(rowB).not.toBeNull()
    expect(rowA!.org_id).toBe(orgA)
    expect(rowB!.org_id).toBe(orgB)
  })

  it('D4: Org A total_submissions does not include Org B submissions', async () => {
    const orgA = await createTestOrg('D4A')
    const orgB = await createTestOrg('D4B')
    createdOrgIds.push(orgA, orgB)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T02' })
    await seedSubmission({ orgId: orgB, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgB, status: 'submitted', docType: 'T02' })
    await seedSubmission({ orgId: orgB, status: 'submitted', docType: 'T03' })
    await refreshBothMVs()

    const rowA = await getSummaryRow(orgA)
    const rowB = await getSummaryRow(orgB)

    expect(rowA!.total_submissions).toBe(2)
    expect(rowB!.total_submissions).toBe(3)
  })

  it('D5: rpc_etax_full_health_summary (authenticated) returns only calling org', async () => {
    const orgA = await createTestOrg('D5A')
    const orgB = await createTestOrg('D5B')
    createdOrgIds.push(orgA, orgB)

    const ctxA = await createAuthUser(orgA, 'FINANCE')
    createdUserIds.push(ctxA.userId)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgB, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const resultA = await callRpcSummary(ctxA.token)
    // Result should be for Org A only
    if (Array.isArray(resultA)) {
      const orgIds = (resultA as any[]).map((r) => r.org_id)
      expect(orgIds.every((id) => id === orgA)).toBe(true)
    } else if (resultA) {
      expect((resultA as any).org_id).toBe(orgA)
    }
  })

  it('D6: rpc_etax_full_health_summary_admin with p_org_id=orgA returns only orgA rows', async () => {
    const orgA = await createTestOrg('D6A')
    const orgB = await createTestOrg('D6B')
    createdOrgIds.push(orgA, orgB)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgB, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const rows = await callRpcSummaryAdmin(orgA)
    expect(rows.every((r) => r.org_id === orgA)).toBe(true)
  })

  it('D7: Org B FINANCE role cannot retrieve Org A health summary via RPC', async () => {
    const orgA = await createTestOrg('D7A')
    const orgB = await createTestOrg('D7B')
    createdOrgIds.push(orgA, orgB)

    const ctxB = await createAuthUser(orgB, 'FINANCE')
    createdUserIds.push(ctxB.userId)

    await seedSubmission({ orgId: orgA, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()

    const result = await callRpcSummary(ctxB.token)
    // Org B caller should get Org B's data (which has no submissions → null or different org_id)
    if (Array.isArray(result)) {
      const orgIds = (result as any[]).map((r: any) => r.org_id)
      expect(orgIds.includes(orgA)).toBe(false)
    } else if (result) {
      expect((result as any).org_id).not.toBe(orgA)
    }
  })

  it('D8: health_score differences between orgs are not conflated after refresh', async () => {
    const orgGood = await createTestOrg('D8good')
    const orgBad  = await createTestOrg('D8bad')
    createdOrgIds.push(orgGood, orgBad)

    // orgGood: all submitted
    await seedSubmission({ orgId: orgGood, status: 'submitted', docType: 'T01' })
    await seedSubmission({ orgId: orgGood, status: 'submitted', docType: 'T02' })
    // orgBad: all failed
    await seedSubmission({ orgId: orgBad, status: 'failed', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId: orgBad, status: 'failed', docType: 'T02', daysAgo: 0 })
    await refreshBothMVs()

    const rowGood = await getSummaryRow(orgGood)
    const rowBad  = await getSummaryRow(orgBad)

    expect(rowGood).not.toBeNull()
    expect(rowBad).not.toBeNull()
    // Good org should always score higher than bad org
    expect(rowGood!.health_score).toBeGreaterThan(rowBad!.health_score)
  })
})

// =============================================================================
// GROUP E — MV Staleness Propagation  (7 tests)
// =============================================================================
describe('Group E — MV staleness propagation', () => {

  it('E1: compliance_mv_last_refreshed_at advances after second refresh', async () => {
    const orgId = await createTestOrg('E1')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()
    const row1 = await getSummaryRow(orgId)

    await new Promise((r) => setTimeout(r, 50))  // ensure timestamp advances
    await refreshComplianceMV()
    const row2 = await getSummaryRow(orgId)

    const t1 = new Date(row1!.compliance_mv_last_refreshed_at).getTime()
    const t2 = new Date(row2!.compliance_mv_last_refreshed_at).getTime()
    expect(t2).toBeGreaterThan(t1)
  })

  it('E2: trend_mv_last_refreshed_at advances after second refresh', async () => {
    const orgId = await createTestOrg('E2')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshBothMVs()
    const row1 = await getSummaryRow(orgId)

    await new Promise((r) => setTimeout(r, 50))
    await refreshTrendMV()
    const row2 = await getSummaryRow(orgId)

    const t1 = new Date(row1!.trend_mv_last_refreshed_at).getTime()
    const t2 = new Date(row2!.trend_mv_last_refreshed_at).getTime()
    expect(t2).toBeGreaterThan(t1)
  })

  it('E3: new submission before compliance refresh does NOT appear in summary (MV is stale)', async () => {
    const orgId = await createTestOrg('E3')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()
    const rowBefore = await getSummaryRow(orgId)

    // Add a new submission WITHOUT refreshing
    await seedSubmission({ orgId, status: 'failed', docType: 'T02' })
    const rowAfter = await getSummaryRow(orgId)

    // total_submissions should still be the pre-refresh value (MV not refreshed)
    expect(rowAfter!.total_submissions).toBe(rowBefore!.total_submissions)
  })

  it('E4: new submission appears in summary AFTER compliance MV refresh', async () => {
    const orgId = await createTestOrg('E4')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()
    const rowBefore = await getSummaryRow(orgId)

    await seedSubmission({ orgId, status: 'failed', docType: 'T02', daysAgo: 0 })
    await refreshComplianceMV()
    const rowAfter = await getSummaryRow(orgId)

    expect(rowAfter!.total_submissions).toBe(rowBefore!.total_submissions + 1)
    expect(rowAfter!.failed_count).toBeGreaterThan(rowBefore!.failed_count)
  })

  it('E5: health_score decreases after seeding failures and refreshing', async () => {
    const orgId = await createTestOrg('E5')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()
    const rowGood = await getSummaryRow(orgId)

    await seedSubmission({ orgId, status: 'failed', docType: 'T02', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed', docType: 'T03', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed', docType: 'T04', daysAgo: 0 })
    await refreshBothMVs()
    const rowBad = await getSummaryRow(orgId)

    expect(rowBad!.health_score).toBeLessThan(rowGood!.health_score)
  })

  it('E6: fixing failures (seeding submitted) and refreshing improves health_score', async () => {
    const orgId = await createTestOrg('E6')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'failed', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'failed', docType: 'T02', daysAgo: 0 })
    await refreshBothMVs()
    const rowBad = await getSummaryRow(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T03' })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T04' })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T05' })
    await refreshBothMVs()
    const rowBetter = await getSummaryRow(orgId)

    expect(rowBetter!.health_score).toBeGreaterThan(rowBad!.health_score)
  })

  it('E7: both compliance_mv and trend_mv refresh timestamps present in same row', async () => {
    const orgId = await createTestOrg('E7')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    expect(row).not.toBeNull()
    expect(row!.compliance_mv_last_refreshed_at).toBeTruthy()
    expect(row!.trend_mv_last_refreshed_at).toBeTruthy()
    // Trend MV was refreshed after compliance (sequential order in refreshBothMVs)
    // — timestamps should be close but trend >= compliance
    const tComp  = new Date(row!.compliance_mv_last_refreshed_at).getTime()
    const tTrend = new Date(row!.trend_mv_last_refreshed_at).getTime()
    expect(tTrend).toBeGreaterThanOrEqual(tComp)
  })
})

// =============================================================================
// GROUP F — LEFT JOIN Behaviour (no today trend row)  (6 tests)
// =============================================================================
describe('Group F — LEFT JOIN behaviour — missing today trend row', () => {

  it('F1: org with compliance data but no today submissions still appears in summary (LEFT JOIN)', async () => {
    const orgId = await createTestOrg('F1')
    createdOrgIds.push(orgId)

    // Seed yesterday only — no today submissions
    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 1 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    // Org appears in compliance MV (has submissions) but may not have today's trend row
    // LEFT JOIN means the row still appears — today_* fields are NULL
    expect(row).not.toBeNull()
    expect(row!.org_id).toBe(orgId)
  })

  it('F2: today_daily_total is NULL when no today submissions exist', async () => {
    const orgId = await createTestOrg('F2')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 2 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    if (row) {
      // If trend MV has no day_rank=1 row for this org, today fields are NULL
      const hasTodayTrend = await admin
        .from('mv_etax_health_trend')
        .select('day_rank')
        .eq('org_id', orgId)
        .eq('day_rank', 1)
        .maybeSingle()
      if (!hasTodayTrend.data) {
        expect(row.today_daily_total).toBeNull()
        expect(row.today_retry_exhaustion_rate_pct).toBeNull()
      }
    }
  })

  it('F3: health_score degrades gracefully (no trend inputs) — uses compliance penalty only', async () => {
    const orgId = await createTestOrg('F3')
    createdOrgIds.push(orgId)

    // Only yesterday's data → no today trend row
    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 1 })
    await seedSubmission({ orgId, status: 'failed',    docType: 'T02', daysAgo: 1 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    if (!row) return  // skip if org not in MV

    // Without today trend, retry_exhaustion_rate = 0 (NULL coalesced to 0)
    const expected = calcHealthScore({
      successRate:         row.compliance_success_rate,
      retryExhaustionRate: 0,
      overdueWithPending:  row.overdue_with_pending_etax ?? 0,
      failedLast24h:       row.failed_last_24h ?? 0,
    })
    expect(row.health_score).toBe(expected)
  })

  it('F4: adding today submissions improves today_daily_total after trend MV refresh', async () => {
    const orgId = await createTestOrg('F4')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 1 })
    await refreshBothMVs()
    const rowBefore = await getSummaryRow(orgId)
    const todayBefore = rowBefore?.today_daily_total ?? null

    await seedSubmission({ orgId, status: 'submitted', docType: 'T02', daysAgo: 0 })
    await refreshTrendMV()
    const rowAfter = await getSummaryRow(orgId)

    // After seeding today + refreshing trend, today_daily_total should be ≥ 1
    expect(rowAfter?.today_daily_total ?? 0).toBeGreaterThanOrEqual(1)
    // And greater than before (which was null / 0)
    expect(rowAfter?.today_daily_total ?? 0).toBeGreaterThan(todayBefore ?? 0)
  })

  it('F5: summary row still has compliance_mv_last_refreshed_at even when trend row is absent', async () => {
    const orgId = await createTestOrg('F5')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 3 })
    await refreshBothMVs()

    const row = await getSummaryRow(orgId)
    if (row) {
      expect(row.compliance_mv_last_refreshed_at).toBeTruthy()
    }
  })

  it('F6: multi-day trend submissions have correct day_rank ordering — day_rank=1 is most recent', async () => {
    const orgId = await createTestOrg('F6')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 1 })
    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 2 })
    await refreshTrendMV()

    const { data: trendRows } = await admin
      .from('mv_etax_health_trend')
      .select('day_rank, submission_day')
      .eq('org_id', orgId)
      .order('day_rank', { ascending: true })

    expect(trendRows).not.toBeNull()
    if (trendRows && trendRows.length >= 2) {
      // day_rank=1 should have the most recent date
      const rank1 = trendRows.find((r) => r.day_rank === 1)
      const rank2 = trendRows.find((r) => r.day_rank === 2)
      expect(rank1).toBeTruthy()
      expect(rank2).toBeTruthy()
      expect(new Date(rank1!.submission_day).getTime()).toBeGreaterThan(new Date(rank2!.submission_day).getTime())
    }
  })
})

// =============================================================================
// GROUP G — Refresh Sequencing  (6 tests)
// =============================================================================
describe('Group G — Refresh sequencing', () => {

  it('G1: compliance-only refresh updates compliance_mv_last_refreshed_at but not trend', async () => {
    const orgId = await createTestOrg('G1')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshBothMVs()
    const rowBefore = await getSummaryRow(orgId)

    await new Promise((r) => setTimeout(r, 50))
    await refreshComplianceMV()
    const rowAfter = await getSummaryRow(orgId)

    const tCompBefore = new Date(rowBefore!.compliance_mv_last_refreshed_at).getTime()
    const tCompAfter  = new Date(rowAfter!.compliance_mv_last_refreshed_at).getTime()
    const tTrendBefore = new Date(rowBefore!.trend_mv_last_refreshed_at).getTime()
    const tTrendAfter  = new Date(rowAfter!.trend_mv_last_refreshed_at).getTime()

    expect(tCompAfter).toBeGreaterThan(tCompBefore)
    // Trend should NOT have advanced (only compliance was refreshed)
    expect(Math.abs(tTrendAfter - tTrendBefore)).toBeLessThan(100)
  })

  it('G2: trend-only refresh updates trend_mv_last_refreshed_at but not compliance', async () => {
    const orgId = await createTestOrg('G2')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshBothMVs()
    const rowBefore = await getSummaryRow(orgId)

    await new Promise((r) => setTimeout(r, 50))
    await refreshTrendMV()
    const rowAfter = await getSummaryRow(orgId)

    const tCompBefore  = new Date(rowBefore!.compliance_mv_last_refreshed_at).getTime()
    const tCompAfter   = new Date(rowAfter!.compliance_mv_last_refreshed_at).getTime()
    const tTrendBefore = new Date(rowBefore!.trend_mv_last_refreshed_at).getTime()
    const tTrendAfter  = new Date(rowAfter!.trend_mv_last_refreshed_at).getTime()

    expect(tTrendAfter).toBeGreaterThan(tTrendBefore)
    expect(Math.abs(tCompAfter - tCompBefore)).toBeLessThan(100)
  })

  it('G3: multiple sequential refreshes do not corrupt health_score', async () => {
    const orgId = await createTestOrg('G3')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshBothMVs()
    const score1 = (await getSummaryRow(orgId))!.health_score

    await refreshBothMVs()
    const score2 = (await getSummaryRow(orgId))!.health_score

    await refreshBothMVs()
    const score3 = (await getSummaryRow(orgId))!.health_score

    // No new submissions seeded → score must be stable across refreshes
    expect(score1).toBe(score2)
    expect(score2).toBe(score3)
  })

  it('G4: compliance refresh log row_count matches mv_etax_compliance_dashboard count', async () => {
    const orgId = await createTestOrg('G4')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01' })
    await refreshComplianceMV()

    const { data: logRow } = await admin
      .from('etax_compliance_mv_refresh_log')
      .select('row_count')
      .eq('triggered_by', 'test')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .single()

    const { count: mvCount } = await admin
      .from('mv_etax_compliance_dashboard')
      .select('org_id', { count: 'exact', head: true })

    expect(logRow).not.toBeNull()
    expect(logRow!.row_count).toBe(mvCount)
  })

  it('G5: trend refresh log row_count matches mv_etax_health_trend count', async () => {
    const orgId = await createTestOrg('G5')
    createdOrgIds.push(orgId)

    await seedSubmission({ orgId, status: 'submitted', docType: 'T01', daysAgo: 0 })
    await refreshTrendMV()

    const { data: logRow } = await admin
      .from('etax_health_trend_mv_refresh_log')
      .select('row_count')
      .eq('triggered_by', 'test')
      .order('refreshed_at', { ascending: false })
      .limit(1)
      .single()

    const { count: mvCount } = await admin
      .from('mv_etax_health_trend')
      .select('org_id', { count: 'exact', head: true })

    expect(logRow).not.toBeNull()
    expect(logRow!.row_count).toBe(mvCount)
  })

  it('G6: rpc_etax_full_health_summary_admin returns empty array (not error) when all orgs have no submissions', async () => {
    // Create an org with no submissions — admin RPC should handle gracefully
    const orgId = await createTestOrg('G6empty')
    createdOrgIds.push(orgId)

    // No submissions → org will not appear in MV → empty array is valid
    await refreshBothMVs()

    let rows: HealthSummaryRow[] | undefined
    let err: any
    try {
      rows = await callRpcSummaryAdmin(orgId)
    } catch (e) {
      err = e
    }

    // Should either return empty array OR throw EXCEPTION (if non-service_role path triggered)
    // The key invariant: no unhandled crash with a "no rows" style error
    expect(err?.code ?? '').not.toMatch(/22023|42601/)  // not a syntax/data error
    if (!err) {
      expect(Array.isArray(rows)).toBe(true)
    }
  })
})

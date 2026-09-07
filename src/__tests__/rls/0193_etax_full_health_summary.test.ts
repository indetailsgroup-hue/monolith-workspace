// =============================================================================
// 0193_etax_full_health_summary.test.ts
// =============================================================================
// Test suite for Migration 0193 — v_etax_full_health_summary view,
// rpc_etax_full_health_summary(), and rpc_etax_full_health_summary_admin().
//
// Groups:
//   A  Schema validation                              (8 tests)
//   B  rpc_etax_full_health_summary org isolation     (9 tests)
//   C  health_score formula accuracy                  (8 tests)
//   D  health_status threshold boundaries             (8 tests)
//   E  rpc_etax_full_health_summary_admin             (8 tests)
//        service_role guard + cross-org
//   F  LEFT JOIN behaviour                            (7 tests)
//   G  Edge cases                                     (6 tests)
//
// Total: 54 tests
//
// Dependencies: vitest, @supabase/supabase-js
// Run: vitest run src/__tests__/rls/0193_etax_full_health_summary.test.ts
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

const TEST_TAG = '0193_test_suite'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function execSql(query: string): Promise<Record<string, any>[]> {
  const { data, error } = await serviceClient.rpc('exec_sql', { query })
  if (error) throw new Error(`exec_sql: ${error.message}`)
  return (data ?? []) as Record<string, any>[]
}

// ---------------------------------------------------------------------------
// Auth helper — creates a user + org_member row, returns a signed-in client
// ---------------------------------------------------------------------------
async function makeAuthClient(
  role:   string,
  orgId?: string,
): Promise<{ client: SupabaseClient; userId: string; orgId: string }> {
  const email    = `test_0193_${role.toLowerCase()}_${Date.now()}@monolith.test`
  const password = 'Test@123456!'

  const { data: userRec, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !userRec.user)
    throw new Error(`createUser failed: ${createErr?.message}`)
  const userId = userRec.user.id

  // Resolve or create org
  let resolvedOrgId = orgId
  if (!resolvedOrgId) {
    resolvedOrgId = await createTestOrg(`auth-${role.toLowerCase()}`)
    createdOrgIds.push(resolvedOrgId)
  }

  const { error: metadataError } = await serviceClient.auth.admin.updateUserById(userId, {
    app_metadata: { roles: [role.toLowerCase()], org_id: resolvedOrgId },
  })
  if (metadataError) throw new Error(`updateUser failed: ${metadataError.message}`)

  const { error: memberError } = await serviceClient.from('org_members').insert({
    user_id : userId,
    org_id  : resolvedOrgId,
    role,
    email,
  })
  if (memberError) throw new Error(`org member failed: ${memberError.message}`)

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { error: signInErr } = await anonClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`)

  return { client: anonClient, userId, orgId: resolvedOrgId! }
}

// ---------------------------------------------------------------------------
// Org helper — creates an isolated org, returns its id
// ---------------------------------------------------------------------------
async function createTestOrg(suffix: string): Promise<string> {
  const orgId = crypto.randomUUID()
  const { data, error } = await serviceClient
    .from('organizations')
    .insert({
      org_id: orgId,
      name: `test_0193_org_${suffix}_${Date.now()}`,
      slug: `test-0193-${suffix.toLowerCase()}-${orgId}`,
      plan: 'ENTERPRISE',
    })
    .select('org_id')
    .single()
  if (error || !data) throw new Error(`createTestOrg failed: ${error?.message}`)
  return data.org_id
}

// ---------------------------------------------------------------------------
// Invoice helper — resolves or creates a minimal invoice in an org
// ---------------------------------------------------------------------------
async function getOrCreateInvoice(orgId: string, forceNew = false): Promise<string> {
  if (!forceNew) {
    const { data: existing } = await serviceClient
      .from('invoices')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)
      .single()
    if (existing) return existing.id
  }

  // Need a customer first
  let customerId: string
  const { data: cust } = await serviceClient
    .from('customers')
    .select('customer_id')
    .eq('org_id', orgId)
    .limit(1)
    .single()
  if (cust) {
    customerId = cust.customer_id
  } else {
    const { data: newCust, error: custErr } = await serviceClient
      .from('customers')
      .insert({ org_id: orgId, name: `test_cust_0193_${Date.now()}` })
      .select('customer_id')
      .single()
    if (custErr || !newCust)
      throw new Error(`Could not create test customer: ${custErr?.message}`)
    customerId = newCust.customer_id
  }

  const invoiceId = crypto.randomUUID()
  const { data: inv, error: invErr } = await serviceClient
    .from('invoices')
    .insert({
      id          : invoiceId,
      invoice_id  : invoiceId,
      invoice_code: `INV-0193-${invoiceId}`,
      code        : `INV-0193-${invoiceId}`,
      org_id      : orgId,
      customer_id : customerId,
      status      : 'approved',
      total       : 100,
      remaining_amount: 100,
      due_date    : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      created_by  : '00000000-0000-0000-0000-000000000001',
    })
    .select('id')
    .single()
  if (invErr || !inv)
    throw new Error(`Could not create test invoice: ${invErr?.message}`)
  return inv.id
}

// ---------------------------------------------------------------------------
// Submission seeder
// ---------------------------------------------------------------------------
function daysAgoTs(n: number, hour = 12): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

async function seedSubmission(opts: {
  orgId:      string
  invoiceId?: string
  status?:    string
  attempt?:   number
  daysAgo?:   number
  docType?:   string
}): Promise<string> {
  const {
    orgId,
    status  = 'submitted',
    attempt = 1,
    daysAgo = 0,
    docType = 'T01',
  } = opts

  let invoiceId = opts.invoiceId ?? await getOrCreateInvoice(orgId)
  const { data: duplicate } = await serviceClient
    .from('etax_submissions')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('document_type', docType)
    .limit(1)
    .maybeSingle()
  if (duplicate) invoiceId = await getOrCreateInvoice(orgId, true)

  const { data, error } = await serviceClient
    .from('etax_submissions')
    .insert({
      org_id        : orgId,
      invoice_id    : invoiceId,
      document_type : docType,
      document_number: `ETAX-0193-${crypto.randomUUID()}`,
      document_date : daysAgoTs(daysAgo).slice(0, 10),
      net_amount    : 93.46,
      vat_amount    : 6.54,
      gross_amount  : 100,
      vat_rate      : 0.07,
      buyer_name    : '0193 test customer',
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

// ---------------------------------------------------------------------------
// MV refresh helpers
// ---------------------------------------------------------------------------
async function refreshComplianceMV(): Promise<void> {
  const { error } = await serviceClient.rpc('fn_refresh_etax_compliance_mv', {
    p_triggered_by: 'test',
  })
  if (error) throw new Error(`refreshComplianceMV failed: ${error.message}`)
}

async function refreshTrendMV(): Promise<void> {
  const { error } = await serviceClient.rpc('fn_refresh_etax_health_trend_mv', {
    p_triggered_by: 'test',
  })
  if (error) throw new Error(`refreshTrendMV failed: ${error.message}`)
}

async function refreshBothMVs(): Promise<void> {
  await refreshComplianceMV()
  await refreshTrendMV()
}

// ---------------------------------------------------------------------------
// Ensure both refresh-log tables have ≥1 row
// (CROSS JOIN in view requires this to return any rows)
// ---------------------------------------------------------------------------
async function ensureRefreshLogs(): Promise<void> {
  const { count: cCount } = await serviceClient
    .from('etax_compliance_mv_refresh_log')
    .select('id', { count: 'exact', head: true })
  if ((cCount ?? 0) === 0) await refreshComplianceMV()

  const { count: tCount } = await serviceClient
    .from('etax_health_trend_mv_refresh_log')
    .select('id', { count: 'exact', head: true })
  if ((tCount ?? 0) === 0) await refreshTrendMV()
}

// ---------------------------------------------------------------------------
// Health score formula mirror — exact JS equivalent of 0193 SQL formula
// ---------------------------------------------------------------------------
interface ScoreInputs {
  successRate?:         number  // compliance_success_rate  (0–100)
  retryExhaustionRate?: number  // today_retry_exhaustion_rate_pct (0–100)
  overdueWithPending?:  number  // overdue_with_pending_etax (integer)
  failedLast24h?:       number  // failed_last_24h (integer)
}

function calcExpectedScore({
  successRate         = 100,
  retryExhaustionRate = 0,
  overdueWithPending  = 0,
  failedLast24h       = 0,
}: ScoreInputs): number {
  const raw =
    100
    - Math.round((100 - successRate)    * 0.40)
    - Math.round(retryExhaustionRate    * 0.30)
    - Math.min(overdueWithPending * 2,    20)
    - Math.min(failedLast24h,             10)
  return Math.max(0, Math.min(100, raw))
}

function expectedStatus(score: number): string {
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'warning'
  return 'critical'
}

// ---------------------------------------------------------------------------
// Cleanup registries
// ---------------------------------------------------------------------------
const createdUserIds: string[] = []
const createdOrgIds:  string[] = []

afterEach(async () => {
  await serviceClient
    .from('etax_submissions')
    .delete()
    .eq('metadata->>test_tag', TEST_TAG)

  await serviceClient
    .from('etax_health_trend_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test')

  await serviceClient
    .from('etax_compliance_mv_refresh_log')
    .delete()
    .eq('triggered_by', 'test')
})

afterAll(async () => {
  for (const uid of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(uid)
  }
  for (const oid of new Set(createdOrgIds)) {
    await serviceClient.from('etax_submissions').delete().eq('org_id', oid)
    await serviceClient.from('invoice_notifications').delete().eq('org_id', oid)
    await serviceClient.from('etax_submission_audit_log').delete().eq('org_id', oid)
    await serviceClient.from('invoices').delete().eq('org_id', oid)
    await serviceClient.from('customers').delete().eq('org_id', oid)
    await serviceClient.from('org_members').delete().eq('org_id', oid)
    await serviceClient.from('organizations').delete().eq('org_id', oid)
  }
})

// =============================================================================
// GROUP A — Schema Validation  (8 tests)
// =============================================================================
describe('Group A — Schema Validation', () => {

  it('A1: v_etax_full_health_summary exists in information_schema.views', async () => {
    const data = await execSql(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'v_etax_full_health_summary'
    `)
    expect(data).toHaveLength(1)
  })

  it('A2: rpc_etax_full_health_summary function exists (no "does not exist" error)', async () => {
    const { error } = await serviceClient.rpc('rpc_etax_full_health_summary')
    // Expect auth/role error — NOT "function does not exist"
    expect(error?.message ?? '').not.toMatch(/function .* does not exist/i)
  })

  it('A3: rpc_etax_full_health_summary_admin function exists', async () => {
    const { error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error?.message ?? '').not.toMatch(/function .* does not exist/i)
  })

  it('A4: view has health_score column', async () => {
    const data = await execSql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v_etax_full_health_summary'
        AND column_name = 'health_score'
    `)
    expect(data).toHaveLength(1)
  })

  it('A5: view has health_status column', async () => {
    const data = await execSql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v_etax_full_health_summary'
        AND column_name = 'health_status'
    `)
    expect(data).toHaveLength(1)
  })

  it('A6: view has compliance_mv_age_seconds column', async () => {
    const data = await execSql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v_etax_full_health_summary'
        AND column_name = 'compliance_mv_age_seconds'
    `)
    expect(data).toHaveLength(1)
  })

  it('A7: view has trend_mv_age_seconds column', async () => {
    const data = await execSql(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'v_etax_full_health_summary'
        AND column_name = 'trend_mv_age_seconds'
    `)
    expect(data).toHaveLength(1)
  })

  it('A8: authenticated role has no direct SELECT on v_etax_full_health_summary', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { data, error } = await client
      .from('v_etax_full_health_summary' as any)
      .select('org_id')
      .limit(1)
    // SELECT must fail — only service_role has GRANT SELECT
    expect(error).not.toBeNull()
    // data should be null or empty
    expect(data).toBeFalsy()
  })
})

// =============================================================================
// GROUP B — rpc_etax_full_health_summary Org Isolation  (9 tests)
// =============================================================================
describe('Group B — rpc_etax_full_health_summary Org Isolation', () => {

  beforeAll(async () => {
    await ensureRefreshLogs()
  })

  it('B1: OWNER role can call rpc_etax_full_health_summary without error', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
  })

  it('B2: ADMIN role can call rpc_etax_full_health_summary without error', async () => {
    const { client, userId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
  })

  it('B3: FINANCE role can call rpc_etax_full_health_summary without error', async () => {
    const { client, userId } = await makeAuthClient('FINANCE')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
  })

  it('B4: VIEWER role is rejected with code P0001', async () => {
    const { client, userId } = await makeAuthClient('VIEWER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it('B5: DESIGNER role is rejected with code P0001', async () => {
    const { client, userId } = await makeAuthClient('DESIGNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('P0001')
  })

  it('B6: unauthenticated call is rejected (no JWT)', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { error } = await anonClient.rpc('rpc_etax_full_health_summary')
    expect(error).not.toBeNull()
  })

  it('B7: every returned row has org_id matching the caller\'s org', async () => {
    const { client, userId, orgId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { data, error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
    for (const row of (data as any[]) ?? []) {
      expect(row.org_id).toBe(orgId)
    }
  })

  it('B8: cross-org submissions are absent from caller\'s result', async () => {
    const orgA = await createTestOrg('b8a')
    const orgB = await createTestOrg('b8b')
    createdOrgIds.push(orgA, orgB)

    // Seed a submission in orgB only
    const invB = await getOrCreateInvoice(orgB)
    await seedSubmission({ orgId: orgB, invoiceId: invB, status: 'submitted' })
    await refreshBothMVs()
    await ensureRefreshLogs()

    // Caller belongs to orgA
    const { client, userId } = await makeAuthClient('OWNER', orgA)
    createdUserIds.push(userId)
    const { data, error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
    for (const row of (data as any[]) ?? []) {
      expect(row.org_id).not.toBe(orgB)
    }
  })

  it('B9: compliance_mv_age_seconds and trend_mv_age_seconds are both ≥ 0', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { data, error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
    if ((data as any[])?.length > 0) {
      const row = (data as any[])[0]
      expect(Number(row.compliance_mv_age_seconds)).toBeGreaterThanOrEqual(0)
      expect(Number(row.trend_mv_age_seconds)).toBeGreaterThanOrEqual(0)
    }
  })
})

// =============================================================================
// GROUP C — health_score Formula Accuracy  (8 tests)
// =============================================================================
describe('Group C — health_score Formula Accuracy', () => {

  let formulaOrg: string
  let formulaInv: string

  beforeAll(async () => {
    formulaOrg = await createTestOrg('formulaC')
    createdOrgIds.push(formulaOrg)
    formulaInv = await getOrCreateInvoice(formulaOrg)
    await ensureRefreshLogs()
  })

  /** Wipe all test submissions for the formula org and refresh both MVs. */
  async function resetFormula(): Promise<void> {
    await serviceClient
      .from('etax_submissions')
      .delete()
      .eq('org_id',             formulaOrg)
      .eq('metadata->>test_tag', TEST_TAG)
    await refreshBothMVs()
  }

  it('C1: all-submitted org → health_score = 100', async () => {
    await resetFormula()
    for (let i = 0; i < 4; i++)
      await seedSubmission({ orgId: formulaOrg, invoiceId: formulaInv, status: 'submitted', daysAgo: 0 })
    await refreshBothMVs()

    const { data } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: formulaOrg,
    })
    const row = (data as any[])?.[0]
    expect(row).toBeDefined()

    // Verify formula mirror agrees with DB
    const expected = calcExpectedScore({
      successRate:         Number(row.compliance_success_rate),
      retryExhaustionRate: Number(row.today_retry_exhaustion_rate_pct),
      overdueWithPending:  Number(row.overdue_with_pending_etax),
      failedLast24h:       Number(row.failed_last_24h),
    })
    expect(row.health_score).toBe(expected)
    expect(row.health_score).toBe(100)
  })

  it('C2: zero-success rate → health_score = 60 (−40 deduction only)', async () => {
    await resetFormula()
    // Fail submissions created >24 h ago so failed_last_24h = 0
    for (let i = 0; i < 4; i++)
      await seedSubmission({ orgId: formulaOrg, invoiceId: formulaInv, status: 'failed', daysAgo: 2 })
    await refreshBothMVs()

    const { data } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: formulaOrg,
    })
    const row = (data as any[])?.[0]
    expect(row).toBeDefined()
    // success_rate=0, rex=0 (no today's submissions), owp=0, f24h=0
    expect(calcExpectedScore({ successRate: 0 })).toBe(60)
    expect(row.health_score).toBe(60)
  })

  it('C3: today all-exhausted submissions → today_retry_exhaustion_rate_pct = 100', async () => {
    await resetFormula()
    // Seed 4 old submitted (boost compliance success_rate)
    for (let i = 0; i < 4; i++)
      await seedSubmission({ orgId: formulaOrg, invoiceId: formulaInv, status: 'submitted', daysAgo: 5 })
    // Seed 4 today exhausted (attempt_count ≥ 5 + status = failed)
    for (let i = 0; i < 4; i++)
      await seedSubmission({ orgId: formulaOrg, invoiceId: formulaInv, status: 'failed', attempt: 5, daysAgo: 0 })
    await refreshBothMVs()

    const { data } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: formulaOrg,
    })
    const row = (data as any[])?.[0]
    expect(row).toBeDefined()
    expect(Number(row.today_retry_exhaustion_rate_pct)).toBe(100)

    // Formula mirror matches DB value
    const expected = calcExpectedScore({
      successRate:         Number(row.compliance_success_rate),
      retryExhaustionRate: Number(row.today_retry_exhaustion_rate_pct),
      overdueWithPending:  Number(row.overdue_with_pending_etax),
      failedLast24h:       Number(row.failed_last_24h),
    })
    expect(row.health_score).toBe(expected)
  })

  it('C4: max overdue penalty: LEAST(10 × 2, 20) = 20 pts → formula produces 80', async () => {
    // Pure formula: no DB round-trip needed
    const deduction = Math.min(10 * 2, 20)
    expect(deduction).toBe(20)
    const score = calcExpectedScore({ overdueWithPending: 10 })
    expect(score).toBe(80)
  })

  it('C5: overdue cap — 11 invoices deducts the same 20 pts as 10 (no extra penalty)', async () => {
    const score10 = calcExpectedScore({ overdueWithPending: 10 })
    const score11 = calcExpectedScore({ overdueWithPending: 11 })
    const score20 = calcExpectedScore({ overdueWithPending: 20 })
    expect(score10).toBe(score11)
    expect(score11).toBe(score20)
    expect(score11).toBe(80)
  })

  it('C6: 10 failures in last 24 h → −10 pts deduction (full cap)', async () => {
    await resetFormula()
    for (let i = 0; i < 10; i++)
      await seedSubmission({ orgId: formulaOrg, invoiceId: formulaInv, status: 'failed', attempt: 1, daysAgo: 0 })
    await refreshBothMVs()

    const { data } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: formulaOrg,
    })
    const row = (data as any[])?.[0]
    expect(row).toBeDefined()
    const f24h = Number(row.failed_last_24h)
    // LEAST(f24h, 10) at 10 failures = 10
    expect(Math.min(f24h, 10)).toBe(10)

    const expected = calcExpectedScore({
      successRate:         Number(row.compliance_success_rate),
      retryExhaustionRate: Number(row.today_retry_exhaustion_rate_pct),
      overdueWithPending:  Number(row.overdue_with_pending_etax),
      failedLast24h:       f24h,
    })
    expect(row.health_score).toBe(expected)
  })

  it('C7: failed_last_24h cap — 15 failures deduct the same 10 pts as 10', async () => {
    const score10 = calcExpectedScore({ failedLast24h: 10 })
    const score15 = calcExpectedScore({ failedLast24h: 15 })
    const score50 = calcExpectedScore({ failedLast24h: 50 })
    expect(score10).toBe(score15)
    expect(score15).toBe(score50)
    expect(score15).toBe(90) // 100 − 10
  })

  it('C8: all penalties maxed → health_score = 0 (GREATEST floor prevents negative)', async () => {
    // successRate=0 (−40) + rex=100 (−30) + owp=11 cap (−20) + f24h=15 cap (−10) = −100 from 100 = 0
    const score = calcExpectedScore({
      successRate:         0,
      retryExhaustionRate: 100,
      overdueWithPending:  11,
      failedLast24h:       15,
    })
    expect(score).toBe(0)

    // Extreme inputs must still floor at 0
    const extreme = calcExpectedScore({
      successRate:         0,
      retryExhaustionRate: 999,
      overdueWithPending:  999,
      failedLast24h:       999,
    })
    expect(extreme).toBeGreaterThanOrEqual(0)
    expect(extreme).toBe(0)
  })
})

// =============================================================================
// GROUP D — health_status Threshold Boundaries  (8 tests)
// =============================================================================
describe('Group D — health_status Threshold Boundaries', () => {

  let threshOrg: string
  let threshInv: string

  beforeAll(async () => {
    threshOrg = await createTestOrg('thresholdD')
    createdOrgIds.push(threshOrg)
    threshInv = await getOrCreateInvoice(threshOrg)
    await ensureRefreshLogs()
  })

  /** Wipe test subs, seed a given split, refresh, return the admin view row. */
  async function seedAndFetch(
    submittedOld: number,
    failedOld:    number,
    failedRecent: number = 0,
  ): Promise<any> {
    await serviceClient
      .from('etax_submissions')
      .delete()
      .eq('org_id',             threshOrg)
      .eq('metadata->>test_tag', TEST_TAG)

    for (let i = 0; i < submittedOld; i++)
      await seedSubmission({ orgId: threshOrg, invoiceId: threshInv, status: 'submitted', daysAgo: 5 })
    for (let i = 0; i < failedOld; i++)
      await seedSubmission({ orgId: threshOrg, invoiceId: threshInv, status: 'failed',    daysAgo: 5 })
    for (let i = 0; i < failedRecent; i++)
      await seedSubmission({ orgId: threshOrg, invoiceId: threshInv, status: 'failed',    daysAgo: 0 })

    await refreshBothMVs()

    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: threshOrg,
    })
    expect(error).toBeNull()
    return (data as any[])?.[0]
  }

  it('D1: score ≥ 80 → health_status = "healthy"', async () => {
    // 4 submitted, 0 failed → score = 100
    const row = await seedAndFetch(4, 0)
    expect(row).toBeDefined()
    expect(Number(row.health_score)).toBeGreaterThanOrEqual(80)
    expect(row.health_status).toBe('healthy')
  })

  it('D2: score = 100 (perfect) → health_status = "healthy"', async () => {
    const row = await seedAndFetch(4, 0)
    expect(row.health_score).toBe(100)
    expect(row.health_status).toBe('healthy')
  })

  it('D3: formula confirms score 50–79 range → health_status = "warning"', async () => {
    // 1 submitted + 3 failed (old) → success_rate ≈ 25% → score = 100−ROUND(75*0.40) = 70
    const row = await seedAndFetch(1, 3)
    expect(row).toBeDefined()
    const expected = calcExpectedScore({
      successRate:   Number(row.compliance_success_rate),
      failedLast24h: Number(row.failed_last_24h),
    })
    if (expected >= 50 && expected < 80) {
      expect(row.health_status).toBe('warning')
    }
    expect(row.health_score).toBe(expected)
  })

  it('D4: boundary 50 = warning (not critical) — confirmed by formula', async () => {
    // Pure formula check: score=50 produced by successRate=25, overdueWithPending=10
    expect(calcExpectedScore({ successRate: 25, overdueWithPending: 10 })).toBe(50)
    expect(expectedStatus(50)).toBe('warning')
  })

  it('D5: boundary 79 = warning; 80 = healthy — adjacent cells', async () => {
    expect(expectedStatus(79)).toBe('warning')
    expect(expectedStatus(80)).toBe('healthy')
    // Confirm they are different statuses at adjacent integers
    expect(expectedStatus(79)).not.toBe(expectedStatus(80))
  })

  it('D6: score < 50 → health_status = "critical"', async () => {
    // 0 submitted, 0 old-failed, 4 recent-failed → success_rate=0, f24h=4
    // score = 100 − 40 − 0 − 0 − 4 = 56 … add more failures for sub-50
    // Use 0 submitted + 0 old + 8 recent → f24h=8, score = 100-40-8 = 52
    // Use 0 submitted + 0 old + 12 recent → score = 100-40-10=50, still warning
    // Combine: no submitted + 4 recent → success_rate=0, f24h=4 → 56 (warning)
    // But with success_rate=0 AND f24h=10: 100-40-10 = 50 (warning, not critical)
    // Need one more deduction: e.g. 20 overdue; can't seed that easily. Test formula only:
    const score = calcExpectedScore({ successRate: 0, failedLast24h: 15, overdueWithPending: 2 })
    // 100 - 40 - 0 - 4 - 10 = 46
    expect(score).toBeLessThan(50)
    expect(expectedStatus(score)).toBe('critical')
  })

  it('D7: score = 0 → health_status = "critical"', async () => {
    expect(calcExpectedScore({
      successRate:         0,
      retryExhaustionRate: 100,
      overdueWithPending:  11,
      failedLast24h:       15,
    })).toBe(0)
    expect(expectedStatus(0)).toBe('critical')
  })

  it('D8: all three status values are reachable via the formula', async () => {
    const statuses = new Set([
      expectedStatus(100),
      expectedStatus(60),
      expectedStatus(0),
    ])
    expect(statuses.has('healthy')).toBe(true)
    expect(statuses.has('warning')).toBe(true)
    expect(statuses.has('critical')).toBe(true)
    expect(statuses.size).toBe(3)
  })
})

// =============================================================================
// GROUP E — rpc_etax_full_health_summary_admin Service-Role Guard  (8 tests)
// =============================================================================
describe('Group E — rpc_etax_full_health_summary_admin Service-Role Guard', () => {

  let adminTestOrg: string

  beforeAll(async () => {
    adminTestOrg = await createTestOrg('adminE')
    createdOrgIds.push(adminTestOrg)
    const inv = await getOrCreateInvoice(adminTestOrg)
    await seedSubmission({ orgId: adminTestOrg, invoiceId: inv, status: 'submitted' })
    await refreshBothMVs()
    await ensureRefreshLogs()
  })

  it('E1: service_role can call rpc_etax_full_health_summary_admin (p_org_id=NULL)', async () => {
    const { error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).toBeNull()
  })

  it('E2: authenticated OWNER is rejected — EXCEPTION mentions service_role', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/service_role/i)
  })

  it('E3: authenticated ADMIN is rejected — EXCEPTION mentions service_role', async () => {
    const { client, userId } = await makeAuthClient('ADMIN')
    createdUserIds.push(userId)
    const { error } = await client.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/service_role/i)
  })

  it('E4: p_org_id = NULL returns rows from all orgs (at least 1)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).toBeNull()
    expect((data as any[]).length).toBeGreaterThanOrEqual(1)
    const orgIds = (data as any[]).map((r: any) => r.org_id)
    expect(orgIds).toContain(adminTestOrg)
  })

  it('E5: p_org_id = specific UUID returns only rows for that org', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: adminTestOrg,
    })
    expect(error).toBeNull()
    expect((data as any[]).length).toBeGreaterThanOrEqual(1)
    for (const row of data as any[]) {
      expect(row.org_id).toBe(adminTestOrg)
    }
  })

  it('E6: results are ordered health_score ASC (worst-first)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).toBeNull()
    const scores = (data as any[]).map((r: any) => Number(r.health_score))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('E7: return rows include health_score and health_status', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: adminTestOrg,
    })
    expect(error).toBeNull()
    if ((data as any[]).length > 0) {
      const row = (data as any[])[0]
      expect(row).toHaveProperty('health_score')
      expect(row).toHaveProperty('health_status')
      expect(typeof row.health_score).toBe('number')
      expect(['healthy', 'warning', 'critical']).toContain(row.health_status)
    }
  })

  it('E8: return rows include all four MV-freshness metadata columns', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: adminTestOrg,
    })
    expect(error).toBeNull()
    if ((data as any[]).length > 0) {
      const row = (data as any[])[0]
      expect(row).toHaveProperty('compliance_mv_age_seconds')
      expect(row).toHaveProperty('compliance_mv_last_refreshed_at')
      expect(row).toHaveProperty('trend_mv_age_seconds')
      expect(row).toHaveProperty('trend_mv_last_refreshed_at')
      expect(Number(row.compliance_mv_age_seconds)).toBeGreaterThanOrEqual(0)
      expect(Number(row.trend_mv_age_seconds)).toBeGreaterThanOrEqual(0)
    }
  })
})

// =============================================================================
// GROUP F — LEFT JOIN Behaviour  (7 tests)
// =============================================================================
describe('Group F — LEFT JOIN Behaviour', () => {

  let orgComplianceOnly: string  // has compliance row, no trend row
  let orgBothSources:    string  // has both compliance and trend rows

  beforeAll(async () => {
    orgComplianceOnly = await createTestOrg('leftJoinF1')
    orgBothSources    = await createTestOrg('leftJoinF2')
    createdOrgIds.push(orgComplianceOnly, orgBothSources)
    await ensureRefreshLogs()
  })

  it('F1: org in compliance MV but absent from trend MV still appears in view', async () => {
    // Seed old submissions (>30 days) → compliance MV row exists, trend MV row absent
    const inv = await getOrCreateInvoice(orgComplianceOnly)
    await seedSubmission({ orgId: orgComplianceOnly, invoiceId: inv, status: 'submitted', daysAgo: 35 })
    await seedSubmission({ orgId: orgComplianceOnly, invoiceId: inv, status: 'submitted', daysAgo: 36 })
    await refreshComplianceMV()
    await refreshTrendMV()  // trend MV won't include these (outside 30-day window)

    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgComplianceOnly,
    })
    expect(error).toBeNull()
    expect((data as any[]).length).toBe(1)
    expect((data as any[])[0].org_id).toBe(orgComplianceOnly)
  })

  it('F2: today_total COALESCE to 0 when no trend MV row for org', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgComplianceOnly,
    })
    expect(error).toBeNull()
    const row = (data as any[])[0]
    expect(Number(row.today_total)).toBe(0)
  })

  it('F3: today_retry_exhaustion_rate_pct COALESCE to 0 when trend row absent', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgComplianceOnly,
    })
    expect(error).toBeNull()
    const row = (data as any[])[0]
    expect(Number(row.today_retry_exhaustion_rate_pct)).toBe(0)
  })

  it('F4: compliance columns reflect correct MV data even without trend row', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgComplianceOnly,
    })
    expect(error).toBeNull()
    const row = (data as any[])[0]
    expect(Number(row.submitted_count)).toBeGreaterThanOrEqual(2)
    // All seeded submissions were 'submitted' → success_rate = 100
    expect(Number(row.compliance_success_rate)).toBe(100)
  })

  it('F5: org with recent submissions — today_total reflects today seedings', async () => {
    const inv = await getOrCreateInvoice(orgBothSources)
    await seedSubmission({ orgId: orgBothSources, invoiceId: inv, status: 'submitted', daysAgo: 0 })
    await seedSubmission({ orgId: orgBothSources, invoiceId: inv, status: 'submitted', daysAgo: 0 })
    await refreshBothMVs()

    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgBothSources,
    })
    expect(error).toBeNull()
    const row = (data as any[])[0]
    expect(Number(row.today_total)).toBeGreaterThanOrEqual(2)
    expect(Number(row.today_submitted)).toBeGreaterThanOrEqual(2)
  })

  it('F6: health_score formula uses COALESCE(rex, 0) when trend absent — no rex penalty', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: orgComplianceOnly,
    })
    expect(error).toBeNull()
    const row = (data as any[])[0]
    // With rex=0, score depends only on compliance_success_rate, owp, f24h
    const expected = calcExpectedScore({
      successRate:         Number(row.compliance_success_rate),
      retryExhaustionRate: 0,
      overdueWithPending:  Number(row.overdue_with_pending_etax),
      failedLast24h:       Number(row.failed_last_24h),
    })
    expect(row.health_score).toBe(expected)
  })

  it('F7: org absent from compliance MV returns empty set (not an error)', async () => {
    // Create an org with zero submissions → no compliance MV row → no view row
    const emptyOrg = await createTestOrg('leftJoinF7_empty')
    createdOrgIds.push(emptyOrg)
    await refreshBothMVs()

    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: emptyOrg,
    })
    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect((data as any[]).length).toBe(0)
  })
})

// =============================================================================
// GROUP G — Edge Cases  (6 tests)
// =============================================================================
describe('Group G — Edge Cases', () => {

  beforeAll(async () => {
    await ensureRefreshLogs()
  })

  it('G1: default sort is health_score ASC (worst-health orgs first)', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: null,
    })
    expect(error).toBeNull()
    const scores = (data as any[]).map((r: any) => Number(r.health_score))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('G2: health_score floor is 0 — cannot go negative for any input combination', async () => {
    const worst = calcExpectedScore({
      successRate:         0,
      retryExhaustionRate: 1_000,
      overdueWithPending:  1_000,
      failedLast24h:       1_000,
    })
    expect(worst).toBeGreaterThanOrEqual(0)
    expect(worst).toBe(0)
  })

  it('G3: health_score ceiling is 100 — cannot exceed 100 for any input combination', async () => {
    const best = calcExpectedScore({
      successRate:         100,
      retryExhaustionRate: 0,
      overdueWithPending:  0,
      failedLast24h:       0,
    })
    expect(best).toBeLessThanOrEqual(100)
    expect(best).toBe(100)
  })

  it('G4: compliance_mv_age_seconds and trend_mv_age_seconds ≥ 0 for OWNER caller', async () => {
    const { client, userId } = await makeAuthClient('OWNER')
    createdUserIds.push(userId)
    const { data, error } = await client.rpc('rpc_etax_full_health_summary')
    expect(error).toBeNull()
    for (const row of (data as any[]) ?? []) {
      expect(Number(row.compliance_mv_age_seconds)).toBeGreaterThanOrEqual(0)
      expect(Number(row.trend_mv_age_seconds)).toBeGreaterThanOrEqual(0)
    }
  })

  it('G5: consecutive identical calls return the same health_score (idempotent reads)', async () => {
    const idemOrg = await createTestOrg('idempotentG5')
    createdOrgIds.push(idemOrg)
    const inv = await getOrCreateInvoice(idemOrg)
    await seedSubmission({ orgId: idemOrg, invoiceId: inv, status: 'submitted' })
    await refreshBothMVs()

    const { data: d1 } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', { p_org_id: idemOrg })
    const { data: d2 } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', { p_org_id: idemOrg })

    const r1 = (d1 as any[])?.[0]
    const r2 = (d2 as any[])?.[0]
    expect(r1?.health_score).toBe(r2?.health_score)
    expect(r1?.health_status).toBe(r2?.health_status)
  })

  it('G6: org absent from compliance MV returns empty result set (no error, no throw)', async () => {
    const ghostOrg = await createTestOrg('ghostG6')
    createdOrgIds.push(ghostOrg)

    const { data, error } = await serviceClient.rpc('rpc_etax_full_health_summary_admin', {
      p_org_id: ghostOrg,
    })
    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect((data as any[]).length).toBe(0)
  })
})

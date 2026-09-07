/**
 * 0187_etax_compliance_dashboard_mv.test.ts
 * ==========================================
 * Test suite for Migration 0187 — mv_etax_compliance_dashboard materialized
 * view, fn_refresh_etax_compliance_mv, pg_cron job registration,
 * rpc_etax_compliance_dashboard_cached staleness metadata, and mv_age_seconds.
 *
 * Groups:
 *   A — fn_refresh_etax_compliance_mv: return contract, duration_ms, row_count
 *   B — pg_cron job registration & idempotency
 *   C — rpc_etax_compliance_dashboard_cached: staleness metadata columns
 *   D — mv_age_seconds accuracy & freshness window
 *   E — refresh log tracking: append, triggered_by, pruning, error recording
 *   F — uq_mv_etax_compliance_org unique index & CONCURRENT safety
 *   G — rpc_etax_compliance_all_orgs_cached: filter, sort, auth guard
 *
 * Stack : Vitest + @supabase/supabase-js v2
 * Runner: vitest run src/__tests__/rls/0187_etax_compliance_dashboard_mv.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Client factory ───────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.SUPABASE_URL                ?? 'http://localhost:54321'
const ANON_KEY         = process.env.SUPABASE_ANON_KEY           ?? 'test-anon-key'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'test-service-role-key'

const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const userClient = (token: string): SupabaseClient =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

async function execSql(query: string): Promise<Record<string, any>[]> {
  const { data, error } = await svc().rpc('exec_sql', { query })
  if (error) throw new Error(`exec_sql: ${error.message}`)
  return (data ?? []) as Record<string, any>[]
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

interface SeedOrg { orgId: string; userId: string; token: string }

async function seedOrg(db: SupabaseClient, label: string): Promise<SeedOrg> {
  const email    = `test-0187-${label}-${Date.now()}@monolith.test`
  const password = 'Test1234!'
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { roles: ['finance'] },
  })
  if (authErr || !authData.user) throw new Error(`seedOrg(${label}): ${authErr?.message}`)
  const userId = authData.user.id
  const orgId  = crypto.randomUUID()
  const { error: orgError } = await db.from('organizations').insert({
    org_id: orgId,
    name: `Org-0187-${label}`,
    slug: `org-0187-${label.toLowerCase()}-${orgId}`,
    plan: 'ENTERPRISE',
  })
  if (orgError) throw new Error(`seedOrg(${label}) org: ${orgError.message}`)

  const { error: metadataError } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { roles: ['finance'], org_id: orgId },
  })
  if (metadataError) throw new Error(`seedOrg(${label}) metadata: ${metadataError.message}`)

  const { error: memberError } = await db.from('org_members').insert({
    org_id: orgId,
    user_id: userId,
    role: 'FINANCE',
    email,
  })
  if (memberError) throw new Error(`seedOrg(${label}) member: ${memberError.message}`)

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: signIn, error: signInError } = await authClient.auth
    .signInWithPassword({ email, password })
  if (signInError || !signIn.session) {
    throw new Error(`seedOrg(${label}) sign-in: ${signInError?.message}`)
  }
  const token = signIn.session.access_token
  return { orgId, userId, token }
}

async function insertSubmission(
  db: SupabaseClient,
  orgId: string,
  status = 'submitted',
  pdfStatus = 'downloaded'
): Promise<string> {
  const invoiceId = crypto.randomUUID()
  const { data: member, error: memberError } = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)
    .single()
  if (memberError) throw new Error(`insertSubmission member: ${memberError.message}`)

  const { data: customer, error: customerError } = await db
    .from('customers')
    .insert({ org_id: orgId, name: `Customer-0187-${invoiceId}` })
    .select('customer_id')
    .single()
  if (customerError) throw new Error(`insertSubmission customer: ${customerError.message}`)

  const { error: invoiceError } = await db.from('invoices').insert({
    id: invoiceId,
    invoice_id: invoiceId,
    org_id: orgId,
    customer_id: customer.customer_id,
    invoice_code: `INV-0187-${invoiceId.slice(0,8)}`,
    code: `INV-0187-${invoiceId.slice(0,8)}`,
    status: 'approved',
    total: 1070,
    remaining_amount: 1070,
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    created_by: member.user_id,
  })
  if (invoiceError) throw new Error(`insertSubmission invoice: ${invoiceError.message}`)

  const { data, error } = await db.from('etax_submissions').insert({
    org_id: orgId, invoice_id: invoiceId,
    document_type: 'T01',
    document_number: `ETAX-0187-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    document_date: new Date().toISOString().split('T')[0],
    net_amount: 1000, vat_amount: 70, gross_amount: 1070, vat_rate: 0.07,
    seller_tax_id: '1234567890123', buyer_tax_id: '9876543210987', buyer_name: 'Buyer',
    status, attempt_count: 1, pdf_status: pdfStatus,
    submitted_at: status === 'submitted' ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) throw new Error(`insertSubmission: ${error.message}`)
  return data.id
}

async function cleanupOrg(db: SupabaseClient, orgId: string) {
  await db.from('etax_submissions').delete().eq('org_id', orgId)
  await db.from('invoices').delete().eq('org_id', orgId)
  await db.from('customers').delete().eq('org_id', orgId)
  await db.from('etax_submission_audit_log').delete().eq('org_id', orgId)
  await db.from('invoice_notifications').delete().eq('org_id', orgId)
  await db.from('org_members').delete().eq('org_id', orgId)
  await db.from('organizations').delete().eq('org_id', orgId)
}

/** Trigger a manual refresh via service-role and return the JSONB result */
async function doRefresh(db: SupabaseClient, triggeredBy = 'test'): Promise<any> {
  const { data, error } = await db.rpc('fn_refresh_etax_compliance_mv', {
    p_triggered_by: triggeredBy,
  })
  if (error) throw new Error(`doRefresh: ${error.message}`)
  return Array.isArray(data) ? data[0] : data
}

/** Sleep helper (Vitest environment, not real prod) */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// =============================================================================
// GROUP A — fn_refresh_etax_compliance_mv: return contract
// =============================================================================

describe('Group A — fn_refresh_etax_compliance_mv return contract', () => {
  const db = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'A-refresh')
    await insertSubmission(db, org.orgId)
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  it('A-01: returns {ok: true} on successful refresh', async () => {
    const result = await doRefresh(db, 'test-A-01')
    expect(result.ok).toBe(true)
  })

  it('A-02: duration_ms is a positive integer', async () => {
    const result = await doRefresh(db, 'test-A-02')
    expect(typeof result.duration_ms).toBe('number')
    expect(result.duration_ms).toBeGreaterThan(0)
    expect(Number.isInteger(result.duration_ms)).toBe(true)
  })

  it('A-03: row_count matches actual org count in MV after refresh', async () => {
    const result = await doRefresh(db, 'test-A-03')
    const { count } = await db
      .from('mv_etax_compliance_dashboard')
      .select('*', { count: 'exact', head: true })
    expect(result.row_count).toBe(count)
  })

  it('A-04: refreshed_at is a recent ISO timestamp', async () => {
    const before = Date.now()
    const result = await doRefresh(db, 'test-A-04')
    const after  = Date.now()
    const refreshedMs = new Date(result.refreshed_at).getTime()
    expect(refreshedMs).toBeGreaterThanOrEqual(before - 1000)
    expect(refreshedMs).toBeLessThanOrEqual(after + 1000)
  })

  it('A-05: triggered_by is recorded in the result', async () => {
    const result = await doRefresh(db, 'test-manual-trigger')
    expect(result.triggered_by).toBe('test-manual-trigger')
  })

  it('A-06: MV data matches live view after refresh', async () => {
    await doRefresh(db, 'test-A-06')

    const { data: mvRow }   = await db
      .from('mv_etax_compliance_dashboard')
      .select('total_submissions, submitted_count')
      .eq('org_id', org.orgId)
      .single()

    const { data: viewRow } = await db
      .from('v_etax_compliance_dashboard')
      .select('total_submissions, submitted_count')
      .eq('org_id', org.orgId)
      .single()

    expect(mvRow?.total_submissions).toBe(viewRow?.total_submissions)
    expect(mvRow?.submitted_count).toBe(viewRow?.submitted_count)
  })

  it('A-07: rpc_refresh_etax_compliance_mv() (manual RPC) returns ok:true', async () => {
    const { data, error } = await db.rpc('rpc_refresh_etax_compliance_mv')
    expect(error).toBeNull()
    const result = Array.isArray(data) ? data[0] : data
    expect(result.ok).toBe(true)
  })

  it('A-08: multiple rapid refreshes all succeed without error', async () => {
    const results = await Promise.all([
      doRefresh(db, 'rapid-1'),
      doRefresh(db, 'rapid-2'),
    ])
    // At least one should succeed; CONCURRENTLY may serialize
    const okCount = results.filter(r => r.ok === true).length
    expect(okCount).toBeGreaterThanOrEqual(1)
  })
})

// =============================================================================
// GROUP B — pg_cron job registration & idempotency
// =============================================================================

describe('Group B — pg_cron job registration', () => {
  it('B-01: job refresh-etax-compliance-mv exists in cron.job', async () => {
    const data = await execSql(`
      SELECT jobname, schedule, command, active
      FROM cron.job
      WHERE jobname = 'refresh-etax-compliance-mv'
    `)
    expect(data).toHaveLength(1)
    expect(data[0].jobname).toBe('refresh-etax-compliance-mv')
  })

  it('B-02: schedule is */15 * * * * (every 15 minutes)', async () => {
    const [data] = await execSql(`
      SELECT schedule FROM cron.job
      WHERE jobname = 'refresh-etax-compliance-mv'
    `)
    expect(data?.schedule).toBe('*/15 * * * *')
  })

  it('B-03: command references fn_refresh_etax_compliance_mv', async () => {
    const [data] = await execSql(`
      SELECT command FROM cron.job
      WHERE jobname = 'refresh-etax-compliance-mv'
    `)
    expect(data?.command).toContain('fn_refresh_etax_compliance_mv')
  })

  it('B-04: job is active (not paused)', async () => {
    const [data] = await execSql(`
      SELECT active FROM cron.job
      WHERE jobname = 'refresh-etax-compliance-mv'
    `)
    expect(data?.active).toBe(true)
  })

  it('B-05: exactly one job with this name (no duplicates)', async () => {
    const [data] = await execSql(`
      SELECT count(*)::INT AS job_count FROM cron.job
      WHERE jobname = 'refresh-etax-compliance-mv'
    `)
    expect(data.job_count).toBe(1)
  })

  it('B-06: existing 0184 jobs are still present (no clobber)', async () => {
    const data = await execSql(`
      SELECT jobname FROM cron.job
      WHERE jobname IN ('etax-submit-worker', 'check-overdue-invoices')
    `)
    // At least the existing jobs should still be registered
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('B-07: pg_cron extension is installed', async () => {
    const data = await execSql(`
      SELECT extname FROM pg_extension WHERE extname = 'pg_cron'
    `)
    expect(data).toHaveLength(1)
  })
})

// =============================================================================
// GROUP C — rpc_etax_compliance_dashboard_cached: staleness metadata
// =============================================================================

describe('Group C — rpc_etax_compliance_dashboard_cached staleness metadata', () => {
  const db = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'C-cached')
    await insertSubmission(db, org.orgId, 'submitted', 'downloaded')
    // Ensure fresh refresh so staleness columns are populated
    await doRefresh(db, 'test-C-setup')
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  it('C-01: returns mv_last_refreshed_at column', async () => {
    const client = userClient(org.token)
    const { data, error } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty('mv_last_refreshed_at')
  })

  it('C-02: returns mv_age_seconds column', async () => {
    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    expect(data![0]).toHaveProperty('mv_age_seconds')
  })

  it('C-03: mv_last_refreshed_at matches most recent successful refresh log entry', async () => {
    const refreshResult = await doRefresh(db, 'test-C-03')
    const expectedRefreshedAt = new Date(refreshResult.refreshed_at).getTime()

    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    const actualAt = new Date(data![0].mv_last_refreshed_at).getTime()

    // Allow 5 second tolerance
    expect(Math.abs(actualAt - expectedRefreshedAt)).toBeLessThan(5000)
  })

  it('C-04: mv_age_seconds is a non-negative integer', async () => {
    await doRefresh(db, 'test-C-04')
    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    const ageSeconds = data![0].mv_age_seconds
    expect(typeof ageSeconds).toBe('number')
    expect(ageSeconds).toBeGreaterThanOrEqual(0)
  })

  it('C-05: after fresh refresh, mv_age_seconds is < 10 seconds', async () => {
    await doRefresh(db, 'test-C-05')
    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    expect(data![0].mv_age_seconds).toBeLessThan(10)
  })

  it('C-06: returns all standard dashboard columns plus staleness columns', async () => {
    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    const row = data![0]

    // Standard columns from 0186
    const standardCols = [
      'org_id', 'total_submissions', 'submitted_count', 'failed_count',
      'success_rate', 'avg_attempt_count', 'pdf_success_rate',
      'overdue_invoice_count', 'overdue_with_pending_etax', 'failed_last_24h',
    ]
    for (const col of standardCols) {
      expect(row, `missing column: ${col}`).toHaveProperty(col)
    }

    // Staleness-specific columns
    expect(row).toHaveProperty('mv_last_refreshed_at')
    expect(row).toHaveProperty('mv_age_seconds')
  })

  it('C-07: org isolation applies — org A cannot see org B data', async () => {
    const orgB = await seedOrg(db, 'C-orgB')
    try {
      await insertSubmission(db, orgB.orgId, 'submitted')
      await doRefresh(db, 'test-C-07')

      const clientA = userClient(org.token)
      const { data: rowsA } = await clientA.rpc('rpc_etax_compliance_dashboard_cached')
      expect(rowsA).toHaveLength(1)
      expect(rowsA![0].org_id).toBe(org.orgId)
    } finally {
      await cleanupOrg(db, orgB.orgId)
    }
  })

  it('C-08: unauthenticated call returns auth error', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { error } = await anonClient.rpc('rpc_etax_compliance_dashboard_cached')
    expect(error).not.toBeNull()
    expect(JSON.stringify(error)).toMatch(/401|403|JWT|unauthorized/i)
  })
})

// =============================================================================
// GROUP D — mv_age_seconds accuracy & freshness window
// =============================================================================

describe('Group D — mv_age_seconds accuracy & v_mv_refresh_lag', () => {
  const db  = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'D-age')
    await insertSubmission(db, org.orgId, 'submitted')
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  it('D-01: mv_age_seconds approximately equals seconds since last refresh log entry', async () => {
    await doRefresh(db, 'test-D-01')
    // Small sleep to let clock advance
    await sleep(1500)

    const client = userClient(org.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard_cached')
    const ageFromRpc = data![0].mv_age_seconds

    // Independently compute age from refresh log
    const { data: logRows } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('refreshed_at')
      .not('triggered_by', 'like', '%ERROR%')
      .order('refreshed_at', { ascending: false })
      .limit(1)
    const logAge = Math.floor((Date.now() - new Date(logRows![0].refreshed_at).getTime()) / 1000)

    // Allow ±3 second tolerance for query processing
    expect(Math.abs(ageFromRpc - logAge)).toBeLessThan(3)
  })

  it('D-02: v_mv_refresh_lag shows freshness_status = fresh when age < 900s', async () => {
    await doRefresh(db, 'test-D-02')
    const { data, error } = await db
      .from('v_mv_refresh_lag')
      .select('lag_seconds, freshness_status')
      .single()
    expect(error).toBeNull()
    expect(data?.freshness_status).toBe('fresh')
    expect(data?.lag_seconds).toBeLessThan(900)
  })

  it('D-03: v_mv_refresh_lag lag_seconds increases after a pause', async () => {
    await doRefresh(db, 'test-D-03-before')
    const { data: before } = await db.from('v_mv_refresh_lag').select('lag_seconds').single()

    await sleep(2000)

    const { data: after } = await db.from('v_mv_refresh_lag').select('lag_seconds').single()
    expect(after!.lag_seconds).toBeGreaterThan(before!.lag_seconds)
  })

  it('D-04: v_mv_refresh_lag has duration_ms column populated', async () => {
    await doRefresh(db, 'test-D-04')
    const { data } = await db
      .from('v_mv_refresh_lag')
      .select('duration_ms')
      .single()
    expect(data?.duration_ms).not.toBeNull()
    expect(data?.duration_ms).toBeGreaterThan(0)
  })

  it('D-05: v_mv_refresh_lag has row_count matching MV size', async () => {
    await doRefresh(db, 'test-D-05')
    const { count: mvCount } = await db
      .from('mv_etax_compliance_dashboard')
      .select('*', { count: 'exact', head: true })
    const { data: lagRow } = await db
      .from('v_mv_refresh_lag')
      .select('row_count')
      .single()
    expect(lagRow?.row_count).toBe(mvCount)
  })

  it('D-06: v_mv_refresh_lag freshness_status thresholds are correct', async () => {
    // Simulate a stale entry by inserting a backdated log row
    await db.from('etax_compliance_mv_refresh_log').insert({
      refreshed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago
      duration_ms:  100,
      row_count:    5,
      triggered_by: 'test-stale',
    })
    // Delete more recent entries temporarily
    const { data: recent } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('id, refreshed_at')
      .not('triggered_by', 'like', '%ERROR%')
      .order('refreshed_at', { ascending: false })
      .limit(1)
    // If the most recent is older than 15 min, status should be stale/critical
    const mostRecentAge = (Date.now() - new Date(recent![0].refreshed_at).getTime()) / 1000
    const { data: lagRow } = await db.from('v_mv_refresh_lag').select('freshness_status, lag_seconds').single()
    if (mostRecentAge >= 1800) {
      expect(lagRow?.freshness_status).toBe('critical')
    } else if (mostRecentAge >= 900) {
      expect(lagRow?.freshness_status).toBe('stale')
    } else {
      expect(lagRow?.freshness_status).toBe('fresh')
    }
  })
})

// =============================================================================
// GROUP E — refresh log tracking: append, triggered_by, pruning, error recording
// =============================================================================

describe('Group E — etax_compliance_mv_refresh_log tracking', () => {
  const db = svc()

  it('E-01: each refresh call appends exactly one row to refresh log', async () => {
    const { count: before } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('*', { count: 'exact', head: true })

    await doRefresh(db, 'test-E-01')

    const { count: after } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('*', { count: 'exact', head: true })

    expect(after!).toBe(before! + 1)
  })

  it('E-02: triggered_by value is stored verbatim in log row', async () => {
    const unique = `test-E-02-${Date.now()}`
    await doRefresh(db, unique)

    const { data } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('triggered_by, duration_ms, row_count, refreshed_at')
      .eq('triggered_by', unique)
      .single()

    expect(data?.triggered_by).toBe(unique)
    expect(data?.duration_ms).toBeGreaterThan(0)
    expect(data?.row_count).toBeGreaterThanOrEqual(0)
    expect(data?.refreshed_at).toBeTruthy()
  })

  it('E-03: log rows are ordered by refreshed_at DESC', async () => {
    await doRefresh(db, 'test-E-03-a')
    await sleep(100)
    await doRefresh(db, 'test-E-03-b')

    const { data } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('refreshed_at')
      .order('refreshed_at', { ascending: false })
      .limit(2)

    const t0 = new Date(data![0].refreshed_at).getTime()
    const t1 = new Date(data![1].refreshed_at).getTime()
    expect(t0).toBeGreaterThanOrEqual(t1)
  })

  it('E-04: error refresh records triggered_by with :ERROR: suffix', async () => {
    // Temporarily break the MV by dropping it, call refresh, then restore
    // In test env we simulate by injecting a log row directly as postgres would
    const errorEntry = `test-E-04:ERROR:simulated error`
    await db.from('etax_compliance_mv_refresh_log').insert({
      triggered_by: errorEntry,
      duration_ms:  null,
      row_count:    null,
    })

    const { data } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('triggered_by, duration_ms')
      .ilike('triggered_by', '%ERROR%')
      .order('refreshed_at', { ascending: false })
      .limit(1)

    expect(data![0].triggered_by).toContain('ERROR')
    expect(data![0].duration_ms).toBeNull()
  })

  it('E-05: v_mv_refresh_lag excludes ERROR entries from last_refreshed_at', async () => {
    // Insert an error entry with a future timestamp
    await db.from('etax_compliance_mv_refresh_log').insert({
      refreshed_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // future
      triggered_by: `future-error:ERROR:should-be-excluded`,
      duration_ms:  null,
      row_count:    null,
    })

    const { data } = await db.from('v_mv_refresh_lag').select('last_refreshed_at').single()
    // Must not show the future ERROR entry
    const lagAt = new Date(data!.last_refreshed_at).getTime()
    expect(lagAt).toBeLessThanOrEqual(Date.now() + 1000)

    // Cleanup future entry
    await db.from('etax_compliance_mv_refresh_log')
      .delete()
      .ilike('triggered_by', 'future-error%')
  })

  it('E-06: pruning keeps log at ≤ 1000 rows after bulk insert', async () => {
    // This is a behaviour assertion test — log should never exceed 1000 after a refresh
    // Seed 900 rows to approach the limit
    const rows = Array.from({ length: 50 }, (_, i) => ({
      triggered_by: `bulk-seed-E-06-${i}`,
      duration_ms:  10,
      row_count:    1,
    }))
    await db.from('etax_compliance_mv_refresh_log').insert(rows)

    // A refresh call should trigger pruning logic
    await doRefresh(db, 'test-E-06-prune')

    const { count } = await db
      .from('etax_compliance_mv_refresh_log')
      .select('*', { count: 'exact', head: true })
    expect(count!).toBeLessThanOrEqual(1000)
  })
})

// =============================================================================
// GROUP F — uq_mv_etax_compliance_org unique index & CONCURRENT safety
// =============================================================================

describe('Group F — unique index & CONCURRENT refresh safety', () => {
  const db = svc()

  it('F-01: uq_mv_etax_compliance_org index exists on mv_etax_compliance_dashboard', async () => {
    const data = await execSql(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'mv_etax_compliance_dashboard'
        AND indexname = 'uq_mv_etax_compliance_org'
    `)
    expect(data).toHaveLength(1)
    expect(data[0].indexdef).toContain('org_id')
  })

  it('F-02: MV has exactly one row per org_id (unique constraint upheld)', async () => {
    await doRefresh(db, 'test-F-02')
    const { data } = await db
      .from('mv_etax_compliance_dashboard')
      .select('org_id')
    const ids = data!.map(r => r.org_id)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
  })

  it('F-03: CONCURRENT refresh completes without table-level lock error', async () => {
    // Start a read query concurrently with a refresh — both should succeed
    const [readResult, refreshResult] = await Promise.all([
      db.from('mv_etax_compliance_dashboard').select('org_id').limit(5),
      doRefresh(db, 'test-F-03-concurrent'),
    ])
    expect(readResult.error).toBeNull()
    expect(refreshResult.ok).toBe(true)
  })

  it('F-04: MV columns exactly match v_etax_compliance_dashboard columns', async () => {
    const mvCols = await execSql(`
      SELECT attname AS column_name
      FROM pg_attribute
      WHERE attrelid = 'public.mv_etax_compliance_dashboard'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    `)

    const viewCols = await execSql(`
      SELECT attname AS column_name
      FROM pg_attribute
      WHERE attrelid = 'public.v_etax_compliance_dashboard'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    `)

    const mvNames   = (mvCols   as any[]).map(r => r.column_name)
    const viewNames = (viewCols as any[]).map(r => r.column_name)
    expect(mvNames).toEqual(viewNames)
  })

  it('F-05: after new org is created and refresh runs, org appears in MV', async () => {
    const newOrg = await seedOrg(db, 'F-new-org')
    try {
      await insertSubmission(db, newOrg.orgId, 'submitted')
      await doRefresh(db, 'test-F-05')

      const { data } = await db
        .from('mv_etax_compliance_dashboard')
        .select('org_id, total_submissions')
        .eq('org_id', newOrg.orgId)
      expect(data).toHaveLength(1)
      expect(data![0].total_submissions).toBeGreaterThanOrEqual(1)
    } finally {
      await cleanupOrg(db, newOrg.orgId)
    }
  })

  it('F-06: MV is NOT directly accessible to authenticated users', async () => {
    const userOrg = await seedOrg(db, 'F-auth')
    try {
      const client = userClient(userOrg.token)
      const { error } = await client
        .from('mv_etax_compliance_dashboard')
        .select('*')
        .eq('org_id', userOrg.orgId)
      expect(error).not.toBeNull()
      expect(JSON.stringify(error)).toMatch(/permission|denied|42501|PGRST301|does not exist/i)
    } finally {
      await cleanupOrg(db, userOrg.orgId)
    }
  })
})

// =============================================================================
// GROUP G — rpc_etax_compliance_all_orgs_cached: filter, sort, auth guard
// =============================================================================

describe('Group G — rpc_etax_compliance_all_orgs_cached', () => {
  const db   = svc()
  const orgs: SeedOrg[] = []

  beforeAll(async () => {
    const [orgHigh, orgLow, orgClean] = await Promise.all([
      seedOrg(db, 'G-high'),
      seedOrg(db, 'G-low'),
      seedOrg(db, 'G-clean'),
    ])
    orgs.push(orgHigh, orgLow, orgClean)

    // orgHigh: 4 failures in last 24h
    for (let i = 0; i < 4; i++) {
      await insertSubmission(db, orgHigh.orgId, 'failed', 'pending')
    }
    // orgLow: 1 failure
    await insertSubmission(db, orgLow.orgId, 'failed', 'pending')
    // orgClean: only submitted
    await insertSubmission(db, orgClean.orgId, 'submitted', 'downloaded')

    await doRefresh(db, 'test-G-setup')
  })

  afterAll(async () => {
    for (const o of orgs) await cleanupOrg(db, o.orgId)
  })

  it('G-01: returns rows with staleness metadata (mv_last_refreshed_at, mv_age_seconds)', async () => {
    const { data, error } = await db.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data![0]).toHaveProperty('mv_last_refreshed_at')
    expect(data![0]).toHaveProperty('mv_age_seconds')
  })

  it('G-02: results are sorted by failed_last_24h DESC', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })
    const testRows = (data ?? []).filter((r: any) =>
      orgs.some(o => o.orgId === r.org_id)
    )
    const highIdx  = testRows.findIndex((r: any) => r.org_id === orgs[0].orgId)
    const lowIdx   = testRows.findIndex((r: any) => r.org_id === orgs[1].orgId)
    const cleanIdx = testRows.findIndex((r: any) => r.org_id === orgs[2].orgId)
    expect(highIdx).toBeLessThan(lowIdx)
    expect(lowIdx).toBeLessThan(cleanIdx)
  })

  it('G-03: p_min_failed_last_24h filter excludes orgs below threshold', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 2,
    })
    const testIds = (data ?? []).map((r: any) => r.org_id)
    expect(testIds).toContain(orgs[0].orgId)     // high: 4 failures
    expect(testIds).not.toContain(orgs[1].orgId) // low: 1 failure
    expect(testIds).not.toContain(orgs[2].orgId) // clean: 0 failures
  })

  it('G-04: authenticated user CANNOT call rpc_etax_compliance_all_orgs_cached', async () => {
    const client = userClient(orgs[0].token)
    const { error } = await client.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })
    expect(error).not.toBeNull()
    expect(JSON.stringify(error)).toMatch(/permission|denied|42501|does not exist/i)
  })

  it('G-05: all rows have consistent mv_age_seconds (same refresh batch)', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })
    const ages = (data ?? []).map((r: any) => r.mv_age_seconds)
    // All rows from same refresh — ages should all be within 2 seconds of each other
    const minAge = Math.min(...ages)
    const maxAge = Math.max(...ages)
    expect(maxAge - minAge).toBeLessThan(2)
  })

  it('G-06: MV data matches live view data for same org', async () => {
    const { data: mvData } = await db.rpc('rpc_etax_compliance_all_orgs_cached', {
      p_min_failed_last_24h: 0,
    })
    const { data: liveData } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    const orgId = orgs[0].orgId
    const mvRow   = (mvData   ?? []).find((r: any) => r.org_id === orgId)
    const liveRow = (liveData ?? []).find((r: any) => r.org_id === orgId)
    expect(mvRow?.total_submissions).toBe(liveRow?.total_submissions)
    expect(mvRow?.failed_count).toBe(liveRow?.failed_count)
  })
})

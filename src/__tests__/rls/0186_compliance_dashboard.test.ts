/**
 * 0186_etax_compliance_dashboard.test.ts
 * =======================================
 * Test suite for Migration 0186 — v_etax_compliance_dashboard view,
 * rpc_etax_compliance_dashboard (org-scoped), and
 * rpc_etax_compliance_all_orgs (service-role / admin).
 *
 * Groups:
 *   A — rpc_etax_compliance_dashboard org isolation
 *   B — success_rate calculation accuracy
 *   C — overdue_with_pending_etax logic
 *   D — rpc_etax_compliance_all_orgs ordering & filter
 *   E — metric accuracy (avg_attempt, pdf_rate, failed_last_24h, audit)
 *   F — view column completeness & NULL safety
 *
 * Setup: each group seeds its own isolated orgs via createClient(service_role).
 * Teardown: per-group cleanup to avoid cross-contamination.
 *
 * Stack: Vitest + @supabase/supabase-js v2
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Client factory ───────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://localhost:54321'
const ANON_KEY          = process.env.SUPABASE_ANON_KEY ?? 'test-anon-key'
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key'

const svc = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Create an authenticated client impersonating a specific user */
const userClient = (accessToken: string): SupabaseClient =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

// ─── Seed helpers ─────────────────────────────────────────────────────────────

interface SeedOrg {
  orgId:   string
  userId:  string
  token:   string
}

/**
 * Create a fresh org + member + sign-in token.
 * Returns orgId, userId, and a valid JWT access token for that user.
 */
async function seedOrg(
  db: SupabaseClient,
  label: string
): Promise<SeedOrg> {
  const email    = `test-0186-${label}-${Date.now()}@monolith.test`
  const password = 'Test1234!'

  // Create auth user
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { roles: ['finance'] },
  })
  if (authErr || !authData.user) throw new Error(`seedOrg(${label}) auth: ${authErr?.message}`)
  const userId = authData.user.id

  // Create organisation
  const orgId = crypto.randomUUID()
  const { error: orgErr } = await db
    .from('organizations')
    .insert({ org_id: orgId, name: `Org-0186-${label}`, slug: `org-0186-${label}-${orgId}` })
  if (orgErr) throw new Error(`seedOrg(${label}) org: ${orgErr.message}`)

  const { error: metadataErr } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { roles: ['finance'], org_id: orgId },
  })
  if (metadataErr) throw new Error(`seedOrg(${label}) metadata: ${metadataErr.message}`)

  // Add member
  const { error: memErr } = await db
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role: 'FINANCE', email })
  if (memErr) throw new Error(`seedOrg(${label}) member: ${memErr.message}`)

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({ email, password })
  if (signErr || !signIn.session) throw new Error(`seedOrg(${label}) sign-in: ${signErr?.message}`)
  const token = signIn.session.access_token

  return { orgId, userId, token }
}

async function ensureInvoice(
  db: SupabaseClient,
  orgId: string,
  invoiceId: string,
  dueDate: string,
): Promise<void> {
  const { data: member, error: memberError } = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)
    .single()
  if (memberError) throw new Error(`ensureInvoice member: ${memberError.message}`)

  const { data: existingCustomer, error: customerError } = await db
    .from('customers')
    .select('customer_id')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  if (customerError) throw new Error(`ensureInvoice customer lookup: ${customerError.message}`)

  let customer = existingCustomer
  if (!customer) {
    const inserted = await db
      .from('customers')
      .insert({ org_id: orgId, name: `Compliance Test Customer ${orgId}` })
      .select('customer_id')
      .single()
    if (inserted.error) throw new Error(`ensureInvoice customer: ${inserted.error.message}`)
    customer = inserted.data
  }

  const { error } = await db.from('invoices').upsert({
    id: invoiceId,
    invoice_id: invoiceId,
    org_id: orgId,
    invoice_code: `INV-0186-${invoiceId}`,
    customer_id: customer.customer_id,
    status: 'approved',
    total: 1070,
    remaining_amount: 1070,
    due_date: dueDate,
    created_by: member.user_id,
  }, { onConflict: 'id' })
  if (error) throw new Error(`ensureInvoice: ${error.message}`)
}

/** Insert etax_submissions with specified status/attempt/pdf fields */
async function insertSubmissions(
  db: SupabaseClient,
  orgId: string,
  rows: Array<{
    invoiceId?:    string
    documentType?: string
    status:        string
    attemptCount?: number
    pdfStatus?:    string
    lastAttemptAt?: string   // ISO string, default now()
    createdAt?:     string
    submittedAt?:  string
    rdRefNo?:      string
  }>
): Promise<string[]> {
  const insertedIds: string[] = []
  for (const r of rows) {
    const invoiceId = r.invoiceId ?? crypto.randomUUID()
    await ensureInvoice(
      db,
      orgId,
      invoiceId,
      new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    )

    const { data, error } = await db.from('etax_submissions').insert({
      org_id:          orgId,
      invoice_id:      invoiceId,
      document_type:   r.documentType ?? 'T01',
      document_number: `ETAX-0186-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      document_date:   new Date().toISOString().split('T')[0],
      net_amount:      1000,
      vat_amount:      70,
      gross_amount:    1070,
      vat_rate:        7,
      seller_tax_id:   '1234567890123',
      buyer_tax_id:    '9876543210987',
      buyer_name:      'Test Buyer',
      status:          r.status,
      attempt_count:   r.attemptCount ?? 1,
      pdf_status:      r.pdfStatus ?? 'pending',
      last_attempt_at: r.lastAttemptAt ?? new Date().toISOString(),
      created_at:      r.createdAt ?? new Date().toISOString(),
      submitted_at:    r.submittedAt ?? (r.status === 'submitted' ? new Date().toISOString() : null),
      rd_ref_no:       r.rdRefNo ?? null,
    }).select('id').single()

    if (error) throw new Error(`insertSubmissions: ${error.message}`)
    insertedIds.push(data.id)
  }
  return insertedIds
}

/** Insert invoice_notifications marking an invoice as overdue */
async function insertOverdueNotification(
  db: SupabaseClient,
  orgId: string,
  invoiceId: string,
  opts: {
    type?:   string
    status?: string
    snoozeUntil?: string  // YYYY-MM-DD future date to snooze
  } = {}
): Promise<void> {
  const { error } = await db.from('invoice_notifications').insert({
    org_id:            orgId,
    invoice_id:        invoiceId,
    notification_type: opts.type ?? 'overdue_7d',
    status:            opts.status ?? 'pending',
    days_overdue:      7,
    amount_remaining:  1070,
    invoice_code:      `INV-OD-${invoiceId.slice(0,8)}`,
    snoozed_until:     opts.snoozeUntil ?? null,
  })
  if (error) throw new Error(`insertOverdueNotification: ${error.message}`)
}

/** Clean up all 0186 test data for a given orgId */
async function cleanupOrg(db: SupabaseClient, orgId: string): Promise<void> {
  await db.from('etax_submissions').delete().eq('org_id', orgId)
  await db.from('invoice_notifications').delete().eq('org_id', orgId)
  await db.from('invoices').delete().eq('org_id', orgId)
  await db.from('customers').delete().eq('org_id', orgId)
  await db.from('etax_submission_audit_log').delete().eq('org_id', orgId)
  await db.from('org_members').delete().eq('org_id', orgId)
  await db.from('organizations').delete().eq('org_id', orgId)
}

// ─── Test constants ───────────────────────────────────────────────────────────

const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0]
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0]

// =============================================================================
// GROUP A — rpc_etax_compliance_dashboard org isolation
// =============================================================================

describe('Group A — rpc_etax_compliance_dashboard org isolation', () => {
  const db = svc()
  let orgA: SeedOrg, orgB: SeedOrg

  beforeAll(async () => {
    ;[orgA, orgB] = await Promise.all([
      seedOrg(db, 'A-iso1'),
      seedOrg(db, 'A-iso2'),
    ])
    // Seed 3 submissions for org A, 2 for org B
    await insertSubmissions(db, orgA.orgId, [
      { status: 'submitted', pdfStatus: 'downloaded' },
      { status: 'submitted', pdfStatus: 'downloaded' },
      { status: 'failed',    attemptCount: 3 },
    ])
    await insertSubmissions(db, orgB.orgId, [
      { status: 'submitted' },
      { status: 'queued' },
    ])
  })

  afterAll(async () => {
    await cleanupOrg(db, orgA.orgId)
    await cleanupOrg(db, orgB.orgId)
  })

  it('A-01: org A member sees exactly 1 row belonging to org A', async () => {
    const client = userClient(orgA.token)
    const { data, error } = await client.rpc('rpc_etax_compliance_dashboard')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].org_id).toBe(orgA.orgId)
  })

  it('A-02: org B member sees exactly 1 row belonging to org B', async () => {
    const client = userClient(orgB.token)
    const { data, error } = await client.rpc('rpc_etax_compliance_dashboard')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].org_id).toBe(orgB.orgId)
  })

  it('A-03: org A row does NOT contain org B data', async () => {
    const client = userClient(orgA.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard')
    expect(data![0].total_submissions).toBe(3)   // 3 from A, not 5 total
  })

  it('A-04: org B row totals match only org B submissions', async () => {
    const client = userClient(orgB.token)
    const { data } = await client.rpc('rpc_etax_compliance_dashboard')
    expect(data![0].total_submissions).toBe(2)
    expect(data![0].submitted_count).toBe(1)
    expect(data![0].queued_count).toBe(1)
  })

  it('A-05: org with no submissions returns empty array', async () => {
    // Create a fresh org with no submissions
    const emptyOrg = await seedOrg(db, 'A-empty')
    try {
      const client = userClient(emptyOrg.token)
      const { data, error } = await client.rpc('rpc_etax_compliance_dashboard')
      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    } finally {
      await cleanupOrg(db, emptyOrg.orgId)
    }
  })

  it('A-06: unauthenticated call returns auth error', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    })
    const { data, error } = await anonClient.rpc('rpc_etax_compliance_dashboard')
    expect(error).not.toBeNull()
    // Should be 401 or PGRST301 (JWT required)
    expect(JSON.stringify(error)).toMatch(/401|403|JWT|unauthorized/i)
  })
})

// =============================================================================
// GROUP B — success_rate calculation accuracy
// =============================================================================

describe('Group B — success_rate calculation', () => {
  const db = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'B-rate')
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  beforeEach(async () => {
    // Clean submissions before each rate test
    await db.from('etax_submissions').delete().eq('org_id', org.orgId)
  })

  it('B-01: 5 submitted, 0 failed, 0 cancelled → 100.00%', async () => {
    await insertSubmissions(db, org.orgId, Array(5).fill({ status: 'submitted' }))
    const { data } = await db.rpc('rpc_etax_compliance_dashboard')
      .eq('org_id', org.orgId)  // service-role direct query equivalent
    // Use view directly via service role
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate')
      .eq('org_id', org.orgId)
    expect(Number(rows![0].success_rate)).toBe(100.0)
  })

  it('B-02: 3 submitted, 1 failed, 1 cancelled → 60.00% (3/5)', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'failed' },
      { status: 'cancelled' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate, submitted_count, failed_count, cancelled_count')
      .eq('org_id', org.orgId)
    expect(Number(rows![0].success_rate)).toBe(60.0)
    expect(rows![0].submitted_count).toBe(3)
    expect(rows![0].failed_count).toBe(1)
    expect(rows![0].cancelled_count).toBe(1)
  })

  it('B-03: all queued/submitting (in-flight) → success_rate is NULL', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'queued' },
      { status: 'queued' },
      { status: 'submitting' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate, queued_count, submitting_count')
      .eq('org_id', org.orgId)
    expect(rows![0].success_rate).toBeNull()
    expect(rows![0].queued_count).toBe(2)
    expect(rows![0].submitting_count).toBe(1)
  })

  it('B-04: queued rows excluded from denominator (not dragging down rate)', async () => {
    // 2 submitted, 1 failed, 3 queued → rate = 2/(2+1) = 66.67, NOT 2/6
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted' },
      { status: 'submitted' },
      { status: 'failed' },
      { status: 'queued' },
      { status: 'queued' },
      { status: 'queued' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate, total_submissions')
      .eq('org_id', org.orgId)
    expect(rows![0].total_submissions).toBe(6)
    expect(Number(rows![0].success_rate)).toBeCloseTo(66.67, 1)
  })

  it('B-05: 1 submitted, 1 failed → 50.00%', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted' },
      { status: 'failed' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate')
      .eq('org_id', org.orgId)
    expect(Number(rows![0].success_rate)).toBe(50.0)
  })

  it('B-06: 0 submitted, 1 failed → 0.00%', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'failed' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('success_rate')
      .eq('org_id', org.orgId)
    expect(Number(rows![0].success_rate)).toBe(0.0)
  })
})

// =============================================================================
// GROUP C — overdue_with_pending_etax logic
// =============================================================================

describe('Group C — overdue_with_pending_etax logic', () => {
  const db = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'C-overdue')
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  beforeEach(async () => {
    // Wipe per-test state
    await db.from('etax_submissions').delete().eq('org_id', org.orgId)
    await db.from('invoice_notifications').delete().eq('org_id', org.orgId)
    await db.from('invoices').delete().eq('org_id', org.orgId)
  })

  /** Helper: create invoice + overdue notification, optionally with etax row */
  async function setupOverdueCase(opts: {
    etaxStatus?:    string
    notifStatus?:   string
    snoozeUntil?:   string
    notifType?:     string
  }): Promise<string> {
    const invoiceId = crypto.randomUUID()
    await ensureInvoice(db, org.orgId, invoiceId, YESTERDAY)
    await insertOverdueNotification(db, org.orgId, invoiceId, {
      type:       opts.notifType    ?? 'overdue_7d',
      status:     opts.notifStatus  ?? 'pending',
      snoozeUntil: opts.snoozeUntil ?? undefined,
    })
    if (opts.etaxStatus) {
      await db.from('etax_submissions').insert({
        org_id: org.orgId, invoice_id: invoiceId,
        document_type: 'T01',
        document_number: `ETAX-OD-${Date.now()}`,
        document_date: new Date().toISOString().split('T')[0],
        net_amount: 1000, vat_amount: 70, gross_amount: 1070,
        vat_rate: 7, seller_tax_id: '1234567890123',
        buyer_tax_id: '9876543210987', buyer_name: 'Test',
        status: opts.etaxStatus, attempt_count: 1,
        pdf_status: 'pending',
      })
    }
    return invoiceId
  }

  async function getDashboard() {
    const { data } = await db
      .from('v_etax_compliance_dashboard')
      .select('overdue_invoice_count, overdue_with_pending_etax')
      .eq('org_id', org.orgId)
    return data?.[0] ?? { overdue_invoice_count: 0, overdue_with_pending_etax: 0 }
  }

  it('C-01: overdue invoice + queued etax → counted in overdue_with_pending_etax', async () => {
    await setupOverdueCase({ etaxStatus: 'queued' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(1)
    expect(row.overdue_with_pending_etax).toBe(1)
  })

  it('C-02: overdue invoice + failed etax → counted in overdue_with_pending_etax', async () => {
    await setupOverdueCase({ etaxStatus: 'failed' })
    const row = await getDashboard()
    expect(row.overdue_with_pending_etax).toBe(1)
  })

  it('C-03: overdue invoice + submitting etax → counted in overdue_with_pending_etax', async () => {
    await setupOverdueCase({ etaxStatus: 'submitting' })
    const row = await getDashboard()
    expect(row.overdue_with_pending_etax).toBe(1)
  })

  it('C-04: overdue invoice + submitted etax → NOT counted (etax resolved)', async () => {
    await setupOverdueCase({ etaxStatus: 'submitted' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(1)
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-05: overdue invoice + cancelled etax → NOT counted (etax cancelled)', async () => {
    await setupOverdueCase({ etaxStatus: 'cancelled' })
    const row = await getDashboard()
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-06: overdue invoice with no etax record → NOT counted', async () => {
    await setupOverdueCase({})  // no etaxStatus → no etax row
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(1)
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-07: dismissed notification → NOT counted in overdue_invoice_count', async () => {
    await setupOverdueCase({ notifStatus: 'dismissed', etaxStatus: 'queued' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(0)
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-08: snoozed notification (future date) → NOT counted', async () => {
    await setupOverdueCase({ snoozeUntil: TOMORROW, etaxStatus: 'queued' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(0)
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-09: snoozed notification (past date / expired) → IS counted', async () => {
    await setupOverdueCase({ snoozeUntil: YESTERDAY, etaxStatus: 'queued' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(1)
    expect(row.overdue_with_pending_etax).toBe(1)
  })

  it('C-10: due_soon notification type → NOT counted as overdue', async () => {
    // due_soon_3d is not an overdue notification type
    await setupOverdueCase({ notifType: 'due_soon_3d', etaxStatus: 'queued' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(0)
    expect(row.overdue_with_pending_etax).toBe(0)
  })

  it('C-11: 3 overdue invoices, 2 with pending etax, 1 submitted → counts correct', async () => {
    await setupOverdueCase({ etaxStatus: 'queued' })
    await setupOverdueCase({ etaxStatus: 'failed' })
    await setupOverdueCase({ etaxStatus: 'submitted' })
    const row = await getDashboard()
    expect(row.overdue_invoice_count).toBe(3)
    expect(row.overdue_with_pending_etax).toBe(2)
  })
})

// =============================================================================
// GROUP D — rpc_etax_compliance_all_orgs ordering & filter
// =============================================================================

describe('Group D — rpc_etax_compliance_all_orgs ordering & filter', () => {
  const db = svc()
  const orgs: SeedOrg[] = []

  beforeAll(async () => {
    // Create 3 orgs with different failure profiles
    const [orgLow, orgHigh, orgZero] = await Promise.all([
      seedOrg(db, 'D-low'),
      seedOrg(db, 'D-high'),
      seedOrg(db, 'D-zero'),
    ])
    orgs.push(orgLow, orgHigh, orgZero)

    // orgHigh: 5 failures in last 24h
    await insertSubmissions(db, orgHigh.orgId, [
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 1 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 2 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 3 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 4 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 5 * 3600000).toISOString() },
    ])

    // orgLow: 1 failure in last 24h
    await insertSubmissions(db, orgLow.orgId, [
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 1 * 3600000).toISOString() },
      { status: 'submitted' },
    ])

    // orgZero: no failures (only submitted)
    await insertSubmissions(db, orgZero.orgId, [
      { status: 'submitted' },
      { status: 'submitted' },
    ])
  })

  afterAll(async () => {
    for (const o of orgs) await cleanupOrg(db, o.orgId)
  })

  it('D-01: returns multiple orgs sorted by failed_last_24h DESC', async () => {
    const { data, error } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    expect(error).toBeNull()

    // Filter to only our test orgs
    const testRows = (data ?? []).filter((r: any) =>
      orgs.some(o => o.orgId === r.org_id)
    )
    expect(testRows.length).toBeGreaterThanOrEqual(3)

    const highIdx  = testRows.findIndex((r: any) => r.org_id === orgs[1].orgId)
    const lowIdx   = testRows.findIndex((r: any) => r.org_id === orgs[0].orgId)
    const zeroIdx  = testRows.findIndex((r: any) => r.org_id === orgs[2].orgId)

    // High failures must appear before low; low before zero
    expect(highIdx).toBeLessThan(lowIdx)
    expect(lowIdx).toBeLessThan(zeroIdx)
  })

  it('D-02: p_min_failed_last_24h=2 excludes orgs with < 2 failures', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 2,
    })
    const testRows = (data ?? []).filter((r: any) =>
      orgs.some(o => o.orgId === r.org_id)
    )
    // Only orgHigh (5 failures) should appear among test orgs
    const ids = testRows.map((r: any) => r.org_id)
    expect(ids).toContain(orgs[1].orgId)   // orgHigh
    expect(ids).not.toContain(orgs[0].orgId) // orgLow (1 failure)
    expect(ids).not.toContain(orgs[2].orgId) // orgZero (0 failures)
  })

  it('D-03: p_min_failed_last_24h=0 (default) returns all orgs with submissions', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    const testIds = (data ?? []).map((r: any) => r.org_id)
    for (const o of orgs) {
      expect(testIds).toContain(o.orgId)
    }
  })

  it('D-04: orgHigh has failed_last_24h = 5', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    const row = (data ?? []).find((r: any) => r.org_id === orgs[1].orgId)
    expect(row).toBeDefined()
    expect(row.failed_last_24h).toBe(5)
  })

  it('D-05: orgZero has failed_last_24h = 0 and success_rate = 100.00', async () => {
    const { data } = await db.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    const row = (data ?? []).find((r: any) => r.org_id === orgs[2].orgId)
    expect(row).toBeDefined()
    expect(row.failed_last_24h).toBe(0)
    expect(Number(row.success_rate)).toBe(100.0)
  })

  it('D-06: authenticated user CANNOT call rpc_etax_compliance_all_orgs', async () => {
    const client = userClient(orgs[0].token)
    const { data, error } = await client.rpc('rpc_etax_compliance_all_orgs', {
      p_min_failed_last_24h: 0,
    })
    // Must fail: function is revoked from authenticated
    expect(error).not.toBeNull()
    expect(JSON.stringify(error)).toMatch(/permission|denied|42501|not exist/i)
  })

  it('D-07: failures older than 24h NOT included in failed_last_24h', async () => {
    const oldOrg = await seedOrg(db, 'D-old')
    try {
      // Insert a failure from 25 hours ago
      await insertSubmissions(db, oldOrg.orgId, [{
        status: 'failed',
        lastAttemptAt: new Date(Date.now() - 25 * 3600000).toISOString(),
      }])
      const { data } = await db.rpc('rpc_etax_compliance_all_orgs', {
        p_min_failed_last_24h: 0,
      })
      const row = (data ?? []).find((r: any) => r.org_id === oldOrg.orgId)
      expect(row.failed_last_24h).toBe(0)
      expect(row.failed_count).toBe(1)  // total failed still counts it
    } finally {
      await cleanupOrg(db, oldOrg.orgId)
    }
  })
})

// =============================================================================
// GROUP E — metric accuracy (avg_attempt, pdf_rate, failed_last_24h, audit)
// =============================================================================

describe('Group E — metric accuracy', () => {
  const db = svc()
  let org: SeedOrg

  beforeAll(async () => {
    org = await seedOrg(db, 'E-metrics')
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  beforeEach(async () => {
    await db.from('etax_submissions').delete().eq('org_id', org.orgId)
    await db.from('etax_submission_audit_log').delete().eq('org_id', org.orgId)
  })

  it('E-01: avg_attempt_count is correct average', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted', attemptCount: 1 },
      { status: 'submitted', attemptCount: 3 },
      { status: 'failed',    attemptCount: 5 },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('avg_attempt_count, max_attempt_count')
      .eq('org_id', org.orgId)
    // avg = (1+3+5)/3 = 3.00
    expect(Number(rows![0].avg_attempt_count)).toBeCloseTo(3.0, 1)
    expect(rows![0].max_attempt_count).toBe(5)
  })

  it('E-02: submissions_with_pdf_downloaded counts only downloaded rows', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted', pdfStatus: 'downloaded' },
      { status: 'submitted', pdfStatus: 'downloaded' },
      { status: 'submitted', pdfStatus: 'pending' },
      { status: 'submitted', pdfStatus: 'failed' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('submissions_with_pdf_downloaded, pdf_success_rate, submitted_count')
      .eq('org_id', org.orgId)
    expect(rows![0].submissions_with_pdf_downloaded).toBe(2)
    // pdf_rate = 2/4 = 50.00%
    expect(Number(rows![0].pdf_success_rate)).toBe(50.0)
  })

  it('E-03: pdf_success_rate is NULL when submitted_count is 0', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'queued', pdfStatus: 'pending' },
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('pdf_success_rate')
      .eq('org_id', org.orgId)
    expect(rows![0].pdf_success_rate).toBeNull()
  })

  it('E-04: failed_last_24h counts only failures within 24h window', async () => {
    await insertSubmissions(db, org.orgId, [
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 1 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 23 * 3600000).toISOString() },
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 25 * 3600000).toISOString() }, // outside 24h
      { status: 'failed', lastAttemptAt: new Date(Date.now() - 48 * 3600000).toISOString() }, // outside 24h
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('failed_last_24h, failed_count')
      .eq('org_id', org.orgId)
    expect(rows![0].failed_count).toBe(4)       // total
    expect(rows![0].failed_last_24h).toBe(2)    // only within 24h
  })

  it('E-05: last_audit_event_at reflects most recent audit log entry', async () => {
    const [subId] = await insertSubmissions(db, org.orgId, [
      { status: 'submitted' },
    ])

    // Wait for trigger-created audit row then insert a manual one with known timestamp
    const knownTime = new Date(Date.now() - 5000).toISOString()
    await db.from('etax_submission_audit_log').insert({
      submission_id:  subId,
      org_id:         org.orgId,
      old_status:     'queued',
      new_status:     'submitted',
      trigger_source: 'worker',
      attempt_count:  1,
      changed_at:     knownTime,
    })

    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('last_audit_event_at')
      .eq('org_id', org.orgId)

    const auditAt = new Date(rows![0].last_audit_event_at)
    // last_audit_event_at should be >= knownTime
    expect(auditAt.getTime()).toBeGreaterThanOrEqual(new Date(knownTime).getTime() - 1000)
  })

  it('E-06: last_audit_event_at is NULL for org with no audit rows', async () => {
    await insertSubmissions(db, org.orgId, [{ status: 'queued' }])
    // Ensure no audit rows exist for this org
    await db.from('etax_submission_audit_log').delete().eq('org_id', org.orgId)

    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('last_audit_event_at')
      .eq('org_id', org.orgId)
    expect(rows![0].last_audit_event_at).toBeNull()
  })

  it('E-07: oldest_unresolved_failed_at is earliest failed submission with no submitted_at', async () => {
    const old = new Date(Date.now() - 72 * 3600000).toISOString()
    const recent = new Date(Date.now() - 1 * 3600000).toISOString()
    await insertSubmissions(db, org.orgId, [
      { status: 'failed', lastAttemptAt: old, createdAt: old },
      { status: 'failed', lastAttemptAt: recent, createdAt: recent },
      { status: 'submitted' },  // has submitted_at — excluded from oldest_unresolved
    ])
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('oldest_unresolved_failed_at')
      .eq('org_id', org.orgId)
    const oldest = new Date(rows![0].oldest_unresolved_failed_at)
    const oldDate = new Date(old)
    // Should be close to the earlier failure time
    expect(Math.abs(oldest.getTime() - oldDate.getTime())).toBeLessThan(5000)
  })
})

// =============================================================================
// GROUP F — view column completeness & NULL safety
// =============================================================================

describe('Group F — view column completeness & NULL safety', () => {
  const db  = svc()
  let org: SeedOrg

  const EXPECTED_COLUMNS = [
    'org_id',
    'total_submissions',
    'submitted_count',
    'failed_count',
    'cancelled_count',
    'queued_count',
    'submitting_count',
    'success_rate',
    'avg_attempt_count',
    'max_attempt_count',
    'submissions_with_pdf_downloaded',
    'pdf_success_rate',
    'last_submission_at',
    'last_failed_at',
    'oldest_unresolved_failed_at',
    'failed_last_24h',
    'last_audit_event_at',
    'overdue_invoice_count',
    'overdue_with_pending_etax',
  ] as const

  beforeAll(async () => {
    org = await seedOrg(db, 'F-cols')
    await insertSubmissions(db, org.orgId, [
      { status: 'submitted', pdfStatus: 'downloaded', attemptCount: 2,
        submittedAt: new Date().toISOString() },
      { status: 'failed', attemptCount: 5,
        lastAttemptAt: new Date(Date.now() - 1800000).toISOString() },
    ])
  })

  afterAll(async () => {
    await cleanupOrg(db, org.orgId)
  })

  it('F-01: all expected columns are present in view output', async () => {
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('*')
      .eq('org_id', org.orgId)
    expect(rows).toHaveLength(1)
    const row = rows![0]
    for (const col of EXPECTED_COLUMNS) {
      expect(row).toHaveProperty(col)
    }
  })

  it('F-02: rpc_etax_compliance_dashboard returns all expected columns', async () => {
    const client = userClient(org.token)
    const { data, error } = await client.rpc('rpc_etax_compliance_dashboard')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const row = data![0]
    for (const col of EXPECTED_COLUMNS) {
      expect(row).toHaveProperty(col)
    }
  })

  it('F-03: overdue_invoice_count defaults to 0 (not NULL) when no notifications', async () => {
    // org has submissions but no invoice_notifications
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('overdue_invoice_count, overdue_with_pending_etax')
      .eq('org_id', org.orgId)
    expect(rows![0].overdue_invoice_count).toBe(0)
    expect(rows![0].overdue_with_pending_etax).toBe(0)
  })

  it('F-04: last_audit_event_at is NULL (not error) when no audit rows', async () => {
    const noAuditOrg = await seedOrg(db, 'F-noaudit')
    try {
      await insertSubmissions(db, noAuditOrg.orgId, [{ status: 'queued' }])
      await db.from('etax_submission_audit_log').delete().eq('org_id', noAuditOrg.orgId)

      const { data: rows } = await db
        .from('v_etax_compliance_dashboard')
        .select('last_audit_event_at')
        .eq('org_id', noAuditOrg.orgId)
      // Must not throw; value must be null
      expect(rows![0].last_audit_event_at).toBeNull()
    } finally {
      await cleanupOrg(db, noAuditOrg.orgId)
    }
  })

  it('F-05: numeric columns are numbers (not strings)', async () => {
    const { data: rows } = await db
      .from('v_etax_compliance_dashboard')
      .select('total_submissions, success_rate, avg_attempt_count, failed_last_24h')
      .eq('org_id', org.orgId)
    const row = rows![0]
    expect(typeof row.total_submissions).toBe('number')
    expect(typeof row.failed_last_24h).toBe('number')
    // success_rate and avg_attempt_count may be numeric strings from postgres; coerce OK
    expect(Number.isFinite(Number(row.success_rate))).toBe(true)
    expect(Number.isFinite(Number(row.avg_attempt_count))).toBe(true)
  })

  it('F-06: view is NOT directly accessible to authenticated (only via RPC)', async () => {
    // Direct PostgREST query to the view should be blocked
    const client = userClient(org.token)
    const { data, error } = await client
      .from('v_etax_compliance_dashboard')
      .select('*')
      .eq('org_id', org.orgId)
    // Should fail: view is not granted to authenticated
    expect(error).not.toBeNull()
    expect(JSON.stringify(error)).toMatch(/permission|denied|42501|not exist|does not exist/i)
  })

  it('F-07: last_submission_at matches latest submitted_at across submissions', async () => {
    const freshOrg = await seedOrg(db, 'F-lsub')
    try {
      const t1 = new Date(Date.now() - 3600000).toISOString()
      const t2 = new Date(Date.now() - 1800000).toISOString()
      await insertSubmissions(db, freshOrg.orgId, [
        { status: 'submitted', submittedAt: t1 },
        { status: 'submitted', submittedAt: t2 },
      ])
      const { data: rows } = await db
        .from('v_etax_compliance_dashboard')
        .select('last_submission_at')
        .eq('org_id', freshOrg.orgId)
      const lastAt = new Date(rows![0].last_submission_at).getTime()
      const t2Ms   = new Date(t2).getTime()
      expect(Math.abs(lastAt - t2Ms)).toBeLessThan(2000)
    } finally {
      await cleanupOrg(db, freshOrg.orgId)
    }
  })
})

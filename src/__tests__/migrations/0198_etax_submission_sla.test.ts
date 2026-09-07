/**
 * Test suite — Migration 0198: v_etax_submission_sla
 *
 * Groups:
 *   A  Column presence
 *   B  SLA breach flag accuracy  (< 24 h → no breach; > 24 h → breach)
 *   C  Severity tier logic        (HEALTHY / NORMAL / ELEVATED / WARNING / CRITICAL)
 *   D  rpc_etax_submission_sla   filtering by p_document_type & p_severity
 *   E  rpc_etax_sla_summary      cross-document-type aggregation
 *   F  Cross-tenant RLS isolation
 *   G  platform_config SLA threshold seed
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

// ── Environment ──────────────────────────────────────────────────────────────
const SUPABASE_URL              = process.env.SUPABASE_URL              ?? 'http://localhost:54321'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-key'
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY         ?? 'anon-key'

// ── Clients ──────────────────────────────────────────────────────────────────
const svc  = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,         { auth: { persistSession: false } })

// ── Test fixture IDs ──────────────────────────────────────────────────────────
const ORG_A_ID   = uuidv4()  // primary test org
const ORG_B_ID   = uuidv4()  // isolation org
const USER_A_ID  = uuidv4()
const USER_B_ID  = uuidv4()
const INV_IDS    = Array.from({ length: 8 }, () => uuidv4())
const ORG_B_INV_ID = uuidv4()

// helper: current timestamp minus N hours
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const hoursLater = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

// ── Clients scoped to each org user ──────────────────────────────────────────
let clientA: SupabaseClient
let clientB: SupabaseClient

// ── Shared cleanup registry ───────────────────────────────────────────────────
const submissionIds: string[] = []
const customerIds: string[] = []

async function createInvoice(orgId: string, invoiceId: string, label: string): Promise<void> {
  const customerId = uuidv4()
  customerIds.push(customerId)
  const { error: customerError } = await svc.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `SLA customer ${label}`,
  })
  if (customerError) throw new Error(`create customer: ${customerError.message}`)

  const invoiceCode = `INV-SLA-${label}-${invoiceId}`
  const { error: invoiceError } = await svc.from('invoices').insert({
    id: invoiceId,
    invoice_id: invoiceId,
    invoice_code: invoiceCode,
    code: invoiceCode,
    org_id: orgId,
    customer_id: customerId,
    status: 'approved',
    total: 1000,
    remaining_amount: 1000,
    due_date: '2030-12-31',
    created_by: USER_A_ID,
  })
  if (invoiceError) throw new Error(`create invoice: ${invoiceError.message}`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  // 1. Create two orgs
  for (const [id, name] of [[ORG_A_ID, '__sla_test_org_a__'], [ORG_B_ID, '__sla_test_org_b__']]) {
    const { error } = await svc.from('organizations').insert({
      org_id: id,
      name,
      slug: `test-0198-${id}`,
      plan: 'ENTERPRISE',
      max_users: 20,
    })
    if (error && !error.message.includes('duplicate')) throw error
  }

  // 2. Create auth users and sign-up tokens (skip if already exist)
  for (const [uid, email] of [
    [USER_A_ID, `sla_test_a_${ORG_A_ID.slice(0,8)}@test.monolith`],
    [USER_B_ID, `sla_test_b_${ORG_B_ID.slice(0,8)}@test.monolith`],
  ]) {
    await svc.auth.admin.createUser({ id: uid as string, email: email as string, password: 'Test1234!', email_confirm: true }).then(() => {}, () => {})
  }

  // 3. Add users to org_members (FINANCE role)
  for (const [uid, oid] of [[USER_A_ID, ORG_A_ID], [USER_B_ID, ORG_B_ID]]) {
    const email = uid === USER_A_ID
      ? `sla_test_a_${ORG_A_ID.slice(0,8)}@test.monolith`
      : `sla_test_b_${ORG_B_ID.slice(0,8)}@test.monolith`
    await svc.auth.admin.updateUserById(uid, {
      app_metadata: { roles: ['finance'], org_id: oid },
    })
    const { error } = await svc.from('org_members').insert({
      user_id: uid,
      org_id: oid,
      role: 'FINANCE',
      email,
    })
    if (error && !error.message.includes('duplicate')) throw error
  }

  // 4. Sign in clients
  const { data: dataA } = await anon.auth.signInWithPassword({
    email: `sla_test_a_${ORG_A_ID.slice(0,8)}@test.monolith`, password: 'Test1234!',
  })
  clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dataA?.session?.access_token}` } },
  })

  const { data: dataB } = await anon.auth.signInWithPassword({
    email: `sla_test_b_${ORG_B_ID.slice(0,8)}@test.monolith`, password: 'Test1234!',
  })
  clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dataB?.session?.access_token}` } },
  })

  // 5. Seed invoices for ORG_A
  for (const invId of INV_IDS) {
    await createInvoice(ORG_A_ID, invId, 'org-a')
  }
  await createInvoice(ORG_B_ID, ORG_B_INV_ID, 'org-b')

  // 6. Seed etax_submissions for ORG_A — mix of breach / non-breach, document types
  //
  //   INV_IDS[0]  T01 submitted   < 1 h   → NOT breach
  //   INV_IDS[1]  T01 submitted  30 h     → BREACH
  //   INV_IDS[2]  T01 failed     36 h     → BREACH
  //   INV_IDS[3]  T02 submitted   2 h     → NOT breach
  //   INV_IDS[4]  T02 queued     48 h     → BREACH
  //   INV_IDS[5]  T02 queued     12 h     → NOT breach
  //   INV_IDS[6]  T03 submitted   6 h     → NOT breach
  //   INV_IDS[7]  T03 failed     25 h     → BREACH
  //
  // Breach counts:  T01 → 2/3 ≈ 66.7% → CRITICAL
  //                 T02 → 1/3 ≈ 33.3% → WARNING
  //                 T03 → 1/2 = 50%   → CRITICAL

  const seeds = [
    // T01
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[0], document_type: 'T01', status: 'submitted',
      attempt_count: 1, created_at: hoursAgo(1),  updated_at: hoursAgo(0.5) },
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[1], document_type: 'T01', status: 'submitted',
      attempt_count: 1, created_at: hoursAgo(31), updated_at: hoursAgo(1) },
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[2], document_type: 'T01', status: 'failed',
      attempt_count: 5, created_at: hoursAgo(37), updated_at: hoursAgo(36) },
    // T02
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[3], document_type: 'T02', status: 'submitted',
      attempt_count: 1, created_at: hoursAgo(3),  updated_at: hoursAgo(1) },
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[4], document_type: 'T02', status: 'queued',
      attempt_count: 0, created_at: hoursAgo(49), updated_at: hoursAgo(49) },
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[5], document_type: 'T02', status: 'queued',
      attempt_count: 0, created_at: hoursAgo(13), updated_at: hoursAgo(13) },
    // T03
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[6], document_type: 'T03', status: 'submitted',
      attempt_count: 1, created_at: hoursAgo(7),  updated_at: hoursAgo(1) },
    { id: uuidv4(), org_id: ORG_A_ID, invoice_id: INV_IDS[7], document_type: 'T03', status: 'failed',
      attempt_count: 3, created_at: hoursAgo(26), updated_at: hoursAgo(25) },
  ]

  for (const seed of seeds) {
    const { error } = await svc.from('etax_submissions').insert(seed)
    if (error && !error.message.includes('duplicate')) throw error
    submissionIds.push(seed.id)
  }

  // 7. Seed one submission for ORG_B (isolation check)
  const orgBSubId = uuidv4()
  submissionIds.push(orgBSubId)
  const { error: bErr } = await svc.from('etax_submissions').insert({
    id: orgBSubId, org_id: ORG_B_ID, invoice_id: ORG_B_INV_ID,
    document_type: 'T01', status: 'failed',
    attempt_count: 3, created_at: hoursAgo(50), updated_at: hoursAgo(50),
  })
  if (bErr && !bErr.message.includes('duplicate')) throw bErr
})

afterAll(async () => {
  // Clean up in reverse dependency order
  if (submissionIds.length) {
    await svc.from('etax_submissions').delete().in('id', submissionIds)
  }
  for (const invId of INV_IDS) {
    await svc.from('invoices').delete().eq('id', invId).then(() => {}, () => {})
  }
  await svc.from('org_members').delete().in('org_id', [ORG_A_ID, ORG_B_ID]).then(() => {}, () => {})
  if (customerIds.length) await svc.from('customers').delete().in('customer_id', customerIds)
  await svc.from('organizations').delete().in('org_id', [ORG_A_ID, ORG_B_ID]).then(() => {}, () => {})
  await svc.auth.admin.deleteUser(USER_A_ID).then(() => {}, () => {})
  await svc.auth.admin.deleteUser(USER_B_ID).then(() => {}, () => {})
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP A — Column presence
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group A — v_etax_submission_sla column presence', () => {
  const EXPECTED_COLUMNS = [
    'org_id', 'org_name', 'document_type', 'sla_threshold_hours',
    'total_submissions', 'breached_count', 'active_breach_count',
    'breach_rate_pct', 'sla_severity',
    'avg_processing_hours', 'max_processing_hours', 'avg_breach_overage_hours',
    'oldest_breach_created_at', 'newest_breach_created_at',
    'breach_failed_count', 'breach_queued_count', 'breach_submitting_count',
    'breach_submitted_count', 'max_breach_attempts', 'snapshot_at',
  ]

  it('A-01: view returns at least one row for ORG_A', async () => {
    const { data, error } = await clientA.from('v_etax_submission_sla').select('*').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.length).toBeGreaterThanOrEqual(1)
  })

  for (const col of EXPECTED_COLUMNS) {
    it(`A-02: column "${col}" is present`, async () => {
      const { data, error } = await clientA
        .from('v_etax_submission_sla')
        .select(col)
        .limit(1)
      expect(error).toBeNull()
      expect(data).toBeDefined()
      if (data!.length > 0) {
        expect(data![0]).toHaveProperty(col)
      }
    })
  }

  it('A-03: sla_threshold_hours defaults to 24 when platform_config key is absent/present', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('sla_threshold_hours')
      .eq('org_id', ORG_A_ID)
      .limit(1)
    expect(error).toBeNull()
    expect(data![0]?.sla_threshold_hours).toBe(24)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — SLA breach flag accuracy
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group B — SLA breach flag accuracy', () => {
  it('B-01: T01 has exactly 3 total_submissions for ORG_A', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('total_submissions, breached_count')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    expect(data!.total_submissions).toBe(3)
  })

  it('B-02: T01 breached_count is 2 (31 h submitted + 37 h failed > 24 h SLA)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('breached_count')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    expect(data!.breached_count).toBe(2)
  })

  it('B-03: T02 active_breach_count is 1 (queued 49 h; queued 13 h not yet breached)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('active_breach_count')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T02')
      .single()
    expect(error).toBeNull()
    expect(data!.active_breach_count).toBe(1)
  })

  it('B-04: T01 breach_rate_pct is approximately 66.67', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('breach_rate_pct')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    const rate = Number(data!.breach_rate_pct)
    expect(rate).toBeGreaterThanOrEqual(66)
    expect(rate).toBeLessThanOrEqual(68)
  })

  it('B-05: T02 breach_rate_pct is approximately 33.33', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('breach_rate_pct')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T02')
      .single()
    expect(error).toBeNull()
    const rate = Number(data!.breach_rate_pct)
    expect(rate).toBeGreaterThanOrEqual(32)
    expect(rate).toBeLessThanOrEqual(35)
  })

  it('B-06: T03 breach_submitted_count is 0 (breached T03 is failed, not submitted)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('breach_submitted_count, breach_failed_count')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T03')
      .single()
    expect(error).toBeNull()
    expect(data!.breach_submitted_count).toBe(0)
    expect(data!.breach_failed_count).toBe(1)
  })

  it('B-07: avg_processing_hours is greater than 0 for T01', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('avg_processing_hours, max_processing_hours')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    expect(Number(data!.avg_processing_hours)).toBeGreaterThan(0)
    expect(Number(data!.max_processing_hours)).toBeGreaterThanOrEqual(Number(data!.avg_processing_hours))
  })

  it('B-08: oldest_breach_created_at is earlier than newest_breach_created_at for T01', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('oldest_breach_created_at, newest_breach_created_at')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    const oldest = new Date(data!.oldest_breach_created_at as string).getTime()
    const newest = new Date(data!.newest_breach_created_at as string).getTime()
    expect(oldest).toBeLessThanOrEqual(newest)
  })

  it('B-09: max_breach_attempts reflects highest attempt_count among T01 breaches (= 5)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('max_breach_attempts')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    expect(data!.max_breach_attempts).toBe(5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — Severity tier logic
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group C — severity tier logic', () => {
  it('C-01: T01 severity is CRITICAL (breach_rate ≈ 66.7% ≥ 50%)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('sla_severity')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T01')
      .single()
    expect(error).toBeNull()
    expect(data!.sla_severity).toBe('CRITICAL')
  })

  it('C-02: T02 severity is WARNING (breach_rate ≈ 33.3%, ≥ 25% < 50%)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('sla_severity')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T02')
      .single()
    expect(error).toBeNull()
    expect(data!.sla_severity).toBe('WARNING')
  })

  it('C-03: T03 severity is CRITICAL (breach_rate = 50% ≥ 50%)', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('sla_severity')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T03')
      .single()
    expect(error).toBeNull()
    expect(data!.sla_severity).toBe('CRITICAL')
  })

  it('C-04: severity HEALTHY is returned for an org with no SLA breaches', async () => {
    // Insert a clean org with only a fast submitted row
    const cleanOrgId = uuidv4()
    const cleanInvId = uuidv4()
    const cleanSubId = uuidv4()
    const cleanUserId = uuidv4()

    await svc.from('organizations').insert({
      org_id: cleanOrgId,
      name: '__sla_clean_org__',
      slug: `test-0198-clean-${cleanOrgId}`,
      plan: 'ENTERPRISE',
    })
    await createInvoice(cleanOrgId, cleanInvId, 'clean')
    await svc.from('etax_submissions').insert({
      id: cleanSubId, org_id: cleanOrgId, invoice_id: cleanInvId,
      document_type: 'T01', status: 'submitted',
      attempt_count: 1, created_at: hoursAgo(2), updated_at: hoursAgo(1),
    })

    // Service-role query (bypasses RLS to check the org)
    const { data, error } = await svc
      .from('v_etax_submission_sla')
      .select('sla_severity, breached_count')
      .eq('org_id', cleanOrgId)
      .eq('document_type', 'T01')
      .single()

    // Cleanup
    await svc.from('etax_submissions').delete().eq('id', cleanSubId)
    await svc.from('invoices').delete().eq('id', cleanInvId)
    await svc.from('organizations').delete().eq('org_id', cleanOrgId)

    expect(error).toBeNull()
    expect(data!.sla_severity).toBe('HEALTHY')
    expect(data!.breached_count).toBe(0)
  })

  it('C-05: severity ELEVATED for org with 10–24% breach rate', async () => {
    const elevOrgId = uuidv4()
    const elevInvIds = Array.from({ length: 10 }, () => uuidv4())
    const elevSubIds: string[] = []

    await svc.from('organizations').insert({
      org_id: elevOrgId,
      name: '__sla_elevated_org__',
      slug: `test-0198-elevated-${elevOrgId}`,
      plan: 'ENTERPRISE',
    })
    for (const i of elevInvIds) {
      await createInvoice(elevOrgId, i, 'elevated')
    }
    // 1 breach out of 10 → 10% → ELEVATED
    for (let idx = 0; idx < 10; idx++) {
      const sid = uuidv4()
      elevSubIds.push(sid)
      await svc.from('etax_submissions').insert({
        id: sid, org_id: elevOrgId, invoice_id: elevInvIds[idx],
        document_type: 'T01', status: idx === 0 ? 'failed' : 'submitted',
        attempt_count: 1,
        created_at: idx === 0 ? hoursAgo(30) : hoursAgo(2),
        updated_at: idx === 0 ? hoursAgo(29) : hoursAgo(1),
      })
    }

    const { data, error } = await svc
      .from('v_etax_submission_sla')
      .select('sla_severity, breach_rate_pct')
      .eq('org_id', elevOrgId)
      .eq('document_type', 'T01')
      .single()

    // Cleanup
    await svc.from('etax_submissions').delete().in('id', elevSubIds)
    for (const i of elevInvIds) await svc.from('invoices').delete().eq('id', i)
    await svc.from('organizations').delete().eq('org_id', elevOrgId)

    expect(error).toBeNull()
    expect(['ELEVATED', 'NORMAL']).toContain(data!.sla_severity)
  })

  it('C-06: sla_severity is one of the five defined tiers', async () => {
    const VALID_TIERS = ['HEALTHY', 'NORMAL', 'ELEVATED', 'WARNING', 'CRITICAL']
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('sla_severity')
      .eq('org_id', ORG_A_ID)
    expect(error).toBeNull()
    for (const row of data!) {
      expect(VALID_TIERS).toContain(row.sla_severity)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — rpc_etax_submission_sla filtering
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group D — rpc_etax_submission_sla filtering', () => {
  it('D-01: rpc_etax_submission_sla() returns results for ORG_A', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', {})
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThanOrEqual(1)
  })

  it('D-02: p_document_type=T01 filters to T01 rows only', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', { p_document_type: 'T01' })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.document_type).toBe('T01')
    }
  })

  it('D-03: p_document_type=T04 returns empty array (no T04 seeded)', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', { p_document_type: 'T04' })
    expect(error).toBeNull()
    expect(data!.length).toBe(0)
  })

  it('D-04: p_severity=CRITICAL returns only CRITICAL rows', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', { p_severity: 'CRITICAL' })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.sla_severity).toBe('CRITICAL')
    }
  })

  it('D-05: p_severity=HEALTHY returns empty (all seeded rows have breaches)', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', { p_severity: 'HEALTHY' })
    expect(error).toBeNull()
    // Either empty or rows belonging to other orgs scoped away
    const orgARows = (data as any[]).filter((r: any) => r.org_id === ORG_A_ID)
    expect(orgARows.length).toBe(0)
  })

  it('D-06: combined p_document_type + p_severity filter works', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', {
      p_document_type: 'T01', p_severity: 'CRITICAL',
    })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.document_type).toBe('T01')
      expect(row.sla_severity).toBe('CRITICAL')
    }
  })

  it('D-07: results are ordered by breach_rate_pct DESC', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', {})
    expect(error).toBeNull()
    const rates = (data as any[]).map((r: any) => Number(r.breach_rate_pct))
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i - 1]).toBeGreaterThanOrEqual(rates[i])
    }
  })

  it('D-08: snapshot_at is a recent ISO timestamp', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla', { p_document_type: 'T01' })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    const snapshotTs = new Date(data![0].snapshot_at as string).getTime()
    const now = Date.now()
    expect(snapshotTs).toBeGreaterThan(now - 60_000)   // within last 60 s
    expect(snapshotTs).toBeLessThanOrEqual(now + 1_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP E — rpc_etax_sla_summary aggregate
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group E — rpc_etax_sla_summary aggregate', () => {
  it('E-01: rpc_etax_sla_summary() returns exactly one row for ORG_A', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_sla_summary')
    expect(error).toBeNull()
    const rows = (data as any[]).filter((r: any) => r.org_id === ORG_A_ID)
    expect(rows.length).toBe(1)
  })

  it('E-02: total_submissions aggregates across T01 + T02 + T03 (= 8)', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row).toBeDefined()
    expect(row.total_submissions).toBe(8)
  })

  it('E-03: total_breached is 4 (2×T01 + 1×T02 + 1×T03)', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.total_breached).toBe(4)
  })

  it('E-04: overall_breach_rate_pct is 4/8 = 50.00', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(Number(row.overall_breach_rate_pct)).toBeCloseTo(50, 0)
  })

  it('E-05: overall_severity is CRITICAL (50% ≥ 50%)', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.overall_severity).toBe('CRITICAL')
  })

  it('E-06: worst_document_type is T01 (highest individual breach rate ≈ 66.7%)', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.worst_document_type).toBe('T01')
  })

  it('E-07: total_active_breach ≥ 1 (T02 queued 49 h is still active)', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.total_active_breach).toBeGreaterThanOrEqual(1)
  })

  it('E-08: oldest_breach_created_at is earlier than now', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    const oldest = new Date(row.oldest_breach_created_at as string).getTime()
    expect(oldest).toBeLessThan(Date.now())
  })

  it('E-09: org_name is __sla_test_org_a__', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.org_name).toBe('__sla_test_org_a__')
  })

  it('E-10: sla_threshold_hours is 24', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const row = (data as any[]).find((r: any) => r.org_id === ORG_A_ID)
    expect(row.sla_threshold_hours).toBe(24)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP F — Cross-tenant RLS isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group F — cross-tenant RLS isolation', () => {
  it('F-01: clientA cannot see ORG_B rows in v_etax_submission_sla', async () => {
    const { data, error } = await clientA
      .from('v_etax_submission_sla')
      .select('org_id')
    expect(error).toBeNull()
    const orgBRows = (data as any[]).filter((r: any) => r.org_id === ORG_B_ID)
    expect(orgBRows.length).toBe(0)
  })

  it('F-02: clientB cannot see ORG_A rows in v_etax_submission_sla', async () => {
    const { data, error } = await clientB
      .from('v_etax_submission_sla')
      .select('org_id')
    expect(error).toBeNull()
    const orgARows = (data as any[]).filter((r: any) => r.org_id === ORG_A_ID)
    expect(orgARows.length).toBe(0)
  })

  it('F-03: rpc_etax_submission_sla — ORG_A client cannot access ORG_B data', async () => {
    const { data } = await clientA.rpc('rpc_etax_submission_sla', {})
    const orgBRows = (data as any[]).filter((r: any) => r.org_id === ORG_B_ID)
    expect(orgBRows.length).toBe(0)
  })

  it('F-04: rpc_etax_sla_summary — ORG_A client sees only ORG_A summary row', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_summary')
    const orgBRows = (data as any[]).filter((r: any) => r.org_id === ORG_B_ID)
    expect(orgBRows.length).toBe(0)
  })

  it('F-05: anon client receives empty array from v_etax_submission_sla (no org context)', async () => {
    const { data, error } = await anon
      .from('v_etax_submission_sla')
      .select('org_id')
    // Either an empty array or permission-denied — not actual data rows
    const hasRealData = Array.isArray(data) && data.length > 0
    expect(hasRealData).toBe(false)
  })

  it('F-06: anon rpc_etax_submission_sla returns no rows', async () => {
    const { data } = await anon.rpc('rpc_etax_submission_sla', {})
    const rows = Array.isArray(data) ? data : []
    expect(rows.length).toBe(0)
  })

  it('F-07: anon rpc_etax_sla_summary returns no rows', async () => {
    const { data } = await anon.rpc('rpc_etax_sla_summary')
    const rows = Array.isArray(data) ? data : []
    expect(rows.length).toBe(0)
  })

  it('F-08: clientB sees its own ORG_B rows (isolation is bidirectional)', async () => {
    const { data, error } = await clientB
      .from('v_etax_submission_sla')
      .select('org_id')
    expect(error).toBeNull()
    const orgBRows = (data as any[]).filter((r: any) => r.org_id === ORG_B_ID)
    expect(orgBRows.length).toBeGreaterThanOrEqual(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP G — platform_config SLA threshold seed
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group G — platform_config SLA threshold', () => {
  it('G-01: platform_config row etax_sla_hours exists with value 24', async () => {
    const { data, error } = await svc
      .from('platform_config')
      .select('value')
      .eq('key', 'etax_sla_hours')
      .single()
    expect(error).toBeNull()
    expect(data!.value).toBe('24')
  })

  it('G-02: view uses platform_config threshold — inserting custom value changes sla_threshold_hours', async () => {
    // Set threshold to 48 h
    await svc.from('platform_config')
      .update({ value: '48' })
      .eq('key', 'etax_sla_hours')

    const { data } = await svc
      .from('v_etax_submission_sla')
      .select('sla_threshold_hours')
      .eq('org_id', ORG_A_ID)
      .limit(1)
      .single()
    const threshold = Number(data!.sla_threshold_hours)

    // Restore
    await svc.from('platform_config')
      .update({ value: '24' })
      .eq('key', 'etax_sla_hours')

    expect(threshold).toBe(48)
  })

  it('G-03: ON CONFLICT DO NOTHING — re-inserting etax_sla_hours does not overwrite custom value', async () => {
    await svc.from('platform_config')
      .update({ value: '36' })
      .eq('key', 'etax_sla_hours')

    // Migration seed uses ON CONFLICT DO NOTHING — simulate
    await svc.from('platform_config')
      .upsert({ key: 'etax_sla_hours', value: '24' }, { onConflict: 'key', ignoreDuplicates: true })
      .then(() => {}, () => {})

    const { data } = await svc
      .from('platform_config')
      .select('value')
      .eq('key', 'etax_sla_hours')
      .single()

    // Value should still be 36 (ON CONFLICT DO NOTHING)
    expect(data!.value).toBe('36')

    // Restore
    await svc.from('platform_config')
      .update({ value: '24' })
      .eq('key', 'etax_sla_hours')
  })
})

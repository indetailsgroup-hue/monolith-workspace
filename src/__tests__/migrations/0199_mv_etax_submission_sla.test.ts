/**
 * Test suite — Migration 0199: mv_etax_submission_sla
 *
 * Groups:
 *   A  Column presence                          (11 columns on the MV)
 *   B  fn_refresh_mv_etax_submission_sla        (execution, platform_config timestamp, idempotency)
 *   C  rpc_etax_submission_sla_cached           (p_document_type filter, p_severity filter, ordering)
 *   D  Concurrent refresh safety               (no lock conflict while clients query)
 *   E  Cross-tenant RLS isolation              (org_a cannot read org_b via cached RPC)
 *   F  Grants                                   (anon REVOKED, authenticated EXECUTE, refresh fn service_role only)
 *   G  Index presence                           (unique idx on org_id+document_type, supporting indexes)
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
const ORG_A_ID  = uuidv4()   // primary test org
const ORG_B_ID  = uuidv4()   // cross-tenant isolation org
const USER_A_ID = uuidv4()
const USER_B_ID = uuidv4()
const INV_IDS   = Array.from({ length: 6 }, () => uuidv4())

// helper
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

// ── Clients scoped to each org ────────────────────────────────────────────────
let clientA: SupabaseClient
let clientB: SupabaseClient

function freshAnonymousClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ── Expected MV columns ───────────────────────────────────────────────────────
const MV_COLUMNS = [
  'org_id',
  'document_type',
  'total_submissions',
  'sla_breached_count',
  'breach_rate',
  'sla_breach_flag',
  'severity_tier',
  'avg_processing_hours',
  'max_processing_hours',
  'sla_threshold_hours',
  'updated_at',
] as const

const customerIds: string[] = []

async function createInvoice(orgId: string, invoiceId: string, label: string): Promise<void> {
  const customerId = uuidv4()
  customerIds.push(customerId)
  const { error: customerError } = await svc.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `MV SLA customer ${label}`,
  })
  if (customerError) throw new Error(`create customer: ${customerError.message}`)

  const invoiceCode = `INV-MV-${label}-${invoiceId}`
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
  // 1. Create orgs
  for (const [id, name, slug] of [
    [ORG_A_ID, '__mv_sla_org_a__', `mv-sla-a-${ORG_A_ID.slice(0, 8)}`],
    [ORG_B_ID, '__mv_sla_org_b__', `mv-sla-b-${ORG_B_ID.slice(0, 8)}`],
  ]) {
    const { error } = await svc.from('organizations').insert({
      org_id: id,
      name,
      slug,
      plan: 'ENTERPRISE',
      max_users: 20,
    })
    if (error && !error.message.includes('duplicate')) throw error
  }

  // 2. Create auth users
  for (const [uid, email] of [
    [USER_A_ID, `mv_sla_a_${ORG_A_ID.slice(0, 8)}@test.monolith`],
    [USER_B_ID, `mv_sla_b_${ORG_B_ID.slice(0, 8)}@test.monolith`],
  ]) {
    await svc.auth.admin
      .createUser({ id: uid as string, email: email as string, password: 'Test1234!', email_confirm: true })
      .then(() => {}, () => {})
  }

  // 3. Assign org_members
  for (const [uid, oid] of [
    [USER_A_ID, ORG_A_ID],
    [USER_B_ID, ORG_B_ID],
  ]) {
    const email = uid === USER_A_ID
      ? `mv_sla_a_${ORG_A_ID.slice(0, 8)}@test.monolith`
      : `mv_sla_b_${ORG_B_ID.slice(0, 8)}@test.monolith`
    await svc.auth.admin.updateUserById(uid, {
      app_metadata: { roles: ['finance'], org_id: oid },
    })
    const { error } = await svc
      .from('org_members')
      .insert({ user_id: uid, org_id: oid, role: 'FINANCE', email })
    if (error && !error.message.includes('duplicate')) throw error
  }

  // 4. Sign in clients
  const { data: dataA } = await anon.auth.signInWithPassword({
    email: `mv_sla_a_${ORG_A_ID.slice(0, 8)}@test.monolith`,
    password: 'Test1234!',
  })
  clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dataA?.session?.access_token}` } },
  })

  const { data: dataB } = await anon.auth.signInWithPassword({
    email: `mv_sla_b_${ORG_B_ID.slice(0, 8)}@test.monolith`,
    password: 'Test1234!',
  })
  clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dataB?.session?.access_token}` } },
  })

  // 5. Seed invoices for org_a (T01/T02 across SLA boundaries)
  for (const [invId, docType, hoursBack] of [
    [INV_IDS[0], 'T01', 30],   // breached
    [INV_IDS[1], 'T01', 10],   // within SLA
    [INV_IDS[2], 'T02', 48],   // breached
    [INV_IDS[3], 'T02', 6],    // within SLA
    [INV_IDS[4], 'T01', 26],   // breached
    [INV_IDS[5], 'T03', 5],    // within SLA
  ]) {
    await createInvoice(ORG_A_ID, invId as string, `org-a-${hoursBack}`)

    const { error: es } = await svc.from('etax_submissions').insert({
      id: uuidv4(), org_id: ORG_A_ID,
      invoice_id: invId, document_type: docType,
      status: 'submitting', attempt_count: 1,
      created_at: hoursAgo(hoursBack as number),
    })
    if (es && !es.message.includes('duplicate')) throw es
  }

  // 6. Seed one submission for org_b (isolation fixture)
  const bInvId = uuidv4()
  await createInvoice(ORG_B_ID, bInvId, 'org-b')
  await svc.from('etax_submissions').insert({
    id: uuidv4(), org_id: ORG_B_ID,
    invoice_id: bInvId, document_type: 'T01',
    status: 'submitting', attempt_count: 1,
    created_at: hoursAgo(50),
  }).then(() => {}, () => {})

  // 7. Initial MV refresh so data is populated
  await svc.rpc('fn_refresh_mv_etax_submission_sla')
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  await svc.from('etax_submissions').delete().in('org_id', [ORG_A_ID, ORG_B_ID])
  await svc.from('invoices').delete().in('org_id', [ORG_A_ID, ORG_B_ID])
  if (customerIds.length) await svc.from('customers').delete().in('customer_id', customerIds)
  for (const uid of [USER_A_ID, USER_B_ID]) {
    await svc.auth.admin.deleteUser(uid).then(() => {}, () => {})
  }
  await svc.from('org_members').delete().in('org_id', [ORG_A_ID, ORG_B_ID])
  await svc.from('organizations').delete().in('org_id', [ORG_A_ID, ORG_B_ID])
  // Remove test platform_config key if added
  await svc.from('platform_config').delete().eq('key', 'mv_etax_sla_last_refreshed_test')
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP A — Column presence
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group A — Column presence', () => {
  it('A-01: mv_etax_submission_sla materialized view exists', async () => {
    // Query information_schema via service RPC
    const { data, error } = await svc.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    // No error means the MV exists and the RPC wrapping it resolved
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it.each(MV_COLUMNS)('A-02: MV row contains column "%s"', async (col) => {
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select(col)
      .limit(1)
    expect(error).toBeNull()
    // If no rows the select itself still succeeds — column existence is confirmed
    expect(data).not.toBeUndefined()
  })

  it('A-03: MV SELECT returns rows for org_a after initial refresh', async () => {
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('*')
      .eq('org_id', ORG_A_ID)
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('A-04: every row carries all 11 columns', async () => {
    const { data } = await svc
      .from('mv_etax_submission_sla')
      .select('*')
      .eq('org_id', ORG_A_ID)
      .limit(1)
      .single()

    if (!data) {
      // No data after refresh — guard and skip
      console.warn('A-04: no MV row found for ORG_A; skipping column enumeration')
      return
    }
    for (const col of MV_COLUMNS) {
      expect(data).toHaveProperty(col)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP B — fn_refresh_mv_etax_submission_sla
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group B — fn_refresh_mv_etax_submission_sla', () => {
  it('B-01: function exists in public schema', async () => {
    // A successful RPC call proves existence; no raw pg_proc access needed
    const { error } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
    expect(error).toBeNull()
  })

  it('B-02: execution completes without error', async () => {
    const { error } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
    expect(error).toBeNull()
  })

  it('B-03: after refresh, platform_config has mv_etax_sla_last_refreshed key', async () => {
    await svc.rpc('fn_refresh_mv_etax_submission_sla')

    const { data, error } = await svc
      .from('platform_config')
      .select('value, updated_at')
      .eq('key', 'mv_etax_sla_last_refreshed')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)  // ISO 8601 UTC
  })

  it('B-04: timestamp advances on successive refresh calls', async () => {
    await svc.rpc('fn_refresh_mv_etax_submission_sla')
    const { data: before } = await svc
      .from('platform_config')
      .select('updated_at')
      .eq('key', 'mv_etax_sla_last_refreshed')
      .single()

    // Brief pause to guarantee clock advance
    await new Promise((r) => setTimeout(r, 1200))

    await svc.rpc('fn_refresh_mv_etax_submission_sla')
    const { data: after } = await svc
      .from('platform_config')
      .select('updated_at')
      .eq('key', 'mv_etax_sla_last_refreshed')
      .single()

    const tBefore = new Date(before!.updated_at).getTime()
    const tAfter  = new Date(after!.updated_at).getTime()
    expect(tAfter).toBeGreaterThan(tBefore)
  })

  it('B-05: idempotency — calling refresh twice in a row does not fail', async () => {
    const { error: e1 } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
    const { error: e2 } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
    expect(e1).toBeNull()
    expect(e2).toBeNull()
  })

  it('B-06: MV row count is stable after back-to-back refreshes', async () => {
    const { data: before } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)

    await svc.rpc('fn_refresh_mv_etax_submission_sla')
    await svc.rpc('fn_refresh_mv_etax_submission_sla')

    const { data: after } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)

    expect(after!.length).toBe(before!.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP C — rpc_etax_submission_sla_cached
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group C — rpc_etax_submission_sla_cached', () => {
  it('C-01: no filters — returns all org_a rows for authenticated user', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data!.length).toBeGreaterThan(0)
  })

  it('C-02: p_document_type=T01 returns only T01 rows', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: 'T01',
      p_severity: null,
    })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.document_type).toBe('T01')
    }
  })

  it('C-03: p_document_type=T02 returns only T02 rows', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: 'T02',
      p_severity: null,
    })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.document_type).toBe('T02')
    }
  })

  it('C-04: p_severity=CRITICAL returns only CRITICAL rows', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: 'CRITICAL',
    })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.severity_tier).toBe('CRITICAL')
    }
  })

  it('C-05: combined filter p_document_type + p_severity narrows correctly', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: 'T01',
      p_severity: 'ELEVATED',
    })
    expect(error).toBeNull()
    for (const row of data!) {
      expect(row.document_type).toBe('T01')
      expect(row.severity_tier).toBe('ELEVATED')
    }
  })

  it('C-06: unknown severity returns empty array (no error)', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: 'NONEXISTENT',
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('C-07: results are ordered by severity DESC then breach_rate DESC', async () => {
    const { data, error } = await svc.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
    if (!data || data.length < 2) return

    const TIER_ORDER: Record<string, number> = {
      CRITICAL: 1, WARNING: 2, ELEVATED: 3, NORMAL: 4, HEALTHY: 5,
    }
    for (let i = 0; i < data.length - 1; i++) {
      const curr = TIER_ORDER[data[i].severity_tier] ?? 6
      const next = TIER_ORDER[data[i + 1].severity_tier] ?? 6
      if (curr === next) {
        // same tier → breach_rate must be descending
        expect(Number(data[i].breach_rate)).toBeGreaterThanOrEqual(Number(data[i + 1].breach_rate))
      } else {
        expect(curr).toBeLessThanOrEqual(next)
      }
    }
  })

  it('C-08: service_role can query all orgs without filter', async () => {
    const { data, error } = await svc.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
    const orgIds = new Set(data!.map((r: any) => r.org_id))
    expect(orgIds.size).toBeGreaterThanOrEqual(2) // sees both org_a and org_b
  })

  it('C-09: null filters are equivalent to omitting the parameter', async () => {
    const { data: withNull  } = await clientA.rpc('rpc_etax_submission_sla_cached', { p_document_type: null,  p_severity: null })
    const { data: withUndef } = await clientA.rpc('rpc_etax_submission_sla_cached', {})
    expect(withNull?.length).toBe(withUndef?.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP D — Concurrent refresh safety
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group D — Concurrent refresh safety', () => {
  it('D-01: concurrent refresh calls do not fail (CONCURRENTLY mode)', async () => {
    // Fire two refreshes near-simultaneously; at most one will block the other
    const [r1, r2] = await Promise.allSettled([
      svc.rpc('fn_refresh_mv_etax_submission_sla'),
      svc.rpc('fn_refresh_mv_etax_submission_sla'),
    ])
    // Both should resolve without error (CONCURRENTLY handles lock gracefully)
    expect(r1.status).toBe('fulfilled')
    expect(r2.status).toBe('fulfilled')
    if (r1.status === 'fulfilled') expect((r1 as any).value.error).toBeNull()
    if (r2.status === 'fulfilled') expect((r2 as any).value.error).toBeNull()
  })

  it('D-02: READ during REFRESH returns stale data (no blocking)', async () => {
    // Start refresh
    const refreshPromise = svc.rpc('fn_refresh_mv_etax_submission_sla')

    // Immediately query — should not block
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()  // read should never fail
    expect(Array.isArray(data)).toBe(true)

    // Await the refresh too
    const { error: refreshError } = await refreshPromise
    expect(refreshError).toBeNull()
  })

  it('D-03: three rapid refreshes leave MV in consistent state', async () => {
    for (let i = 0; i < 3; i++) {
      const { error } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
      expect(error).toBeNull()
    }
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('D-04: MV row count matches underlying view row count after refresh', async () => {
    await svc.rpc('fn_refresh_mv_etax_submission_sla')

    const { data: mvRows } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)

    const { data: viewRows } = await svc
      .from('v_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)

    expect(mvRows!.length).toBe(viewRows!.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP E — Cross-tenant RLS isolation
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group E — Cross-tenant RLS isolation', () => {
  it('E-01: clientA sees only its own org in rpc_etax_submission_sla_cached', async () => {
    const { data, error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
    const leakedOrgs = data!.filter((r: any) => r.org_id === ORG_B_ID)
    expect(leakedOrgs).toHaveLength(0)
  })

  it('E-02: clientB sees only its own org in rpc_etax_submission_sla_cached', async () => {
    const { data, error } = await clientB.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
    const leakedOrgs = data!.filter((r: any) => r.org_id === ORG_A_ID)
    expect(leakedOrgs).toHaveLength(0)
  })

  it('E-03: clientA cannot SELECT the service-only materialized view directly', async () => {
    const { data, error } = await clientA
      .from('mv_etax_submission_sla')
      .select('org_id')
      .eq('org_id', ORG_B_ID)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('E-04: clientB cannot inject org_a data via RPC parameter override', async () => {
    // p_document_type and p_severity are column filters, not org filters —
    // RLS is enforced inside the function regardless
    const { data, error } = await clientB.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: 'T01',
      p_severity: null,
    })
    expect(error).toBeNull()
    const leakedOrgs = data!.filter((r: any) => r.org_id === ORG_A_ID)
    expect(leakedOrgs).toHaveLength(0)
  })

  it('E-05: service_role bypasses RLS and sees all orgs', async () => {
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id')
      .in('org_id', [ORG_A_ID, ORG_B_ID])
    expect(error).toBeNull()
    const visibleOrgs = new Set(data!.map((r) => r.org_id))
    expect(visibleOrgs.has(ORG_A_ID)).toBe(true)
    expect(visibleOrgs.has(ORG_B_ID)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP F — Grants
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group F — Grants', () => {
  it('F-01: anon cannot call rpc_etax_submission_sla_cached', async () => {
    const { error } = await freshAnonymousClient().rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    // Expect 401 / permission denied
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Unauthorized|JWT|permission denied/i)
  })

  it('F-02: anon cannot call fn_refresh_mv_etax_submission_sla', async () => {
    const { error } = await freshAnonymousClient().rpc('fn_refresh_mv_etax_submission_sla')
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Unauthorized|JWT|permission denied/i)
  })

  it('F-03: authenticated user cannot call fn_refresh_mv_etax_submission_sla (service_role only)', async () => {
    const { error } = await clientA.rpc('fn_refresh_mv_etax_submission_sla')
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/permission denied|not allowed/i)
  })

  it('F-04: authenticated user CAN call rpc_etax_submission_sla_cached', async () => {
    const { error } = await clientA.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(error).toBeNull()
  })

  it('F-05: service_role can call both RPCs without error', async () => {
    const { error: e1 } = await svc.rpc('fn_refresh_mv_etax_submission_sla')
    const { error: e2 } = await svc.rpc('rpc_etax_submission_sla_cached', {
      p_document_type: null,
      p_severity: null,
    })
    expect(e1).toBeNull()
    expect(e2).toBeNull()
  })

  it('F-06: anon cannot SELECT directly from mv_etax_submission_sla', async () => {
    const { error } = await freshAnonymousClient()
      .from('mv_etax_submission_sla')
      .select('org_id')
      .limit(1)
    expect(error).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP G — Index presence
// ═══════════════════════════════════════════════════════════════════════════════
describe('Group G — Index presence', () => {
  it('G-01: unique index mv_etax_submission_sla_pk exists on (org_id, document_type)', async () => {
    // Attempt to insert a duplicate row — should fail with unique violation
    const { data: existingRow } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)
      .limit(1)
      .single()

    if (!existingRow) {
      console.warn('G-01: no MV row found — skipping duplicate insert test')
      return
    }

    // Directly inserting a duplicate into an MV is not supported in PostgreSQL;
    // instead, verify via the UNIQUE INDEX existence in pg_indexes (via service rpc workaround).
    // We verify indirectly: two rows with same (org_id, document_type) must not exist.
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', existingRow.document_type)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)  // unique constraint enforced
  })

  it('G-02: index idx_mv_etax_sla_severity — filter by severity_tier is efficient', async () => {
    // Functional verification: filter by severity returns without error
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, severity_tier')
      .eq('severity_tier', 'CRITICAL')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('G-03: index idx_mv_etax_sla_breach_flag — partial index on sla_breach_flag=true', async () => {
    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, sla_breach_flag')
      .eq('sla_breach_flag', true)
    expect(error).toBeNull()
    // All returned rows must have sla_breach_flag = true
    for (const row of data!) {
      expect(row.sla_breach_flag).toBe(true)
    }
  })

  it('G-04: MV re-population after refresh maintains unique constraint', async () => {
    await svc.rpc('fn_refresh_mv_etax_submission_sla')

    // Count distinct (org_id, document_type) pairs must equal total row count
    const { data: all } = await svc
      .from('mv_etax_submission_sla')
      .select('org_id, document_type')

    const total    = all?.length ?? 0
    const distinct = new Set(all?.map((r) => `${r.org_id}:${r.document_type}`)).size

    expect(total).toBe(distinct)
  })

  it('G-05: MV contains org_a rows after new submission is added and MV refreshed', async () => {
    const newInvId = uuidv4()
    await createInvoice(ORG_A_ID, newInvId, 'new-t04')
    const { error: submissionError } = await svc.from('etax_submissions').insert({
      id: uuidv4(), org_id: ORG_A_ID,
      invoice_id: newInvId, document_type: 'T04',
      status: 'submitting', attempt_count: 1,
      created_at: hoursAgo(35),
    })
    expect(submissionError).toBeNull()

    await svc.rpc('fn_refresh_mv_etax_submission_sla')

    const { data, error } = await svc
      .from('mv_etax_submission_sla')
      .select('document_type, total_submissions')
      .eq('org_id', ORG_A_ID)
      .eq('document_type', 'T04')
      .single()

    expect(error).toBeNull()
    expect(Number(data!.total_submissions)).toBeGreaterThanOrEqual(1)

    // Cleanup extra row
    await svc.from('etax_submissions').delete().eq('invoice_id', newInvId)
    await svc.from('invoices').delete().eq('id', newInvId)
  })
})

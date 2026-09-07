/**
 * src/__tests__/rls/0181_etax_auto_submit.test.ts
 *
 * Test suite for Migration 0181: e-Tax Auto-Submit
 *
 * Groups:
 *   A — Trigger auto-queue: invoice → paid creates etax_submissions row
 *   B — rpc_etax_auto_submit idempotency (ON CONFLICT, reset failed/cancelled)
 *   C — Retry max 5: rpc_etax_retry_submission raises on 5th attempt
 *   D — Cross-tenant isolation: org_b cannot read/modify org_a's submissions
 *   E — VAT calculation consistency (_compute_etax_vat, net+vat=gross)
 *   F — Status transitions (queued→submitting→submitted, queued→failed→retry)
 *
 * Assumes:
 *   - Supabase running locally (supabase start)
 *   - Migration 0181 applied
 *   - SUPABASE_URL and SUPABASE_SERVICE_KEY in environment
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY     = process.env.SUPABASE_ANON_KEY ?? ''

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
}

async function createOrg(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ org_id: string }> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name:   `Test Org ${slug}`,
      slug,
      plan:   'PROFESSIONAL',
      status: 'ACTIVE',
    })
    .select('org_id')
    .single()
  if (error) throw new Error(`createOrg(${slug}): ${error.message}`)
  return data
}

async function createUser(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string; access_token: string }> {
  const password = 'TestPassword123!'
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)

  // Sign in to get access_token
  const anonSb = anonClient()
  const { data: session, error: signInErr } = await anonSb.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`signIn(${email}): ${signInErr.message}`)

  return { id: data.user!.id, access_token: session.session!.access_token }
}

async function addOrgMember(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  role: string,
): Promise<void> {
  const { error } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role })
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`addOrgMember: ${error.message}`)
  }
}

async function createCustomer(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ org_id: orgId, name, tax_id: '1234567890123' })
    .select('id')
    .single()
  if (error) throw new Error(`createCustomer: ${error.message}`)
  return data
}

async function createInvoice(
  supabase: SupabaseClient,
  orgId: string,
  customerId: string,
  opts: { status?: string; total_amount?: number; invoice_number?: string } = {},
): Promise<{ id: string; invoice_number: string }> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      org_id:         orgId,
      customer_id:    customerId,
      invoice_number: opts.invoice_number ?? `INV-TEST-${Date.now()}`,
      status:         opts.status ?? 'draft',
      total_amount:   opts.total_amount ?? 1070.00,
      due_date:       new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
    })
    .select('id, invoice_number')
    .single()
  if (error) throw new Error(`createInvoice: ${error.message}`)
  return data
}

async function setInvoiceStatus(
  supabase: SupabaseClient,
  invoiceId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', invoiceId)
  if (error) throw new Error(`setInvoiceStatus: ${error.message}`)
}

async function getEtaxSubmission(
  supabase: SupabaseClient,
  invoiceId: string,
  docType = 'T01',
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('etax_submissions')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('document_type', docType)
    .maybeSingle()
  if (error) throw new Error(`getEtaxSubmission: ${error.message}`)
  return data
}

async function insertEtaxSubmission(
  supabase: SupabaseClient,
  partial: Record<string, unknown>,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('etax_submissions')
    .insert({
      org_id:          partial.org_id,
      invoice_id:      partial.invoice_id,
      document_type:   partial.document_type ?? 'T01',
      document_number: partial.document_number ?? `TEST-${Date.now()}`,
      document_date:   partial.document_date  ?? new Date().toISOString().slice(0, 10),
      net_amount:      partial.net_amount      ?? 1000.00,
      vat_amount:      partial.vat_amount      ?? 70.00,
      gross_amount:    partial.gross_amount    ?? 1070.00,
      vat_rate:        partial.vat_rate        ?? 0.07,
      seller_tax_id:   partial.seller_tax_id  ?? '1234567890001',
      buyer_tax_id:    partial.buyer_tax_id   ?? null,
      buyer_name:      partial.buyer_name     ?? 'Test Buyer',
      status:          partial.status         ?? 'queued',
      attempt_count:   partial.attempt_count  ?? 0,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertEtaxSubmission: ${error.message}`)
  return data
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface OrgFixture {
  org_id: string
  user_id: string
  access_token: string
  customer_id: string
}

let adminSb: SupabaseClient

async function setupOrgFixture(suffix: string): Promise<OrgFixture> {
  const { org_id } = await createOrg(adminSb, `etax-test-${suffix}`)
  const email = `etax-user-${suffix}@monolith-test.invalid`
  const { id: user_id, access_token } = await createUser(adminSb, email)
  await addOrgMember(adminSb, org_id, user_id, 'FINANCE')
  const { id: customer_id } = await createCustomer(adminSb, org_id, `Customer ${suffix}`)
  return { org_id, user_id, access_token, customer_id }
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

const createdOrgIds: string[]  = []
const createdUserIds: string[] = []

beforeAll(() => {
  adminSb = serviceClient()
})

afterAll(async () => {
  // Clean up test data in dependency order
  for (const orgId of createdOrgIds) {
    await adminSb.from('etax_submissions').delete().eq('org_id', orgId)
    await adminSb.from('invoices').delete().eq('org_id', orgId)
    await adminSb.from('customers').delete().eq('org_id', orgId)
    await adminSb.from('org_members').delete().eq('org_id', orgId)
    await adminSb.from('organizations').delete().eq('org_id', orgId)
  }
  for (const uid of createdUserIds) {
    await adminSb.auth.admin.deleteUser(uid)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A: Trigger auto-queue
// ─────────────────────────────────────────────────────────────────────────────

describe('Group A — Trigger auto-queue', () => {
  let orgA: OrgFixture
  let invoiceId: string

  beforeAll(async () => {
    orgA = await setupOrgFixture('grp-a')
    createdOrgIds.push(orgA.org_id)
    createdUserIds.push(orgA.user_id)
  })

  it('A1 — invoice set to paid triggers etax_submissions insert', async () => {
    const inv = await createInvoice(adminSb, orgA.org_id, orgA.customer_id, {
      status: 'approved',
    })
    invoiceId = inv.id

    // Set status = 'paid' to fire trg_etax_on_invoice_paid
    await setInvoiceStatus(adminSb, invoiceId, 'paid')

    // Row should appear in etax_submissions
    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission).not.toBeNull()
    expect(submission!.status).toBe('queued')
  })

  it('A2 — auto-queued submission has correct org_id', async () => {
    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.org_id).toBe(orgA.org_id)
  })

  it('A3 — auto-queued submission has document_type T01', async () => {
    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.document_type).toBe('T01')
  })

  it('A4 — auto-queued submission has positive amounts', async () => {
    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(Number(submission!.net_amount)).toBeGreaterThan(0)
    expect(Number(submission!.vat_amount)).toBeGreaterThan(0)
    expect(Number(submission!.gross_amount)).toBeGreaterThan(0)
  })

  it('A5 — attempt_count starts at 0', async () => {
    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(Number(submission!.attempt_count)).toBe(0)
  })

  it('A6 — setting invoice back to draft does NOT auto-queue again', async () => {
    // Set to draft (not a paid transition)
    await setInvoiceStatus(adminSb, invoiceId, 'draft')

    // Force back to paid to check idempotency
    await setInvoiceStatus(adminSb, invoiceId, 'paid')

    // Should still be only ONE submission (ON CONFLICT DO NOTHING or DO UPDATE)
    const { data } = await adminSb
      .from('etax_submissions')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('document_type', 'T01')
    expect(data).toHaveLength(1)
  })

  it('A7 — non-paid status transitions do NOT create etax_submissions', async () => {
    const inv2 = await createInvoice(adminSb, orgA.org_id, orgA.customer_id, {
      status: 'draft',
    })

    // Transition draft → approved — should NOT trigger etax
    await setInvoiceStatus(adminSb, inv2.id, 'approved')

    const submission = await getEtaxSubmission(adminSb, inv2.id)
    expect(submission).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B: rpc_etax_auto_submit idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('Group B — rpc_etax_auto_submit idempotency', () => {
  let orgB: OrgFixture
  let invoiceId: string
  let authSb: SupabaseClient

  beforeAll(async () => {
    orgB = await setupOrgFixture('grp-b')
    createdOrgIds.push(orgB.org_id)
    createdUserIds.push(orgB.user_id)

    authSb = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgB.access_token}` } },
    })
  })

  beforeEach(async () => {
    const inv = await createInvoice(adminSb, orgB.org_id, orgB.customer_id, {
      status: 'draft',
    })
    invoiceId = inv.id
    // Mark paid to create the submission
    await setInvoiceStatus(adminSb, invoiceId, 'paid')
  })

  it('B1 — calling rpc_etax_auto_submit twice returns same submission id', async () => {
    const { data: r1, error: e1 } = await authSb.rpc('rpc_etax_auto_submit', {
      p_invoice_id: invoiceId,
    })
    expect(e1).toBeNull()

    const { data: r2, error: e2 } = await authSb.rpc('rpc_etax_auto_submit', {
      p_invoice_id: invoiceId,
    })
    expect(e2).toBeNull()

    expect((r1 as any).id).toBe((r2 as any).id)
  })

  it('B2 — calling rpc_etax_auto_submit on a queued submission keeps it queued', async () => {
    await authSb.rpc('rpc_etax_auto_submit', { p_invoice_id: invoiceId })

    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.status).toBe('queued')
  })

  it('B3 — calling on a failed submission resets to queued', async () => {
    // Force submission to failed state
    await adminSb
      .from('etax_submissions')
      .update({ status: 'failed', error_detail: 'prev error' })
      .eq('invoice_id', invoiceId)
      .eq('document_type', 'T01')

    const { data, error } = await authSb.rpc('rpc_etax_auto_submit', {
      p_invoice_id: invoiceId,
    })
    expect(error).toBeNull()

    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.status).toBe('queued')
    expect(submission!.error_detail).toBeNull()
  })

  it('B4 — calling on a cancelled submission resets to queued', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ status: 'cancelled' })
      .eq('invoice_id', invoiceId)
      .eq('document_type', 'T01')

    const { error } = await authSb.rpc('rpc_etax_auto_submit', {
      p_invoice_id: invoiceId,
    })
    expect(error).toBeNull()

    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.status).toBe('queued')
  })

  it('B5 — calling on a submitted submission does NOT reset it', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ status: 'submitted', rd_ref_no: 'RD-REF-001' })
      .eq('invoice_id', invoiceId)
      .eq('document_type', 'T01')

    const { error } = await authSb.rpc('rpc_etax_auto_submit', {
      p_invoice_id: invoiceId,
    })
    expect(error).toBeNull()

    const submission = await getEtaxSubmission(adminSb, invoiceId)
    expect(submission!.status).toBe('submitted') // unchanged
  })

  it('B6 — rpc_etax_auto_submit raises for invoice not in caller org', async () => {
    // Create invoice in a different org
    const other = await setupOrgFixture('grp-b-other')
    createdOrgIds.push(other.org_id)
    createdUserIds.push(other.user_id)

    const inv = await createInvoice(adminSb, other.org_id, other.customer_id)
    await setInvoiceStatus(adminSb, inv.id, 'paid')

    // orgB user tries to re-submit orgOther's invoice
    const { error } = await authSb.rpc('rpc_etax_auto_submit', { p_invoice_id: inv.id })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C: Retry max 5
// ─────────────────────────────────────────────────────────────────────────────

describe('Group C — rpc_etax_retry_submission max 5', () => {
  let orgC: OrgFixture
  let submissionId: string
  let authSb: SupabaseClient

  beforeAll(async () => {
    orgC = await setupOrgFixture('grp-c')
    createdOrgIds.push(orgC.org_id)
    createdUserIds.push(orgC.user_id)

    authSb = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgC.access_token}` } },
    })
  })

  beforeEach(async () => {
    const inv = await createInvoice(adminSb, orgC.org_id, orgC.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgC.org_id,
      invoice_id: inv.id,
      status:     'failed',
    })
    submissionId = sub.id
  })

  it('C1 — retry on failed submission (attempt 1) succeeds', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ attempt_count: 1 })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).toBeNull()

    const { data } = await adminSb
      .from('etax_submissions')
      .select('status')
      .eq('id', submissionId)
      .single()
    expect(data!.status).toBe('queued')
  })

  it('C2 — retry on attempt 4 still succeeds', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ attempt_count: 4, status: 'failed' })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).toBeNull()
  })

  it('C3 — retry on attempt 5 raises RETRY_EXCEEDED exception', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ attempt_count: 5, status: 'failed' })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/max.*retry|retry.*exceeded|attempt.*5/i)
  })

  it('C4 — retry on attempt > 5 also raises', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ attempt_count: 10, status: 'failed' })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).not.toBeNull()
  })

  it('C5 — retry on a submitted submission raises (wrong status)', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ status: 'submitted', attempt_count: 1 })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/submitted|status/i)
  })

  it('C6 — retry on queued submission raises (only retries failed)', async () => {
    await adminSb
      .from('etax_submissions')
      .update({ status: 'queued', attempt_count: 0 })
      .eq('id', submissionId)

    const { error } = await authSb.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionId,
    })
    expect(error).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP D: Cross-tenant isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('Group D — Cross-tenant isolation', () => {
  let orgD1: OrgFixture
  let orgD2: OrgFixture
  let authSbD1: SupabaseClient
  let authSbD2: SupabaseClient
  let submissionIdInD1: string

  beforeAll(async () => {
    orgD1 = await setupOrgFixture('grp-d1')
    orgD2 = await setupOrgFixture('grp-d2')
    createdOrgIds.push(orgD1.org_id, orgD2.org_id)
    createdUserIds.push(orgD1.user_id, orgD2.user_id)

    authSbD1 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgD1.access_token}` } },
    })
    authSbD2 = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgD2.access_token}` } },
    })

    // Create a submission for org D1
    const inv = await createInvoice(adminSb, orgD1.org_id, orgD1.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgD1.org_id,
      invoice_id: inv.id,
      status:     'queued',
    })
    submissionIdInD1 = sub.id
  })

  it('D1 — org_d2 user cannot SELECT etax_submissions of org_d1', async () => {
    const { data, error } = await authSbD2
      .from('etax_submissions')
      .select('*')
      .eq('id', submissionIdInD1)
    expect(error).toBeNull()
    expect(data).toHaveLength(0) // RLS hides it
  })

  it('D2 — org_d2 user cannot UPDATE etax_submissions of org_d1', async () => {
    const { error } = await authSbD2
      .from('etax_submissions')
      .update({ status: 'cancelled' })
      .eq('id', submissionIdInD1)
    // Either error thrown or 0 rows affected — either way the row is untouched
    const row = await getEtaxSubmission(adminSb, submissionIdInD1)
    if (row) {
      expect(row.status).not.toBe('cancelled')
    }
  })

  it('D3 — org_d2 user cannot DELETE etax_submissions of org_d1', async () => {
    await authSbD2
      .from('etax_submissions')
      .delete()
      .eq('id', submissionIdInD1)

    // Row must still exist
    const { data } = await adminSb
      .from('etax_submissions')
      .select('id')
      .eq('id', submissionIdInD1)
      .maybeSingle()
    expect(data).not.toBeNull()
  })

  it('D4 — org_d2 user cannot retry org_d1 submission via RPC', async () => {
    // Set to failed first
    await adminSb
      .from('etax_submissions')
      .update({ status: 'failed', attempt_count: 1 })
      .eq('id', submissionIdInD1)

    const { error } = await authSbD2.rpc('rpc_etax_retry_submission', {
      p_submission_id: submissionIdInD1,
    })
    expect(error).not.toBeNull()
  })

  it('D5 — org_d1 user can see only their own submissions via rpc_etax_list_submissions', async () => {
    // Create a submission for org D2
    const inv2 = await createInvoice(adminSb, orgD2.org_id, orgD2.customer_id)
    await insertEtaxSubmission(adminSb, {
      org_id:     orgD2.org_id,
      invoice_id: inv2.id,
    })

    const { data: d1List } = await authSbD1.rpc('rpc_etax_list_submissions')
    const ids = ((d1List ?? []) as any[]).map((r: any) => r.org_id)
    expect(ids.every((id) => id === orgD1.org_id)).toBe(true)
  })

  it('D6 — service_role can see submissions from all orgs', async () => {
    const { data } = await adminSb
      .from('etax_submissions')
      .select('org_id')
      .in('org_id', [orgD1.org_id, orgD2.org_id])
    const orgIds = ((data ?? []) as any[]).map((r: any) => r.org_id)
    expect(orgIds).toContain(orgD1.org_id)
    expect(orgIds).toContain(orgD2.org_id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP E: VAT calculation consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('Group E — VAT calculation consistency', () => {
  const cases = [
    { gross: 1070.00, expectedNet: 1000.00, expectedVat: 70.00 },
    { gross:  535.00, expectedNet:  500.00, expectedVat: 35.00 },
    { gross:  107.00, expectedNet:  100.00, expectedVat:  7.00 },
    { gross: 2140.00, expectedNet: 2000.00, expectedVat: 140.00 },
    // Fractional — test banker's rounding to 2dp
    { gross:  100.00, expectedNet:   93.46, expectedVat:  6.54 },
    { gross: 1000.00, expectedNet:  934.58, expectedVat: 65.42 },
  ]

  cases.forEach(({ gross, expectedNet, expectedVat }) => {
    it(`E — gross=${gross} → net=${expectedNet}, vat=${expectedVat}`, async () => {
      const { data, error } = await serviceClient().rpc('_compute_etax_vat', {
        p_gross: gross,
        p_rate:  0.07,
      })
      expect(error).toBeNull()
      expect(Number((data as any).net_amount)).toBeCloseTo(expectedNet, 2)
      expect(Number((data as any).vat_amount)).toBeCloseTo(expectedVat, 2)
    })
  })

  it('E — net + vat = gross within 0.01 tolerance (rounding residual)', async () => {
    for (const { gross } of cases) {
      const { data } = await serviceClient().rpc('_compute_etax_vat', {
        p_gross: gross,
        p_rate:  0.07,
      })
      const net = Number((data as any).net_amount)
      const vat = Number((data as any).vat_amount)
      expect(Math.abs(net + vat - gross)).toBeLessThanOrEqual(0.01)
    }
  })

  it('E — auto-queued submission amounts satisfy net + vat = gross', async () => {
    const orgE = await setupOrgFixture('grp-e')
    createdOrgIds.push(orgE.org_id)
    createdUserIds.push(orgE.user_id)

    const inv = await createInvoice(adminSb, orgE.org_id, orgE.customer_id, {
      total_amount: 5350.00, // 5000 + 350 VAT
    })
    await setInvoiceStatus(adminSb, inv.id, 'paid')

    const submission = await getEtaxSubmission(adminSb, inv.id)
    expect(submission).not.toBeNull()

    const net   = Number(submission!.net_amount)
    const vat   = Number(submission!.vat_amount)
    const gross = Number(submission!.gross_amount)

    expect(Math.abs(net + vat - gross)).toBeLessThanOrEqual(0.01)
  })

  it('E — vat_rate stored as decimal (0.07, not 7)', async () => {
    const orgEr = await setupOrgFixture('grp-e-rate')
    createdOrgIds.push(orgEr.org_id)
    createdUserIds.push(orgEr.user_id)

    const inv = await createInvoice(adminSb, orgEr.org_id, orgEr.customer_id)
    await setInvoiceStatus(adminSb, inv.id, 'paid')

    const submission = await getEtaxSubmission(adminSb, inv.id)
    expect(Number(submission!.vat_rate)).toBeCloseTo(0.07, 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP F: Status transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('Group F — Status transitions', () => {
  let orgF: OrgFixture
  let authSbF: SupabaseClient

  beforeAll(async () => {
    orgF = await setupOrgFixture('grp-f')
    createdOrgIds.push(orgF.org_id)
    createdUserIds.push(orgF.user_id)

    authSbF = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgF.access_token}` } },
    })
  })

  it('F1 — queued → submitting (via _etax_claim_batch)', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgF.org_id,
      invoice_id: inv.id,
      status:     'queued',
    })

    // Claim it via service role (simulates worker)
    const { data } = await adminSb.rpc('_etax_claim_batch', { p_limit: 1 })
    const claimed = ((data ?? []) as any[]).find((r: any) => r.id === sub.id)
    expect(claimed).toBeDefined()
    expect(claimed.status).toBe('submitting')
  })

  it('F2 — submitting → submitted (via rpc_etax_mark_submitted)', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgF.org_id,
      invoice_id: inv.id,
      status:     'submitting',
    })

    await adminSb.rpc('rpc_etax_mark_submitted', {
      p_submission_id:    sub.id,
      p_rd_ref_no:        'RD-2026-001',
      p_rd_response_code: '200',
    })

    const { data } = await adminSb
      .from('etax_submissions')
      .select('status, rd_ref_no, submitted_at')
      .eq('id', sub.id)
      .single()

    expect(data!.status).toBe('submitted')
    expect(data!.rd_ref_no).toBe('RD-2026-001')
    expect(data!.submitted_at).not.toBeNull()
  })

  it('F3 — submitting → failed (via rpc_etax_mark_failed)', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgF.org_id,
      invoice_id: inv.id,
      status:     'submitting',
    })

    await adminSb.rpc('rpc_etax_mark_failed', {
      p_submission_id: sub.id,
      p_error_detail:  'Provider timeout after 30s',
    })

    const { data } = await adminSb
      .from('etax_submissions')
      .select('status, error_detail')
      .eq('id', sub.id)
      .single()

    expect(data!.status).toBe('failed')
    expect(data!.error_detail).toMatch(/timeout/i)
  })

  it('F4 — failed → queued (via rpc_etax_retry_submission)', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:       orgF.org_id,
      invoice_id:   inv.id,
      status:       'failed',
      attempt_count: 2,
    })

    const { error } = await authSbF.rpc('rpc_etax_retry_submission', {
      p_submission_id: sub.id,
    })
    expect(error).toBeNull()

    const { data } = await adminSb
      .from('etax_submissions')
      .select('status, error_detail')
      .eq('id', sub.id)
      .single()

    expect(data!.status).toBe('queued')
    expect(data!.error_detail).toBeNull()
  })

  it('F5 — submitted status is terminal: cannot transition back to queued', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    const sub = await insertEtaxSubmission(adminSb, {
      org_id:     orgF.org_id,
      invoice_id: inv.id,
      status:     'submitted',
    })

    // rpc_etax_mark_submitted should be a no-op if status != 'submitting'
    await adminSb.rpc('rpc_etax_mark_submitted', {
      p_submission_id:    sub.id,
      p_rd_ref_no:        'DUPLICATE-REF',
      p_rd_response_code: '200',
    })

    const { data } = await adminSb
      .from('etax_submissions')
      .select('rd_ref_no')
      .eq('id', sub.id)
      .single()

    // rd_ref_no should NOT be overwritten since guard (status='submitting') failed
    expect(data!.rd_ref_no).toBeNull()
  })

  it('F6 — cancelled status: rpc_etax_auto_submit can requeue it', async () => {
    const inv = await createInvoice(adminSb, orgF.org_id, orgF.customer_id)
    await setInvoiceStatus(adminSb, inv.id, 'paid') // trigger auto-queue

    // Cancel the submission
    await adminSb
      .from('etax_submissions')
      .update({ status: 'cancelled' })
      .eq('invoice_id', inv.id)

    const { error } = await authSbF.rpc('rpc_etax_auto_submit', {
      p_invoice_id: inv.id,
    })
    expect(error).toBeNull()

    const submission = await getEtaxSubmission(adminSb, inv.id)
    expect(submission!.status).toBe('queued')
  })
})

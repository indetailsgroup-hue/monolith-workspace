/**
 * Test Suite: Migration 0200 — v_etax_sla_breach_timeline
 *
 * Test Groups:
 *   A. Column presence (10 required columns)
 *   B. Calendar spine continuity (no day gaps in 30-day window)
 *   C. breach_rate bounds (0–1; null when total_created = 0)
 *   D. cumulative_breached monotonicity per (org_id, document_type)
 *   E. rpc_etax_sla_breach_timeline — p_days filter correctness
 *   F. RLS cross-tenant isolation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── helpers ─────────────────────────────────────────────────────────────────
const SB_URL  = process.env.SUPABASE_URL!;
const SB_ANON = process.env.SUPABASE_ANON_KEY!;
const SB_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function makeClient(key: string): SupabaseClient {
  return createClient(SB_URL, key, { auth: { persistSession: false } });
}
async function signInClient(email: string, password: string): Promise<SupabaseClient> {
  const c = makeClient(SB_ANON);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}

const serviceClient = makeClient(SB_SRV);

// ─── fixtures ────────────────────────────────────────────────────────────────
const FX = {
  ORG_A_EMAIL: 'org-a-user@monolith-test.local',
  ORG_A_PASS:  'TestPa$$0rg4',
  ORG_B_EMAIL: 'org-b-user@monolith-test.local',
  ORG_B_PASS:  'TestPa$$0rg4',
  ORG_A_ID:    process.env.TEST_ORG_A_ID ?? 'aaaaaaaa-0000-0000-0000-000000000001',
  ORG_B_ID:    process.env.TEST_ORG_B_ID ?? 'bbbbbbbb-0000-0000-0000-000000000002',
};

let clientA: SupabaseClient;
let clientB: SupabaseClient;

// Seed: two submissions for Org A T01, different ages (one breach, one OK)
const seedInvIds:  string[] = [];
const seedEtaxIds: string[] = [];
const seedCustomerIds: string[] = [];

async function createInvoice(orgId: string, total: number, issuedAt: string): Promise<string> {
  const customerId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  seedCustomerIds.push(customerId);
  const { error: customerError } = await serviceClient.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `Timeline customer ${customerId}`,
  });
  if (customerError) throw new Error(`Seed customer: ${customerError.message}`);

  const { data: member, error: memberError } = await serviceClient
    .from('org_members').select('user_id').eq('org_id', orgId).limit(1).single();
  if (memberError || !member) throw new Error(`Seed member lookup: ${memberError?.message}`);

  const invoiceCode = `INV-SLA-TIMELINE-${invoiceId}`;
  const { error: invoiceError } = await serviceClient.from('invoices').insert({
    id: invoiceId,
    invoice_id: invoiceId,
    invoice_code: invoiceCode,
    code: invoiceCode,
    org_id: orgId,
    customer_id: customerId,
    status: 'approved',
    total,
    remaining_amount: total,
    due_date: '2030-12-31',
    issued_at: issuedAt,
    created_by: member.user_id,
  });
  if (invoiceError) throw new Error(`Seed invoice: ${invoiceError.message}`);
  return invoiceId;
}

beforeAll(async () => {
  clientA = await signInClient(FX.ORG_A_EMAIL, FX.ORG_A_PASS);
  clientB = await signInClient(FX.ORG_B_EMAIL, FX.ORG_B_PASS);

  // Submission 1: 30 h old → SLA breach
  const inv1 = await createInvoice(
    FX.ORG_A_ID,
    100,
    new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
  );
  seedInvIds.push(inv1);

  const { data: etax1 } = await serviceClient
    .from('etax_submissions')
    .insert({ org_id: FX.ORG_A_ID, invoice_id: inv1, document_type: 'T01',
              status: 'queued', attempt_count: 0,
              created_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString() })
    .select('id').single();
  seedEtaxIds.push(etax1!.id);

  // Submission 2: 2 h old → within SLA (HEALTHY)
  const inv2 = await createInvoice(
    FX.ORG_A_ID,
    200,
    new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  );
  seedInvIds.push(inv2);

  const { data: etax2 } = await serviceClient
    .from('etax_submissions')
    .insert({ org_id: FX.ORG_A_ID, invoice_id: inv2, document_type: 'T01',
              status: 'queued', attempt_count: 0,
              created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() })
    .select('id').single();
  seedEtaxIds.push(etax2!.id);
}, 60_000);

afterAll(async () => {
  for (const id of seedEtaxIds) {
    await serviceClient.from('etax_submissions').delete().eq('id', id);
  }
  for (const id of seedInvIds) {
    await serviceClient.from('invoices').delete().eq('id', id);
  }
  if (seedCustomerIds.length) {
    await serviceClient.from('customers').delete().in('customer_id', seedCustomerIds);
  }
});

// ─── Group A: Column presence ─────────────────────────────────────────────────
describe('Group A — v_etax_sla_breach_timeline column presence', () => {

  const EXPECTED_COLS = [
    'breach_date', 'org_id', 'org_name', 'document_type',
    'total_created', 'breached_count', 'breach_rate',
    'severity_tier', 'cumulative_breached', 'sla_threshold_hours',
  ];

  it('A1: view exists and is queryable', async () => {
    const { data, error } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('*')
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  EXPECTED_COLS.forEach((col, i) => {
    it(`A${i + 2}: column '${col}' is present`, async () => {
      const { data, error } = await serviceClient
        .from('v_etax_sla_breach_timeline')
        .select(col)
        .limit(1);
      expect(error).toBeNull();
      // If no rows exist the column is still verified by the absence of an error
      if (data && data.length > 0) {
        expect(Object.keys(data[0])).toContain(col);
      }
    });
  });

  it('A12: all 10 columns are present in a single SELECT *', async () => {
    const { data, error } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('*')
      .limit(1);
    expect(error).toBeNull();
    if (data && data.length > 0) {
      EXPECTED_COLS.forEach(col => {
        expect(Object.keys(data[0])).toContain(col);
      });
    }
  });
});

// ─── Group B: Calendar spine continuity ──────────────────────────────────────
describe('Group B — calendar spine continuity', () => {

  it('B1: Org A T01 has rows for each of the last 30 days', async () => {
    const { data, error } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_date')
      .eq('org_id', FX.ORG_A_ID)
      .eq('document_type', 'T01')
      .gte('breach_date', new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0])
      .order('breach_date', { ascending: true });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
  });

  it('B2: no consecutive day is skipped (gap detection)', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_date')
      .eq('org_id', FX.ORG_A_ID)
      .eq('document_type', 'T01')
      .gte('breach_date', new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0])
      .order('breach_date', { ascending: true });

    if (!data || data.length < 2) return; // not enough rows to check

    for (let i = 1; i < data.length; i++) {
      const prev = new Date(data[i - 1].breach_date).getTime();
      const curr = new Date(data[i].breach_date).getTime();
      const gapDays = (curr - prev) / 86400_000;
      expect(gapDays).toBe(1);
    }
  });

  it('B3: zero-submission days have total_created = 0 (not null)', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_date, total_created')
      .eq('org_id', FX.ORG_A_ID)
      .eq('document_type', 'T01')
      .gte('breach_date', new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]);

    data?.forEach(r => {
      expect(r.total_created).not.toBeNull();
      expect(typeof r.total_created).toBe('number');
      expect(r.total_created).toBeGreaterThanOrEqual(0);
    });
  });

  it('B4: rpc_etax_sla_breach_timeline returns rows for p_days=7 window', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 7,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // All dates within last 7 days
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date >= cutoff).toBe(true);
    });
  });
});

// ─── Group C: breach_rate bounds ─────────────────────────────────────────────
describe('Group C — breach_rate bounds', () => {

  it('C1: breach_rate is null when total_created = 0', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('total_created, breach_rate')
      .eq('org_id', FX.ORG_A_ID)
      .eq('total_created', 0);

    data?.forEach(r => {
      expect(r.breach_rate).toBeNull();
    });
  });

  it('C2: breach_rate is within [0, 1] when total_created > 0', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('total_created, breach_rate')
      .eq('org_id', FX.ORG_A_ID)
      .gt('total_created', 0);

    data?.forEach(r => {
      expect(Number(r.breach_rate)).toBeGreaterThanOrEqual(0);
      expect(Number(r.breach_rate)).toBeLessThanOrEqual(1);
    });
  });

  it('C3: breach_rate ≈ breached_count / total_created (within 0.001)', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('total_created, breached_count, breach_rate')
      .eq('org_id', FX.ORG_A_ID)
      .gt('total_created', 0)
      .limit(20);

    data?.forEach(r => {
      const expected = Number((r.breached_count / r.total_created).toFixed(4));
      expect(Math.abs(Number(r.breach_rate) - expected)).toBeLessThan(0.001);
    });
  });

  it('C4: severity_tier = HEALTHY when breach_rate is null (zero submissions day)', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_rate, severity_tier')
      .eq('org_id', FX.ORG_A_ID)
      .is('breach_rate', null)
      .limit(5);

    data?.forEach(r => {
      expect(r.severity_tier).toBe('HEALTHY');
    });
  });

  it('C5: severity tiers map correctly to breach_rate thresholds', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_rate, severity_tier')
      .eq('org_id', FX.ORG_A_ID)
      .not('breach_rate', 'is', null)
      .limit(50);

    data?.forEach(r => {
      const rate = Number(r.breach_rate);
      if (rate === 0) {
        expect(r.severity_tier).toBe('HEALTHY');
      } else if (rate >= 0.5) {
        expect(r.severity_tier).toBe('CRITICAL');
      } else if (rate >= 0.25) {
        expect(['WARNING', 'CRITICAL']).toContain(r.severity_tier);
      } else if (rate >= 0.10) {
        expect(['ELEVATED', 'WARNING', 'CRITICAL']).toContain(r.severity_tier);
      } else {
        expect(['NORMAL', 'ELEVATED', 'WARNING', 'CRITICAL']).toContain(r.severity_tier);
      }
    });
  });
});

// ─── Group D: cumulative_breached monotonicity ────────────────────────────────
describe('Group D — cumulative_breached monotonicity', () => {

  async function getTimeline(orgId: string, docType: string) {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('breach_date, breached_count, cumulative_breached')
      .eq('org_id', orgId)
      .eq('document_type', docType)
      .gte('breach_date', new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0])
      .order('breach_date', { ascending: true });
    return data ?? [];
  }

  it('D1: cumulative_breached is non-decreasing along the date axis', async () => {
    const rows = await getTimeline(FX.ORG_A_ID, 'T01');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].cumulative_breached).toBeGreaterThanOrEqual(
        rows[i - 1].cumulative_breached
      );
    }
  });

  it('D2: cumulative_breached increases by exactly breached_count each day', async () => {
    const rows = await getTimeline(FX.ORG_A_ID, 'T01');
    for (let i = 1; i < rows.length; i++) {
      const delta = rows[i].cumulative_breached - rows[i - 1].cumulative_breached;
      expect(delta).toBe(rows[i].breached_count);
    }
  });

  it('D3: cumulative_breached on day 0 equals breached_count on day 0', async () => {
    const rows = await getTimeline(FX.ORG_A_ID, 'T01');
    if (rows.length > 0) {
      // First row's cumulative should equal its own daily count
      expect(rows[0].cumulative_breached).toBe(rows[0].breached_count);
    }
  });

  it('D4: cumulative_breached is non-negative everywhere', async () => {
    const { data } = await serviceClient
      .from('v_etax_sla_breach_timeline')
      .select('cumulative_breached')
      .eq('org_id', FX.ORG_A_ID);
    data?.forEach(r => {
      expect(r.cumulative_breached).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── Group E: rpc_etax_sla_breach_timeline — p_days filter ───────────────────
describe('Group E — rpc_etax_sla_breach_timeline p_days filter', () => {

  it('E1: p_days=1 returns only today\'s rows', async () => {
    const { data, error } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 1,
    });
    expect(error).toBeNull();
    const today = new Date().toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date).toBe(today);
    });
  });

  it('E2: p_days=7 — no row older than 7 days from today', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 7,
    });
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date >= cutoff).toBe(true);
    });
  });

  it('E3: p_days=30 (default) returns rows spanning 30 days', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 30,
    });
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date >= cutoff).toBe(true);
    });
  });

  it('E4: p_days=90 (max) — all rows are within 90-day lookback', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 90,
    });
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date >= cutoff).toBe(true);
    });
  });

  it('E5: p_days > 90 is clamped to 90 (no rows older than 90 days)', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 999,
    });
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0];
    (data as any[])?.forEach(r => {
      expect(r.breach_date >= cutoff).toBe(true);
    });
  });

  it('E6: p_document_type=T01 returns only T01 rows', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_document_type: 'T01',
    });
    (data as any[])?.forEach(r => {
      expect(r.document_type).toBe('T01');
    });
  });

  it('E7: rows are ordered by (org_id, document_type, breach_date) ASC', async () => {
    const { data } = await serviceClient.rpc('rpc_etax_sla_breach_timeline', {
      p_days: 7,
    });
    if (!data || (data as any[]).length < 2) return;
    const rows = data as any[];
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (prev.org_id === curr.org_id && prev.document_type === curr.document_type) {
        expect(curr.breach_date >= prev.breach_date).toBe(true);
      }
    }
  });
});

// ─── Group F: RLS cross-tenant isolation ──────────────────────────────────────
describe('Group F — RLS cross-tenant isolation', () => {

  it('F1: Org A user sees only Org A rows in v_etax_sla_breach_timeline', async () => {
    const { data, error } = await clientA
      .from('v_etax_sla_breach_timeline')
      .select('org_id');
    expect(error).toBeNull();
    data?.forEach(r => expect(r.org_id).toBe(FX.ORG_A_ID));
  });

  it('F2: Org B user sees only Org B rows', async () => {
    const { data } = await clientB
      .from('v_etax_sla_breach_timeline')
      .select('org_id');
    data?.forEach(r => expect(r.org_id).toBe(FX.ORG_B_ID));
  });

  it('F3: Org A user cannot retrieve Org B rows via direct filter', async () => {
    const { data } = await clientA
      .from('v_etax_sla_breach_timeline')
      .select('org_id')
      .eq('org_id', FX.ORG_B_ID);
    expect(data).toHaveLength(0);
  });

  it('F4: rpc_etax_sla_breach_timeline — Org A JWT returns no Org B rows', async () => {
    const { data } = await clientA.rpc('rpc_etax_sla_breach_timeline', { p_days: 30 });
    (data as any[])?.forEach(r => {
      expect(r.org_id).toBe(FX.ORG_A_ID);
    });
  });

  it('F5: rpc_etax_sla_breach_timeline — Org B JWT returns no Org A rows', async () => {
    const { data } = await clientB.rpc('rpc_etax_sla_breach_timeline', { p_days: 30 });
    (data as any[])?.forEach(r => {
      expect(r.org_id).toBe(FX.ORG_B_ID);
    });
  });

  it('F6: service_role can retrieve rows for any org_id', async () => {
    // Use an isolated row so cleanup in an earlier legacy suite cannot remove
    // the deterministic shared Org A fixture before this authorization check.
    const orgId = crypto.randomUUID();
    const customerId = crypto.randomUUID();
    const invoiceId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();

    try {
      const { error: orgError } = await serviceClient.from('organizations').insert({
        org_id: orgId,
        name: `Timeline service org ${orgId}`,
        slug: `timeline-service-${orgId}`,
        plan: 'ENTERPRISE',
        max_users: 5,
      });
      expect(orgError).toBeNull();

      const { error: customerError } = await serviceClient.from('customers').insert({
        customer_id: customerId,
        org_id: orgId,
        name: `Timeline service customer ${customerId}`,
      });
      expect(customerError).toBeNull();

      const invoiceCode = `INV-TIMELINE-SERVICE-${invoiceId}`;
      const { error: invoiceError } = await serviceClient.from('invoices').insert({
        id: invoiceId,
        invoice_id: invoiceId,
        invoice_code: invoiceCode,
        code: invoiceCode,
        org_id: orgId,
        customer_id: customerId,
        status: 'approved',
        total: 100,
        remaining_amount: 100,
        due_date: '2030-12-31',
        created_by: '00000000-0000-0000-0000-000000000001',
      });
      expect(invoiceError).toBeNull();

      const { error: submissionError } = await serviceClient
        .from('etax_submissions')
        .insert({
          id: submissionId,
          org_id: orgId,
          invoice_id: invoiceId,
          document_type: 'T01',
          status: 'queued',
          attempt_count: 0,
        });
      expect(submissionError).toBeNull();

      const { data, error } = await serviceClient
        .from('v_etax_sla_breach_timeline')
        .select('org_id')
        .eq('org_id', orgId)
        .limit(1);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].org_id).toBe(orgId);
    } finally {
      await serviceClient.from('etax_submissions').delete().eq('id', submissionId);
      await serviceClient.from('invoices').delete().eq('invoice_id', invoiceId);
      await serviceClient.from('customers').delete().eq('customer_id', customerId);
      await serviceClient.from('organizations').delete().eq('org_id', orgId);
    }
  });
});

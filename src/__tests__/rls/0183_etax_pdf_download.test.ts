/**
 * Test Suite: 0183_etax_pdf_download
 *
 * Covers:
 *   Group A — trg_queue_pdf_on_submitted (trigger lifecycle)
 *   Group B — _etax_claim_pdf_batch (worker batch claim)
 *   Group C — rpc_etax_mark_pdf_downloaded (success path + idempotency)
 *   Group D — rpc_etax_mark_pdf_failed (failure path + wrong-state guard)
 *   Group E — rpc_etax_retry_pdf (OWNER/ADMIN allowed, others denied, cross-tenant denied)
 *   Group F — Storage RLS (etax-pdfs bucket, per-org isolation)
 *   Group G — Integration flow (queued→submitted→pending→claimed→downloaded end-to-end)
 *
 * Dependencies: Vitest, @supabase/supabase-js v2
 * Environment vars: SUPABASE_URL, SUPABASE_SERVICE_KEY (service-role for setup/teardown),
 *                   SUPABASE_ANON_KEY (for auth'd client)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? 'http://localhost:54321';
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY ?? '';
const ANON_KEY      = process.env.SUPABASE_ANON_KEY ?? '';

/** Service-role client — bypasses RLS for fixture setup */
const svc: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY);

/** Returns an anon client authenticated as the given user */
function authedClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createOrg(name: string): Promise<string> {
  const { data, error } = await svc
    .from('organizations')
    .insert({
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}`,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      max_users: 20,
    })
    .select('org_id')
    .single();
  if (error) throw new Error(`createOrg: ${error.message}`);
  return data.org_id as string;
}

async function createUser(email: string, password = 'Test1234!'): Promise<{ id: string; token: string }> {
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  const { data: session } = await createClient(SUPABASE_URL, ANON_KEY)
    .auth.signInWithPassword({ email, password });
  return { id: data.user.id, token: session.session!.access_token };
}

async function addOrgMember(orgId: string, userId: string, role: string): Promise<void> {
  const { data: userData } = await svc.auth.admin.getUserById(userId);
  const { error } = await svc
    .from('org_members')
    .insert({
      org_id: orgId,
      user_id: userId,
      role,
      email: userData.user?.email ?? `${userId}@test.monolith`,
    });
  if (error) throw new Error(`addOrgMember: ${error.message}`);
}

async function createInvoice(orgId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const invoiceId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const { data: member, error: memberError } = await svc
    .from('org_members').select('user_id').eq('org_id', orgId).limit(1).single();
  if (memberError || !member) throw new Error(`createInvoice member: ${memberError?.message}`);
  const { error: customerError } = await svc.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `PDF customer ${customerId}`,
  });
  if (customerError) throw new Error(`createInvoice customer: ${customerError.message}`);
  const invoiceCode = `INV-PDF-${invoiceId}`;
  const { data, error } = await svc
    .from('invoices')
    .insert({
      id: invoiceId,
      invoice_id: invoiceId,
      invoice_code: invoiceCode,
      code: invoiceCode,
      org_id: orgId,
      customer_id: customerId,
      status: 'approved',
      total: 10700,
      remaining_amount: 10700,
      due_date: '2030-12-31',
      created_by: member.user_id,
      ...extra,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return data.id as string;
}

async function createEtaxSubmission(
  orgId: string,
  invoiceId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await svc
    .from('etax_submissions')
    .insert({
      org_id:          orgId,
      invoice_id:      invoiceId,
      document_type:   'T01',
      document_number: `TAX-${Date.now()}`,
      document_date:   new Date().toISOString().substring(0, 10),
      net_amount:      10000,
      vat_amount:      700,
      gross_amount:    10700,
      vat_rate:        0.07,
      seller_tax_id:   '1234567890123',
      buyer_tax_id:    '9876543210987',
      buyer_name:      'Test Buyer Co., Ltd.',
      status:          'queued',
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createEtaxSubmission: ${error.message}`);
  return data.id as string;
}

async function setSubmissionStatus(
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await svc
    .from('etax_submissions')
    .update({ status, ...extra })
    .eq('id', id);
  if (error) throw new Error(`setSubmissionStatus: ${error.message}`);
}

async function getSubmission(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await svc
    .from('etax_submissions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`getSubmission: ${error.message}`);
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Global fixtures (created once per suite)
// ---------------------------------------------------------------------------

let orgA: string;   // primary test org
let orgB: string;   // second org (cross-tenant tests)

let ownerA: { id: string; token: string };
let financeA: { id: string; token: string };
let adminA: { id: string; token: string };
let viewerA: { id: string; token: string };
let ownerB: { id: string; token: string };   // different org

const createdSubmissionIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  orgA   = await createOrg('PDF Test Org A');
  orgB   = await createOrg('PDF Test Org B');

  ownerA   = await createUser(`pdf-owner-a-${Date.now()}@test.com`);
  financeA = await createUser(`pdf-finance-a-${Date.now()}@test.com`);
  adminA   = await createUser(`pdf-admin-a-${Date.now()}@test.com`);
  viewerA  = await createUser(`pdf-viewer-a-${Date.now()}@test.com`);
  ownerB   = await createUser(`pdf-owner-b-${Date.now()}@test.com`);

  createdUserIds.push(ownerA.id, financeA.id, adminA.id, viewerA.id, ownerB.id);

  await addOrgMember(orgA, ownerA.id,   'OWNER');
  await addOrgMember(orgA, financeA.id, 'FINANCE');
  await addOrgMember(orgA, adminA.id,   'ADMIN');
  await addOrgMember(orgA, viewerA.id,  'VIEWER');
  await addOrgMember(orgB, ownerB.id,   'OWNER');
});

afterAll(async () => {
  // Clean up in dependency order
  if (createdSubmissionIds.length) {
    await svc.from('etax_submissions').delete().in('id', createdSubmissionIds);
  }
  await svc.from('invoices').delete().in('org_id', [orgA, orgB]);
  await svc.from('customers').delete().in('org_id', [orgA, orgB]);
  for (const uid of createdUserIds) {
    await svc.auth.admin.deleteUser(uid);
  }
  if (orgA) await svc.from('organizations').delete().eq('org_id', orgA);
  if (orgB) await svc.from('organizations').delete().eq('org_id', orgB);
});

// ---------------------------------------------------------------------------
// Group A — trg_queue_pdf_on_submitted
// ---------------------------------------------------------------------------

describe('Group A: trg_queue_pdf_on_submitted', () => {
  it('A-1: fires on status transition → submitted; sets pdf_status = pending', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, { status: 'submitting' });
    createdSubmissionIds.push(subId);

    // Transition to submitted — trigger should fire
    await setSubmissionStatus(subId, 'submitted', { rd_ref_no: `RD-${Date.now()}` });

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
    expect(row.pdf_downloaded_at).toBeNull();
    expect(row.pdf_error).toBeNull();
  });

  it('A-2: does NOT fire if status was already submitted (UPDATE on non-status column)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted',
      rd_ref_no: `RD-A2-${Date.now()}`,
      pdf_status: 'downloaded',   // already downloaded
    });
    createdSubmissionIds.push(subId);

    // Update a non-status column — trigger should NOT reset pdf_status
    await svc.from('etax_submissions').update({ error_detail: 'touch' }).eq('id', subId);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloaded');   // unchanged
  });

  it('A-3: skips pdf_status update if already downloaded (idempotent guard)', async () => {
    const invId = await createInvoice(orgA);
    // Insert already in submitted state with pdf_status=downloaded
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted',
      rd_ref_no: `RD-A3-${Date.now()}`,
      pdf_status: 'downloaded',
    });
    createdSubmissionIds.push(subId);

    // Force another status update to submitted (same value — trigger fires on ANY update)
    // The trigger WHEN clause guards: NEW.status = 'submitted' AND NEW.pdf_status IS DISTINCT FROM 'downloaded'
    await svc
      .from('etax_submissions')
      .update({ status: 'submitted', rd_ref_no: `RD-A3-update-${Date.now()}` })
      .eq('id', subId);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloaded');   // must not regress to 'pending'
  });

  it('A-4: does not fire for non-submitted status transitions (queued/submitting/failed)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, { status: 'queued' });
    createdSubmissionIds.push(subId);

    await setSubmissionStatus(subId, 'submitting');
    let row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');   // canonical table default

    await setSubmissionStatus(subId, 'failed');
    row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
  });

  it('A-5: trigger resets pdf_status → pending when a previously-failed submission is re-submitted', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted',
      rd_ref_no: `RD-A5-${Date.now()}`,
      pdf_status: 'failed',
      pdf_error: 'timeout',
    });
    createdSubmissionIds.push(subId);

    // Simulate re-submission (status: failed → submitting → submitted again)
    await setSubmissionStatus(subId, 'submitting');
    await setSubmissionStatus(subId, 'submitted', { rd_ref_no: `RD-A5-retry-${Date.now()}` });

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
    expect(row.pdf_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group B — _etax_claim_pdf_batch
// ---------------------------------------------------------------------------

describe('Group B: _etax_claim_pdf_batch', () => {
  async function claimBatch(limit = 10): Promise<{ id: string; rd_ref_no: string; org_id: string }[]> {
    const { data, error } = await svc.rpc('_etax_claim_pdf_batch', { p_limit: limit });
    if (error) throw new Error(`_etax_claim_pdf_batch: ${error.message}`);
    return (data ?? []) as { id: string; rd_ref_no: string; org_id: string }[];
  }

  async function releaseClaimed(ids: string[]): Promise<void> {
    if (!ids.length) return;
    // Reset back to pending so other tests are not affected
    await svc.from('etax_submissions').update({ pdf_status: 'pending' }).in('id', ids);
  }

  it('B-1: claims only pdf_status=pending rows and sets them to downloading', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status:     'submitted',
      rd_ref_no:  `RD-B1-${Date.now()}`,
      pdf_status: 'pending',
    });
    createdSubmissionIds.push(subId);

    const claimed = await claimBatch(50);
    const found = claimed.find((r) => r.id === subId);
    expect(found).toBeDefined();

    // Verify DB state is now 'downloading'
    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloading');

    await releaseClaimed([subId]);
  });

  it('B-2: does NOT claim rows that are already downloading, downloaded, or failed', async () => {
    const dlId = await createEtaxSubmission(orgA, await createInvoice(orgA), {
      status: 'submitted', rd_ref_no: `RD-B2a-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(dlId);

    const doneId = await createEtaxSubmission(orgA, await createInvoice(orgA), {
      status: 'submitted', rd_ref_no: `RD-B2b-${Date.now()}`, pdf_status: 'downloaded',
    });
    createdSubmissionIds.push(doneId);

    const failId = await createEtaxSubmission(orgA, await createInvoice(orgA), {
      status: 'submitted', rd_ref_no: `RD-B2c-${Date.now()}`, pdf_status: 'failed',
    });
    createdSubmissionIds.push(failId);

    const claimed = await claimBatch(50);
    const claimedIds = claimed.map((r) => r.id);

    expect(claimedIds).not.toContain(dlId);
    expect(claimedIds).not.toContain(doneId);
    expect(claimedIds).not.toContain(failId);
  });

  it('B-3: does NOT claim rows whose parent submission is not in submitted status', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'queued', pdf_status: 'pending',   // pdf_status pending but not submitted
    });
    createdSubmissionIds.push(subId);

    const claimed = await claimBatch(50);
    expect(claimed.map((r) => r.id)).not.toContain(subId);
  });

  it('B-4: respects p_limit — returns at most N rows', async () => {
    // Create 3 pending submissions
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const invId = await createInvoice(orgA);
      const subId = await createEtaxSubmission(orgA, invId, {
        status: 'submitted', rd_ref_no: `RD-B4-${i}-${Date.now()}`, pdf_status: 'pending',
      });
      ids.push(subId);
      createdSubmissionIds.push(subId);
    }

    const claimed = await claimBatch(2);
    const claimedFromOurs = claimed.filter((r) => ids.includes(r.id));
    expect(claimedFromOurs.length).toBeLessThanOrEqual(2);

    await releaseClaimed(ids);
  });

  it('B-5: returns empty array when no pending rows exist', async () => {
    // Mark all pending rows to downloaded so nothing is claimable
    await svc
      .from('etax_submissions')
      .update({ pdf_status: 'downloading' })   // temporarily lock them out
      .eq('pdf_status', 'pending')
      .eq('status', 'submitted');

    const claimed = await claimBatch(50);
    expect(claimed).toHaveLength(0);

    // Restore
    await svc
      .from('etax_submissions')
      .update({ pdf_status: 'pending' })
      .eq('pdf_status', 'downloading');
  });

  it('B-6: concurrent calls do not double-claim the same row (SKIP LOCKED)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-B6-${Date.now()}`, pdf_status: 'pending',
    });
    createdSubmissionIds.push(subId);

    // Fire two claims simultaneously
    const [r1, r2] = await Promise.all([claimBatch(1), claimBatch(1)]);

    const r1Ids = new Set(r1.map((row) => row.id));
    const overlap = r2.filter((row) => r1Ids.has(row.id));

    // The worker selects the oldest pending row globally, so this fixture is
    // not guaranteed to be the first row claimed when other suites are active.
    // The concurrency invariant is that the two batches never share an ID.
    expect(overlap).toHaveLength(0);

    await releaseClaimed([subId]);
  });
});

// ---------------------------------------------------------------------------
// Group C — rpc_etax_mark_pdf_downloaded
// ---------------------------------------------------------------------------

describe('Group C: rpc_etax_mark_pdf_downloaded', () => {
  async function markDownloaded(
    subId: string,
    pdfPath: string,
    token?: string,
  ): Promise<{ ok: boolean; idempotent?: boolean; error?: string }> {
    const client = token ? authedClient(token) : svc;
    const { data, error } = await client.rpc('rpc_etax_mark_pdf_downloaded', {
      p_id:   subId,
      p_path: pdfPath,
    });
    if (error) throw new Error(`rpc_etax_mark_pdf_downloaded: ${error.message}`);
    return data as { ok: boolean; idempotent?: boolean; error?: string };
  }

  it('C-1: happy path — transitions downloading→downloaded, stores pdf_path, sets pdf_downloaded_at', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-C1-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(subId);

    const pdfPath = `${orgA}/2026/${subId}.pdf`;
    const result  = await markDownloaded(subId, pdfPath);
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBeFalsy();

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloaded');
    expect(row.pdf_path).toBe(pdfPath);
    expect(row.pdf_downloaded_at).not.toBeNull();
    expect(row.pdf_error).toBeNull();
  });

  it('C-2: idempotent — calling again on already-downloaded row returns {ok:true, idempotent:true}', async () => {
    const invId = await createInvoice(orgA);
    const pdfPath = `${orgA}/2026/${Date.now()}.pdf`;
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-C2-${Date.now()}`,
      pdf_status: 'downloaded', pdf_path: pdfPath, pdf_downloaded_at: new Date().toISOString(),
    });
    createdSubmissionIds.push(subId);

    const result = await markDownloaded(subId, pdfPath);
    expect(result.ok).toBe(true);
    expect(result.idempotent).toBe(true);
  });

  it('C-3: returns error when called on a row not in downloading state (e.g., pending)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-C3-${Date.now()}`, pdf_status: 'pending',
    });
    createdSubmissionIds.push(subId);

    // Should either throw or return {ok:false, error:...}
    let result: { ok: boolean; error?: string } | null = null;
    try {
      result = await markDownloaded(subId, `${orgA}/2026/${subId}.pdf`);
    } catch {
      // acceptable — RPC may raise an exception
    }
    if (result !== null) {
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it('C-4: cross-tenant — finance user of Org A cannot mark a submission in Org B as downloaded', async () => {
    const invId = await createInvoice(orgB);
    const subId = await createEtaxSubmission(orgB, invId, {
      status: 'submitted', rd_ref_no: `RD-C4-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(subId);

    await expect(
      markDownloaded(subId, `${orgB}/2026/${subId}.pdf`, financeA.token),
    ).rejects.toThrow();

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloading');   // unchanged
  });
});

// ---------------------------------------------------------------------------
// Group D — rpc_etax_mark_pdf_failed
// ---------------------------------------------------------------------------

describe('Group D: rpc_etax_mark_pdf_failed', () => {
  async function markFailed(
    subId: string,
    errorMsg: string,
    token?: string,
  ): Promise<{ ok: boolean; warning?: string; error?: string }> {
    const client = token ? authedClient(token) : svc;
    const { data, error } = await client.rpc('rpc_etax_mark_pdf_failed', {
      p_id:    subId,
      p_error: errorMsg,
    });
    if (error) throw new Error(`rpc_etax_mark_pdf_failed: ${error.message}`);
    return data as { ok: boolean; warning?: string; error?: string };
  }

  it('D-1: sets pdf_status=failed and records pdf_error from downloading state', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-D1-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(subId);

    const result = await markFailed(subId, 'ETDA endpoint timeout after 30s');
    expect(result.ok).toBe(true);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('failed');
    expect(row.pdf_error).toContain('timeout');
    expect(row.pdf_downloaded_at).toBeNull();
  });

  it('D-2: also transitions pending→failed (in case a worker skips the claim step)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-D2-${Date.now()}`, pdf_status: 'pending',
    });
    createdSubmissionIds.push(subId);

    const result = await markFailed(subId, 'unexpected error');
    expect(result.ok).toBe(true);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('failed');
  });

  it('D-3: returns warning (not error) when called on already-downloaded row', async () => {
    const invId = await createInvoice(orgA);
    const pdfPath = `${orgA}/2026/${Date.now()}.pdf`;
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-D3-${Date.now()}`,
      pdf_status: 'downloaded', pdf_path: pdfPath, pdf_downloaded_at: new Date().toISOString(),
    });
    createdSubmissionIds.push(subId);

    const result = await markFailed(subId, 'late failure');
    // Implementation should return a warning rather than overwriting a successful download
    expect(result.ok).toBe(false);
    expect(result.warning).toBeDefined();

    // pdf_status must remain 'downloaded'
    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloaded');
  });

  it('D-4: cross-tenant isolation — Org B worker cannot mark Org A submission failed', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-D4-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(subId);

    await expect(
      markFailed(subId, 'cross-tenant attack', ownerB.token),
    ).rejects.toThrow();

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloading');   // unchanged
  });
});

// ---------------------------------------------------------------------------
// Group E — rpc_etax_retry_pdf
// ---------------------------------------------------------------------------

describe('Group E: rpc_etax_retry_pdf', () => {
  async function retryPdf(
    subId: string,
    token: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await authedClient(token).rpc('rpc_etax_retry_pdf', {
      p_id: subId,
    });
    if (error) throw new Error(`rpc_etax_retry_pdf: ${error.message}`);
    return data as { ok: boolean; error?: string };
  }

  async function makeFailedSub(orgId: string): Promise<string> {
    const invId = await createInvoice(orgId);
    const subId = await createEtaxSubmission(orgId, invId, {
      status: 'submitted', rd_ref_no: `RD-E-${Date.now()}`,
      pdf_status: 'failed', pdf_error: 'download timeout',
    });
    createdSubmissionIds.push(subId);
    return subId;
  }

  it('E-1: OWNER can retry a failed pdf download — resets pdf_status to pending', async () => {
    const subId = await makeFailedSub(orgA);
    const result = await retryPdf(subId, ownerA.token);
    expect(result.ok).toBe(true);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
    expect(row.pdf_error).toBeNull();
  });

  it('E-2: ADMIN can retry a failed pdf download', async () => {
    const subId = await makeFailedSub(orgA);
    const result = await retryPdf(subId, adminA.token);
    expect(result.ok).toBe(true);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
  });

  it('E-3: VIEWER is denied retry — insufficient role', async () => {
    const subId = await makeFailedSub(orgA);

    await expect(retryPdf(subId, viewerA.token)).rejects.toThrow();

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('failed');   // unchanged
  });

  it('E-4: cross-tenant — OWNER of Org B cannot retry a submission in Org A', async () => {
    const subId = await makeFailedSub(orgA);

    await expect(retryPdf(subId, ownerB.token)).rejects.toThrow();

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('failed');   // unchanged
  });

  it('E-5: returns error when submission is not in failed state (e.g., pending)', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-E5-${Date.now()}`, pdf_status: 'pending',
    });
    createdSubmissionIds.push(subId);

    let result: { ok: boolean; reason?: string } | null = null;
    try {
      result = await retryPdf(subId, ownerA.token);
    } catch {
      // exception is also acceptable
    }
    if (result !== null) {
      expect(result.ok).toBe(false);
      expect(result.reason).toBeDefined();
    }
  });

  it('E-6: FINANCE can retry (same as ADMIN privilege level)', async () => {
    const subId = await makeFailedSub(orgA);
    const result = await retryPdf(subId, financeA.token);
    expect(result.ok).toBe(true);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Group F — Storage RLS (etax-pdfs bucket)
// ---------------------------------------------------------------------------

describe('Group F: Storage RLS — etax-pdfs bucket', () => {
  const BUCKET = 'etax-pdfs';
  const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);   // %PDF magic bytes

  async function uploadPdf(
    token: string,
    storagePath: string,
  ): Promise<{ error: unknown }> {
    const client = authedClient(token);
    const { error } = await client.storage
      .from(BUCKET)
      .upload(storagePath, fakePdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    return { error };
  }

  async function downloadPdf(
    token: string,
    storagePath: string,
  ): Promise<{ error: unknown }> {
    const client = authedClient(token);
    const { error } = await client.storage
      .from(BUCKET)
      .download(storagePath);
    return { error };
  }

  async function deletePdf(
    token: string,
    storagePath: string,
  ): Promise<{ error: unknown }> {
    const client = authedClient(token);
    const { error } = await client.storage
      .from(BUCKET)
      .remove([storagePath]);
    return { error };
  }

  const year = new Date().getFullYear().toString();

  it('F-1: FINANCE member of Org A can upload a PDF under their org path', async () => {
    const path = `${orgA}/${year}/test-upload-f1.pdf`;
    const { error } = await uploadPdf(financeA.token, path);
    expect(error).toBeNull();

    // Cleanup
    await svc.storage.from(BUCKET).remove([path]);
  });

  it('F-2: VIEWER of Org A can SELECT (download) PDFs under their org path', async () => {
    // Upload via service role first
    const path = `${orgA}/${year}/test-select-f2.pdf`;
    await svc.storage.from(BUCKET).upload(path, fakePdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });

    const { error } = await downloadPdf(viewerA.token, path);
    expect(error).toBeNull();

    // Cleanup
    await svc.storage.from(BUCKET).remove([path]);
  });

  it('F-3: Org A member CANNOT download a PDF under Org B path', async () => {
    // Upload a file under orgB path via service role
    const path = `${orgB}/${year}/test-select-f3.pdf`;
    await svc.storage.from(BUCKET).upload(path, fakePdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });

    const { error } = await downloadPdf(ownerA.token, path);
    expect(error).not.toBeNull();   // should be forbidden

    // Cleanup
    await svc.storage.from(BUCKET).remove([path]);
  });

  it('F-4: non-FINANCE role (VIEWER) cannot upload a PDF', async () => {
    const path = `${orgA}/${year}/test-upload-f4.pdf`;
    const { error } = await uploadPdf(viewerA.token, path);
    expect(error).not.toBeNull();   // RLS should block this
  });

  it('F-5: authenticated user cannot DELETE a PDF (DELETE is not permitted for any role)', async () => {
    const path = `${orgA}/${year}/test-delete-f5.pdf`;
    await svc.storage.from(BUCKET).upload(path, fakePdfBytes, {
      contentType: 'application/pdf', upsert: true,
    });

    await deletePdf(financeA.token, path);
    const { error: stillReadable } = await downloadPdf(ownerA.token, path);
    expect(stillReadable).toBeNull();

    // Cleanup via service role
    await svc.storage.from(BUCKET).remove([path]);
  });

  it('F-6: Org B owner cannot upload under Org A path', async () => {
    const path = `${orgA}/${year}/test-cross-upload-f6.pdf`;
    const { error } = await uploadPdf(ownerB.token, path);
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group G — Integration flow (end-to-end)
// ---------------------------------------------------------------------------

describe('Group G: Integration flow — full lifecycle', () => {
  it('G-1: queued→submitting→submitted triggers pending, claim sets downloading, mark downloaded', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, { status: 'queued' });
    createdSubmissionIds.push(subId);

    // Step 1: queue → submitting
    await setSubmissionStatus(subId, 'submitting');
    let row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');

    // Step 2: submitting → submitted (trigger fires)
    const rdRefNo = `RD-G1-${Date.now()}`;
    await setSubmissionStatus(subId, 'submitted', { rd_ref_no: rdRefNo });
    row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');

    // Step 3: claim batch — sets downloading
    const { data: claimed } = await svc.rpc('_etax_claim_pdf_batch', { p_limit: 50 });
    const claimedRow = (claimed ?? []).find((r: { id: string }) => r.id === subId);
    expect(claimedRow).toBeDefined();

    row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloading');

    // Step 4: mark downloaded
    const pdfPath = `${orgA}/2026/${subId}.pdf`;
    const { data: markResult } = await svc.rpc('rpc_etax_mark_pdf_downloaded', {
      p_id:   subId,
      p_path: pdfPath,
    });
    expect((markResult as { ok: boolean }).ok).toBe(true);

    row = await getSubmission(subId);
    expect(row.pdf_status).toBe('downloaded');
    expect(row.pdf_path).toBe(pdfPath);
    expect(row.pdf_downloaded_at).not.toBeNull();
  });

  it('G-2: failure path — downloading→failed, then retry resets to pending', async () => {
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status: 'submitted', rd_ref_no: `RD-G2-${Date.now()}`, pdf_status: 'downloading',
    });
    createdSubmissionIds.push(subId);

    // Mark failed
    await svc.rpc('rpc_etax_mark_pdf_failed', {
      p_id:    subId,
      p_error: 'ETDA server unavailable',
    });

    let row = await getSubmission(subId);
    expect(row.pdf_status).toBe('failed');
    expect(row.pdf_error).toContain('unavailable');

    // Retry (OWNER)
    const { data: retryResult } = await authedClient(ownerA.token).rpc('rpc_etax_retry_pdf', {
      p_id: subId,
    });
    expect((retryResult as { ok: boolean }).ok).toBe(true);

    row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');
    expect(row.pdf_error).toBeNull();
  });

  it('G-3: backfill — pre-existing submitted rows without pdf_status are picked up by batch claim after backfill migration', async () => {
    // Simulate a row that existed before 0183 was applied (pdf_status NULL, status=submitted)
    const invId = await createInvoice(orgA);
    const subId = await createEtaxSubmission(orgA, invId, {
      status:     'submitted',
      rd_ref_no:  `RD-G3-${Date.now()}`,
      pdf_status: null,   // explicitly null — as if pre-migration
    });
    createdSubmissionIds.push(subId);

    // The backfill UPDATE in 0183 sets pdf_status=pending for all status=submitted WHERE pdf_status IS NULL
    // We re-run it manually here to simulate migration backfill
    await svc
      .from('etax_submissions')
      .update({ pdf_status: 'pending' })
      .eq('id', subId)
      .is('pdf_status', null);

    const row = await getSubmission(subId);
    expect(row.pdf_status).toBe('pending');

    // Verify it is now claimable
    const { data: claimed } = await svc.rpc('_etax_claim_pdf_batch', { p_limit: 50 });
    const found = (claimed ?? []).find((r: { id: string }) => r.id === subId);
    expect(found).toBeDefined();

    // Release
    await svc.from('etax_submissions').update({ pdf_status: 'pending' }).eq('id', subId);
  });

  it('G-4: cross-tenant — Org B submission does not appear in Org A FINANCE user claim', async () => {
    const invIdB = await createInvoice(orgB);
    const subIdB = await createEtaxSubmission(orgB, invIdB, {
      status: 'submitted', rd_ref_no: `RD-G4-B-${Date.now()}`, pdf_status: 'pending',
    });
    createdSubmissionIds.push(subIdB);

    // The batch claim is a service-role RPC and intentionally crosses orgs (worker pattern)
    // But the test verifies each row retains correct org_id for routing
    const { data: claimed } = await svc.rpc('_etax_claim_pdf_batch', { p_limit: 50 });
    const orgBRow = (claimed ?? []).find((r: { id: string; org_id: string }) => r.id === subIdB);

    if (orgBRow) {
      // If claimed, the org_id must be orgB — worker must not treat it as orgA
      expect(orgBRow.org_id).toBe(orgB);
      expect(orgBRow.org_id).not.toBe(orgA);
    }

    // Org A FINANCE user via RLS cannot mark Org B's submission as downloaded
    const { error } = await authedClient(financeA.token).rpc('rpc_etax_mark_pdf_downloaded', {
      p_id: subIdB,
      p_path: `${orgB}/2026/${subIdB}.pdf`,
    });
    expect(error).not.toBeNull();

    // Release
    await svc.from('etax_submissions').update({ pdf_status: 'pending' }).eq('id', subIdB);
  });
});

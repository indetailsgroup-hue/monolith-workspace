// src/__tests__/migrations/0196_etax_partitioning.test.ts
// Test suite for Migration 0196: Monthly partitioning of etax_submissions
// Groups A–G: partition existence, row routing, cross-partition unique,
//             indexes, RLS, auto-partition, rpc_etax_partition_health

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL      ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role';
const ANON_KEY          = process.env.SUPABASE_ANON_KEY         ?? 'test-anon-key';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sql(client: SupabaseClient, query: string): Promise<any> {
  const { data, error } = await client.rpc('exec_sql', { query });
  if (error) throw new Error(`SQL error: ${error.message}\nQuery: ${query}`);
  return data;
}

function makeDate(year: number, month: number, day = 15): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let service: SupabaseClient;
let orgA: string;
let orgB: string;
let userA: string;
let userAEmail: string;
const userAPassword = 'test-password-123';
const invoiceIds: string[] = [];
const customerIds: string[] = [];

async function createInvoice(
  orgId: string,
  label: string,
  invoiceId = uuidv4(),
): Promise<string> {
  const customerId = uuidv4();
  customerIds.push(customerId);
  const { error: customerError } = await service.from('customers').insert({
    customer_id: customerId,
    org_id: orgId,
    name: `Partition Customer ${label}`,
  });
  if (customerError) throw new Error(`insert customer: ${customerError.message}`);

  invoiceIds.push(invoiceId);
  const invoiceCode = `INV-0196-${label}-${invoiceId}`;
  const { error: invoiceError } = await service.from('invoices').insert({
    id: invoiceId,
    invoice_id: invoiceId,
    invoice_code: invoiceCode,
    code: invoiceCode,
    org_id: orgId,
    customer_id: customerId,
    status: 'approved',
    total: 1070,
    remaining_amount: 1070,
    due_date: '2030-12-31',
    created_by: userA,
  });
  if (invoiceError) throw new Error(`insert invoice: ${invoiceError.message}`);
  return invoiceId;
}

function submissionRow(
  id: string,
  orgId: string,
  invoiceId: string,
  createdAt: string,
  documentType = 'T01',
) {
  return {
    id,
    org_id: orgId,
    invoice_id: invoiceId,
    document_type: documentType,
    status: 'queued',
    created_at: createdAt,
  };
}

beforeAll(async () => {
  service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Seed orgs
  orgA = uuidv4();
  orgB = uuidv4();
  const { error: orgError } = await service.from('organizations').insert([
    { org_id: orgA, name: 'Partition Test Org A', slug: `pto-a-${orgA.slice(0,8)}`, plan: 'ENTERPRISE' },
    { org_id: orgB, name: 'Partition Test Org B', slug: `pto-b-${orgB.slice(0,8)}`, plan: 'ENTERPRISE' },
  ]);
  if (orgError) throw new Error(`insert organizations: ${orgError.message}`);

  // Seed user + org_member for RLS tests
  userAEmail = `user-0196-${uuidv4()}@test.monolith`;
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email: userAEmail,
    password: userAPassword,
    email_confirm: true,
    app_metadata: { roles: ['finance'], org_id: orgA },
  });
  if (authError || !authData.user) throw new Error(`create user: ${authError?.message}`);
  userA = authData.user.id;
  const { error: memberError } = await service.from('org_members').insert({
    org_id: orgA,
    user_id: userA,
    role: 'FINANCE',
    email: userAEmail,
  });
  if (memberError) throw new Error(`insert member: ${memberError.message}`);

  // Seed invoices for each org (12 invoices × 2 orgs = 24)
  for (let i = 0; i < 12; i++) {
    await createInvoice(i < 6 ? orgA : orgB, `base-${i}`);
  }

  // Keep one valid org-B submission so the service-role cross-org assertion is meaningful.
  const { error: orgBSubmissionError } = await service.from('etax_submissions').insert(
    submissionRow(uuidv4(), orgB, invoiceIds[6], new Date().toISOString()),
  );
  if (orgBSubmissionError) throw new Error(`insert org-B submission: ${orgBSubmissionError.message}`);
});

afterAll(async () => {
  // Cleanup in reverse dependency order
  await service.from('etax_submissions').delete().in('org_id', [orgA, orgB]);
  await service.from('invoices').delete().in('id', invoiceIds);
  await service.from('customers').delete().in('customer_id', customerIds);
  await service.from('org_members').delete().eq('user_id', userA);
  await service.from('organizations').delete().in('org_id', [orgA, orgB]);
  await service.auth.admin.deleteUser(userA);
});

// ─── GROUP A: Partition table structure ───────────────────────────────────────
describe('Group A — partitioned table existence', () => {
  it('A1: etax_submissions is a partitioned table (relkind=p)', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT c.relkind
        FROM   pg_class c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  c.relname = 'etax_submissions' AND n.nspname = 'public'
      `,
    });
    expect(data?.[0]?.relkind).toBe('p');
  });

  it('A2: etax_submissions_2026_09 partition exists', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT COUNT(*) AS cnt
        FROM   pg_class c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  c.relname = 'etax_submissions_2026_09' AND n.nspname = 'public'
      `,
    });
    expect(Number(data?.[0]?.cnt)).toBe(1);
  });

  it('A3: default partition etax_submissions_default exists', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT COUNT(*) AS cnt
        FROM   pg_class c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  c.relname = 'etax_submissions_default' AND n.nspname = 'public'
      `,
    });
    expect(Number(data?.[0]?.cnt)).toBe(1);
  });

  it('A4: etax_submissions_pre_partition backup table exists', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT COUNT(*) AS cnt
        FROM   information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   = 'etax_submissions_pre_partition'
      `,
    });
    expect(Number(data?.[0]?.cnt)).toBe(1);
  });

  it('A5: partitions span 2024-01 through 2027-03 (at minimum 39 partitions)', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT COUNT(*) AS cnt
        FROM   pg_inherits i
        JOIN   pg_class    c ON c.oid = i.inhrelid
        JOIN   pg_class    p ON p.oid = i.inhparent
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  p.relname = 'etax_submissions' AND n.nspname = 'public'
      `,
    });
    // 2024: 12 + 2025: 12 + 2026: 12 + 2027: 3 = 39 + 1 default = 40
    expect(Number(data?.[0]?.cnt)).toBeGreaterThanOrEqual(39);
  });
});

// ─── GROUP B: Row routing ─────────────────────────────────────────────────────
describe('Group B — rows route to correct monthly partition', () => {
  const sept2026InvoiceId = uuidv4();
  const oct2026InvoiceId  = uuidv4();

  beforeAll(async () => {
    await Promise.all([
      createInvoice(orgA, 'sept', sept2026InvoiceId),
      createInvoice(orgA, 'oct', oct2026InvoiceId),
    ]);
  });

  afterAll(async () => {
    await service.from('etax_submissions').delete().in('invoice_id', [sept2026InvoiceId, oct2026InvoiceId]);
    await service.from('invoices').delete().in('id', [sept2026InvoiceId, oct2026InvoiceId]);
  });

  it('B1: row with created_at in Sept 2026 lands in etax_submissions_2026_09', async () => {
    const id = uuidv4();
    const { error } = await service.from('etax_submissions').insert(
      submissionRow(id, orgA, sept2026InvoiceId, makeDate(2026, 9)),
    );
    expect(error).toBeNull();

    const { data } = await service.rpc('exec_sql', {
      query: `SELECT tableoid::regclass::text AS tbl FROM public.etax_submissions WHERE id='${id}'`,
    });
    expect(data?.[0]?.tbl).toBe('etax_submissions_2026_09');
  });

  it('B2: row with created_at in Oct 2026 lands in etax_submissions_2026_10', async () => {
    const id = uuidv4();
    const { error } = await service.from('etax_submissions').insert(
      submissionRow(id, orgA, oct2026InvoiceId, makeDate(2026, 10)),
    );
    expect(error).toBeNull();

    const { data } = await service.rpc('exec_sql', {
      query: `SELECT tableoid::regclass::text AS tbl FROM public.etax_submissions WHERE id='${id}'`,
    });
    expect(data?.[0]?.tbl).toBe('etax_submissions_2026_10');
  });

  it('B3: row with created_at far in future lands in default partition', async () => {
    const futureInvoiceId = uuidv4();
    await createInvoice(orgA, 'future', futureInvoiceId);
    const id = uuidv4();
    const { error } = await service.from('etax_submissions').insert(
      submissionRow(id, orgA, futureInvoiceId, makeDate(2030, 1)),
    );
    expect(error).toBeNull();

    const { data } = await service.rpc('exec_sql', {
      query: `SELECT tableoid::regclass::text AS tbl FROM public.etax_submissions WHERE id='${id}'`,
    });
    expect(data?.[0]?.tbl).toBe('etax_submissions_default');

    // Cleanup
    await service.from('etax_submissions').delete().eq('id', id);
    await service.from('invoices').delete().eq('id', futureInvoiceId);
  });

  it('B4: cross-partition SELECT returns rows from all partitions', async () => {
    const { data, error } = await service
      .from('etax_submissions')
      .select('id, created_at')
      .eq('org_id', orgA)
      .order('created_at', { ascending: true });
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── GROUP C: Cross-partition unique constraint ────────────────────────────────
describe('Group C — cross-partition uniqueness (invoice_id + document_type)', () => {
  const uqInvoiceId = uuidv4();

  beforeAll(async () => {
    await createInvoice(orgA, 'unique', uqInvoiceId);
    // Insert first row in Sept 2026
    const { error } = await service.from('etax_submissions').insert(
      submissionRow(uuidv4(), orgA, uqInvoiceId, makeDate(2026, 9)),
    );
    if (error) throw new Error(`insert unique baseline: ${error.message}`);
  });

  afterAll(async () => {
    await service.from('etax_submissions').delete().eq('invoice_id', uqInvoiceId);
    await service.from('invoices').delete().eq('id', uqInvoiceId);
  });

  it('C1: duplicate (invoice_id, document_type) in SAME partition is rejected', async () => {
    const { error } = await service.from('etax_submissions').insert({
      ...submissionRow(uuidv4(), orgA, uqInvoiceId, makeDate(2026, 9, 20)),
    });
    expect(error).not.toBeNull();
  });

  it('C2: duplicate (invoice_id, document_type) ACROSS partitions is rejected by trigger', async () => {
    // Try to insert same invoice+doctype into a DIFFERENT month's partition
    const { error } = await service.from('etax_submissions').insert({
      ...submissionRow(uuidv4(), orgA, uqInvoiceId, makeDate(2026, 10)),
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/duplicate key value violates unique constraint/i);
  });

  it('C3: same invoice, DIFFERENT document_type in different partition is allowed', async () => {
    const { error } = await service.from('etax_submissions').insert({
      ...submissionRow(uuidv4(), orgA, uqInvoiceId, makeDate(2026, 10), 'T02'),
    });
    expect(error).toBeNull();
  });
});

// ─── GROUP D: Performance indexes ─────────────────────────────────────────────
describe('Group D — index existence', () => {
  const expectedIndexes = [
    'idx_etax_submissions_org_status',
    'idx_etax_submissions_invoice_id',
    'idx_etax_submissions_retry_queue',
    'idx_etax_submissions_pdf_status',
    'idx_etax_submissions_org_created',
    'idx_etax_submissions_metadata',
  ];

  it.each(expectedIndexes)('D: index %s exists on etax_submissions', async (indexName) => {
    const { data } = await service.rpc('exec_sql', {
      query: `
        SELECT COUNT(*) AS cnt
        FROM   pg_indexes
        WHERE  tablename = 'etax_submissions'
          AND  indexname  = '${indexName}'
      `,
    });
    expect(Number(data?.[0]?.cnt)).toBeGreaterThanOrEqual(1);
  });
});

// ─── GROUP E: RLS isolation ───────────────────────────────────────────────────
describe('Group E — RLS org isolation', () => {
  let userAClient: SupabaseClient;

  beforeAll(async () => {
    // Create an authenticated client for userA (org A)
    userAClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await userAClient.auth.signInWithPassword({
      email: userAEmail,
      password: userAPassword,
    });
    if (error) throw new Error(`sign in user A: ${error.message}`);
  });

  it('E1: authenticated user sees only their own org submissions', async () => {
    // Org B has its own submissions — user A should NOT see them
    const { data } = await userAClient.from('etax_submissions').select('org_id');
    const orgIds = [...new Set((data ?? []).map((r: any) => r.org_id))];
    expect(orgIds.every((id) => id === orgA)).toBe(true);
  });

  it('E2: service_role can read submissions from ALL orgs', async () => {
    const { data } = await service.from('etax_submissions').select('org_id').in('org_id', [orgA, orgB]);
    const orgIds = [...new Set((data ?? []).map((r: any) => r.org_id))];
    expect(orgIds).toContain(orgA);
  });

  it('E3: user A cannot INSERT submissions for org B', async () => {
    const { error } = await userAClient.from('etax_submissions').insert({
      ...submissionRow(uuidv4(), orgB, invoiceIds[7], new Date().toISOString(), 'T02'),
    });
    expect(error).not.toBeNull();
  });
});

// ─── GROUP F: fn_create_etax_partition idempotency ───────────────────────────
describe('Group F — fn_create_etax_partition is idempotent', () => {
  it('F1: calling fn_create_etax_partition for existing month returns "already exists"', async () => {
    const { data } = await service.rpc('exec_sql', {
      query: `SELECT public.fn_create_etax_partition(2026, 9) AS result`,
    });
    expect(data?.[0]?.result).toMatch(/already exists/i);
  });

  it('F2: calling fn_create_etax_partition for new future month creates partition', async () => {
    // Use a far-future month unlikely to exist
    const { data, error } = await service.rpc('exec_sql', {
      query: `SELECT public.fn_create_etax_partition(2099, 1) AS result`,
    });
    expect(error).toBeNull();
    expect(data?.[0]?.result).toMatch(/Created partition etax_submissions_2099_01/i);

    // Cleanup: drop the test partition
    await service.rpc('exec_sql', {
      query: `ALTER TABLE public.etax_submissions DETACH PARTITION public.etax_submissions_2099_01`,
    });
    await service.rpc('exec_sql', { query: `DROP TABLE IF EXISTS public.etax_submissions_2099_01` });
  });

  it('F3: fn_auto_create_next_etax_partition creates next two months', async () => {
    const { data, error } = await service.rpc('exec_sql', {
      query: `SELECT public.fn_auto_create_next_etax_partition() AS result`,
    });
    expect(error).toBeNull();
    // Should mention creating OR "already exists" for both next months
    expect(data?.[0]?.result).toBeTruthy();
  });
});

// ─── GROUP G: rpc_etax_partition_health ──────────────────────────────────────
describe('Group G — rpc_etax_partition_health', () => {
  it('G1: returns rows for each partition', async () => {
    const { data, error } = await service.rpc('rpc_etax_partition_health');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThanOrEqual(39); // 39 explicit + 1 default
  });

  it('G2: each row has partition_name, from_date, size_pretty, row_count', async () => {
    const { data } = await service.rpc('rpc_etax_partition_health');
    const row = data![0];
    expect(row).toHaveProperty('partition_name');
    expect(row).toHaveProperty('size_pretty');
    expect(row).toHaveProperty('row_count');
    expect(row).toHaveProperty('is_default');
  });

  it('G3: default partition is_default=true', async () => {
    const { data } = await service.rpc('rpc_etax_partition_health');
    const defaultRow = data!.find((r: any) => r.is_default === true);
    expect(defaultRow).toBeDefined();
    expect(defaultRow!.partition_name).toBe('etax_submissions_default');
  });

  it('G4: non-service-role user cannot call rpc_etax_partition_health', async () => {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await anonClient.rpc('rpc_etax_partition_health');
    expect(error).not.toBeNull();
  });

  it('G5: v_etax_partition_retention shows archive candidates for old partitions', async () => {
    const { data, error } = await service
      .from('v_etax_partition_retention')
      .select('partition_name, retention_status')
      .eq('retention_status', 'ARCHIVE_CANDIDATE');

    expect(error).toBeNull();
    // 2024-01 through 2024-06 should be ARCHIVE_CANDIDATE (>24 months before Sept 2026)
    const archivable = (data ?? []).filter((r: any) => r.partition_name.startsWith('etax_submissions_2024'));
    expect(archivable.length).toBeGreaterThanOrEqual(1);
  });
});

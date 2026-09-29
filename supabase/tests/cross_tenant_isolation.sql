-- =============================================================================
-- cross_tenant_isolation.sql — pgTAP cross-tenant isolation integration tests
--
-- Suite: 25 tests
-- Purpose: Verify that the RLS policies introduced in migrations 0173–0183
--          prevent one tenant (Beta) from reading or mutating rows that belong
--          to another tenant (Alpha).
--
-- Test groups:
--   T01–T02  Setup verification
--   T03–T08  SELECT isolation  (Beta sees 0 Alpha rows for every hardened table)
--   T09–T12  INSERT rejection  (Beta cannot insert rows with Alpha org_id)
--   T13–T14  UPDATE isolation  (Beta UPDATE on Alpha rows affects 0 rows)
--   T15–T17  Own-org access    (Beta can see / write its own rows)
--   T18–T22  Row integrity     (Alpha data is unchanged after Beta access attempts)
--   T23–T25  DELETE isolation  (Beta DELETE on Alpha customer/job/quotation_line rows affect 0 rows)
--
-- Design notes:
--   * Runs inside BEGIN … ROLLBACK so no persistent state is written.
--   * Uses SET LOCAL session_replication_role = replica to bypass FK checks on
--     org_members.user_id → auth.users and job.created_by → auth.users.
--   * Uses SET LOCAL row_security = off for fixture insertion so we can plant
--     rows for both tenants without satisfying RLS at INSERT time.
--   * Switches to the authenticated role and injects JWT claims via set_config
--     to simulate the Beta user calling the API.
--   * Tables covered: customer, job, job_panel, quotation_line,
--                     audit_logs, notifications.
--
-- Sentinel UUIDs:
--   Alpha org  : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org  : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha user : a1a1a1a1-0000-0000-0001-000000000002
--   Beta  user : b2b2b2b2-0000-0000-0001-000000000002
-- =============================================================================

BEGIN;

SELECT plan(25);

-- ---------------------------------------------------------------------------
-- T01  Confirm we are running as superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants with row_security OFF
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;   -- bypass FK to auth.users
SET LOCAL row_security = off;

-- ── Organizations ─────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Alpha Co',  'alpha-co'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Beta  Co',  'beta-co')
ON CONFLICT (org_id) DO NOTHING;

-- ── org_members ───────────────────────────────────────────────────────────
INSERT INTO public.org_members (member_id, org_id, user_id, email, role, is_active) VALUES
  (gen_random_uuid(), 'a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002', 'alpha@example.com', 'OWNER', true),
  (gen_random_uuid(), 'b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta@example.com',  'OWNER', true)
ON CONFLICT DO NOTHING;

-- ── Alpha customer ────────────────────────────────────────────────────────
INSERT INTO public.customers
  (customer_id, name, org_id)
VALUES
  ('a1a1a1a1-0001-0000-0000-000000000001', 'Alpha Customer', 'a1a1a1a1-0000-0000-0000-000000000001');

-- ── Alpha job ─────────────────────────────────────────────────────────────
INSERT INTO public.jobs
  (job_id, job_code, title, customer_id, created_by, org_id)
VALUES
  ('a1a1a1a1-0002-0000-0000-000000000001', 'J-ALPHA-001', 'Alpha Job',
   'a1a1a1a1-0001-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002',
   'a1a1a1a1-0000-0000-0000-000000000001');

-- ── Alpha job_panel ───────────────────────────────────────────────────────
INSERT INTO public.job_panels
  (panel_id, job_id, name, material, width_mm, height_mm, org_id)
VALUES
  ('a1a1a1a1-0003-0000-0000-000000000001',
   'a1a1a1a1-0002-0000-0000-000000000001',
   'Panel A', 'MDF 18mm White', 600, 900,
   'a1a1a1a1-0000-0000-0000-000000000001');

-- ── Alpha quotation (needed for quotation_line FK) ────────────────────────
INSERT INTO public.quotations
  (quotation_id, quotation_code, customer_id, created_by, org_id)
VALUES
  ('a1a1a1a1-0004-0000-0000-000000000001', 'Q-ALPHA-001',
   'a1a1a1a1-0001-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002',
   'a1a1a1a1-0000-0000-0000-000000000001');

-- ── Alpha quotation_line ──────────────────────────────────────────────────
INSERT INTO public.quotation_lines
  (line_id, quotation_id, description, org_id)
VALUES
  ('a1a1a1a1-0005-0000-0000-000000000001',
   'a1a1a1a1-0004-0000-0000-000000000001',
   'Alpha Line Item',
   'a1a1a1a1-0000-0000-0000-000000000001');

-- ── Alpha audit_logs ──────────────────────────────────────────────────────
INSERT INTO public.audit_logs
  (id, org_id, action, actor_type, actor_id, actor_name)
VALUES
  ('a1a1a1a1-0006-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0000-000000000001',
   'TEST_EVENT', 'user',
   'a1a1a1a1-0000-0000-0001-000000000002',
   'Alpha User');

-- ── Alpha notifications ───────────────────────────────────────────────────
INSERT INTO public.notifications
  (id, org_id, user_id, category, priority, title, body)
VALUES
  ('a1a1a1a1-0007-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002',
   'system', 'normal', 'Alpha Notification', 'Alpha body text');

-- ── Beta customer (own-org fixture for T15–T17) ───────────────────────────
INSERT INTO public.customers
  (customer_id, name, org_id)
VALUES
  ('b2b2b2b2-0001-0000-0000-000000000001', 'Beta Customer', 'b2b2b2b2-0000-0000-0000-000000000001');

-- ── Beta job ──────────────────────────────────────────────────────────────
INSERT INTO public.jobs
  (job_id, job_code, title, customer_id, created_by, org_id)
VALUES
  ('b2b2b2b2-0002-0000-0000-000000000001', 'J-BETA-001', 'Beta Job',
   'b2b2b2b2-0001-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002',
   'b2b2b2b2-0000-0000-0000-000000000001');

-- ── Beta quotation_line ───────────────────────────────────────────────────
INSERT INTO public.quotations
  (quotation_id, quotation_code, customer_id, created_by, org_id)
VALUES
  ('b2b2b2b2-0004-0000-0000-000000000001', 'Q-BETA-001',
   'b2b2b2b2-0001-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002',
   'b2b2b2b2-0000-0000-0000-000000000001');

INSERT INTO public.quotation_lines
  (line_id, quotation_id, description, org_id)
VALUES
  ('b2b2b2b2-0005-0000-0000-000000000001',
   'b2b2b2b2-0004-0000-0000-000000000001',
   'Beta Line Item',
   'b2b2b2b2-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Switch to Beta user context
-- ---------------------------------------------------------------------------
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0001-000000000002","role":"authenticated"}',
  true   -- local to transaction
);

-- ---------------------------------------------------------------------------
-- T02  Confirm RLS is active in this session
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('row_security') = 'on',
  'T02: row_security is ON for Beta user context'
);

-- ===========================================================================
-- T03–T08  SELECT isolation
-- ===========================================================================

-- T03  audit_logs
SELECT is(
  (SELECT COUNT(*) FROM public.audit_logs
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T03: Beta sees 0 Alpha rows in audit_logs'
);

-- T04  notifications
SELECT is(
  (SELECT COUNT(*) FROM public.notifications
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T04: Beta sees 0 Alpha rows in notifications'
);

-- T05  customer
SELECT is(
  (SELECT COUNT(*) FROM public.customers
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T05: Beta sees 0 Alpha rows in customer'
);

-- T06  job
SELECT is(
  (SELECT COUNT(*) FROM public.jobs
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T06: Beta sees 0 Alpha rows in job'
);

-- T07  job_panel
SELECT is(
  (SELECT COUNT(*) FROM public.job_panels
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T07: Beta sees 0 Alpha rows in job_panel'
);

-- T08  quotation_line
SELECT is(
  (SELECT COUNT(*) FROM public.quotation_lines
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T08: Beta sees 0 Alpha rows in quotation_line'
);

-- ===========================================================================
-- T09–T12  INSERT rejection  (SQLSTATE 42501 — insufficient_privilege)
-- ===========================================================================

-- T09  customer INSERT with Alpha org_id
SELECT throws_ok(
  $$ INSERT INTO public.customers (customer_id, name, org_id)
     VALUES (gen_random_uuid(), 'Trojan Customer',
             'a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  'T09: INSERT into customer with Alpha org_id is rejected (42501)'
);

-- T10  job INSERT with Alpha org_id
SELECT throws_ok(
  $$ INSERT INTO public.jobs (job_id, job_code, title, customer_id, created_by, org_id)
     VALUES (gen_random_uuid(), 'J-TROJAN-001', 'Trojan Job',
             'a1a1a1a1-0001-0000-0000-000000000001',
             'b2b2b2b2-0000-0000-0001-000000000002',
             'a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  'T10: INSERT into job with Alpha org_id is rejected (42501)'
);

-- T11  job_panel INSERT with Alpha org_id
SELECT throws_ok(
  $$ INSERT INTO public.job_panels (panel_id, job_id, name, material, width_mm, height_mm, org_id)
     VALUES (gen_random_uuid(),
             'a1a1a1a1-0002-0000-0000-000000000001',
             'Trojan Panel', 'MDF 18mm White', 300, 600,
             'a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  'T11: INSERT into job_panel with Alpha org_id is rejected (42501)'
);

-- T12  quotation_line INSERT with Alpha org_id
SELECT throws_ok(
  $$ INSERT INTO public.quotation_lines (line_id, quotation_id, description, org_id)
     VALUES (gen_random_uuid(),
             'a1a1a1a1-0004-0000-0000-000000000001',
             'Trojan Line',
             'a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  'T12: INSERT into quotation_line with Alpha org_id is rejected (42501)'
);

-- ===========================================================================
-- T13–T14  UPDATE isolation
-- ===========================================================================

-- T13  UPDATE customer — Beta UPDATE on Alpha row touches 0 rows
WITH upd AS (
  UPDATE public.customers
     SET name = 'Tampered'
   WHERE customer_id = 'a1a1a1a1-0001-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT COUNT(*) FROM upd),
  0::bigint,
  'T13: Beta UPDATE on Alpha customer row affects 0 rows'
);

-- T14  UPDATE job — Beta UPDATE on Alpha row touches 0 rows
WITH upd AS (
  UPDATE public.jobs
     SET title = 'Tampered'
   WHERE job_id = 'a1a1a1a1-0002-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT COUNT(*) FROM upd),
  0::bigint,
  'T14: Beta UPDATE on Alpha job row affects 0 rows'
);

-- ===========================================================================
-- T23      DELETE isolation
-- ===========================================================================

-- T23  DELETE customer — Beta DELETE on Alpha row touches 0 rows
WITH del AS (
  DELETE FROM public.customers
   WHERE customer_id = 'a1a1a1a1-0001-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT COUNT(*) FROM del),
  0::bigint,
  'T23: Beta DELETE on Alpha customer row affects 0 rows'
);

-- T24  DELETE job — Beta DELETE on Alpha job row touches 0 rows
WITH del AS (
  DELETE FROM public.jobs
   WHERE job_id = 'a1a1a1a1-0002-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT COUNT(*) FROM del),
  0::bigint,
  'T24: Beta DELETE on Alpha job row affects 0 rows'
);

-- T25  DELETE quotation_line — Beta DELETE on Alpha quotation_line row touches 0 rows
WITH del AS (
  DELETE FROM public.quotation_lines
   WHERE line_id = 'a1a1a1a1-0005-0000-0000-000000000001'
  RETURNING 1
)
SELECT is(
  (SELECT COUNT(*) FROM del),
  0::bigint,
  'T25: Beta DELETE on Alpha quotation_line row affects 0 rows'
);

-- ===========================================================================
-- T15–T17  Own-org access (Beta CAN see / write its own rows)
-- ===========================================================================

-- T15  Beta can SELECT its own customer row
SELECT is(
  (SELECT COUNT(*) FROM public.customers
    WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T15: Beta sees its own customer row'
);

-- T16  Beta can SELECT its own job row
SELECT is(
  (SELECT COUNT(*) FROM public.jobs
    WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T16: Beta sees its own job row'
);

-- T17  Beta can INSERT a new customer into its own org
SELECT lives_ok(
  $$ INSERT INTO public.customers (customer_id, name, org_id)
     VALUES (gen_random_uuid(), 'Beta New Customer',
             'b2b2b2b2-0000-0000-0000-000000000001') $$,
  'T17: Beta can INSERT customer row into its own org'
);

-- ===========================================================================
-- T18–T22  Row integrity (Alpha data unchanged after Beta access attempts)
-- ===========================================================================

-- Drop back to superuser to read without RLS filter
RESET ROLE;
SET LOCAL row_security = off;

-- T18  Alpha customer row name is unmodified
SELECT is(
  (SELECT name FROM public.customers
    WHERE customer_id = 'a1a1a1a1-0001-0000-0000-000000000001'),
  'Alpha Customer',
  'T18: Alpha customer row name is unchanged after Beta UPDATE attempt'
);

-- T19  Alpha job title is unmodified
SELECT is(
  (SELECT title FROM public.jobs
    WHERE job_id = 'a1a1a1a1-0002-0000-0000-000000000001'),
  'Alpha Job',
  'T19: Alpha job title is unchanged after Beta UPDATE attempt'
);

-- T20  Alpha audit_logs row still exists
SELECT is(
  (SELECT COUNT(*) FROM public.audit_logs
    WHERE id = 'a1a1a1a1-0006-0000-0000-000000000001'),
  1::bigint,
  'T20: Alpha audit_logs row still exists (not deleted by Beta)'
);

-- T21  Alpha notifications row still exists
SELECT is(
  (SELECT COUNT(*) FROM public.notifications
    WHERE id = 'a1a1a1a1-0007-0000-0000-000000000001'),
  1::bigint,
  'T21: Alpha notifications row still exists (not deleted by Beta)'
);

-- T22  No stray Alpha-org rows created via Beta INSERT attempts
SELECT is(
  (SELECT COUNT(*) FROM public.customers
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'
      AND name = 'Trojan Customer'),
  0::bigint,
  'T22: No trojan customer row landed in Alpha org'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;

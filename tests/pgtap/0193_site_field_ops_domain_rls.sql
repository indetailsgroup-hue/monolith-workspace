-- =============================================================================
-- 0193_site_field_ops_domain_rls.sql  —  pgTAP tests (35 tests)
-- Phase 2 RLS — Site / Field Ops domain
-- T-0193-01 → T-0193-35
-- =============================================================================
BEGIN;
SELECT plan(35);

-- ---------------------------------------------------------------------------
-- Structural checks: org_id column + NOT NULL + RLS enabled + policy exists
-- 4 tests × 7 tables = 28 tests (T-0193-01 → T-0193-28)
-- ---------------------------------------------------------------------------

-- appointments (T-0193-01..04)
SELECT has_column('public', 'appointments', 'org_id',
  'T-0193-01: appointments has org_id column');
SELECT col_not_null('public', 'appointments', 'org_id',
  'T-0193-02: appointments.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'appointments' AND n.nspname = 'public'),
  'T-0193-03: appointments has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'appointments'
            AND policyname = 'appointments_tenant_isolation'),
  'T-0193-04: appointments_tenant_isolation policy exists');

-- daily_reports (T-0193-05..08)
SELECT has_column('public', 'daily_reports', 'org_id',
  'T-0193-05: daily_reports has org_id column');
SELECT col_not_null('public', 'daily_reports', 'org_id',
  'T-0193-06: daily_reports.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'daily_reports' AND n.nspname = 'public'),
  'T-0193-07: daily_reports has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'daily_reports'
            AND policyname = 'daily_reports_tenant_isolation'),
  'T-0193-08: daily_reports_tenant_isolation policy exists');

-- qc_inspections (T-0193-09..12)
SELECT has_column('public', 'qc_inspections', 'org_id',
  'T-0193-09: qc_inspections has org_id column');
SELECT col_not_null('public', 'qc_inspections', 'org_id',
  'T-0193-10: qc_inspections.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'qc_inspections' AND n.nspname = 'public'),
  'T-0193-11: qc_inspections has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'qc_inspections'
            AND policyname = 'qc_inspections_tenant_isolation'),
  'T-0193-12: qc_inspections_tenant_isolation policy exists');

-- site_checkins (T-0193-13..16)
SELECT has_column('public', 'site_checkins', 'org_id',
  'T-0193-13: site_checkins has org_id column');
SELECT col_not_null('public', 'site_checkins', 'org_id',
  'T-0193-14: site_checkins.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'site_checkins' AND n.nspname = 'public'),
  'T-0193-15: site_checkins has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'site_checkins'
            AND policyname = 'site_checkins_tenant_isolation'),
  'T-0193-16: site_checkins_tenant_isolation policy exists');

-- site_survey_zone (T-0193-17..20)
SELECT has_column('public', 'site_survey_zone', 'org_id',
  'T-0193-17: site_survey_zone has org_id column');
SELECT col_not_null('public', 'site_survey_zone', 'org_id',
  'T-0193-18: site_survey_zone.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'site_survey_zone' AND n.nspname = 'public'),
  'T-0193-19: site_survey_zone has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'site_survey_zone'
            AND policyname = 'site_survey_zone_tenant_isolation'),
  'T-0193-20: site_survey_zone_tenant_isolation policy exists');

-- variation_orders (T-0193-21..24)
SELECT has_column('public', 'variation_orders', 'org_id',
  'T-0193-21: variation_orders has org_id column');
SELECT col_not_null('public', 'variation_orders', 'org_id',
  'T-0193-22: variation_orders.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'variation_orders' AND n.nspname = 'public'),
  'T-0193-23: variation_orders has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'variation_orders'
            AND policyname = 'variation_orders_tenant_isolation'),
  'T-0193-24: variation_orders_tenant_isolation policy exists');

-- work_packages (T-0193-25..28)
SELECT has_column('public', 'work_packages', 'org_id',
  'T-0193-25: work_packages has org_id column');
SELECT col_not_null('public', 'work_packages', 'org_id',
  'T-0193-26: work_packages.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'work_packages' AND n.nspname = 'public'),
  'T-0193-27: work_packages has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'work_packages'
            AND policyname = 'work_packages_tenant_isolation'),
  'T-0193-28: work_packages_tenant_isolation policy exists');

-- ---------------------------------------------------------------------------
-- Isolation tests (T-0193-29 → T-0193-35)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- Fixture: installation_projects
INSERT INTO public.installation_projects (id, org_id, site_code, name, status)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'SITE-0193-A', 'Alpha 0193 Project', 'active'),
  ('b2b2b2b2-0193-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 'SITE-0193-B', 'Beta 0193 Project', 'active')
ON CONFLICT DO NOTHING;

-- Fixture: appointments
INSERT INTO public.appointments (id, org_id, project_id, kind, scheduled_at, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, 'survey', now(), 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000010'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, 'survey', now(), 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: daily_reports
INSERT INTO public.daily_reports (id, org_id, project_id, report_date, draft, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000020'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, current_date, '{}'::jsonb, 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000020'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, current_date - 1, '{}'::jsonb, 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: qc_inspections
INSERT INTO public.qc_inspections (id, org_id, project_id, result, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, 'pass', 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000030'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, 'pass', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: site_checkins
INSERT INTO public.site_checkins (id, org_id, project_id, work_date, checked_in_at, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000040'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, current_date, now(), 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000040'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, current_date - 1, now(), 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: variation_orders
INSERT INTO public.variation_orders (id, org_id, project_id, vo_number, reason, description, body, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000050'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, 1, 'client_request', 'Test VO Alpha', 'Body Alpha', 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000050'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, 1, 'client_request', 'Test VO Beta', 'Body Beta', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: work_packages
INSERT INTO public.work_packages (id, org_id, project_id, code, name, created_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000060'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0193-0000-0000-000000000001'::uuid, 'WP-0193-T', 'Test Package Alpha', 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000060'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0193-0000-0000-000000000001'::uuid, 'WP-0193-T', 'Test Package Beta', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: site_survey_zone
INSERT INTO public.site_survey_zone (id, org_id, site_code, zone, version, dimension, mep, status, surveyed_by)
VALUES
  ('a1a1a1a1-0193-0000-0000-000000000070'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'SITE-0193-A', 'Z1', 1, '{}'::jsonb, '{}'::jsonb, 'active', 'test-actor-a'),
  ('b2b2b2b2-0193-0000-0000-000000000070'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'SITE-0193-B', 'Z1', 1, '{}'::jsonb, '{}'::jsonb, 'active', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: org_members — needed by get_user_org_id() which queries org_members
-- SECURITY DEFINER function reads user_id = auth.uid() → must have a matching row
INSERT INTO public.org_members (id, org_id, user_id, email, is_active)
VALUES
  ('a1a1a1a1-0000-0193-0001-000000000001'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0000-0000-0001-000000000002'::uuid,
   'alpha@test.local', true)
ON CONFLICT DO NOTHING;

SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001"}',
  true);

-- T-0193-29: Alpha user cannot see beta's appointments
SELECT is(
  (SELECT count(*)::int FROM public.appointments
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0193-29: alpha user cannot see beta appointments rows');

-- T-0193-30: Alpha user cannot see beta's daily_reports
SELECT is(
  (SELECT count(*)::int FROM public.daily_reports
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0193-30: alpha user cannot see beta daily_reports rows');

-- T-0193-31: Alpha user cannot see beta's qc_inspections
SELECT is(
  (SELECT count(*)::int FROM public.qc_inspections
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0193-31: alpha user cannot see beta qc_inspections rows');

-- T-0193-32: Alpha user cannot see beta's variation_orders
SELECT is(
  (SELECT count(*)::int FROM public.variation_orders
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0193-32: alpha user cannot see beta variation_orders rows');

-- T-0193-33: Alpha user cannot see beta's site_checkins
SELECT is(
  (SELECT count(*)::int FROM public.site_checkins
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0193-33: alpha user cannot see beta site_checkins rows');

-- T-0193-34: Alpha user can see own work_packages
SELECT ok(
  (SELECT count(*)::int FROM public.work_packages
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0193-34: alpha user can see own work_packages rows');

-- T-0193-35: Alpha user can see own site_survey_zone
SELECT ok(
  (SELECT count(*)::int FROM public.site_survey_zone
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0193-35: alpha user can see own site_survey_zone rows');

SELECT * FROM finish();
ROLLBACK;

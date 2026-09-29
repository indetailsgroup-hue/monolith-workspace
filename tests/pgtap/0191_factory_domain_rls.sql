-- =============================================================================
-- 0191_package_sales_domain_rls.sql  —  pgTAP tests (35 tests)
-- Phase 2 RLS — Package / Sales domain
-- T-0191-01 → T-0191-35
-- =============================================================================
BEGIN;
SELECT plan(35);

-- ---------------------------------------------------------------------------
-- Structural checks: org_id column + NOT NULL + RLS enabled + policy exists
-- 4 tests × 7 tables = 28 tests (T-0191-01 → T-0191-28)
-- ---------------------------------------------------------------------------

-- package_addons (T-0191-01..04)
SELECT has_column('public', 'package_addons', 'org_id',
  'T-0191-01: package_addons has org_id column');
SELECT col_not_null('public', 'package_addons', 'org_id',
  'T-0191-02: package_addons.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'package_addons' AND n.nspname = 'public'),
  'T-0191-03: package_addons has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'package_addons'
            AND policyname = 'package_addons_tenant_isolation'),
  'T-0191-04: package_addons_tenant_isolation policy exists');

-- package_estimates (T-0191-05..08)
SELECT has_column('public', 'package_estimates', 'org_id',
  'T-0191-05: package_estimates has org_id column');
SELECT col_not_null('public', 'package_estimates', 'org_id',
  'T-0191-06: package_estimates.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'package_estimates' AND n.nspname = 'public'),
  'T-0191-07: package_estimates has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'package_estimates'
            AND policyname = 'package_estimates_tenant_isolation'),
  'T-0191-08: package_estimates_tenant_isolation policy exists');

-- package_materials (T-0191-09..12)
SELECT has_column('public', 'package_materials', 'org_id',
  'T-0191-09: package_materials has org_id column');
SELECT col_not_null('public', 'package_materials', 'org_id',
  'T-0191-10: package_materials.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'package_materials' AND n.nspname = 'public'),
  'T-0191-11: package_materials has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'package_materials'
            AND policyname = 'package_materials_tenant_isolation'),
  'T-0191-12: package_materials_tenant_isolation policy exists');

-- package_stages (T-0191-13..16)
SELECT has_column('public', 'package_stages', 'org_id',
  'T-0191-13: package_stages has org_id column');
SELECT col_not_null('public', 'package_stages', 'org_id',
  'T-0191-14: package_stages.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'package_stages' AND n.nspname = 'public'),
  'T-0191-15: package_stages has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'package_stages'
            AND policyname = 'package_stages_tenant_isolation'),
  'T-0191-16: package_stages_tenant_isolation policy exists');

-- price_rates (T-0191-17..20)
SELECT has_column('public', 'price_rates', 'org_id',
  'T-0191-17: price_rates has org_id column');
SELECT col_not_null('public', 'price_rates', 'org_id',
  'T-0191-18: price_rates.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'price_rates' AND n.nspname = 'public'),
  'T-0191-19: price_rates has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'price_rates'
            AND policyname = 'price_rates_tenant_isolation'),
  'T-0191-20: price_rates_tenant_isolation policy exists');

-- project_turnkey (T-0191-21..24)
SELECT has_column('public', 'project_turnkey', 'org_id',
  'T-0191-21: project_turnkey has org_id column');
SELECT col_not_null('public', 'project_turnkey', 'org_id',
  'T-0191-22: project_turnkey.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'project_turnkey' AND n.nspname = 'public'),
  'T-0191-23: project_turnkey has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'project_turnkey'
            AND policyname = 'project_turnkey_tenant_isolation'),
  'T-0191-24: project_turnkey_tenant_isolation policy exists');

-- turnkey_offers (T-0191-25..28)
SELECT has_column('public', 'turnkey_offers', 'org_id',
  'T-0191-25: turnkey_offers has org_id column');
SELECT col_not_null('public', 'turnkey_offers', 'org_id',
  'T-0191-26: turnkey_offers.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'turnkey_offers' AND n.nspname = 'public'),
  'T-0191-27: turnkey_offers has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'turnkey_offers'
            AND policyname = 'turnkey_offers_tenant_isolation'),
  'T-0191-28: turnkey_offers_tenant_isolation policy exists');

-- ---------------------------------------------------------------------------
-- Isolation tests (T-0191-29 → T-0191-35)
-- Setup: insert fixture rows bypassing RLS, then test live SELECT isolation
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- Fixture: one project per org (alpha + beta), one work_package each,
-- one package_stage and one project_turnkey per org, plus sentinel rows
INSERT INTO public.installation_projects (id, org_id, site_code, name, status)
VALUES
  ('a1a1a1a1-0191-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'SITE-0191-A', 'Alpha 0191 Project', 'active'),
  ('b2b2b2b2-0191-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'SITE-0191-B', 'Beta 0191 Project', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.work_packages (id, project_id, site_code, code, name, status, org_id)
VALUES
  ('a1a1a1a1-0191-0000-0000-000000000002'::uuid, 'a1a1a1a1-0191-0000-0000-000000000001'::uuid, 'SITE-0191-A', 'WP-A-0191', 'Alpha Work Package', 'active', 'a1a1a1a1-0000-0000-0000-000000000001'::uuid),
  ('b2b2b2b2-0191-0000-0000-000000000002'::uuid, 'b2b2b2b2-0191-0000-0000-000000000001'::uuid, 'SITE-0191-B', 'WP-B-0191', 'Beta Work Package', 'active', 'b2b2b2b2-0000-0000-0001-000000000002'::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO public.package_stages (id, package_id, org_id, seq, stage, status)
VALUES
  ('a1a1a1a1-0191-0000-0000-000000000010'::uuid, 'a1a1a1a1-0191-0000-0000-000000000002'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 1, 'machining', 'pending'),
  ('b2b2b2b2-0191-0000-0000-000000000010'::uuid, 'b2b2b2b2-0191-0000-0000-000000000002'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 1, 'machining', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO public.project_turnkey (project_id, org_id, tier, price_snapshot, delivery_days)
VALUES
  ('a1a1a1a1-0191-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'standard', 150000, 60),
  ('b2b2b2b2-0191-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'premium', 250000, 90)
ON CONFLICT DO NOTHING;

INSERT INTO public.price_rates (material_grade, org_id, rate_min_per_sqm, rate_max_per_sqm)
VALUES
  ('standard-0191', '00000000-0000-0000-0000-000000000000'::uuid, 800, 1200)
ON CONFLICT DO NOTHING;

INSERT INTO public.turnkey_offers (tier, org_id, name, price, delivery_days, warranty_years, is_active)
VALUES
  ('test-0191', '00000000-0000-0000-0000-000000000000'::uuid, 'Test Offer 0191', 99000, 45, 1, true)
ON CONFLICT DO NOTHING;

SET LOCAL row_security = on;

-- T-0191-29: Alpha user cannot see beta's package_stages
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001"}',
  true);
SELECT is(
  (SELECT count(*)::int FROM public.package_stages
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0191-29: alpha user cannot see beta package_stages rows');

-- T-0191-30: Alpha user cannot see beta's project_turnkey
SELECT is(
  (SELECT count(*)::int FROM public.project_turnkey
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0191-30: alpha user cannot see beta project_turnkey rows');

-- T-0191-31: Alpha user cannot see beta's package_materials
SELECT is(
  (SELECT count(*)::int FROM public.package_materials
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0191-31: alpha user cannot see beta package_materials rows');

-- T-0191-32: Alpha user can see own package_stages
SELECT ok(
  (SELECT count(*)::int FROM public.package_stages
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0191-32: alpha user can see own package_stages rows');

-- T-0191-33: Alpha user can see own project_turnkey
SELECT ok(
  (SELECT count(*)::int FROM public.project_turnkey
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0191-33: alpha user can see own project_turnkey rows');

-- T-0191-34: Any authenticated user can read sentinel price_rates
SELECT ok(
  (SELECT count(*)::int FROM public.price_rates
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 1,
  'T-0191-34: authenticated user can read sentinel price_rates config');

-- T-0191-35: Any authenticated user can read sentinel turnkey_offers
SELECT ok(
  (SELECT count(*)::int FROM public.turnkey_offers
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 1,
  'T-0191-35: authenticated user can read sentinel turnkey_offers config');

SELECT * FROM finish();
ROLLBACK;

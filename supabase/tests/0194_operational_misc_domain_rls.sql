-- =============================================================================
-- 0194_operational_misc_domain_rls.sql  —  pgTAP tests (51 tests)
-- Phase 2 RLS — Operational / Misc domain
-- T-0194-01 → T-0194-51
-- =============================================================================
BEGIN;
SELECT plan(51);

-- ---------------------------------------------------------------------------
-- Structural checks: org_id column + NOT NULL + RLS enabled + policy exists
-- 4 tests × 11 tables = 44 tests (T-0194-01 → T-0194-44)
-- ---------------------------------------------------------------------------

-- design_lock_field_config (T-0194-01..04)
SELECT has_column('public', 'design_lock_field_config', 'org_id',
  'T-0194-01: design_lock_field_config has org_id column');
SELECT col_not_null('public', 'design_lock_field_config', 'org_id',
  'T-0194-02: design_lock_field_config.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'design_lock_field_config' AND n.nspname = 'public'),
  'T-0194-03: design_lock_field_config has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'design_lock_field_config'
            AND policyname = 'design_lock_field_config_tenant_isolation'),
  'T-0194-04: design_lock_field_config_tenant_isolation policy exists');

-- issue_routing (T-0194-05..08)
SELECT has_column('public', 'issue_routing', 'org_id',
  'T-0194-05: issue_routing has org_id column');
SELECT col_not_null('public', 'issue_routing', 'org_id',
  'T-0194-06: issue_routing.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'issue_routing' AND n.nspname = 'public'),
  'T-0194-07: issue_routing has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'issue_routing'
            AND policyname = 'issue_routing_tenant_isolation'),
  'T-0194-08: issue_routing_tenant_isolation policy exists');

-- lead_followup_config (T-0194-09..12)
SELECT has_column('public', 'lead_followup_config', 'org_id',
  'T-0194-09: lead_followup_config has org_id column');
SELECT col_not_null('public', 'lead_followup_config', 'org_id',
  'T-0194-10: lead_followup_config.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'lead_followup_config' AND n.nspname = 'public'),
  'T-0194-11: lead_followup_config has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'lead_followup_config'
            AND policyname = 'lead_followup_config_tenant_isolation'),
  'T-0194-12: lead_followup_config_tenant_isolation policy exists');

-- material_master (T-0194-13..16)
SELECT has_column('public', 'material_master', 'org_id',
  'T-0194-13: material_master has org_id column');
SELECT col_not_null('public', 'material_master', 'org_id',
  'T-0194-14: material_master.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'material_master' AND n.nspname = 'public'),
  'T-0194-15: material_master has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'material_master'
            AND policyname = 'material_master_tenant_isolation'),
  'T-0194-16: material_master_tenant_isolation policy exists');

-- material_purchase_price (T-0194-17..20)
SELECT has_column('public', 'material_purchase_price', 'org_id',
  'T-0194-17: material_purchase_price has org_id column');
SELECT col_not_null('public', 'material_purchase_price', 'org_id',
  'T-0194-18: material_purchase_price.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'material_purchase_price' AND n.nspname = 'public'),
  'T-0194-19: material_purchase_price has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'material_purchase_price'
            AND policyname = 'material_purchase_price_tenant_isolation'),
  'T-0194-20: material_purchase_price_tenant_isolation policy exists');

-- ops_contacts (T-0194-21..24)
SELECT has_column('public', 'ops_contacts', 'org_id',
  'T-0194-21: ops_contacts has org_id column');
SELECT col_not_null('public', 'ops_contacts', 'org_id',
  'T-0194-22: ops_contacts.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'ops_contacts' AND n.nspname = 'public'),
  'T-0194-23: ops_contacts has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'ops_contacts'
            AND policyname = 'ops_contacts_tenant_isolation'),
  'T-0194-24: ops_contacts_tenant_isolation policy exists');

-- phase_rosters (T-0194-25..28)
SELECT has_column('public', 'phase_rosters', 'org_id',
  'T-0194-25: phase_rosters has org_id column');
SELECT col_not_null('public', 'phase_rosters', 'org_id',
  'T-0194-26: phase_rosters.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'phase_rosters' AND n.nspname = 'public'),
  'T-0194-27: phase_rosters has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'phase_rosters'
            AND policyname = 'phase_rosters_tenant_isolation'),
  'T-0194-28: phase_rosters_tenant_isolation policy exists');

-- released_spec (T-0194-29..32)
SELECT has_column('public', 'released_spec', 'org_id',
  'T-0194-29: released_spec has org_id column');
SELECT col_not_null('public', 'released_spec', 'org_id',
  'T-0194-30: released_spec.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'released_spec' AND n.nspname = 'public'),
  'T-0194-31: released_spec has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'released_spec'
            AND policyname = 'released_spec_tenant_isolation'),
  'T-0194-32: released_spec_tenant_isolation policy exists');

-- revision_event (T-0194-33..36)
SELECT has_column('public', 'revision_event', 'org_id',
  'T-0194-33: revision_event has org_id column');
SELECT col_not_null('public', 'revision_event', 'org_id',
  'T-0194-34: revision_event.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'revision_event' AND n.nspname = 'public'),
  'T-0194-35: revision_event has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'revision_event'
            AND policyname = 'revision_event_tenant_isolation'),
  'T-0194-36: revision_event_tenant_isolation policy exists');

-- staff_bind_tokens (T-0194-37..40)
SELECT has_column('public', 'staff_bind_tokens', 'org_id',
  'T-0194-37: staff_bind_tokens has org_id column');
SELECT col_not_null('public', 'staff_bind_tokens', 'org_id',
  'T-0194-38: staff_bind_tokens.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'staff_bind_tokens' AND n.nspname = 'public'),
  'T-0194-39: staff_bind_tokens has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'staff_bind_tokens'
            AND policyname = 'staff_bind_tokens_tenant_isolation'),
  'T-0194-40: staff_bind_tokens_tenant_isolation policy exists');

-- workflow_audit_log (T-0194-41..44)
SELECT has_column('public', 'workflow_audit_log', 'org_id',
  'T-0194-41: workflow_audit_log has org_id column');
SELECT col_not_null('public', 'workflow_audit_log', 'org_id',
  'T-0194-42: workflow_audit_log.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'workflow_audit_log' AND n.nspname = 'public'),
  'T-0194-43: workflow_audit_log has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'workflow_audit_log'
            AND policyname = 'workflow_audit_log_tenant_isolation'),
  'T-0194-44: workflow_audit_log_tenant_isolation policy exists');

-- ---------------------------------------------------------------------------
-- Isolation tests (T-0194-45 → T-0194-51)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- Fixture: installation_projects (alpha + beta)
INSERT INTO public.installation_projects (id, org_id, site_code, name, status)
VALUES
  ('a1a1a1a1-0194-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'SITE-0194-A', 'Alpha 0194 Project', 'active'),
  ('b2b2b2b2-0194-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'SITE-0194-B', 'Beta 0194 Project', 'active')
ON CONFLICT DO NOTHING;

-- Fixture: phase_rosters (alpha + beta rows)
INSERT INTO public.phase_rosters
  (id, org_id, project_id, phase, employee_id, display_name, role_ref, requested_by)
VALUES
  ('a1a1a1a1-0194-0000-0000-000000000010'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0194-0000-0000-000000000001'::uuid,
   'survey',
   'a1a1a1a1-0000-0000-0001-000000000002'::uuid,
   'Alpha Engineer', 'E2', 'test-actor-a'),
  ('b2b2b2b2-0194-0000-0000-000000000010'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0194-0000-0000-000000000001'::uuid,
   'survey',
   'b2b2b2b2-0000-0000-0001-000000000002'::uuid,
   'Beta Engineer', 'E2', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: material_purchase_price (alpha + beta rows; FK to material_master skipped)
INSERT INTO public.material_purchase_price
  (id, org_id, material_code, unit_price, qty, total, site_code, received_by)
VALUES
  ('a1a1a1a1-0194-0000-0000-000000000020'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'MAT-0194-T', 1000.00, 5, 5000.00, 'SITE-0194-A', 'test-actor-a'),
  ('b2b2b2b2-0194-0000-0000-000000000020'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'MAT-0194-T', 1000.00, 5, 5000.00, 'SITE-0194-B', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: revision_event (alpha + beta rows; FK to work_item skipped)
INSERT INTO public.revision_event
  (id, org_id, work_item_id, gate, site_code, reason, reason_classified_by)
VALUES
  ('a1a1a1a1-0194-0000-0000-000000000030'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'a1a1a1a1-0194-0000-0000-00000000ffff'::uuid,
   'SD1', 'SITE-0194-A', 'scope_change', 'test-actor-a'),
  ('b2b2b2b2-0194-0000-0000-000000000030'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'b2b2b2b2-0194-0000-0000-00000000ffff'::uuid,
   'SD1', 'SITE-0194-B', 'scope_change', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: workflow_audit_log (alpha + beta rows)
INSERT INTO public.workflow_audit_log
  (id, org_id, event_type, site_code, performed_by)
VALUES
  ('a1a1a1a1-0194-0000-0000-000000000040'::uuid,
   'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
   'handoff', 'SITE-0194-A', 'test-actor-a'),
  ('b2b2b2b2-0194-0000-0000-000000000040'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
   'handoff', 'SITE-0194-B', 'test-actor-b')
ON CONFLICT DO NOTHING;

-- Fixture: staff_bind_tokens (sentinel org_id — governance-only table)
INSERT INTO public.staff_bind_tokens
  (token, org_id, employee_id, display_name, department, expires_at, created_by)
VALUES
  ('tok-0194-alpha-01',
   '00000000-0000-0000-0000-000000000000'::uuid,
   'a1a1a1a1-0000-0000-0001-000000000002'::uuid,
   'Alpha User', 'Engineering',
   now() + interval '7 days', 'test-actor-gov'),
  ('tok-0194-beta-01',
   '00000000-0000-0000-0000-000000000000'::uuid,
   'b2b2b2b2-0000-0000-0001-000000000002'::uuid,
   'Beta User', 'Engineering',
   now() + interval '7 days', 'test-actor-gov')
ON CONFLICT DO NOTHING;

-- Fixture: released_spec (sentinel org_id; status=superseded avoids partial unique index conflict)
INSERT INTO public.released_spec
  (id, org_id, bible_code, version, dimension, status, released_by)
VALUES
  ('00000000-0194-0000-0000-000000000051'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid,
   'SPEC-0194-T-1', 1, '{}'::jsonb, 'superseded', 'test-actor'),
  ('00000000-0194-0000-0000-000000000052'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid,
   'SPEC-0194-T-2', 1, '{}'::jsonb, 'superseded', 'test-actor')
ON CONFLICT DO NOTHING;

-- Fixture: issue_routing (ensure 4 seeded sentinel rows present)
INSERT INTO public.issue_routing
  (category, target_roles, bypass_quiet, sla_minutes, label_th, org_id)
VALUES
  ('material', array['E6','E2','E7'], false, 120, 'ของขาด/ของผิด',
   '00000000-0000-0000-0000-000000000000'::uuid),
  ('design',   array['B2','B4'],      false, 120, 'ติดตั้งตามแบบไม่ได้',
   '00000000-0000-0000-0000-000000000000'::uuid),
  ('scope',    array['Sale','D1'],    false, 240, 'ลูกค้าขอเพิ่ม/แก้หน้างาน',
   '00000000-0000-0000-0000-000000000000'::uuid),
  ('safety',   array['D3','HSE'],     true,   30, 'ความปลอดภัย',
   '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (category) DO NOTHING;

SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001"}',
  true);

-- T-0194-45: Alpha user cannot see beta's phase_rosters (strict org_id isolation)
SELECT is(
  (SELECT count(*)::int FROM public.phase_rosters
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0194-45: alpha user cannot see beta phase_rosters rows');

-- T-0194-46: Alpha user cannot see beta's material_purchase_price (strict org_id isolation)
SELECT is(
  (SELECT count(*)::int FROM public.material_purchase_price
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0194-46: alpha user cannot see beta material_purchase_price rows');

-- T-0194-47: Non-governance alpha cannot see beta's revision_event
SELECT is(
  (SELECT count(*)::int FROM public.revision_event
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0194-47: non-governance alpha cannot see beta revision_event rows');

-- T-0194-48: Non-governance alpha cannot see beta's workflow_audit_log
SELECT is(
  (SELECT count(*)::int FROM public.workflow_audit_log
   WHERE org_id = 'b2b2b2b2-0000-0000-0000-000000000001'::uuid),
  0,
  'T-0194-48: non-governance alpha cannot see beta workflow_audit_log rows');

-- T-0194-49: Non-governance alpha sees 0 staff_bind_tokens (governance-only table)
SELECT is(
  (SELECT count(*)::int FROM public.staff_bind_tokens),
  0,
  'T-0194-49: non-governance alpha sees zero staff_bind_tokens rows');

-- T-0194-50: Sentinel issue_routing rows are visible to any authenticated user
SELECT ok(
  (SELECT count(*)::int FROM public.issue_routing
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 4,
  'T-0194-50: sentinel issue_routing rows visible to authenticated alpha user');

-- T-0194-51: Sentinel released_spec rows are visible to any authenticated user
SELECT ok(
  (SELECT count(*)::int FROM public.released_spec
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 2,
  'T-0194-51: sentinel released_spec rows visible to authenticated alpha user');

SELECT * FROM finish();
ROLLBACK;

-- =============================================================================
-- 0192_capture_documents_domain_rls.sql  —  pgTAP tests (35 tests)
-- Phase 2 RLS — Capture / Documents domain
-- T-0192-01 → T-0192-35
-- =============================================================================
BEGIN;
SELECT plan(35);

-- ---------------------------------------------------------------------------
-- Structural checks: org_id column + NOT NULL + RLS enabled + policy exists
-- 4 tests × 7 tables = 28 tests (T-0192-01 → T-0192-28)
-- ---------------------------------------------------------------------------

-- capture_artifact (T-0192-01..04)
SELECT has_column('public', 'capture_artifact', 'org_id',
  'T-0192-01: capture_artifact has org_id column');
SELECT col_not_null('public', 'capture_artifact', 'org_id',
  'T-0192-02: capture_artifact.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'capture_artifact' AND n.nspname = 'public'),
  'T-0192-03: capture_artifact has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'capture_artifact'
            AND policyname = 'capture_artifact_tenant_isolation'),
  'T-0192-04: capture_artifact_tenant_isolation policy exists');

-- capture_audit_log (T-0192-05..08)
SELECT has_column('public', 'capture_audit_log', 'org_id',
  'T-0192-05: capture_audit_log has org_id column');
SELECT col_not_null('public', 'capture_audit_log', 'org_id',
  'T-0192-06: capture_audit_log.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'capture_audit_log' AND n.nspname = 'public'),
  'T-0192-07: capture_audit_log has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'capture_audit_log'
            AND policyname = 'capture_audit_log_tenant_isolation'),
  'T-0192-08: capture_audit_log_tenant_isolation policy exists');

-- capture_type_config (T-0192-09..12)
SELECT has_column('public', 'capture_type_config', 'org_id',
  'T-0192-09: capture_type_config has org_id column');
SELECT col_not_null('public', 'capture_type_config', 'org_id',
  'T-0192-10: capture_type_config.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'capture_type_config' AND n.nspname = 'public'),
  'T-0192-11: capture_type_config has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'capture_type_config'
            AND policyname = 'capture_type_config_tenant_isolation'),
  'T-0192-12: capture_type_config_tenant_isolation policy exists');

-- contract_documents (T-0192-13..16)
SELECT has_column('public', 'contract_documents', 'org_id',
  'T-0192-13: contract_documents has org_id column');
SELECT col_not_null('public', 'contract_documents', 'org_id',
  'T-0192-14: contract_documents.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'contract_documents' AND n.nspname = 'public'),
  'T-0192-15: contract_documents has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'contract_documents'
            AND policyname = 'contract_documents_tenant_isolation'),
  'T-0192-16: contract_documents_tenant_isolation policy exists');

-- customer_docs (T-0192-17..20)
SELECT has_column('public', 'customer_docs', 'org_id',
  'T-0192-17: customer_docs has org_id column');
SELECT col_not_null('public', 'customer_docs', 'org_id',
  'T-0192-18: customer_docs.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'customer_docs' AND n.nspname = 'public'),
  'T-0192-19: customer_docs has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'customer_docs'
            AND policyname = 'customer_docs_tenant_isolation'),
  'T-0192-20: customer_docs_tenant_isolation policy exists');

-- document_links (T-0192-21..24)
SELECT has_column('public', 'document_links', 'org_id',
  'T-0192-21: document_links has org_id column');
SELECT col_not_null('public', 'document_links', 'org_id',
  'T-0192-22: document_links.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'document_links' AND n.nspname = 'public'),
  'T-0192-23: document_links has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'document_links'
            AND policyname = 'document_links_tenant_isolation'),
  'T-0192-24: document_links_tenant_isolation policy exists');

-- form_templates (T-0192-25..28)
SELECT has_column('public', 'form_templates', 'org_id',
  'T-0192-25: form_templates has org_id column');
SELECT col_not_null('public', 'form_templates', 'org_id',
  'T-0192-26: form_templates.org_id is NOT NULL');
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE c.relname = 'form_templates' AND n.nspname = 'public'),
  'T-0192-27: form_templates has RLS enabled');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'form_templates'
            AND policyname = 'form_templates_tenant_isolation'),
  'T-0192-28: form_templates_tenant_isolation policy exists');

-- ---------------------------------------------------------------------------
-- Isolation tests (T-0192-29 → T-0192-35)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- Fixture
INSERT INTO public.installation_projects (id, org_id, site_code, name, status)
VALUES
  ('a1a1a1a1-0192-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'SITE-0192-A', 'Alpha 0192 Project', 'active'),
  ('b2b2b2b2-0192-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'SITE-0192-B', 'Beta 0192 Project', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.capture_type_config (capture_type, org_id, field_schema, verify_rules, commit_target, critical_fields, active)
VALUES
  ('test_type_0192', '00000000-0000-0000-0000-000000000000'::uuid, '{}'::jsonb, '{}'::jsonb, 'none', '{}', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.capture_artifact (id, org_id, capture_type, status, source, principal, site_code, idempotency_key, raw_uri)
VALUES
  ('a1a1a1a1-0192-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'test_type_0192', 'proposed', 'app', 'staff-a', 'SITE-0192-A', 'idem-0192-a', 'https://storage.test/0192-a.jpg'),
  ('b2b2b2b2-0192-0000-0000-000000000010'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'test_type_0192', 'proposed', 'app', 'staff-b', 'SITE-0192-B', 'idem-0192-b', 'https://storage.test/0192-b.jpg')
ON CONFLICT DO NOTHING;

INSERT INTO public.contract_documents (id, org_id, project_id, site_code, version, data, body, status)
VALUES
  ('a1a1a1a1-0192-0000-0000-000000000020'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0192-0000-0000-000000000001'::uuid, 'SITE-0192-A', 1, '{}'::jsonb, 'test contract body alpha 0192', 'draft'),
  ('b2b2b2b2-0192-0000-0000-000000000020'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'b2b2b2b2-0192-0000-0000-000000000001'::uuid, 'SITE-0192-B', 1, '{}'::jsonb, 'test contract body beta 0192', 'draft')
ON CONFLICT DO NOTHING;

INSERT INTO public.document_links (token, org_id, project_id, site_code, doc_type, ref_id, expires_at)
VALUES
  ('a1a1a1a1-0192-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0192-0000-0000-000000000001'::uuid, 'SITE-0192-A', 'contract', 'a1a1a1a1-0192-0000-0000-000000000020'::uuid, now() + interval '7 days'),
  ('b2b2b2b2-0192-0000-0000-000000000030'::uuid, 'b2b2b2b2-0000-0000-0001-000000000002'::uuid, 'b2b2b2b2-0192-0000-0000-000000000001'::uuid, 'SITE-0192-B', 'contract', 'b2b2b2b2-0192-0000-0000-000000000020'::uuid, now() + interval '7 days')
ON CONFLICT DO NOTHING;

INSERT INTO public.form_templates (id, org_id, template_key, version, kind, applies_to, lane, title, items, status)
VALUES
  ('00000000-0192-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'test-form-0192', 1, 'checklist', '[]'::jsonb, 1, 'Test Form 0192', '[]'::jsonb, 'draft')
ON CONFLICT DO NOTHING;

-- ensure alpha user is in org_members so get_user_org_id() resolves
INSERT INTO public.org_members (member_id, org_id, user_id, email, role, is_active)
VALUES ('a1a1a1a1-0192-0000-0000-0000000000ff'::uuid,
        'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
        'a1a1a1a1-0000-0000-0001-000000000002'::uuid, 'alpha-0192@example.test',
        'VIEWER', true)
ON CONFLICT DO NOTHING;

SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001"}',
  true);

-- T-0192-29: Alpha user cannot see beta's capture_artifact
SELECT is(
  (SELECT count(*)::int FROM public.capture_artifact
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0192-29: alpha user cannot see beta capture_artifact rows');

-- T-0192-30: Alpha user cannot see beta's contract_documents
SELECT is(
  (SELECT count(*)::int FROM public.contract_documents
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0192-30: alpha user cannot see beta contract_documents rows');

-- T-0192-31: Alpha user cannot see beta's document_links
SELECT is(
  (SELECT count(*)::int FROM public.document_links
   WHERE org_id = 'b2b2b2b2-0000-0000-0001-000000000002'::uuid),
  0,
  'T-0192-31: alpha user cannot see beta document_links rows');

-- T-0192-32: Alpha user can see own contract_documents
SELECT ok(
  (SELECT count(*)::int FROM public.contract_documents
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0192-32: alpha user can see own contract_documents rows');

-- T-0192-33: Alpha user can see own capture_artifact
SELECT ok(
  (SELECT count(*)::int FROM public.capture_artifact
   WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid) >= 1,
  'T-0192-33: alpha user can see own capture_artifact rows');

-- T-0192-34: Any authenticated user can read sentinel capture_type_config
SELECT ok(
  (SELECT count(*)::int FROM public.capture_type_config
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 1,
  'T-0192-34: authenticated user can read sentinel capture_type_config');

-- T-0192-35: Any authenticated user can read sentinel form_templates
SELECT ok(
  (SELECT count(*)::int FROM public.form_templates
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid) >= 1,
  'T-0192-35: authenticated user can read sentinel form_templates');

SELECT * FROM finish();
ROLLBACK;

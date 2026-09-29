-- Exercise INSERT under the complete migration chain, including permissive
-- legacy FOR ALL policies. Each denied payload is otherwise valid.
BEGIN;
SELECT plan(7);

SELECT is(
  (SELECT count(*)::integer FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'jobs'
     AND policyname = 'jobs_insert_role_guard'
     AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT'),
  1, 'Jobs has a restrictive INSERT guard independent of permissive policy OR');

INSERT INTO public.organizations (org_id, name, slug) VALUES
 ('a0240000-0000-0000-0000-000000000001', 'Job guard A', 'pgtap-job-guard-a'),
 ('b0240000-0000-0000-0000-000000000002', 'Job guard B', 'pgtap-job-guard-b');
INSERT INTO auth.users (id, email) VALUES
 ('a0240000-0000-0000-0000-000000000011', 'finance@job-guard.test'),
 ('a0240000-0000-0000-0000-000000000012', 'viewer@job-guard.test');
INSERT INTO public.org_members (user_id, org_id, email, role, is_active) VALUES
 ('a0240000-0000-0000-0000-000000000011', 'a0240000-0000-0000-0000-000000000001', 'finance@job-guard.test', 'FINANCE', true),
 ('a0240000-0000-0000-0000-000000000012', 'a0240000-0000-0000-0000-000000000001', 'viewer@job-guard.test', 'VIEWER', true);
INSERT INTO public.customers (customer_id, org_id, name) VALUES
 ('a0240000-0000-0000-0000-000000000021', 'a0240000-0000-0000-0000-000000000001', 'Job guard customer A'),
 ('b0240000-0000-0000-0000-000000000022', 'b0240000-0000-0000-0000-000000000002', 'Job guard customer B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0240000-0000-0000-0000-000000000011', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0240000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"roles":["finance"]}}', true);
SELECT lives_ok($$
  INSERT INTO public.jobs (org_id, job_code, title, customer_id, created_by)
  VALUES ('a0240000-0000-0000-0000-000000000001', 'GUARD-FINANCE', 'Finance own job', 'a0240000-0000-0000-0000-000000000021', 'a0240000-0000-0000-0000-000000000011')
$$, 'FINANCE retains own-org INSERT through the existing governance role');
SELECT is((SELECT count(*)::integer FROM public.jobs WHERE job_code = 'GUARD-FINANCE'), 1, 'Allowed INSERT actually persists');
SELECT throws_ok($$
  INSERT INTO public.jobs (org_id, job_code, title, customer_id, created_by)
  VALUES ('b0240000-0000-0000-0000-000000000002', 'GUARD-FOREIGN', 'Foreign job', 'b0240000-0000-0000-0000-000000000022', 'a0240000-0000-0000-0000-000000000011')
$$, '42501', NULL, 'FINANCE cannot INSERT into a foreign org');

SELECT set_config('request.jwt.claim.sub', 'a0240000-0000-0000-0000-000000000012', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0240000-0000-0000-0000-000000000012","role":"authenticated","app_metadata":{"roles":["viewer"]}}', true);
SELECT throws_ok($$
  INSERT INTO public.jobs (org_id, job_code, title, customer_id, created_by)
  VALUES ('a0240000-0000-0000-0000-000000000001', 'GUARD-VIEWER', 'Viewer job', 'a0240000-0000-0000-0000-000000000021', 'a0240000-0000-0000-0000-000000000012')
$$, '42501', NULL, 'VIEWER cannot INSERT even when legacy org-only policies allow it');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.jobs WHERE job_code = 'GUARD-FOREIGN'), 0, 'Denied cross-org INSERT leaves no row');
SELECT is((SELECT count(*)::integer FROM public.jobs WHERE job_code = 'GUARD-VIEWER'), 0, 'Denied VIEWER INSERT leaves no row');

SELECT * FROM finish();
ROLLBACK;

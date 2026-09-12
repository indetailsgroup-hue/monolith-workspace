-- Real PostgreSQL role/RLS checks, without client-side org filters.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA tpc_test;
GRANT USAGE ON SCHEMA tpc_test TO authenticated, anon;
CREATE FUNCTION tpc_test.expect_count(query text, expected bigint, label text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE actual bigint;
BEGIN
  EXECUTE query INTO actual;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '%: expected %, got %', label, expected, actual;
  END IF;
  RETURN 'PASS ' || label;
END $$;
CREATE FUNCTION tpc_test.expect_denied(query text, label text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE query;
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
    RETURN 'PASS ' || label;
  END;
  RAISE EXCEPTION '%: write was unexpectedly allowed', label;
END $$;

-- Broad grants are test-fixture-only: even with permissive API grants, RLS
-- must protect rows accessed directly and through the summary view.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tpc_pulse_configs,
 public.tpc_pulse_sessions, public.tpc_pulse_responses TO authenticated;
GRANT SELECT ON public.tpc_pulse_summary_v TO authenticated, anon;
GRANT SELECT ON public.tpc_pulse_sessions, public.tpc_pulse_responses TO anon;

INSERT INTO public.tpc_pulse_sessions (id,org_id,title,status,period_label) VALUES
 ('10000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000001','A active','ACTIVE','2026-09'),
 ('10000000-0000-0000-0000-000000000102','10000000-0000-0000-0000-000000000001','A draft','DRAFT','2026-09'),
 ('10000000-0000-0000-0000-000000000103','10000000-0000-0000-0000-000000000001','A closed','CLOSED','2026-09'),
 ('20000000-0000-0000-0000-000000000101','20000000-0000-0000-0000-000000000001','B active','ACTIVE','2026-09');
INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','WORKLOAD',4),
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000101','WORKLOAD',2);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000012',true);
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_sessions',2,'member sees own active/closed sessions only');
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_responses',0,'member cannot read raw responses');
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_summary_v',0,'member cannot bypass admin results through view');
INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','SUPPORT',5);
SELECT 'PASS member submits own active session';
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000101','SUPPORT',5)$q$,'member cannot attach own org response to foreign session');
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000101','SUPPORT',5)$q$,'member cannot submit to foreign org');
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000102','SUPPORT',5)$q$,'member cannot submit to draft session');
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000103','SUPPORT',5)$q$,'member cannot submit to closed session');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000013',true);
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_sessions',0,'inactive member sees no sessions');
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','SUPPORT',5)$q$,'inactive member cannot submit');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000011',true);
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101','SUPPORT',5)$q$,'nonmember cannot submit');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000011',true);
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_sessions',3,'admin A sees own draft/active/closed sessions');
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_responses',2,'admin A sees only own raw responses');
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_summary_v',2,'admin A sees only own summary topics');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000011',true);
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_responses',1,'admin B sees only own raw responses');
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_summary_v',1,'admin B sees only own summary topic');
RESET ROLE;
SELECT tpc_test.expect_denied($q$INSERT INTO public.tpc_pulse_responses (org_id,session_id,topic,score) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000101','SUPPORT',5)$q$,'composite FK rejects cross-org association for privileged writer');
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT tpc_test.expect_count('SELECT count(*) FROM public.tpc_pulse_summary_v',0,'anonymous cannot read summaries even with SELECT grant');
RESET ROLE;
ROLLBACK;

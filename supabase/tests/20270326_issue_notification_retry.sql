-- R1: unsuccessful PM dispatch must remain retryable.
-- Full canonical migrations; normal constraints, RLS roles and triggers.
-- No hosted transport. The transactional dispatcher wrapper injects throw/null
-- only; successful dispatch delegates to the real function and persists the
-- real public.notification queue row. A queued row is NOT delivery receipt.
-- Before the separate org propagation repair, lives_ok may fail with 23502.
-- That is a prerequisite failure, not notification-specific RED evidence.
-- Rerun after that repair and before the notification forward migration.
BEGIN;
SELECT plan(58);

CREATE TEMP TABLE issue_retry_attempts (label text PRIMARY KEY, result jsonb);
CREATE TEMP TABLE issue_dispatch_calls (
  template_key text, target jsonb, slots jsonb, quiet_override boolean, receipt_id uuid
);
GRANT ALL ON issue_retry_attempts, issue_dispatch_calls TO authenticated, service_role;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated, service_role',
    pg_my_temp_schema()::regnamespace::text);
END $$;

ALTER FUNCTION public.rpc_dispatch_notification(jsonb,text,text,text,jsonb,boolean,boolean,boolean,jsonb,text)
  RENAME TO r1_issue_retry_original_dispatch;
CREATE FUNCTION public.rpc_dispatch_notification(
  p_target jsonb, p_intent text, p_category text, p_template_key text,
  p_slots jsonb DEFAULT '{}'::jsonb, p_muted boolean DEFAULT false,
  p_in_quiet_hours boolean DEFAULT null, p_has_active_binding boolean DEFAULT true,
  p_dept_head_target jsonb DEFAULT null, p_site_code text DEFAULT null
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF current_setting('test.issue_retry_dispatch', true) = 'throw' THEN
    RAISE EXCEPTION 'R1 injected dispatcher failure' USING ERRCODE = 'P0001';
  ELSIF current_setting('test.issue_retry_dispatch', true) = 'null' THEN
    RETURN null;
  END IF;
  v_id := public.r1_issue_retry_original_dispatch(
    p_target, p_intent, p_category, p_template_key, p_slots, p_muted,
    p_in_quiet_hours, p_has_active_binding, p_dept_head_target, p_site_code);
  INSERT INTO pg_temp.issue_dispatch_calls VALUES
    (p_template_key, p_target, p_slots, p_in_quiet_hours, v_id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.rpc_dispatch_notification(jsonb,text,text,text,jsonb,boolean,boolean,boolean,jsonb,text) FROM public;

INSERT INTO public.organizations (org_id,name,slug) VALUES
 ('a0260000-0000-0000-0000-000000000001','R1 issue retry','pgtap-r1-issue-retry');
INSERT INTO auth.users (id,email) VALUES
 ('a0260000-0000-0000-0000-000000000011','r1-issue-admin@test.local'),
 ('a0260000-0000-0000-0000-000000000012','r1-issue-outsider@test.local');
INSERT INTO public.org_members (org_id,user_id,email,role,is_active) VALUES
 ('a0260000-0000-0000-0000-000000000001','a0260000-0000-0000-0000-000000000011','r1-issue-admin@test.local','ADMIN',true);
INSERT INTO public.work_item (id,org_id,site_code,current_step) VALUES
 ('a0260000-0000-0000-0000-000000000021','a0260000-0000-0000-0000-000000000001','R1-RETRY-01','Installation');
INSERT INTO public.installation_projects (id,org_id,work_item_id,site_code,name) VALUES
 ('a0260000-0000-0000-0000-000000000031','a0260000-0000-0000-0000-000000000001','a0260000-0000-0000-0000-000000000021','R1-RETRY-01','R1 retry project');

-- Isolate recipients in this rollback transaction; routing policy is untouched.
UPDATE public.identity_binding SET is_active = false
 WHERE lower(coalesce(app_role,'')) IN ('e6','e2','e7','b2','b4','sale','d1','d3','hse');
DELETE FROM public.ops_contacts WHERE role = 'D1';
SELECT set_config('request.jwt.claim.sub','a0260000-0000-0000-0000-000000000011',true);
SELECT set_config('request.jwt.claims','{"sub":"a0260000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"roles":["admin"],"site_codes":["R1-RETRY-01"]}}',true);
SELECT set_config('test.issue_retry_dispatch','success',true);

-- Existing category, role, SLA and quiet-hours policy must remain unchanged.
SELECT is((SELECT jsonb_object_agg(category,jsonb_build_object('roles',target_roles,'sla',sla_minutes,'bypass',bypass_quiet)) FROM public.issue_routing),
 '{"material":{"roles":["E6","E2","E7"],"sla":120,"bypass":false},"design":{"roles":["B2","B4"],"sla":120,"bypass":false},"scope":{"roles":["Sale","D1"],"sla":240,"bypass":false},"safety":{"roles":["D3","HSE"],"sla":30,"bypass":true}}'::jsonb,
 'Existing routing roles, SLAs and quiet-hours choices are preserved');
SELECT ok(has_function_privilege('authenticated','public.rpc_field_raise_issue(uuid,text,text,uuid)','EXECUTE'),
 'Authenticated callers retain issue RPC execution');
SELECT ok(NOT has_function_privilege('authenticated','public.fn_issue_sla_sweep()','EXECUTE'),
 'Authenticated callers do not gain service-only SLA sweep execution');
-- Record the actual ACL and creator defaults in ephemeral CI; a PUBLIC revoke
-- cannot remove direct anon/authenticated grants installed by those defaults.
SELECT diag('SLA sweep ACL: ' || coalesce(proacl::text,'<default>'))
 FROM pg_proc WHERE oid='public.fn_issue_sla_sweep()'::regprocedure;
SELECT diag('Function default ACL: ' || pg_get_userbyid(defaclrole) || '/' ||
 coalesce(nullif(defaclnamespace,0)::regnamespace::text,'<global>') || ' ' || defaclacl::text)
 FROM pg_default_acl WHERE defaclobjtype='f'
 AND defaclrole=(SELECT proowner FROM pg_proc WHERE oid='public.fn_issue_sla_sweep()'::regprocedure);
-- No PM and no issue exist yet, so the buggy function returns successfully
-- without dispatch. Test the real call under each role, not just ACL metadata.
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.fn_issue_sla_sweep() $$,'42501',
 'permission denied for function fn_issue_sla_sweep',
 'Authenticated callers cannot invoke the service-only SLA sweep');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT public.fn_issue_sla_sweep() $$,'42501',
 'permission denied for function fn_issue_sla_sweep',
 'Anonymous callers cannot invoke the service-only SLA sweep');
RESET ROLE;

-- No matching recipient and no PM: marker must remain empty, even after SLA.
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('no-pm',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','material','R1 no PM')) $$,
 'No-PM issue creation completes (23502 indicates the org prerequisite is still broken)');
RESET ROLE;
SELECT is((SELECT (result->>'notified')::integer FROM issue_retry_attempts WHERE label='no-pm'),0,
 'No-PM response reports no queued role recipient');
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='no-pm')),false),
 'No PM does not create a false escalation marker');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01'),0,
 'No PM creates no notification queue row');
UPDATE public.installation_issues SET created_at=now()-interval '3 hours'
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='no-pm');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'SLA sweep with no PM reports zero');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='no-pm')),false),
 'No-PM SLA attempt remains retryable');

-- PM assignment arrives later. Exactly one real queue entry is enough to mark
-- escalation; it is not evidence that a LINE user received or read a message.
INSERT INTO public.ops_contacts (role,employee_id,org_id) VALUES
 ('D1','a0260000-0000-0000-0000-000000000041','a0260000-0000-0000-0000-000000000001');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,1,'Late PM assignment recovers the overdue issue');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NOT NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='no-pm')),false),
 'Escalation marker follows successful queue creation');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01'
 AND target->>'employee_id'='a0260000-0000-0000-0000-000000000041' AND status='queued'),1,
 'Late PM receives one queued notification, with no delivery claim');
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE event_type='issue_sla_escalated'
 AND detail->>'issue_id'=(SELECT result->>'issue_id' FROM issue_retry_attempts WHERE label='no-pm')),1,
 'Successful SLA escalation creates one audit entry');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'Repeated sweep does not re-escalate queued issue');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01'),1,
 'Repeated sweep creates no duplicate queue entry');

-- An exception during immediate PM fallback must not permanently suppress retry.
SELECT set_config('test.issue_retry_dispatch','throw',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('throw',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','design','R1 throw')) $$,
 'Issue remains recorded when immediate dispatch throws');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='throw')),false),
 'Dispatch exception does not mark PM escalation successful');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01' AND slots->>'detail' LIKE '%R1 throw%'),0,
 'Failed immediate dispatch creates no queue receipt');
UPDATE public.installation_issues SET created_at=now()-interval '3 hours'
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='throw');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'Throwing SLA dispatch reports zero');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='throw')),false),
 'Throwing SLA dispatch remains retryable');
SELECT set_config('test.issue_retry_dispatch','success',true);
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,1,'Recovered dispatcher queues the overdue failed issue');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01' AND slots->>'detail' LIKE '%R1 throw%' AND status='queued'),1,
 'Recovered dispatch persists one actual queued row');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'Recovered issue remains idempotent on repeated sweep');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.installation_audit_log WHERE event_type='issue_sla_escalated'
 AND detail->>'issue_id'=(SELECT result->>'issue_id' FROM issue_retry_attempts WHERE label='throw')),1,
 'Recovered issue has one successful escalation audit');

-- Nullable dispatcher contract: no exception is not equivalent to a receipt.
SELECT set_config('test.issue_retry_dispatch','null',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('null',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','design','R1 null receipt')) $$,
 'Issue remains recorded when dispatcher returns no receipt');
RESET ROLE;
SELECT is((SELECT (result->>'notified')::integer FROM issue_retry_attempts WHERE label='null'),0,
 'Null-receipt fallback reports no queued role recipients');
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='null')),false),
 'No receipt does not create an immediate escalation marker');
UPDATE public.installation_issues SET created_at=now()-interval '3 hours'
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='null');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'SLA dispatch returning no receipt reports zero');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='null')),false),
 'Null-receipt SLA attempt remains retryable');
SELECT set_config('test.issue_retry_dispatch','success',true);
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,1,'Null-receipt issue recovers on later successful dispatch');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01' AND slots->>'detail' LIKE '%R1 null receipt%' AND status='queued'),1,
 'Null-receipt recovery creates exactly one queued row');

-- A normal routed recipient still uses the configured E6 role, and neither a
-- pre-SLA nor an acknowledged issue is escalated to the PM.
INSERT INTO public.identity_binding (employee_id,line_user_id,department,site_code,app_role,is_active) VALUES
 ('a0260000-0000-0000-0000-000000000051','R1-E6','Factory','R1-RETRY-01','E6',true),
 ('a0260000-0000-0000-0000-000000000052','R1-HSE','Safety','R1-RETRY-01','HSE',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('normal',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','material','R1 normal')) $$,
 'Normal material role routing still succeeds');
RESET ROLE;
SELECT is((SELECT (result->>'notified')::integer FROM issue_retry_attempts WHERE label='normal'),1,
 'Only a real queued role notification increments notified');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01' AND slots->>'detail'='R1 normal'
 AND target->>'employee_id'='a0260000-0000-0000-0000-000000000051' AND template_key='tpl_issue_routed'),1,
 'Material issue retains its E6 role recipient and routed template');
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='normal')),false),
 'Successful role routing does not prematurely mark PM escalation');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'Existing SLA window is not shortened');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.rpc_field_ack_issue((SELECT (result->>'issue_id')::uuid
 FROM pg_temp.issue_retry_attempts WHERE label='normal')) $$,'Existing authorized acknowledgement still succeeds');
RESET ROLE;
UPDATE public.installation_issues SET created_at=now()-interval '3 hours'
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='normal');
SET LOCAL ROLE service_role;
SELECT is((public.fn_issue_sla_sweep()->>'escalated')::integer,0,'Acknowledged issue is excluded after SLA expires');
RESET ROLE;
SELECT ok(coalesce((SELECT acked_at IS NOT NULL AND escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='normal')),false),
 'Acknowledgement does not create a PM escalation marker');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('safety',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','safety','R1 safety')) $$,
 'Safety category retains normal role routing');
RESET ROLE;
SELECT ok((SELECT count(*)=1 AND bool_and(quiet_override IS FALSE) FROM issue_dispatch_calls
 WHERE slots->>'detail'='R1 safety' AND target->>'employee_id'='a0260000-0000-0000-0000-000000000052'),
 'Safety still passes explicit quiet-hours bypass to the dispatcher');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01'
 AND slots->>'detail'='R1 safety' AND status='queued'),1,'Safety test proves queue persistence only');

-- Null receipt on the direct-role branch must not be counted as notification.
SELECT set_config('test.issue_retry_dispatch','null',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('role-null',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','material','R1 role null')) $$,
 'Direct-role null receipt leaves the issue recorded');
RESET ROLE;
SELECT is((SELECT (result->>'notified')::integer FROM issue_retry_attempts WHERE label='role-null'),0,
 'Direct-role null receipt is not counted as notified');
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='role-null')),false),
 'Unsent direct-role and PM attempts remain retryable');

SELECT set_config('request.jwt.claim.sub','a0260000-0000-0000-0000-000000000012',true);
SELECT set_config('request.jwt.claims','{"sub":"a0260000-0000-0000-0000-000000000012","role":"authenticated","app_metadata":{"roles":["viewer"],"site_codes":[]}}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','material','R1 denied') $$,
 '42501',NULL,'Unrelated caller is still denied by existing authority checks');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.installation_issues WHERE project_id='a0260000-0000-0000-0000-000000000031'
 AND description LIKE '%R1 denied%'),0,'Denied call creates no issue');
SELECT ok((SELECT count(*)=1 AND bool_and(receipt_id IS NOT NULL) FROM issue_dispatch_calls
 WHERE slots->>'detail'='R1 normal'),'Successful dispatcher returns a queue receipt UUID');

-- The successful immediate fallback must still mark escalation; preserving
-- retryability must not turn every fallback into an unmarked attempt.
SELECT set_config('request.jwt.claim.sub','a0260000-0000-0000-0000-000000000011',true);
SELECT set_config('request.jwt.claims','{"sub":"a0260000-0000-0000-0000-000000000011","role":"authenticated","app_metadata":{"roles":["admin"],"site_codes":["R1-RETRY-01"]}}',true);
SELECT set_config('test.issue_retry_dispatch','success',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO pg_temp.issue_retry_attempts VALUES ('immediate-success',
 public.rpc_field_raise_issue('a0260000-0000-0000-0000-000000000031','design','R1 immediate success')) $$,
 'No matching design role still queues an immediate PM fallback');
RESET ROLE;
SELECT ok(coalesce((SELECT escalated_to_pm_at IS NOT NULL FROM public.installation_issues
 WHERE id=(SELECT (result->>'issue_id')::uuid FROM issue_retry_attempts WHERE label='immediate-success')),false),
 'A successful immediate PM queue receipt sets the escalation marker');
SELECT is((SELECT count(*)::integer FROM public.notification WHERE site_code='R1-RETRY-01'
 AND slots->>'detail'='R1 immediate success' AND template_key='tpl_issue_escalated'
 AND target->>'employee_id'='a0260000-0000-0000-0000-000000000041' AND status='queued'),1,
 'Immediate fallback preserves its PM recipient and creates one real queued row');

-- Real outbound queue trigger:0197 publishes created_at on pending rows.
-- The column repair preserves unknown historical times and does not claim delivery.
INSERT INTO public.line_groups (org_id,line_group_id,project_id,site_code,group_type,status) VALUES
 ('a0260000-0000-0000-0000-000000000001','R1-RETRY-INTERNAL','a0260000-0000-0000-0000-000000000031','R1-RETRY-01','internal','active');
SELECT lives_ok($$ INSERT INTO public.line_oa_outbound_messages
 (id,org_id,send_type,status,template_key,slot_values,target_type,target_id) VALUES
 ('a0260000-0000-0000-0000-000000000061','a0260000-0000-0000-0000-000000000001','push','pending','tpl_issue_routed','{}','group','R1-RETRY-INTERNAL') $$,
 'A new pending outbound row traverses the actual notification trigger');
SELECT is((SELECT created_at FROM public.line_oa_outbound_messages
 WHERE id='a0260000-0000-0000-0000-000000000061'),CURRENT_TIMESTAMP,
 'A new outbound row records its creation timestamp by default');
SELECT lives_ok($$ INSERT INTO public.line_oa_outbound_messages
 (id,org_id,send_type,status,template_key,slot_values,target_type,target_id,created_at) VALUES
 ('a0260000-0000-0000-0000-000000000062','a0260000-0000-0000-0000-000000000001','push','failed','tpl_issue_routed','{}','group','R1-RETRY-INTERNAL',NULL) $$,
 'A historical outbound row may retain an explicitly unknown creation time');
SELECT lives_ok($$ UPDATE public.line_oa_outbound_messages SET status='pending'
 WHERE id='a0260000-0000-0000-0000-000000000062' $$,
 'Retrying a historical row traverses the actual trigger without a timestamp error');
SELECT ok(coalesce((SELECT status='pending' AND created_at IS NULL FROM public.line_oa_outbound_messages
 WHERE id='a0260000-0000-0000-0000-000000000062'),false),
 'Retry keeps the historical creation time unknown instead of fabricating one');

SELECT * FROM finish();
ROLLBACK;

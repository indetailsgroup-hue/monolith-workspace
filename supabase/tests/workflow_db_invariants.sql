-- pgTAP DB-level invariants — monolith-workflow-copilot
-- Feature: monolith-workflow-copilot — DB-level Correctness Properties (22, 32, 42) + immutability + idempotency
-- Run: docker exec -i <db> psql -U postgres -d postgres < supabase/tests/workflow_db_invariants.sql
-- ทุก assertion รันใน transaction เดียว แล้ว rollback (ไม่ทิ้ง state).

begin;
create extension if not exists pgtap;
select plan(11);

-- Property 42 (§5): atr_phase_tier_cap ปฏิเสธ max_allowed_tier = L2 ทุก risk_class
select throws_ok(
  $$insert into public.action_type_registry(action_type, risk_class, max_allowed_tier, r02_bound)
    values ('t_pgtap_l2', 'low', 'L2_auto_within_guardrail', false)$$,
  '23514', null,
  'Property 42: atr_phase_tier_cap rejects L2 (check_violation)'
);

-- Property 32 (REG-1): r02_bound ⇒ risk_class = high (atr_r02_implies_high)
select throws_ok(
  $$insert into public.action_type_registry(action_type, risk_class, max_allowed_tier, r02_bound)
    values ('t_pgtap_r02', 'low', 'L1_propose', true)$$,
  '23514', null,
  'REG-1 (Property 32): r02_bound requires risk_class=high'
);

-- Property 22: ไม่มี client write policy บน work_item (write ผ่าน SECURITY DEFINER RPC เท่านั้น)
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'work_item' and cmd <> 'SELECT'),
  0::bigint,
  'Property 22: no client write policy on work_item (only SELECT)'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'work_item' and relnamespace = 'public'::regnamespace),
  'work_item RLS enabled'
);

-- Audit immutability (Req 9.2): INSERT ได้ แต่ UPDATE/DELETE ถูก trigger ปฏิเสธ
select lives_ok(
  $$insert into public.workflow_audit_log(id, event_type, performed_by, detail)
    values ('f9f9f9f9-0000-0000-0000-0000000000a1', 'pgtap_probe', 'tester', '{}'::jsonb)$$,
  'audit log INSERT allowed (append)'
);
select throws_ok(
  $$update public.workflow_audit_log set event_type = 'tampered' where id = 'f9f9f9f9-0000-0000-0000-0000000000a1'$$,
  null, null,
  'audit log UPDATE rejected (append-only trigger)'
);
select throws_ok(
  $$delete from public.workflow_audit_log where id = 'f9f9f9f9-0000-0000-0000-0000000000a1'$$,
  null, null,
  'audit log DELETE rejected (append-only trigger)'
);

-- Idempotency (Req 4.7/16.5): webhook_event_id unique ปฏิเสธ decision ซ้ำ
select lives_ok(
  $$insert into public.work_item(id, site_code, current_step, status, version)
    values ('f9f9f9f9-0000-0000-0000-0000000000b1', 'S', 'Sale', 'awaiting_approval', 0)$$,
  'work_item insert (setup)'
);
select lives_ok(
  $$insert into public.approval_request(id, work_item_id, process_step, resolved_approver, approver_kind, quorum, sla_deadline, timeout_at, status, attempt)
    values ('f9f9f9f9-0000-0000-0000-0000000000c1', 'f9f9f9f9-0000-0000-0000-0000000000b1', 'Sale', 'lead', 'employee', 'unanimous', now(), now(), 'pending', 1)$$,
  'approval_request insert (setup)'
);
select lives_ok(
  $$insert into public.approval_decision(approval_request_id, webhook_event_id, decider, decision, channel)
    values ('f9f9f9f9-0000-0000-0000-0000000000c1', 'evt-pgtap-uniq', 'd1', 'approved', 'web')$$,
  'first approval_decision with webhook_event_id (allowed)'
);
select throws_ok(
  $$insert into public.approval_decision(approval_request_id, webhook_event_id, decider, decision, channel)
    values ('f9f9f9f9-0000-0000-0000-0000000000c1', 'evt-pgtap-uniq', 'd2', 'rejected', 'web')$$,
  '23505', null,
  'idempotency: duplicate webhook_event_id rejected (unique_violation)'
);

select * from finish();
rollback;

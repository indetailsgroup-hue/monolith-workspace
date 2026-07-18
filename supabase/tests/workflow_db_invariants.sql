-- pgTAP DB-level invariants — monolith-workflow-copilot
-- Feature: monolith-workflow-copilot — DB-level Correctness Properties (22, 32, 42) + immutability + idempotency
-- Feature: S18 l4-finance-tax — Finance site-scoping regression lock (0137: rpc_finance_home /
--   rpc_finance_record_payment / rpc_finance_submit_slip) — ดู section "Finance site-scoping" ท้ายไฟล์
-- Run: docker exec -i <db> psql -U postgres -d postgres < supabase/tests/workflow_db_invariants.sql
-- ทุก assertion รันใน transaction เดียว แล้ว rollback (ไม่ทิ้ง state).

begin;
create extension if not exists pgtap;
select plan(38);

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

-- ---------------------------------------------------------------------------
-- Finance site-scoping (S18 l4-finance-tax) — regression lock บน 0137_finance_f3
-- ล็อกว่า rpc_finance_home / rpc_finance_record_payment / rpc_finance_submit_slip
-- ยังถูกคุมด้วย is_governance_role() / has_site_access() (C12 helpers อ่าน auth.jwt())
-- เทคนิค: set_config('request.jwt.claims', ..., true) จำลอง JWT ต่อ transaction
-- ---------------------------------------------------------------------------

-- setup: บ้าน 1 หลัง site BKK-HQ-01 + งวด notified (b1) + งวด paid (b2 — ทดสอบ short-circuit)
select lives_ok(
  $$insert into public.installation_projects(id, site_code, name)
    values ('f4f4f4f4-0000-0000-0000-0000000000a1', 'BKK-HQ-01', 'บ้าน pgTAP การเงิน')$$,
  'finance: project insert (setup)'
);
select lives_ok(
  $$insert into public.payment_installments(id, project_id, site_code, seq, label, percent, amount, trigger_event, status, notified_at)
    values ('f4f4f4f4-0000-0000-0000-0000000000b1', 'f4f4f4f4-0000-0000-0000-0000000000a1',
            'BKK-HQ-01', 1, 'มัดจำ (เซ็นสัญญา)', 50, 100000, 'contract_signed', 'notified',
            timezone('utc', now()) - interval '2 days')$$,
  'finance: notified installment insert (setup)'
);
select lives_ok(
  $$insert into public.payment_installments(id, project_id, site_code, seq, label, percent, amount, trigger_event, status, notified_at, paid_at)
    values ('f4f4f4f4-0000-0000-0000-0000000000b2', 'f4f4f4f4-0000-0000-0000-0000000000a1',
            'BKK-HQ-01', 2, 'ก่อนผลิต (เซ็นแบบ final)', 30, 60000, 'g3_approved', 'paid',
            timezone('utc', now()) - interval '2 days', timezone('utc', now()) - interval '1 day')$$,
  'finance: paid installment insert (setup)'
);

-- (ก) JWT ผิด site (ไม่มี governance role, site_codes ไม่ครอบ BKK-HQ-01) → ทุก RPC ต้อง 42501
-- (do-block เพื่อไม่ให้ set_config พ่น output ปนใน TAP stream)
do $do$ begin
  perform set_config('request.jwt.claims',
    '{"email":"outsider@pgtap.test","app_metadata":{"roles":[],"site_codes":["OTHER-SITE-99"]}}', true);
end $do$;
select throws_ok(
  $$select public.rpc_finance_record_payment('f4f4f4f4-0000-0000-0000-0000000000b1')$$,
  '42501', null,
  'finance: record_payment blocked for wrong-site JWT (insufficient_privilege)'
);
select throws_ok(
  $$select public.rpc_finance_submit_slip('f4f4f4f4-0000-0000-0000-0000000000b1')$$,
  '42501', null,
  'finance: submit_slip blocked for wrong-site JWT (insufficient_privilege)'
);
select throws_ok(
  $$select public.rpc_finance_home()$$,
  '42501', null,
  'finance: finance_home blocked for wrong-site JWT (insufficient_privilege)'
);

-- (ข) governance role (finance) → เข้าได้
do $do$ begin
  perform set_config('request.jwt.claims',
    '{"email":"f3@pgtap.test","app_metadata":{"roles":["finance"],"site_codes":[]}}', true);
end $do$;
select lives_ok(
  $$select public.rpc_finance_home()$$,
  'finance: governance role can call rpc_finance_home'
);
select ok(
  (public.rpc_finance_home()) ?& array['awaiting', 'overdue', 'received_today'],
  'finance: rpc_finance_home returns awaiting/overdue/received_today keys'
);
select lives_ok(
  $$select public.rpc_finance_record_payment('f4f4f4f4-0000-0000-0000-0000000000b2')$$,
  'finance: governance role passes gate (paid installment = idempotent short-circuit)'
);

-- (ค) site-scoped user ของ site จริง (BKK-HQ-01 = active site) → เข้าได้โดยไม่ต้องมี role
do $do$ begin
  perform set_config('request.jwt.claims',
    '{"email":"site@pgtap.test","app_metadata":{"roles":[],"site_codes":["BKK-HQ-01"]}}', true);
end $do$;
select lives_ok(
  $$select public.rpc_finance_home()$$,
  'finance: site-scoped JWT (BKK-HQ-01) can call rpc_finance_home'
);
select lives_ok(
  $$select public.rpc_finance_record_payment('f4f4f4f4-0000-0000-0000-0000000000b2')$$,
  'finance: site-scoped JWT passes gate (paid installment = idempotent short-circuit)'
);
select is(
  (select count(*) from public.receipts where installment_id = 'f4f4f4f4-0000-0000-0000-0000000000b2'),
  0::bigint,
  'finance: paid short-circuit issues no duplicate receipt'
);

-- (ง) โครงสร้าง function: security definer + search_path pinned + ยังอ้าง has_site_access
select ok(
  (select prosecdef from pg_proc where oid = 'public.rpc_finance_home()'::regprocedure),
  'finance: rpc_finance_home is SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.rpc_finance_record_payment(uuid, text)'::regprocedure),
  'finance: rpc_finance_record_payment is SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.rpc_finance_submit_slip(uuid, text, text, text)'::regprocedure),
  'finance: rpc_finance_submit_slip is SECURITY DEFINER'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc where oid = 'public.rpc_finance_home()'::regprocedure),
  'finance: rpc_finance_home has search_path pinned to public'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc where oid = 'public.rpc_finance_record_payment(uuid, text)'::regprocedure),
  'finance: rpc_finance_record_payment has search_path pinned to public'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc where oid = 'public.rpc_finance_submit_slip(uuid, text, text, text)'::regprocedure),
  'finance: rpc_finance_submit_slip has search_path pinned to public'
);
select ok(
  pg_get_functiondef('public.rpc_finance_home()'::regprocedure) like '%has_site_access%',
  'finance: rpc_finance_home body still references has_site_access (guard not removed)'
);
select ok(
  pg_get_functiondef('public.rpc_finance_record_payment(uuid, text)'::regprocedure) like '%has_site_access%',
  'finance: rpc_finance_record_payment body still references has_site_access (guard not removed)'
);
select ok(
  pg_get_functiondef('public.rpc_finance_submit_slip(uuid, text, text, text)'::regprocedure) like '%has_site_access%',
  'finance: rpc_finance_submit_slip body still references has_site_access (guard not removed)'
);

-- (จ) RLS: receipts / payment_installments = client อ่านอย่างเดียว (เขียนผ่าน RPC เท่านั้น) + policy ผูก site
select ok(
  (select relrowsecurity from pg_class where relname = 'receipts' and relnamespace = 'public'::regnamespace),
  'finance: receipts RLS enabled'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'receipts' and cmd <> 'SELECT'),
  0::bigint,
  'finance: no client write policy on receipts (only SELECT)'
);
select ok(
  (select qual like '%has_site_access%' from pg_policies
   where schemaname = 'public' and tablename = 'receipts' and policyname = 'receipts_sel'),
  'finance: receipts_sel policy is site-scoped (has_site_access)'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'payment_installments' and relnamespace = 'public'::regnamespace),
  'finance: payment_installments RLS enabled'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'payment_installments' and cmd <> 'SELECT'),
  0::bigint,
  'finance: no client write policy on payment_installments (only SELECT)'
);

-- (ฉ) grant: authenticated เรียก rpc_finance_home ได้ (ข้ามเมื่อ role ไม่มีใน DB ทดสอบ)
select ok(
  not exists (select 1 from pg_roles where rolname = 'authenticated')
    or has_function_privilege('authenticated', 'public.rpc_finance_home()', 'execute'),
  'finance: authenticated may execute rpc_finance_home'
);

select * from finish();
rollback;

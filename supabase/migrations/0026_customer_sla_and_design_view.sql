-- Migration: customer SLA routing + customer-design-view RPC — monolith-workflow-copilot (Req 20.8, 20.11, 20.12)
-- Spec task: 21.4 (SLA/binding escalate Project_Manager for customer) + 21.5 (design-view gatekeeper RPC)
-- Depends on: 0002, 0003, 0014/0023 (approval_request + customer), 0025 (rpc_sla_sweep v1), C12
--
-- 21.4: timeout ของ customer approval → escalate Project_Manager (Req 20.11/20.8), audit แยก target.
-- 21.5: read RPC คืนเฉพาะ design-presentation artifacts (allowlist) ของ work_item ที่ primary_customer_id ตรง;
--       ซ่อน cost/BOM/PFMEA/RACI/production internals/โครงการอื่น (Req 20.12). Edge gatekeeper เรียก server-side.

-- ---------------------------------------------------------------------------
-- rpc_sla_sweep v2 — เพิ่ม approver_kind + escalate_to (customer → project_manager)
-- เปลี่ยน return columns จึงต้อง drop ก่อน recreate
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_sla_sweep();

create or replace function public.rpc_sla_sweep()
returns table (
  approval_request_id uuid,
  work_item_id uuid,
  process_step text,
  site_code text,
  approver_kind text,
  action text,
  escalate_to text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) timeouts (Req 13.4 + 20.11): customer → project_manager; อื่น ๆ → workflow_default
  return query
  with esc as (
    update public.approval_request ar
       set status = 'escalated'
     where ar.status = 'pending'
       and timezone('utc', now()) > ar.timeout_at
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code, ar.approver_kind
  ),
  aud as (
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    select 'escalation', esc.work_item_id, esc.process_step, esc.site_code, public.resolve_actor(),
           jsonb_build_object(
             'reason', 'sla_timeout',
             'approver_kind', esc.approver_kind,
             'escalate_to', case when esc.approver_kind = 'customer' then 'project_manager' else 'workflow_default' end,
             'fail_safe', true)
    from esc
    returning 1
  )
  select esc.id, esc.work_item_id, esc.process_step, esc.site_code, esc.approver_kind, 'timeout'::text,
         case when esc.approver_kind = 'customer' then 'project_manager' else 'workflow_default' end
  from esc;

  -- 2) reminder ≥ 50%
  return query
  with r50 as (
    update public.approval_request ar
       set reminder_50_sent = true
     where ar.status = 'pending'
       and not ar.reminder_50_sent
       and timezone('utc', now()) >= ar.created_at + (ar.sla_deadline - ar.created_at) * 0.5
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code, ar.approver_kind
  )
  select r50.id, r50.work_item_id, r50.process_step, r50.site_code, r50.approver_kind, 'reminder_50'::text, null::text
  from r50;

  -- 3) reminder ≥ 100%
  return query
  with r100 as (
    update public.approval_request ar
       set reminder_100_sent = true
     where ar.status = 'pending'
       and not ar.reminder_100_sent
       and timezone('utc', now()) >= ar.sla_deadline
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code, ar.approver_kind
  )
  select r100.id, r100.work_item_id, r100.process_step, r100.site_code, r100.approver_kind, 'reminder_100'::text, null::text
  from r100;
end;
$$;

revoke all on function public.rpc_sla_sweep() from public;

-- ---------------------------------------------------------------------------
-- rpc_customer_design_view (Req 20.12) — allowlist projection สำหรับ Customer_Approver
-- คืนเฉพาะ design-presentation artifacts ของ work_item ที่ primary_customer_id ตรง p_customer_id;
-- ซ่อน cost/BOM/PFMEA/RACI/production internals (allowlist ไม่ใช่ denylist).
-- p_customer_id = customer_id ที่ Edge resolve จาก LIFF idToken แล้ว (ไม่เชื่อ client โดยตรง).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_customer_design_view(
  p_work_item_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wi public.work_item%rowtype;
  v_artifacts jsonb;
  v_pending jsonb;
begin
  select * into v_wi from public.work_item where id = p_work_item_id;
  if not found then
    return null;  -- ไม่เปิดเผยการมีอยู่ของ work item อื่น
  end if;

  -- authorize: ต้องเป็นโครงการของลูกค้าคนนี้เท่านั้น (Req 20.12 — ไม่เห็นโครงการอื่น)
  if v_wi.primary_customer_id is distinct from p_customer_id then
    return null;
  end if;

  -- ALLOWLIST: ดึงเฉพาะ key ที่เป็น design-presentation จาก work_item.data
  -- (board / render_3d / layout / drawing). ไม่แตะ key อื่น เช่น cost/bom/pfmea/raci.
  v_artifacts := jsonb_strip_nulls(jsonb_build_object(
    'mood_tone_board', v_wi.data -> 'mood_tone_board',
    'render_3d',       v_wi.data -> 'render_3d',
    'layout',          v_wi.data -> 'layout',
    'construction_drawing', v_wi.data -> 'construction_drawing'
  ));

  -- คำขออนุมัติที่ค้างของลูกค้าคนนี้ (เฉพาะ field ที่ปลอดภัย)
  select jsonb_agg(jsonb_build_object('approval_request_id', ar.id, 'process_step', ar.process_step, 'status', ar.status))
    into v_pending
  from public.approval_request ar
  where ar.work_item_id = p_work_item_id
    and ar.approver_kind = 'customer'
    and ar.resolved_approver = p_customer_id::text;

  return jsonb_build_object(
    'work_item_id', v_wi.id,
    'current_step', v_wi.current_step,
    'status', v_wi.status,
    'artifacts', v_artifacts,
    'pending_approvals', coalesce(v_pending, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_customer_design_view(uuid, uuid) from public;

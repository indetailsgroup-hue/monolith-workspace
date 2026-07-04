-- Migration: rpc_sla_sweep + rpc_claim_pending_notifications — monolith-workflow-copilot Phase 1 (Req 13, 18)
-- Spec task: 13 (SLA sweep RPC) + 12 (notification claim) — backing RPCs for Edge workers 17.3/17.4
-- Depends on: 0002 (approval_request, notification), 0003 (audit), C12
--
-- mirror src/workflow/sla/sweep.ts (Property 26) + src/workflow/notification/backoff.ts (Property 31).
-- RPC-routed: Edge cron/worker เรียก RPC เท่านั้น ไม่มี direct table access (reuse line-oa pattern).

-- ---------------------------------------------------------------------------
-- rpc_sla_sweep — คืน due reminders (≥50%, ≥100%) + timeouts; mark flags atomic; audit timeout
-- ลำดับ: timeout ก่อน (set status='escalated' + audit) → reminders เฉพาะ row ที่ยัง pending
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sla_sweep()
returns table (
  approval_request_id uuid,
  work_item_id uuid,
  process_step text,
  site_code text,
  action text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) timeouts (Req 13.4): now > timeout_at → escalate + audit (data-modifying CTE runs to completion)
  return query
  with esc as (
    update public.approval_request ar
       set status = 'escalated'
     where ar.status = 'pending'
       and timezone('utc', now()) > ar.timeout_at
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code
  ),
  aud as (
    insert into public.workflow_audit_log (event_type, work_item_id, process_step, site_code, performed_by, detail)
    select 'escalation', esc.work_item_id, esc.process_step, esc.site_code, public.resolve_actor(),
           jsonb_build_object('reason', 'sla_timeout', 'fail_safe', true)
    from esc
    returning 1
  )
  select esc.id, esc.work_item_id, esc.process_step, esc.site_code, 'timeout'::text
  from esc;

  -- 2) reminder ≥ 50% (Req 13.2): now ≥ created_at + 50% ของช่วง SLA, ยังไม่ส่ง, ยัง pending
  return query
  with r50 as (
    update public.approval_request ar
       set reminder_50_sent = true
     where ar.status = 'pending'
       and not ar.reminder_50_sent
       and timezone('utc', now()) >= ar.created_at + (ar.sla_deadline - ar.created_at) * 0.5
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code
  )
  select r50.id, r50.work_item_id, r50.process_step, r50.site_code, 'reminder_50'::text
  from r50;

  -- 3) reminder ≥ 100% (Req 13.2): now ≥ sla_deadline, ยังไม่ส่ง, ยัง pending
  return query
  with r100 as (
    update public.approval_request ar
       set reminder_100_sent = true
     where ar.status = 'pending'
       and not ar.reminder_100_sent
       and timezone('utc', now()) >= ar.sla_deadline
    returning ar.id, ar.work_item_id, ar.process_step, ar.site_code
  )
  select r100.id, r100.work_item_id, r100.process_step, r100.site_code, 'reminder_100'::text
  from r100;
end;
$$;

-- ---------------------------------------------------------------------------
-- rpc_claim_pending_notifications — claim แถว queued/pending ที่ถึงกำหนด (กัน double-claim)
-- FOR UPDATE SKIP LOCKED + ตั้ง lease ผ่าน next_attempt_at (ไม่เพิ่มคอลัมน์ใหม่):
-- worker ที่ตายจะปล่อย lease เมื่อหมดเวลา → row claimable อีกครั้ง.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_claim_pending_notifications(
  p_limit int default 20,
  p_lease_seconds int default 60
)
returns setof public.notification
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select n.id
    from public.notification n
    where n.status in ('queued', 'pending')
      and (n.next_attempt_at is null or n.next_attempt_at <= timezone('utc', now()))
    order by n.created_at
    for update skip locked
    limit greatest(1, p_limit)
  )
  update public.notification n
     set next_attempt_at = timezone('utc', now()) + make_interval(secs => greatest(1, p_lease_seconds))
    from claimed
   where n.id = claimed.id
  returning n.*;
end;
$$;

revoke all on function public.rpc_sla_sweep() from public;
revoke all on function public.rpc_claim_pending_notifications(int, int) from public;

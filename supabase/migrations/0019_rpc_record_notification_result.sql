-- Migration: rpc_record_notification_result — monolith-workflow-copilot Phase 1 (Req 9.5, 18.3)
-- Spec task: 12.2 (record send result, retry/backoff, Delivery_Failure permanent)
-- Depends on: 0002 (notification), 0003 (audit), C12
--
-- mirror src/workflow/notification/backoff.ts recordAttempt:
--   success → sent; fail + ยังไม่ครบ → pending (retry_count+1); fail + ครบ → failed (ถาวร).
-- error_detail scrub secret โดย caller; ที่นี่ตัดความยาวกันรั่ว.

create or replace function public.rpc_record_notification_result(
  p_notification_id uuid,
  p_success boolean,
  p_error_detail text default null,
  p_max_attempts int default 5,
  p_next_attempt_at timestamptz default null
)
returns public.wf_notification_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur public.notification%rowtype;
  v_attempts int;
  v_status public.wf_notification_status;
begin
  select * into v_cur from public.notification where id = p_notification_id for update;
  if not found then
    raise exception 'notification not found' using errcode = 'no_data_found';
  end if;

  -- Delivery_Failure คงถาวร (Req 18.3) — ไม่ย้อนสถานะ
  if v_cur.status = 'failed' then
    return 'failed';
  end if;

  if p_success then
    update public.notification set status = 'sent', error_detail = null where id = p_notification_id;
    return 'sent';
  end if;

  v_attempts := v_cur.retry_count + 1;
  v_status := case when v_attempts >= greatest(1, p_max_attempts) then 'failed' else 'pending' end;
  update public.notification
    set status = v_status,
        retry_count = v_attempts,
        next_attempt_at = case when v_status = 'pending' then p_next_attempt_at else null end,
        error_detail = left(coalesce(p_error_detail, ''), 500)
    where id = p_notification_id;

  if v_status = 'failed' then
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', v_cur.site_code, public.resolve_actor(),
      jsonb_build_object('result', 'delivery_failure', 'notification_id', p_notification_id, 'attempts', v_attempts));
  end if;

  return v_status;
end;
$$;

revoke all on function public.rpc_record_notification_result(uuid, boolean, text, int, timestamptz) from public;

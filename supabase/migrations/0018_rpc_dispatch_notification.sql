-- Migration: rpc_dispatch_notification — monolith-workflow-copilot Phase 1 (Req 1.4, 6)
-- Spec task: 11.6 (routing + suppression + template + missing-binding escalation → queue)
-- Depends on: 0002 (notification), 0003 (audit), C12
--
-- mirror src/workflow/notification/{routing,suppression,missing-binding}.ts.
-- routing: personal_* → direct_push; cross_team/fyi → group_message.
-- suppression: muted → ระงับสนิท; Direct ข้าม quiet; non-Direct ใน quiet → digest (ไม่ insert ทันที).
-- missing binding (Direct, ไม่มี active binding) → escalate dept_head + audit คู่ (Req 1.4).

create or replace function public.rpc_dispatch_notification(
  p_target jsonb,
  p_intent text,
  p_category text,
  p_template_key text,
  p_slots jsonb default '{}'::jsonb,
  p_muted boolean default false,
  p_in_quiet_hours boolean default false,
  p_has_active_binding boolean default true,
  p_dept_head_target jsonb default null,
  p_site_code text default null
)
returns uuid  -- notification id (null = ระงับ/digest)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel public.wf_notification_channel;
  v_is_direct boolean;
  v_id uuid;
begin
  v_channel := case
    when p_intent in ('personal_responsibility', 'personal_approval') then 'direct_push'
    else 'group_message'
  end::public.wf_notification_channel;
  v_is_direct := (v_channel = 'direct_push');

  -- mute เหนือสุด (รวม Direct) — Req 6.5
  if p_muted then
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_muted', 'category', p_category));
    return null;
  end if;

  if v_is_direct then
    -- Req 1.4 — Direct แต่ไม่มี active binding → escalate dept_head + audit คู่
    if not p_has_active_binding then
      insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
      values ('notification', p_site_code, public.resolve_actor(),
        jsonb_build_object('result', 'binding_missing_failure', 'category', p_category));
      if p_dept_head_target is not null then
        insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
        values (p_site_code, p_dept_head_target, 'direct_push', p_category, true, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
        returning id into v_id;
      end if;
      insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
      values ('notification', p_site_code, public.resolve_actor(),
        jsonb_build_object('result', 'binding_missing_escalation', 'escalated', p_dept_head_target is not null));
      return v_id;
    end if;
    -- Direct ปกติ → queue (ข้าม quiet hours ได้)
    insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
    values (p_site_code, p_target, 'direct_push', p_category, true, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
    returning id into v_id;
    return v_id;
  end if;

  -- non-Direct: ใน quiet hours → digest (ไม่ insert ทันที) — Req 6.6
  if p_in_quiet_hours then
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_digest', 'category', p_category));
    return null;
  end if;

  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (p_site_code, p_target, 'group_message', p_category, false, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rpc_dispatch_notification(jsonb, text, text, text, jsonb, boolean, boolean, boolean, jsonb, text) from public;

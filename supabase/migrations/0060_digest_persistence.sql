-- Migration: digest_persistence — monolith-workflow-copilot (D1 fix, step 2/2)
-- Depends on: 0018 (rpc_dispatch_notification), 0059 (digest_pending enum), 0002 (notification), C12
--
-- D1: เดิม rpc_dispatch_notification ช่วง quiet hours (non-Direct) เขียน audit 'suppressed_digest' แล้ว return null
--   → notification "หายจริง" ไม่เคยถูกส่งใน Daily_Digest (ขัด Req 6.4). แก้:
--   (1) persist ด้วย status='digest_pending' (แทน drop) — worker (claim queued/pending) จะไม่หยิบ
--   (2) rpc_assemble_daily_digest: รอบ digest ดึง digest_pending ของ site → รวมเป็น "ข้อความเดียว" (Req 6.4) →
--       mark ต้นฉบับเป็น sent (digested) + audit.

-- ---------------------------------------------------------------------------
-- (1) rpc_dispatch_notification — quiet-hours non-Direct → persist digest_pending (เดิมจาก 0018; เปลี่ยนเฉพาะ branch digest)
-- ---------------------------------------------------------------------------
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
returns uuid
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

  if p_muted then
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_muted', 'category', p_category));
    return null;
  end if;

  if v_is_direct then
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
    insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
    values (p_site_code, p_target, 'direct_push', p_category, true, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
    returning id into v_id;
    return v_id;
  end if;

  -- D1: non-Direct ใน quiet hours → persist 'digest_pending' (แทน drop) — Req 6.6/6.4
  if p_in_quiet_hours then
    insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
    values (p_site_code, p_target, 'group_message', p_category, false, p_template_key, coalesce(p_slots,'{}'::jsonb), 'digest_pending')
    returning id into v_id;
    insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
    values ('notification', p_site_code, public.resolve_actor(),
      jsonb_build_object('result', 'suppressed_digest', 'category', p_category, 'notification_id', v_id));
    return v_id;  -- D1: persisted (เดิม return null)
  end if;

  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (p_site_code, p_target, 'group_message', p_category, false, p_template_key, coalesce(p_slots,'{}'::jsonb), 'queued')
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rpc_dispatch_notification(jsonb, text, text, text, jsonb, boolean, boolean, boolean, jsonb, text) from public;

-- ---------------------------------------------------------------------------
-- (2) rpc_assemble_daily_digest — รวม digest_pending ของ site เป็นข้อความเดียว (Req 6.4)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_assemble_daily_digest(p_site_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count int;
  v_cats jsonb;
  v_digest_id uuid;
begin
  -- claim digest_pending ของ site (lock + skip locked เพื่อกัน double-assemble)
  select array_agg(id) into v_ids
  from (
    select id from public.notification
    where site_code = p_site_code and status = 'digest_pending'
    order by created_at
    for update skip locked
    limit 500
  ) sub;

  if v_ids is null then
    return null;  -- ไม่มีอะไรสะสม → ไม่ส่ง digest เปล่า
  end if;

  v_count := array_length(v_ids, 1);
  select jsonb_agg(distinct category) into v_cats from public.notification where id = any(v_ids);

  -- Req 6.4 — รวมเป็น "ข้อความเดียว": digest summary notification (queued → worker ส่ง)
  insert into public.notification (site_code, target, channel, category, is_direct_responsibility, template_key, slots, status)
  values (p_site_code, jsonb_build_object('site_code', p_site_code), 'group_message', 'digest', false, 'tpl_daily_digest',
    jsonb_build_object('count', v_count, 'categories', coalesce(v_cats, '[]'::jsonb)), 'queued')
  returning id into v_digest_id;

  -- ต้นฉบับ digest_pending → sent (ถูกรวมเข้า digest แล้ว; ไม่ส่งเดี่ยว)
  update public.notification set status = 'sent' where id = any(v_ids);

  insert into public.workflow_audit_log (event_type, site_code, performed_by, detail)
  values ('notification', p_site_code, public.resolve_actor(),
    jsonb_build_object('result', 'digest_assembled', 'count', v_count, 'digest_id', v_digest_id));

  return v_digest_id;
end;
$$;

revoke all on function public.rpc_assemble_daily_digest(text) from public;

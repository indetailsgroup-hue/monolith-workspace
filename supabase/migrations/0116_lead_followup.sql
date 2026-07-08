-- Migration: lead_followup — SJ-2 ระบบตาม lead เงียบ + ปุ่มปิด lead (มติ Sale-2)
-- Depends on: line_oa_conversations (last_activity_at มีอยู่แล้ว — reuse ตามมติ), 0084 (rpc_dispatch_notification
--             — เคารพ quiet hours ในท่อ), 0100 (work_item.primary_customer_id), 0105 (identity_binding.auth_user_id)
--
--   lead = conversation 1:1 ที่ open + ยังไม่ปิด lead + ลูกค้ายังไม่มีงาน (primary_customer_id ไม่โยงถึง)
--   เงียบ ≥3 วัน → push ส่วนตัวถึง Sale เจ้าของ (น้ำเสียงเพื่อนเตือนเพื่อน — Req 12.2, ไม่โพสต์กลุ่ม/ไม่ประจาน)
--   เงียบ ≥7 วัน → FYI H1 (ภาพรวม lead กำลังหลุด); ตัวเลข config ในตาราง; ปิด lead = เก็บ lost-reason ให้ H3/H4

-- ---------------------------------------------------------------------------
-- (1) คอลัมน์ lead บน conversations (reuse-not-fork) + config
-- ---------------------------------------------------------------------------
alter table public.line_oa_conversations add column if not exists lead_owner_employee_id uuid;
alter table public.line_oa_conversations add column if not exists lead_closed_at timestamptz;
alter table public.line_oa_conversations add column if not exists lead_lost_reason text
  check (lead_lost_reason is null or lead_lost_reason in ('too_expensive', 'went_quiet', 'competitor', 'other'));
alter table public.line_oa_conversations add column if not exists lead_lost_note text;
alter table public.line_oa_conversations add column if not exists last_followup_push_at timestamptz;
alter table public.line_oa_conversations add column if not exists escalated_at timestamptz;

create table if not exists public.lead_followup_config (
  id boolean primary key default true check (id),   -- single row
  quiet_days int not null default 3 check (quiet_days > 0),
  escalate_days int not null default 7 check (escalate_days > 0),
  h1_employee_id uuid,
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);
insert into public.lead_followup_config (id) values (true) on conflict do nothing;
alter table public.lead_followup_config enable row level security;
create policy lead_followup_config_sel on public.lead_followup_config for select to authenticated using (true);

create or replace function public.rpc_field_set_lead_config(
  p_quiet_days int, p_escalate_days int, p_h1_employee_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  update public.lead_followup_config
  set quiet_days = p_quiet_days, escalate_days = p_escalate_days,
      h1_employee_id = coalesce(p_h1_employee_id, h1_employee_id),
      updated_by = public.resolve_actor(), updated_at = timezone('utc', now())
  where id = true;
end; $$;

-- ---------------------------------------------------------------------------
-- (2) มอบ lead ให้ Sale (null = ตัวเองจาก binding) + ปิด lead พร้อมเหตุผล
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_assign_lead(
  p_conversation_id uuid, p_employee_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_emp uuid := p_employee_id;
begin
  select id, site_code into v_c from public.line_oa_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_c.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_emp is null then
    select b.employee_id into v_emp from public.identity_binding b
    where b.auth_user_id = auth.uid() and b.is_active limit 1;
    if v_emp is null then
      raise exception 'ยังไม่ผูกตัวตน — ระบุ employee id หรือผูก LINE ก่อน' using errcode = 'no_data_found';
    end if;
  end if;
  update public.line_oa_conversations set lead_owner_employee_id = v_emp where id = p_conversation_id;
  return jsonb_build_object('conversation_id', p_conversation_id, 'lead_owner', v_emp);
end; $$;

create or replace function public.rpc_field_close_lead(
  p_conversation_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c record;
begin
  select id, site_code, lead_closed_at into v_c from public.line_oa_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_c.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_reason not in ('too_expensive', 'went_quiet', 'competitor', 'other') then
    raise exception 'เหตุผลต้องเป็น: too_expensive / went_quiet / competitor / other' using errcode = 'check_violation';
  end if;
  if v_c.lead_closed_at is not null then
    return jsonb_build_object('conversation_id', p_conversation_id, 'already', true);
  end if;

  update public.line_oa_conversations
  set lead_closed_at = timezone('utc', now()), lead_lost_reason = p_reason, lead_lost_note = p_note
  where id = p_conversation_id;

  -- lost-reason data ให้ H3/H4 การตลาด (มติ Sale-2 "ของฟรีชิ้นใหม่")
  insert into public.installation_audit_log (event_type, site_code, detail)
  values ('lead_closed', v_c.site_code,
    jsonb_build_object('conversation_id', p_conversation_id, 'reason', p_reason,
      'note', left(coalesce(p_note, ''), 200), 'by', public.resolve_actor()));
  return jsonb_build_object('conversation_id', p_conversation_id, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) list leads (ใช้ทั้ง sweep และหน้าแรก Sale SJ-5) — เงียบนานสุดก่อน
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_list_leads()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(row_to_json(l)) from (
    select c.id as conversation_id, c.site_code, c.lead_owner_employee_id,
      c.last_activity_at,
      floor(extract(epoch from (timezone('utc', now()) - c.last_activity_at)) / 86400)::int as days_silent
    from public.line_oa_conversations c
    where c.status = 'open' and c.lead_closed_at is null
      and not exists (
        select 1 from public.work_item w
        join public.line_oa_customer_identity ci on ci.customer_id = w.primary_customer_id
        where ci.line_user_id = c.line_user_id)
    order by c.last_activity_at asc
  ) l), '[]'::jsonb);
end; $$;

-- ---------------------------------------------------------------------------
-- (4) sweep: ≥quiet_days → push Sale เจ้าของ · ≥escalate_days → FYI H1 (ครั้งเดียวต่อช่วงเงียบ)
-- ---------------------------------------------------------------------------
create or replace function public.fn_lead_followup_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
  v_l record;
  v_days int;
  v_pushed int := 0;
  v_escalated int := 0;
  v_unowned int := 0;
begin
  select * into v_cfg from public.lead_followup_config where id = true;

  for v_l in
    select c.id, c.site_code, c.line_user_id, c.lead_owner_employee_id,
      c.last_activity_at, c.last_followup_push_at, c.escalated_at
    from public.line_oa_conversations c
    where c.status = 'open' and c.lead_closed_at is null
      and c.last_activity_at < timezone('utc', now()) - make_interval(days => v_cfg.quiet_days)
      and not exists (
        select 1 from public.work_item w
        join public.line_oa_customer_identity ci on ci.customer_id = w.primary_customer_id
        where ci.line_user_id = c.line_user_id)
  loop
    v_days := floor(extract(epoch from (timezone('utc', now()) - v_l.last_activity_at)) / 86400)::int;

    -- FYI H1 (ครั้งเดียวต่อช่วงเงียบ — escalated_at reset ได้เมื่อลูกค้ากลับมาคุย ถ้าจะทำภายหลัง)
    if v_days >= v_cfg.escalate_days and v_l.escalated_at is null and v_cfg.h1_employee_id is not null then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_cfg.h1_employee_id),
          'fyi', 'lead_followup', 'tpl_lead_escalate',
          jsonb_build_object('days', v_days::text, 'ref', right(v_l.line_user_id, 4)),
          false, null, true, null, v_l.site_code);
        update public.line_oa_conversations set escalated_at = timezone('utc', now()) where id = v_l.id;
        v_escalated := v_escalated + 1;
      exception when others then null;
      end;
    end if;

    -- push Sale เจ้าของ (ครั้งเดียวต่อช่วงเงียบ: push แล้วไม่ซ้ำจนกว่าลูกค้าจะ active ใหม่)
    if v_l.lead_owner_employee_id is null then
      v_unowned := v_unowned + 1;
    elsif v_l.last_followup_push_at is null or v_l.last_followup_push_at < v_l.last_activity_at then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_l.lead_owner_employee_id),
          'personal_responsibility', 'lead_followup', 'tpl_lead_quiet',
          jsonb_build_object('days', v_days::text, 'ref', right(v_l.line_user_id, 4)),
          false, null, true, null, v_l.site_code);
        update public.line_oa_conversations set last_followup_push_at = timezone('utc', now()) where id = v_l.id;
        v_pushed := v_pushed + 1;
      exception when others then null;
      end;
    end if;
  end loop;

  return jsonb_build_object('pushed', v_pushed, 'escalated', v_escalated, 'unowned', v_unowned);
end; $$;

-- cron รายวัน 03:15 UTC (= 10:15 เวลาไทย — ในเวลางาน Sale เห็นแล้วทำต่อได้เลย)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-lead-followup-sweep';
    perform cron.schedule('wf-lead-followup-sweep', '15 3 * * *', 'select public.fn_lead_followup_sweep()');
  else
    raise notice 'pg_cron unavailable — lead sweep จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (5) templates (internal — น้ำเสียงเพื่อนเตือนเพื่อน Req 12.2)
-- ---------------------------------------------------------------------------
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_lead_quiet', null, '😊 ลูกค้า (…{{ref}}) เงียบมา {{days}} วันแล้วครับ — ทักไปถามสักหน่อยมั๊ยครับ เผื่อยังสนใจอยู่', true, 'internal', 'text'),
  ('tpl_lead_escalate', null, '📉 FYI: lead (…{{ref}}) เงียบเกิน {{days}} วันแล้วครับ — lead อาจกำลังหลุด', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_lead_config(int, int, uuid)',
    'rpc_field_assign_lead(uuid, uuid)',
    'rpc_field_close_lead(uuid, text, text)',
    'rpc_field_list_leads()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  execute 'revoke all on function public.fn_lead_followup_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_lead_followup_sweep() to service_role';
  end if;
end $$;

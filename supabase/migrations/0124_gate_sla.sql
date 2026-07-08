-- Migration: gate_sla — BJ-1 gate โรงงานคุ้มครองด้วย SLA + escalate B1 (มติ B2-1)
-- Depends on: 0107 (production_milestones + rpc_factory_approve_gate — **version ล่าสุดก่อนไฟล์นี้**),
--             0110 (roster design = designer ของบ้าน), 0121 (ops_contacts)
--
--   "ไลน์ 27 คนไม่มีวันรอเกิน SLA": gate รายงานแล้ว designer ไม่ approve ภายใน SLA → เตือน B2 ของบ้าน
--   → เกิน 2×SLA → ไต่ B1 + ปลดล็อกให้ B1 approve แทน (JD B1 มีอำนาจอยู่แล้ว) — ทุกก้าวลง audit
--   delegation ลา/ลงไซต์ = reuse 0082 ที่ชั้น workflow ตามมติ (ไม่สร้างใหม่)

alter table public.production_milestones add column if not exists reminded_at timestamptz;
alter table public.production_milestones add column if not exists escalated_at timestamptz;

create table if not exists public.factory_gate_config (
  station text primary key check (station in ('assembly', 'packing')),
  sla_minutes int not null default 240 check (sla_minutes > 0)
);
insert into public.factory_gate_config (station) values ('assembly'), ('packing') on conflict do nothing;
alter table public.factory_gate_config enable row level security;
create policy factory_gate_config_sel on public.factory_gate_config for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- sweep: เกิน SLA → เตือน designer ของบ้าน (roster design) · เกิน 2×SLA → ไต่ B1
-- ---------------------------------------------------------------------------
create or replace function public.fn_factory_gate_sla_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_d record;
  v_b1 uuid;
  v_reminded int := 0;
  v_escalated int := 0;
begin
  select employee_id into v_b1 from public.ops_contacts where role = 'B1';

  for v_m in
    select m.*, p.name as p_name, c.sla_minutes
    from public.production_milestones m
    join public.installation_projects p on p.id = m.project_id
    join public.factory_gate_config c on c.station = m.station
    where m.is_gate and m.approved_at is null and m.reported_at is not null
  loop
    -- เกิน 2×SLA → ไต่ B1 (ครั้งเดียว)
    if v_m.escalated_at is null and v_b1 is not null
       and v_m.reported_at < timezone('utc', now()) - make_interval(mins => v_m.sla_minutes * 2) then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_b1),
          'personal_responsibility', 'gate_sla', 'tpl_gate_sla_escalate',
          jsonb_build_object('project_name', v_m.p_name, 'station', v_m.station),
          false, null, true, null, v_m.site_code);
        update public.production_milestones set escalated_at = timezone('utc', now()) where id = v_m.id;
        insert into public.installation_audit_log (event_type, project_id, site_code, detail)
        values ('gate_sla_escalated', v_m.project_id, v_m.site_code,
          jsonb_build_object('milestone_id', v_m.id, 'station', v_m.station));
        v_escalated := v_escalated + 1;
      exception when others then null;
      end;
    -- เกิน SLA → เตือน designer ของบ้าน (ครั้งเดียว)
    elsif v_m.reminded_at is null
       and v_m.reported_at < timezone('utc', now()) - make_interval(mins => v_m.sla_minutes) then
      for v_d in
        select r.employee_id from public.phase_rosters r
        where r.project_id = v_m.project_id and r.phase = 'design' and r.status in ('approved', 'active')
      loop
        begin
          perform public.rpc_dispatch_notification(
            jsonb_build_object('employee_id', v_d.employee_id),
            'personal_responsibility', 'gate_sla', 'tpl_gate_sla_warn',
            jsonb_build_object('project_name', v_m.p_name, 'station', v_m.station),
            false, null, true, null, v_m.site_code);
        exception when others then null;
        end;
      end loop;
      update public.production_milestones set reminded_at = timezone('utc', now()) where id = v_m.id;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('gate_sla_reminded', v_m.project_id, v_m.site_code,
        jsonb_build_object('milestone_id', v_m.id, 'station', v_m.station));
      v_reminded := v_reminded + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'escalated', v_escalated);
end; $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-gate-sla-sweep';
    perform cron.schedule('wf-gate-sla-sweep', '*/15 * * * *', 'select public.fn_factory_gate_sla_sweep()');
  else
    raise notice 'pg_cron unavailable — gate SLA sweep จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- rebase rpc_factory_approve_gate (0107→0124): + เส้น B1 approve แทนหลัง escalate
-- ---------------------------------------------------------------------------
create or replace function public.rpc_factory_approve_gate(p_milestone_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_knowledge jsonb;
  v_refs text[];
  v_b1 uuid;
  v_emp uuid;
  v_via_escalation boolean := false;
begin
  select m.*, p.name as project_name into v_m
  from public.production_milestones m join public.installation_projects p on p.id = m.project_id
  where m.id = p_milestone_id for update;
  if not found then raise exception 'milestone not found' using errcode = 'no_data_found'; end if;
  if not v_m.is_gate then raise exception 'สถานีนี้ไม่ใช่จุด approve' using errcode = 'check_violation'; end if;
  if v_m.approved_at is not null then return; end if;  -- idempotent

  -- ผู้ approve = designer ตาม RACI ขั้น Designer (pattern 0094) หรือ governance
  -- + BJ-1: หลัง escalate → B1 (ops_contacts) approve แทนได้ (JD B1 มีอำนาจอยู่แล้ว)
  if not public.is_governance_role() then
    select ki.payload into v_knowledge from public.knowledge_import ki where ki.is_current limit 1;
    select array_agg(r) into v_refs
      from jsonb_array_elements_text(coalesce(public.wf_approvers_for_step(v_knowledge, 'Designer', 'unanimous'), '[]'::jsonb)) r;
    if v_refs is not null and public.has_any_app_role(v_refs) then
      null; -- designer ตาม RACI — ผ่าน
    else
      select employee_id into v_b1 from public.ops_contacts where role = 'B1';
      select b.employee_id into v_emp from public.identity_binding b
      where b.auth_user_id = auth.uid() and b.is_active limit 1;
      if v_m.escalated_at is not null and v_b1 is not null and v_emp = v_b1 then
        v_via_escalation := true;  -- B1 หลังหมดเวลา SLA
      elsif v_refs is null then
        raise exception 'ไม่พบ RACI Designer — fail-safe block' using errcode = 'insufficient_privilege';
      else
        raise exception 'gate นี้ approve ได้เฉพาะ designer ตาม RACI (ADR-041 มติ 2) — B1 แทนได้หลังเกิน SLA' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  update public.production_milestones
    set approved_by = public.resolve_actor(), approved_at = timezone('utc', now())
  where id = p_milestone_id;

  if v_via_escalation then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('gate_approved_by_escalation', v_m.project_id, v_m.site_code,
      jsonb_build_object('milestone_id', p_milestone_id, 'station', v_m.station, 'by', public.resolve_actor()));
  end if;

  -- curated 2 จังหวะเดิม (0107) — ไม่แตะ
  if v_m.station = 'assembly' then
    perform public.fn_prod_curated(v_m.project_id, 'tpl_prod_assembled', jsonb_build_object('project_name', v_m.project_name));
  elsif v_m.station = 'packing' then
    perform public.fn_prod_curated(v_m.project_id, 'tpl_prod_shipped', jsonb_build_object('project_name', v_m.project_name));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('production_gate_approved', v_m.project_id, v_m.site_code,
    jsonb_build_object('milestone_id', p_milestone_id, 'station', v_m.station));
end; $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_gate_sla_warn', null, '⏳ บ้าน {{project_name}} สถานี {{station}} รอคุณตรวจเกินเวลาแล้วครับ — ไลน์ผลิตกำลังรอ ช่วย approve ด้วยครับ', true, 'internal', 'text'),
  ('tpl_gate_sla_escalate', null, '🚨 บ้าน {{project_name}} สถานี {{station}} เกิน SLA สองรอบ — คุณ approve แทนได้แล้วครับ (audit ลงระบบให้)', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
begin
  execute 'revoke all on function public.fn_factory_gate_sla_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_factory_gate_sla_sweep() to service_role';
  end if;
  execute 'revoke all on function public.rpc_factory_approve_gate(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_factory_approve_gate(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_factory_approve_gate(uuid) to service_role';
  end if;
end $$;

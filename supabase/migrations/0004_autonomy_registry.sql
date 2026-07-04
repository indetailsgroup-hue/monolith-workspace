-- Migration: autonomy_registry — monolith-workflow-copilot Phase 1 (Req 19)
-- Spec task: 20.1 + 20.3 (Action Type Registry & Autonomy Classification — classify only)
-- Depends on: 0002_workflow_tables_rls.sql (knowledge_import, workflow_audit_log), C12
--
-- D2 ตัวเลือก C: classify/label เท่านั้น — NO execute_autonomous_action / guardrail / escalation_record.
-- CHECK สองตัวแยกกัน (ห้าม merge):
--   atr_ceiling_for_risk = Req 19.2 (invariant ถาวร: risk≠low ⇒ tier ≤ L1)
--   atr_phase_tier_cap   = Req 19.11 (phase-scoped: ทุก row รวม low ⇒ tier ≤ L1, เข้มกว่า)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'autonomy_ladder_tier') then
    create type public.autonomy_ladder_tier as enum (
      'L0_advisory', 'L1_propose', 'L2_auto_within_guardrail', 'L3_auto_with_notify'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'risk_class') then
    create type public.risk_class as enum ('low', 'medium', 'high');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- action_type_registry (Req 19.1, 19.8)
-- ---------------------------------------------------------------------------
create table if not exists public.action_type_registry (
  action_type text primary key,
  risk_class public.risk_class not null,
  max_allowed_tier public.autonomy_ladder_tier not null default 'L0_advisory',
  r02_bound boolean not null default false,
  risk_source text not null default 'manual' check (risk_source in ('manual', 'derived')),
  process_step text null,                 -- link to PFMEA step for derive_risk_from_export (Req 19.3)
  description text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- REG-1 (Req 19.2): r02_bound ⇒ high
  constraint atr_r02_implies_high check ((not r02_bound) or (risk_class = 'high')),
  -- REG-2 (Req 19.2): invariant ถาวร — risk≠low ⇒ tier ≤ L1
  constraint atr_ceiling_for_risk check (
    (risk_class = 'low') or (max_allowed_tier in ('L0_advisory', 'L1_propose'))
  ),
  -- REG-3 (Req 19.11): phase cap — ทุก row (รวม low) ⇒ tier ≤ L1 (เข้มกว่า; แยกจาก ceiling)
  constraint atr_phase_tier_cap check (max_allowed_tier in ('L0_advisory', 'L1_propose'))
);

comment on constraint atr_ceiling_for_risk on public.action_type_registry is
  'Req 19.2 invariant (ถาวร): risk_class≠low ⇒ max_allowed_tier ≤ L1_propose.';
comment on constraint atr_phase_tier_cap on public.action_type_registry is
  'Req 19.11 phase-scoped cap: ALL rows (incl. low) ⇒ max_allowed_tier ≤ L1_propose. '
  'ห้าม merge กับ atr_ceiling_for_risk — ปลด cap นี้ได้เฉพาะเมื่อ capture-spine เปิด autonomous execution.';

-- RLS: SELECT TO authenticated; write ผ่าน RPC เท่านั้น (Req 19.10)
alter table public.action_type_registry enable row level security;
drop policy if exists action_type_registry_sel on public.action_type_registry;
create policy action_type_registry_sel on public.action_type_registry
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed (risk_source='manual') — governed operations (Req 19.7/19.8)
-- default medium สำหรับ action ที่ไม่ผูก PFMEA (ห้าม low โดยไม่ตั้งใจ — Req 19.7)
-- ---------------------------------------------------------------------------
insert into public.action_type_registry (action_type, risk_class, max_allowed_tier, r02_bound, risk_source, process_step, description) values
  ('approve_design_signoff', 'high',   'L1_propose', true,  'derived', 'Designer',           'อนุมัติแบบร่างออกแบบ (customer + lead)'),
  ('production_release',      'high',   'L1_propose', true,  'derived', 'Production Planning', 'ปล่อยงานเข้าผลิต'),
  ('create_work_item',        'medium', 'L1_propose', false, 'manual',  null,                  'สร้าง Work_Item'),
  ('dispatch_notification',   'low',    'L1_propose', false, 'manual',  null,                  'ส่งการแจ้งเตือน'),
  ('create_delegation',       'medium', 'L1_propose', false, 'manual',  null,                  'มอบหมายผู้อนุมัติแทน'),
  ('import_knowledge',        'medium', 'L1_propose', false, 'manual',  null,                  'นำเข้า Knowledge_Export')
on conflict (action_type) do nothing;

-- ---------------------------------------------------------------------------
-- RPC: upsert_action_type (SECURITY DEFINER, governance only) — Req 19.10, 19.9
-- ---------------------------------------------------------------------------
create or replace function public.upsert_action_type(
  p_action_type text,
  p_risk_class public.risk_class,
  p_max_tier public.autonomy_ladder_tier,
  p_r02_bound boolean,
  p_description text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.action_type_registry%rowtype;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_old from public.action_type_registry where action_type = p_action_type;

  insert into public.action_type_registry (action_type, risk_class, max_allowed_tier, r02_bound, risk_source, description, updated_at)
  values (p_action_type, p_risk_class, p_max_tier, p_r02_bound, 'manual', coalesce(p_description, ''), timezone('utc', now()))
  on conflict (action_type) do update
    set risk_class = excluded.risk_class,
        max_allowed_tier = excluded.max_allowed_tier,
        r02_bound = excluded.r02_bound,
        risk_source = 'manual',
        description = excluded.description,
        updated_at = timezone('utc', now());

  insert into public.workflow_audit_log (event_type, performed_by, detail)
  values ('action_type_registry', public.resolve_actor(),
    jsonb_build_object('action_type', p_action_type,
      'old', case when v_old.action_type is null then null else jsonb_build_object('risk_class', v_old.risk_class, 'max_allowed_tier', v_old.max_allowed_tier, 'r02_bound', v_old.r02_bound) end,
      'new', jsonb_build_object('risk_class', p_risk_class, 'max_allowed_tier', p_max_tier, 'r02_bound', p_r02_bound)));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: derive_risk_from_export (Req 19.3, 19.9)
-- อ่าน knowledge_import (is_current) → pfmeaRiskRows ของ process_step ของ action:
--   any rpnStatus≠computed → high (fail-safe ceiling)
--   else max actionPriority: High→high, Medium→medium, Low→low
-- อัปเดตเฉพาะ row risk_source='derived' (manual ไม่ถูกทับ)
-- ---------------------------------------------------------------------------
create or replace function public.derive_risk_from_export(p_action_type text)
returns public.risk_class
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step text;
  v_source text;
  v_payload jsonb;
  v_has_uncomputed boolean;
  v_has_high boolean;
  v_has_medium boolean;
  v_has_rows boolean;
  v_risk public.risk_class;
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission: governance role required' using errcode = 'insufficient_privilege';
  end if;

  select process_step, risk_source into v_step, v_source
  from public.action_type_registry where action_type = p_action_type;
  if v_step is null then
    return null;  -- ไม่ผูก PFMEA step → ไม่ derive (manual กำหนดเอง, Req 19.7)
  end if;
  if v_source = 'manual' then
    return (select risk_class from public.action_type_registry where action_type = p_action_type); -- ไม่ทับ manual
  end if;

  select payload into v_payload from public.knowledge_import where is_current limit 1;
  if v_payload is null then
    return 'high';  -- ไม่มี knowledge → fail-safe
  end if;

  select
    bool_or(coalesce(r->>'rpnStatus','') <> 'computed'),
    bool_or((r->>'actionPriority') = 'High'),
    bool_or((r->>'actionPriority') = 'Medium'),
    count(*) > 0
  into v_has_uncomputed, v_has_high, v_has_medium, v_has_rows
  from jsonb_array_elements(v_payload -> 'pfmeaRiskRows') r
  where r->>'processStep' = v_step;

  if not v_has_rows then
    v_risk := 'high';                       -- step ไม่มีแถว → fail-safe
  elsif v_has_uncomputed then
    v_risk := 'high';                       -- severity_only/not_assessed → fail-safe ceiling
  elsif v_has_high then
    v_risk := 'high';
  elsif v_has_medium then
    v_risk := 'medium';
  else
    v_risk := 'low';
  end if;

  update public.action_type_registry
    set risk_class = v_risk, risk_source = 'derived', updated_at = timezone('utc', now())
    where action_type = p_action_type and risk_source = 'derived';

  insert into public.workflow_audit_log (event_type, performed_by, detail)
  values ('action_type_registry', public.resolve_actor(),
    jsonb_build_object('action_type', p_action_type, 'derived_risk', v_risk, 'process_step', v_step));

  return v_risk;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: classify_autonomy_tier (Req 19.4, 19.5, 19.6, 19.11)
-- lookup เท่านั้น (ไม่มี execute path); clamp ผลทุก action ≤ L1 ใน phase นี้
-- ---------------------------------------------------------------------------
create or replace function public.classify_autonomy_tier(p_action_type text)
returns public.autonomy_ladder_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tier public.autonomy_ladder_tier;
begin
  select max_allowed_tier into v_tier from public.action_type_registry where action_type = p_action_type;
  if v_tier is null then
    raise exception 'unregistered action_type: %', p_action_type using errcode = 'raise_exception';  -- Req 19.6
  end if;
  -- clamp ≤ L1 ใน phase นี้ (Req 19.5/19.11) — แม้ table จะถูกตั้งเกิน (กันไว้สองชั้น)
  if v_tier in ('L2_auto_within_guardrail', 'L3_auto_with_notify') then
    return 'L1_propose';
  end if;
  return v_tier;
end;
$$;

revoke all on function public.upsert_action_type(text, public.risk_class, public.autonomy_ladder_tier, boolean, text) from public;
revoke all on function public.derive_risk_from_export(text) from public;
grant execute on function public.classify_autonomy_tier(text) to authenticated;

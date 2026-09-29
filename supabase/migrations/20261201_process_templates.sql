-- Migration: 20261201_process_templates.sql
-- MONOLITH v17.0 — Process Templates Module (P1: Process)
--
-- ที่มา SLR: 77% evidence เน้น Work Redesign > Technology Deployment
--   — Job Template Builder (STARTER+) + Bottleneck Heatmap (PROFESSIONAL+)
--   — Plan Gate: STARTER → templates only; PROFESSIONAL → bottleneck analytics
--
-- Tables:
--   job_templates         — template definitions per job category (global + org-specific)
--   job_template_stages   — ordered stages within each template
--   time_in_stage_log     — audit log of time spent per stage per job (Bottleneck Heatmap source)
--
-- Views:
--   bottleneck_heatmap_v  — aggregate avg vs expected per stage (PROFESSIONAL+)
--
-- RLS: org_id isolation + plan gate helpers
-- Depends on: 0002 (orgs/members), 0031 (process_model), 20261001_people_culture_schema
-- ============================================================================

-- ============================================================================
-- PLAN GATE HELPER
-- ============================================================================

-- Returns plan tier of the current user's org (used in RLS + app-layer checks)
create or replace function public.pt_current_org_plan()
returns text
language sql
stable
security invoker
as $$
  select o.plan
  from public.organizations o
  join public.org_members m on m.org_id = o.org_id
  where m.user_id = auth.uid()
    and m.is_active = true
  limit 1;
$$;

-- Guard: returns true if current org is on PROFESSIONAL or ENTERPRISE plan
create or replace function public.pt_is_professional_plus()
returns boolean
language sql
stable
security invoker
as $$
  select coalesce(
    public.pt_current_org_plan() in ('PROFESSIONAL', 'ENTERPRISE'),
    false
  );
$$;

-- ============================================================================
-- TABLE: job_templates
-- ============================================================================

create table if not exists public.job_templates (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid null
    references public.organizations(org_id) on delete cascade,
  -- org_id = null → global seed template (DAPH shared, editable per-org by clone)

  name                text not null,
  -- e.g. "ตู้ครัวมาตรฐาน", "ประตูบานเปิด", "งาน Site ทั่วไป", "CNC Batch"

  category            text not null default 'CUSTOM'
    check (category in (
      'CABINET',    -- ตู้ครัว / ตู้เสื้อผ้า
      'DOOR',       -- ประตูบานเปิด / บานเลื่อน
      'DRAWER',     -- ลิ้นชัก
      'LABEL',      -- ป้ายงาน / label แปะชิ้นงาน
      'SITE',       -- งานติดตั้ง on-site
      'CNC',        -- งาน CNC batch
      'QUOTATION',  -- template สำหรับใบเสนอราคา
      'CUSTOM'      -- org-defined custom category
    )),

  description         text,
  plan_gate           text not null default 'STARTER'
    check (plan_gate in ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
  -- plan_gate = minimum plan required to use this template

  is_active           boolean not null default true,
  is_global           boolean not null default false,
  -- is_global = true → seed template visible to all orgs; org_id must be null

  version             int not null default 1,
  -- increment on publish; previous version rows kept for audit

  tags                text[] default '{}',
  -- e.g. ['ครัว', 'standard', 'daph-default']

  estimated_total_hours  decimal(6,2) null,
  -- sum of all stage expected durations (denormalized for quick display)

  created_by          uuid null references auth.users(id),
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),

  -- A given org cannot have two active templates with the same name + category + version
  unique nulls not distinct (org_id, name, category, version)
);

comment on table public.job_templates is
  'v17.0: Job template definitions — global seed templates (org_id null) + org-specific overrides';

-- ============================================================================
-- TABLE: job_template_stages
-- ============================================================================

create table if not exists public.job_template_stages (
  id                      uuid primary key default gen_random_uuid(),
  template_id             uuid not null
    references public.job_templates(id) on delete cascade,
  org_id                  uuid null
    references public.organizations(org_id) on delete cascade,
  -- denormalized from parent template for RLS simplicity

  stage_order             int not null check (stage_order >= 1),
  name                    text not null,
  -- e.g. "ออกแบบ", "ตัด CNC", "ประกอบ", "พ่นสี", "QC", "บรรจุ", "ส่งมอบ"

  description             text,

  assigned_role           text null
    check (assigned_role in (
      'DESIGNER', 'FACTORY', 'INSTALLER', 'ADMIN', 'OWNER', 'FINANCE', 'VIEWER', null
    )),
  -- default role responsible for this stage

  expected_duration_hours decimal(6,2) null default 1.0,
  -- expected hours for Bottleneck Heatmap comparison

  is_approval_required    boolean not null default false,
  -- whether this stage requires an explicit approval before advancing

  checklist_items         jsonb null default '[]',
  -- [{label: text, required: bool, photo_required: bool, notes: text?}]

  color                   text null default '#6b7280',
  -- hex color for Kanban / Gantt display

  created_at              timestamptz not null default timezone('utc', now()),
  updated_at              timestamptz not null default timezone('utc', now()),

  unique (template_id, stage_order)
  -- enforce unique ordering within a template
);

comment on table public.job_template_stages is
  'v17.0: Ordered stages within a job template; source for Bottleneck Heatmap expected durations';

-- ============================================================================
-- TABLE: time_in_stage_log
-- (PROFESSIONAL+ — Bottleneck Heatmap source data)
-- ============================================================================

create table if not exists public.time_in_stage_log (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null
    references public.organizations(org_id) on delete cascade,
  job_id              text not null,
  -- text to allow both UUID and legacy string job codes

  stage_name          text not null,
  stage_order         int null,
  template_id         uuid null
    references public.job_templates(id) on delete set null,
  -- link back to template for expected_duration comparison

  entered_at          timestamptz not null,
  exited_at           timestamptz null,
  -- null = currently active in this stage

  duration_minutes    decimal(10,2)
    generated always as (
      case
        when exited_at is not null
        then extract(epoch from (exited_at - entered_at)) / 60.0
        else null
      end
    ) stored,
  -- computed automatically

  expected_minutes    decimal(10,2) null,
  -- copied from job_template_stages.expected_duration_hours * 60 at log creation

  is_bottleneck       boolean
    generated always as (
      case
        when exited_at is not null and expected_minutes is not null
        then (extract(epoch from (exited_at - entered_at)) / 60.0) > expected_minutes
        else false
      end
    ) stored,
  -- true if actual > expected (flagged for heatmap)

  entered_by          uuid null references auth.users(id),
  exited_by           uuid null references auth.users(id),

  notes               text,
  created_at          timestamptz not null default timezone('utc', now())
);

comment on table public.time_in_stage_log is
  'v17.0 PROFESSIONAL+: Records time each job spends in each stage — source for Bottleneck Heatmap';

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists ix_job_templates_org
  on public.job_templates (org_id) where org_id is not null;

create index if not exists ix_job_templates_global
  on public.job_templates (category, is_active) where is_global = true;

create index if not exists ix_job_template_stages_template
  on public.job_template_stages (template_id, stage_order);

create index if not exists ix_time_in_stage_log_org_job
  on public.time_in_stage_log (org_id, job_id, entered_at desc);

create index if not exists ix_time_in_stage_log_bottleneck
  on public.time_in_stage_log (org_id, is_bottleneck, stage_name)
  where is_bottleneck = true;

-- ============================================================================
-- TRIGGER: updated_at auto-bump
-- ============================================================================

create or replace function public.pt_set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_job_templates_updated_at
  before update on public.job_templates
  for each row execute function public.pt_set_updated_at();

create trigger trg_job_template_stages_updated_at
  before update on public.job_template_stages
  for each row execute function public.pt_set_updated_at();

-- ============================================================================
-- VIEW: bottleneck_heatmap_v
-- (PROFESSIONAL+ feature — enforced at app-layer + RLS)
-- ============================================================================

create or replace view public.bottleneck_heatmap_v
with (security_invoker = true)
as
select
  tsl.org_id,
  tsl.stage_name,
  tsl.stage_order,
  tsl.template_id,
  count(*)                            as job_count,
  round(avg(tsl.duration_minutes), 1) as avg_duration_minutes,
  round(avg(tsl.expected_minutes), 1) as avg_expected_minutes,
  max(tsl.duration_minutes)           as max_duration_minutes,
  round(
    avg(
      case when tsl.duration_minutes is not null and tsl.expected_minutes > 0
        then (tsl.duration_minutes / tsl.expected_minutes) * 100
        else null
      end
    ), 1
  )                                   as pct_of_expected,
  -- pct_of_expected > 100 = stage taking longer than planned
  count(*) filter (where tsl.is_bottleneck = true) as bottleneck_count,
  round(
    count(*) filter (where tsl.is_bottleneck = true)::numeric / nullif(count(*), 0) * 100,
    1
  )                                   as bottleneck_rate_pct
from public.time_in_stage_log tsl
where tsl.exited_at is not null
group by
  tsl.org_id,
  tsl.stage_name,
  tsl.stage_order,
  tsl.template_id;

comment on view public.bottleneck_heatmap_v is
  'v17.0 PROFESSIONAL+: Aggregated bottleneck metrics per stage — used by BottleneckHeatmap.tsx';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.job_templates        enable row level security;
alter table public.job_template_stages  enable row level security;
alter table public.time_in_stage_log    enable row level security;

-- ============================================================================
-- RLS POLICIES — job_templates
-- ============================================================================

-- SELECT: org members see their own + global templates
create policy "pt_templates_select"
  on public.job_templates
  for select
  using (
    -- own org templates
    (org_id is not null and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    ))
    or
    -- global seed templates (readable by all authenticated users)
    (is_global = true and org_id is null)
  );

-- INSERT: ADMIN+ can create templates for their org
create policy "pt_templates_insert"
  on public.job_templates
  for insert
  with check (
    org_id is not null
    and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: ADMIN+ own org only; global templates are immutable via app layer
create policy "pt_templates_update"
  on public.job_templates
  for update
  using (
    org_id is not null
    and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  )
  with check (
    org_id is not null
    and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- DELETE: OWNER only
create policy "pt_templates_delete"
  on public.job_templates
  for delete
  using (
    org_id is not null
    and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role = 'OWNER'
    )
  );

-- ============================================================================
-- RLS POLICIES — job_template_stages
-- ============================================================================

-- SELECT: via template membership (org or global)
create policy "pt_stages_select"
  on public.job_template_stages
  for select
  using (
    exists (
      select 1 from public.job_templates t
      where t.id = template_id
        and (
          (t.org_id in (
            select m.org_id from public.org_members m
            where m.user_id = auth.uid() and m.is_active = true
          ))
          or (t.is_global = true and t.org_id is null)
        )
    )
  );

-- INSERT/UPDATE: ADMIN+ via parent template
create policy "pt_stages_insert"
  on public.job_template_stages
  for insert
  with check (
    exists (
      select 1 from public.job_templates t
      join public.org_members m on m.org_id = t.org_id
      where t.id = template_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

create policy "pt_stages_update"
  on public.job_template_stages
  for update
  using (
    exists (
      select 1 from public.job_templates t
      join public.org_members m on m.org_id = t.org_id
      where t.id = template_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  )
  with check (
    exists (
      select 1 from public.job_templates t
      join public.org_members m on m.org_id = t.org_id
      where t.id = template_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

create policy "pt_stages_delete"
  on public.job_template_stages
  for delete
  using (
    exists (
      select 1 from public.job_templates t
      join public.org_members m on m.org_id = t.org_id
      where t.id = template_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- ============================================================================
-- RLS POLICIES — time_in_stage_log (PROFESSIONAL+)
-- ============================================================================

-- SELECT: org members see their org's log; enforced at app layer for plan gate
create policy "pt_stage_log_select"
  on public.time_in_stage_log
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: FACTORY+ can log (any active member in the org)
create policy "pt_stage_log_insert"
  on public.time_in_stage_log
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN', 'DESIGNER', 'FACTORY', 'INSTALLER')
    )
  );

-- UPDATE: FACTORY+ can close out (set exited_at) on their org's rows
create policy "pt_stage_log_update"
  on public.time_in_stage_log
  for update
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN', 'FACTORY')
    )
  )
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN', 'FACTORY')
    )
  );

-- DELETE: ADMIN+ only (audit log — deletions should be rare)
create policy "pt_stage_log_delete"
  on public.time_in_stage_log
  for delete
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- ============================================================================
-- SEED: Global job templates for DAPH Decor / Thai furniture manufacturing
-- ============================================================================

-- Insert global templates (org_id = null, is_global = true, plan_gate = STARTER)
insert into public.job_templates (
  org_id, name, category, description, plan_gate, is_global, version,
  tags, estimated_total_hours
) values
  (null, 'ตู้ครัวมาตรฐาน', 'CABINET',
   'Template สำหรับงานตู้ครัวทั่วไป: ออกแบบ → ตัด CNC → ประกอบ → พ่นสี → QC → ส่งมอบ',
   'STARTER', true, 1,
   ARRAY['ครัว', 'standard', 'daph-default'], 16.0),

  (null, 'ตู้เสื้อผ้า Built-in', 'CABINET',
   'Template สำหรับงานตู้เสื้อผ้า built-in: ออกแบบ → ตัด → ประกอบ → ติดตั้ง on-site',
   'STARTER', true, 1,
   ARRAY['wardrobe', 'built-in', 'daph-default'], 12.0),

  (null, 'ประตูบานเปิด', 'DOOR',
   'Template สำหรับงานประตูบานเปิด: วัดหน้างาน → ออกแบบ → ตัด → ประกอบ → QC → ส่งมอบ',
   'STARTER', true, 1,
   ARRAY['door', 'swing', 'daph-default'], 8.0),

  (null, 'งาน CNC Batch', 'CNC',
   'Template สำหรับงาน CNC ตัดชุด: เตรียมไฟล์ → รัน CNC → ตรวจชิ้นงาน → บรรจุ',
   'STARTER', true, 1,
   ARRAY['cnc', 'batch', 'daph-default'], 4.0),

  (null, 'งานติดตั้ง On-site', 'SITE',
   'Template สำหรับงานติดตั้งหน้างาน: เตรียมรถ → ขนของ → ติดตั้ง → ถ่ายรูป → รับงาน',
   'STARTER', true, 1,
   ARRAY['site', 'installation', 'daph-default'], 6.0)

on conflict (org_id, name, category, version) do nothing;

-- ============================================================================
-- SEED: Stages for "ตู้ครัวมาตรฐาน" template
-- ============================================================================

do $$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.job_templates
  where name = 'ตู้ครัวมาตรฐาน' and is_global = true and version = 1;

  if v_template_id is not null then
    insert into public.job_template_stages (
      template_id, org_id, stage_order, name, description,
      assigned_role, expected_duration_hours, is_approval_required,
      checklist_items, color
    ) values
      (v_template_id, null, 1, 'ออกแบบ', 'วาด layout + เลือก material',
       'DESIGNER', 2.0, false,
       '[{"label":"วาด layout 2D","required":true},{"label":"เลือก material + สี","required":true},{"label":"ส่ง PDF ให้ลูกค้า approve","required":true}]'::jsonb,
       '#8b5cf6'),

      (v_template_id, null, 2, 'อนุมัติแบบ', 'ลูกค้า approve แบบก่อนผลิต',
       'ADMIN', 0.5, true,
       '[{"label":"ได้รับ approval ลูกค้าเป็นลายลักษณ์อักษร","required":true}]'::jsonb,
       '#3b82f6'),

      (v_template_id, null, 3, 'เตรียม CNC', 'แปลงแบบเป็นไฟล์ตัด CNC',
       'DESIGNER', 1.5, false,
       '[{"label":"Export DXF","required":true},{"label":"ตรวจ nesting","required":true},{"label":"ส่งไฟล์เข้าคิว CNC","required":true}]'::jsonb,
       '#6366f1'),

      (v_template_id, null, 4, 'ตัด CNC', 'ตัดชิ้นงานตาม nesting layout',
       'FACTORY', 4.0, false,
       '[{"label":"ตรวจ material ก่อนตัด","required":true},{"label":"รัน CNC ตามไฟล์","required":true},{"label":"ตรวจชิ้นงานหลังตัด","required":true},{"label":"label ชิ้นงาน","required":true}]'::jsonb,
       '#f59e0b'),

      (v_template_id, null, 5, 'ประกอบ', 'ประกอบตู้จากชิ้นส่วน',
       'FACTORY', 3.0, false,
       '[{"label":"เรียงชิ้นส่วนตาม label","required":true},{"label":"ประกอบโครงตู้","required":true},{"label":"ติดบานพับ + ลิ้นชัก","required":false},{"label":"ถ่ายรูปก่อน QC","required":true,"photo_required":true}]'::jsonb,
       '#10b981'),

      (v_template_id, null, 6, 'QC', 'ตรวจคุณภาพก่อนส่ง',
       'FACTORY', 1.0, true,
       '[{"label":"ตรวจขนาดตรงแบบ","required":true},{"label":"ตรวจรอยขีดข่วน","required":true},{"label":"ทดสอบบานพับ/ลิ้นชัก","required":true},{"label":"ถ่ายรูป QC pass","required":true,"photo_required":true}]'::jsonb,
       '#06b6d4'),

      (v_template_id, null, 7, 'เตรียมส่ง', 'บรรจุและจัดเตรียมขนส่ง',
       'FACTORY', 1.0, false,
       '[{"label":"บรรจุหีบห่อ","required":true},{"label":"label กล่อง","required":true},{"label":"จัดเตรียมรถ","required":true}]'::jsonb,
       '#84cc16'),

      (v_template_id, null, 8, 'ส่งมอบ', 'ส่งมอบให้ลูกค้า',
       'INSTALLER', 3.0, false,
       '[{"label":"ขนส่งถึงหน้างาน","required":true},{"label":"ติดตั้งครบตามแบบ","required":true},{"label":"ถ่ายรูปหลังติดตั้ง","required":true,"photo_required":true},{"label":"ลูกค้าเซ็นรับงาน","required":true}]'::jsonb,
       '#22c55e')

    on conflict (template_id, stage_order) do nothing;
  end if;
end;
$$;

-- ============================================================================
-- SEED: Stages for "งาน CNC Batch" template
-- ============================================================================

do $$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.job_templates
  where name = 'งาน CNC Batch' and is_global = true and version = 1;

  if v_template_id is not null then
    insert into public.job_template_stages (
      template_id, org_id, stage_order, name, description,
      assigned_role, expected_duration_hours, is_approval_required,
      checklist_items, color
    ) values
      (v_template_id, null, 1, 'เตรียมไฟล์', 'รับ DXF และเตรียม nesting',
       'DESIGNER', 0.5, false,
       '[{"label":"ได้รับ DXF จาก Designer","required":true},{"label":"ตรวจขนาดชิ้นงาน","required":true}]'::jsonb,
       '#8b5cf6'),

      (v_template_id, null, 2, 'รัน CNC', 'ตัดชิ้นงาน',
       'FACTORY', 2.0, false,
       '[{"label":"เซ็ต zero point","required":true},{"label":"รัน cutting program","required":true},{"label":"ตรวจระหว่างตัด","required":true}]'::jsonb,
       '#f59e0b'),

      (v_template_id, null, 3, 'ตรวจชิ้นงาน', 'QC ชิ้นส่วนที่ตัด',
       'FACTORY', 0.5, false,
       '[{"label":"วัดขนาดตัวอย่าง 10%","required":true},{"label":"ตรวจรอย chip","required":true}]'::jsonb,
       '#06b6d4'),

      (v_template_id, null, 4, 'บรรจุ + label', 'บรรจุและ label ชิ้นส่วน',
       'FACTORY', 1.0, false,
       '[{"label":"label ทุกชิ้น","required":true},{"label":"บรรจุ ป้องกันรอย","required":true}]'::jsonb,
       '#22c55e')

    on conflict (template_id, stage_order) do nothing;
  end if;
end;
$$;

-- ============================================================================
-- ASSERTION: verify tables exist + RLS enabled
-- ============================================================================

do $$
begin
  assert (select count(*) from information_schema.tables
    where table_schema = 'public'
    and table_name in ('job_templates', 'job_template_stages', 'time_in_stage_log')
  ) = 3, 'ASSERTION FAILED: one or more process template tables missing';

  assert (select count(*) from pg_tables
    where schemaname = 'public'
    and tablename in ('job_templates', 'job_template_stages', 'time_in_stage_log')
    and rowsecurity = true
  ) = 3, 'ASSERTION FAILED: RLS not enabled on all process template tables';

  assert (select count(*) from public.job_templates where is_global = true) >= 5,
    'ASSERTION FAILED: global seed templates missing';

  raise notice '20261201_process_templates ✅ — 3 tables, RLS enabled, seed data OK';
end;
$$;


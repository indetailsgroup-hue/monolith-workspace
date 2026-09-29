-- Migration: 20270101_training_tracker.sql
-- MONOLITH v17.5 — Training Tracker Module (P2: People Development)
--
-- Plan Gate: PROFESSIONAL+ (same tier as Bottleneck Heatmap)
--
-- Feature overview:
--   Enables DAPH Decor managers to define training courses, enrol employees,
--   and track completions — with optional linkage to the Super Employee
--   (AI Readiness) stage progression system.
--
-- Tables:
--   training_courses      — course catalogue (global seeds + org-specific)
--   training_enrollments  — employee ↔ course enrolment with status tracking
--   training_completions  — completion records with score + evidence
--
-- RLS: org_id isolation; PROFESSIONAL+ enforced at app-layer + plan gate helper
-- Depends on:
--   0002 (orgs/org_members), 20261001_people_culture_schema (employees table),
--   20261201_process_templates (pt_current_org_plan helper)
-- ============================================================================

-- ============================================================================
-- PLAN GATE HELPER (Training Tracker prefix: tt_)
-- ============================================================================

-- Reuses pt_current_org_plan() from 20261201_process_templates for plan lookup
create or replace function public.tt_is_professional_plus()
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

comment on function public.tt_is_professional_plus() is
  'v17.5: Returns true if the current user''s org is on PROFESSIONAL or ENTERPRISE plan';

-- ============================================================================
-- TABLE: training_courses
-- ============================================================================

create table if not exists public.training_courses (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid null
    REFERENCES public.organizations(org_id) on delete cascade,
  -- org_id = null → global seed course visible to all PROFESSIONAL+ orgs

  title                 text not null,
  -- e.g. "ความปลอดภัยในโรงงาน", "การใช้ AI ช่วยออกแบบ", "QC มาตรฐาน ISO"

  description           text,

  category              text not null default 'CUSTOM'
    check (category in (
      'SAFETY',       -- ความปลอดภัย / Safety
      'QUALITY',      -- คุณภาพ / QC
      'TECHNICAL',    -- ทักษะเทคนิค / Technical Skills
      'LEADERSHIP',   -- ผู้นำ / Leadership
      'COMPLIANCE',   -- กฎระเบียบ / Compliance
      'ONBOARDING',   -- เริ่มงานใหม่ / Onboarding
      'AI_LITERACY',  -- ความรู้ AI — linked to SuperEmployeeStage progression
      'CUSTOM'        -- org-defined
    )),

  plan_gate             text not null default 'PROFESSIONAL'
    check (plan_gate in ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
  -- Training Tracker is PROFESSIONAL+ by design; plan_gate column retained for
  -- future per-course gating flexibility.

  duration_hours        decimal(5,2) null default 1.0
    check (duration_hours is null or duration_hours > 0),
  -- Estimated completion time (used in reporting + enrolment calendars)

  passing_score         int null default 70
    check (passing_score is null or (passing_score >= 0 and passing_score <= 100)),
  -- Minimum score to mark a completion as PASSED (null = no assessment)

  required_for_stage    text null
    check (required_for_stage in (
      'AI_UNAWARE',
      'AI_AWARE',
      'AI_ASSISTED',
      'AI_PARTNER',
      'SUPER_EMPLOYEE',
      null
    )),
  -- If set, completing this course is required before advancing past this stage.
  -- e.g. required_for_stage = 'AI_PARTNER' → required to reach SUPER_EMPLOYEE

  is_active             boolean not null default true,
  is_global             boolean not null default false,
  -- is_global = true → seed course visible to all orgs; org_id must be null

  version               int not null default 1,

  tags                  text[] default '{}',
  -- e.g. ['factory', 'mandatory', 'ai-readiness']

  external_url          text null,
  -- Link to LMS, YouTube, Google Drive, or any external material

  thumbnail_url         text null,
  -- Cover image for course card display

  created_by            uuid null references auth.users(id),
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now()),

  unique nulls not distinct (org_id, title, version)
);

comment on table public.training_courses is
  'v17.5 PROFESSIONAL+: Training course catalogue — global seeds + org-specific courses';

-- ============================================================================
-- TABLE: training_enrollments
-- ============================================================================

create table if not exists public.training_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null
    REFERENCES public.organizations(org_id) on delete cascade,

  course_id             uuid not null
    references public.training_courses(id) on delete cascade,

  employee_id           uuid not null
    references public.employees(id) on delete cascade,

  enrolled_by           uuid null references auth.users(id),
  -- The ADMIN/OWNER who created this enrolment (null = self-enrol if allowed)

  enrolled_at           timestamptz not null default timezone('utc', now()),

  due_date              date null,
  -- Optional deadline; used in overdue reporting

  status                text not null default 'ENROLLED'
    check (status in (
      'ENROLLED',      -- assigned but not started
      'IN_PROGRESS',   -- employee has started
      'COMPLETED',     -- training_completions record exists
      'CANCELLED'      -- removed / no longer required
    )),

  notes                 text null,
  -- Manager notes (reason for enrolment, special instructions)

  updated_at            timestamptz not null default timezone('utc', now()),

  -- Prevent duplicate active enrolments for the same employee + course
  unique (org_id, employee_id, course_id)
);

comment on table public.training_enrollments is
  'v17.5 PROFESSIONAL+: Employee ↔ course enrolment records with status lifecycle';

-- ============================================================================
-- TABLE: training_completions
-- ============================================================================

create table if not exists public.training_completions (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null
    REFERENCES public.organizations(org_id) on delete cascade,

  course_id             uuid not null
    references public.training_courses(id) on delete cascade,

  enrollment_id         uuid not null
    references public.training_enrollments(id) on delete cascade,
  -- One completion record per enrolment (retakes require a new enrolment)

  employee_id           uuid not null
    references public.employees(id) on delete cascade,

  completed_at          timestamptz not null default timezone('utc', now()),

  score                 int null
    check (score is null or (score >= 0 and score <= 100)),
  -- Assessment score (0–100); null if no assessment

  is_passed             boolean
    generated always as (
      case
        when score is null then true        -- no-assessment courses = auto-pass
        else null                           -- computed by trigger after insert
      end
    ) stored,
  -- NOTE: For score-based pass/fail the app layer sets this via the UPDATE path
  -- because generated columns cannot reference other tables. The column is
  -- overridden by trg_completions_set_passed trigger below.

  evidence_url          text null,
  -- Link to certificate, photo, or LMS export

  evidence_notes        text null,
  -- Free-text notes about the evidence (e.g. "Certificate #TH-2027-0042")

  verified_by           uuid null references auth.users(id),
  -- The ADMIN/OWNER who verified this completion; null = not yet verified

  verified_at           timestamptz null,

  notes                 text null,

  created_at            timestamptz not null default timezone('utc', now()),

  -- Enforce one completion per enrolment
  unique (enrollment_id)
);

comment on table public.training_completions is
  'v17.5 PROFESSIONAL+: Training completion records with score, evidence, and verification';

-- ============================================================================
-- DROP & RECREATE generated column workaround: is_passed trigger
-- The generated column only handles the null-score case; for scored assessments
-- we use a BEFORE INSERT/UPDATE trigger to set is_passed from score + passing_score.
-- ============================================================================

-- We actually need is_passed to be a regular (non-generated) column for trigger use.
-- Alter to drop generated and make it a plain boolean column with trigger.
alter table public.training_completions
  alter column is_passed drop expression if exists;

-- Set default for plain column
alter table public.training_completions
  alter column is_passed set default null;

create or replace function public.tt_set_completion_passed()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_passing_score int;
begin
  -- Fetch passing_score from the associated course
  select c.passing_score into v_passing_score
  from public.training_courses c
  where c.id = new.course_id;

  if v_passing_score is null then
    -- No assessment → auto-pass
    new.is_passed := true;
  elsif new.score is null then
    -- Assessment required but score not provided yet → pending
    new.is_passed := null;
  else
    new.is_passed := new.score >= v_passing_score;
  end if;

  return new;
end;
$$;

create trigger trg_completions_set_passed
  before insert or update of score on public.training_completions
  for each row execute function public.tt_set_completion_passed();

comment on function public.tt_set_completion_passed() is
  'v17.5: Auto-computes is_passed from score vs course.passing_score on insert/update';

-- ============================================================================
-- TRIGGER: updated_at auto-bump
-- ============================================================================

create or replace function public.tt_set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_training_courses_updated_at
  before update on public.training_courses
  for each row execute function public.tt_set_updated_at();

create trigger trg_training_enrollments_updated_at
  before update on public.training_enrollments
  for each row execute function public.tt_set_updated_at();

-- ============================================================================
-- TRIGGER: sync enrollment status → COMPLETED when completion inserted
-- ============================================================================

create or replace function public.tt_sync_enrollment_completed()
returns trigger
language plpgsql
security invoker
as $$
begin
  update public.training_enrollments
  set status = 'COMPLETED', updated_at = timezone('utc', now())
  where id = new.enrollment_id
    and status != 'CANCELLED';
  return new;
end;
$$;

create trigger trg_completions_sync_enrollment
  after insert on public.training_completions
  for each row execute function public.tt_sync_enrollment_completed();

comment on function public.tt_sync_enrollment_completed() is
  'v17.5: Automatically sets enrollment.status = COMPLETED when a completion record is inserted';

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists ix_training_courses_org
  on public.training_courses (org_id) where org_id is not null;

create index if not exists ix_training_courses_global
  on public.training_courses (category, is_active) where is_global = true;

create index if not exists ix_training_courses_stage
  on public.training_courses (required_for_stage) where required_for_stage is not null;

create index if not exists ix_training_enrollments_org_employee
  on public.training_enrollments (org_id, employee_id, status);

create index if not exists ix_training_enrollments_course
  on public.training_enrollments (course_id, status);

create index if not exists ix_training_enrollments_due
  on public.training_enrollments (org_id, due_date)
  where status in ('ENROLLED', 'IN_PROGRESS') and due_date is not null;

create index if not exists ix_training_completions_org_employee
  on public.training_completions (org_id, employee_id, completed_at desc);

create index if not exists ix_training_completions_course
  on public.training_completions (course_id, is_passed);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.training_courses      enable row level security;
alter table public.training_enrollments  enable row level security;
alter table public.training_completions  enable row level security;

-- ============================================================================
-- RLS POLICIES — training_courses
-- ============================================================================

-- SELECT: org members see own + global courses
create policy "tt_courses_select"
  on public.training_courses
  for select
  using (
    (org_id is not null and org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    ))
    or
    (is_global = true and org_id is null)
  );

-- INSERT: ADMIN+ can create org-specific courses
create policy "tt_courses_insert"
  on public.training_courses
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

-- UPDATE: ADMIN+ own org only; global courses are immutable via app layer
create policy "tt_courses_update"
  on public.training_courses
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
create policy "tt_courses_delete"
  on public.training_courses
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
-- RLS POLICIES — training_enrollments
-- ============================================================================

-- SELECT: org members see their org's enrolments
create policy "tt_enrollments_select"
  on public.training_enrollments
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: ADMIN+ can enrol employees
create policy "tt_enrollments_insert"
  on public.training_enrollments
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: ADMIN+ can change status / due date
create policy "tt_enrollments_update"
  on public.training_enrollments
  for update
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  )
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- DELETE: ADMIN+ (cancel enrolments)
create policy "tt_enrollments_delete"
  on public.training_enrollments
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
-- RLS POLICIES — training_completions
-- ============================================================================

-- SELECT: org members see their org's completions
create policy "tt_completions_select"
  on public.training_completions
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: ADMIN+ can record completions
create policy "tt_completions_insert"
  on public.training_completions
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: ADMIN+ (add evidence, verify, update score)
create policy "tt_completions_update"
  on public.training_completions
  for update
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  )
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- DELETE: OWNER only (audit log — deletions should be rare)
create policy "tt_completions_delete"
  on public.training_completions
  for delete
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role = 'OWNER'
    )
  );

-- ============================================================================
-- VIEW: training_summary_v
-- Per-employee training progress across all enrolled courses (PROFESSIONAL+)
-- ============================================================================

create or replace view public.training_summary_v
with (security_invoker = true)
as
select
  e.org_id,
  e.employee_id,
  count(e.id)                                                       as total_enrolled,
  count(e.id) filter (where e.status = 'COMPLETED')                as total_completed,
  count(e.id) filter (where e.status = 'IN_PROGRESS')              as total_in_progress,
  count(e.id) filter (where e.status = 'CANCELLED')                as total_cancelled,
  count(e.id) filter (
    where e.status in ('ENROLLED', 'IN_PROGRESS')
      and e.due_date < current_date
  )                                                                  as total_overdue,
  round(
    count(e.id) filter (where e.status = 'COMPLETED')::numeric
    / nullif(count(e.id) filter (where e.status != 'CANCELLED'), 0) * 100,
    1
  )                                                                  as completion_rate_pct,
  -- Latest completion timestamp
  max(c.completed_at)                                               as last_completed_at
from public.training_enrollments e
left join public.training_completions c
  on c.enrollment_id = e.id
group by e.org_id, e.employee_id;

comment on view public.training_summary_v is
  'v17.5 PROFESSIONAL+: Per-employee training progress summary — completion rate, overdue count';

-- ============================================================================
-- VIEW: training_course_stats_v
-- Per-course aggregate stats (PROFESSIONAL+)
-- ============================================================================

create or replace view public.training_course_stats_v
with (security_invoker = true)
as
select
  e.org_id,
  e.course_id,
  c_info.title                                                       as course_title,
  c_info.category,
  c_info.required_for_stage,
  count(e.id)                                                        as total_enrolled,
  count(e.id) filter (where e.status = 'COMPLETED')                 as total_completed,
  round(
    count(e.id) filter (where e.status = 'COMPLETED')::numeric
    / nullif(count(e.id) filter (where e.status != 'CANCELLED'), 0) * 100,
    1
  )                                                                   as completion_rate_pct,
  round(avg(comp.score) filter (where comp.score is not null), 1)    as avg_score,
  count(comp.id) filter (where comp.is_passed = true)                as total_passed,
  count(comp.id) filter (where comp.is_passed = false)               as total_failed
from public.training_enrollments e
join public.training_courses c_info on c_info.id = e.course_id
left join public.training_completions comp on comp.enrollment_id = e.id
group by e.org_id, e.course_id, c_info.title, c_info.category, c_info.required_for_stage;

comment on view public.training_course_stats_v is
  'v17.5 PROFESSIONAL+: Per-course aggregate stats — completion rates, avg scores';

-- ============================================================================
-- SEED: Global training courses for DAPH Decor / Thai manufacturing
-- ============================================================================

insert into public.training_courses (
  org_id, title, description, category, plan_gate,
  is_global, version, duration_hours, passing_score,
  required_for_stage, tags, is_active
) values
  -- Safety
  (null, 'ความปลอดภัยในโรงงาน (ขั้นพื้นฐาน)', 'กฎความปลอดภัยพื้นฐาน การใช้ PPE และการป้องกันอุบัติเหตุในโรงงานไม้', 'SAFETY',
   'PROFESSIONAL', true, 1, 2.0, 80, null,
   ARRAY['factory', 'mandatory', 'safety', 'daph-global'], true),

  (null, 'การใช้เครื่องจักรอย่างปลอดภัย', 'ขั้นตอนการใช้เลื่อยไฟฟ้า, เราเตอร์, เครื่อง CNC อย่างปลอดภัย', 'SAFETY',
   'PROFESSIONAL', true, 1, 3.0, 80, null,
   ARRAY['factory', 'mandatory', 'machinery', 'daph-global'], true),

  -- Quality
  (null, 'QC มาตรฐาน — ตรวจสอบชิ้นงานก่อนส่ง', 'ขั้นตอน QC: วัดขนาด, ตรวจรอย, ทดสอบบานพับ/ลิ้นชัก, บันทึก QC pass', 'QUALITY',
   'PROFESSIONAL', true, 1, 1.5, 75, null,
   ARRAY['quality', 'qc', 'factory', 'daph-global'], true),

  (null, 'การถ่ายรูปหน้างานมาตรฐาน DAPH', 'วิธีถ่ายรูปก่อน/หลังติดตั้ง และ QC สำหรับ LINE OA และ report ลูกค้า', 'QUALITY',
   'PROFESSIONAL', true, 1, 1.0, null, null,
   ARRAY['quality', 'photo', 'installer', 'daph-global'], true),

  -- AI Literacy — linked to Super Employee stages
  (null, 'รู้จัก AI Tools สำหรับการผลิต (AI_AWARE)', 'แนะนำ ChatGPT, Midjourney, GitHub Copilot — ใช้งานอะไรได้บ้างในงานช่าง', 'AI_LITERACY',
   'PROFESSIONAL', true, 1, 1.0, null, 'AI_UNAWARE',
   ARRAY['ai-readiness', 'beginner', 'super-employee', 'daph-global'], true),

  (null, 'ใช้ AI ช่วยออกแบบตู้ครัว (AI_ASSISTED)', 'ฝึกใช้ AI สร้าง mood board, เสนอ layout ให้ลูกค้า, และ export DXF จาก AI', 'AI_LITERACY',
   'PROFESSIONAL', true, 1, 2.0, 70, 'AI_AWARE',
   ARRAY['ai-readiness', 'design', 'super-employee', 'daph-global'], true),

  (null, 'AI Partner — Prompt Engineering สำหรับงานโรงงาน (AI_PARTNER)', 'เขียน prompt ขั้นสูงสำหรับงาน CNC nesting, cost estimation, และ QC checklist', 'AI_LITERACY',
   'PROFESSIONAL', true, 1, 3.0, 70, 'AI_ASSISTED',
   ARRAY['ai-readiness', 'prompt-engineering', 'super-employee', 'daph-global'], true),

  -- Technical
  (null, 'การอ่านแบบและ DXF สำหรับช่างโรงงาน', 'อ่าน 2D drawings, ทำความเข้าใจ tolerances, และ export ไฟล์สำหรับ CNC', 'TECHNICAL',
   'PROFESSIONAL', true, 1, 2.0, 75, null,
   ARRAY['technical', 'factory', 'cnc', 'daph-global'], true),

  -- Leadership
  (null, 'หัวหน้างานมือใหม่ — บริหารทีมไลน์ผลิต', 'การวางแผนงาน, มอบหมายงาน, ติดตาม KPI และแก้ไขปัญหาหน้างาน', 'LEADERSHIP',
   'PROFESSIONAL', true, 1, 4.0, null, null,
   ARRAY['leadership', 'management', 'admin', 'daph-global'], true),

  -- Onboarding
  (null, 'Onboarding ใหม่ — ทำความรู้จัก MONOLITH', 'วิธีใช้ระบบ MONOLITH: jobs, templates, QC log, LINE OA integration', 'ONBOARDING',
   'PROFESSIONAL', true, 1, 1.0, null, null,
   ARRAY['onboarding', 'system', 'all-roles', 'daph-global'], true)

on conflict (org_id, title, version) do nothing;

-- ============================================================================
-- ASSERTION: verify tables exist + RLS enabled
-- ============================================================================

do $$
begin
  assert (select count(*) from information_schema.tables
    where table_schema = 'public'
    and table_name in ('training_courses', 'training_enrollments', 'training_completions')
  ) = 3, 'ASSERTION FAILED: one or more training tracker tables missing';

  assert (select count(*) from pg_tables
    where schemaname = 'public'
    and tablename in ('training_courses', 'training_enrollments', 'training_completions')
    and rowsecurity = true
  ) = 3, 'ASSERTION FAILED: RLS not enabled on all training tracker tables';

  assert (select count(*) from public.training_courses where is_global = true) >= 5,
    'ASSERTION FAILED: global seed training courses missing';

  raise notice '20270101_training_tracker ✅ — 3 tables, RLS enabled, seed data OK';
end;
$$;

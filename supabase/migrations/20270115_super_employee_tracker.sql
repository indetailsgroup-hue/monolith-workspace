-- Migration: 20270115_super_employee_tracker.sql
-- MONOLITH v17.5 — Super Employee Tracker: AI Readiness Stage Progression
--
-- Plan Gate: PROFESSIONAL+ (reuses tt_is_professional_plus() from 20270101)
--
-- Feature overview:
--   Tracks each DAPH Decor employee's progression through the 5 AI Readiness
--   stages (AI_UNAWARE → AI_AWARE → AI_ASSISTED → AI_PARTNER → SUPER_EMPLOYEE),
--   periodic assessments, and per-stage skill gaps.
--   Provides org-level AI readiness dashboards for leadership.
--
-- Tables:
--   employee_ai_assessments  — periodic AI readiness assessments (score 0–100)
--   employee_stage_history   — log of stage transitions per employee
--   employee_skill_gaps      — identified skill gaps per stage
--
-- Views:
--   employee_ai_readiness_v      — latest stage + score per employee
--   org_ai_readiness_summary_v   — org-level aggregate (distribution, avg score)
--
-- RLS: org_id isolation; PROFESSIONAL+ enforced at app-layer
-- Depends on:
--   20261001_people_culture_schema (employees table, org_members table)
--   20270101_training_tracker (tt_is_professional_plus helper)
-- ============================================================================

-- ============================================================================
-- TABLE: employee_ai_assessments
-- (Created first — employee_stage_history has a FK to this table)
-- ============================================================================

create table if not exists public.employee_ai_assessments (
  id                    uuid primary key default gen_random_uuid(),

  org_id                uuid not null
    REFERENCES public.organizations(org_id) on delete cascade,

  employee_id           uuid not null
    references public.employees(id) on delete cascade,
  -- The employee being assessed

  assessor_id           uuid not null
    references auth.users(id),
  -- The ADMIN/OWNER who conducted the assessment

  stage_at_assessment   text not null
    check (stage_at_assessment in (
      'AI_UNAWARE',
      'AI_AWARE',
      'AI_ASSISTED',
      'AI_PARTNER',
      'SUPER_EMPLOYEE'
    )),
  -- The employee's stage at the time of this assessment

  score                 int not null
    check (score >= 0 and score <= 100),
  -- Composite readiness score (0–100); drives stage_score in stage_history

  strengths             jsonb not null default '[]',
  -- Array of strings: areas the employee excels in
  -- e.g. ["ChatGPT prompting", "AI-assisted QC photo labeling"]

  gaps                  jsonb not null default '[]',
  -- Array of strings: areas needing improvement
  -- e.g. ["CNC nesting with AI", "cost estimation from AI output"]

  ai_tools_used         text[] not null default '{}',
  -- Tools the employee has demonstrated using
  -- e.g. {'ChatGPT', 'Midjourney', 'GitHub Copilot'}

  completed_at          timestamptz not null default timezone('utc', now()),
  -- When the assessment was finalised

  created_at            timestamptz not null default timezone('utc', now())
);

comment on table public.employee_ai_assessments is
  'v17.5 PROFESSIONAL+: Periodic AI readiness assessments — score, strengths, gaps, tools used';

-- ============================================================================
-- TABLE: employee_stage_history
-- ============================================================================

create table if not exists public.employee_stage_history (
  id                    uuid primary key default gen_random_uuid(),

  org_id                uuid not null
    REFERENCES public.organizations(org_id) on delete cascade,

  employee_id           uuid not null
    references public.employees(id) on delete cascade,

  stage                 text not null
    check (stage in (
      'AI_UNAWARE',
      'AI_AWARE',
      'AI_ASSISTED',
      'AI_PARTNER',
      'SUPER_EMPLOYEE'
    )),
  -- The stage this record represents

  stage_score           int not null default 0
    check (stage_score >= 0 and stage_score <= 100),
  -- Numeric score at time of transition (mirrors SUPER_EMPLOYEE_STAGE_SCORE)
  -- AI_UNAWARE=0, AI_AWARE=25, AI_ASSISTED=50, AI_PARTNER=75, SUPER_EMPLOYEE=100

  assessment_id         uuid null
    references public.employee_ai_assessments(id) on delete set null,
  -- The assessment that triggered this stage transition (optional)

  changed_by            uuid not null
    references auth.users(id),
  -- The ADMIN/OWNER who recorded this transition

  notes                 text null,
  -- Optional context (e.g. "Passed AI Fundamentals course + panel review")

  scored_at             timestamptz not null default timezone('utc', now()),
  -- When the stage transition was effective (may differ from created_at for backdating)

  created_at            timestamptz not null default timezone('utc', now())
);

comment on table public.employee_stage_history is
  'v17.5 PROFESSIONAL+: Append-only log of AI Readiness stage transitions per employee';

-- ============================================================================
-- TABLE: employee_skill_gaps
-- ============================================================================

create table if not exists public.employee_skill_gaps (
  id                    uuid primary key default gen_random_uuid(),

  org_id                uuid not null
    REFERENCES public.organizations(org_id) on delete cascade,

  employee_id           uuid not null
    references public.employees(id) on delete cascade,

  stage_required        text not null
    check (stage_required in (
      'AI_UNAWARE',
      'AI_AWARE',
      'AI_ASSISTED',
      'AI_PARTNER',
      'SUPER_EMPLOYEE'
    )),
  -- The stage this skill gap is blocking progression toward

  skill_name            text not null,
  -- Short name of the skill gap (e.g. "AI-assisted nesting in CNC")

  skill_description     text null,
  -- Optional detailed description or links to learning resources

  resolved              boolean not null default false,
  -- True once the employee has demonstrated the skill

  resolved_at           timestamptz null,
  -- When the gap was resolved; set by the resolveSkillGap store action

  created_at            timestamptz not null default timezone('utc', now()),

  -- Prevent duplicate open gaps for the same employee + skill + stage
  unique nulls not distinct (employee_id, stage_required, skill_name, resolved)
);

comment on table public.employee_skill_gaps is
  'v17.5 PROFESSIONAL+: Per-employee skill gaps identified during AI Readiness stage progression';

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists ix_se_assessments_org_employee
  on public.employee_ai_assessments (org_id, employee_id, completed_at desc);

create index if not exists ix_se_stage_history_org_employee
  on public.employee_stage_history (org_id, employee_id, scored_at desc);

create index if not exists ix_se_stage_history_stage
  on public.employee_stage_history (org_id, stage);

create index if not exists ix_se_skill_gaps_open
  on public.employee_skill_gaps (org_id, employee_id)
  where resolved = false;

create index if not exists ix_se_skill_gaps_stage
  on public.employee_skill_gaps (stage_required, resolved);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

alter table public.employee_ai_assessments  enable row level security;
alter table public.employee_stage_history    enable row level security;
alter table public.employee_skill_gaps       enable row level security;

-- ============================================================================
-- RLS POLICIES — employee_ai_assessments
-- ============================================================================

-- SELECT: all active org members see their org's assessments
create policy "se_assessments_select"
  on public.employee_ai_assessments
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: ADMIN+ only
create policy "se_assessments_insert"
  on public.employee_ai_assessments
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: ADMIN+ (corrections to score / strengths / gaps)
create policy "se_assessments_update"
  on public.employee_ai_assessments
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

-- DELETE: OWNER only (audit trail preservation)
create policy "se_assessments_delete"
  on public.employee_ai_assessments
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
-- RLS POLICIES — employee_stage_history
-- ============================================================================

-- SELECT: all active org members
create policy "se_stage_history_select"
  on public.employee_stage_history
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: ADMIN+ only (stage transitions are admin-recorded events)
create policy "se_stage_history_insert"
  on public.employee_stage_history
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: OWNER only (corrections must be rare and auditable)
create policy "se_stage_history_update"
  on public.employee_stage_history
  for update
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role = 'OWNER'
    )
  )
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role = 'OWNER'
    )
  );

-- DELETE: OWNER only
create policy "se_stage_history_delete"
  on public.employee_stage_history
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
-- RLS POLICIES — employee_skill_gaps
-- ============================================================================

-- SELECT: all active org members (employees can see their own gaps via JOIN on employee_id)
create policy "se_skill_gaps_select"
  on public.employee_skill_gaps
  for select
  using (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid() and m.is_active = true
    )
  );

-- INSERT: ADMIN+
create policy "se_skill_gaps_insert"
  on public.employee_skill_gaps
  for insert
  with check (
    org_id in (
      select m.org_id from public.org_members m
      where m.user_id = auth.uid()
        and m.is_active = true
        and m.role in ('OWNER', 'ADMIN')
    )
  );

-- UPDATE: ADMIN+ (resolve gaps, edit descriptions)
create policy "se_skill_gaps_update"
  on public.employee_skill_gaps
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

-- DELETE: ADMIN+ (remove incorrectly logged gaps)
create policy "se_skill_gaps_delete"
  on public.employee_skill_gaps
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
-- VIEW: employee_ai_readiness_v
-- Latest stage + score per employee (uses DISTINCT ON for efficiency)
-- ============================================================================

create or replace view public.employee_ai_readiness_v
with (security_invoker = true)
as
select distinct on (org_id, employee_id)
  org_id,
  employee_id,
  stage          as current_stage,
  stage_score    as current_score,
  scored_at      as last_assessed_at
from public.employee_stage_history
order by org_id, employee_id, scored_at desc;

comment on view public.employee_ai_readiness_v is
  'v17.5 PROFESSIONAL+: Latest AI Readiness stage and score per employee (most-recent transition)';

-- ============================================================================
-- VIEW: org_ai_readiness_summary_v
-- Org-level aggregate: stage distribution, avg score, AI readiness rate
-- AI readiness rate = % of employees at AI_ASSISTED or above
-- ============================================================================

create or replace view public.org_ai_readiness_summary_v
with (security_invoker = true)
as
select
  r.org_id,
  count(*)                                                                       as total_employees,
  count(*) filter (where r.current_stage = 'AI_UNAWARE')                       as ai_unaware_count,
  count(*) filter (where r.current_stage = 'AI_AWARE')                         as ai_aware_count,
  count(*) filter (where r.current_stage = 'AI_ASSISTED')                      as ai_assisted_count,
  count(*) filter (where r.current_stage = 'AI_PARTNER')                       as ai_partner_count,
  count(*) filter (where r.current_stage = 'SUPER_EMPLOYEE')                   as super_employee_count,
  round(avg(r.current_score)::numeric, 1)                                       as avg_score,
  round(
    100.0
    * count(*) filter (where r.current_stage in ('AI_ASSISTED', 'AI_PARTNER', 'SUPER_EMPLOYEE'))
    / nullif(count(*), 0),
    1
  )                                                                              as ai_readiness_rate
from public.employee_ai_readiness_v r
group by r.org_id;

comment on view public.org_ai_readiness_summary_v is
  'v17.5 PROFESSIONAL+: Org-level AI Readiness summary — stage distribution, avg score, readiness rate';

-- ============================================================================
-- ASSERTION: verify tables, RLS, and views
-- ============================================================================

do $$
begin
  assert (
    select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'employee_ai_assessments',
        'employee_stage_history',
        'employee_skill_gaps'
      )
  ) = 3,
  'ASSERTION FAILED: one or more Super Employee Tracker tables missing';

  assert (
    select count(*) from pg_tables
    where schemaname = 'public'
      and tablename in (
        'employee_ai_assessments',
        'employee_stage_history',
        'employee_skill_gaps'
      )
      and rowsecurity = true
  ) = 3,
  'ASSERTION FAILED: RLS not enabled on all Super Employee Tracker tables';

  assert (
    select count(*) from information_schema.views
    where table_schema = 'public'
      and table_name in (
        'employee_ai_readiness_v',
        'org_ai_readiness_summary_v'
      )
  ) = 2,
  'ASSERTION FAILED: one or more Super Employee Tracker views missing';

  raise notice '20270115_super_employee_tracker ✅ — 3 tables, 2 views, RLS enabled';
end;
$$;

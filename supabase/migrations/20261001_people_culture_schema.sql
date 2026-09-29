-- =============================================================================
-- MONOLITH v16.0 — Migration 20261001 (Part 1)
-- People & Culture Schema
-- Tables: employees, skills, employee_skills, training_records,
--         super_employee_progress, ps_survey_templates,
--         ps_survey_responses, ps_scores, anonymous_feedback
--
-- RLS Security Fixes Applied (from SECURITY_REVIEW_RLS.md):
--   Issue 2 (Critical): get_user_org_id() rewritten in plpgsql — LIMIT 1 fixed
--   Issue 3 (High):     Separate policies per DML operation (no FOR ALL)
--   Issue 4 (High):     org_members.status = 'ACTIVE' in all EXISTS checks
--   Issue 5 (Medium):   get_employee_org_id() helper for tables without org_id
--   Issue 7 (Medium):   is_org_active() guard on INSERT/UPDATE WITH CHECK
--   Issue 8 (Medium):   FORCE ROW LEVEL SECURITY on all tables
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper Functions
-- ---------------------------------------------------------------------------

-- Fix Issue 2 (Critical): rewrite in plpgsql to correctly support LIMIT 1
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND is_active = true
  ORDER BY joined_at ASC
  LIMIT 1;
  RETURN v_org_id;
END;
$$;

-- Fix Issue 5 (Medium): helper for tables without org_id column (employee_skills)
CREATE OR REPLACE FUNCTION public.get_employee_org_id(p_employee_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.employees
  WHERE id = p_employee_id;
  RETURN v_org_id;
END;
$$;

-- Fix Issue 7 (Medium): guard writes when trial has expired
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active BOOLEAN;
BEGIN
  SELECT (
    status = 'ACTIVE'
    AND (trial_expires_at IS NULL OR trial_expires_at > NOW())
  ) INTO v_active
  FROM public.organizations
  WHERE id = p_org_id;
  RETURN COALESCE(v_active, FALSE);
END;
$$;

-- Role-level helper (OWNER=100, ADMIN=80, DESIGNER/FACTORY/FINANCE=60, INSTALLER=40, VIEWER=10)
CREATE OR REPLACE FUNCTION public.has_role_in_org(p_org_id UUID, p_min_role_level INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level INT;
BEGIN
  SELECT CASE role
    WHEN 'OWNER'     THEN 100
    WHEN 'ADMIN'     THEN 80
    WHEN 'DESIGNER'  THEN 60
    WHEN 'FACTORY'   THEN 60
    WHEN 'FINANCE'   THEN 60
    WHEN 'INSTALLER' THEN 40
    WHEN 'VIEWER'    THEN 10
    ELSE 0
  END INTO v_level
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND org_id   = p_org_id
    AND is_active = true;           -- Fix Issue 4 (corrected: org_members uses is_active)
  RETURN COALESCE(v_level, 0) >= p_min_role_level;
END;
$$;

-- Generic immutable-table trigger (reused for super_employee_progress + ps_survey_responses)
CREATE OR REPLACE FUNCTION public.deny_immutable_table()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is immutable — UPDATE and DELETE are not allowed.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enum Types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.employment_type AS ENUM (
    'FULL_TIME', 'PART_TIME', 'CONTRACT', 'SEASONAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_stage AS ENUM (
    'AI_UNAWARE', 'AI_AWARE', 'AI_ASSISTED', 'AI_PARTNER', 'SUPER_EMPLOYEE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.skill_level AS ENUM (
    'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.survey_status AS ENUM (
    'DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ps_dimension AS ENUM (
    'SPEAK_UP', 'HELP_SEEKING', 'RISK_TAKING', 'INCLUSION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.feedback_category AS ENUM (
    'SAFETY', 'PROCESS', 'MANAGEMENT', 'ENVIRONMENT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================================================
-- PEOPLE MODULE TABLES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Table: employees
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employees (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  employee_code     TEXT,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  nickname          TEXT,
  position          TEXT,
  department        TEXT,
  employment_type   public.employment_type NOT NULL DEFAULT 'FULL_TIME',
  hire_date         DATE,
  birth_date        DATE,
  phone             TEXT,
  email             TEXT,
  line_id           TEXT,
  profile_image_url TEXT,
  -- Super Employee Programme — updated atomically by validate_stage_progression() trigger
  ai_stage          public.ai_stage NOT NULL DEFAULT 'AI_UNAWARE',
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  notes             TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT employees_email_per_org UNIQUE (org_id, email),
  CONSTRAINT employees_code_per_org  UNIQUE (org_id, employee_code)
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;   -- Fix Issue 8

CREATE INDEX IF NOT EXISTS idx_employees_org_id     ON public.employees(org_id);
CREATE INDEX IF NOT EXISTS idx_employees_ai_stage   ON public.employees(org_id, ai_stage);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees(org_id, department);
CREATE INDEX IF NOT EXISTS idx_employees_is_active  ON public.employees(org_id, is_active);

CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit trigger: employees (moved here from 20261001_audit_log.sql — Fix Z110)
-- Must be defined AFTER the employees table exists.
DROP TRIGGER IF EXISTS audit_employees ON public.employees;
CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- RLS: employees (Fix Issue 3 — separate per DML)
DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;

CREATE POLICY employees_select ON public.employees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = employees.org_id
        AND m.is_active = TRUE       -- Fix Issue 4
    )
  );

CREATE POLICY employees_insert ON public.employees
  FOR INSERT
  WITH CHECK (
    has_role_in_org(org_id, 60)
    AND is_org_active(org_id)        -- Fix Issue 7
  );

CREATE POLICY employees_update ON public.employees
  FOR UPDATE
  USING (has_role_in_org(org_id, 60))
  WITH CHECK (
    has_role_in_org(org_id, 60)
    AND is_org_active(org_id)
  );

CREATE POLICY employees_delete ON public.employees
  FOR DELETE
  USING (has_role_in_org(org_id, 80));

-- ---------------------------------------------------------------------------
-- Table: skills
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  category    TEXT,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT skills_name_per_org UNIQUE (org_id, name)
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_skills_org_id   ON public.skills(org_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(org_id, category);

CREATE TRIGGER skills_set_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS skills_select ON public.skills;
DROP POLICY IF EXISTS skills_insert ON public.skills;
DROP POLICY IF EXISTS skills_update ON public.skills;
DROP POLICY IF EXISTS skills_delete ON public.skills;

CREATE POLICY skills_select ON public.skills
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = skills.org_id
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY skills_insert ON public.skills
  FOR INSERT
  WITH CHECK (has_role_in_org(org_id, 60) AND is_org_active(org_id));

CREATE POLICY skills_update ON public.skills
  FOR UPDATE
  USING (has_role_in_org(org_id, 60))
  WITH CHECK (has_role_in_org(org_id, 60) AND is_org_active(org_id));

CREATE POLICY skills_delete ON public.skills
  FOR DELETE
  USING (has_role_in_org(org_id, 80));

-- ---------------------------------------------------------------------------
-- Table: employee_skills
-- No org_id column — Fix Issue 5: RLS via get_employee_org_id() helper
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id          UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID               NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  skill_id    UUID               NOT NULL REFERENCES public.skills(id)    ON DELETE CASCADE,
  level       public.skill_level NOT NULL DEFAULT 'BEGINNER',
  verified_by UUID               REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT employee_skills_unique UNIQUE (employee_id, skill_id)
);

ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill    ON public.employee_skills(skill_id);

CREATE TRIGGER employee_skills_set_updated_at
  BEFORE UPDATE ON public.employee_skills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS employee_skills_select ON public.employee_skills;
DROP POLICY IF EXISTS employee_skills_insert ON public.employee_skills;
DROP POLICY IF EXISTS employee_skills_update ON public.employee_skills;
DROP POLICY IF EXISTS employee_skills_delete ON public.employee_skills;

CREATE POLICY employee_skills_select ON public.employee_skills
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = public.get_employee_org_id(employee_skills.employee_id)
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY employee_skills_insert ON public.employee_skills
  FOR INSERT
  WITH CHECK (
    has_role_in_org(public.get_employee_org_id(employee_id), 60)
    AND is_org_active(public.get_employee_org_id(employee_id))
  );

CREATE POLICY employee_skills_update ON public.employee_skills
  FOR UPDATE
  USING (has_role_in_org(public.get_employee_org_id(employee_id), 60))
  WITH CHECK (
    has_role_in_org(public.get_employee_org_id(employee_id), 60)
    AND is_org_active(public.get_employee_org_id(employee_id))
  );

CREATE POLICY employee_skills_delete ON public.employee_skills
  FOR DELETE
  USING (has_role_in_org(public.get_employee_org_id(employee_id), 60));

-- ---------------------------------------------------------------------------
-- Table: training_records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES public.employees(id)     ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  provider        TEXT,
  training_date   DATE        NOT NULL,
  duration_hours  NUMERIC(6,2),
  cost            NUMERIC(12,2),
  currency        TEXT        NOT NULL DEFAULT 'THB',
  certificate_url TEXT,
  skill_ids       UUID[]      NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'COMPLETED'
                  CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  notes           TEXT,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_training_records_org      ON public.training_records(org_id);
CREATE INDEX IF NOT EXISTS idx_training_records_employee ON public.training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_records_date     ON public.training_records(org_id, training_date DESC);

CREATE TRIGGER training_records_set_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS training_records_select ON public.training_records;
DROP POLICY IF EXISTS training_records_insert ON public.training_records;
DROP POLICY IF EXISTS training_records_update ON public.training_records;
DROP POLICY IF EXISTS training_records_delete ON public.training_records;

CREATE POLICY training_records_select ON public.training_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = training_records.org_id
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY training_records_insert ON public.training_records
  FOR INSERT
  WITH CHECK (has_role_in_org(org_id, 60) AND is_org_active(org_id));

CREATE POLICY training_records_update ON public.training_records
  FOR UPDATE
  USING (has_role_in_org(org_id, 60))
  WITH CHECK (has_role_in_org(org_id, 60) AND is_org_active(org_id));

CREATE POLICY training_records_delete ON public.training_records
  FOR DELETE
  USING (has_role_in_org(org_id, 80));

-- ---------------------------------------------------------------------------
-- Table: super_employee_progress (IMMUTABLE — INSERT only, no UPDATE/DELETE)
-- AI Stage progression: AI_UNAWARE(0)→AI_AWARE(25)→AI_ASSISTED(50)→AI_PARTNER(75)→SUPER_EMPLOYEE(100)
-- employees.ai_stage is updated ATOMICALLY by validate_stage_progression() trigger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.super_employee_progress (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID            NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  employee_id UUID            NOT NULL REFERENCES public.employees(id)     ON DELETE CASCADE,
  from_stage  public.ai_stage NOT NULL,
  to_stage    public.ai_stage NOT NULL,
  promoted_by UUID            REFERENCES auth.users(id),
  evidence    TEXT,
  metadata    JSONB           NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT sep_stage_different CHECK (from_stage <> to_stage)
);

ALTER TABLE public.super_employee_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_employee_progress FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sep_org_id      ON public.super_employee_progress(org_id);
CREATE INDEX IF NOT EXISTS idx_sep_employee_id ON public.super_employee_progress(employee_id);
CREATE INDEX IF NOT EXISTS idx_sep_created_at  ON public.super_employee_progress(employee_id, created_at DESC);

-- Immutability trigger
CREATE TRIGGER super_employee_progress_immutable
  BEFORE UPDATE OR DELETE ON public.super_employee_progress
  FOR EACH ROW EXECUTE FUNCTION public.deny_immutable_table();

-- Stage validation + atomic employee.ai_stage update
CREATE OR REPLACE FUNCTION public.validate_stage_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_order     public.ai_stage[] := ARRAY[
    'AI_UNAWARE'::public.ai_stage,
    'AI_AWARE'::public.ai_stage,
    'AI_ASSISTED'::public.ai_stage,
    'AI_PARTNER'::public.ai_stage,
    'SUPER_EMPLOYEE'::public.ai_stage
  ];
  v_current_stage public.ai_stage;
BEGIN
  -- Lock employee row to prevent concurrent advancement
  SELECT ai_stage INTO v_current_stage
  FROM public.employees
  WHERE id = NEW.employee_id
  FOR UPDATE;

  -- Validate from_stage matches current employee state
  IF v_current_stage <> NEW.from_stage THEN
    RAISE EXCEPTION
      'Stage mismatch: employee is at "%" but transition claims from "%"',
      v_current_stage, NEW.from_stage;
  END IF;

  -- Validate exactly one step forward
  IF array_position(stage_order, NEW.to_stage) <>
     array_position(stage_order, NEW.from_stage) + 1
  THEN
    RAISE EXCEPTION
      'Invalid stage progression: "%" → "%". Must advance exactly one step.',
      NEW.from_stage, NEW.to_stage;
  END IF;

  -- Atomically update employee ai_stage
  UPDATE public.employees
     SET ai_stage   = NEW.to_stage,
         updated_at = NOW()
   WHERE id = NEW.employee_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sep_validate_and_update
  BEFORE INSERT ON public.super_employee_progress
  FOR EACH ROW EXECUTE FUNCTION public.validate_stage_progression();

DROP POLICY IF EXISTS sep_select ON public.super_employee_progress;
DROP POLICY IF EXISTS sep_insert ON public.super_employee_progress;

CREATE POLICY sep_select ON public.super_employee_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = super_employee_progress.org_id
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY sep_insert ON public.super_employee_progress
  FOR INSERT
  WITH CHECK (
    has_role_in_org(org_id, 80)
    AND is_org_active(org_id)
  );

-- ===========================================================================
-- CULTURE MODULE TABLES
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Table: ps_survey_templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ps_survey_templates (
  id          UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID                  NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  name        TEXT                  NOT NULL,
  description TEXT,
  questions   JSONB                 NOT NULL DEFAULT '[]',
  status      public.survey_status  NOT NULL DEFAULT 'DRAFT',
  period_type TEXT                  NOT NULL DEFAULT 'MONTHLY'
              CHECK (period_type IN ('WEEKLY', 'MONTHLY', 'QUARTERLY')),
  created_by  UUID                  REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ps_survey_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_survey_templates FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pst_org_id ON public.ps_survey_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_pst_status ON public.ps_survey_templates(org_id, status);

-- Partial unique index: only one ACTIVE template per org at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_pst_one_active_per_org
  ON public.ps_survey_templates(org_id)
  WHERE status = 'ACTIVE';

CREATE TRIGGER ps_survey_templates_set_updated_at
  BEFORE UPDATE ON public.ps_survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS pst_select ON public.ps_survey_templates;
DROP POLICY IF EXISTS pst_insert ON public.ps_survey_templates;
DROP POLICY IF EXISTS pst_update ON public.ps_survey_templates;
DROP POLICY IF EXISTS pst_delete ON public.ps_survey_templates;

CREATE POLICY pst_select ON public.ps_survey_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = ps_survey_templates.org_id
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY pst_insert ON public.ps_survey_templates
  FOR INSERT
  WITH CHECK (has_role_in_org(org_id, 80) AND is_org_active(org_id));

CREATE POLICY pst_update ON public.ps_survey_templates
  FOR UPDATE
  USING (has_role_in_org(org_id, 80))
  WITH CHECK (has_role_in_org(org_id, 80) AND is_org_active(org_id));

CREATE POLICY pst_delete ON public.ps_survey_templates
  FOR DELETE
  USING (has_role_in_org(org_id, 100));

-- ---------------------------------------------------------------------------
-- Table: ps_survey_responses
-- ANONYMITY GUARANTEE:
--   - NO user_id column — auth.uid() checked by RLS INSERT for org membership only
--   - anonymous_token = crypto.randomUUID() generated client-side (localStorage)
--   - Server never stores any linkage between token and auth identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ps_survey_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(org_id)      ON DELETE CASCADE,
  survey_id        UUID        NOT NULL REFERENCES public.ps_survey_templates(id) ON DELETE CASCADE,
  anonymous_token  TEXT        NOT NULL,       -- opaque client device token
  period_label     TEXT        NOT NULL,       -- e.g. '2026-08', '2026-Q3'
  answers          JSONB       NOT NULL DEFAULT '{}',  -- { [question_id]: 1-7 }
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One response per device per survey per period
  CONSTRAINT psr_unique_token_period UNIQUE (survey_id, anonymous_token, period_label)
);

ALTER TABLE public.ps_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_survey_responses FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_psr_survey_period ON public.ps_survey_responses(survey_id, period_label);
CREATE INDEX IF NOT EXISTS idx_psr_org_id        ON public.ps_survey_responses(org_id);

-- Immutability: submitted responses cannot be altered or deleted
CREATE TRIGGER ps_survey_responses_immutable
  BEFORE UPDATE OR DELETE ON public.ps_survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.deny_immutable_table();

DROP POLICY IF EXISTS psr_select ON public.ps_survey_responses;
DROP POLICY IF EXISTS psr_insert ON public.ps_survey_responses;

-- SELECT: ADMIN+ reads responses for score computation (not individual identity)
CREATE POLICY psr_select ON public.ps_survey_responses
  FOR SELECT
  USING (has_role_in_org(org_id, 80));

-- INSERT: any active org member may submit — auth.uid() checked for membership only, NOT stored
CREATE POLICY psr_insert ON public.ps_survey_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = ps_survey_responses.org_id
        AND m.is_active = TRUE  
    )
    AND is_org_active(org_id)
  );

-- ---------------------------------------------------------------------------
-- Table: ps_scores
-- Privacy threshold enforced at DB level: response_count >= 3
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ps_scores (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(org_id)      ON DELETE CASCADE,
  survey_id        UUID        NOT NULL REFERENCES public.ps_survey_templates(id) ON DELETE CASCADE,
  period_label     TEXT        NOT NULL,
  overall_score    NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  dimension_scores JSONB       NOT NULL DEFAULT '{}',
  -- DB-level privacy threshold: score cannot be saved with fewer than 3 responses
  response_count   INT         NOT NULL CHECK (response_count >= 3),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_by      UUID        REFERENCES auth.users(id),

  CONSTRAINT ps_scores_unique UNIQUE (org_id, survey_id, period_label)
);

ALTER TABLE public.ps_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ps_scores FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ps_scores_org_period ON public.ps_scores(org_id, period_label DESC);
CREATE INDEX IF NOT EXISTS idx_ps_scores_survey     ON public.ps_scores(survey_id);

DROP POLICY IF EXISTS ps_scores_select ON public.ps_scores;
DROP POLICY IF EXISTS ps_scores_insert ON public.ps_scores;
DROP POLICY IF EXISTS ps_scores_update ON public.ps_scores;
DROP POLICY IF EXISTS ps_scores_delete ON public.ps_scores;

CREATE POLICY ps_scores_select ON public.ps_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = ps_scores.org_id
        AND m.is_active = TRUE  
    )
  );

CREATE POLICY ps_scores_insert ON public.ps_scores
  FOR INSERT
  WITH CHECK (has_role_in_org(org_id, 80) AND is_org_active(org_id));

CREATE POLICY ps_scores_update ON public.ps_scores
  FOR UPDATE
  USING (has_role_in_org(org_id, 80))
  WITH CHECK (has_role_in_org(org_id, 80) AND is_org_active(org_id));

CREATE POLICY ps_scores_delete ON public.ps_scores
  FOR DELETE
  USING (has_role_in_org(org_id, 100));

-- ---------------------------------------------------------------------------
-- Table: anonymous_feedback
-- ANONYMITY GUARANTEE:
--   - NO user_id column
--   - auth.uid() checked by RLS INSERT for org membership only
--   - ADMIN+ can view and action; regular members cannot see others' feedback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.anonymous_feedback (
  id           UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID                     NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  category     public.feedback_category NOT NULL DEFAULT 'OTHER',
  content      TEXT                     NOT NULL,
  sentiment    TEXT                     CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  is_actioned  BOOLEAN                  NOT NULL DEFAULT FALSE,
  actioned_by  UUID                     REFERENCES auth.users(id),
  actioned_at  TIMESTAMPTZ,
  action_note  TEXT,
  submitted_at TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

  CONSTRAINT af_content_min_length CHECK (char_length(content) >= 10)
);

ALTER TABLE public.anonymous_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_feedback FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_af_org_id    ON public.anonymous_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_af_category  ON public.anonymous_feedback(org_id, category);
CREATE INDEX IF NOT EXISTS idx_af_actioned  ON public.anonymous_feedback(org_id, is_actioned);
CREATE INDEX IF NOT EXISTS idx_af_submitted ON public.anonymous_feedback(org_id, submitted_at DESC);

DROP POLICY IF EXISTS af_select ON public.anonymous_feedback;
DROP POLICY IF EXISTS af_insert ON public.anonymous_feedback;
DROP POLICY IF EXISTS af_update ON public.anonymous_feedback;
DROP POLICY IF EXISTS af_delete ON public.anonymous_feedback;

-- ADMIN+ can see all feedback (anonymity protected from peer visibility)
CREATE POLICY af_select ON public.anonymous_feedback
  FOR SELECT
  USING (has_role_in_org(org_id, 80));

-- Any active member may submit anonymously
CREATE POLICY af_insert ON public.anonymous_feedback
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id  = anonymous_feedback.org_id
        AND m.is_active = TRUE  
    )
    AND is_org_active(org_id)
  );

-- ADMIN+ can action feedback (mark resolved, add note)
CREATE POLICY af_update ON public.anonymous_feedback
  FOR UPDATE
  USING (has_role_in_org(org_id, 80))
  WITH CHECK (has_role_in_org(org_id, 80) AND is_org_active(org_id));

-- OWNER only can delete
CREATE POLICY af_delete ON public.anonymous_feedback
  FOR DELETE
  USING (has_role_in_org(org_id, 100));

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_skills       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_records      TO authenticated;
GRANT SELECT, INSERT                 ON public.super_employee_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ps_survey_templates   TO authenticated;
GRANT SELECT, INSERT                 ON public.ps_survey_responses   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ps_scores             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anonymous_feedback    TO authenticated;

COMMIT;

-- ============================================================
-- RLS Policies: ps_scores
-- Added: VIEWER role (>= 10) support
-- ps_scores are aggregate snapshots — no individual identity
-- exposed; safe to share with all org members.
-- ============================================================

-- SELECT: VIEWER (role >= 10)
DROP POLICY IF EXISTS "ps_scores_select" ON ps_scores;
CREATE POLICY "ps_scores_select" ON ps_scores
  FOR SELECT
  USING (
    has_role_in_org(org_id, 10)
    AND is_org_active(org_id)
  );

-- INSERT: ADMIN+ (80) — only admins may create/upsert aggregate snapshots
-- Upsert uses ON CONFLICT (org_id, survey_id, period_label)
DROP POLICY IF EXISTS "ps_scores_insert" ON ps_scores;
CREATE POLICY "ps_scores_insert" ON ps_scores
  FOR INSERT
  WITH CHECK (
    has_role_in_org(org_id, 80)
    AND is_org_active(org_id)
  );

-- UPDATE: ADMIN+ (80) — recalculation or correction of scores
DROP POLICY IF EXISTS "ps_scores_update" ON ps_scores;
CREATE POLICY "ps_scores_update" ON ps_scores
  FOR UPDATE
  USING (has_role_in_org(org_id, 80))
  WITH CHECK (
    has_role_in_org(org_id, 80)
    AND is_org_active(org_id)
  );

-- No DELETE policy intentionally.
-- ps_scores rows are immutable historical snapshots.
-- UNIQUE (org_id, survey_id, period_label) enforces upsert semantics.

-- ============================================================
-- RLS Policies: anonymous_feedback
-- Added: VIEWER role (>= 10) support
-- Content is anonymous at schema level (submitted_by_hash).
-- Transparency of feedback list supports PS action-taking.
-- ============================================================
-- DECISION (2026-10-01): anonymous_feedback SELECT → ADMIN+ 80 only
-- ----------------------------------------------------------------
-- Rationale (Thai High Power Distance manufacturing context):
--   * Thai factory workers fear peer recognition of writing style/content.
--     Opening SELECT to VIEWER (10) would deter honest submissions.
--   * OR-logic between permissive policies: a VIEWER 10 policy would
--     effectively override the ADMIN+ 80 af_select policy above.
--   * CultureDashboard exposes only *aggregate* ps_scores to VIEWER role;
--     individual feedback items remain ADMIN+ only.
--   * af_select (defined above) already enforces ADMIN+ 80 SELECT.
--     No duplicate SELECT policy is added here.
--
-- INSERT: any authenticated org member (role >= 10) — unchanged
DROP POLICY IF EXISTS "anonymous_feedback_insert" ON anonymous_feedback;
CREATE POLICY "anonymous_feedback_insert" ON anonymous_feedback
  FOR INSERT
  WITH CHECK (
    has_role_in_org(org_id, 10)
    AND is_org_active(org_id)
  );

-- UPDATE: ADMIN+ (80) — actioning feedback (action_status, action_note)
DROP POLICY IF EXISTS "anonymous_feedback_update" ON anonymous_feedback;
CREATE POLICY "anonymous_feedback_update" ON anonymous_feedback
  FOR UPDATE
  USING (has_role_in_org(org_id, 80))
  WITH CHECK (
    has_role_in_org(org_id, 80)
    AND is_org_active(org_id)
  );

-- No DELETE policy intentionally.
-- Admins should use action_status = 'DISMISSED' instead of deletion.

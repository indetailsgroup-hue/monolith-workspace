-- =============================================================================
-- MONOLITH v18.0 — Leadership Action Tracker (LAT)
-- Migration: 20270220_leadership_action_tracker.sql
-- Plan gate: ENTERPRISE
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE lat_action_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE lat_action_priority AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TYPE lat_action_category AS ENUM (
  'STRATEGY',
  'OPERATIONS',
  'PEOPLE',
  'FINANCE',
  'COMPLIANCE',
  'QUALITY',
  'SAFETY',
  'CUSTOM'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER FUNCTION — ENTERPRISE plan gate
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lat_is_enterprise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.organizations
    WHERE  org_id = (auth.jwt() ->> 'org_id')::uuid
    AND    plan   = 'ENTERPRISE'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lat_actions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lat_actions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID          NOT NULL,
  title         TEXT          NOT NULL,
  description   TEXT,
  category      lat_action_category NOT NULL DEFAULT 'CUSTOM',
  priority      lat_action_priority NOT NULL DEFAULT 'MEDIUM',
  status        lat_action_status   NOT NULL DEFAULT 'OPEN',
  due_date      DATE,
  owner_id      UUID          NOT NULL,           -- primary responsible person
  reviewed_by   UUID,                             -- person who marked COMPLETED
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_by    UUID          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT lat_actions_title_not_empty CHECK (char_length(trim(title)) > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lat_action_assignments
-- Supports multiple assignees per action (besides the primary owner)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lat_action_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id   UUID        NOT NULL REFERENCES lat_actions(id) ON DELETE CASCADE,
  org_id      UUID        NOT NULL,
  assignee_id UUID        NOT NULL,
  assigned_by UUID        NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lat_action_assignments_unique UNIQUE (action_id, assignee_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: lat_action_updates
-- Append-only progress updates / comments per action
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE lat_action_updates (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       UUID              NOT NULL REFERENCES lat_actions(id) ON DELETE CASCADE,
  org_id          UUID              NOT NULL,
  author_id       UUID              NOT NULL,
  body            TEXT              NOT NULL,
  previous_status lat_action_status,               -- nullable: status before this update
  new_status      lat_action_status,               -- nullable: status after this update
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT lat_action_updates_body_not_empty CHECK (char_length(trim(body)) > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: lat_action_summary_v
-- Per-org aggregates for dashboard summary cards
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW lat_action_summary_v AS
SELECT
  org_id,
  status,
  priority,
  COUNT(*)                                            AS action_count,
  COUNT(*) FILTER (WHERE due_date < CURRENT_DATE
    AND status NOT IN ('COMPLETED', 'CANCELLED'))     AS overdue_count
FROM lat_actions
GROUP BY org_id, status, priority;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: updated_at maintenance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lat_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lat_actions_updated_at
  BEFORE UPDATE ON lat_actions
  FOR EACH ROW
  EXECUTE FUNCTION lat_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: stamp completed_at / cancelled_at on status transition
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lat_stamp_terminal_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    NEW.cancelled_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lat_actions_stamp_terminal
  BEFORE UPDATE ON lat_actions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION lat_stamp_terminal_timestamps();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE lat_actions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lat_action_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lat_action_updates      ENABLE ROW LEVEL SECURITY;

-- lat_actions — SELECT: ENTERPRISE members of the same org
CREATE POLICY lat_actions_select ON lat_actions
  FOR SELECT
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- lat_actions — INSERT: ENTERPRISE, hierarchy >= 60 (team-lead+)
CREATE POLICY lat_actions_insert ON lat_actions
  FOR INSERT
  WITH CHECK (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'hierarchy')::int >= 60
  );

-- lat_actions — UPDATE: owner OR hierarchy >= 80 (ADMIN+)
CREATE POLICY lat_actions_update ON lat_actions
  FOR UPDATE
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
    AND (
      owner_id = auth.uid()
      OR (auth.jwt() ->> 'hierarchy')::int >= 80
    )
  );

-- lat_actions — DELETE: hierarchy >= 80 only
CREATE POLICY lat_actions_delete ON lat_actions
  FOR DELETE
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'hierarchy')::int >= 80
  );

-- lat_action_assignments — SELECT
CREATE POLICY lat_assignments_select ON lat_action_assignments
  FOR SELECT
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- lat_action_assignments — INSERT/DELETE: owner or ADMIN+
CREATE POLICY lat_assignments_insert ON lat_action_assignments
  FOR INSERT
  WITH CHECK (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'hierarchy')::int >= 60
  );

CREATE POLICY lat_assignments_delete ON lat_action_assignments
  FOR DELETE
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
    AND (auth.jwt() ->> 'hierarchy')::int >= 60
  );

-- lat_action_updates — SELECT
CREATE POLICY lat_updates_select ON lat_action_updates
  FOR SELECT
  USING (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- lat_action_updates — INSERT: any ENTERPRISE member (append-only)
CREATE POLICY lat_updates_insert ON lat_action_updates
  FOR INSERT
  WITH CHECK (
    lat_is_enterprise()
    AND org_id::text = auth.jwt() ->> 'org_id'
  );

-- No UPDATE/DELETE on lat_action_updates (append-only audit trail)

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX lat_actions_org_id_idx          ON lat_actions(org_id);
CREATE INDEX lat_actions_owner_id_idx        ON lat_actions(owner_id);
CREATE INDEX lat_actions_status_idx          ON lat_actions(status);
CREATE INDEX lat_actions_priority_idx        ON lat_actions(priority);
CREATE INDEX lat_actions_due_date_idx        ON lat_actions(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX lat_actions_org_status_idx      ON lat_actions(org_id, status);
CREATE INDEX lat_assignments_action_id_idx   ON lat_action_assignments(action_id);
CREATE INDEX lat_assignments_assignee_id_idx ON lat_action_assignments(assignee_id);
CREATE INDEX lat_updates_action_id_idx       ON lat_action_updates(action_id);
CREATE INDEX lat_updates_author_id_idx       ON lat_action_updates(author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ASSERTION BLOCK (runs at migration time)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_status_count   int;
  v_priority_count int;
  v_category_count int;
BEGIN
  SELECT COUNT(*) INTO v_status_count
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'lat_action_status';
  ASSERT v_status_count = 5, 'lat_action_status must have 5 values';

  SELECT COUNT(*) INTO v_priority_count
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'lat_action_priority';
  ASSERT v_priority_count = 4, 'lat_action_priority must have 4 values';

  SELECT COUNT(*) INTO v_category_count
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'lat_action_category';
  ASSERT v_category_count = 8, 'lat_action_category must have 8 values';

  ASSERT to_regclass('lat_actions')            IS NOT NULL, 'lat_actions table missing';
  ASSERT to_regclass('lat_action_assignments') IS NOT NULL, 'lat_action_assignments table missing';
  ASSERT to_regclass('lat_action_updates')     IS NOT NULL, 'lat_action_updates table missing';
  ASSERT to_regclass('lat_action_summary_v')   IS NOT NULL, 'lat_action_summary_v view missing';

  RAISE NOTICE 'LAT migration assertions passed.';
END;
$$;

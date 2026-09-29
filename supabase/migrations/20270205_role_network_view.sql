-- =============================================================================
-- 20270205_role_network_view.sql — v18.0 Role Network View
-- Tables : rnv_roles, rnv_role_relationships, rnv_employee_roles
-- View   : rnv_role_network_v  (current_headcount + relationship_count)
-- Gate   : rnv_is_enterprise(p_org_id) — ENTERPRISE plan only
-- RLS    : SELECT = ENTERPRISE members; INSERT/UPDATE/DELETE = ENTERPRISE + ADMIN+
-- =============================================================================

-- ─── Types ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rnv_relationship_type') THEN
    CREATE TYPE rnv_relationship_type AS ENUM (
      'COLLABORATES_WITH',
      'DEPENDS_ON',
      'MENTORS',
      'REVIEWS',
      'ESCALATES_TO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rnv_seniority') THEN
    CREATE TYPE rnv_seniority AS ENUM (
      'JUNIOR',
      'MID',
      'SENIOR',
      'LEAD',
      'PRINCIPAL'
    );
  END IF;
END $$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rnv_roles (
  id            uuid              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid              NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  name          text              NOT NULL,
  description   text,
  seniority     rnv_seniority     NOT NULL DEFAULT 'MID',
  is_active     boolean           NOT NULL DEFAULT true,
  metadata      jsonb,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  updated_at    timestamptz       NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rnv_role_relationships (
  id                uuid                  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id            uuid                  NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  from_role_id      uuid                  NOT NULL REFERENCES rnv_roles(id) ON DELETE CASCADE,
  to_role_id        uuid                  NOT NULL REFERENCES rnv_roles(id) ON DELETE CASCADE,
  relationship_type rnv_relationship_type NOT NULL,
  notes             text,
  created_at        timestamptz           NOT NULL DEFAULT now(),
  -- prevent duplicate edges in same direction
  CONSTRAINT rnv_role_rel_unique UNIQUE (org_id, from_role_id, to_role_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS rnv_employee_roles (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL,
  role_id     uuid        NOT NULL REFERENCES rnv_roles(id) ON DELETE CASCADE,
  is_primary  boolean     NOT NULL DEFAULT false,
  started_at  date,
  ended_at    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rnv_employee_role_unique UNIQUE (org_id, employee_id, role_id)
);

-- ─── Plan Gate Function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rnv_is_enterprise(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.organizations
    WHERE  org_id = p_org_id
    AND    plan   = 'ENTERPRISE'
  );
$$;

-- ─── Trigger: updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rnv_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rnv_roles_updated_at ON rnv_roles;
CREATE TRIGGER rnv_roles_updated_at
  BEFORE UPDATE ON rnv_roles
  FOR EACH ROW EXECUTE FUNCTION rnv_set_updated_at();

-- ─── View: rnv_role_network_v ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW rnv_role_network_v AS
SELECT
  r.id,
  r.org_id,
  r.name,
  r.description,
  r.seniority,
  r.is_active,
  r.metadata,
  r.created_at,
  r.updated_at,
  -- current active employees assigned to this role
  COALESCE(hc.current_headcount, 0)  AS current_headcount,
  -- total outgoing + incoming relationship edges
  COALESCE(rc.relationship_count, 0) AS relationship_count
FROM rnv_roles r

LEFT JOIN (
  SELECT
    role_id,
    COUNT(*) AS current_headcount
  FROM  rnv_employee_roles
  WHERE ended_at IS NULL OR ended_at >= CURRENT_DATE
  GROUP BY role_id
) hc ON hc.role_id = r.id

LEFT JOIN (
  SELECT
    unnested_role_id  AS role_id,
    COUNT(*)          AS relationship_count
  FROM (
    SELECT from_role_id AS unnested_role_id FROM rnv_role_relationships
    UNION ALL
    SELECT to_role_id   AS unnested_role_id FROM rnv_role_relationships
  ) edges
  GROUP BY unnested_role_id
) rc ON rc.role_id = r.id;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS rnv_roles_org_id_idx
  ON rnv_roles (org_id);

CREATE INDEX IF NOT EXISTS rnv_roles_org_active_idx
  ON rnv_roles (org_id, is_active);

CREATE INDEX IF NOT EXISTS rnv_role_rel_org_id_idx
  ON rnv_role_relationships (org_id);

CREATE INDEX IF NOT EXISTS rnv_role_rel_from_role_idx
  ON rnv_role_relationships (from_role_id);

CREATE INDEX IF NOT EXISTS rnv_role_rel_to_role_idx
  ON rnv_role_relationships (to_role_id);

CREATE INDEX IF NOT EXISTS rnv_employee_roles_org_id_idx
  ON rnv_employee_roles (org_id);

CREATE INDEX IF NOT EXISTS rnv_employee_roles_employee_idx
  ON rnv_employee_roles (employee_id);

CREATE INDEX IF NOT EXISTS rnv_employee_roles_role_idx
  ON rnv_employee_roles (role_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE rnv_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnv_role_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnv_employee_roles    ENABLE ROW LEVEL SECURITY;

-- rnv_roles: SELECT — any ENTERPRISE member of the org
DROP POLICY IF EXISTS rnv_roles_select ON rnv_roles;
CREATE POLICY rnv_roles_select ON rnv_roles
  FOR SELECT USING (
    rnv_is_enterprise(org_id)
    AND auth.uid() IN (
      SELECT user_id FROM org_members WHERE org_id = rnv_roles.org_id
    )
  );

-- rnv_roles: INSERT — ENTERPRISE + ADMIN+ (hierarchy_level >= 80)
DROP POLICY IF EXISTS rnv_roles_insert ON rnv_roles;
CREATE POLICY rnv_roles_insert ON rnv_roles
  FOR INSERT WITH CHECK (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_roles.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- rnv_roles: UPDATE — ENTERPRISE + ADMIN+
DROP POLICY IF EXISTS rnv_roles_update ON rnv_roles;
CREATE POLICY rnv_roles_update ON rnv_roles
  FOR UPDATE USING (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_roles.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- rnv_roles: DELETE — ENTERPRISE + ADMIN+
DROP POLICY IF EXISTS rnv_roles_delete ON rnv_roles;
CREATE POLICY rnv_roles_delete ON rnv_roles
  FOR DELETE USING (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_roles.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- rnv_role_relationships: SELECT
DROP POLICY IF EXISTS rnv_role_rel_select ON rnv_role_relationships;
CREATE POLICY rnv_role_rel_select ON rnv_role_relationships
  FOR SELECT USING (
    rnv_is_enterprise(org_id)
    AND auth.uid() IN (
      SELECT user_id FROM org_members WHERE org_id = rnv_role_relationships.org_id
    )
  );

-- rnv_role_relationships: INSERT/UPDATE/DELETE — ENTERPRISE + ADMIN+
DROP POLICY IF EXISTS rnv_role_rel_insert ON rnv_role_relationships;
CREATE POLICY rnv_role_rel_insert ON rnv_role_relationships
  FOR INSERT WITH CHECK (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_role_relationships.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

DROP POLICY IF EXISTS rnv_role_rel_delete ON rnv_role_relationships;
CREATE POLICY rnv_role_rel_delete ON rnv_role_relationships
  FOR DELETE USING (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_role_relationships.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- rnv_employee_roles: SELECT
DROP POLICY IF EXISTS rnv_employee_roles_select ON rnv_employee_roles;
CREATE POLICY rnv_employee_roles_select ON rnv_employee_roles
  FOR SELECT USING (
    rnv_is_enterprise(org_id)
    AND auth.uid() IN (
      SELECT user_id FROM org_members WHERE org_id = rnv_employee_roles.org_id
    )
  );

-- rnv_employee_roles: INSERT — ENTERPRISE + ADMIN+
DROP POLICY IF EXISTS rnv_employee_roles_insert ON rnv_employee_roles;
CREATE POLICY rnv_employee_roles_insert ON rnv_employee_roles
  FOR INSERT WITH CHECK (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_employee_roles.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- rnv_employee_roles: DELETE — ENTERPRISE + ADMIN+
DROP POLICY IF EXISTS rnv_employee_roles_delete ON rnv_employee_roles;
CREATE POLICY rnv_employee_roles_delete ON rnv_employee_roles
  FOR DELETE USING (
    rnv_is_enterprise(org_id)
    AND EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id          = rnv_employee_roles.org_id
        AND user_id         = auth.uid()
        AND is_active = TRUE
        AND role IN ('managing_director', 'governance')
    )
  );

-- ─── Assertion Block ──────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl_count int;
  view_count int;
BEGIN
  SELECT COUNT(*) INTO tbl_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('rnv_roles', 'rnv_role_relationships', 'rnv_employee_roles');

  SELECT COUNT(*) INTO view_count
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'rnv_role_network_v';

  ASSERT tbl_count  = 3,   'Expected 3 rnv_ tables; found: ' || tbl_count;
  ASSERT view_count = 1,   'Expected rnv_role_network_v view; found: ' || view_count;

  RAISE NOTICE '20270205_role_network_view: % tables + % view verified OK', tbl_count, view_count;
END $$;

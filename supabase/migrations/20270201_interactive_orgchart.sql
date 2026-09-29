-- =============================================================================
-- Migration: 20270201_interactive_orgchart.sql
-- v18.0 — Interactive OrgChart module (PROFESSIONAL+ plan gate)
-- Tables: org_chart_nodes, org_reporting_lines
-- View:   org_chart_hierarchy_v
-- =============================================================================

-- ─── Plan Gate ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION oc_is_professional_plus()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      AND plan IN ('PROFESSIONAL', 'ENTERPRISE')
  );
$$;

-- ─── org_chart_nodes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_chart_nodes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  parent_id        UUID        REFERENCES org_chart_nodes(id) ON DELETE SET NULL,
  employee_id      UUID        REFERENCES employees(id) ON DELETE SET NULL,
  node_type        TEXT        NOT NULL DEFAULT 'EMPLOYEE'
                               CHECK (node_type IN ('EMPLOYEE', 'ROLE', 'DEPARTMENT', 'TEAM')),
  title            TEXT        NOT NULL,
  department       TEXT,
  position_x       FLOAT       NOT NULL DEFAULT 0.0,
  position_y       FLOAT       NOT NULL DEFAULT 0.0,
  hierarchy_level  INT         NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── org_reporting_lines ─────────────────────────────────────────────────────
-- Explicit relationships beyond the parent_id tree (dotted-line / matrix reports)

CREATE TABLE IF NOT EXISTS org_reporting_lines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  from_node_id UUID        NOT NULL REFERENCES org_chart_nodes(id) ON DELETE CASCADE,
  to_node_id   UUID        NOT NULL REFERENCES org_chart_nodes(id) ON DELETE CASCADE,
  line_type    TEXT        NOT NULL DEFAULT 'SOLID'
                           CHECK (line_type IN ('SOLID', 'DOTTED')),
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_node_id, to_node_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ocn_org_id       ON org_chart_nodes(org_id);
CREATE INDEX IF NOT EXISTS idx_ocn_parent_id    ON org_chart_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_ocn_employee_id  ON org_chart_nodes(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ocn_active       ON org_chart_nodes(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_orl_org_id       ON org_reporting_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_orl_from_node    ON org_reporting_lines(from_node_id);

-- ─── org_chart_hierarchy_v ───────────────────────────────────────────────────
-- Recursive CTE materialised as a view: adds `depth` and `path` columns.

CREATE OR REPLACE VIEW org_chart_hierarchy_v AS
WITH RECURSIVE hierarchy AS (
  -- Base: root nodes (no parent)
  SELECT
    id, org_id, parent_id, employee_id, node_type, title, department,
    position_x, position_y, hierarchy_level, is_active, metadata,
    created_at, updated_at,
    0              AS depth,
    ARRAY[id]      AS path
  FROM org_chart_nodes
  WHERE parent_id IS NULL

  UNION ALL

  -- Recursive: children
  SELECT
    n.id, n.org_id, n.parent_id, n.employee_id, n.node_type, n.title, n.department,
    n.position_x, n.position_y, n.hierarchy_level, n.is_active, n.metadata,
    n.created_at, n.updated_at,
    h.depth + 1,
    h.path || n.id
  FROM org_chart_nodes n
  JOIN hierarchy h ON n.parent_id = h.id
)
SELECT * FROM hierarchy;

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE org_chart_nodes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_reporting_lines  ENABLE ROW LEVEL SECURITY;

-- org_chart_nodes
CREATE POLICY "ocn_select" ON org_chart_nodes
  FOR SELECT USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

CREATE POLICY "ocn_insert" ON org_chart_nodes
  FOR INSERT WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

CREATE POLICY "ocn_update" ON org_chart_nodes
  FOR UPDATE
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid AND oc_is_professional_plus())
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid AND oc_is_professional_plus());

CREATE POLICY "ocn_delete" ON org_chart_nodes
  FOR DELETE USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

-- org_reporting_lines
CREATE POLICY "orl_select" ON org_reporting_lines
  FOR SELECT USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

CREATE POLICY "orl_insert" ON org_reporting_lines
  FOR INSERT WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

CREATE POLICY "orl_delete" ON org_reporting_lines
  FOR DELETE USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND oc_is_professional_plus()
  );

-- ─── Updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION oc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ocn_updated_at
  BEFORE UPDATE ON org_chart_nodes
  FOR EACH ROW EXECUTE FUNCTION oc_set_updated_at();

-- ─── Assertions ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_chart_nodes'
  ) = 1, 'org_chart_nodes table must exist';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_reporting_lines'
  ) = 1, 'org_reporting_lines table must exist';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'org_chart_hierarchy_v'
  ) = 1, 'org_chart_hierarchy_v view must exist';

  ASSERT (
    SELECT COUNT(*) FROM pg_policies
    WHERE tablename IN ('org_chart_nodes', 'org_reporting_lines')
  ) >= 7, 'At least 7 RLS policies must exist for OrgChart tables';
END $$;

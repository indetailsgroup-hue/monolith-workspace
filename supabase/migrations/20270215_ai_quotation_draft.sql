-- ============================================================
-- Migration: AI Quotation Draft Module
-- Version:   20270215_ai_quotation_draft.sql
-- Project:   MONOLITH v18.0
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE aqd_draft_status AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE aqd_line_item_type AS ENUM (
  'PRODUCT',
  'SERVICE',
  'MATERIAL',
  'LABOR',
  'DISCOUNT',
  'CUSTOM'
);

-- ─────────────────────────────────────────────────────────────
-- 2. HELPER FUNCTION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aqd_is_enterprise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   org_members tm
    JOIN   public.organizations t  ON t.org_id = tm.org_id
    WHERE  tm.user_id  = auth.uid()
      AND  t.plan      = 'ENTERPRISE'
      AND  tm.is_active = true
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. TABLES
-- ─────────────────────────────────────────────────────────────

-- 3a. aqd_quotation_drafts
CREATE TABLE aqd_quotation_drafts (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid              NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  title            text              NOT NULL,
  customer_name    text,
  customer_email   text,
  status           aqd_draft_status  NOT NULL DEFAULT 'DRAFT',
  subtotal_thb     numeric(14,2)     NOT NULL DEFAULT 0,
  tax_rate         numeric(5,4)      NOT NULL DEFAULT 0.07,
  tax_amount_thb   numeric(14,2)     NOT NULL DEFAULT 0,
  total_thb        numeric(14,2)     NOT NULL DEFAULT 0,
  notes            text,
  generated_by_ai  boolean           NOT NULL DEFAULT false,
  ai_prompt        text,
  created_by       uuid              NOT NULL REFERENCES auth.users(id),
  reviewed_by      uuid              REFERENCES auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now()
);

-- 3b. aqd_draft_line_items
CREATE TABLE aqd_draft_line_items (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id         uuid               NOT NULL REFERENCES aqd_quotation_drafts(id) ON DELETE CASCADE,
  org_id           uuid               NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  item_type        aqd_line_item_type NOT NULL DEFAULT 'PRODUCT',
  description      text               NOT NULL,
  quantity         numeric(12,4)      NOT NULL DEFAULT 1,
  unit_price_thb   numeric(14,2)      NOT NULL DEFAULT 0,
  line_total_thb   numeric(14,2)      GENERATED ALWAYS AS (quantity * unit_price_thb) STORED,
  sort_order       integer            NOT NULL DEFAULT 0,
  notes            text,
  created_at       timestamptz        NOT NULL DEFAULT now(),
  updated_at       timestamptz        NOT NULL DEFAULT now()
);

-- 3c. aqd_generation_logs
CREATE TABLE aqd_generation_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  draft_id         uuid        REFERENCES aqd_quotation_drafts(id) ON DELETE SET NULL,
  prompt           text        NOT NULL,
  model            text        NOT NULL DEFAULT 'gpt-4o',
  tokens_used      integer,
  duration_ms      integer,
  success          boolean     NOT NULL DEFAULT false,
  error_message    text,
  created_by       uuid        NOT NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. TRIGGER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION aqd_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION aqd_recalculate_draft_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft_id    uuid;
  v_subtotal    numeric(14,2);
  v_tax_rate    numeric(5,4);
  v_tax_amount  numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_draft_id := OLD.draft_id;
  ELSE
    v_draft_id := NEW.draft_id;
  END IF;

  SELECT COALESCE(SUM(line_total_thb), 0)
  INTO   v_subtotal
  FROM   aqd_draft_line_items
  WHERE  draft_id = v_draft_id;

  SELECT tax_rate
  INTO   v_tax_rate
  FROM   aqd_quotation_drafts
  WHERE  id = v_draft_id;

  v_tax_amount := ROUND(v_subtotal * v_tax_rate, 2);

  UPDATE aqd_quotation_drafts
  SET
    subtotal_thb   = v_subtotal,
    tax_amount_thb = v_tax_amount,
    total_thb      = v_subtotal + v_tax_amount,
    updated_at     = now()
  WHERE id = v_draft_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGERS
-- ─────────────────────────────────────────────────────────────

CREATE TRIGGER aqd_drafts_updated_at
  BEFORE UPDATE ON aqd_quotation_drafts
  FOR EACH ROW EXECUTE FUNCTION aqd_set_updated_at();

CREATE TRIGGER aqd_line_items_updated_at
  BEFORE UPDATE ON aqd_draft_line_items
  FOR EACH ROW EXECUTE FUNCTION aqd_set_updated_at();

CREATE TRIGGER aqd_recalc_on_line_item_change
  AFTER INSERT OR UPDATE OR DELETE ON aqd_draft_line_items
  FOR EACH ROW EXECUTE FUNCTION aqd_recalculate_draft_totals();

-- ─────────────────────────────────────────────────────────────
-- 6. VIEW
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW aqd_draft_summary_v AS
SELECT
  org_id,
  status,
  COUNT(*)                     AS draft_count,
  COALESCE(SUM(total_thb), 0)  AS total_value_thb
FROM aqd_quotation_drafts
GROUP BY org_id, status;

-- ─────────────────────────────────────────────────────────────
-- 7. ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE aqd_quotation_drafts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aqd_draft_line_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aqd_generation_logs   ENABLE ROW LEVEL SECURITY;

-- aqd_quotation_drafts ───────────────────────────────────────

CREATE POLICY "aqd_drafts_select"
  ON aqd_quotation_drafts FOR SELECT
  USING (aqd_is_enterprise());

CREATE POLICY "aqd_drafts_insert"
  ON aqd_quotation_drafts FOR INSERT
  WITH CHECK (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

CREATE POLICY "aqd_drafts_update"
  ON aqd_quotation_drafts FOR UPDATE
  USING (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

CREATE POLICY "aqd_drafts_delete"
  ON aqd_quotation_drafts FOR DELETE
  USING (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

-- aqd_draft_line_items ───────────────────────────────────────

CREATE POLICY "aqd_line_items_select"
  ON aqd_draft_line_items FOR SELECT
  USING (aqd_is_enterprise());

CREATE POLICY "aqd_line_items_insert"
  ON aqd_draft_line_items FOR INSERT
  WITH CHECK (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

CREATE POLICY "aqd_line_items_update"
  ON aqd_draft_line_items FOR UPDATE
  USING (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

CREATE POLICY "aqd_line_items_delete"
  ON aqd_draft_line_items FOR DELETE
  USING (
    aqd_is_enterprise() AND
    org_id IN (
      SELECT om.org_id FROM org_members om
      WHERE  om.user_id         = auth.uid()
        AND  om.is_active = TRUE
        AND  om.role IN ('managing_director', 'governance')
        AND  om.is_active       = true
    )
  );

-- aqd_generation_logs ────────────────────────────────────────

CREATE POLICY "aqd_logs_select"
  ON aqd_generation_logs FOR SELECT
  USING (
    aqd_is_enterprise()
    AND org_id = get_user_org_id()
  );

CREATE POLICY "aqd_logs_insert"
  ON aqd_generation_logs FOR INSERT
  WITH CHECK (
    aqd_is_enterprise()
    AND org_id = get_user_org_id()
  );

-- ─────────────────────────────────────────────────────────────
-- 8. INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE INDEX idx_aqd_drafts_org_id      ON aqd_quotation_drafts (org_id);
CREATE INDEX idx_aqd_drafts_status      ON aqd_quotation_drafts (org_id, status);
CREATE INDEX idx_aqd_drafts_created_at  ON aqd_quotation_drafts (org_id, created_at DESC);
CREATE INDEX idx_aqd_drafts_created_by  ON aqd_quotation_drafts (created_by);

CREATE INDEX idx_aqd_line_items_draft   ON aqd_draft_line_items (draft_id);
CREATE INDEX idx_aqd_line_items_org     ON aqd_draft_line_items (org_id);

CREATE INDEX idx_aqd_logs_org_id        ON aqd_generation_logs (org_id);
CREATE INDEX idx_aqd_logs_draft_id      ON aqd_generation_logs (draft_id);

-- ─────────────────────────────────────────────────────────────
-- 9. ASSERTION BLOCK
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'aqd_quotation_drafts'
  ) = 1, 'aqd_quotation_drafts table missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'aqd_draft_line_items'
  ) = 1, 'aqd_draft_line_items table missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'aqd_generation_logs'
  ) = 1, 'aqd_generation_logs table missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.views
    WHERE  table_schema = 'public' AND table_name = 'aqd_draft_summary_v'
  ) = 1, 'aqd_draft_summary_v view missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.routines
    WHERE  routine_schema = 'public' AND routine_name = 'aqd_is_enterprise'
  ) = 1, 'aqd_is_enterprise function missing';

  ASSERT (
    SELECT COUNT(*) FROM information_schema.routines
    WHERE  routine_schema = 'public' AND routine_name = 'aqd_recalculate_draft_totals'
  ) = 1, 'aqd_recalculate_draft_totals function missing';

  RAISE NOTICE 'AI Quotation Draft migration assertions passed ✓';
END;
$$;

COMMIT;

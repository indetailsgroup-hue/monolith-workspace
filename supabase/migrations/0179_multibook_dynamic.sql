-- Migration: 0175_multibook_dynamic.sql
-- Description: Dynamic Multi-Book support for journal_entry
--              book_id เปลี่ยนจาก free-text เป็น FK ไป book_registry (per org, per tenant)
-- Depends on:  0066_ledger_engine.sql (journal_entry, journal_line)
--              0173_rls_multitenancy.sql (get_user_org_id, org_id pattern)
-- Author: indetailsgroup
-- Date: 2026-08-28
-- Spec: ACC-7 Multi-Book Isolation (extended: dynamic book registration per tenant)
--
-- Before this migration: book_id is a free text DEFAULT 'internal' — no validation
-- After  this migration:
--   1. book_registry — tenants register named books (internal/external/project-specific)
--   2. journal_entry.book_id → FK to book_registry (org-scoped)
--   3. RLS: tenant sees only their own books
--   4. RPCs: rpc_register_book, rpc_list_books, rpc_post_journal_entry (updated)
--   5. Seed default books (internal, external) for existing orgs

-- ============================================================================
-- PART 1: book_registry table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.book_registry (
  book_id      TEXT NOT NULL,           -- slug ใน org (e.g. 'internal', 'external', 'project-abc')
  org_id       UUID NOT NULL,           -- tenant owner
  display_name TEXT NOT NULL,           -- ชื่อแสดงผล
  currency     TEXT NOT NULL DEFAULT 'THB',
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- composite PK: book_id unique per org
  PRIMARY KEY (org_id, book_id),

  -- book_id slug: lowercase alphanumeric + dash/underscore only
  CONSTRAINT book_id_slug_format CHECK (book_id ~ '^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$|^[a-z0-9]$'),

  -- currency: 3-letter ISO 4217
  CONSTRAINT book_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_book_registry_org ON public.book_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_book_registry_active ON public.book_registry(org_id, is_active);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.book_registry ENABLE ROW LEVEL SECURITY;

-- read: any authenticated member of the org
CREATE POLICY "book_registry_select" ON public.book_registry
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- insert: FINANCE or ADMIN only
CREATE POLICY "book_registry_insert" ON public.book_registry
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin') OR public.is_governance_role())
  );

-- update: FINANCE or ADMIN (can rename/deactivate, cannot change org_id or book_id)
CREATE POLICY "book_registry_update" ON public.book_registry
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin') OR public.is_governance_role())
  );

-- delete: ADMIN only (hard delete only for books with no entries)
CREATE POLICY "book_registry_delete" ON public.book_registry
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('admin') OR public.is_governance_role())
  );

-- ── updated_at trigger ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_book_registry') THEN
    CREATE TRIGGER set_updated_at_book_registry
      BEFORE UPDATE ON public.book_registry
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- PART 2: Add org_id to journal_entry (needed for FK to book_registry)
-- ============================================================================

ALTER TABLE public.journal_entry
  ADD COLUMN IF NOT EXISTS org_id UUID;

-- Backfill existing entries: assign to a default org if known
-- In production: run UPDATE journal_entry SET org_id = '<known_org_id>' WHERE org_id IS NULL;
-- Then: ALTER TABLE public.journal_entry ALTER COLUMN org_id SET NOT NULL;

-- ── Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_journal_entry_org ON public.journal_entry(org_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_org_book ON public.journal_entry(org_id, book_id);

-- ── FK: journal_entry.book_id → book_registry (org-scoped) ───────────────
-- NOTE: FK references composite PK (org_id, book_id) of book_registry
-- We enforce this via CHECK CONSTRAINT + trigger instead of traditional FK
-- because org_id can be NULL during migration backfill.
-- After backfill + NOT NULL enforcement, enable the FK below.

-- (Uncomment after backfill is complete)
-- ALTER TABLE public.journal_entry
--   ADD CONSTRAINT fk_journal_entry_book
--   FOREIGN KEY (org_id, book_id) REFERENCES public.book_registry(org_id, book_id)
--   ON DELETE RESTRICT;

-- ── Trigger: validate book exists in org before insert/update ────────────
CREATE OR REPLACE FUNCTION public.trg_validate_journal_book()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip validation if org_id not yet set (migration backfill period)
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.book_registry
    WHERE org_id   = NEW.org_id
      AND book_id  = NEW.book_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'journal_entry: book_id "%" ไม่มีหรือ inactive ใน org "%" — register ก่อนใช้งาน',
      NEW.book_id, NEW.org_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_validate_book ON public.journal_entry;
CREATE TRIGGER trg_journal_validate_book
  BEFORE INSERT OR UPDATE OF book_id, org_id ON public.journal_entry
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_journal_book();

-- ============================================================================
-- PART 3: Update journal_entry RLS to include org_id
-- ============================================================================

-- Drop existing policies (from 0066)
DROP POLICY IF EXISTS journal_entry_sel ON public.journal_entry;
DROP POLICY IF EXISTS journal_entry_ins ON public.journal_entry;

-- New policies
CREATE POLICY "journal_entry_select" ON public.journal_entry
  FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.is_governance_role() OR public.has_app_role('finance'))
  );

CREATE POLICY "journal_entry_insert" ON public.journal_entry
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.is_governance_role() OR public.has_app_role('finance'))
  );

-- ============================================================================
-- PART 4: RPCs
-- ============================================================================

-- ── rpc_register_book ─────────────────────────────────────────────────────
-- Register a new book (or reactivate existing) for the caller's org.
-- Idempotent: same (org_id, book_id) → update display_name/currency only.

CREATE OR REPLACE FUNCTION public.rpc_register_book(
  p_book_id      TEXT,
  p_display_name TEXT,
  p_currency     TEXT DEFAULT 'THB',
  p_description  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_actor  TEXT;
BEGIN
  v_org_id := public.get_user_org_id();
  v_actor  := public.resolve_actor();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_register_book: unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_app_role('finance') OR public.has_app_role('admin') OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'rpc_register_book: requires FINANCE or ADMIN role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validate slug format
  IF p_book_id !~ '^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$|^[a-z0-9]$' THEN
    RAISE EXCEPTION 'rpc_register_book: book_id "%" รูปแบบไม่ถูกต้อง (ใช้ lowercase, digits, -, _ เท่านั้น)',
      p_book_id;
  END IF;

  -- Validate currency
  IF p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'rpc_register_book: currency "%" ไม่ใช่ ISO 4217', p_currency;
  END IF;

  INSERT INTO public.book_registry (book_id, org_id, display_name, currency, description, created_by)
  VALUES (p_book_id, v_org_id, p_display_name, p_currency, p_description, coalesce(v_actor, 'system'))
  ON CONFLICT (org_id, book_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    currency     = EXCLUDED.currency,
    description  = COALESCE(EXCLUDED.description, book_registry.description),
    is_active    = true,           -- reactivate if previously deactivated
    updated_at   = timezone('utc', now());

  RETURN jsonb_build_object(
    'book_id',      p_book_id,
    'org_id',       v_org_id,
    'display_name', p_display_name,
    'currency',     p_currency,
    'status',       'registered'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_book(TEXT, TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_register_book(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── rpc_list_books ────────────────────────────────────────────────────────
-- List all active books for the caller's org, with entry counts.

CREATE OR REPLACE FUNCTION public.rpc_list_books(
  p_include_inactive BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_list_books: unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(b ORDER BY b->>'book_id'), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'book_id',      br.book_id,
        'display_name', br.display_name,
        'currency',     br.currency,
        'description',  br.description,
        'is_active',    br.is_active,
        'entry_count',  COUNT(je.id),
        'created_at',   br.created_at
      ) AS b
      FROM public.book_registry br
      LEFT JOIN public.journal_entry je
        ON je.org_id  = br.org_id
        AND je.book_id = br.book_id
        AND je.status  = 'posted'
      WHERE br.org_id = v_org_id
        AND (p_include_inactive OR br.is_active)
      GROUP BY br.book_id, br.org_id, br.display_name, br.currency,
               br.description, br.is_active, br.created_at
    ) sub
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_list_books(BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_list_books(BOOLEAN) TO authenticated;

-- ── rpc_deactivate_book ───────────────────────────────────────────────────
-- Deactivate a book (soft-delete). Blocks if book has unposted (draft) entries.

CREATE OR REPLACE FUNCTION public.rpc_deactivate_book(
  p_book_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     UUID;
  v_draft_count INT;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_deactivate_book: unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_app_role('admin') OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'rpc_deactivate_book: requires ADMIN role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Block deactivation if draft entries exist
  SELECT COUNT(*) INTO v_draft_count
  FROM public.journal_entry
  WHERE org_id  = v_org_id
    AND book_id = p_book_id
    AND status  = 'draft';

  IF v_draft_count > 0 THEN
    RAISE EXCEPTION 'rpc_deactivate_book: book "%" มี % draft entries — post หรือลบก่อน deactivate',
      p_book_id, v_draft_count;
  END IF;

  UPDATE public.book_registry SET
    is_active  = false,
    updated_at = timezone('utc', now())
  WHERE org_id = v_org_id AND book_id = p_book_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_deactivate_book: book "%" ไม่พบ', p_book_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('book_id', p_book_id, 'status', 'deactivated');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_deactivate_book(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_deactivate_book(TEXT) TO authenticated;

-- ── rpc_post_journal_entry (updated — validates book in org) ──────────────
-- Extends 0066 version: adds org_id + validates book_registry membership.
-- Double-entry invariant: Σbase_debit = Σbase_credit (enforced before insert).

CREATE OR REPLACE FUNCTION public.rpc_post_journal_entry(
  p_book_id     TEXT,
  p_entry_date  DATE,
  p_description TEXT,
  p_currency    TEXT,
  p_source_ref  JSONB DEFAULT NULL,
  p_lines       JSONB DEFAULT '[]'::JSONB   -- [{account_code, debit, credit}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     UUID;
  v_actor      TEXT;
  v_entry_id   UUID;
  v_total_dr   NUMERIC := 0;
  v_total_cr   NUMERIC := 0;
  v_line       JSONB;
  v_rate       NUMERIC := 1;
  v_base_dr    NUMERIC;
  v_base_cr    NUMERIC;
BEGIN
  v_org_id := public.get_user_org_id();
  v_actor  := public.resolve_actor();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: requires FINANCE or ADMIN role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validate book exists and is active in this org
  IF NOT EXISTS (
    SELECT 1 FROM public.book_registry
    WHERE org_id   = v_org_id
      AND book_id  = p_book_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: book "%" ไม่มีหรือ inactive — เรียก rpc_register_book ก่อน',
      p_book_id;
  END IF;

  -- Validate lines not empty
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: lines ว่าง';
  END IF;

  -- Pre-validate: double-entry balanced (Σdebit = Σcredit)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_total_dr := v_total_dr + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_total_cr := v_total_cr + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  IF ROUND((v_total_dr - v_total_cr)::NUMERIC, 2) <> 0 THEN
    RAISE EXCEPTION 'rpc_post_journal_entry: ไม่ balanced — Σdebit=% ≠ Σcredit=%',
      v_total_dr, v_total_cr;
  END IF;

  -- Insert journal_entry
  INSERT INTO public.journal_entry (
    book_id, org_id, entry_date, description, status,
    currency, source_ref, created_by
  )
  VALUES (
    p_book_id, v_org_id, p_entry_date, p_description, 'posted',
    UPPER(p_currency), p_source_ref, coalesce(v_actor, 'system')
  )
  RETURNING id INTO v_entry_id;

  -- Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    -- Validate account_code exists
    IF NOT EXISTS (
      SELECT 1 FROM public.ledger_account
      WHERE code = (v_line->>'account_code') AND active = true
    ) THEN
      RAISE EXCEPTION 'rpc_post_journal_entry: account_code "%" ไม่พบหรือ inactive',
        v_line->>'account_code';
    END IF;

    v_base_dr := ROUND(COALESCE((v_line->>'debit')::NUMERIC, 0) * v_rate, 2);
    v_base_cr := ROUND(COALESCE((v_line->>'credit')::NUMERIC, 0) * v_rate, 2);

    INSERT INTO public.journal_line (
      journal_entry_id, account_code,
      debit,       credit,
      base_debit,  base_credit
    )
    VALUES (
      v_entry_id, v_line->>'account_code',
      COALESCE((v_line->>'debit')::NUMERIC, 0),
      COALESCE((v_line->>'credit')::NUMERIC, 0),
      v_base_dr, v_base_cr
    );
  END LOOP;

  RETURN jsonb_build_object(
    'entry_id',    v_entry_id,
    'book_id',     p_book_id,
    'org_id',      v_org_id,
    'entry_date',  p_entry_date,
    'total_debit', v_total_dr,
    'total_credit',v_total_cr,
    'status',      'posted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_post_journal_entry(TEXT, DATE, TEXT, TEXT, JSONB, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_post_journal_entry(TEXT, DATE, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- PART 5: Seed default books for existing orgs
-- ============================================================================

-- Seed 'internal' and 'external' books for all existing orgs.
-- Uses a DO block so it's idempotent (ON CONFLICT DO NOTHING).
DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN SELECT org_id FROM public.organizations WHERE status = 'ACTIVE'
  LOOP
    INSERT INTO public.book_registry (book_id, org_id, display_name, currency, description, created_by)
    VALUES
      ('internal', v_org.org_id, 'บัญชีภายใน (Internal)',  'THB', 'Default internal book — รายการภายในองค์กร', 'system'),
      ('external', v_org.org_id, 'บัญชีภายนอก (External)', 'THB', 'Default external book — รายการภายนอก/ลูกค้า',  'system')
    ON CONFLICT (org_id, book_id) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 6: Verification queries
-- ============================================================================

-- Check book_registry created:
-- SELECT * FROM public.book_registry LIMIT 10;

-- Check trigger is set:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'trg_journal_validate_book';

-- Test: register a new book (as finance user):
-- SELECT rpc_register_book('project-abc', 'โปรเจค ABC', 'THB', 'บัญชีแยกต่างหากสำหรับโปรเจค ABC');

-- Test: list books:
-- SELECT rpc_list_books();

-- Test: post entry to new book:
-- SELECT rpc_post_journal_entry(
--   'project-abc', CURRENT_DATE, 'ทดสอบ entry', 'THB', NULL,
--   '[
--     {"account_code":"4010","debit":0,"credit":10000},
--     {"account_code":"1020","debit":10000,"credit":0}
--   ]'::jsonb
-- );

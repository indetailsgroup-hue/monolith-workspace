-- =============================================================================
-- Migration 0176: Auto-Journal Posting on Invoice Approval
-- =============================================================================
-- Feature  : เมื่อ invoice.status เปลี่ยนเป็น 'approved' ให้ auto-post
--            double-entry journal entries โดยอัตโนมัติ
-- Trigger  : AFTER UPDATE ON invoices (status: draft/sent → approved)
-- Pattern  : DR Accounts Receivable (1200) / CR Revenue (4100) + VAT (2200)
-- Idempotent: ใช้ invoice_id dedup — ไม่ post ซ้ำ
-- Rollback : DROP TRIGGER / FUNCTION ด้านล่าง
-- =============================================================================

-- Extend invoice_status enum for approval/void workflow states
-- (must run OUTSIDE a transaction block — PostgreSQL constraint)
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'voided';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'sent';

BEGIN;

-- ── Dependency DDL (added for CI compatibility) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id  UUID    NOT NULL REFERENCES public.organizations(org_id),
  code    TEXT    NOT NULL,
  name    TEXT    NOT NULL,
  type    TEXT,
  active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (org_id, code)
);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.journal_entry
  ADD COLUMN IF NOT EXISTS org_id      UUID REFERENCES public.organizations(org_id),
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id   UUID,
  ADD COLUMN IF NOT EXISTS reversal_of UUID REFERENCES public.journal_entry(id);

ALTER TABLE public.journal_line
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.chart_of_accounts(id);

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID          NOT NULL REFERENCES public.organizations(org_id),
  invoice_id  UUID          NOT NULL REFERENCES public.invoices(invoice_id),
  description TEXT,
  quantity    NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
-- Ensure org_id exists even if invoice_line_items was pre-created by e2e stub without it
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason       TEXT,
  ADD COLUMN IF NOT EXISTS etax_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_vat_inclusive  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_by        UUID,
  ADD COLUMN IF NOT EXISTS issued_date       DATE,
  ADD COLUMN IF NOT EXISTS code              TEXT,
  ADD COLUMN IF NOT EXISTS id                UUID UNIQUE DEFAULT gen_random_uuid();

-- RLS policies for newly created tables (required by lint-rls-org-id)
CREATE POLICY "chart_of_accounts_tenant_isolation" ON public.chart_of_accounts
  FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY "chart_of_accounts_tenant_insert" ON public.chart_of_accounts
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "invoice_line_items_tenant_isolation" ON public.invoice_line_items
  FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY "invoice_line_items_tenant_insert" ON public.invoice_line_items
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- 1. เพิ่ม column tracking การ auto-post
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS auto_journal_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_journal_entry_id  UUID REFERENCES journal_entry(id);

COMMENT ON COLUMN invoices.auto_journal_posted_at IS
  'Timestamp เมื่อ auto-journal ถูก post (NULL = ยังไม่ post)';
COMMENT ON COLUMN invoices.auto_journal_entry_id IS
  'FK ไปยัง journal_entry ที่ auto-post สร้าง';

-- ---------------------------------------------------------------------------
-- 2. Helper: ดึง account_id จาก Chart of Accounts ตาม code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _get_account_id(
  p_org_id     UUID,
  p_code       TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM   chart_of_accounts
  WHERE  org_id = p_org_id
    AND  code   = p_code
  LIMIT  1;
$$;

COMMENT ON FUNCTION _get_account_id IS
  'Internal helper — ดึง account UUID จาก code (e.g., ''1200'', ''4100'')';

-- ---------------------------------------------------------------------------
-- 3. Core function: post journal สำหรับ invoice ที่ approved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_post_invoice_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id       UUID;
  v_org_id         UUID;
  v_invoice_total  NUMERIC;
  v_vat_amount     NUMERIC;
  v_net_amount     NUMERIC;
  v_ar_account_id  UUID;
  v_rev_account_id UUID;
  v_vat_account_id UUID;
  v_book_id        TEXT  := 'internal';
  v_vat_rate       NUMERIC := 0.07; -- 7% Thai VAT
  v_desc           TEXT;
BEGIN
  -- ── Guard: ทำงานเฉพาะเมื่อ status เปลี่ยนเป็น 'approved' ──────────────────
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  -- ไม่ post ซ้ำถ้าเคย post ไปแล้ว
  IF NEW.auto_journal_posted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── ดึงข้อมูล ──────────────────────────────────────────────────────────────
  v_org_id        := NEW.org_id;
  v_invoice_total := COALESCE(NEW.total, 0);

  -- คำนวณ VAT
  -- ถ้า total เป็น VAT-inclusive: net = total / 1.07, vat = total - net
  -- ถ้า total เป็น VAT-exclusive: net = total, vat = total * 0.07
  -- ใช้ column `is_vat_inclusive` ถ้ามี มิฉะนั้น default = inclusive
  IF (NEW.is_vat_inclusive IS NULL OR NEW.is_vat_inclusive = TRUE) THEN
    v_net_amount := ROUND(v_invoice_total / (1 + v_vat_rate), 2);
    v_vat_amount := v_invoice_total - v_net_amount;
  ELSE
    v_net_amount := v_invoice_total;
    v_vat_amount := ROUND(v_invoice_total * v_vat_rate, 2);
  END IF;

  -- ── ดึง account IDs ────────────────────────────────────────────────────────
  -- 1200 = ลูกหนี้การค้า (Accounts Receivable)
  -- 4100 = รายได้จากการขาย (Sales Revenue)
  -- 2200 = ภาษีมูลค่าเพิ่มที่ต้องชำระ (VAT Payable)
  v_ar_account_id  := _get_account_id(v_org_id, '1200');
  v_rev_account_id := _get_account_id(v_org_id, '4100');
  v_vat_account_id := _get_account_id(v_org_id, '2200');

  IF v_ar_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 1200 (AR) not found for org %',
      v_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_rev_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 4100 (Revenue) not found for org %',
      v_org_id
      USING ERRCODE = 'P0001';
  END IF;

  -- VAT account optional — ถ้าไม่มีให้ post net amount ทั้งหมดเข้า revenue
  IF v_vat_account_id IS NULL THEN
    v_vat_amount := 0;
    v_net_amount := v_invoice_total;
  END IF;

  -- ── สร้าง journal entry ────────────────────────────────────────────────────
  v_desc := format(
    'Auto-journal: Invoice %s approved (total %s THB)',
    NEW.code,
    v_invoice_total
  );

  INSERT INTO journal_entry (
    org_id,
    book_id,
    entry_date,
    description,
    source_type,
    source_id,
    created_by,
    status
  )
  VALUES (
    v_org_id,
    v_book_id,
    COALESCE(NEW.issued_date, CURRENT_DATE),
    v_desc,
    'invoice',          -- source_type สำหรับ audit trail
    NEW.id,             -- FK กลับไปที่ invoice
    NEW.updated_by,     -- user ที่ approve
    'posted'
  )
  RETURNING id INTO v_entry_id;

  -- ── Journal Lines ──────────────────────────────────────────────────────────
  --
  -- Pattern (VAT-inclusive invoice):
  --
  --   DR  1200  Accounts Receivable     =  total (VAT-inclusive)
  --       CR  4100  Sales Revenue       =  net amount (excl. VAT)
  --       CR  2200  VAT Payable         =  vat amount
  --
  -- Pattern (no VAT account):
  --
  --   DR  1200  Accounts Receivable     =  total
  --       CR  4100  Sales Revenue       =  total
  --

  -- Line 1: DR Accounts Receivable (full amount)
  INSERT INTO journal_line (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description
  )
  VALUES (
    v_entry_id,
    v_ar_account_id,
    v_invoice_total,
    0,
    format('AR: Invoice %s', NEW.code)
  );

  -- Line 2: CR Sales Revenue (net amount)
  INSERT INTO journal_line (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description
  )
  VALUES (
    v_entry_id,
    v_rev_account_id,
    0,
    v_net_amount,
    format('Revenue: Invoice %s', NEW.code)
  );

  -- Line 3: CR VAT Payable (ถ้า > 0)
  IF v_vat_amount > 0 AND v_vat_account_id IS NOT NULL THEN
    INSERT INTO journal_line (
      journal_entry_id,
      account_id,
      debit,
      credit,
      description
    )
    VALUES (
      v_entry_id,
      v_vat_account_id,
      0,
      v_vat_amount,
      format('VAT 7%%: Invoice %s', NEW.code)
    );
  END IF;

  -- ── ตรวจสอบ balance (DR = CR) ──────────────────────────────────────────────
  DECLARE
    v_total_debit  NUMERIC;
    v_total_credit NUMERIC;
  BEGIN
    SELECT
      COALESCE(SUM(debit),  0),
      COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_line
    WHERE journal_entry_id = v_entry_id;

    IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
      RAISE EXCEPTION
        'Double-entry balance violation: debit=% credit=% for entry %',
        v_total_debit, v_total_credit, v_entry_id
        USING ERRCODE = 'P0002';
    END IF;
  END;

  -- ── อัปเดต invoice: mark as posted ────────────────────────────────────────
  NEW.auto_journal_posted_at := NOW();
  NEW.auto_journal_entry_id  := v_entry_id;

  RAISE LOG
    'Auto-journal posted: invoice=% entry=% org=% total=%',
    NEW.id, v_entry_id, v_org_id, v_invoice_total;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log แล้ว re-raise เพื่อให้ transaction rollback
    RAISE WARNING
      'Auto-journal FAILED for invoice % (org %): %',
      NEW.id, NEW.org_id, SQLERRM;
    RAISE;
END;
$$;

COMMENT ON FUNCTION fn_auto_post_invoice_journal IS
  'Trigger function: auto-post double-entry journal เมื่อ invoice ถูก approve';

-- ---------------------------------------------------------------------------
-- 4. สร้าง Trigger บน invoices table
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_post_invoice_journal ON invoices;

CREATE TRIGGER trg_auto_post_invoice_journal
  BEFORE UPDATE OF status      -- fire เฉพาะเมื่อ status เปลี่ยน
  ON invoices
  FOR EACH ROW
  WHEN (
    OLD.status <> 'approved'   -- ไม่ใช่ approved อยู่แล้ว
    AND NEW.status = 'approved' -- กำลังเปลี่ยนเป็น approved
    AND NEW.auto_journal_posted_at IS NULL  -- ยังไม่เคย post
  )
  EXECUTE FUNCTION fn_auto_post_invoice_journal();

COMMENT ON TRIGGER trg_auto_post_invoice_journal ON invoices IS
  'Auto-post journal entry เมื่อ invoice.status → approved (idempotent)';

-- ---------------------------------------------------------------------------
-- 5. Trigger สำหรับ Credit Note / Void (Reversal)
-- ---------------------------------------------------------------------------
-- เมื่อ invoice ที่ approved ถูก void หรือออก credit note
-- ให้ post reversal journal (negate ทุก line)

CREATE OR REPLACE FUNCTION fn_auto_reverse_invoice_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reversal_id UUID;
  v_desc        TEXT;
BEGIN
  -- ── Guard: ทำงานเฉพาะเมื่อ approved → voided/cancelled ───────────────────
  IF OLD.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('voided', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.auto_journal_entry_id IS NULL THEN
    RETURN NEW; -- ไม่มี journal ให้ reverse
  END IF;

  -- ── สร้าง reversal entry ───────────────────────────────────────────────────
  v_desc := format(
    'Reversal: Invoice %s voided/cancelled',
    OLD.code
  );

  INSERT INTO journal_entry (
    org_id,
    book_id,
    entry_date,
    description,
    source_type,
    source_id,
    reversal_of,
    created_by,
    status
  )
  SELECT
    org_id,
    book_id,
    CURRENT_DATE,
    v_desc,
    'invoice_reversal',
    OLD.id,
    OLD.auto_journal_entry_id,  -- FK กลับไปที่ entry เดิม
    NEW.updated_by,
    'posted'
  FROM journal_entry
  WHERE id = OLD.auto_journal_entry_id
  RETURNING id INTO v_reversal_id;

  -- ── Copy lines แต่ swap debit/credit ─────────────────────────────────────
  INSERT INTO journal_line (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description
  )
  SELECT
    v_reversal_id,
    account_id,
    credit,           -- swap: credit → debit
    debit,            -- swap: debit → credit
    'REVERSAL: ' || description
  FROM journal_line
  WHERE journal_entry_id = OLD.auto_journal_entry_id;

  RAISE LOG
    'Reversal journal posted: original=% reversal=% invoice=%',
    OLD.auto_journal_entry_id, v_reversal_id, OLD.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_auto_reverse_invoice_journal IS
  'Trigger function: auto-reverse journal เมื่อ approved invoice ถูก void/cancel';

DROP TRIGGER IF EXISTS trg_auto_reverse_invoice_journal ON invoices;

CREATE TRIGGER trg_auto_reverse_invoice_journal
  AFTER UPDATE OF status
  ON invoices
  FOR EACH ROW
  WHEN (
    OLD.status = 'approved'
    AND NEW.status IN ('voided', 'cancelled')
  )
  EXECUTE FUNCTION fn_auto_reverse_invoice_journal();

-- ---------------------------------------------------------------------------
-- 6. RPC: rpc_approve_invoice — approve invoice พร้อม validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_invoice(
  p_invoice_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice       invoices%ROWTYPE;
  v_org_id        UUID;
  v_line_count    INT;
  v_result        JSON;
BEGIN
  -- ── ดึง invoice ────────────────────────────────────────────────────────────
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
    AND org_id = get_user_org_id(); -- RLS: org isolation

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id
      USING ERRCODE = 'P0003';
  END IF;

  -- ── Validate ───────────────────────────────────────────────────────────────
  IF v_invoice.status = 'approved' THEN
    RAISE EXCEPTION 'Invoice % is already approved', p_invoice_id
      USING ERRCODE = 'P0004';
  END IF;

  IF v_invoice.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION
      'Invoice % cannot be approved from status %',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0005';
  END IF;

  IF COALESCE(v_invoice.total, 0) <= 0 THEN
    RAISE EXCEPTION 'Invoice % has zero or negative total', p_invoice_id
      USING ERRCODE = 'P0006';
  END IF;

  -- ตรวจสอบว่ามี line items
  SELECT COUNT(*) INTO v_line_count
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id
    AND org_id = get_user_org_id();

  IF v_line_count = 0 THEN
    RAISE EXCEPTION
      'Invoice % has no line items — cannot approve',
      p_invoice_id
      USING ERRCODE = 'P0007';
  END IF;

  -- ── อัปเดต status → approved ───────────────────────────────────────────────
  -- Trigger `trg_auto_post_invoice_journal` จะทำงานอัตโนมัติ
  UPDATE invoices
  SET
    status     = 'approved',
    approved_at = NOW(),
    updated_by  = auth.uid()
  WHERE id = p_invoice_id
    AND org_id = get_user_org_id()
  RETURNING
    id,
    code,
    status,
    total,
    auto_journal_entry_id,
    auto_journal_posted_at
  INTO
    v_invoice.id,
    v_invoice.code,
    v_invoice.status,
    v_invoice.total,
    v_invoice.auto_journal_entry_id,
    v_invoice.auto_journal_posted_at;

  -- ── สร้าง response ─────────────────────────────────────────────────────────
  v_result := json_build_object(
    'success',                true,
    'invoice_id',             v_invoice.id,
    'invoice_code',           v_invoice.code,
    'status',                 v_invoice.status,
    'total',                  v_invoice.total,
    'journal_entry_id',       v_invoice.auto_journal_entry_id,
    'journal_posted_at',      v_invoice.auto_journal_posted_at
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error',   SQLERRM,
      'code',    SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION rpc_approve_invoice IS
  'Approve invoice + auto-post journal (DR AR / CR Revenue + VAT). Idempotent.';

-- ---------------------------------------------------------------------------
-- 7. RPC: rpc_void_invoice — void พร้อม reversal journal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_void_invoice(
  p_invoice_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
    AND org_id = get_user_org_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;

  -- eTax invoices ไม่สามารถ void ได้ — ต้องออก credit note แทน
  IF v_invoice.etax_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Invoice % has been submitted as eTax — issue credit note instead',
      p_invoice_id
      USING ERRCODE = 'P0008';
  END IF;

  UPDATE invoices
  SET
    status     = 'voided',
    voided_at  = NOW(),
    void_reason = p_reason,
    updated_by  = auth.uid()
  WHERE id = p_invoice_id
    AND org_id = get_user_org_id();

  RETURN json_build_object(
    'success',    true,
    'invoice_id', p_invoice_id,
    'status',     'voided'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_void_invoice IS
  'Void invoice + auto-post reversal journal. eTax invoices cannot be voided.';

-- ---------------------------------------------------------------------------
-- 8. View: v_invoice_journal_status — ดู status ของ auto-journal ทุก invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_invoice_journal_status AS
SELECT
  i.id              AS invoice_id,
  i.org_id,
  i.code            AS invoice_code,
  i.status          AS invoice_status,
  i.total,
  i.issued_date,
  i.auto_journal_posted_at,
  i.auto_journal_entry_id,
  je.status         AS journal_status,
  je.entry_date     AS journal_date,
  CASE
    WHEN i.status = 'approved' AND i.auto_journal_entry_id IS NOT NULL
      THEN 'posted'
    WHEN i.status = 'approved' AND i.auto_journal_entry_id IS NULL
      THEN 'pending'
    WHEN i.status IN ('voided', 'cancelled')
      THEN 'reversed'
    ELSE 'not_required'
  END               AS journal_posting_status
FROM invoices i
LEFT JOIN journal_entry je ON je.id = i.auto_journal_entry_id
WHERE i.org_id = get_user_org_id();  -- RLS via view

COMMENT ON VIEW v_invoice_journal_status IS
  'ตรวจสอบ journal posting status ของทุก invoice ใน org';

-- ---------------------------------------------------------------------------
-- 9. Index สำหรับ performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_auto_journal
  ON invoices (org_id, auto_journal_entry_id)
  WHERE auto_journal_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entry_source
  ON journal_entry (org_id, source_type, source_id)
  WHERE source_type = 'invoice';

-- ---------------------------------------------------------------------------
-- 10. Grant permissions
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION rpc_approve_invoice  TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_void_invoice     TO authenticated;
GRANT SELECT  ON v_invoice_journal_status      TO authenticated;
GRANT EXECUTE ON FUNCTION _get_account_id      TO authenticated;

-- ---------------------------------------------------------------------------
-- Rollback Instructions
-- ---------------------------------------------------------------------------
-- To rollback this migration:
--
--   DROP TRIGGER IF EXISTS trg_auto_post_invoice_journal    ON invoices;
--   DROP TRIGGER IF EXISTS trg_auto_reverse_invoice_journal ON invoices;
--   DROP FUNCTION IF EXISTS fn_auto_post_invoice_journal();
--   DROP FUNCTION IF EXISTS fn_auto_reverse_invoice_journal();
--   DROP FUNCTION IF EXISTS rpc_approve_invoice(UUID);
--   DROP FUNCTION IF EXISTS rpc_void_invoice(UUID, TEXT);
--   DROP FUNCTION IF EXISTS _get_account_id(UUID, TEXT);
--   DROP VIEW IF EXISTS v_invoice_journal_status;
--   ALTER TABLE invoices
--     DROP COLUMN IF EXISTS auto_journal_posted_at,
--     DROP COLUMN IF EXISTS auto_journal_entry_id;

COMMIT;

-- ============================================================================
-- Migration  : 0177_auto_receipt_on_payment_confirm.sql
-- Feature    : Auto-post double-entry journal เมื่อ payment ถูก confirm บน invoice
-- Pattern    : DR Cash/Bank (1100) / CR Accounts Receivable (1200)
-- Scope      : invoices table (plural) — accounting module ใหม่
-- Depends    : 0066_ledger_engine (journal_entry, journal_line, chart_of_accounts)
--              0075_receivables (receivable accounts)
--              0172_jobs_quotations_invoices (invoices, payment_method enum)
--              0175_multibook_dynamic (book_registry)
--              0176_auto_journal_on_approval (_get_account_id, journal_entry schema)
--              20260828_multi_tenant_schema (org_id columns, get_user_org_id)
-- Rollback   : DROP TRIGGER, DROP TABLE, DROP FUNCTION ด้านล่าง
-- Author     : Monolith Accounting Module
-- Date       : 2026-08-28
-- ============================================================================

-- ============================================================================
-- 1. เพิ่ม columns ให้ invoices เพื่อ track payment progress
-- ============================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount  NUMERIC(12,2),            -- คำนวณจาก total - paid_amount
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;              -- timestamp เมื่อ fully paid

-- Computed default: remaining_amount = total - paid_amount ถ้าเพิ่ง migrate
UPDATE invoices
SET remaining_amount = COALESCE(total, 0) - COALESCE(paid_amount, 0)
WHERE remaining_amount IS NULL;

ALTER TABLE invoices
  ALTER COLUMN remaining_amount SET DEFAULT 0,
  ALTER COLUMN remaining_amount SET NOT NULL;

COMMENT ON COLUMN invoices.paid_amount      IS 'ยอดชำระสะสม (ผลรวมจาก payment_receipt)';
COMMENT ON COLUMN invoices.remaining_amount IS 'ยอดค้างชำระ = total - paid_amount';
COMMENT ON COLUMN invoices.paid_at          IS 'วันที่ชำระครบ (NULL = ยังไม่ครบ)';

-- ============================================================================
-- 2. สร้าง payment_receipt table — รับการบันทึกชำระเงินแต่ละครั้ง
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_receipt (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL,                        -- multi-tenant isolation
  invoice_id      UUID         NOT NULL
                    REFERENCES invoices(invoice_id) ON DELETE RESTRICT, -- ห้ามลบ invoice ที่มีรับชำระแล้ว
  amount          NUMERIC(12,2) NOT NULL
                    CONSTRAINT chk_receipt_amount_positive CHECK (amount > 0),
  method          payment_method NOT NULL DEFAULT 'TRANSFER',
  reference_no    TEXT,                                         -- เลขที่ใบสลิป / เลขโอน
  bank_account    TEXT,                                         -- บัญชีธนาคารที่รับโอน
  notes           TEXT,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  journal_entry_id UUID        REFERENCES journal_entry(id),   -- FK หลัง post journal
  created_by      UUID         NOT NULL DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Idempotency guard: ป้องกัน double-post สำหรับ reference เดียวกันบน invoice เดียวกัน
  CONSTRAINT uq_receipt_invoice_reference
    UNIQUE NULLS NOT DISTINCT (invoice_id, reference_no)
);

CREATE INDEX IF NOT EXISTS idx_payment_receipt_invoice ON payment_receipt(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_org     ON payment_receipt(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_created ON payment_receipt(created_at DESC);

COMMENT ON TABLE  payment_receipt IS
  'บันทึกการรับชำระเงินแต่ละครั้งสำหรับ invoice (accounting module ใหม่)';
COMMENT ON COLUMN payment_receipt.journal_entry_id IS
  'FK ไปยัง journal_entry ที่ auto-post สร้าง (DR 1100 / CR 1200)';
COMMENT ON COLUMN payment_receipt.reference_no IS
  'เลขที่อ้างอิงธุรกรรม เช่น เลขโอน, เลขเช็ค — ใช้ตรวจ idempotency';

-- ============================================================================
-- 3. Trigger Function: fn_post_payment_receipt_journal
--    ทำงานเมื่อ INSERT payment_receipt → auto-post DR 1100 / CR 1200
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_post_payment_receipt_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv               invoices%ROWTYPE;
  v_org_id            UUID;
  v_book_id           TEXT;
  v_cash_account_id   UUID;
  v_ar_account_id     UUID;
  v_entry_id          UUID;
  v_new_paid          NUMERIC(12,2);
  v_new_remaining     NUMERIC(12,2);
  v_new_status        invoice_status;
  v_desc              TEXT;
  v_total_debit       NUMERIC(12,2);
  v_total_credit      NUMERIC(12,2);
BEGIN
  -- ── 3.1 ดึง invoice ────────────────────────────────────────────────────────
  SELECT * INTO v_inv FROM invoices WHERE invoice_id = NEW.invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_receipt trigger: invoice % not found', NEW.invoice_id;
  END IF;

  -- ── 3.2 ตรวจสถานะ invoice ──────────────────────────────────────────────────
  IF v_inv.status IN ('PAID'::invoice_status, 'CANCELLED'::invoice_status) THEN
    RAISE EXCEPTION
      'Cannot record payment: invoice % has status %. Must be PENDING or PARTIAL.',
      v_inv.invoice_id, v_inv.status;
  END IF;

  -- ── 3.3 กำหนด org_id และ book_id ──────────────────────────────────────────
  v_org_id  := COALESCE(NEW.org_id, v_inv.org_id);
  NEW.org_id := v_org_id;  -- ถ้า INSERT ไม่ได้ส่ง org_id ให้ดึงจาก invoice

  -- ดึง book_id จาก book_registry (default = 'internal')
  SELECT book_id INTO v_book_id
  FROM   book_registry
  WHERE  org_id = v_org_id
    AND  is_default = true
  LIMIT  1;
  v_book_id := COALESCE(v_book_id, 'internal');

  -- ── 3.4 ดึง account IDs (1100 Cash/Bank, 1200 AR) ─────────────────────────
  v_cash_account_id := _get_account_id(v_org_id, '1100');
  v_ar_account_id   := _get_account_id(v_org_id, '1200');

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 1100 (Cash/Bank) not found for org %', v_org_id;
  END IF;

  IF v_ar_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 1200 (AR) not found for org %', v_org_id;
  END IF;

  -- ── 3.5 สร้าง Journal Entry header ────────────────────────────────────────
  v_desc := format(
    'Auto-journal: Payment receipt for invoice %s (amount %s THB, method %s)',
    v_inv.invoice_code,
    NEW.amount,
    NEW.method
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
    COALESCE(NEW.received_at::DATE, CURRENT_DATE),
    v_desc,
    'payment_receipt',    -- source_type สำหรับ audit trail
    NEW.id,               -- FK กลับไปที่ payment_receipt
    NEW.created_by,
    'posted'
  )
  RETURNING id INTO v_entry_id;

  -- ── 3.6 สร้าง Journal Lines ─────────────────────────────────────────────────
  --
  -- Pattern:
  --   DR  1100  Cash/Bank                = amount (รับเงินเข้า)
  --       CR  1200  Accounts Receivable  = amount (ล้าง AR ที่ตั้งไว้ตอน approve)
  --
  -- Line 1: DR Cash/Bank
  INSERT INTO journal_line (
    journal_entry_id,
    account_id,
    debit,
    credit,
    description
  )
  VALUES (
    v_entry_id,
    v_cash_account_id,
    NEW.amount,
    0,
    format('Cash received: Invoice %s', v_inv.invoice_code)
  );

  -- Line 2: CR Accounts Receivable
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
    0,
    NEW.amount,
    format('AR cleared: Invoice %s', v_inv.invoice_code)
  );

  -- ── 3.7 ตรวจสอบ double-entry balance ──────────────────────────────────────
  SELECT
    COALESCE(SUM(debit),  0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_line
  WHERE journal_entry_id = v_entry_id;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION
      'Double-entry balance violation: debit=% credit=% for entry %',
      v_total_debit, v_total_credit, v_entry_id;
  END IF;

  -- ── 3.8 อัปเดต journal_entry_id กลับไปยัง payment_receipt ────────────────
  NEW.journal_entry_id := v_entry_id;

  -- ── 3.9 อัปเดต invoice: paid_amount, remaining_amount, status ─────────────
  SELECT COALESCE(SUM(amount), 0) + NEW.amount
  INTO   v_new_paid
  FROM   payment_receipt
  WHERE  invoice_id = NEW.invoice_id;

  v_new_remaining := GREATEST(0, COALESCE(v_inv.total, 0) - v_new_paid);

  v_new_status := CASE
    WHEN v_new_remaining <= 0.005 THEN 'PAID'::invoice_status       -- ชำระครบ (tolerance 0.5 สตางค์)
    WHEN v_new_paid > 0           THEN 'PARTIAL'::invoice_status    -- ชำระบางส่วน
    ELSE v_inv.status
  END;

  UPDATE invoices SET
    paid_amount      = v_new_paid,
    remaining_amount = v_new_remaining,
    status           = v_new_status,
    paid_at          = CASE WHEN v_new_status = 'PAID'::invoice_status THEN now() ELSE NULL END,
    updated_at       = now()
  WHERE invoice_id = NEW.invoice_id;

  RAISE LOG
    'payment_receipt: posted journal=% invoice=% amount=% new_status=%',
    v_entry_id, NEW.invoice_id, NEW.amount, v_new_status;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING
    'fn_post_payment_receipt_journal FAILED for invoice % receipt %: %',
    NEW.invoice_id, NEW.id, SQLERRM;
  RAISE;
END;
$$;

COMMENT ON FUNCTION fn_post_payment_receipt_journal() IS
  'Trigger function: auto-post double-entry journal DR 1100 / CR 1200 เมื่อ payment_receipt ถูก insert';

-- ============================================================================
-- 4. สร้าง Trigger บน payment_receipt table
-- ============================================================================

DROP TRIGGER IF EXISTS trg_post_payment_receipt_journal ON payment_receipt;

CREATE TRIGGER trg_post_payment_receipt_journal
  BEFORE INSERT                        -- BEFORE เพื่อให้ set NEW.journal_entry_id ได้
  ON payment_receipt
  FOR EACH ROW
  EXECUTE FUNCTION fn_post_payment_receipt_journal();

COMMENT ON TRIGGER trg_post_payment_receipt_journal ON payment_receipt IS
  'Auto-post journal entry DR 1100 / CR 1200 เมื่อมีการ insert payment_receipt (idempotent by reference_no)';

-- ============================================================================
-- 5. RLS บน payment_receipt
-- ============================================================================

ALTER TABLE payment_receipt ENABLE ROW LEVEL SECURITY;

-- Finance/Admin สามารถอ่านภายใน org ตัวเอง
CREATE POLICY "receipt_select_own_org"
  ON payment_receipt FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id());

-- Finance/Admin เท่านั้นที่ insert ได้ (และต้องอยู่ใน org เดียวกัน)
CREATE POLICY "receipt_insert_finance_admin"
  ON payment_receipt FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = get_user_org_id()
    AND (
      has_app_role('finance')
      OR has_app_role('admin')
      OR is_governance_role()
    )
  );

-- ห้าม UPDATE/DELETE (immutable ledger principle)
-- การยกเลิกต้องทำผ่าน rpc_void_payment_receipt ที่สร้าง reversal entry แทน

-- ============================================================================
-- 6. RPC: rpc_confirm_payment
--    บันทึกการรับชำระเงิน + auto-post journal (ผ่าน trigger)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_confirm_payment(
  p_invoice_id   UUID,
  p_amount       NUMERIC,
  p_method       payment_method DEFAULT 'TRANSFER',
  p_reference_no TEXT           DEFAULT NULL,
  p_bank_account TEXT           DEFAULT NULL,
  p_notes        TEXT           DEFAULT NULL,
  p_received_at  TIMESTAMPTZ    DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id        UUID;
  v_inv           invoices%ROWTYPE;
  v_receipt_id    UUID;
  v_new_paid      NUMERIC(12,2);
  v_new_remaining NUMERIC(12,2);
  v_new_status    invoice_status;
BEGIN
  -- ── 6.1 Authorization ──────────────────────────────────────────────────────
  IF NOT (
    has_app_role('finance')
    OR has_app_role('admin')
    OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: rpc_confirm_payment requires FINANCE or ADMIN role';
  END IF;

  -- ── 6.2 ดึง org_id จาก session ────────────────────────────────────────────
  v_org_id := get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: user is not a member of any organization';
  END IF;

  -- ── 6.3 ตรวจสอบ invoice ────────────────────────────────────────────────────
  SELECT * INTO v_inv
  FROM   invoices
  WHERE  invoice_id = p_invoice_id
    AND  org_id     = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;

  IF v_inv.status IN ('PAID'::invoice_status, 'CANCELLED'::invoice_status) THEN
    RAISE EXCEPTION
      'Cannot confirm payment: invoice % has status %. Expected: PENDING or PARTIAL.',
      p_invoice_id, v_inv.status;
  END IF;

  -- ── 6.4 ตรวจสอบยอด ────────────────────────────────────────────────────────
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive, got %', p_amount;
  END IF;

  IF p_amount > COALESCE(v_inv.remaining_amount, v_inv.total) + 0.005 THEN
    RAISE EXCEPTION
      'Payment amount % exceeds remaining balance % for invoice %',
      p_amount, v_inv.remaining_amount, p_invoice_id;
  END IF;

  -- ── 6.5 Insert payment_receipt (trigger จะ post journal อัตโนมัติ) ─────────
  INSERT INTO payment_receipt (
    org_id,
    invoice_id,
    amount,
    method,
    reference_no,
    bank_account,
    notes,
    received_at,
    created_by
  )
  VALUES (
    v_org_id,
    p_invoice_id,
    p_amount,
    p_method,
    p_reference_no,
    p_bank_account,
    p_notes,
    p_received_at,
    auth.uid()
  )
  RETURNING id INTO v_receipt_id;

  -- ── 6.6 ดึงข้อมูล invoice หลัง trigger ────────────────────────────────────
  SELECT paid_amount, remaining_amount, status
  INTO   v_new_paid, v_new_remaining, v_new_status
  FROM   invoices
  WHERE  invoice_id = p_invoice_id;

  -- ── 6.7 Return result ──────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'receipt_id',        v_receipt_id,
    'invoice_id',        p_invoice_id,
    'invoice_code',      v_inv.invoice_code,
    'amount_paid',       p_amount,
    'total_paid',        v_new_paid,
    'remaining_amount',  v_new_remaining,
    'invoice_status',    v_new_status,
    'method',            p_method,
    'reference_no',      p_reference_no,
    'received_at',       p_received_at
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION
      'Duplicate payment: reference_no "%" already recorded for invoice %',
      p_reference_no, p_invoice_id;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION rpc_confirm_payment(UUID, NUMERIC, payment_method, TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
  'บันทึกการรับชำระเงินบน invoice + auto-post DR 1100 / CR 1200 journal (FINANCE/ADMIN only)';

-- ============================================================================
-- 7. RPC: rpc_list_payment_receipts
--    ดึงรายการรับชำระทั้งหมดของ invoice พร้อม journal reference
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_list_payment_receipts(
  p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  -- Authorization
  IF NOT (
    has_app_role('finance') OR has_app_role('admin')
    OR has_app_role('designer') OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: rpc_list_payment_receipts requires at least DESIGNER role';
  END IF;

  v_org_id := get_user_org_id();

  -- ตรวจว่า invoice อยู่ใน org ของ user
  IF NOT EXISTS (
    SELECT 1 FROM invoices
    WHERE invoice_id = p_invoice_id AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'receipt_id',        pr.id,
      'amount',            pr.amount,
      'method',            pr.method,
      'reference_no',      pr.reference_no,
      'bank_account',      pr.bank_account,
      'notes',             pr.notes,
      'received_at',       pr.received_at,
      'journal_entry_id',  pr.journal_entry_id,
      'created_by',        pr.created_by,
      'created_at',        pr.created_at
    )
    ORDER BY pr.received_at ASC
  )
  INTO v_result
  FROM payment_receipt pr
  WHERE pr.invoice_id = p_invoice_id
    AND pr.org_id     = v_org_id;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION rpc_list_payment_receipts(UUID) IS
  'ดึงรายการรับชำระทั้งหมดของ invoice พร้อม journal_entry reference';

-- ============================================================================
-- 8. RPC: rpc_void_payment_receipt
--    ยกเลิก payment receipt ด้วยการสร้าง reversal journal entry
--    (immutable ledger: ไม่ DELETE แต่สร้าง reversal)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_void_payment_receipt(
  p_receipt_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id        UUID;
  v_receipt       payment_receipt%ROWTYPE;
  v_inv           invoices%ROWTYPE;
  v_reversal_id   UUID;
  v_new_paid      NUMERIC(12,2);
  v_new_remaining NUMERIC(12,2);
  v_new_status    invoice_status;
BEGIN
  -- Authorization: Admin only สำหรับ void
  IF NOT (has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: rpc_void_payment_receipt requires ADMIN role';
  END IF;

  v_org_id := get_user_org_id();

  -- ดึง receipt
  SELECT * INTO v_receipt
  FROM   payment_receipt
  WHERE  id     = p_receipt_id
    AND  org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment receipt % not found or access denied', p_receipt_id;
  END IF;

  IF v_receipt.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Payment receipt % has no journal entry to reverse', p_receipt_id;
  END IF;

  -- ดึง invoice
  SELECT * INTO v_inv FROM invoices WHERE invoice_id = v_receipt.invoice_id;

  -- สร้าง reversal journal entry (สลับ debit/credit)
  INSERT INTO journal_entry (
    org_id,
    book_id,
    entry_date,
    description,
    source_type,
    source_id,
    created_by,
    status,
    reversal_of
  )
  SELECT
    org_id,
    book_id,
    CURRENT_DATE,
    format('REVERSAL: %s | Reason: %s',
      description,
      COALESCE(p_reason, 'Voided by admin')
    ),
    'payment_void',
    p_receipt_id,
    auth.uid(),
    'posted',
    v_receipt.journal_entry_id
  FROM journal_entry
  WHERE id = v_receipt.journal_entry_id
  RETURNING id INTO v_reversal_id;

  -- สร้าง reversed journal lines (สลับ debit ↔ credit)
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
    credit,     -- สลับ: credit → debit
    debit,      -- สลับ: debit  → credit
    format('REVERSAL: %s', description)
  FROM journal_line
  WHERE journal_entry_id = v_receipt.journal_entry_id;

  -- อัปเดต invoice: หัก paid_amount กลับ
  v_new_paid      := GREATEST(0, COALESCE(v_inv.paid_amount, 0) - v_receipt.amount);
  v_new_remaining := GREATEST(0, COALESCE(v_inv.total, 0) - v_new_paid);

  v_new_status := CASE
    WHEN v_new_paid <= 0             THEN 'PENDING'::invoice_status    -- กลับไป PENDING
    WHEN v_new_remaining > 0.005     THEN 'PARTIAL'::invoice_status    -- ยังค้างอยู่
    ELSE v_inv.status
  END;

  UPDATE invoices SET
    paid_amount      = v_new_paid,
    remaining_amount = v_new_remaining,
    status           = v_new_status,
    paid_at          = NULL,
    updated_at       = now()
  WHERE invoice_id = v_receipt.invoice_id;

  RETURN jsonb_build_object(
    'voided_receipt_id',  p_receipt_id,
    'reversal_entry_id',  v_reversal_id,
    'invoice_id',         v_receipt.invoice_id,
    'amount_reversed',    v_receipt.amount,
    'new_paid_amount',    v_new_paid,
    'new_remaining',      v_new_remaining,
    'new_invoice_status', v_new_status
  );
END;
$$;

COMMENT ON FUNCTION rpc_void_payment_receipt(UUID, TEXT) IS
  'ยกเลิก payment receipt ด้วย reversal journal entry (ADMIN only, immutable ledger)';

-- ============================================================================
-- 9. View: v_invoice_payment_status
--    แสดงสถานะการชำระเงินของ invoice ทั้งหมดพร้อม breakdown
-- ============================================================================

CREATE OR REPLACE VIEW v_invoice_payment_status AS
SELECT
  i.invoice_id,
  i.invoice_code,
  i.org_id,
  i.status                                          AS invoice_status,
  COALESCE(i.total, 0)                              AS total_amount,
  COALESCE(i.paid_amount, 0)                        AS paid_amount,
  COALESCE(i.remaining_amount, i.total)             AS remaining_amount,
  COALESCE(i.paid_amount, 0) / NULLIF(i.total, 0)  AS payment_pct,
  i.due_date,
  i.paid_at,
  CASE
    WHEN i.status = 'PAID'                          THEN 'FULLY_PAID'
    WHEN COALESCE(i.paid_amount, 0) > 0             THEN 'PARTIAL'
    WHEN i.due_date < CURRENT_DATE
      AND i.status NOT IN ('PAID', 'CANCELLED')     THEN 'OVERDUE'
    ELSE 'PENDING'
  END                                               AS payment_state,
  COUNT(pr.id)::INT                                 AS receipt_count,
  MAX(pr.received_at)                               AS last_payment_at

FROM invoices i
LEFT JOIN payment_receipt pr
  ON pr.invoice_id = i.invoice_id
 AND pr.org_id     = i.org_id

WHERE i.org_id = get_user_org_id()   -- RLS ผ่าน view

GROUP BY
  i.invoice_id, i.invoice_code, i.org_id, i.status,
  i.total, i.paid_amount, i.remaining_amount,
  i.due_date, i.paid_at;

COMMENT ON VIEW v_invoice_payment_status IS
  'สถานะการชำระเงินของ invoice พร้อม payment_pct และ payment_state (RLS ผ่าน get_user_org_id)';

-- ============================================================================
-- 10. Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_confirm_payment(UUID, NUMERIC, payment_method, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_list_payment_receipts(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_void_payment_receipt(UUID, TEXT)
  TO authenticated;

GRANT SELECT ON v_invoice_payment_status TO authenticated;

-- ============================================================================
-- 11. Index เพิ่มเติมสำหรับ performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_paid_amount
  ON invoices(paid_amount)
  WHERE paid_amount > 0;

CREATE INDEX IF NOT EXISTS idx_invoices_due_unpaid
  ON invoices(due_date, status)
  WHERE status NOT IN ('PAID', 'CANCELLED');

-- ============================================================================
-- END OF MIGRATION 0177
-- ============================================================================
--
-- Summary:
--   TABLE   : payment_receipt (with org_id RLS + idempotency constraint)
--   TRIGGER : trg_post_payment_receipt_journal → fn_post_payment_receipt_journal
--             → DR 1100 Cash/Bank / CR 1200 AR (auto-post on INSERT)
--   RPC     : rpc_confirm_payment       — บันทึกรับชำระ + trigger journal
--   RPC     : rpc_list_payment_receipts — ดู receipts ของ invoice
--   RPC     : rpc_void_payment_receipt  — ยกเลิก receipt ด้วย reversal entry (ADMIN)
--   VIEW    : v_invoice_payment_status  — dashboard สถานะชำระเงิน (RLS)
--   COLUMNS : invoices.paid_amount, remaining_amount, paid_at (ADD IF NOT EXISTS)
--
-- Payment cycle complete:
--   invoice approved  → 0176 trigger → DR 1200 AR / CR 4100 Revenue + 2200 VAT
--   payment confirmed → 0177 trigger → DR 1100 Cash / CR 1200 AR  ← closes AR
-- ============================================================================

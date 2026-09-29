-- ============================================================================
-- Migration  : 0181_etax_auto_submit.sql
-- Feature    : e-Tax Integration — Auto-submit eTax document when invoice is paid
-- Trigger    : invoices.status changes to 'paid'
-- Tables     : etax_submissions  — บันทึก e-Tax document ที่ส่งหรือรอส่ง
-- Views      : v_etax_submissions — ดู submission status ต่อ org
-- RPCs       : rpc_etax_auto_submit        — สร้าง / queue etax document
--              rpc_etax_list_submissions    — ดูรายการ submission ของ org
--              rpc_etax_mark_submitted      — อัปเดต status หลัง API call สำเร็จ
--              rpc_etax_mark_failed         — บันทึก failure + error detail
--              rpc_etax_retry_submission    — reset failed → queued เพื่อ retry
-- Depends    : 0172_jobs_quotations_invoices (invoices)
--              0177_auto_receipt_on_payment_confirm (paid_at, paid_amount)
--              20260828_multi_tenant_schema (org_id, get_user_org_id)
--              src/tax/etax.ts — VAT calculation (composeFromNet, splitInclusive)
--                               Invoice number format (formatInvoiceNumber)
-- Rollback   : DROP TABLE etax_submissions CASCADE;
--              DROP FUNCTION ... CASCADE;
-- Author     : Monolith Accounting Module
-- Date       : 2026-08-28
--
-- e-Tax Document Types (Thai RD e-Tax Invoice standard):
--   T01 — ใบกำกับภาษีแบบเต็ม (Full VAT Invoice)
--   T02 — ใบลดหนี้ (Debit Note)
--   T03 — ใบเพิ่มหนี้ (Credit Note)
--   T04 — ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ (Receipt + abbreviated VAT invoice)
--
-- e-Tax Submission Flow:
--   invoice paid → trigger (fn_auto_queue_etax) → etax_submissions (queued)
--                ← Edge Function polls queued rows
--                ← calls Thai RD API or ETDA-certified provider
--                ← calls rpc_etax_mark_submitted / rpc_etax_mark_failed
-- ============================================================================

-- ============================================================================
-- 1. ENUMs: etax_document_type + etax_submission_status
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etax_document_type') THEN
    CREATE TYPE etax_document_type AS ENUM (
      'T01',   -- ใบกำกับภาษีแบบเต็ม (Full VAT Invoice)
      'T02',   -- ใบลดหนี้ (Debit Note)
      'T03',   -- ใบเพิ่มหนี้ (Credit Note)
      'T04'    -- ใบเสร็จรับเงิน (Receipt + abbreviated VAT)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'etax_submission_status') THEN
    CREATE TYPE etax_submission_status AS ENUM (
      'queued',     -- รอส่ง (ส่งโดย Edge Function)
      'submitting', -- กำลังส่ง (lock สำหรับ worker)
      'submitted',  -- ส่งสำเร็จ (มี rd_ref_no)
      'failed',     -- ส่งไม่สำเร็จ (ดู error_detail)
      'cancelled'   -- ยกเลิก (invoice ถูก void หลัง submit)
    );
  END IF;
END;
$$;

-- ============================================================================
-- 2. Table: etax_submissions
--    บันทึก e-Tax document queue และ submission history
-- ============================================================================

CREATE TABLE IF NOT EXISTS etax_submissions (
  id                  UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID                   NOT NULL,
  invoice_id          UUID                   NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Document metadata (snapshot ณ เวลาที่ invoice ถูก paid)
  document_type       etax_document_type     NOT NULL DEFAULT 'T01',
  document_number     TEXT                   NOT NULL,  -- เลขที่เอกสาร (= invoice.code)
  document_date       DATE                   NOT NULL,  -- วันที่ออกเอกสาร (= paid_at::DATE)

  -- VAT breakdown (คำนวณจาก src/tax/etax.ts pattern)
  net_amount          NUMERIC(14,2)          NOT NULL,   -- ยอดก่อน VAT
  vat_amount          NUMERIC(14,2)          NOT NULL,   -- VAT 7%
  gross_amount        NUMERIC(14,2)          NOT NULL,   -- ยอดรวม VAT
  vat_rate            NUMERIC(5,4)           NOT NULL DEFAULT 0.0700,

  -- Customer / seller info (snapshot)
  seller_tax_id       TEXT,                  -- เลขประจำตัวผู้เสียภาษี (ผู้ขาย)
  buyer_tax_id        TEXT,                  -- เลขประจำตัวผู้เสียภาษี (ผู้ซื้อ)
  buyer_name          TEXT,

  -- Submission tracking
  status              etax_submission_status NOT NULL DEFAULT 'queued',
  attempt_count       INT                    NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,           -- เวลาส่งสำเร็จ
  rd_ref_no           TEXT,                  -- เลขอ้างอิงจากกรมสรรพากร / ETDA provider
  rd_response_code    TEXT,                  -- response code จาก RD API
  error_detail        TEXT,                  -- error message (ถ้า failed)
  xml_payload         TEXT,                  -- XML document ที่ส่ง (optional — สำหรับ audit)
  pdf_path            TEXT,                  -- path ไปยัง PDF ใน Supabase Storage (optional)

  -- Audit
  created_at          TIMESTAMPTZ            NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ            NOT NULL DEFAULT now(),
  created_by          UUID,                  -- = auth.uid() หรือ NULL (trigger auto)

  -- Idempotency: invoice หนึ่งใบ → etax T01 หนึ่งรายการ (ป้องกัน double-submit)
  CONSTRAINT uq_etax_invoice_type
    UNIQUE (invoice_id, document_type),

  CONSTRAINT chk_etax_vat_rate
    CHECK (vat_rate BETWEEN 0 AND 1),

  CONSTRAINT chk_etax_amounts_positive
    CHECK (net_amount >= 0 AND vat_amount >= 0 AND gross_amount >= 0),

  -- ตรวจ VAT consistency: gross = net + vat (tolerance 0.02 สตางค์)
  CONSTRAINT chk_etax_vat_consistency
    CHECK (ABS(gross_amount - (net_amount + vat_amount)) <= 0.02)
);

CREATE INDEX IF NOT EXISTS idx_etax_org        ON etax_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_etax_invoice    ON etax_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_etax_status     ON etax_submissions(status)
  WHERE status IN ('queued', 'submitting', 'failed');
CREATE INDEX IF NOT EXISTS idx_etax_doc_date   ON etax_submissions(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_etax_rd_ref     ON etax_submissions(rd_ref_no)
  WHERE rd_ref_no IS NOT NULL;

COMMENT ON TABLE etax_submissions IS
  'e-Tax submission queue — auto-created เมื่อ invoice.status → paid; processed by Edge Function';
COMMENT ON COLUMN etax_submissions.rd_ref_no IS
  'เลขอ้างอิงจากกรมสรรพากร / ETDA provider (ใช้ยืนยัน submission)';
COMMENT ON COLUMN etax_submissions.xml_payload IS
  'XML e-Tax document payload (สำหรับ audit trail; อาจ NULL ถ้า generate ใน Edge Function)';

-- ============================================================================
-- 3. RLS บน etax_submissions
-- ============================================================================

ALTER TABLE etax_submissions ENABLE ROW LEVEL SECURITY;

-- Users อ่านได้เฉพาะ org ของตัวเอง
CREATE POLICY "etax_select_own_org"
  ON etax_submissions FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id());

-- INSERT เฉพาะ SECURITY DEFINER functions (trigger + RPCs)
CREATE POLICY "etax_insert_service_only"
  ON etax_submissions FOR INSERT
  TO authenticated
  WITH CHECK (false);   -- block direct INSERT

-- UPDATE เฉพาะ SECURITY DEFINER functions
CREATE POLICY "etax_update_service_only"
  ON etax_submissions FOR UPDATE
  TO authenticated
  USING (false);

COMMENT ON POLICY "etax_insert_service_only" ON etax_submissions IS
  'INSERT ทำได้เฉพาะผ่าน rpc_etax_* functions (SECURITY DEFINER)';

-- ============================================================================
-- 4. Helper: _compute_etax_vat
--    คำนวณ VAT breakdown จาก gross amount (inclusive)
--    สอดคล้องกับ src/tax/etax.ts: splitInclusive(gross, 0.07)
-- ============================================================================

CREATE OR REPLACE FUNCTION _compute_etax_vat(
  p_gross_amount  NUMERIC,
  p_vat_rate      NUMERIC DEFAULT 0.0700
)
RETURNS TABLE (
  net_amount   NUMERIC,
  vat_amount   NUMERIC,
  gross_amount NUMERIC
)
LANGUAGE sql
IMMUTABLE
AS $$
  -- splitInclusive: vat = round(gross × rate / (1 + rate), 2); net = gross − vat
  SELECT
    ROUND((p_gross_amount - ROUND(p_gross_amount * p_vat_rate / (1 + p_vat_rate), 2)), 2)  AS net_amount,
    ROUND(p_gross_amount * p_vat_rate / (1 + p_vat_rate), 2)                               AS vat_amount,
    ROUND(p_gross_amount, 2)                                                                AS gross_amount;
$$;

COMMENT ON FUNCTION _compute_etax_vat(NUMERIC, NUMERIC) IS
  'คำนวณ VAT breakdown (inclusive) — mirror src/tax/etax.ts:splitInclusive()';

-- ============================================================================
-- 5. Core trigger function: fn_auto_queue_etax
--    สร้าง etax_submissions row เมื่อ invoice.status → 'paid'
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_queue_etax()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_net    NUMERIC;
  v_vat    NUMERIC;
  v_gross  NUMERIC;
  v_buyer_name  TEXT;
  v_buyer_tax_id TEXT;
BEGIN
  -- ── Condition ─────────────────────────────────────────────────────────────
  -- ทำงานเฉพาะเมื่อ status เปลี่ยน → 'paid' และ status เดิมไม่ใช่ 'paid'
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'paid' THEN
    RETURN NEW;  -- ไม่ re-submit ถ้าเป็น 'paid' อยู่แล้ว
  END IF;

  -- ── คำนวณ VAT จาก total amount ────────────────────────────────────────────
  v_gross := COALESCE(NEW.total, 0);

  SELECT net_amount, vat_amount, gross_amount
  INTO   v_net, v_vat, v_gross
  FROM   _compute_etax_vat(v_gross, 0.0700);

  -- ── ดึงข้อมูลลูกค้า ────────────────────────────────────────────────────────
  SELECT
    c.name,
    c.tax_id   -- ถ้า customers table มีคอลัมน์ tax_id
  INTO
    v_buyer_name,
    v_buyer_tax_id
  FROM customers c
  WHERE c.customer_id = NEW.customer_id;

  -- ── Insert etax_submissions (idempotent via ON CONFLICT) ──────────────────
  INSERT INTO etax_submissions (
    org_id,
    invoice_id,
    document_type,
    document_number,
    document_date,
    net_amount,
    vat_amount,
    gross_amount,
    vat_rate,
    buyer_name,
    buyer_tax_id,
    status,
    created_by
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    'T01',                                                -- Full VAT Invoice
    NEW.code,                                             -- เลขที่ใบแจ้งหนี้ = document number
    COALESCE(NEW.paid_at::DATE, CURRENT_DATE),
    v_net,
    v_vat,
    v_gross,
    0.0700,
    v_buyer_name,
    v_buyer_tax_id,
    'queued',
    NEW.updated_by
  )
  ON CONFLICT (invoice_id, document_type) DO NOTHING;
  -- ON CONFLICT: invoice นี้เคย queue แล้ว → ไม่ insert ซ้ำ

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_auto_queue_etax() IS
  'Auto-queue eTax T01 document เมื่อ invoices.status → paid';

-- ============================================================================
-- 6. Trigger: trg_etax_on_invoice_paid
-- ============================================================================

DROP TRIGGER IF EXISTS trg_etax_on_invoice_paid ON invoices;

CREATE TRIGGER trg_etax_on_invoice_paid
  AFTER UPDATE OF status
  ON invoices
  FOR EACH ROW
  WHEN (
    NEW.status = 'paid'
    AND OLD.status IS DISTINCT FROM 'paid'
  )
  EXECUTE FUNCTION fn_auto_queue_etax();

COMMENT ON TRIGGER trg_etax_on_invoice_paid ON invoices IS
  'Auto-create eTax submission record เมื่อ invoice.status เปลี่ยนเป็น paid';

-- ============================================================================
-- 7. RPC: rpc_etax_auto_submit
--    สร้าง etax_submissions row ด้วยตนเอง (สำหรับ invoices ที่ paid แล้วแต่ยังไม่มี submission)
--    หรือเรียกซ้ำได้ (idempotent) — เหมาะสำหรับ backfill
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_auto_submit(
  p_invoice_id    UUID,
  p_document_type etax_document_type DEFAULT 'T01'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id     UUID;
  v_invoice    invoices%ROWTYPE;
  v_net        NUMERIC;
  v_vat        NUMERIC;
  v_gross      NUMERIC;
  v_buyer_name TEXT;
  v_buyer_tax  TEXT;
  v_sub_id     UUID;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  IF NOT (has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: rpc_etax_auto_submit requires FINANCE or ADMIN role';
  END IF;

  v_org_id := get_user_org_id();

  -- ── ดึง invoice ───────────────────────────────────────────────────────────
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id     = p_invoice_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;

  IF v_invoice.status NOT IN ('paid') THEN
    RAISE EXCEPTION
      'Invoice % must be in paid status to submit eTax (current: %)',
      p_invoice_id, v_invoice.status;
  END IF;

  -- ── คำนวณ VAT ──────────────────────────────────────────────────────────────
  SELECT net_amount, vat_amount, gross_amount
  INTO   v_net, v_vat, v_gross
  FROM   _compute_etax_vat(COALESCE(v_invoice.total, 0), 0.0700);

  -- ── ดึง buyer info ─────────────────────────────────────────────────────────
  SELECT c.name, c.tax_id
  INTO   v_buyer_name, v_buyer_tax
  FROM customers c
  WHERE  c.customer_id = v_invoice.customer_id;

  -- ── Insert / return existing ────────────────────────────────────────────────
  INSERT INTO etax_submissions (
    org_id,
    invoice_id,
    document_type,
    document_number,
    document_date,
    net_amount,
    vat_amount,
    gross_amount,
    vat_rate,
    buyer_name,
    buyer_tax_id,
    status,
    created_by
  )
  VALUES (
    v_org_id,
    p_invoice_id,
    p_document_type,
    v_invoice.code,
    COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE),
    v_net,
    v_vat,
    v_gross,
    0.0700,
    v_buyer_name,
    v_buyer_tax,
    'queued',
    auth.uid()
  )
  ON CONFLICT (invoice_id, document_type)
  DO UPDATE SET
    status     = CASE
                   WHEN etax_submissions.status = 'failed'    THEN 'queued'   -- retry on conflict
                   WHEN etax_submissions.status = 'cancelled' THEN 'queued'
                   ELSE etax_submissions.status               -- ไม่เปลี่ยน submitted/queued
                 END,
    updated_at = now()
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object(
    'submission_id',   v_sub_id,
    'invoice_id',      p_invoice_id,
    'document_type',   p_document_type,
    'document_number', v_invoice.code,
    'document_date',   COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE),
    'net_amount',      v_net,
    'vat_amount',      v_vat,
    'gross_amount',    v_gross,
    'status',          'queued',
    'created_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_etax_auto_submit(UUID, etax_document_type) IS
  'สร้าง / re-queue eTax submission record สำหรับ invoice ที่ paid แล้ว (idempotent)';

-- ============================================================================
-- 8. RPC: rpc_etax_mark_submitted
--    อัปเดต status → submitted หลัง Edge Function ส่งสำเร็จ
--    เรียกโดย: Edge Function ที่ submit ไปยัง Thai RD / ETDA provider
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_mark_submitted(
  p_submission_id  UUID,
  p_rd_ref_no      TEXT,           -- เลขอ้างอิงจากกรมสรรพากร
  p_rd_response_code TEXT DEFAULT NULL,
  p_xml_payload    TEXT DEFAULT NULL,
  p_pdf_path       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT;
BEGIN
  -- เรียกได้เฉพาะ service role (Edge Function) หรือ ADMIN
  IF NOT (
    (current_setting('request.jwt.claims', true)::JSONB ->> 'role' = 'service_role')
    OR has_app_role('admin')
    OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: rpc_etax_mark_submitted requires service role or ADMIN';
  END IF;

  IF p_rd_ref_no IS NULL OR p_rd_ref_no = '' THEN
    RAISE EXCEPTION 'rd_ref_no is required to mark submission as submitted';
  END IF;

  UPDATE etax_submissions SET
    status             = 'submitted',
    rd_ref_no          = p_rd_ref_no,
    rd_response_code   = p_rd_response_code,
    xml_payload        = COALESCE(p_xml_payload, xml_payload),
    pdf_path           = COALESCE(p_pdf_path, pdf_path),
    submitted_at       = now(),
    last_attempt_at    = now(),
    attempt_count      = attempt_count + 1,
    error_detail       = NULL,      -- ล้าง error เดิม
    updated_at         = now()
  WHERE id     = p_submission_id
    AND status IN ('queued', 'submitting', 'failed');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION
      'Submission % not found, not in processable state, or already submitted',
      p_submission_id;
  END IF;

  RETURN jsonb_build_object(
    'submission_id',    p_submission_id,
    'status',           'submitted',
    'rd_ref_no',        p_rd_ref_no,
    'rd_response_code', p_rd_response_code,
    'submitted_at',     now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_etax_mark_submitted(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Mark eTax submission as submitted after successful API call (service role / ADMIN only)';

-- ============================================================================
-- 9. RPC: rpc_etax_mark_failed
--    บันทึก failure + increment attempt_count
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_mark_failed(
  p_submission_id  UUID,
  p_error_detail   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT;
BEGIN
  -- เรียกได้เฉพาะ service role
  IF NOT (
    (current_setting('request.jwt.claims', true)::JSONB ->> 'role' = 'service_role')
    OR has_app_role('admin')
    OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: rpc_etax_mark_failed requires service role or ADMIN';
  END IF;

  UPDATE etax_submissions SET
    status          = 'failed',
    error_detail    = p_error_detail,
    last_attempt_at = now(),
    attempt_count   = attempt_count + 1,
    updated_at      = now()
  WHERE id     = p_submission_id
    AND status IN ('queued', 'submitting', 'failed');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Submission % not found or in terminal state', p_submission_id;
  END IF;

  RETURN jsonb_build_object(
    'submission_id',  p_submission_id,
    'status',         'failed',
    'error_detail',   p_error_detail,
    'failed_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_etax_mark_failed(UUID, TEXT) IS
  'Mark eTax submission as failed and record error detail';

-- ============================================================================
-- 10. RPC: rpc_etax_retry_submission
--     Reset failed → queued เพื่อ retry (เรียกโดย FINANCE/ADMIN user)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_retry_submission(
  p_submission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id  UUID;
  v_updated INT;
  v_sub     etax_submissions%ROWTYPE;
BEGIN
  IF NOT (has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: rpc_etax_retry_submission requires FINANCE or ADMIN role';
  END IF;

  v_org_id := get_user_org_id();

  SELECT * INTO v_sub
  FROM etax_submissions
  WHERE id     = p_submission_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission % not found or access denied', p_submission_id;
  END IF;

  IF v_sub.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION
      'Submission % cannot be retried (current status: %)',
      p_submission_id, v_sub.status;
  END IF;

  IF v_sub.attempt_count >= 5 THEN
    RAISE EXCEPTION
      'Submission % has reached max retry attempts (5). Contact support.',
      p_submission_id;
  END IF;

  UPDATE etax_submissions SET
    status     = 'queued',
    error_detail = NULL,
    updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'status',        'queued',
    'attempt_count', v_sub.attempt_count,
    'retried_at',    now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_etax_retry_submission(UUID) IS
  'Reset failed eTax submission to queued for retry (max 5 attempts)';

-- ============================================================================
-- 11. RPC: rpc_etax_list_submissions
--     ดูรายการ etax submissions ของ org
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_etax_list_submissions(
  p_status     etax_submission_status DEFAULT NULL,  -- NULL = ทุก status
  p_from_date  DATE                   DEFAULT NULL,
  p_to_date    DATE                   DEFAULT NULL,
  p_limit      INT                    DEFAULT 50,
  p_offset     INT                    DEFAULT 0
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
  IF NOT (
    has_app_role('finance') OR has_app_role('admin')
    OR has_app_role('designer') OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires at least DESIGNER role';
  END IF;

  v_org_id := get_user_org_id();

  SELECT jsonb_agg(row_data ORDER BY document_date DESC)
  INTO   v_result
  FROM (
    SELECT jsonb_build_object(
      'submission_id',    s.id,
      'invoice_id',       s.invoice_id,
      'document_type',    s.document_type,
      'document_number',  s.document_number,
      'document_date',    s.document_date,
      'buyer_name',       s.buyer_name,
      'net_amount',       s.net_amount,
      'vat_amount',       s.vat_amount,
      'gross_amount',     s.gross_amount,
      'status',           s.status,
      'rd_ref_no',        s.rd_ref_no,
      'attempt_count',    s.attempt_count,
      'last_attempt_at',  s.last_attempt_at,
      'submitted_at',     s.submitted_at,
      'error_detail',     s.error_detail,
      'pdf_path',         s.pdf_path,
      'created_at',       s.created_at
    ) AS row_data,
    s.document_date
    FROM etax_submissions s
    WHERE
      s.org_id       = v_org_id
      AND (p_status   IS NULL OR s.status        = p_status)
      AND (p_from_date IS NULL OR s.document_date >= p_from_date)
      AND (p_to_date   IS NULL OR s.document_date <= p_to_date)
    ORDER BY s.document_date DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) sub;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION rpc_etax_list_submissions(etax_submission_status, DATE, DATE, INT, INT) IS
  'ดูรายการ e-Tax submissions ของ org พร้อม filter by status / date range';

-- ============================================================================
-- 12. View: v_etax_submissions
--     Dashboard view สำหรับ eTax submission tracking
-- ============================================================================

CREATE OR REPLACE VIEW v_etax_submissions AS
SELECT
  s.id                        AS submission_id,
  s.invoice_id,
  s.org_id,
  s.document_type,
  s.document_number,
  s.document_date,
  s.buyer_name,
  s.net_amount,
  s.vat_amount,
  s.gross_amount,
  s.status,
  s.rd_ref_no,
  s.rd_response_code,
  s.attempt_count,
  s.last_attempt_at,
  s.submitted_at,
  s.error_detail,
  s.pdf_path,
  s.created_at,
  s.updated_at,

  -- ยอดวัน (สำหรับ SLA tracking)
  CASE
    WHEN s.status = 'submitted' THEN NULL
    ELSE (CURRENT_DATE - s.document_date)::INT
  END                         AS days_since_document,

  -- Flag: เกิน 7 วัน ยังไม่ submitted = ต้องติดตาม
  CASE
    WHEN s.status NOT IN ('submitted', 'cancelled')
     AND (CURRENT_DATE - s.document_date) > 7
    THEN TRUE
    ELSE FALSE
  END                         AS is_overdue_submission

FROM etax_submissions s
WHERE s.org_id = get_user_org_id();  -- RLS ผ่าน view

COMMENT ON VIEW v_etax_submissions IS
  'eTax submission dashboard — แสดงเฉพาะ org ของ user ที่ login';

-- ============================================================================
-- 13. Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_etax_auto_submit(UUID, etax_document_type)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_etax_mark_submitted(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_etax_mark_failed(UUID, TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_etax_retry_submission(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_etax_list_submissions(etax_submission_status, DATE, DATE, INT, INT)
  TO authenticated;

GRANT SELECT ON v_etax_submissions TO authenticated;

-- ============================================================================
-- 14. Performance indices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_paid_for_etax
  ON invoices(status, org_id, paid_at)
  WHERE status = 'paid';

-- ============================================================================
-- 15. Backfill: สร้าง etax_submissions สำหรับ invoices ที่ paid แล้ว
--     (เรียกครั้งเดียวหลัง migrate เพื่อ backfill ข้อมูลเก่า)
-- ============================================================================

DO $$
DECLARE
  v_count INT := 0;
  v_inv   RECORD;
  v_net   NUMERIC;
  v_vat   NUMERIC;
  v_gross NUMERIC;
BEGIN
  FOR v_inv IN
    SELECT
      i.id,
      i.org_id,
      i.code,
      i.total,
      i.customer_id,
      i.paid_at,
      i.updated_by,
      c.name AS buyer_name
    FROM invoices i
    LEFT JOIN customers c ON c.customer_id = i.customer_id
    WHERE i.status = 'paid'
      -- ยังไม่มี submission (หรือ ON CONFLICT จะ skip)
      AND NOT EXISTS (
        SELECT 1 FROM etax_submissions e
        WHERE e.invoice_id   = i.id
          AND e.document_type = 'T01'
      )
  LOOP
    SELECT net_amount, vat_amount, gross_amount
    INTO   v_net, v_vat, v_gross
    FROM   _compute_etax_vat(COALESCE(v_inv.total, 0), 0.0700);

    INSERT INTO etax_submissions (
      org_id, invoice_id, document_type,
      document_number, document_date,
      net_amount, vat_amount, gross_amount, vat_rate,
      buyer_name, status
    )
    VALUES (
      v_inv.org_id, v_inv.id, 'T01',
      v_inv.code,
      COALESCE(v_inv.paid_at::DATE, CURRENT_DATE),
      v_net, v_vat, v_gross, 0.0700,
      v_inv.buyer_name, 'queued'
    )
    ON CONFLICT (invoice_id, document_type) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '0181 backfill: % existing paid invoices queued for eTax submission', v_count;
END;
$$;

-- ============================================================================
-- END OF MIGRATION 0181
-- ============================================================================
--
-- Summary:
--   TABLE   : etax_submissions (org_id RLS, UNIQUE per invoice+document_type)
--   TRIGGER : trg_etax_on_invoice_paid → fn_auto_queue_etax
--             Auto-queue T01 เมื่อ invoices.status → 'paid'
--   HELPER  : _compute_etax_vat — mirror src/tax/etax.ts:splitInclusive()
--   RPC     : rpc_etax_auto_submit      — manual queue (idempotent, backfill)
--   RPC     : rpc_etax_mark_submitted   — service role: mark submitted + rd_ref_no
--   RPC     : rpc_etax_mark_failed      — service role: record failure
--   RPC     : rpc_etax_retry_submission — FINANCE/ADMIN: reset failed → queued
--   RPC     : rpc_etax_list_submissions — ดูรายการ per org
--   VIEW    : v_etax_submissions        — dashboard per org (RLS through view)
--   BACKFILL: DO $$ ... $$ — queue existing paid invoices
--
-- Integration with src/tax/etax.ts:
--   _compute_etax_vat() mirrors splitInclusive(gross, 0.07)
--   document_number uses invoice.code (same as formatInvoiceNumber output)
--   Edge Function: SELECT * FROM etax_submissions WHERE status='queued'
--                  → generate XML → call RD API
--                  → rpc_etax_mark_submitted / rpc_etax_mark_failed
--
-- eTax Flow:
--   ① invoice.status → 'paid'
--   ② trigger → etax_submissions (status='queued')
--   ③ Edge Function polls queued rows (e.g., every 5 min)
--   ④ Edge Function: compute VAT via etax.ts, generate XML/PDF
--   ⑤ Edge Function: POST to Thai RD API / ETDA provider
--   ⑥ → rpc_etax_mark_submitted(submission_id, rd_ref_no)
--   ⑦ OR rpc_etax_mark_failed(submission_id, error_detail) → retry via rpc_etax_retry_submission
--
-- Thai RD e-Tax standard ref: https://www.rd.go.th/publish/etax-intro.html
-- ============================================================================

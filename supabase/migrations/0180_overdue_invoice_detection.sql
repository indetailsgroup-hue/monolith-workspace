-- ============================================================================
-- Migration  : 0180_overdue_invoice_detection.sql
-- Feature    : Overdue invoice detection + auto-notification system
-- Trigger    : 1. Daily pg_cron job (ถ้า pg_cron พร้อม)
--              2. rpc_check_overdue_invoices — เรียกจาก Edge Function หรือ cron
--              3. Realtime event ผ่าน Supabase Realtime Channel
-- Condition  : invoices.remaining_amount > 0 AND due_date < CURRENT_DATE
--              AND status NOT IN ('paid', 'cancelled', 'void')
-- Tables     : invoice_notifications — บันทึก notification ที่ส่งแล้ว (ป้องกัน spam)
-- Views      : v_overdue_invoices    — real-time overdue dashboard
-- RPCs       : rpc_check_overdue_invoices  — scan + create notifications
--              rpc_list_overdue_invoices   — ดู overdue ของ org
--              rpc_acknowledge_notification — mark as read
--              rpc_snooze_notification     — snooze N วัน
-- Depends    : 0172_jobs_quotations_invoices (invoices, customers)
--              0177_auto_receipt_on_payment_confirm (paid_amount, remaining_amount, paid_at)
--              20260828_multi_tenant_schema (org_id, get_user_org_id)
-- Rollback   : DROP TABLE invoice_notifications CASCADE;
--              DROP FUNCTION ... CASCADE;
--              SELECT cron.unschedule('check-overdue-invoices');
-- Author     : Monolith Accounting Module
-- Date       : 2026-08-28
-- ============================================================================

-- ============================================================================
-- 1. ENUM: notification_type + notification_status
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'overdue_1d',    -- เลยกำหนด 1 วัน
      'overdue_7d',    -- เลยกำหนด 7 วัน
      'overdue_30d',   -- เลยกำหนด 30 วัน
      'overdue_90d',   -- เลยกำหนด 90+ วัน (bad debt risk)
      'due_soon_3d',   -- จะถึงกำหนดใน 3 วัน (pre-due reminder)
      'due_soon_7d',   -- จะถึงกำหนดใน 7 วัน
      'partial_paid',  -- รับชำระบางส่วนแล้ว
      'fully_paid'     -- ชำระครบ (close notification)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status') THEN
    CREATE TYPE notification_status AS ENUM (
      'pending',      -- ยังไม่ได้อ่าน
      'sent',         -- ส่งแล้ว (email / in-app)
      'acknowledged', -- ผู้ใช้อ่านแล้ว
      'snoozed',      -- เลื่อนการแจ้งเตือน
      'dismissed'     -- ปิดถาวร
    );
  END IF;
END;
$$;

-- ============================================================================
-- 2. สร้าง invoice_notifications table
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_notifications (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID              NOT NULL,
  invoice_id        UUID              NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  status            notification_status NOT NULL DEFAULT 'pending',

  -- ข้อมูลที่บันทึก ณ เวลาที่ trigger
  days_overdue      INT               NOT NULL DEFAULT 0,
  amount_remaining  NUMERIC(12,2)     NOT NULL DEFAULT 0,
  invoice_code      TEXT              NOT NULL,
  customer_name     TEXT,

  -- Spam-prevention date (indexed separately; TIMESTAMPTZ::DATE is not IMMUTABLE)
  notification_date DATE              NOT NULL DEFAULT CURRENT_DATE,

  -- Snooze
  snoozed_until     DATE,
  snooze_count      INT               NOT NULL DEFAULT 0,

  -- Delivery tracking
  sent_at           TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,

  created_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- ป้องกัน spam: notification type เดียวกัน ต่อ invoice ต่อวัน (expression index, not inline constraint)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_daily
  ON invoice_notifications(invoice_id, notification_type, notification_date);

CREATE INDEX IF NOT EXISTS idx_notif_invoice   ON invoice_notifications(invoice_id);
CREATE INDEX IF NOT EXISTS idx_notif_org       ON invoice_notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_notif_status    ON invoice_notifications(status)
  WHERE status IN ('pending', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_notif_created   ON invoice_notifications(created_at DESC);

COMMENT ON TABLE  invoice_notifications IS
  'บันทึก notification สำหรับ overdue / due-soon invoices (แต่ละ type ส่งได้วันละ 1 ครั้ง)';
COMMENT ON COLUMN invoice_notifications.days_overdue IS
  'จำนวนวันที่เลยกำหนด (บวก = overdue, ลบ = ยังไม่ถึงกำหนด)';

-- ============================================================================
-- 3. RLS บน invoice_notifications
-- ============================================================================

ALTER TABLE invoice_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_own_org"
  ON invoice_notifications FOR SELECT
  TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "notif_update_own_org"
  ON invoice_notifications FOR UPDATE
  TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- INSERT ทำได้เฉพาะผ่าน SECURITY DEFINER functions
CREATE POLICY "notif_insert_service_only"
  ON invoice_notifications FOR INSERT
  TO authenticated
  WITH CHECK (false);  -- block direct INSERT; ใช้ RPC แทน

-- ============================================================================
-- 4. Helper: _classify_overdue_type
--    คืน notification_type ตาม days_overdue
-- ============================================================================

CREATE OR REPLACE FUNCTION _classify_overdue_type(
  p_days_overdue  INT,
  p_due_date      DATE
)
RETURNS notification_type
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_days_overdue >= 90 THEN 'overdue_90d'::notification_type
    WHEN p_days_overdue >= 30 THEN 'overdue_30d'::notification_type
    WHEN p_days_overdue >=  7 THEN 'overdue_7d'::notification_type
    WHEN p_days_overdue >=  1 THEN 'overdue_1d'::notification_type
    WHEN (p_due_date - CURRENT_DATE) BETWEEN 1 AND 3  THEN 'due_soon_3d'::notification_type
    WHEN (p_due_date - CURRENT_DATE) BETWEEN 4 AND 7  THEN 'due_soon_7d'::notification_type
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION _classify_overdue_type(INT, DATE) IS
  'จำแนก notification type จาก days overdue (internal helper)';

-- ============================================================================
-- 5. Core function: rpc_check_overdue_invoices
--    Scan invoices ทั้ง org + สร้าง notifications สำหรับ overdue items
--    Idempotent: ตรวจ UNIQUE constraint ก่อน insert
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_check_overdue_invoices(
  p_org_id          UUID    DEFAULT NULL,   -- NULL = scan ทุก org (service role only)
  p_dry_run         BOOLEAN DEFAULT FALSE   -- TRUE = แค่ report ไม่ insert
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id          UUID;
  v_is_service_role BOOLEAN;
  v_invoice         RECORD;
  v_days_overdue    INT;
  v_notif_type      notification_type;
  v_inserted        INT  := 0;
  v_skipped         INT  := 0;
  v_dry_results     JSONB := '[]'::JSONB;
  v_today           DATE := CURRENT_DATE;
BEGIN
  -- ── Authorization ──────────────────────────────────────────────────────────
  -- Service role: สามารถ scan ทุก org (p_org_id = NULL)
  -- Authenticated user: scan ได้เฉพาะ org ของตัวเอง
  v_is_service_role := current_setting('request.jwt.claims', true)::JSONB ->> 'role' = 'service_role';

  IF NOT v_is_service_role THEN
    IF NOT (has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
      RAISE EXCEPTION 'Forbidden: rpc_check_overdue_invoices requires FINANCE or ADMIN role';
    END IF;
    v_org_id := COALESCE(p_org_id, get_user_org_id());
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Forbidden: user is not a member of any organization';
    END IF;
  ELSE
    v_org_id := p_org_id;  -- NULL = all orgs for service role
  END IF;

  -- ── Scan invoices ──────────────────────────────────────────────────────────
  FOR v_invoice IN
    SELECT
      i.invoice_id,
      i.org_id,
      i.invoice_code,
      i.due_date,
      i.remaining_amount,
      i.status,
      COALESCE(c.name, 'Unknown') AS customer_name,
      (v_today - i.due_date)::INT AS days_overdue_calc
    FROM invoices i
    LEFT JOIN customers c ON c.customer_id = i.customer_id
    WHERE
      -- กรอง org (NULL = ทุก org สำหรับ service role)
      (v_org_id IS NULL OR i.org_id = v_org_id)
      -- ยังไม่ได้จ่าย
      AND i.remaining_amount > 0
      -- สถานะที่ต้อง track
      AND i.status NOT IN ('PAID', 'CANCELLED')
      -- overdue หรือ due-soon (7 วัน)
      AND (
        i.due_date < v_today                         -- overdue
        OR i.due_date BETWEEN v_today AND v_today + 7  -- due soon
      )
      -- ไม่ดึง invoice ที่ snoozed อยู่
      AND NOT EXISTS (
        SELECT 1 FROM invoice_notifications n
        WHERE n.invoice_id = i.invoice_id
          AND n.status      = 'snoozed'
          AND n.snoozed_until >= v_today
      )
  LOOP
    v_days_overdue := v_invoice.days_overdue_calc;
    v_notif_type   := _classify_overdue_type(v_days_overdue, v_invoice.due_date);

    CONTINUE WHEN v_notif_type IS NULL;

    IF p_dry_run THEN
      -- แค่เก็บผลลัพธ์ ไม่ insert
      v_dry_results := v_dry_results || jsonb_build_object(
        'invoice_id',       v_invoice.invoice_id,
        'invoice_code',     v_invoice.invoice_code,
        'org_id',           v_invoice.org_id,
        'customer_name',    v_invoice.customer_name,
        'due_date',         v_invoice.due_date,
        'days_overdue',     v_days_overdue,
        'remaining_amount', v_invoice.remaining_amount,
        'notification_type', v_notif_type
      );
      v_inserted := v_inserted + 1;
      CONTINUE;
    END IF;

    -- Insert notification (ON CONFLICT = idempotent, skip duplicate)
    BEGIN
      INSERT INTO invoice_notifications (
        org_id,
        invoice_id,
        notification_type,
        status,
        days_overdue,
        amount_remaining,
        invoice_code,
        customer_name,
        notification_date
      )
      VALUES (
        v_invoice.org_id,
        v_invoice.invoice_id,
        v_notif_type,
        'pending',
        v_days_overdue,
        v_invoice.remaining_amount,
        v_invoice.invoice_code,
        v_invoice.customer_name,
        CURRENT_DATE
      );
      v_inserted := v_inserted + 1;

    EXCEPTION WHEN unique_violation THEN
      -- Already notified today for this type — skip
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',           p_dry_run,
    'scanned_org_id',    v_org_id,
    'notifications_created', v_inserted,
    'notifications_skipped', v_skipped,
    'dry_run_results',   CASE WHEN p_dry_run THEN v_dry_results ELSE NULL END,
    'run_at',            now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_check_overdue_invoices(UUID, BOOLEAN) IS
  'Scan invoices และสร้าง invoice_notifications สำหรับ overdue items (FINANCE/ADMIN or service role)';

-- ============================================================================
-- 6. Trigger: auto-notify เมื่อ invoice.remaining_amount เปลี่ยน
--    (เสริม cron — ทำงาน real-time เมื่อมีการอัปเดต)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_invoice_overdue_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days_overdue INT;
  v_notif_type   notification_type;
BEGIN
  -- ตรวจเฉพาะ invoices ที่มี remaining_amount > 0 และเลยกำหนด
  IF NEW.remaining_amount <= 0 OR NEW.status IN ('PAID', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  v_days_overdue := (CURRENT_DATE - NEW.due_date::DATE)::INT;

  -- ถ้า due_date ยังไม่ถึงและไม่ใช่ due-soon window — ไม่ต้องทำอะไร
  IF v_days_overdue < -7 THEN
    RETURN NEW;
  END IF;

  v_notif_type := _classify_overdue_type(v_days_overdue, NEW.due_date::DATE);
  IF v_notif_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert notification แบบ idempotent (ON CONFLICT DO NOTHING)
  INSERT INTO invoice_notifications (
    org_id,
    invoice_id,
    notification_type,
    status,
    days_overdue,
    amount_remaining,
    invoice_code,
    customer_name,
    notification_date
  )
  SELECT
    NEW.org_id,
    NEW.invoice_id,
    v_notif_type,
    'pending',
    v_days_overdue,
    NEW.remaining_amount,
    NEW.invoice_code,
    c.name,
    CURRENT_DATE
  FROM customers c
  WHERE c.customer_id = NEW.customer_id
  ON CONFLICT (invoice_id, notification_type, notification_date)
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_overdue ON invoices;

CREATE TRIGGER trg_check_invoice_overdue
  AFTER UPDATE OF remaining_amount, due_date, status
  ON invoices
  FOR EACH ROW
  WHEN (
    NEW.remaining_amount > 0
    AND NEW.status NOT IN ('PAID', 'CANCELLED')
  )
  EXECUTE FUNCTION fn_check_invoice_overdue_on_update();

COMMENT ON TRIGGER trg_check_invoice_overdue ON invoices IS
  'Auto-create overdue notification เมื่อ invoice.remaining_amount / due_date เปลี่ยน';

-- ============================================================================
-- 7. RPC: rpc_list_overdue_invoices
--    ดู overdue invoices ของ org พร้อม notification history
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_list_overdue_invoices(
  p_include_due_soon BOOLEAN DEFAULT TRUE,   -- รวม due-soon (7 วัน) ด้วย
  p_limit            INT     DEFAULT 50,
  p_offset           INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
  v_today  DATE := CURRENT_DATE;
BEGIN
  IF NOT (
    has_app_role('finance') OR has_app_role('admin')
    OR has_app_role('designer') OR is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires at least DESIGNER role';
  END IF;

  v_org_id := get_user_org_id();

  SELECT jsonb_agg(row_data ORDER BY days_overdue DESC)
  INTO   v_result
  FROM (
    SELECT jsonb_build_object(
      'invoice_id',        i.invoice_id,
      'invoice_code',      i.invoice_code,
      'customer_name',     COALESCE(c.name, 'Unknown'),
      'due_date',          i.due_date,
      'days_overdue',      (v_today - i.due_date::DATE)::INT,
      'total_amount',      i.total,
      'paid_amount',       COALESCE(i.paid_amount, 0),
      'remaining_amount',  i.remaining_amount,
      'payment_pct',       ROUND(
                             COALESCE(i.paid_amount, 0) / NULLIF(i.total, 0) * 100, 1
                           ),
      'invoice_status',    i.status,
      'notification_count', (
        SELECT COUNT(*) FROM invoice_notifications n
        WHERE n.invoice_id = i.invoice_id AND n.org_id = i.org_id
      ),
      'last_notification', (
        SELECT jsonb_build_object(
          'type',       n2.notification_type,
          'status',     n2.status,
          'created_at', n2.created_at
        )
        FROM invoice_notifications n2
        WHERE n2.invoice_id = i.invoice_id
        ORDER BY n2.created_at DESC
        LIMIT 1
      )
    ) AS row_data,
    (v_today - i.due_date::DATE)::INT AS days_overdue
    FROM invoices i
    LEFT JOIN customers c ON c.customer_id = i.customer_id
    WHERE
      i.org_id          = v_org_id
      AND i.remaining_amount > 0
      AND i.status NOT IN ('PAID', 'CANCELLED')
      AND (
        i.due_date < v_today
        OR (p_include_due_soon AND i.due_date BETWEEN v_today AND v_today + 7)
      )
    ORDER BY (v_today - i.due_date::DATE) DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) sub;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION rpc_list_overdue_invoices(BOOLEAN, INT, INT) IS
  'ดู overdue / due-soon invoices ของ org พร้อม notification history';

-- ============================================================================
-- 8. RPC: rpc_acknowledge_notification
--    Mark notification as acknowledged (อ่านแล้ว)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_acknowledge_notification(
  p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_updated INT;
BEGIN
  v_org_id := get_user_org_id();

  UPDATE invoice_notifications SET
    status           = 'acknowledged',
    acknowledged_at  = now(),
    acknowledged_by  = auth.uid(),
    updated_at       = now()
  WHERE id     = p_notification_id
    AND org_id = v_org_id
    AND status NOT IN ('dismissed');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Notification % not found, access denied, or already dismissed', p_notification_id;
  END IF;

  RETURN jsonb_build_object(
    'notification_id', p_notification_id,
    'status',          'acknowledged',
    'acknowledged_at', now()
  );
END;
$$;

COMMENT ON FUNCTION rpc_acknowledge_notification(UUID) IS
  'Mark invoice notification as acknowledged';

-- ============================================================================
-- 9. RPC: rpc_snooze_notification
--    เลื่อนการแจ้งเตือน N วัน (max 3 ครั้ง)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_snooze_notification(
  p_notification_id UUID,
  p_snooze_days     INT DEFAULT 7  -- default snooze 7 วัน
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id     UUID;
  v_notif      invoice_notifications%ROWTYPE;
  v_snooze_max INT := 3;  -- max snooze ครั้ง
BEGIN
  v_org_id := get_user_org_id();

  SELECT * INTO v_notif
  FROM invoice_notifications
  WHERE id = p_notification_id AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification % not found or access denied', p_notification_id;
  END IF;

  IF v_notif.snooze_count >= v_snooze_max THEN
    RAISE EXCEPTION
      'Cannot snooze notification %: max snooze count (%) reached',
      p_notification_id, v_snooze_max;
  END IF;

  IF p_snooze_days < 1 OR p_snooze_days > 90 THEN
    RAISE EXCEPTION 'snooze_days must be between 1 and 90, got %', p_snooze_days;
  END IF;

  UPDATE invoice_notifications SET
    status        = 'snoozed',
    snoozed_until = CURRENT_DATE + p_snooze_days,
    snooze_count  = snooze_count + 1,
    updated_at    = now()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object(
    'notification_id', p_notification_id,
    'status',          'snoozed',
    'snoozed_until',   CURRENT_DATE + p_snooze_days,
    'snooze_count',    v_notif.snooze_count + 1,
    'remaining_snoozes', v_snooze_max - (v_notif.snooze_count + 1)
  );
END;
$$;

COMMENT ON FUNCTION rpc_snooze_notification(UUID, INT) IS
  'เลื่อนการแจ้งเตือน N วัน (สูงสุด 3 ครั้ง)';

-- ============================================================================
-- 10. View: v_overdue_invoices
--     Dashboard view สำหรับ overdue invoices + aging buckets
-- ============================================================================

CREATE OR REPLACE VIEW v_overdue_invoices AS
SELECT
  i.invoice_id                            AS invoice_id,
  i.invoice_code                          AS invoice_code,
  i.org_id,
  i.status,
  COALESCE(c.name, 'Unknown')             AS customer_name,
  i.due_date,
  CURRENT_DATE - i.due_date::DATE         AS days_overdue,
  COALESCE(i.total, 0)                    AS total_amount,
  COALESCE(i.paid_amount, 0)              AS paid_amount,
  COALESCE(i.remaining_amount, i.total)   AS remaining_amount,

  -- Aging bucket
  CASE
    WHEN CURRENT_DATE - i.due_date::DATE <  0  THEN 'NOT_DUE'
    WHEN CURRENT_DATE - i.due_date::DATE <= 7  THEN '1-7 days'
    WHEN CURRENT_DATE - i.due_date::DATE <= 30 THEN '8-30 days'
    WHEN CURRENT_DATE - i.due_date::DATE <= 90 THEN '31-90 days'
    ELSE '90+ days'
  END                                     AS aging_bucket,

  -- Risk level
  CASE
    WHEN CURRENT_DATE - i.due_date::DATE >= 90 THEN 'CRITICAL'
    WHEN CURRENT_DATE - i.due_date::DATE >= 30 THEN 'HIGH'
    WHEN CURRENT_DATE - i.due_date::DATE >= 7  THEN 'MEDIUM'
    ELSE 'LOW'
  END                                     AS risk_level,

  -- Notification summary
  (
    SELECT COUNT(*) FROM invoice_notifications n
    WHERE n.invoice_id = i.invoice_id AND n.status = 'pending'
  )                                       AS pending_notifications,

  (
    SELECT MAX(n.created_at) FROM invoice_notifications n
    WHERE n.invoice_id = i.invoice_id
  )                                       AS last_notified_at

FROM invoices i
LEFT JOIN customers c ON c.customer_id = i.customer_id
WHERE
  i.org_id           = get_user_org_id()   -- RLS ผ่าน view
  AND i.remaining_amount > 0
  AND i.status NOT IN ('PAID', 'CANCELLED')
  AND i.due_date IS NOT NULL;

COMMENT ON VIEW v_overdue_invoices IS
  'Overdue invoice dashboard พร้อม aging bucket (1-7d, 8-30d, 31-90d, 90+d) และ risk level';

-- ============================================================================
-- 11. View: v_overdue_aging_summary
--     สรุป AR aging ของ org (สำหรับ finance dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW v_overdue_aging_summary AS
SELECT
  get_user_org_id()           AS org_id,
  aging_bucket,
  risk_level,
  COUNT(*)::INT               AS invoice_count,
  SUM(remaining_amount)       AS total_remaining,
  AVG(days_overdue)::INT      AS avg_days_overdue,
  MAX(days_overdue)::INT      AS max_days_overdue
FROM v_overdue_invoices
WHERE days_overdue > 0   -- เฉพาะ overdue จริงๆ (ไม่รวม due-soon)
GROUP BY aging_bucket, risk_level
ORDER BY
  CASE aging_bucket
    WHEN '90+ days'   THEN 1
    WHEN '31-90 days' THEN 2
    WHEN '8-30 days'  THEN 3
    WHEN '1-7 days'   THEN 4
    ELSE 5
  END;

COMMENT ON VIEW v_overdue_aging_summary IS
  'สรุป AR aging ของ org จำแนกตาม aging bucket';

-- ============================================================================
-- 12. pg_cron: ตั้ง schedule รัน rpc_check_overdue_invoices ทุกวัน 08:00 ICT
--     (สร้างเฉพาะถ้า pg_cron extension พร้อม)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Unschedule เก่าก่อน (idempotent)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-overdue-invoices') THEN
      PERFORM cron.unschedule('check-overdue-invoices');
    END IF;

    -- Schedule ใหม่: ทุกวัน 01:00 UTC (= 08:00 ICT)
    PERFORM cron.schedule(
      'check-overdue-invoices',
      '0 1 * * *',   -- cron: ทุกวัน 01:00 UTC
      $cron$SELECT rpc_check_overdue_invoices(NULL, FALSE)$cron$
    );

    RAISE NOTICE 'pg_cron: check-overdue-invoices scheduled at 01:00 UTC daily';
  ELSE
    RAISE NOTICE 'pg_cron not available — use Edge Function cron to call rpc_check_overdue_invoices()';
  END IF;
END;
$$;

-- ============================================================================
-- 13. Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_check_overdue_invoices(UUID, BOOLEAN)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_list_overdue_invoices(BOOLEAN, INT, INT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_acknowledge_notification(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_snooze_notification(UUID, INT)
  TO authenticated;

GRANT SELECT ON v_overdue_invoices     TO authenticated;
GRANT SELECT ON v_overdue_aging_summary TO authenticated;

-- ============================================================================
-- 14. Performance indices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_overdue
  ON invoices(due_date, remaining_amount, status, org_id)
  WHERE remaining_amount > 0
    AND status NOT IN ('PAID', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_notif_invoice_type_date
  ON invoice_notifications(invoice_id, notification_type, notification_date);

-- ============================================================================
-- END OF MIGRATION 0180
-- ============================================================================
--
-- Summary:
--   TABLE   : invoice_notifications (org_id RLS, idempotency constraint per day)
--   TRIGGER : trg_check_invoice_overdue → fn_check_invoice_overdue_on_update
--             Real-time: สร้าง notification เมื่อ invoice.remaining_amount เปลี่ยน
--   CRON    : pg_cron 'check-overdue-invoices' (01:00 UTC = 08:00 ICT)
--             หรือ Edge Function cron เรียก rpc_check_overdue_invoices()
--   RPC     : rpc_check_overdue_invoices  — manual scan + batch create (idempotent)
--   RPC     : rpc_list_overdue_invoices   — overdue dashboard per org
--   RPC     : rpc_acknowledge_notification — mark as read
--   RPC     : rpc_snooze_notification     — snooze 1-90 วัน (max 3 ครั้ง)
--   VIEW    : v_overdue_invoices          — real-time overdue list + aging bucket
--   VIEW    : v_overdue_aging_summary     — AR aging summary (1-7d, 8-30d, 31-90d, 90+)
--
-- Notification Classification:
--   overdue_1d  → เลยกำหนด 1+ วัน
--   overdue_7d  → เลยกำหนด 7+ วัน
--   overdue_30d → เลยกำหนด 30+ วัน
--   overdue_90d → เลยกำหนด 90+ วัน (bad debt risk → CRITICAL)
--   due_soon_3d → จะถึงกำหนดใน 1-3 วัน
--   due_soon_7d → จะถึงกำหนดใน 4-7 วัน
--
-- Edge Function integration (supabase/functions/notify-overdue/index.ts):
--   const { data } = await supabase.rpc('rpc_check_overdue_invoices', {
--     p_org_id: null, p_dry_run: false
--   })
--   // Then push data.notifications to email/LINE/Slack per org settings
-- ============================================================================

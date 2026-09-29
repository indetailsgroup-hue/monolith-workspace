-- =============================================================================
-- 0176_field_purchase_core.sql
-- Field Purchase Request: tables, audit log, RLS, RPCs
-- Depends on: 0002 (identity_binding, work_item), 0090 (installation_projects),
--             0049 (capture_type_config), 0080 (cloud_allowed column),
--             C12 helpers (resolve_actor, has_any_app_role, has_site_access,
--                          is_governance_role, fn_installation_is_member)
--
-- ADR-033: cloud_allowed=false — field_purchase_request contains project /
--          customer location context and must never be synced to cloud.
-- ADR-031: Approval postback signed with HMAC (handled in 0177).
-- ADR-028: Vendor matching via tax_id primary (downstream; not wired here).
-- Pattern: all mutations via SECURITY DEFINER RPC only (fail-closed RLS).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE field_purchase_status AS ENUM (
    'pending',    -- awaiting approver action
    'approved',   -- approver accepted
    'rejected',   -- approver declined
    'purchased',  -- cash/receipt uploaded by technician
    'closed'      -- reconciled / job-cost posted
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE field_purchase_level AS ENUM (
    'team_lead',          -- ≤ threshold A
    'project_manager',    -- threshold A < x ≤ threshold B
    'managing_director'   -- > threshold B
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THRESHOLDS CONFIG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_purchase_thresholds (
  level        field_purchase_level   PRIMARY KEY,
  max_amount   numeric(14, 2)         NOT NULL CHECK (max_amount > 0),
  role_key     text                   NOT NULL,  -- app_role key used by C12 helpers
  updated_at   timestamptz            NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_purchase_thresholds IS
  '⚠️  OWNER ACTION REQUIRED: update max_amount values before go-live. '
  'Placeholder: team_lead ≤ 3,000 THB | project_manager ≤ 10,000 THB | '
  'managing_director = any amount above. role_key must match app_role enum.';

COMMENT ON COLUMN field_purchase_thresholds.max_amount IS
  'Inclusive ceiling (THB). Requests exceeding all ceilings auto-escalate to managing_director.';

-- Placeholder seed — owner MUST review amounts before production deployment
INSERT INTO field_purchase_thresholds (level, max_amount, role_key) VALUES
  ('team_lead',          3000.00,  'installation_team_lead'),
  ('project_manager',   10000.00,  'project_manager'),
  ('managing_director', 99999999,  'managing_director')
ON CONFLICT (level) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MAIN TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_purchase_request (
  id               uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- context
  project_id       uuid                    NOT NULL
                     REFERENCES installation_projects(id) ON DELETE RESTRICT,
  work_item_id     uuid                    REFERENCES work_item(id) ON DELETE SET NULL,
  site_code        text                    NOT NULL,

  -- requester identity (resolved by resolve_actor() at creation time)
  requester        text                    NOT NULL,

  -- purchase details
  amount           numeric(14, 2)          NOT NULL CHECK (amount > 0),
  reason           text                    NOT NULL CHECK (char_length(trim(reason)) >= 5),
  photo_refs       jsonb                   NOT NULL DEFAULT '[]'::jsonb
                     CHECK (jsonb_typeof(photo_refs) = 'array'),
  item_hint        text,                  -- free-text product hint (e.g. "บานพับ Blum 10 ตัว")

  -- approval state machine
  status           field_purchase_status   NOT NULL DEFAULT 'pending',
  approval_level   field_purchase_level,
  approver         text,                  -- employee_id of approver (set on decision)
  approved_at      timestamptz,
  rejection_note   text,

  -- idempotency / LINE linkage
  idempotency_key  text                    UNIQUE,  -- LINE message_id or client UUID
  line_message_id  text,                  -- originating LINE image message_id

  -- timestamps
  created_at       timestamptz             NOT NULL DEFAULT now(),
  updated_at       timestamptz             NOT NULL DEFAULT now()
);

COMMENT ON TABLE  field_purchase_request IS
  'ADR-033: cloud_allowed=false. '
  'Contains project / location context — must never be synced to external cloud. '
  'All column mutations via SECURITY DEFINER RPC only (no client write path).';

COMMENT ON COLUMN field_purchase_request.photo_refs IS
  'JSON array of {url, storage_key, mime_type}. '
  'Min 1 element required at creation. Stored in project-scoped private bucket.';

COMMENT ON COLUMN field_purchase_request.idempotency_key IS
  'Deduplication key. Set to LINE image message_id when request originates from LINE bot. '
  'Prevents duplicate creation on webhook retry.';

COMMENT ON COLUMN field_purchase_request.approval_level IS
  'Determined at creation from field_purchase_thresholds. Cannot change after creation.';

-- ── updated_at maintenance ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_fpr_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fpr_updated_at ON field_purchase_request;
CREATE TRIGGER tg_fpr_updated_at
  BEFORE UPDATE ON field_purchase_request
  FOR EACH ROW EXECUTE FUNCTION fn_fpr_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AUDIT LOG (append-only — pattern mirrors 0050_capture_audit.sql)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_purchase_audit_log (
  id           bigserial               PRIMARY KEY,
  request_id   uuid                    NOT NULL
                 REFERENCES field_purchase_request(id) ON DELETE RESTRICT,
  actor        text                    NOT NULL,  -- employee_id from app.actor GUC
  event_type   text                    NOT NULL,  -- created | status_changed | escalated
  old_status   field_purchase_status,
  new_status   field_purchase_status,
  metadata     jsonb                   NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz             NOT NULL DEFAULT now()
);

COMMENT ON TABLE field_purchase_audit_log IS
  'Append-only audit trail for field_purchase_request. '
  'UPDATE and DELETE are blocked by fn_fpr_audit_immutable trigger.';

-- ── immutability guard ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_fpr_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'fpr_audit_immutable: % on field_purchase_audit_log is forbidden (append-only)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS tg_fpr_audit_immutable ON field_purchase_audit_log;
CREATE TRIGGER tg_fpr_audit_immutable
  BEFORE UPDATE OR DELETE ON field_purchase_audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_fpr_audit_immutable();

-- ── status-transition audit trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_fpr_audit_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO field_purchase_audit_log
      (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
      NEW.id,
      COALESCE(current_setting('app.actor', true), 'system'),
      'status_changed',
      OLD.status,
      NEW.status,
      jsonb_build_object(
        'approver',        NEW.approver,
        'approval_level',  NEW.approval_level,
        'amount',          NEW.amount,
        'rejection_note',  NEW.rejection_note,
        'approved_at',     NEW.approved_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fpr_status_audit ON field_purchase_request;
CREATE TRIGGER tg_fpr_status_audit
  AFTER UPDATE ON field_purchase_request
  FOR EACH ROW EXECUTE FUNCTION fn_fpr_audit_transition();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE field_purchase_request    ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_purchase_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_purchase_audit_log  ENABLE ROW LEVEL SECURITY;

-- ── field_purchase_request ────────────────────────────────────────────────────
-- SELECT: governance OR site staff OR project member (fail-closed: no write policies)
CREATE POLICY fpr_select ON field_purchase_request
  FOR SELECT USING (
    is_governance_role()
    OR has_site_access(site_code)
    OR fn_installation_is_member(project_id)
  );
-- No INSERT / UPDATE / DELETE policies → clients cannot write directly (RPC only)

-- ── field_purchase_thresholds ─────────────────────────────────────────────────
-- All roles involved in the approval chain may read thresholds.
-- Only governance can modify.
CREATE POLICY fpt_read ON field_purchase_thresholds
  FOR SELECT USING (
    is_governance_role()
    OR has_any_app_role(ARRAY[
      'installation_team_lead', 'project_manager', 'managing_director'
    ])
  );

CREATE POLICY fpt_admin ON field_purchase_thresholds
  FOR ALL USING (is_governance_role());

-- ── field_purchase_audit_log ──────────────────────────────────────────────────
CREATE POLICY fpal_select ON field_purchase_audit_log
  FOR SELECT USING (
    is_governance_role()
    OR EXISTS (
      SELECT 1 FROM field_purchase_request r
      WHERE r.id = field_purchase_audit_log.request_id
        AND (has_site_access(r.site_code) OR fn_installation_is_member(r.project_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CAPTURE TYPE CONFIG SEED
-- ─────────────────────────────────────────────────────────────────────────────
-- Registers field_purchase_request as a capture type.
-- cloud_allowed=false is LOCKED — the ON CONFLICT clause hard-codes it to
-- prevent an accidental flip by a later migration (ADR-033).
-- Add description column if not already present (column added in 0176; table from 0049)
ALTER TABLE public.capture_type_config ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO capture_type_config (
  capture_type,
  field_schema,
  critical_fields,
  commit_target,
  cloud_allowed,
  description
) VALUES (
  'field_purchase_request',
  '{"amount":"number","reason":"string","photo_refs":"array","item_hint":"string"}'::jsonb,
  ARRAY['amount'],
  'purchase_approval',
  false,
  'Field purchase request initiated by technician from project site. '
  'cloud_allowed=false per ADR-033: contains project/location context.'
)
ON CONFLICT (capture_type) DO UPDATE SET
  field_schema    = EXCLUDED.field_schema,
  critical_fields = EXCLUDED.critical_fields,
  commit_target   = EXCLUDED.commit_target,
  cloud_allowed   = false,         -- cannot be flipped true — ADR-033 lock
  description     = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 7a. CREATE ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_create_field_purchase_request(
  p_project_id       uuid,
  p_amount           numeric,
  p_reason           text,
  p_photo_refs       jsonb,
  p_work_item_id     uuid    DEFAULT NULL,
  p_item_hint        text    DEFAULT NULL,
  p_line_message_id  text    DEFAULT NULL,
  p_idempotency_key  text    DEFAULT NULL   -- set to LINE image message_id from bot layer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor      text;
  v_site_code  text;
  v_level      field_purchase_level;
  v_role_key   text;
  v_id         uuid;
BEGIN
  v_actor := resolve_actor();

  -- Input validation
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'rpc_create_fpr: amount must be positive, got %', p_amount;
  END IF;
  IF p_photo_refs IS NULL OR jsonb_array_length(p_photo_refs) = 0 THEN
    RAISE EXCEPTION 'rpc_create_fpr: at least one photo_ref is required';
  END IF;
  IF char_length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'rpc_create_fpr: reason too short (min 5 chars)';
  END IF;

  -- Idempotency: return existing record if key already used
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM field_purchase_request
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'request_id', v_id,
        'created',    false,
        'duplicate',  true
      );
    END IF;
  END IF;

  -- Derive site_code from project (authoritative source)
  SELECT site_code INTO v_site_code
  FROM installation_projects
  WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_create_fpr: project % not found', p_project_id;
  END IF;

  -- Determine approval level: lowest ceiling that covers the amount
  SELECT level, role_key INTO v_level, v_role_key
  FROM field_purchase_thresholds
  WHERE max_amount >= p_amount
  ORDER BY max_amount ASC
  LIMIT 1;

  -- No ceiling found → exceeds all thresholds → managing_director required
  IF NOT FOUND THEN
    SELECT level, role_key INTO v_level, v_role_key
    FROM field_purchase_thresholds
    WHERE level = 'managing_director';
  END IF;

  -- Insert request
  INSERT INTO field_purchase_request (
    project_id, work_item_id, site_code, requester,
    amount, reason, photo_refs, item_hint,
    approval_level, idempotency_key, line_message_id
  ) VALUES (
    p_project_id, p_work_item_id, v_site_code, v_actor,
    p_amount, p_reason, p_photo_refs, p_item_hint,
    v_level, p_idempotency_key, p_line_message_id
  )
  RETURNING id INTO v_id;

  -- Creation audit event (not a status transition; insert directly)
  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, new_status, metadata)
  VALUES (
    v_id, v_actor, 'created', 'pending',
    jsonb_build_object(
      'amount',         p_amount,
      'project_id',     p_project_id,
      'approval_level', v_level,
      'role_key',       v_role_key
    )
  );

  RETURN jsonb_build_object(
    'request_id',     v_id,
    'approval_level', v_level,
    'role_key',       v_role_key,
    'site_code',      v_site_code,
    'created',        true,
    'duplicate',      false
  );
END;
$$;

-- ── 7b. APPROVE ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_approve_field_purchase_request(
  p_request_id      uuid,
  p_postback_token  text  DEFAULT NULL  -- HMAC token passed from LINE postback (ADR-031)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor    text;
  v_req      field_purchase_request%ROWTYPE;
  v_role_key text;
BEGIN
  v_actor := resolve_actor();

  SELECT * INTO v_req
  FROM field_purchase_request
  WHERE id = p_request_id
  FOR UPDATE;                         -- serialise concurrent approval attempts

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_approve_fpr: request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION
      'rpc_approve_fpr: request % is %, expected pending',
      p_request_id, v_req.status;
  END IF;

  -- Authority check: actor must hold the required role for this level (fail-closed)
  SELECT role_key INTO v_role_key
  FROM field_purchase_thresholds
  WHERE level = v_req.approval_level;

  IF NOT has_any_app_role(ARRAY[v_role_key, 'managing_director', 'governance']) THEN
    RAISE EXCEPTION
      'rpc_approve_fpr: actor % lacks authority for approval level %',
      v_actor, v_req.approval_level;
  END IF;

  -- Set actor GUC so the AFTER trigger records the correct approver identity
  PERFORM set_config('app.actor', v_actor, true);

  UPDATE field_purchase_request
  SET status      = 'approved',
      approver    = v_actor,
      approved_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id',  p_request_id,
    'status',      'approved',
    'approver',    v_actor,
    'approved_at', now()
  );
END;
$$;

-- ── 7c. REJECT ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_reject_field_purchase_request(
  p_request_id     uuid,
  p_rejection_note text  DEFAULT NULL,
  p_postback_token text  DEFAULT NULL   -- HMAC token from LINE postback (ADR-031)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor    text;
  v_req      field_purchase_request%ROWTYPE;
  v_role_key text;
BEGIN
  v_actor := resolve_actor();

  SELECT * INTO v_req
  FROM field_purchase_request
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_reject_fpr: request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION
      'rpc_reject_fpr: request % is %, expected pending',
      p_request_id, v_req.status;
  END IF;

  SELECT role_key INTO v_role_key
  FROM field_purchase_thresholds
  WHERE level = v_req.approval_level;

  IF NOT has_any_app_role(ARRAY[v_role_key, 'managing_director', 'governance']) THEN
    RAISE EXCEPTION
      'rpc_reject_fpr: actor % lacks authority for approval level %',
      v_actor, v_req.approval_level;
  END IF;

  PERFORM set_config('app.actor', v_actor, true);

  UPDATE field_purchase_request
  SET status         = 'rejected',
      approver       = v_actor,
      approved_at    = now(),
      rejection_note = COALESCE(NULLIF(trim(p_rejection_note), ''), '–')
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'request_id',     p_request_id,
    'status',         'rejected',
    'approver',       v_actor,
    'rejection_note', p_rejection_note
  );
END;
$$;

-- ── 7d. MARK PURCHASED (receipt upload) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_mark_field_purchase_purchased(
  p_request_id    uuid,
  p_receipt_refs  jsonb   -- [{url, storage_key, mime_type}]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_req   field_purchase_request%ROWTYPE;
BEGIN
  v_actor := resolve_actor();

  SELECT * INTO v_req FROM field_purchase_request WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_mark_purchased_fpr: request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION
      'rpc_mark_purchased_fpr: request % is %, expected approved',
      p_request_id, v_req.status;
  END IF;
  -- Only original requester or governance can mark as purchased
  IF v_actor <> v_req.requester AND NOT is_governance_role() THEN
    RAISE EXCEPTION
      'rpc_mark_purchased_fpr: actor % is not the requester for request %',
      v_actor, p_request_id;
  END IF;

  PERFORM set_config('app.actor', v_actor, true);

  UPDATE field_purchase_request
  SET status     = 'purchased',
      photo_refs = photo_refs || p_receipt_refs  -- append receipt refs to photo_refs
  WHERE id = p_request_id;

  INSERT INTO field_purchase_audit_log
    (request_id, actor, event_type, old_status, new_status, metadata)
  VALUES (
    p_request_id, v_actor, 'receipt_uploaded', 'approved', 'purchased',
    jsonb_build_object('receipt_refs', p_receipt_refs)
  );

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'purchased');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- Block all direct client writes (fail-closed).
-- SECURITY DEFINER RPCs bypass RLS and write via elevated privilege.
REVOKE INSERT, UPDATE, DELETE
  ON field_purchase_request, field_purchase_audit_log, field_purchase_thresholds
  FROM PUBLIC, anon, authenticated;

-- Read access is governed by RLS policies defined above.
GRANT SELECT ON field_purchase_request    TO authenticated;
GRANT SELECT ON field_purchase_audit_log  TO authenticated;
GRANT SELECT ON field_purchase_thresholds TO authenticated;

-- RPC execution grants
GRANT EXECUTE ON FUNCTION rpc_create_field_purchase_request       TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_approve_field_purchase_request      TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_reject_field_purchase_request       TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_mark_field_purchase_purchased       TO authenticated;


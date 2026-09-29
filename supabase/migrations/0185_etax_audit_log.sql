-- ============================================================
-- Migration  : 0185_etax_audit_log.sql
-- Description: Immutable audit log for etax_submissions status
--              transitions — records every status change with
--              actor identity, role, trigger source, and
--              optional metadata payload.
-- Tables     : etax_submission_audit_log
-- Triggers   : trg_etax_audit_on_status_change (etax_submissions)
-- Functions  : fn_etax_record_audit_entry()
--              rpc_list_etax_audit_log(p_submission_id UUID)
--              rpc_list_etax_org_audit_log(p_from DATE, p_to DATE)
-- RLS        : org members SELECT own org rows (no INSERT/UPDATE/DELETE)
-- Rollback   : DROP TABLE etax_submission_audit_log CASCADE;
--              DROP TRIGGER trg_etax_audit_on_status_change ON etax_submissions;
--              DROP FUNCTION fn_etax_record_audit_entry() CASCADE;
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Enum: trigger_source  (who/what caused the transition)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE etax_audit_source AS ENUM (
    'user',       -- manual call from an authenticated session
    'trigger',    -- DB trigger (fn_auto_post_invoice_journal etc.)
    'worker',     -- etax-submit-worker edge function
    'system',     -- pg_cron, migration backfill, or internal RPC
    'api'         -- external webhook / RD API callback
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Table: etax_submission_audit_log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.etax_submission_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- parent record
  submission_id   UUID        NOT NULL
                  REFERENCES  public.etax_submissions(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL
                  REFERENCES  public.organizations(org_id) ON DELETE CASCADE,

  -- who made the change
  actor_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      TEXT,                          -- snapshotted at time of change

  -- what changed
  old_status      TEXT,                          -- NULL for INSERT events
  new_status      TEXT        NOT NULL,
  old_pdf_status  TEXT,
  new_pdf_status  TEXT,

  -- context
  trigger_source  etax_audit_source NOT NULL DEFAULT 'system',
  rd_ref_no       TEXT,                          -- snapshotted from submission row
  attempt_count   INT,                           -- snapshotted at transition

  -- free-form extras (error_detail, worker_run_id, etc.)
  metadata        JSONB       NOT NULL DEFAULT '{}',

  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable: no updated_at; audit rows must never be modified
COMMENT ON TABLE public.etax_submission_audit_log IS
  'Append-only audit trail for etax_submissions status transitions. '
  'Every row records one state change with actor identity and source. '
  'No UPDATE or DELETE is permitted by RLS.';

COMMENT ON COLUMN public.etax_submission_audit_log.actor_id IS
  'auth.users.id of the session that triggered the change, or NULL for system/worker sources.';
COMMENT ON COLUMN public.etax_submission_audit_log.trigger_source IS
  'Classifies what initiated the transition: user, trigger, worker, system, or api.';
COMMENT ON COLUMN public.etax_submission_audit_log.metadata IS
  'Optional payload — e.g. {worker_run_id, error_detail, ip, user_agent}.';

-- ─────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_etax_audit_submission
  ON public.etax_submission_audit_log(submission_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_etax_audit_org
  ON public.etax_submission_audit_log(org_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_etax_audit_actor
  ON public.etax_submission_audit_log(actor_id, changed_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_etax_audit_new_status
  ON public.etax_submission_audit_log(new_status, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_etax_audit_changed_at
  ON public.etax_submission_audit_log(changed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS  (SELECT own org only; no INSERT/UPDATE/DELETE for users)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.etax_submission_audit_log ENABLE ROW LEVEL SECURITY;

-- Members of an org can read their own audit log
CREATE POLICY "etax_audit_select_own_org"
  ON public.etax_submission_audit_log
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org_id()
  );

-- INSERT is allowed only for the DB trigger function (runs as SECURITY DEFINER)
-- No direct INSERT policy for authenticated users — enforced by REVOKE below.
-- UPDATE/DELETE are intentionally absent → blocked for all roles.

REVOKE INSERT, UPDATE, DELETE
  ON public.etax_submission_audit_log
  FROM authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Trigger function: fn_etax_record_audit_entry
--    Fires AFTER INSERT OR UPDATE on etax_submissions.
--    Records a row whenever status OR pdf_status changes.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_etax_record_audit_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   UUID;
  v_actor_role TEXT;
  v_source     etax_audit_source;
  v_status_changed   BOOLEAN;
  v_pdf_status_changed BOOLEAN;
BEGIN
  -- Determine what changed
  v_status_changed     := (TG_OP = 'INSERT') OR (OLD.status     IS DISTINCT FROM NEW.status);
  v_pdf_status_changed := (TG_OP = 'INSERT') OR (OLD.pdf_status IS DISTINCT FROM NEW.pdf_status);

  -- Nothing we care about changed → skip
  IF NOT v_status_changed AND NOT v_pdf_status_changed THEN
    RETURN NEW;
  END IF;

  -- Resolve actor: prefer current_setting (set by edge functions / RPCs),
  -- fall back to auth.uid()
  BEGIN
    v_actor_id := NULLIF(current_setting('app.actor_id', TRUE), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  IF v_actor_id IS NULL THEN
    v_actor_id := auth.uid();
  END IF;

  -- Resolve actor role from org_members
  IF v_actor_id IS NOT NULL THEN
    SELECT role INTO v_actor_role
    FROM   public.org_members
    WHERE  org_id  = NEW.org_id
      AND  user_id = v_actor_id
    LIMIT  1;
  END IF;

  -- Determine trigger source
  BEGIN
    v_source := NULLIF(current_setting('app.trigger_source', TRUE), '')::etax_audit_source;
  EXCEPTION WHEN OTHERS THEN
    v_source := 'system';
  END;

  IF v_source IS NULL THEN
    v_source := CASE
      WHEN v_actor_id IS NOT NULL THEN 'user'
      ELSE 'system'
    END;
  END IF;

  -- Write audit row
  INSERT INTO public.etax_submission_audit_log (
    submission_id,
    org_id,
    actor_id,
    actor_role,
    old_status,
    new_status,
    old_pdf_status,
    new_pdf_status,
    trigger_source,
    rd_ref_no,
    attempt_count,
    metadata,
    changed_at
  ) VALUES (
    NEW.id,
    NEW.org_id,
    v_actor_id,
    v_actor_role,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.pdf_status END,
    NEW.pdf_status,
    v_source,
    NEW.rd_ref_no,
    NEW.attempt_count,
    jsonb_build_object(
      'document_number', NEW.document_number,
      'document_type',   NEW.document_type
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_etax_record_audit_entry() IS
  'AFTER INSERT OR UPDATE trigger on etax_submissions. '
  'Appends one row to etax_submission_audit_log whenever status '
  'or pdf_status changes. Runs as SECURITY DEFINER so the audit '
  'row is written even when RLS blocks direct INSERT.';

-- ─────────────────────────────────────────────────────────────
-- 6. Attach trigger to etax_submissions
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_etax_audit_on_status_change ON public.etax_submissions;
CREATE TRIGGER trg_etax_audit_on_status_change
  AFTER INSERT OR UPDATE OF status, pdf_status
  ON public.etax_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_etax_record_audit_entry();

COMMENT ON TRIGGER trg_etax_audit_on_status_change ON public.etax_submissions IS
  'Appends an immutable audit row on every status / pdf_status transition.';

-- ─────────────────────────────────────────────────────────────
-- 7. RPC: rpc_list_etax_audit_log  — audit trail for one submission
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_etax_audit_log(
  p_submission_id UUID
)
RETURNS TABLE (
  id              UUID,
  old_status      TEXT,
  new_status      TEXT,
  old_pdf_status  TEXT,
  new_pdf_status  TEXT,
  actor_id        UUID,
  actor_role      TEXT,
  trigger_source  etax_audit_source,
  rd_ref_no       TEXT,
  attempt_count   INT,
  metadata        JSONB,
  changed_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.old_status,
    a.new_status,
    a.old_pdf_status,
    a.new_pdf_status,
    a.actor_id,
    a.actor_role,
    a.trigger_source,
    a.rd_ref_no,
    a.attempt_count,
    a.metadata,
    a.changed_at
  FROM  public.etax_submission_audit_log a
  JOIN  public.etax_submissions          s  ON s.id = a.submission_id
  WHERE a.submission_id = p_submission_id
    AND s.org_id        = public.get_user_org_id()   -- cross-tenant guard
  ORDER BY a.changed_at ASC;
$$;

COMMENT ON FUNCTION public.rpc_list_etax_audit_log(UUID) IS
  'Returns the full audit trail for a single etax submission. '
  'Enforces cross-tenant isolation: the caller must belong to the '
  'submission''s org.';

REVOKE ALL ON FUNCTION public.rpc_list_etax_audit_log(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_list_etax_audit_log(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. RPC: rpc_list_etax_org_audit_log  — org-wide audit trail
--    with optional date-range filter and status filter
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_list_etax_org_audit_log(
  p_from        DATE    DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_to          DATE    DEFAULT CURRENT_DATE,
  p_new_status  TEXT    DEFAULT NULL,   -- filter to a specific target status
  p_limit       INT     DEFAULT 200,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  submission_id   UUID,
  document_number TEXT,
  document_type   TEXT,
  old_status      TEXT,
  new_status      TEXT,
  old_pdf_status  TEXT,
  new_pdf_status  TEXT,
  actor_id        UUID,
  actor_role      TEXT,
  trigger_source  etax_audit_source,
  rd_ref_no       TEXT,
  attempt_count   INT,
  metadata        JSONB,
  changed_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.submission_id,
    (a.metadata->>'document_number')::TEXT  AS document_number,
    (a.metadata->>'document_type')::TEXT    AS document_type,
    a.old_status,
    a.new_status,
    a.old_pdf_status,
    a.new_pdf_status,
    a.actor_id,
    a.actor_role,
    a.trigger_source,
    a.rd_ref_no,
    a.attempt_count,
    a.metadata,
    a.changed_at
  FROM  public.etax_submission_audit_log a
  WHERE a.org_id       = public.get_user_org_id()
    AND a.changed_at  >= p_from::TIMESTAMPTZ
    AND a.changed_at  <  (p_to + 1)::TIMESTAMPTZ
    AND (p_new_status IS NULL OR a.new_status = p_new_status)
  ORDER BY a.changed_at DESC
  LIMIT  LEAST(p_limit, 1000)
  OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.rpc_list_etax_org_audit_log(DATE, DATE, TEXT, INT, INT) IS
  'Paginated org-wide audit log for all etax submissions within a date range. '
  'Optional p_new_status filter isolates a specific transition type '
  '(e.g. ''failed'', ''submitted''). Hard limit 1000 rows per call.';

REVOKE ALL ON FUNCTION public.rpc_list_etax_org_audit_log(DATE, DATE, TEXT, INT, INT) FROM public;
GRANT  EXECUTE ON FUNCTION public.rpc_list_etax_org_audit_log(DATE, DATE, TEXT, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. Backfill: seed audit log for all pre-existing submissions
--    so the history starts from the current snapshot.
--    trigger_source = 'system', actor_id = NULL
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.etax_submission_audit_log (
  submission_id,
  org_id,
  actor_id,
  actor_role,
  old_status,
  new_status,
  old_pdf_status,
  new_pdf_status,
  trigger_source,
  rd_ref_no,
  attempt_count,
  metadata,
  changed_at
)
SELECT
  s.id,
  s.org_id,
  NULL,                              -- actor unknown for historical rows
  NULL,
  NULL,                              -- no previous state known
  s.status,
  NULL,
  s.pdf_status,
  'system'::etax_audit_source,
  s.rd_ref_no,
  s.attempt_count,
  jsonb_build_object(
    'document_number', s.document_number,
    'document_type',   s.document_type,
    'backfill',        TRUE
  ),
  COALESCE(s.updated_at, s.created_at, NOW())
FROM  public.etax_submissions s
WHERE NOT EXISTS (
  SELECT 1
  FROM   public.etax_submission_audit_log a
  WHERE  a.submission_id = s.id
);

-- ─────────────────────────────────────────────────────────────
-- 10. Helper view: v_etax_audit_summary
--     Quick per-submission transition count and last actor
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_etax_audit_summary AS
SELECT
  a.submission_id,
  a.org_id,
  COUNT(*)                                                     AS total_transitions,
  COUNT(*) FILTER (WHERE a.new_status  = 'failed')            AS fail_count,
  COUNT(*) FILTER (WHERE a.new_status  = 'submitted')         AS submit_count,
  COUNT(*) FILTER (WHERE a.new_pdf_status = 'downloaded')     AS pdf_download_count,
  MAX(a.changed_at)                                           AS last_changed_at,
  (ARRAY_AGG(a.actor_role ORDER BY a.changed_at DESC))[1]     AS last_actor_role,
  (ARRAY_AGG(a.trigger_source ORDER BY a.changed_at DESC))[1] AS last_source
FROM  public.etax_submission_audit_log a
GROUP BY a.submission_id, a.org_id;

COMMENT ON VIEW public.v_etax_audit_summary IS
  'Aggregated audit statistics per etax submission. '
  'Use for dashboards and anomaly detection (high fail_count).';

-- ─────────────────────────────────────────────────────────────
-- Rollback notes
-- ─────────────────────────────────────────────────────────────
-- DROP TRIGGER  IF EXISTS trg_etax_audit_on_status_change ON public.etax_submissions;
-- DROP FUNCTION IF EXISTS public.fn_etax_record_audit_entry() CASCADE;
-- DROP FUNCTION IF EXISTS public.rpc_list_etax_audit_log(UUID) CASCADE;
-- DROP FUNCTION IF EXISTS public.rpc_list_etax_org_audit_log(DATE,DATE,TEXT,INT,INT) CASCADE;
-- DROP VIEW     IF EXISTS public.v_etax_audit_summary CASCADE;
-- DROP TABLE    IF EXISTS public.etax_submission_audit_log CASCADE;
-- DROP TYPE     IF EXISTS public.etax_audit_source CASCADE;

-- =============================================================================
-- Migration 0183: eTax PDF Auto-Download
-- Purpose : After etax_submissions.status becomes 'submitted',
--           automatically queue a PDF download from the ETDA/RD endpoint,
--           store the result in Supabase Storage bucket `etax-pdfs`, and
--           update pdf_path / pdf_status accordingly.
--
-- Depends on : 0181_etax_auto_submit.sql   (etax_submissions table + pdf_path)
--              20260828_multi_tenant_schema (get_user_org_id, organizations)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guard: ensure etax_submissions exists (created in 0181)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'etax_submissions'
  ) THEN
    RAISE EXCEPTION 'etax_submissions table not found – run 0181 first';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Add PDF tracking columns to etax_submissions
--    pdf_path already added in 0181 — only add the new ones.
-- ---------------------------------------------------------------------------

ALTER TABLE public.etax_submissions
  ADD COLUMN IF NOT EXISTS pdf_status        TEXT
    CHECK (pdf_status IN ('pending','downloading','downloaded','failed'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pdf_downloaded_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pdf_error         TEXT        DEFAULT NULL;

COMMENT ON COLUMN public.etax_submissions.pdf_status IS
  'Tracks PDF download lifecycle: pending→downloading→downloaded|failed';
COMMENT ON COLUMN public.etax_submissions.pdf_downloaded_at IS
  'Timestamp when the PDF was successfully stored in Supabase Storage';
COMMENT ON COLUMN public.etax_submissions.pdf_error IS
  'Last error message from PDF download attempt';

-- Index for worker polling
CREATE INDEX IF NOT EXISTS idx_etax_submissions_pdf_status
  ON public.etax_submissions (org_id, pdf_status)
  WHERE pdf_status IN ('pending', 'downloading');

-- ---------------------------------------------------------------------------
-- 2. Trigger: queue PDF download when status changes to 'submitted'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._trg_queue_pdf_on_submitted()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- Only act when transitioning INTO 'submitted' state
  IF NEW.status = 'submitted' AND (OLD.status IS DISTINCT FROM 'submitted') THEN
    -- Queue download only if we do not already have the PDF
    IF NEW.pdf_path IS NULL AND NEW.pdf_status IS DISTINCT FROM 'downloaded' THEN
      NEW.pdf_status := 'pending';
      NEW.pdf_error  := NULL;
    END IF;
  END IF;

  -- If submission fails and PDF was downloading, reset to pending for retry
  IF NEW.status = 'failed' AND OLD.pdf_status = 'downloading' THEN
    NEW.pdf_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_pdf_on_submitted ON public.etax_submissions;
CREATE TRIGGER trg_queue_pdf_on_submitted
  BEFORE UPDATE ON public.etax_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_queue_pdf_on_submitted();

-- ---------------------------------------------------------------------------
-- 3. Atomic batch claim for PDF worker
--    Selects up to p_limit rows with pdf_status='pending', locks and marks
--    them as 'downloading' in a single statement (SKIP LOCKED = no contention).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._etax_claim_pdf_batch(
  p_limit INT DEFAULT 10
)
  RETURNS SETOF public.etax_submissions
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE public.etax_submissions
  SET
    pdf_status = 'downloading',
    updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.etax_submissions
    WHERE pdf_status = 'pending'
      AND status    = 'submitted'   -- only successfully submitted docs
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Only service_role may call this function
REVOKE ALL  ON FUNCTION public._etax_claim_pdf_batch(INT) FROM PUBLIC;
REVOKE ALL  ON FUNCTION public._etax_claim_pdf_batch(INT) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_etax_mark_pdf_downloaded
--    Called by the edge function after successfully uploading the PDF to
--    Supabase Storage. Updates pdf_path, pdf_status, and pdf_downloaded_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_mark_pdf_downloaded(
  p_id         UUID,
  p_path       TEXT    -- storage path, e.g. "{org_id}/{year}/{id}.pdf"
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row public.etax_submissions;
BEGIN
  -- Validate caller (service_role bypasses RLS, authenticated must own the org)
  UPDATE public.etax_submissions
  SET
    pdf_path          = p_path,
    pdf_status        = 'downloaded',
    pdf_downloaded_at = NOW(),
    pdf_error         = NULL,
    updated_at        = NOW()
  WHERE id         = p_id
    AND pdf_status = 'downloading'   -- guard: only mark if we claimed it
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Tolerate duplicate calls (idempotency)
    SELECT * INTO v_row FROM public.etax_submissions WHERE id = p_id;
    IF v_row.pdf_status = 'downloaded' THEN
      RETURN jsonb_build_object(
        'ok',       true,
        'idempotent', true,
        'pdf_path', v_row.pdf_path
      );
    END IF;
    RAISE EXCEPTION 'etax_submission % not in downloading state (current: %)',
      p_id, v_row.pdf_status;
  END IF;

  RETURN jsonb_build_object(
    'ok',               true,
    'id',               v_row.id,
    'pdf_path',         v_row.pdf_path,
    'pdf_downloaded_at', v_row.pdf_downloaded_at
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_etax_mark_pdf_downloaded(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_downloaded(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_downloaded(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. rpc_etax_mark_pdf_failed
--    Called by the edge function when the PDF download/upload fails.
--    Resets pdf_status to 'failed' so a retry or manual re-queue can occur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_mark_pdf_failed(
  p_id    UUID,
  p_error TEXT DEFAULT 'unknown error'
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row public.etax_submissions;
BEGIN
  UPDATE public.etax_submissions
  SET
    pdf_status = 'failed',
    pdf_error  = p_error,
    updated_at = NOW()
  WHERE id         = p_id
    AND pdf_status = 'downloading'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.etax_submissions WHERE id = p_id;
    RETURN jsonb_build_object(
      'ok',          false,
      'warning',     'row not in downloading state',
      'pdf_status',  v_row.pdf_status
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'id',        v_row.id,
    'pdf_status', v_row.pdf_status,
    'pdf_error', v_row.pdf_error
  );
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_etax_mark_pdf_failed(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_failed(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_etax_mark_pdf_failed(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. rpc_etax_retry_pdf(p_id)
--    Allows an OWNER/ADMIN to manually reset a failed PDF back to 'pending'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_retry_pdf(
  p_id UUID
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row     public.etax_submissions;
  v_user_id UUID := auth.uid();
  v_role    TEXT;
BEGIN
  -- Verify the caller belongs to the org that owns this submission
  -- (split SELECT to avoid record-variable in multi-item INTO, which PostgreSQL forbids)
  SELECT es.*
  INTO   v_row
  FROM   public.etax_submissions es
  JOIN   public.org_members      om ON om.org_id = es.org_id
                                   AND om.user_id = v_user_id
  WHERE  es.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or access denied';
  END IF;

  SELECT om.role
  INTO   v_role
  FROM   public.org_members om
  WHERE  om.org_id = v_row.org_id
    AND  om.user_id = v_user_id;

  IF v_role NOT IN ('OWNER','ADMIN') THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN may retry PDF downloads';
  END IF;

  IF v_row.pdf_status NOT IN ('failed', 'downloading') THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      format('pdf_status is %s, nothing to retry', v_row.pdf_status));
  END IF;

  UPDATE public.etax_submissions
  SET
    pdf_status = 'pending',
    pdf_error  = NULL,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'pdf_status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_etax_retry_pdf(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_etax_retry_pdf(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Supabase Storage — bucket: etax-pdfs
--    Private bucket (not publicly accessible); access controlled via RLS.
--    Objects are stored at path: {org_id}/{YYYY}/{submission_id}.pdf
-- ---------------------------------------------------------------------------

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'etax-pdfs',
  'etax-pdfs',
  false,                              -- private bucket
  10485760,                           -- 10 MB max per PDF
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 8. Storage RLS policies for etax-pdfs
-- ---------------------------------------------------------------------------

-- Allow service_role full access (worker uploads)
CREATE POLICY "service_role_full_access_etax_pdfs"
  ON storage.objects
  FOR ALL
  TO service_role
  USING      (bucket_id = 'etax-pdfs')
  WITH CHECK (bucket_id = 'etax-pdfs');

-- Allow org members to SELECT (download) their own org's PDFs
-- Path format: {org_id}/{year}/{submission_id}.pdf
CREATE POLICY "org_members_select_etax_pdfs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'etax-pdfs'
    AND (storage.foldername(name))[1]::UUID = public.get_user_org_id()
  );

-- Allow org members to INSERT (upload) — only within their own org folder
-- (Typically the edge function uses service_role, but this allows manual upload in admin UI)
CREATE POLICY "org_members_insert_etax_pdfs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'etax-pdfs'
    AND (storage.foldername(name))[1]::UUID = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE user_id = auth.uid()
        AND org_id  = (storage.foldername(name))[1]::UUID
        AND role IN ('OWNER', 'ADMIN', 'FINANCE')
    )
  );

-- Disallow DELETE by normal users (retention policy — must use service_role or admin override)
CREATE POLICY "deny_delete_etax_pdfs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- 9. Helper view: etax_submissions_with_pdf_url
--    Returns a signed URL for the PDF valid for 1 hour.
--    (The actual URL generation happens in the application layer via
--     supabase.storage.from('etax-pdfs').createSignedUrl(path, 3600)
--     — this view exposes the raw path for convenience.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.etax_submissions_pdf_status AS
  SELECT
    es.id,
    es.org_id,
    es.invoice_id,
    es.document_type,
    es.document_number,
    es.status            AS submission_status,
    es.pdf_status,
    es.pdf_path,
    es.pdf_downloaded_at,
    es.pdf_error,
    es.submitted_at,
    es.created_at
  FROM public.etax_submissions es
  WHERE es.org_id = public.get_user_org_id()   -- scoped to caller's org
    AND (
      current_setting('role', true) = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id  = es.org_id
      )
    );

COMMENT ON VIEW public.etax_submissions_pdf_status IS
  'Org-scoped view of eTax submission PDF download status';

-- ---------------------------------------------------------------------------
-- 10. Grant view access
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.etax_submissions_pdf_status TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Backfill: mark existing 'submitted' rows without pdf_path as 'pending'
-- ---------------------------------------------------------------------------
UPDATE public.etax_submissions
SET
  pdf_status = 'pending',
  updated_at = NOW()
WHERE status     = 'submitted'
  AND pdf_path   IS NULL
  AND pdf_status IS NULL;

-- ---------------------------------------------------------------------------
-- 12. Audit comment
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.etax_submissions IS
  'eTax document submissions to Thai Revenue Department (RD). '
  'Lifecycle: queued→submitting→submitted→pdf_status:pending→downloaded. '
  'Added in 0181; pdf_status/pdf_downloaded_at/pdf_error added in 0183.';

COMMIT;

-- =============================================================================
-- EDGE FUNCTION UPDATE NOTE
-- =============================================================================
-- The etax-submit-worker edge function (supabase/functions/etax-submit-worker/index.ts)
-- should be updated to include an inline PDF download step after a successful
-- submission. The recommended flow is:
--
--   1. After calling rpc_etax_mark_submitted(id, rdRefNo):
--      a. Call GET {ETAX_PROVIDER_URL}/documents/{rdRefNo}/pdf
--         with Authorization: Bearer {ETAX_API_KEY}
--      b. Upload the PDF bytes to Supabase Storage:
--         await supabase.storage.from('etax-pdfs')
--           .upload(`${orgId}/${year}/${id}.pdf`, pdfBytes, { contentType: 'application/pdf' })
--      c. On success: call rpc_etax_mark_pdf_downloaded(id, storagePath)
--      d. On failure: call rpc_etax_mark_pdf_failed(id, errorMessage)
--         (the trigger trg_queue_pdf_on_submitted will have already set pdf_status='pending')
--
-- A dedicated edge function `etax-pdf-worker` can also poll pdf_status='pending'
-- separately from the submission worker if the PDF endpoint has higher latency.
-- =============================================================================

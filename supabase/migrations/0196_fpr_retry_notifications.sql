-- =============================================================================
-- Migration 0196 — rpc_retry_fpr_notifications
--
-- Re-queues failed LINE outbound messages for approved field purchase requests
-- by resetting status from 'failed' → 'pending', allowing the LINE dispatch
-- worker to attempt delivery again.
--
-- Criteria for re-queue eligibility (all must hold):
--   a. line_oa_outbound_messages.status = 'failed'
--   b. template_key IN ('tpl_fpr_approval_flex_card', 'tpl_fpr_approved_flex_card')
--   c. Linked field_purchase_request.status = 'approved'
--      (notifications for closed/purchased/rejected requests are not retried)
--   d. field_purchase_request.approved_at < now() - p_older_than
--      (default: 5 minutes — avoids retrying mid-dispatch races)
--   e. Optional: p_site_code IS NULL OR field_purchase_request.site_code = p_site_code
--
-- Idempotency:
--   Rows already 'pending' or 'sent' are never touched (status = 'failed' guard).
--   Calling the function twice is safe — the second call finds no 'failed' rows
--   (assuming the worker has picked them up) and returns retried_count = 0.
--
-- Authority: project_manager | managing_director | is_governance_role()
--   Service-role callers (e.g. pg_cron) bypass the authority gate because they
--   bypass JWT role checking entirely.  Authenticated callers need PM/MD/gov role.
--
-- Return payload:
--   { ok, retried_count, cutoff, site_code, older_than, actor }
--
-- Parameters:
--   p_site_code   text      — optional site filter; NULL = all sites the caller can access
--   p_older_than  interval  — minimum age of approved_at before retry; default 5 minutes
--
-- Intended callers:
--   1. pg_cron (scheduled via migration 0196 or a separate cron migration)
--   2. PM/MD from the dashboard "Retry Failed Notifications" action
--
-- Depends on:
--   0176 (field_purchase_request)
--   0177 (line_oa_outbound_messages, rpc_route_fpr_approval_notification)
--   0194 (tpl_fpr_approved_flex_card template key constant)
--   C12  (resolve_actor, has_any_app_role, is_governance_role, has_site_access)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: rpc_retry_fpr_notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_retry_fpr_notifications(
    p_site_code  text     DEFAULT NULL,
    p_older_than interval DEFAULT interval '5 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor         text;
    v_cutoff        timestamptz;
    v_retried_count integer := 0;
BEGIN
    -- ── 1. Resolve actor ──────────────────────────────────────────────────────
    v_actor  := resolve_actor();
    PERFORM set_config('app.actor', v_actor, true);

    -- ── 2. Authority gate ─────────────────────────────────────────────────────
    --    Service-role bypasses JWT checks entirely; this gate only applies to
    --    authenticated JWT callers.
    IF NOT (
        has_any_app_role(ARRAY['project_manager', 'managing_director'])
        OR is_governance_role()
    ) THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'insufficient_privilege',
            'hint', 'Caller must hold project_manager, managing_director, or governance role'
        );
    END IF;

    -- ── 3. Validate p_older_than ──────────────────────────────────────────────
    --    Prevent callers from retrying messages that were queued mere seconds ago
    --    (race protection: the dispatch worker may still be processing them).
    IF p_older_than < interval '1 minute' THEN
        RETURN jsonb_build_object(
            'ok',   false,
            'code', 'invalid_parameter',
            'hint', 'p_older_than must be at least 1 minute to avoid dispatch races'
        );
    END IF;

    -- ── 4. Compute eligibility cutoff ─────────────────────────────────────────
    v_cutoff := now() - p_older_than;

    -- ── 5. Reset eligible failed rows to 'pending' ────────────────────────────
    --
    --    Join criteria:
    --      • oum.status = 'failed'                  — only re-queue failures
    --      • oum.template_key = FPR notification    — scope to FPR messages
    --      • r.status = 'approved'                  — only active-approval state
    --      • r.approved_at < v_cutoff               — older than threshold
    --      • site_code filter (optional)
    --      • has_site_access(r.site_code)           — caller cannot retry sites
    --                                                  they cannot access
    UPDATE public.line_oa_outbound_messages oum
       SET status = 'pending'
      FROM public.field_purchase_request r
     WHERE (oum.slot_values ->> 'request_id')::uuid = r.id
       AND oum.status       = 'failed'
       AND oum.template_key IN (
               'tpl_fpr_approval_flex_card',
               'tpl_fpr_approved_flex_card'
           )
       AND r.status      = 'approved'::field_purchase_status
       AND r.approved_at < v_cutoff
       AND (p_site_code IS NULL OR r.site_code = p_site_code)
       AND public.has_site_access(r.site_code);   -- fail-closed site access check

    GET DIAGNOSTICS v_retried_count = ROW_COUNT;

    -- ── 6. Append audit entry ─────────────────────────────────────────────────
    --    One audit record summarises the entire retry batch.
    --    We don't write per-outbound-message rows (those live in the outbound
    --    table itself); the field_purchase_audit_log only tracks request-level
    --    lifecycle events.  We therefore skip individual request inserts here
    --    and surface the retry as metadata in the response payload for callers
    --    to log if needed.

    -- ── 7. Return payload ─────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',            true,
        'retried_count', v_retried_count,
        'actor',         v_actor,
        'cutoff',        v_cutoff,
        'site_code',     p_site_code,
        'older_than',    p_older_than::text
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.rpc_retry_fpr_notifications(text, interval)
    FROM PUBLIC;

-- Authenticated callers (PM / MD / governance) — authority gate enforced inside
GRANT EXECUTE ON FUNCTION public.rpc_retry_fpr_notifications(text, interval)
    TO authenticated;

-- service_role can call directly (bypasses JWT gate — used by pg_cron schedules)
GRANT EXECUTE ON FUNCTION public.rpc_retry_fpr_notifications(text, interval)
    TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- pg_cron schedule — fire every 10 minutes to retry any failed FPR notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- Guard: extension must already be installed (0179 ensures this, so safe here)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Remove any prior schedule with this name (idempotent re-runs)
        PERFORM cron.unschedule('fpr-retry-failed-notifications')
          WHERE EXISTS (
              SELECT 1 FROM cron.job WHERE jobname = 'fpr-retry-failed-notifications'
          );

        -- Schedule: every 10 minutes, all sites, default 5-minute threshold
        PERFORM cron.schedule(
            'fpr-retry-failed-notifications',
            '*/10 * * * *',
            'SELECT public.rpc_retry_fpr_notifications(NULL, interval ''5 minutes'')'
        );

        RAISE NOTICE 'pg_cron schedule ''fpr-retry-failed-notifications'' registered (*/10).';
    ELSE
        RAISE NOTICE 'pg_cron not installed — skipping schedule registration.';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Comment
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.rpc_retry_fpr_notifications(text, interval) IS
'Re-queues failed LINE outbound messages for approved field purchase requests by
resetting line_oa_outbound_messages.status from ''failed'' to ''pending''.

Eligibility criteria (all must hold):
  • line_oa_outbound_messages.status = ''failed''
  • template_key IN (''tpl_fpr_approval_flex_card'', ''tpl_fpr_approved_flex_card'')
  • Linked field_purchase_request.status = ''approved''
  • field_purchase_request.approved_at < now() - p_older_than  (default: 5 min)
  • Caller has_site_access() for the linked request (fail-closed)
  • Optional p_site_code filter narrows to a single site

Idempotent: rows already ''pending'' or ''sent'' are never touched.
p_older_than minimum is 1 minute to prevent dispatch-race re-queuing.

Authority: project_manager | managing_director | governance.
Service-role callers (pg_cron) bypass the JWT authority gate.

Scheduled via migration 0196: cron job ''fpr-retry-failed-notifications'' runs */10.

Depends on: 0176 (field_purchase_request), 0177 (line_oa_outbound_messages),
            0194 (tpl_fpr_approved_flex_card), C12 helpers.
Migration: 0196.';

COMMIT;

-- ============================================================
-- Migration 0182 — rpc_get_fpr_approval_queue
--
-- Returns pending field_purchase_request rows that the calling
-- actor is authorised to approve, with an optional site_code
-- filter, ordered oldest-first (most urgent first).
--
-- Depends:
--   0176_field_purchase_core   — field_purchase_request,
--                                field_purchase_thresholds,
--                                field_purchase_level ENUM
--   C12 security helpers       — resolve_actor(), has_any_app_role(),
--                                has_site_access(), is_governance_role()
--
-- Security model:
--   SECURITY DEFINER — same pattern as rpc_approve_field_purchase_request
--   in 0176.  Function runs as the migration owner so it can JOIN
--   field_purchase_thresholds without granting SELECT to authenticated.
--   Authority is enforced inside the function body (fail-closed gate).
--   No client write path; read-only RETURN QUERY.
-- ============================================================

BEGIN;

-- ── Drop prior version if re-running idempotently ──────────
DROP FUNCTION IF EXISTS public.rpc_get_fpr_approval_queue(
    p_site_code text
);

-- ── Function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_fpr_approval_queue(
    p_site_code text DEFAULT NULL          -- NULL = all sites actor can see
)
RETURNS TABLE (
    request_id      uuid,
    project_id      uuid,
    work_item_id    uuid,
    site_code       text,
    requester       text,
    amount          numeric,
    reason          text,
    item_hint       text,
    photo_refs      jsonb,
    approval_level  public.field_purchase_level,
    line_message_id text,
    age_minutes     integer,
    created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor          text;
    v_can_approve_all boolean;
    v_levels         public.field_purchase_level[];
BEGIN
    -- ── Resolve caller ─────────────────────────────────────
    v_actor := public.resolve_actor();

    -- ── Fail-closed authority gate ─────────────────────────
    -- Only roles that can ever approve a field purchase request
    -- may query this queue.  Any other caller gets hard 403.
    IF NOT (
        public.is_governance_role()
        OR public.has_any_app_role(ARRAY[
            'installation_team_lead',
            'project_manager',
            'managing_director'
        ])
    ) THEN
        RAISE EXCEPTION 'insufficient_privilege'
            USING HINT = 'rpc_get_fpr_approval_queue requires an approval role';
    END IF;

    -- ── Pre-compute all-access flag ────────────────────────
    -- Governance and MD see every pending request regardless
    -- of approval_level.  Avoids per-row function evaluation.
    v_can_approve_all :=
        public.is_governance_role()
        OR public.has_any_app_role(ARRAY['managing_director']);

    -- ── Compute eligible approval levels for bounded roles ─
    -- Iterates at most 3 rows in field_purchase_thresholds.
    -- Result is NULL (unused) when v_can_approve_all is true.
    IF NOT v_can_approve_all THEN
        SELECT ARRAY(
            SELECT t.level
            FROM   public.field_purchase_thresholds t
            WHERE  public.has_any_app_role(ARRAY[t.role_key])
        )
        INTO v_levels;

        -- Safety: if levels is empty the actor has no queue
        IF v_levels IS NULL OR array_length(v_levels, 1) = 0 THEN
            RETURN;
        END IF;
    END IF;

    -- ── Main query ─────────────────────────────────────────
    RETURN QUERY
    SELECT
        r.id                                            AS request_id,
        r.project_id,
        r.work_item_id,
        r.site_code,
        r.requester,
        r.amount,
        r.reason,
        r.item_hint,
        r.photo_refs,
        r.approval_level,
        r.line_message_id,
        -- age in whole minutes (UTC-safe)
        (
            EXTRACT(EPOCH FROM (
                timezone('utc', now()) - r.created_at
            )) / 60
        )::integer                                      AS age_minutes,
        r.created_at

    FROM public.field_purchase_request r

    WHERE
        -- Only pending requests belong in the approval queue
        r.status = 'pending'

        -- Approval-level filter:
        -- All-access actors see all pending requests.
        -- Bounded actors see only rows at their eligible level(s).
        AND (
            v_can_approve_all
            OR r.approval_level = ANY(v_levels)
        )

        -- Optional site_code filter supplied by caller
        AND (
            p_site_code IS NULL
            OR r.site_code = p_site_code
        )

        -- Site-access guard mirrors rpc_approve_field_purchase_request:
        -- governance bypasses; all others must have site access.
        AND (
            public.is_governance_role()
            OR public.has_site_access(r.site_code)
        )

    -- Oldest first = most urgent / longest waiting
    ORDER BY r.created_at ASC;

END;
$$;

-- ── Object documentation ───────────────────────────────────
COMMENT ON FUNCTION public.rpc_get_fpr_approval_queue(text) IS
'Returns pending field purchase requests the calling actor is authorised to approve. '
'team_lead actors see only team_lead-level requests; project_manager actors see only '
'project_manager-level requests; managing_director and governance actors see all levels. '
'Optionally filtered by p_site_code.  Results ordered oldest-first (highest urgency). '
'SECURITY DEFINER — authority gate enforced inside function body (fail-closed). '
'Depends on 0176_field_purchase_core and C12 security helpers.';

-- ── Privileges ────────────────────────────────────────────
-- Revoke broad defaults before re-granting.
REVOKE ALL ON FUNCTION public.rpc_get_fpr_approval_queue(text)
    FROM PUBLIC, anon;

-- Grant EXECUTE to authenticated — the function body enforces
-- role requirements so unprivileged callers get 403, not data.
GRANT EXECUTE ON FUNCTION public.rpc_get_fpr_approval_queue(text)
    TO authenticated;

COMMIT;

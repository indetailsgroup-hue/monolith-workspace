-- =============================================================================
-- Migration 0213 — FPR Budget Ceiling
-- Tables  : fpr_budget_ceiling
-- Views   : v_fpr_budget_usage
-- Functions: fn_check_fpr_budget_ceiling
-- RPCs    : rpc_set_fpr_budget_ceiling (governance only)
-- RLS     : fail-closed
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. fpr_budget_ceiling table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fpr_budget_ceiling (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code      text        NOT NULL,
    project_id     uuid,                            -- informational; no FK
    period_start   date        NOT NULL,
    period_end     date        NOT NULL CHECK (period_end >= period_start),
    ceiling_amount numeric(14,2) NOT NULL CHECK (ceiling_amount > 0),
    currency       text        NOT NULL DEFAULT 'THB'
                               CHECK (char_length(currency) = 3),
    notes          text,
    created_by     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_budget_ceiling_site_period
        UNIQUE (site_code, project_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_fpr_budget_ceiling_site
    ON public.fpr_budget_ceiling (site_code);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_fpr_budget_ceiling_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fpr_budget_ceiling_updated_at
    ON public.fpr_budget_ceiling;
CREATE TRIGGER trg_fpr_budget_ceiling_updated_at
    BEFORE UPDATE ON public.fpr_budget_ceiling
    FOR EACH ROW EXECUTE FUNCTION public.fn_fpr_budget_ceiling_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — fail-closed
-- ---------------------------------------------------------------------------
ALTER TABLE public.fpr_budget_ceiling ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fpr_budget_ceiling select" ON public.fpr_budget_ceiling;
CREATE POLICY "fpr_budget_ceiling select"
    ON public.fpr_budget_ceiling FOR SELECT
    USING (
        has_any_app_role(ARRAY['operator','team_lead','project_manager',
                               'managing_director','finance','governance'])
        AND has_site_access(site_code)
    );

-- Only governance role may insert/update via the RPC (SECURITY DEFINER bypasses RLS)
DROP POLICY IF EXISTS "fpr_budget_ceiling insert" ON public.fpr_budget_ceiling;
CREATE POLICY "fpr_budget_ceiling insert"
    ON public.fpr_budget_ceiling FOR INSERT
    WITH CHECK (is_governance_role());

DROP POLICY IF EXISTS "fpr_budget_ceiling update" ON public.fpr_budget_ceiling;
CREATE POLICY "fpr_budget_ceiling update"
    ON public.fpr_budget_ceiling FOR UPDATE
    USING (is_governance_role())
    WITH CHECK (is_governance_role());

-- ---------------------------------------------------------------------------
-- 3. v_fpr_budget_usage view
--    Shows ceiling vs actual spend (approved+purchased+closed amounts per period)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_fpr_budget_usage;
CREATE VIEW public.v_fpr_budget_usage AS
SELECT
    bc.id                                          AS ceiling_id,
    bc.site_code,
    bc.project_id,
    bc.period_start,
    bc.period_end,
    bc.ceiling_amount,
    bc.currency,
    COALESCE(agg.used_amount, 0)                   AS used_amount,
    bc.ceiling_amount - COALESCE(agg.used_amount,0) AS remaining_amount,
    ROUND(
        COALESCE(agg.used_amount,0) / NULLIF(bc.ceiling_amount,0) * 100, 2
    )                                              AS usage_pct,
    COALESCE(agg.request_count, 0)                 AS request_count
FROM public.fpr_budget_ceiling bc
LEFT JOIN LATERAL (
    SELECT
        SUM(fpr.amount)   AS used_amount,
        COUNT(*)          AS request_count
    FROM   public.field_purchase_request fpr
    WHERE  fpr.site_code   = bc.site_code
    AND    (bc.project_id IS NULL OR fpr.project_id = bc.project_id)
    AND    fpr.status      IN ('approved','purchased','closed')
    AND    fpr.created_at::date BETWEEN bc.period_start AND bc.period_end
) agg ON true;

GRANT SELECT ON public.v_fpr_budget_usage
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. fn_check_fpr_budget_ceiling
--    Returns {ok, ceiling, used, remaining, ceiling_id}
--    ok=false when no ceiling row exists or amount would exceed ceiling.
--    Called from rpc_create_field_purchase_request before insert (advisory).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_check_fpr_budget_ceiling(text, uuid, numeric, timestamptz);
CREATE OR REPLACE FUNCTION public.fn_check_fpr_budget_ceiling(
    p_site_code  text,
    p_project_id uuid,
    p_amount     numeric,
    p_as_of      timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec   RECORD;
    v_used  numeric(14,2);
BEGIN
    -- find active ceiling for site+project+period
    SELECT bc.id, bc.ceiling_amount, bc.currency
    INTO   v_rec
    FROM   public.fpr_budget_ceiling bc
    WHERE  bc.site_code   = p_site_code
    AND    (bc.project_id IS NULL OR bc.project_id = p_project_id)
    AND    p_as_of::date BETWEEN bc.period_start AND bc.period_end
    ORDER BY bc.project_id NULLS LAST          -- prefer specific project ceiling
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok',         true,
            'ceiling',    null,
            'used',       null,
            'remaining',  null,
            'ceiling_id', null,
            'note',       'no_ceiling_configured'
        );
    END IF;

    -- compute current spend
    SELECT COALESCE(SUM(fpr.amount), 0)
    INTO   v_used
    FROM   public.field_purchase_request fpr
    WHERE  fpr.site_code   = p_site_code
    AND    (p_project_id IS NULL OR fpr.project_id = p_project_id)
    AND    fpr.status      IN ('approved','purchased','closed')
    AND    fpr.created_at::date
           BETWEEN (SELECT period_start FROM public.fpr_budget_ceiling WHERE id = v_rec.id)
               AND (SELECT period_end   FROM public.fpr_budget_ceiling WHERE id = v_rec.id);

    RETURN jsonb_build_object(
        'ok',         (v_used + p_amount) <= v_rec.ceiling_amount,
        'ceiling',    v_rec.ceiling_amount,
        'used',       v_used,
        'remaining',  v_rec.ceiling_amount - v_used,
        'currency',   v_rec.currency,
        'ceiling_id', v_rec.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_check_fpr_budget_ceiling(text, uuid, numeric, timestamptz)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. rpc_set_fpr_budget_ceiling
--    Upserts a budget ceiling row. Requires governance role.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_set_fpr_budget_ceiling(jsonb);
CREATE OR REPLACE FUNCTION public.rpc_set_fpr_budget_ceiling(p_args jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor        text := resolve_actor();
    v_site_code    text := p_args->>'site_code';
    v_project_id   uuid := (p_args->>'project_id')::uuid;
    v_period_start date := (p_args->>'period_start')::date;
    v_period_end   date := (p_args->>'period_end')::date;
    v_amount       numeric(14,2) := (p_args->>'ceiling_amount')::numeric;
    v_currency     text := coalesce(p_args->>'currency','THB');
    v_notes        text := p_args->>'notes';
    v_id           uuid;
BEGIN
    -- governance only
    IF NOT is_governance_role() THEN
        RETURN jsonb_build_object('ok',false,'error','permission_denied');
    END IF;

    -- basic validation
    IF v_site_code IS NULL OR v_period_start IS NULL OR v_period_end IS NULL
       OR v_amount IS NULL OR v_amount <= 0 THEN
        RETURN jsonb_build_object('ok',false,'error','invalid_arguments');
    END IF;

    IF v_period_end < v_period_start THEN
        RETURN jsonb_build_object('ok',false,'error','period_end_before_start');
    END IF;

    INSERT INTO public.fpr_budget_ceiling
        (site_code, project_id, period_start, period_end,
         ceiling_amount, currency, notes, created_by)
    VALUES
        (v_site_code, v_project_id, v_period_start, v_period_end,
         v_amount, v_currency, v_notes, v_actor)
    ON CONFLICT (site_code, project_id, period_start, period_end)
    DO UPDATE SET
        ceiling_amount = EXCLUDED.ceiling_amount,
        currency       = EXCLUDED.currency,
        notes          = EXCLUDED.notes,
        updated_at     = now()
    RETURNING id INTO v_id;

    -- audit
    INSERT INTO public.field_purchase_audit_log
        (request_id, actor, event_type, old_status, new_status, metadata)
    VALUES (
        null,
        v_actor,
        'budget_ceiling_set',
        null,
        null,
        jsonb_build_object(
            'ceiling_id',    v_id,
            'site_code',     v_site_code,
            'project_id',    v_project_id,
            'period_start',  v_period_start,
            'period_end',    v_period_end,
            'ceiling_amount',v_amount,
            'currency',      v_currency
        )
    );

    RETURN jsonb_build_object('ok', true, 'ceiling_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_set_fpr_budget_ceiling(jsonb)
    TO authenticated, service_role;

COMMIT;

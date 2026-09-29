-- =============================================================================
-- Migration 0195 — eTax Risk Tier Change pg_notify Trigger
-- Branch  : feat/accounting-rls-multibook
-- Depends : 0194_etax_org_risk_ranking.sql (v_etax_org_risk_ranking)
--           0188_mv_refresh_lag_alert.sql  (etax_compliance_mv_refresh_log)
--           0192_mv_etax_health_trend.sql  (etax_health_trend_mv_refresh_log)
-- =============================================================================

-- §0  Dependency Guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'v_etax_org_risk_ranking'
  ) THEN
    RAISE EXCEPTION
      'Migration 0195 dependency missing: v_etax_org_risk_ranking not found. '
      'Apply migration 0194 first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'etax_compliance_mv_refresh_log'
  ) THEN
    RAISE EXCEPTION
      'Migration 0195 dependency missing: etax_compliance_mv_refresh_log not found. '
      'Apply migration 0188 first.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'etax_health_trend_mv_refresh_log'
  ) THEN
    RAISE EXCEPTION
      'Migration 0195 dependency missing: etax_health_trend_mv_refresh_log not found. '
      'Apply migration 0192 first.'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '0195: dependency guard passed';
END $$;

-- §1  etax_risk_tier_state  — Persistent snapshot of each org's last-known tier
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.etax_risk_tier_state (
  org_id       UUID        NOT NULL
                           REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  risk_tier    TEXT        NOT NULL
                           CHECK (risk_tier IN ('CRITICAL','WARNING','HEALTHY')),
  health_score NUMERIC(6,2),
  risk_rank    INT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_etax_risk_tier_state PRIMARY KEY (org_id)
);

COMMENT ON TABLE public.etax_risk_tier_state IS
  'Snapshot of the most recently observed risk_tier per org. '
  'Updated by fn_check_risk_tier_changes() after every MV refresh. '
  'pg_notify fires on tier transitions.';

COMMENT ON COLUMN public.etax_risk_tier_state.risk_tier    IS 'Last observed risk_tier from v_etax_org_risk_ranking';
COMMENT ON COLUMN public.etax_risk_tier_state.health_score IS 'Corresponding health_score at time of update';
COMMENT ON COLUMN public.etax_risk_tier_state.risk_rank    IS 'Corresponding risk_rank (DENSE_RANK) at time of update';
COMMENT ON COLUMN public.etax_risk_tier_state.updated_at   IS 'Timestamp of the last state write';

-- RLS — authenticated users can only read their own org's state row
ALTER TABLE public.etax_risk_tier_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "etax_risk_tier_state_select_own" ON public.etax_risk_tier_state;
CREATE POLICY "etax_risk_tier_state_select_own"
  ON public.etax_risk_tier_state
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id());

-- Index for fast admin queries by tier
CREATE INDEX IF NOT EXISTS idx_etax_risk_tier_state_tier
  ON public.etax_risk_tier_state (risk_tier);

-- §2  fn_check_risk_tier_changes() — Core trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_risk_tier_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec        RECORD;
  v_prev_tier  TEXT;
  v_payload    JSONB;
  v_transitions INT := 0;
BEGIN
  -- Walk every org currently visible in the risk-ranking view
  FOR v_rec IN
    SELECT
      r.org_id,
      r.org_name,
      r.risk_tier,
      r.health_score,
      r.risk_rank,
      r.health_status,
      r.is_priority_review
    FROM public.v_etax_org_risk_ranking r
  LOOP
    -- Retrieve the previously recorded tier for this org (may be NULL on first run)
    SELECT s.risk_tier
    INTO   v_prev_tier
    FROM   public.etax_risk_tier_state s
    WHERE  s.org_id = v_rec.org_id;

    -- Upsert the current snapshot regardless of transition
    INSERT INTO public.etax_risk_tier_state (
      org_id, risk_tier, health_score, risk_rank, updated_at
    )
    VALUES (
      v_rec.org_id,
      v_rec.risk_tier,
      v_rec.health_score,
      v_rec.risk_rank,
      now()
    )
    ON CONFLICT (org_id) DO UPDATE SET
      risk_tier    = EXCLUDED.risk_tier,
      health_score = EXCLUDED.health_score,
      risk_rank    = EXCLUDED.risk_rank,
      updated_at   = EXCLUDED.updated_at;

    -- Only fire pg_notify when the tier actually changed
    IF v_prev_tier IS DISTINCT FROM v_rec.risk_tier THEN
      v_payload := jsonb_build_object(
        'org_id',           v_rec.org_id,
        'org_name',         v_rec.org_name,
        'previous_tier',    COALESCE(v_prev_tier, 'NONE'),
        'new_tier',         v_rec.risk_tier,
        'health_score',     v_rec.health_score,
        'risk_rank',        v_rec.risk_rank,
        'health_status',    v_rec.health_status,
        'is_priority_review', v_rec.is_priority_review,
        'transitioned_at',  now()
      );

      PERFORM pg_notify('etax_risk_rank_changed', v_payload::text);
      v_transitions := v_transitions + 1;
    END IF;
  END LOOP;

  -- Emit a summary notice for observability
  RAISE NOTICE 'fn_check_risk_tier_changes: % transition(s) detected and notified', v_transitions;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_check_risk_tier_changes() IS
  'AFTER INSERT trigger on both MV refresh log tables. '
  'Scans v_etax_org_risk_ranking, upserts etax_risk_tier_state, '
  'and fires pg_notify(''etax_risk_rank_changed'') for every org whose '
  'risk_tier has transitioned since the previous refresh.';

-- §3  Triggers — fire after every MV refresh
-- ---------------------------------------------------------------------------

-- Trigger A: after compliance MV is refreshed (every 15 min via pg_cron)
DROP TRIGGER IF EXISTS trg_check_risk_tier_on_compliance_refresh
  ON public.etax_compliance_mv_refresh_log;

CREATE TRIGGER trg_check_risk_tier_on_compliance_refresh
  AFTER INSERT
  ON   public.etax_compliance_mv_refresh_log
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_risk_tier_changes();

COMMENT ON TRIGGER trg_check_risk_tier_on_compliance_refresh
  ON public.etax_compliance_mv_refresh_log IS
  'Fires fn_check_risk_tier_changes after every compliance MV refresh.';

-- Trigger B: after health-trend MV is refreshed (every night via pg_cron)
DROP TRIGGER IF EXISTS trg_check_risk_tier_on_health_trend_refresh
  ON public.etax_health_trend_mv_refresh_log;

CREATE TRIGGER trg_check_risk_tier_on_health_trend_refresh
  AFTER INSERT
  ON   public.etax_health_trend_mv_refresh_log
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_risk_tier_changes();

COMMENT ON TRIGGER trg_check_risk_tier_on_health_trend_refresh
  ON public.etax_health_trend_mv_refresh_log IS
  'Fires fn_check_risk_tier_changes after every health-trend MV refresh.';

-- §4  rpc_etax_risk_tier_state() — Authenticated, own-org read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_risk_tier_state()
RETURNS TABLE (
  org_id       UUID,
  risk_tier    TEXT,
  health_score NUMERIC,
  risk_rank    INT,
  updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  -- Resolve caller's org
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of any organisation' USING ERRCODE = 'P0001';
  END IF;

  -- Role gate: OWNER | ADMIN | FINANCE only
  SELECT om.role INTO v_role
  FROM   public.org_members om
  WHERE  om.org_id  = v_org_id
    AND  om.user_id = auth.uid();

  IF v_role NOT IN ('OWNER','ADMIN','FINANCE') THEN
    RAISE EXCEPTION
      'Insufficient role: % — requires OWNER, ADMIN, or FINANCE', v_role
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT s.org_id,
         s.risk_tier,
         s.health_score,
         s.risk_rank,
         s.updated_at
  FROM   public.etax_risk_tier_state s
  WHERE  s.org_id = v_org_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_risk_tier_state() IS
  'Returns the current risk_tier snapshot for the caller''s org. '
  'Requires OWNER, ADMIN, or FINANCE role.';

-- §5  rpc_etax_risk_tier_state_admin() — service_role cross-org read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_risk_tier_state_admin(
  p_org_id UUID  DEFAULT NULL,
  p_tier   TEXT  DEFAULT NULL,
  p_limit  INT   DEFAULT 50
)
RETURNS TABLE (
  org_id       UUID,
  risk_tier    TEXT,
  health_score NUMERIC,
  risk_rank    INT,
  updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Guard: service_role only
  IF current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Admin RPC requires service_role' USING ERRCODE = 'P0003';
  END IF;

  -- Validate tier filter
  IF p_tier IS NOT NULL AND p_tier NOT IN ('CRITICAL','WARNING','HEALTHY') THEN
    RAISE EXCEPTION
      'Invalid tier filter: %. Must be CRITICAL, WARNING, or HEALTHY', p_tier
      USING ERRCODE = 'P0003';
  END IF;

  -- Clamp p_limit to 1–200
  p_limit := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));

  RETURN QUERY
  SELECT s.org_id,
         s.risk_tier,
         s.health_score,
         s.risk_rank,
         s.updated_at
  FROM   public.etax_risk_tier_state s
  WHERE  (p_org_id IS NULL OR s.org_id = p_org_id)
    AND  (p_tier   IS NULL OR s.risk_tier = p_tier)
  ORDER  BY
    CASE s.risk_tier
      WHEN 'CRITICAL' THEN 1
      WHEN 'WARNING'  THEN 2
      ELSE                 3
    END,
    s.risk_rank ASC NULLS LAST,
    s.org_id   ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_risk_tier_state_admin(UUID, TEXT, INT) IS
  'Admin RPC (service_role only): returns risk_tier snapshots across all orgs. '
  'Filterable by org_id and/or tier. p_limit clamped 1–200.';

-- §6  Permissions
-- ---------------------------------------------------------------------------
-- Table
GRANT SELECT ON public.etax_risk_tier_state TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.etax_risk_tier_state FROM authenticated;
GRANT ALL ON public.etax_risk_tier_state TO service_role;

-- RPCs
GRANT EXECUTE ON FUNCTION public.rpc_etax_risk_tier_state()
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_etax_risk_tier_state_admin(UUID, TEXT, INT)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_check_risk_tier_changes()
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_check_risk_tier_changes()
  TO service_role;

-- §7  Verification Assertions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'etax_risk_tier_state'
  ), 'etax_risk_tier_state table not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_risk_tier_changes'
  ), 'fn_check_risk_tier_changes not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_risk_tier_state'
  ), 'rpc_etax_risk_tier_state not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_risk_tier_state_admin'
  ), 'rpc_etax_risk_tier_state_admin not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_check_risk_tier_on_compliance_refresh'
  ), 'trg_check_risk_tier_on_compliance_refresh not created';

  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_check_risk_tier_on_health_trend_refresh'
  ), 'trg_check_risk_tier_on_health_trend_refresh not created';

  -- RLS enabled
  ASSERT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'etax_risk_tier_state'
      AND c.relrowsecurity = true
  ), 'RLS not enabled on etax_risk_tier_state';

  RAISE NOTICE 'Migration 0195 verification PASSED';
END $$;

-- §8  Rollback Instructions
-- ---------------------------------------------------------------------------
-- To rollback this migration:
--
--   DROP TRIGGER IF EXISTS trg_check_risk_tier_on_compliance_refresh
--     ON public.etax_compliance_mv_refresh_log;
--
--   DROP TRIGGER IF EXISTS trg_check_risk_tier_on_health_trend_refresh
--     ON public.etax_health_trend_mv_refresh_log;
--
--   DROP FUNCTION IF EXISTS public.fn_check_risk_tier_changes();
--   DROP FUNCTION IF EXISTS public.rpc_etax_risk_tier_state();
--   DROP FUNCTION IF EXISTS public.rpc_etax_risk_tier_state_admin(UUID, TEXT, INT);
--   DROP TABLE   IF EXISTS public.etax_risk_tier_state;
--
-- Note: dropping etax_risk_tier_state will cascade to any FK references.


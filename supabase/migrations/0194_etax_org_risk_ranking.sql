-- =============================================================================
-- Migration 0194 — v_etax_org_risk_ranking
-- =============================================================================
-- Adds a cross-org eTax risk-ranking view derived from v_etax_full_health_summary.
-- Ranks every organisation by health_score ASC so rank 1 is the most at risk.
-- Flags organisations with health_status = 'critical' (health_score < 50) for
-- priority review.  Exposes two access RPCs following the established pattern.
--
-- New objects
--   VIEW     public.v_etax_org_risk_ranking
--   FUNCTION public.rpc_etax_org_risk_ranking()
--   FUNCTION public.rpc_etax_org_risk_ranking_admin(p_org_id UUID,
--              p_critical_only BOOLEAN, p_limit INT)
--
-- Dependencies (must run after)
--   0193_etax_full_health_summary.sql  → v_etax_full_health_summary
--   (which in turn requires mv_etax_compliance_dashboard,
--    mv_etax_health_trend, both refresh-log tables)
--   public.organizations
--
-- Permission model
--   v_etax_org_risk_ranking                    → SELECT: service_role only
--   rpc_etax_org_risk_ranking()                → EXECUTE: authenticated
--     SECURITY DEFINER; OWNER | ADMIN | FINANCE; raises P0001 otherwise
--   rpc_etax_org_risk_ranking_admin(...)       → EXECUTE: service_role only
--     SECURITY DEFINER; raises P0003 for non-service_role callers
--
-- CROSS JOIN refresh-log prerequisite (inherited from v_etax_full_health_summary)
--   Both etax_compliance_mv_refresh_log and etax_health_trend_mv_refresh_log must
--   contain ≥1 row for this view to return any data.  Ensure both MVs have been
--   refreshed at least once before querying in production or tests.
--
-- Ranking algorithm
--   DENSE_RANK() OVER (ORDER BY health_score ASC, org_id ASC)
--   · rank 1  = lowest health_score = most at risk
--   · ties    = same rank; no gap in subsequent ranks
--   · org_id  = deterministic tiebreaker (prevents non-deterministic ordering)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- §0  Dependency guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public'
       AND table_name   = 'v_etax_full_health_summary'
  ) THEN
    RAISE EXCEPTION
      '[0194] Prerequisite missing: v_etax_full_health_summary (Migration 0193). '
      'Run migrations in order.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'organizations'
  ) THEN
    RAISE EXCEPTION
      '[0194] Prerequisite missing: public.organizations table.';
  END IF;

  RAISE NOTICE '[0194] §0 Prerequisites verified.';
END;
$$;

-- ---------------------------------------------------------------------------
-- §1  Drop existing objects (idempotent re-run safe)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS
  public.rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT) CASCADE;
DROP FUNCTION IF EXISTS
  public.rpc_etax_org_risk_ranking()                          CASCADE;
DROP VIEW     IF EXISTS
  public.v_etax_org_risk_ranking                              CASCADE;

-- ---------------------------------------------------------------------------
-- §2  CREATE VIEW v_etax_org_risk_ranking
--
-- Column glossary
--   org_id                          UUID — organisation primary key
--   org_name                        TEXT — display name from organizations
--   health_score                    NUMERIC — 0–100, from v_etax_full_health_summary
--   health_status                   TEXT — 'healthy'|'warning'|'critical'
--   total_submissions               BIGINT — all-time total from compliance MV
--   submitted_count                 BIGINT — successfully submitted
--   failed_count                    BIGINT — failed (any attempt count)
--   compliance_success_rate         NUMERIC(5,2) — pct submitted / total
--   overdue_with_pending_etax       BIGINT — invoices past due with queued/submitting eTax
--   failed_last_24h                 BIGINT — failed submissions in last 24 h
--   today_daily_total               BIGINT? — submissions today (NULL if no trend row)
--   today_retry_exhaustion_rate_pct NUMERIC? — exhaustion rate today (NULL if no trend row)
--   compliance_mv_last_refreshed_at TIMESTAMPTZ — last compliance MV refresh
--   trend_mv_last_refreshed_at      TIMESTAMPTZ — last trend MV refresh
--   risk_rank                       BIGINT — DENSE_RANK; 1 = most at risk
--   is_priority_review              BOOLEAN — TRUE iff health_status = 'critical'
--   risk_tier                       TEXT — 'CRITICAL'|'WARNING'|'HEALTHY'
--   ranked_at                       TIMESTAMPTZ — NOW() at query time (not stored)
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_etax_org_risk_ranking AS
SELECT
  -- identity
  s.org_id,
  o.name                                                          AS org_name,

  -- health metrics (pass-through from v_etax_full_health_summary)
  s.health_score,
  s.health_status,
  s.total_submissions,
  s.submitted_count,
  s.failed_count,
  s.compliance_success_rate,
  s.overdue_with_pending_etax,
  s.failed_last_24h,
  s.today_total                                                          AS today_daily_total,
  s.today_retry_exhaustion_rate_pct,
  s.compliance_mv_last_refreshed_at,
  s.trend_mv_last_refreshed_at,

  -- risk ranking
  -- DENSE_RANK: ties share a rank; no gap in the sequence after ties.
  -- org_id tiebreaker makes ordering fully deterministic across identical scores.
  DENSE_RANK() OVER (
    ORDER BY s.health_score ASC, s.org_id ASC
  )::BIGINT                                                       AS risk_rank,

  -- priority review flag
  -- TRUE  → health_score < 50  → immediate attention required
  -- FALSE → health_score ≥ 50  → monitor (warning) or no action (healthy)
  (s.health_status = 'critical')::BOOLEAN                         AS is_priority_review,

  -- uppercase tier label for dashboard / upstream consumer convenience
  CASE s.health_status
    WHEN 'critical' THEN 'CRITICAL'
    WHEN 'warning'  THEN 'WARNING'
    ELSE                 'HEALTHY'
  END                                                             AS risk_tier,

  -- snapshot timestamp — changes on every SELECT; not a stored value
  NOW()                                                           AS ranked_at

FROM  public.v_etax_full_health_summary s
JOIN  public.organizations              o ON o.org_id = s.org_id;

-- View-level comment
COMMENT ON VIEW public.v_etax_org_risk_ranking IS
  'Cross-org eTax health risk ranking derived from v_etax_full_health_summary. '
  'risk_rank = 1 identifies the organisation with the lowest health_score (most at risk). '
  'is_priority_review = TRUE for organisations with health_status = ''critical''. '
  'Inherits the CROSS JOIN refresh-log prerequisite from v_etax_full_health_summary: '
  'both MV refresh logs must contain ≥1 row for results to appear. '
  'Direct SELECT restricted to service_role; use RPCs for all other access.';

-- Column comments
COMMENT ON COLUMN public.v_etax_org_risk_ranking.risk_rank IS
  'DENSE_RANK() OVER (ORDER BY health_score ASC, org_id ASC). '
  'Rank 1 = lowest health_score = highest eTax risk. '
  'Tied scores share the same rank with no gap in the sequence.';

COMMENT ON COLUMN public.v_etax_org_risk_ranking.is_priority_review IS
  'TRUE when health_status = ''critical'' (health_score < 50). '
  'Signals that the organisation requires immediate eTax remediation action.';

COMMENT ON COLUMN public.v_etax_org_risk_ranking.risk_tier IS
  'String tier label matching health_status: '
  'CRITICAL  (health_score < 50)  — immediate action required. '
  'WARNING   (50 ≤ score ≤ 79)    — monitor closely. '
  'HEALTHY   (score ≥ 80)          — no action required.';

COMMENT ON COLUMN public.v_etax_org_risk_ranking.ranked_at IS
  'Query-time snapshot timestamp (NOW()). '
  'Not a stored value — advances on every SELECT.';

-- ---------------------------------------------------------------------------
-- §3  Permissions on the view
--     Direct SELECT restricted to service_role.
--     All external access goes through the RPCs below.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.v_etax_org_risk_ranking
  FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_etax_org_risk_ranking
  TO service_role;

-- ---------------------------------------------------------------------------
-- §4  rpc_etax_org_risk_ranking()
--
-- Authenticated caller receives their own organisation's risk-ranking row.
-- The row includes the global risk_rank so the caller can gauge their position
-- relative to all other organisations in the system.
--
-- Access control
--   Role must be OWNER, ADMIN, or FINANCE.
--   Non-member or insufficient role raises P0001.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_org_risk_ranking()
RETURNS TABLE (
  org_id                          UUID,
  org_name                        TEXT,
  health_score                    NUMERIC,
  health_status                   TEXT,
  risk_rank                       BIGINT,
  is_priority_review              BOOLEAN,
  risk_tier                       TEXT,
  total_submissions               BIGINT,
  submitted_count                 BIGINT,
  failed_count                    BIGINT,
  compliance_success_rate         NUMERIC,
  overdue_with_pending_etax       BIGINT,
  failed_last_24h                 BIGINT,
  today_daily_total               BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_last_refreshed_at      TIMESTAMPTZ,
  ranked_at                       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  -- Resolve caller's organisation membership and role
  SELECT om.org_id, om.role
    INTO v_org_id, v_role
    FROM org_members om
   WHERE om.user_id = auth.uid()
   LIMIT 1;

  -- Guard: caller must belong to an organisation
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      'Caller (uid=%) is not a member of any organisation', auth.uid()
      USING ERRCODE = 'P0001';
  END IF;

  -- Guard: role must be OWNER, ADMIN, or FINANCE
  IF v_role NOT IN ('OWNER', 'ADMIN', 'FINANCE') THEN
    RAISE EXCEPTION
      'rpc_etax_org_risk_ranking: OWNER, ADMIN, or FINANCE required (got %)', v_role
      USING ERRCODE = 'P0001';
  END IF;

  -- Return this organisation's row.
  -- risk_rank is computed across ALL organisations in the view,
  -- giving the caller their global risk position.
  RETURN QUERY
  SELECT
    r.org_id,
    r.org_name,
    r.health_score,
    r.health_status,
    r.risk_rank,
    r.is_priority_review,
    r.risk_tier,
    r.total_submissions,
    r.submitted_count,
    r.failed_count,
    r.compliance_success_rate,
    r.overdue_with_pending_etax,
    r.failed_last_24h,
    r.today_daily_total,
    r.today_retry_exhaustion_rate_pct,
    r.compliance_mv_last_refreshed_at,
    r.trend_mv_last_refreshed_at,
    r.ranked_at
  FROM  public.v_etax_org_risk_ranking r
  WHERE r.org_id = v_org_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_org_risk_ranking() IS
  'Returns the calling organisation''s eTax risk-ranking row. '
  'risk_rank is global — reflects position vs ALL organisations. '
  'Requires OWNER, ADMIN, or FINANCE role. '
  'Raises P0001 for non-members or insufficient roles.';

REVOKE ALL    ON FUNCTION public.rpc_etax_org_risk_ranking() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_etax_org_risk_ranking() TO authenticated;

-- ---------------------------------------------------------------------------
-- §5  rpc_etax_org_risk_ranking_admin(p_org_id, p_critical_only, p_limit)
--
-- Service-role cross-tenant access for ops/admin dashboards.
-- Returns all organisations ordered by risk_rank ASC with optional filters.
--
-- Parameters
--   p_org_id        UUID     DEFAULT NULL   — scope to a single organisation
--   p_critical_only BOOLEAN  DEFAULT FALSE  — only is_priority_review = TRUE rows
--   p_limit         INT      DEFAULT 50     — max rows returned (clamped 1–200)
--
-- Access control
--   Requires service_role JWT claim.
--   Non-service_role callers receive P0003.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_etax_org_risk_ranking_admin(
  p_org_id        UUID    DEFAULT NULL,
  p_critical_only BOOLEAN DEFAULT FALSE,
  p_limit         INT     DEFAULT 50
)
RETURNS TABLE (
  org_id                          UUID,
  org_name                        TEXT,
  health_score                    NUMERIC,
  health_status                   TEXT,
  risk_rank                       BIGINT,
  is_priority_review              BOOLEAN,
  risk_tier                       TEXT,
  total_submissions               BIGINT,
  submitted_count                 BIGINT,
  failed_count                    BIGINT,
  compliance_success_rate         NUMERIC,
  overdue_with_pending_etax       BIGINT,
  failed_last_24h                 BIGINT,
  today_daily_total               BIGINT,
  today_retry_exhaustion_rate_pct NUMERIC,
  compliance_mv_last_refreshed_at TIMESTAMPTZ,
  trend_mv_last_refreshed_at      TIMESTAMPTZ,
  ranked_at                       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce service_role-only access via JWT claim
  IF COALESCE(
    (current_setting('request.jwt.claims', TRUE)::JSONB) ->> 'role', ''
  ) != 'service_role' THEN
    RAISE EXCEPTION
      'service_role JWT required to call rpc_etax_org_risk_ranking_admin'
      USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY
  SELECT
    r.org_id,
    r.org_name,
    r.health_score,
    r.health_status,
    r.risk_rank,
    r.is_priority_review,
    r.risk_tier,
    r.total_submissions,
    r.submitted_count,
    r.failed_count,
    r.compliance_success_rate,
    r.overdue_with_pending_etax,
    r.failed_last_24h,
    r.today_daily_total,
    r.today_retry_exhaustion_rate_pct,
    r.compliance_mv_last_refreshed_at,
    r.trend_mv_last_refreshed_at,
    r.ranked_at
  FROM  public.v_etax_org_risk_ranking r
  WHERE (p_org_id       IS NULL OR r.org_id          = p_org_id)
    AND (NOT p_critical_only   OR r.is_priority_review = TRUE)
  ORDER BY r.risk_rank ASC, r.org_id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

COMMENT ON FUNCTION public.rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT) IS
  'Cross-tenant eTax risk ranking for service_role callers. '
  'p_org_id:        scope result to a single organisation. '
  'p_critical_only: return only is_priority_review = TRUE rows. '
  'p_limit:         row cap, clamped to 1–200 (default 50). '
  'Results ordered by risk_rank ASC then org_id ASC. '
  'Raises P0003 for non-service_role callers.';

REVOKE ALL    ON FUNCTION public.rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_etax_org_risk_ranking_admin(UUID, BOOLEAN, INT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- §6  Post-migration verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_col_count   INT;
  v_fn_std      BOOLEAN := FALSE;
  v_fn_admin    BOOLEAN := FALSE;
  v_auth_select BOOLEAN := FALSE;
BEGIN
  -- a) Column count on the view
  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'v_etax_org_risk_ranking';

  IF v_col_count < 18 THEN
    RAISE EXCEPTION
      '[0194] Column count failed: v_etax_org_risk_ranking has % col(s), expected ≥ 18',
      v_col_count;
  END IF;

  -- b) RPC presence
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_org_risk_ranking'
      AND pronargs  = 0
  ) INTO v_fn_std;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_etax_org_risk_ranking_admin'
  ) INTO v_fn_admin;

  IF NOT v_fn_std  THEN
    RAISE EXCEPTION '[0194] rpc_etax_org_risk_ranking() not found after migration';
  END IF;
  IF NOT v_fn_admin THEN
    RAISE EXCEPTION '[0194] rpc_etax_org_risk_ranking_admin() not found after migration';
  END IF;

  -- c) Permission guard: authenticated must NOT have direct SELECT on the view
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema    = 'public'
      AND table_name      = 'v_etax_org_risk_ranking'
      AND grantee         = 'authenticated'
      AND privilege_type  = 'SELECT'
  ) INTO v_auth_select;

  IF v_auth_select THEN
    RAISE EXCEPTION
      '[0194] Permission leak: authenticated role has SELECT on v_etax_org_risk_ranking';
  END IF;

  -- d) SECURITY DEFINER presence on both functions
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname  = 'public'
      AND p.proname  = 'rpc_etax_org_risk_ranking'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION '[0194] rpc_etax_org_risk_ranking() is missing SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname  = 'public'
      AND p.proname  = 'rpc_etax_org_risk_ranking_admin'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION '[0194] rpc_etax_org_risk_ranking_admin() is missing SECURITY DEFINER';
  END IF;

  RAISE NOTICE
    '[0194] Migration verified: v_etax_org_risk_ranking (% columns), '
    'rpc_etax_org_risk_ranking() [SECURITY DEFINER], '
    'rpc_etax_org_risk_ranking_admin() [SECURITY DEFINER] — all OK',
    v_col_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- §7  Rollback instructions (informational — not executed)
-- ---------------------------------------------------------------------------
-- To undo this migration:
--   DROP FUNCTION IF EXISTS public.rpc_etax_org_risk_ranking_admin(UUID,BOOLEAN,INT) CASCADE;
--   DROP FUNCTION IF EXISTS public.rpc_etax_org_risk_ranking()                        CASCADE;
--   DROP VIEW     IF EXISTS public.v_etax_org_risk_ranking                            CASCADE;
-- No data tables are created or modified; rollback is fully reversible.
-- ---------------------------------------------------------------------------

COMMIT;

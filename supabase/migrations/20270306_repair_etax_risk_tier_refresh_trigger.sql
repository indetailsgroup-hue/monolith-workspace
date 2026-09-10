-- =============================================================================
-- Repair the eTax risk-tier refresh trigger after the historical pg_net patch.
--
-- 0195 correctly attached a scan-all-organizations function to the two MV
-- refresh-log
-- tables. 01952 later replaced that function with row semantics intended for
-- etax_risk_tier_state: it read NEW.org_id/OLD.risk_tier and joined the removed
-- organizations.id column. Every refresh-log insert therefore failed before
-- the lag monitor or risk-tier snapshot could run.
--
-- This forward-only repair keeps pg_notify + pg_net delivery while restoring
-- the original scan-all-organizations contract used by both refresh triggers.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_check_risk_tier_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rec           RECORD;
  v_previous_tier TEXT;
  v_payload       JSONB;
  v_notify_url    TEXT;
  v_notify_secret TEXT;
  v_request_id    BIGINT;
  v_transitions   INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      ranking.org_id,
      ranking.org_name,
      ranking.risk_tier,
      ranking.health_score,
      ranking.risk_rank,
      ranking.health_status,
      ranking.is_priority_review
    FROM public.v_etax_org_risk_ranking AS ranking
  LOOP
    v_previous_tier := NULL;
    SELECT state.risk_tier
      INTO v_previous_tier
      FROM public.etax_risk_tier_state AS state
     WHERE state.org_id = v_rec.org_id;

    INSERT INTO public.etax_risk_tier_state (
      org_id,
      risk_tier,
      health_score,
      risk_rank,
      updated_at
    )
    VALUES (
      v_rec.org_id,
      v_rec.risk_tier,
      v_rec.health_score,
      v_rec.risk_rank,
      now()
    )
    ON CONFLICT (org_id) DO UPDATE
      SET risk_tier    = EXCLUDED.risk_tier,
          health_score = EXCLUDED.health_score,
          risk_rank    = EXCLUDED.risk_rank,
          updated_at   = EXCLUDED.updated_at;

    IF v_previous_tier IS DISTINCT FROM v_rec.risk_tier THEN
      v_payload := jsonb_build_object(
        'org_id',             v_rec.org_id,
        'org_name',           v_rec.org_name,
        'previous_tier',      COALESCE(v_previous_tier, 'NONE'),
        'new_tier',           v_rec.risk_tier,
        'health_score',       v_rec.health_score,
        'risk_rank',          v_rec.risk_rank,
        'health_status',      v_rec.health_status,
        'is_priority_review', v_rec.is_priority_review,
        'transitioned_at',    now()
      );

      PERFORM pg_notify('etax_risk_rank_changed', v_payload::text);

      -- Outbound HTTP is optional and must never make the refresh transaction
      -- fail. Operators can change the URL/secret without replacing this
      -- function because both values are resolved for each transition.
      BEGIN
        SELECT NULLIF(config.value, '')
          INTO v_notify_url
          FROM public.platform_config AS config
         WHERE config.key = 'etax_risk_notify_url';

        SELECT config.value
          INTO v_notify_secret
          FROM public.platform_config AS config
         WHERE config.key = 'etax_risk_notify_secret';

        v_notify_url := COALESCE(
          v_notify_url,
          NULLIF(current_setting('app.etax_risk_notify_url', true), '')
        );
        v_notify_secret := COALESCE(
          v_notify_secret,
          current_setting('app.etax_risk_notify_secret', true),
          ''
        );

        IF v_notify_url IS NOT NULL THEN
          SELECT net.http_post(
            url := v_notify_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || v_notify_secret,
              'X-Monolith-Event', 'etax_risk_rank_changed'
            ),
            body := v_payload
          ) INTO v_request_id;

          RAISE LOG
            'etax-risk-notify queued request_id=% org=% % -> %',
            v_request_id,
            v_rec.org_id,
            COALESCE(v_previous_tier, 'NONE'),
            v_rec.risk_tier;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING
          'etax-risk-notify pg_net call failed (non-fatal): % — org=%',
          SQLERRM,
          v_rec.org_id;
      END;

      v_transitions := v_transitions + 1;
    END IF;
  END LOOP;

  RAISE NOTICE
    'fn_check_risk_tier_changes: % transition(s) detected and notified',
    v_transitions;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_check_risk_tier_changes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_risk_tier_changes()
  TO service_role;

COMMENT ON FUNCTION public.fn_check_risk_tier_changes() IS
  'After an eTax MV refresh-log insert, scans the canonical org_id-based risk '
  'ranking, updates etax_risk_tier_state, and sends pg_notify plus optional '
  'fault-isolated pg_net delivery for each tier transition. Repaired 20270306.';

COMMIT;

-- TPC responses belong to the same organization as their active session.
-- Existing inconsistent rows cause validation to fail; do not silently delete
-- or reassign historical responses to make this migration pass.
BEGIN;

ALTER TABLE public.tpc_pulse_sessions
  ADD CONSTRAINT tpc_sessions_id_org_key UNIQUE (id, org_id);
ALTER TABLE public.tpc_pulse_responses
  ADD CONSTRAINT tpc_responses_session_org_fk
  FOREIGN KEY (session_id, org_id)
  REFERENCES public.tpc_pulse_sessions (id, org_id) ON DELETE CASCADE;

ALTER POLICY tpc_responses_insert_member ON public.tpc_pulse_responses
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.tpc_pulse_sessions s
      WHERE s.id = tpc_pulse_responses.session_id
        AND s.org_id = tpc_pulse_responses.org_id
        AND s.status = 'ACTIVE'
    )
  );

-- Apply the invoking user's table privileges and RLS, including admin-only
-- response SELECT. Preserve the existing aggregate and small-count semantics.
CREATE OR REPLACE VIEW public.tpc_pulse_summary_v
WITH (security_invoker = true) AS
SELECT
  r.org_id,
  r.session_id,
  s.title AS session_title,
  s.period_label,
  s.status AS session_status,
  r.topic,
  ROUND(AVG(r.score)::NUMERIC, 2) AS avg_score,
  COUNT(*)::INT AS response_count,
  CASE
    WHEN COUNT(*) < 3 THEN NULL
    WHEN AVG(r.score) < 2.5 THEN 'CRITICAL'
    WHEN AVG(r.score) < 3.5 THEN 'WARNING'
    ELSE 'NORMAL'
  END AS health_status
FROM public.tpc_pulse_responses r
JOIN public.tpc_pulse_sessions s
  ON s.id = r.session_id AND s.org_id = r.org_id
GROUP BY r.org_id, r.session_id, s.title, s.period_label, s.status, r.topic;

COMMIT;

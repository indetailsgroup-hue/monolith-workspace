-- pgTAP contract coverage for true DENSE_RANK tie semantics.

BEGIN;

SELECT plan(3);

SELECT has_view(
  'public',
  'v_etax_org_risk_ranking',
  '20270316-01: eTax org risk-ranking view exists'
);

SELECT unlike(
  pg_get_viewdef('public.v_etax_org_risk_ranking'::REGCLASS, TRUE),
  '%dense_rank() OVER (ORDER BY summary.health_score, summary.org_id)%',
  '20270316-02: unique org_id is not part of the DENSE_RANK window'
);

SELECT ok(
  pg_get_viewdef(
    'public.v_etax_org_risk_ranking'::REGCLASS,
    TRUE
  ) ~* 'dense_rank\(\)\s+OVER\s*\(\s*ORDER BY\s+summary\.health_score\s*\)',
  '20270316-03: DENSE_RANK is calculated from health score only'
);

SELECT * FROM finish();
ROLLBACK;

-- Migration 0205: OpenAPI spec update tracking entry
-- Adds rpc_etax_executive_kpi_banner to docs/openapi_monolith_rpcs.yaml (v15.9.0)
-- This migration records the documentation change in platform_config.
-- No schema changes — purely a documentation / metadata migration.

-- ─── Guard: skip if already applied ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM platform_config WHERE key = 'migration_0205_applied'
  ) THEN
    RAISE NOTICE 'Migration 0205 already applied — skipping.';
    RETURN;
  END IF;

  -- ─── Record OpenAPI spec version bump ──────────────────────────────────────
  INSERT INTO platform_config (key, value, updated_at)
  VALUES
    ('openapi_spec_version',  '15.9.0',   NOW()),
    ('openapi_last_updated',  NOW()::text, NOW()),
    ('migration_0205_applied','true',      NOW())
  ON CONFLICT (key) DO UPDATE
    SET value      = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at;

  RAISE NOTICE 'Migration 0205 applied: OpenAPI spec v15.9.0 recorded.';
END;
$$;

-- ─── Comment: what changed in OpenAPI v15.9.0 ────────────────────────────────
-- Path added:     /rpc_etax_executive_kpi_banner  (tag: SLA Executive KPI)
-- Schema added:   ExecutiveKpiBannerRow (11 properties)
-- Tag added:      SLA Executive KPI
-- Description:    Migration 0204 — rpc_etax_executive_kpi_banner()
-- Version:        15.7.0 → 15.9.0
-- Coverage:       0176–0204 (was 0176–0202)

COMMENT ON TABLE platform_config IS
  'Platform-wide key/value configuration. '
  'openapi_spec_version tracks the current OpenAPI YAML version (latest: 15.9.0, '
  'covering RPCs 0176–0204 including rpc_etax_executive_kpi_banner).';

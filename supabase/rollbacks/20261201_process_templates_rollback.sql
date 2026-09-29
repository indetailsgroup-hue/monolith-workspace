-- =============================================================================
-- 20261201_process_templates_rollback.sql
-- MONOLITH v17.0 — Process Templates Module — ROLLBACK
--
-- Reverses: 20261201_process_templates.sql
--
-- Drops (in dependency order):
--   1. Seed data (no explicit DELETE needed — CASCADE handles it)
--   2. View: bottleneck_heatmap_v
--   3. Table: time_in_stage_log  (references job_templates via template_id)
--   4. Table: job_template_stages (references job_templates)
--   5. Table: job_templates
--   6. Trigger function: pt_set_updated_at()
--   7. Enum type: job_template_category (if not used elsewhere)
--
-- Safe to run multiple times (all drops are IF EXISTS).
-- =============================================================================

BEGIN;

-- Step 1: Drop view ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.bottleneck_heatmap_v;

-- Step 2: Drop time_in_stage_log ─────────────────────────────────────────────
DROP TABLE IF EXISTS public.time_in_stage_log CASCADE;

-- Step 3: Drop job_template_stages ───────────────────────────────────────────
DROP TABLE IF EXISTS public.job_template_stages CASCADE;

-- Step 4: Drop job_templates ─────────────────────────────────────────────────
DROP TABLE IF EXISTS public.job_templates CASCADE;

-- Step 5: Drop trigger function ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.pt_set_updated_at() CASCADE;

-- Step 6: Drop enum type ─────────────────────────────────────────────────────
-- Only safe to drop if nothing else references it after the CASCADE above.
DROP TYPE IF EXISTS public.job_template_category CASCADE;

-- =============================================================================
-- Rollback verification (pgTAP assertions — commented out for prod)
-- Uncomment when running under `supabase test db`:
-- =============================================================================
-- SELECT plan(4);
-- SELECT hasnt_table('public', 'job_templates',        'job_templates dropped');
-- SELECT hasnt_table('public', 'job_template_stages',  'job_template_stages dropped');
-- SELECT hasnt_table('public', 'time_in_stage_log',    'time_in_stage_log dropped');
-- SELECT hasnt_view ('public', 'bottleneck_heatmap_v', 'bottleneck_heatmap_v dropped');
-- SELECT * FROM finish();

COMMIT;

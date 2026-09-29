-- Platform-Wide Search RPC Functions for Super Admin
-- v16.5.0 (schema-corrected: job_code/invoice_code/member_id/org_id PK)
-- NOTE: platform_search_jobs / platform_search_members / platform_search_invoices
--       are defined with full-text-search (FTS) + rank in 20260828_platform_fts.sql
--       which is appended first.  This file only adds GRANTs and trigram indexes.

-- ─── Grant Execute to authenticated ─────────────────────────────────────────

GRANT EXECUTE ON FUNCTION platform_search_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION platform_search_members TO authenticated;
GRANT EXECUTE ON FUNCTION platform_search_invoices TO authenticated;

-- ─── Trigram indexes for performance ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm        ON public.jobs        USING gin (title        gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_code_trgm         ON public.jobs        USING gin (job_code     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_org_members_name_trgm  ON public.org_members USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_org_members_email_trgm ON public.org_members USING gin (email        gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_code_trgm     ON public.invoices    USING gin (invoice_code gin_trgm_ops);

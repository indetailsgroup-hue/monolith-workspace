-- =============================================================================
-- Migration: 00000000000063_organizations_org_members_stub.sql
-- Purpose:   Minimal stubs for public.organizations and public.org_members so
--            that 0173_rls_isolation_hardening.sql (SECTION 0 guard) does not
--            abort when run without the 20260828_multi_tenant_schema.sql
--            preamble (e.g. db-verify.yml pure-supabase-start path).
--
--            Uses CREATE TABLE IF NOT EXISTS — fully safe to run before the
--            real schema migration; the real 20260828 migration will no-op its
--            CREATE TABLE statements and then ALTER/seed on top.
--
-- Sorting:   Filename 00000000000063 < 0160 < 0173 (lexicographic), so this
--            runs before 0173_rls_isolation_hardening.sql in all migration
--            runners (db-verify.yml, supabase start, etc.).
-- =============================================================================

-- organizations stub — minimal columns required by FK references in 0173+
CREATE TABLE IF NOT EXISTS public.organizations (
  org_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL DEFAULT '',
  plan        TEXT        NOT NULL DEFAULT 'FREE',
  slug        TEXT        NOT NULL DEFAULT 'stub-org',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  status      TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- org_members stub — columns required by RLS policies in 0173+
CREATE TABLE IF NOT EXISTS public.org_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  user_id         UUID,
  role            TEXT        NOT NULL DEFAULT 'VIEWER',
  display_name    TEXT,
  email           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  hierarchy_level INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

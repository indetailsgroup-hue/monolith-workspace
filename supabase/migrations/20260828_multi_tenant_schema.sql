-- ============================================================================
-- Migration: 20260828_multi_tenant_schema.sql
-- MONOLITH Multi-Tenant Architecture — Organization-Scoped Schema
--
-- This migration adds:
-- 1. organizations table (tenants)
-- 2. org_members table (user-org-role mapping)
-- 3. org_invitations table
-- 4. org_id column to existing tables (jobs, quotations, invoices, ledger)
-- 5. RLS policies for tenant isolation
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED')),
  logo_url TEXT,
  primary_color TEXT,
  max_users INTEGER NOT NULL DEFAULT 2,
  max_jobs_per_month INTEGER NOT NULL DEFAULT 10,
  settings JSONB NOT NULL DEFAULT '{
    "locale": "th-TH",
    "currency": "THB",
    "timezone": "Asia/Bangkok",
    "enableCurvedPanels": false,
    "enableNesting": false,
    "enableDxfExport": false,
    "quotationPrefix": "ORG",
    "jobCodePrefix": "ORG"
  }'::jsonb,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: if the stub (00000000000063) ran first it created organizations without created_at;
-- add the column idempotently so both migration paths converge.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index for slug lookup
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- ============================================================================
-- 2. ORG_MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.org_members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('OWNER', 'ADMIN', 'DESIGNER', 'FACTORY', 'INSTALLER', 'FINANCE', 'VIEWER')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,

  -- A user can only be a member of an org once
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

-- ============================================================================
-- 3. ORG_INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.org_invitations (
  invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON public.org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON public.org_invitations(email);

-- ============================================================================
-- 4. ADD org_id TO EXISTING TABLES
-- ============================================================================

-- Jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org ON public.jobs(org_id);

-- Quotations
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org ON public.quotations(org_id);

-- Invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);

-- Ledger entries (guarded — table may not exist in CI baseline)
DO $le_col$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ledger_entries') THEN
    EXECUTE 'ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ledger_entries_org ON public.ledger_entries(org_id)';
  END IF;
END $le_col$;

-- ============================================================================
-- 5. RLS POLICIES — TENANT ISOLATION
-- ============================================================================

-- Helper function: get current user's active org
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations: users can only see their own org
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_own" ON public.organizations
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "org_update_admin" ON public.organizations
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND is_active = true)
  );

-- Org Members: visible within same org
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_same_org" ON public.org_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "members_manage_admin" ON public.org_members
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND is_active = true)
  );

-- Jobs: tenant isolation
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_tenant_isolation" ON public.jobs
  USING (org_id = public.get_user_org_id());

CREATE POLICY "jobs_tenant_insert" ON public.jobs
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- Quotations: tenant isolation
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_tenant_isolation" ON public.quotations
  USING (org_id = public.get_user_org_id());

CREATE POLICY "quotations_tenant_insert" ON public.quotations
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- Invoices: tenant isolation
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_tenant_isolation" ON public.invoices
  USING (org_id = public.get_user_org_id());

CREATE POLICY "invoices_tenant_insert" ON public.invoices
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- Ledger: tenant isolation (guarded — table may not exist in CI baseline)
DO $le_rls$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ledger_entries') THEN
    EXECUTE 'ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$CREATE POLICY "ledger_tenant_isolation" ON public.ledger_entries
      USING (org_id = public.get_user_org_id())$p$;
    EXECUTE $p$CREATE POLICY "ledger_tenant_insert" ON public.ledger_entries
      FOR INSERT WITH CHECK (org_id = public.get_user_org_id())$p$;
  END IF;
END $le_rls$;

-- ============================================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

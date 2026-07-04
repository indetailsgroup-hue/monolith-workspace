-- Migration: line_oa_query_audit
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 17.1 Implement rpc_query_line_audit (SECURITY DEFINER, RLS-honoring read helper)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (public.line_oa_audit_log)
--   00000000000003_line_oa_rls.sql            (RLS SELECT policy on line_oa_audit_log)
--   00000000000004_line_oa_audit_immutability.sql (append-only audit log)
--   (shipped C12) public.is_governance_role(), public.has_site_access(text)
--
-- Scope: the audit-log READ helper ONLY.
--   * public.rpc_query_line_audit(...)
--
-- This migration does NOT implement the property test (task 17.2) or any other RPC.
--
-- ===========================================================================
-- RLS-HONORING AUDIT QUERY (Req 13.4)
-- ===========================================================================
-- This is a SECURITY DEFINER read helper that exposes the immutable audit trail
-- with server-side filtering by event_type, vertical_context, site_code,
-- performed_by, and a performed_at range. Because SECURITY DEFINER bypasses RLS,
-- the function MUST itself enforce the principal's permitted read set so it can
-- never widen visibility beyond what the table's RLS SELECT policy
-- (00000000000003_line_oa_rls.sql) would allow:
--
--     using (public.is_governance_role() or public.has_site_access(site_code))
--
-- The function therefore mirrors that exact predicate per row (Req 12.1, 12.2,
-- 12.3, 12.7):
--   * A Governance_Role reads across all Site_Codes, including audit rows whose
--     site_code is NULL (not yet known).
--   * A Branch_Role reads ONLY rows whose site_code satisfies
--     public.has_site_access(site_code). Since public.has_site_access(NULL) is
--     false, audit rows with a NULL site_code are NEVER returned to a Branch_Role.
--
-- All supplied filters are AND-combined; a NULL filter argument means "do not
-- filter on this dimension". The performed_at range is inclusive on both bounds
-- when supplied. Filtering is applied IN ADDITION to (never instead of) the
-- permission predicate, so every returned row both matches the filters and is
-- within the caller's permitted read set (Req 13.4).
--
-- Secret hygiene: the audit log holds no Channel_Secret / Channel_Access_Token by
-- construction (Req 13.3), and this read path decrypts nothing, so there is
-- nothing to scrub. Only non-secret audit columns are returned.
--
-- Requirements: 13.4

-- This function references the shipped C12 helpers public.is_governance_role()
-- and public.has_site_access(text), which may not exist at migration-build time
-- in a bare environment (they are a platform prerequisite). Disable body
-- validation so the migration applies cleanly; the body is validated at first
-- call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- public.rpc_query_line_audit(
--     p_event_type        text   default null,
--     p_vertical_context  text   default null,
--     p_site_code         text   default null,
--     p_performed_by      text   default null,
--     p_performed_from    timestamptz default null,  -- inclusive lower bound
--     p_performed_to      timestamptz default null   -- inclusive upper bound
-- ) returns table (...)
--
-- Returns the audit rows that satisfy every supplied filter AND are within the
-- caller's permitted read set (governance: all rows incl. NULL site_code;
-- branch: only has_site_access(site_code) rows, never NULL site_code).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_query_line_audit(
  p_event_type text default null,
  p_vertical_context text default null,
  p_site_code text default null,
  p_performed_by text default null,
  p_performed_from timestamptz default null,
  p_performed_to timestamptz default null
)
returns table (
  id uuid,
  event_type text,
  vertical_context text,
  site_code text,
  entity_ref text,
  performed_by text,
  performed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id,
    a.event_type,
    a.vertical_context,
    a.site_code,
    a.entity_ref,
    a.performed_by,
    a.performed_at
  from public.line_oa_audit_log a
  where
    -- Permitted read set: mirror the RLS SELECT policy exactly so SECURITY
    -- DEFINER never widens visibility. Governance sees all; a branch principal
    -- sees only has_site_access(site_code) rows (NULL site_code excluded, since
    -- has_site_access(NULL) = false) (Req 12.1, 12.2, 12.3, 12.7, 13.4).
    (public.is_governance_role() or public.has_site_access(a.site_code))
    -- Supplied filters (AND-combined; NULL means "no filter on this dimension").
    and (p_event_type is null or a.event_type = p_event_type)
    and (p_vertical_context is null or a.vertical_context = p_vertical_context)
    and (p_site_code is null or a.site_code = p_site_code)
    and (p_performed_by is null or a.performed_by = p_performed_by)
    and (p_performed_from is null or a.performed_at >= p_performed_from)
    and (p_performed_to is null or a.performed_at <= p_performed_to)
  order by a.performed_at desc, a.id;
$$;

comment on function public.rpc_query_line_audit(text, text, text, text, timestamptz, timestamptz)
  is 'RLS-honoring audit read helper: filters line_oa_audit_log by event_type, vertical_context, site_code, performed_by and an inclusive performed_at range, returning only rows the caller may read (governance sees all incl. NULL site_code; branch sees only has_site_access(site_code) rows, never NULL site_code) (Req 13.4).';

-- ---------------------------------------------------------------------------
-- Grants. Caller-facing read RPC: EXECUTE is revoked from PUBLIC and granted to
-- `authenticated`; the in-function permission predicate enforces the read set.
-- The grant is applied only where the role exists so the migration also applies
-- cleanly in a plain PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_query_line_audit(text, text, text, text, timestamptz, timestamptz) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_query_line_audit(text, text, text, text, timestamptz, timestamptz) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

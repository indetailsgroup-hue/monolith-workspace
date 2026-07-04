-- Migration: line_oa_audit_immutability (audit-log immutability trigger + REVOKE)
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 3.2 Add audit-log immutability trigger and revoke grants
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (creates public.line_oa_audit_log)
--   00000000000002_line_oa_constraints.sql
--
-- Scope: audit-log immutability ONLY. This adds a BEFORE UPDATE/DELETE trigger
-- (with its trigger function) that rejects any attempt to modify or remove an
-- audit row, and REVOKEs UPDATE/DELETE on the table from PUBLIC and the standard
-- Supabase roles. INSERT remains permitted so the SECURITY DEFINER RPCs can keep
-- appending audit entries.
--
-- Why both a trigger AND a REVOKE (Req 13.2):
--   * The REVOKE removes the privilege so ordinary roles cannot even attempt an
--     UPDATE/DELETE (permission-level protection).
--   * The trigger enforces immutability independently of grants -- it fires for
--     EVERY role, including the table owner / SECURITY DEFINER context, so an
--     UPDATE/DELETE is rejected even where the privilege would otherwise apply.
--     Together they make the audit log append-only "independently of
--     application-level protection" (Req 13.2).
--
-- Conventions (matching the shipped platform migrations):
--   * lowercase SQL keywords
--   * additive CREATE/ALTER only (no table re-definition)

-- ---------------------------------------------------------------------------
-- Immutability trigger function
-- Raises an exception on any UPDATE or DELETE of public.line_oa_audit_log.
-- tg_op is interpolated only for a clearer error; no row data is exposed.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa_audit_log_immutable()
returns trigger
language plpgsql as $$
begin
  raise exception
    'line_oa_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.line_oa_audit_log_immutable() is
  'Enforces append-only immutability on line_oa_audit_log by rejecting any '
  'UPDATE or DELETE at the database level, independently of grants (Req 13.2).';

-- ---------------------------------------------------------------------------
-- Immutability trigger
-- BEFORE UPDATE OR DELETE, per row, so the exception aborts the statement
-- before any row is altered or removed.
-- ---------------------------------------------------------------------------
create trigger trg_line_oa_audit_log_immutable
  before update or delete on public.line_oa_audit_log
  for each row execute function public.line_oa_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Revoke UPDATE/DELETE privileges
-- Remove the ability to UPDATE or DELETE audit rows from PUBLIC (which every
-- role inherits) and from the standard Supabase roles explicitly. INSERT and
-- SELECT are deliberately left untouched: appends continue through the
-- SECURITY DEFINER RPCs, and reads are governed by RLS (task 3.1).
--
-- PUBLIC always exists; the named Supabase roles (anon / authenticated /
-- service_role) are revoked only where present so the migration also applies
-- cleanly in a plain PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke update, delete on public.line_oa_audit_log from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'revoke update, delete on public.line_oa_audit_log from %I', r
      );
    end if;
  end loop;
end;
$$;

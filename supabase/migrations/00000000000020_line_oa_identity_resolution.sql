-- Migration: line_oa_identity_resolution
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 7.1 Implement customer-identity resolution helper
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql       (public.line_oa_customer_identity, pgcrypto)
--   00000000000002_line_oa_constraints.sql  (UNIQUE (line_user_id, vertical_context))
--
-- Scope: the customer-identity RESOLUTION HELPER ONLY.
--   * public.line_oa_resolve_customer_identity(text, text)
--
-- This is the building block that rpc_ingest_line_webhook (task 8.1) calls to bind a
-- LINE_User_Id (within a Vertical_Context) to a canonical Customer_Id. This migration
-- does NOT implement:
--   * rpc_evaluate_identity_merge_candidate (task 7.3 / R-03 guardrail)
--   * the identity-binding property test (task 7.2) or unit test (task 7.8)
--   * the full ingestion RPC (task 8.1)
--
-- Behavior (Req 6.1-6.5):
--   * Resolves OR creates exactly one CustomerIdentity per (line_user_id, vertical_context).
--   * Reuses an existing binding when present (returns the bound customer_id) (Req 6.2).
--   * Otherwise mints a new Customer_Id (uuid) and binds it (Req 6.3).
--   * Persists the binding with its vertical_context (Req 6.5).
--   * Relies on the UNIQUE (line_user_id, vertical_context) constraint from task 2.2 to
--     guarantee a SINGLE binding under concurrency: the INSERT ... ON CONFLICT DO NOTHING
--     races safely (the conflicting writer's row is then read back), so two concurrent
--     callers can never create two bindings for the same pair (Req 6.1, 6.4).
--
-- Conventions (matching the shipped platform + earlier line_oa migrations):
--   * lowercase SQL keywords
--   * SECURITY DEFINER, no client write path: EXECUTE revoked from PUBLIC. The helper is
--     invoked only by the SECURITY DEFINER ingest RPC running as the owning role.
--   * No secrets are touched here, so there is nothing to scrub; audit of the receipt is
--     written by the calling ingest RPC (task 8.1), not by this helper.
--
-- Requirements: 6.1, 6.2, 6.3, 6.4, 6.5

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Repeat idempotently.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.line_oa_resolve_customer_identity(
--     p_line_user_id    text,
--     p_vertical_context text,
--     OUT customer_id    uuid,
--     OUT identity_id    uuid,
--     OUT created        boolean
-- )
--
-- Resolve-or-create the single CustomerIdentity binding for (line_user_id, vertical_context).
--
-- Returns:
--   * customer_id  -- the canonical Customer_Id now bound to the pair
--   * identity_id  -- the line_oa_customer_identity row id
--   * created      -- true when a new binding (and new Customer_Id) was minted this call,
--                     false when an existing binding was reused
--
-- Concurrency: the INSERT ... ON CONFLICT (line_user_id, vertical_context) DO NOTHING
-- never raises on a duplicate. When DO NOTHING suppresses the insert (a row already exists
-- or a concurrent transaction created it), the RETURNING clause yields no row, and we read
-- the existing/committed binding back. This leans on the UNIQUE constraint to enforce the
-- "exactly one binding per pair" invariant rather than application-level locking.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa_resolve_customer_identity(
  p_line_user_id text,
  p_vertical_context text,
  out customer_id uuid,
  out identity_id uuid,
  out created boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_customer_id uuid := gen_random_uuid();
  v_identity_id     uuid;
  v_customer_id     uuid;
begin
  -- Inputs are required: a binding is meaningless without both coordinates (Req 6.1, 6.5).
  if p_line_user_id is null or length(btrim(p_line_user_id)) = 0 then
    raise exception 'line_oa: line_user_id is required for identity resolution'
      using errcode = '22004';   -- null_value_not_allowed
  end if;
  if p_vertical_context is null or length(btrim(p_vertical_context)) = 0 then
    raise exception 'line_oa: vertical_context is required for identity resolution'
      using errcode = '22004';
  end if;

  -- Attempt to create the binding. The UNIQUE (line_user_id, vertical_context) constraint
  -- (task 2.2) makes this the single source of truth for "one binding per pair" (Req 6.4):
  -- a concurrent creator collides here and DO NOTHING keeps us race-safe. Results are read
  -- into local variables (not the OUT params) so the RETURNING column list is unambiguous.
  -- Qualify the RETURNING columns with the table name: the function's OUT
  -- parameter `customer_id` would otherwise make a bare `customer_id` reference
  -- ambiguous against the table column (PL/pgSQL raises "column reference is
  -- ambiguous"). Table-qualifying pins each reference to the column.
  insert into public.line_oa_customer_identity (line_user_id, vertical_context, customer_id)
  values (p_line_user_id, p_vertical_context, v_new_customer_id)
  on conflict (line_user_id, vertical_context) do nothing
  returning line_oa_customer_identity.id, line_oa_customer_identity.customer_id
    into v_identity_id, v_customer_id;

  if v_identity_id is not null then
    -- We minted and bound a brand-new Customer_Id (Req 6.3).
    identity_id := v_identity_id;
    customer_id := v_customer_id;
    created := true;
    return;
  end if;

  -- A binding already existed (or a concurrent writer committed first): reuse it (Req 6.2).
  select ci.id, ci.customer_id
    into v_identity_id, v_customer_id
  from public.line_oa_customer_identity ci
  where ci.line_user_id = p_line_user_id
    and ci.vertical_context = p_vertical_context;

  identity_id := v_identity_id;
  customer_id := v_customer_id;
  created := false;
  return;
end;
$$;

comment on function public.line_oa_resolve_customer_identity(text, text)
  is 'Resolve-or-create the single CustomerIdentity binding per (line_user_id, vertical_context): reuse an existing binding or mint+bind a new Customer_Id, relying on the UNIQUE constraint for single-binding under concurrency (Req 6.1-6.5).';

-- ---------------------------------------------------------------------------
-- Lock down EXECUTE. This is an internal building block for the SECURITY DEFINER
-- ingest RPC (task 8.1); it must not be callable directly by clients. The ingest
-- RPC, running as the owning role, can still invoke it.
-- ---------------------------------------------------------------------------
revoke all on function public.line_oa_resolve_customer_identity(text, text) from public;

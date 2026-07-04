-- Migration: line_oa_signature_verification
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 6.1 Implement channel resolution and HMAC-SHA256 signature verification
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql  (public.line_oa_channels, pgcrypto)
--
-- Scope: channel-resolution + signature-verification HELPERS ONLY.
--   * public.line_oa__ct_equal(bytea, bytea)        -- constant-time byte compare
--   * public.line_oa_resolve_channel(text)          -- vertical + access-token REF (no secret)
--   * public.line_oa_verify_signature(text,text,text) -- HMAC-SHA256 verify (secret stays internal)
--
-- These are the building blocks that rpc_ingest_line_webhook (task 8.1) calls; this
-- migration does NOT implement the full ingestion RPC, nor any tests.
--
-- Secret hygiene (Req 1.5):
--   * Channel secrets live in Supabase Vault. line_oa_channels stores only references.
--   * The plaintext Channel_Secret is resolved INSIDE line_oa_verify_signature and is
--     never returned to a caller, never logged, and never placed in an error message.
--   * line_oa_resolve_channel returns only the vertical_context and the access-token
--     REFERENCE (not the token value).
--   * All EXECUTE is revoked from PUBLIC/anon/authenticated: these run only as the
--     definer (i.e. when invoked from the SECURITY DEFINER ingest RPC owned by the
--     same role). There is no client-facing signing/verification oracle.
--
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

-- The verification function references Supabase Vault (vault.decrypted_secrets),
-- which may not exist at migration-build time in every environment. Disable body
-- validation so the migration applies cleanly; the body is validated at first call.
set check_function_bodies = off;

-- pgcrypto provides hmac(); created by the schema migration. Repeat idempotently.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.line_oa__ct_equal(a bytea, b bytea) -> boolean
--
-- Constant-time equality for two byte strings. Folds any length difference into
-- the accumulator and always iterates over the full (longer) length without an
-- early exit, so the comparison time does not depend on where the first mismatch
-- occurs. Used to compare the provided LINE_Signature against the expected HMAC
-- (Req 1.4). Pure / IMMUTABLE: holds no secrets and reads no state.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa__ct_equal(a bytea, b bytea)
returns boolean
language plpgsql
immutable
as $$
declare
  la int := coalesce(length(a), 0);
  lb int := coalesce(length(b), 0);
  n  int := greatest(la, lb);
  i  int;
  ba int;
  bb int;
  diff int := la # lb;   -- nonzero (folded in) when lengths differ
begin
  -- Iterate the full max length; treat out-of-range bytes as 0. No short-circuit.
  for i in 0 .. n - 1 loop
    if i < la then ba := get_byte(a, i); else ba := 0; end if;
    if i < lb then bb := get_byte(b, i); else bb := 0; end if;
    diff := diff | (ba # bb);
  end loop;

  return diff = 0;
end;
$$;

comment on function public.line_oa__ct_equal(bytea, bytea)
  is 'Constant-time byte-string equality used by LINE signature verification (Req 1.4).';

-- ---------------------------------------------------------------------------
-- public.line_oa_resolve_channel(p_channel_identifier text)
--   OUT vertical_context text
--   OUT channel_access_token_ref text
--
-- Resolves the NON-SECRET context for a receiving channel: its Vertical_Context
-- and the Vault REFERENCE for the Channel_Access_Token (never the token value).
-- Raises (errcode P0002 = no_data_found) for an unknown or inactive channel,
-- WITHOUT placing any secret/reference value in the error message (Req 1.1, 1.6).
--
-- SECURITY DEFINER so it can read line_oa_channels under the no-client-write-path
-- model; callers (the ingest RPC) get only the vertical + token reference.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa_resolve_channel(
  p_channel_identifier text,
  out vertical_context text,
  out channel_access_token_ref text
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select c.vertical_context, c.channel_access_token_ref
    into vertical_context, channel_access_token_ref
  from public.line_oa_channels c
  where c.channel_identifier = p_channel_identifier
    and c.is_active;

  -- vertical_context is NOT NULL in the table, so a NULL here means "no active row".
  if vertical_context is null then
    raise exception 'line_oa: channel could not be resolved'
      using errcode = 'P0002';   -- deliberately carries no identifier/secret value
  end if;
end;
$$;

comment on function public.line_oa_resolve_channel(text)
  is 'Resolves Vertical_Context and Channel_Access_Token reference for a channel; raises for unknown/inactive channels without exposing secrets (Req 1.1, 1.6).';

-- ---------------------------------------------------------------------------
-- public.line_oa_verify_signature(
--     p_channel_identifier text,
--     p_raw_body text,
--     p_signature text
-- ) -> boolean
--
-- Verifies the x-line-signature header for a received Webhook_Event:
--   * Resolves the Channel_Secret from Supabase Vault by the channel's stored
--     reference (Req 1.1). The plaintext NEVER leaves this function (Req 1.5).
--   * Computes expected = base64( HMAC-SHA256(channel_secret, raw_body) ) (Req 1.2).
--   * Returns FALSE for a missing signature (Req 1.3) and for any value that does
--     not match (tampered body / wrong secret / malformed base64) (Req 1.4), using
--     a constant-time compare.
--   * Raises (errcode P0002) for an unresolvable channel/secret (Req 1.6) with no
--     secret value in the message, so the caller can audit-reject distinctly.
--
-- IMPORTANT for callers: pass the EXACT raw request body bytes LINE delivered
-- (UTF-8 JSON). Any re-encoding/normalization before this call will break the HMAC.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa_verify_signature(
  p_channel_identifier text,
  p_raw_body text,
  p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_secret_ref   text;
  v_secret       text;
  v_expected_b64 text;
  v_expected     bytea;
  v_provided     bytea;
begin
  -- Req 1.3: a missing/blank signature is rejected outright.
  if p_signature is null or length(btrim(p_signature)) = 0 then
    return false;
  end if;

  -- Resolve the channel's secret REFERENCE. Unknown/inactive -> reject (Req 1.6).
  select c.channel_secret_ref
    into v_secret_ref
  from public.line_oa_channels c
  where c.channel_identifier = p_channel_identifier
    and c.is_active;

  if v_secret_ref is null then
    raise exception 'line_oa: channel could not be resolved'
      using errcode = 'P0002';   -- no identifier/secret value in the message
  end if;

  -- Resolve the plaintext Channel_Secret from Vault by reference (uuid or name).
  -- This value stays strictly inside this function (Req 1.5).
  select ds.decrypted_secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.id::text = v_secret_ref
     or ds.name = v_secret_ref
  limit 1;

  if v_secret is null then
    raise exception 'line_oa: channel secret could not be resolved'
      using errcode = 'P0002';   -- never echoes the reference or value
  end if;

  -- Req 1.2: expected signature = base64( HMAC-SHA256(secret, raw_body) ).
  v_expected_b64 := encode(
    hmac(convert_to(p_raw_body, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'),
    'base64'
  );
  v_expected := decode(v_expected_b64, 'base64');

  -- Decode the caller-supplied signature; malformed base64 is simply "no match"
  -- rather than an error (Req 1.4).
  begin
    v_provided := decode(p_signature, 'base64');
  exception
    when others then
      return false;
  end;

  -- Req 1.4: constant-time compare; never short-circuits on first mismatch.
  return public.line_oa__ct_equal(v_provided, v_expected);
end;
$$;

comment on function public.line_oa_verify_signature(text, text, text)
  is 'Verifies x-line-signature as base64 HMAC-SHA256(channel_secret, raw_body) using a constant-time compare; secret resolved from Vault and never exposed (Req 1.2-1.6).';

-- ---------------------------------------------------------------------------
-- Lock down EXECUTE. These helpers are internal building blocks for the
-- SECURITY DEFINER ingest RPC (task 8.1); they must not be callable directly by
-- clients. The ingest RPC, running as the owner, can still invoke them.
-- ---------------------------------------------------------------------------
revoke all on function public.line_oa__ct_equal(bytea, bytea) from public;
revoke all on function public.line_oa_resolve_channel(text) from public;
revoke all on function public.line_oa_verify_signature(text, text, text) from public;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

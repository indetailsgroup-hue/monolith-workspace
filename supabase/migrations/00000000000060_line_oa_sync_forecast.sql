-- Migration: line_oa_sync_forecast
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 15.1 Implement rpc_sync_line_forecast (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql              (public.line_oa_orders,
--                                                    public.line_oa_audit_log, pgcrypto)
--   00000000000003_line_oa_rls.sql                 (SELECT-only RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql  (append-only audit log)
--   (shipped A1)  public.get_active_site_codes()   -- canonical active Site_Code source
--   (shipped C12) public.is_governance_role(), public.has_site_access(text),
--                 public.resolve_actor()
--   (shipped Forecasting pipeline) public.record_input_sync(
--                   text, public.sync_source, public.sync_status, integer, jsonb)
--                 writing to the append-only public.forecast_input_sync_log
--
-- Scope: the FORECASTING SYNCHRONIZATION RPC ONLY.
--   * public.rpc_sync_line_forecast(text, text, text)
--
-- This migration does NOT implement the property test (task 15.2), the integration
-- tests (task 15.3), the session timeout sweep (task 16), or the Edge Functions
-- (task 19). It INVOKES the existing forecasting contract; it NEVER modifies it.
--
-- ===========================================================================
-- FORECASTING PIPELINE SYNCHRONIZATION (Req 10.1-10.5, 12.5)
-- ===========================================================================
-- The owned LINE channel contributes per-branch demand to the existing
-- forecasting input pipeline. This RPC is the single, audited LINE-side entry
-- point that pushes the LINE order data for one resolved Active_Site_Code into
-- that pipeline via public.record_input_sync(Sync_Source='line', ...).
--
-- The forecasting contract is REUSED, NOT REDEFINED (Req 10.2):
--   * record_input_sync is invoked exactly as the forecasting module published
--     it; this migration neither creates nor alters forecast_input_sync_log,
--     the sync_source / sync_status enums, nor record_input_sync itself.
--   * record_input_sync only ever APPENDS to the append-only
--     forecast_input_sync_log, so the most recent successfully synchronized row
--     for a site is always preserved -- a later failed attempt is appended as a
--     new 'failed' row and never disturbs prior good data (Req 10.3).
--
-- Behavior:
--   1. Re-checks the caller's role INSIDE the function (Req 12.5). Synchronizing a
--      site's LINE demand is permitted to a Governance_Role (any active site) OR to
--      a principal holding access to that site via public.has_site_access(). A
--      caller with neither is rejected permission-denied with NO state change.
--   2. Resolves the audit actor via public.resolve_actor() rather than trusting any
--      client-supplied identifier (Req 12.5).
--   3. Site gating + selection (Req 10.4, 10.5): the target p_site_code must be a
--      resolved Active_Site_Code (present in public.get_active_site_codes());
--      an unknown/inactive code is rejected ("unknown or inactive", state
--      unchanged). The synchronized record count is the count of Line_Orders
--      stamped with THAT site_code. Orders lacking a resolved site_code
--      (site_code IS NULL) never match the equality filter and are therefore
--      excluded until their site is resolved (Req 10.5).
--   4. Invocation (Req 10.1): calls record_input_sync with Sync_Source='line', the
--      site_code, the computed record count, and the reported status. The new
--      append-only sync-log row id is returned by the pipeline and surfaced as
--      sync_log_id.
--   5. Failure recording (Req 10.3): a caller may report an upstream failure by
--      passing p_status='failed' (with an optional error detail). The failure is
--      recorded THROUGH the existing pipeline as an appended 'failed' sync-log row
--      (record count 0), leaving every prior successful row -- the last good sync --
--      intact.
--   6. Audit (Req 13.1): exactly one line_oa_audit_log entry per call recording the
--      site, the reported status, the record count, and the pipeline sync-log id.
--
-- Secret hygiene (Req 13.3): this flow touches NO Channel_Secret or
-- Channel_Access_Token, so there is nothing to decrypt and nothing to scrub from
-- the forecasting payload. As defence in depth, any operator-supplied error detail
-- is stripped of Bearer / access-token-shaped material before it is forwarded to
-- the pipeline or recorded in audit, so a token can never leak even if a caller
-- mistakenly forwards a raw API error string.
--
-- Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.5

-- This function references the shipped A1/C12 helpers and the forecasting
-- pipeline contract (public.record_input_sync, public.sync_source,
-- public.sync_status), which may not exist at migration-build time in a bare
-- environment (they are platform / earlier-module prerequisites). Disable body
-- validation so the migration applies cleanly; the body is validated at first
-- call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.rpc_sync_line_forecast(
--     p_site_code     text,
--     p_status        text default 'success',  -- 'success' | 'partial' | 'failed'
--     p_error_detail  text default null,        -- only meaningful when status='failed'
--     OUT site_code         text,
--     OUT sync_status       text,
--     OUT records_ingested  integer,
--     OUT sync_log_id       uuid,               -- id of the appended pipeline row
--     OUT synced            boolean             -- true on the success/partial path
-- )
--
-- Synchronize one resolved Active_Site_Code's LINE order demand into the existing
-- forecasting input pipeline. The single-argument call rpc_sync_line_forecast(site)
-- performs a normal ('success') sync; the optional status/error arguments let a
-- caller record an upstream failure through the same append-only pipeline while
-- preserving the last good sync (Req 10.3).
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sync_line_forecast(
  p_site_code text,
  p_status text default 'success',
  p_error_detail text default null,
  out site_code text,
  out sync_status text,
  out records_ingested integer,
  out sync_log_id uuid,
  out synced boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site_code      text;
  v_status         text;
  v_actor          text;
  v_is_active_code boolean;
  v_record_count   integer;
  v_error_detail   text;
  v_error_jsonb    jsonb;
  v_sync_log_id    uuid;
begin
  synced := false;

  -- -------------------------------------------------------------------------
  -- Input validation. A synchronization is meaningless without a site. Messages
  -- use non-secret identifiers only.
  -- -------------------------------------------------------------------------
  v_site_code := nullif(btrim(coalesce(p_site_code, '')), '');
  if v_site_code is null then
    raise exception 'line_oa: site_code is required to synchronize forecasting'
      using errcode = '22004';   -- null_value_not_allowed
  end if;

  -- Normalize/validate the reported sync status. Only the three forecasting
  -- pipeline statuses are accepted; anything else is rejected (Req 10.1, 10.3).
  v_status := lower(btrim(coalesce(p_status, 'success')));
  if v_status not in ('success', 'partial', 'failed') then
    raise exception 'line_oa: unsupported sync status (expected success, partial, or failed)'
      using errcode = '22023';   -- invalid_parameter_value
  end if;

  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5). Synchronizing a site's demand is
  -- permitted to a Governance_Role (any active site) OR to a principal holding
  -- access to the target site. A caller with neither is rejected permission-denied
  -- with NO state change.
  -- -------------------------------------------------------------------------
  if not (public.is_governance_role() or public.has_site_access(v_site_code)) then
    raise exception 'line_oa: permission denied to synchronize forecasting for this site'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- Site gating (Req 10.4). Forecasting is associated with the site of the
  -- contributing Line_Orders, and we only synchronize a RESOLVED ACTIVE site.
  -- Re-validate against the ONLY source of valid Site_Codes (A1); an
  -- unknown/inactive code is rejected with state unchanged.
  -- -------------------------------------------------------------------------
  select exists (
    select 1
    from public.get_active_site_codes() g
    where g.site_code = v_site_code
  )
  into v_is_active_code;

  if not v_is_active_code then
    raise exception 'line_oa: site_code is unknown or inactive'
      using errcode = '22023';   -- invalid_parameter_value; no state change
  end if;

  -- -------------------------------------------------------------------------
  -- Selection (Req 10.4, 10.5). The synchronized record count is the count of
  -- Line_Orders stamped with this resolved site_code. Orders lacking a resolved
  -- site_code (site_code IS NULL) never satisfy the equality predicate and are
  -- therefore excluded until their site is resolved (Req 10.5).
  --
  -- On a reported failure the attempt ingested no records; the count is forced to 0
  -- so the appended 'failed' row reflects that nothing was successfully synced.
  -- -------------------------------------------------------------------------
  if v_status = 'failed' then
    v_record_count := 0;

    -- A failure SHOULD carry an explanation; default to a non-secret placeholder.
    v_error_detail := nullif(btrim(coalesce(p_error_detail, '')), '');
    if v_error_detail is null then
      v_error_detail := 'line_oa: forecasting sync failed (no detail provided)';
    end if;

    -- Secret scrub (Req 13.3): strip any Bearer / access-token-shaped material from
    -- the operator-supplied detail before it leaves this function.
    v_error_detail := regexp_replace(v_error_detail, '(?i)bearer\s+[A-Za-z0-9._\-+/=]+', 'Bearer [REDACTED]', 'g');
    v_error_detail := regexp_replace(v_error_detail, '[A-Za-z0-9._\-+/=]{40,}', '[REDACTED]', 'g');

    v_error_jsonb := jsonb_build_object('error', v_error_detail);
  else
    select count(*)::integer
      into v_record_count
    from public.line_oa_orders o
    where o.site_code = v_site_code;

    v_error_detail := null;
    v_error_jsonb := null;
  end if;

  -- -------------------------------------------------------------------------
  -- Invoke the EXISTING forecasting contract (Req 10.1, 10.2). record_input_sync
  -- only APPENDS to the append-only forecast_input_sync_log, so a 'failed' attempt
  -- is recorded as a new row that preserves the last good sync (Req 10.3). This
  -- migration neither creates nor alters any forecasting object -- it calls the
  -- contract exactly as published.
  -- -------------------------------------------------------------------------
  v_sync_log_id := public.record_input_sync(
    v_site_code,
    'line'::public.sync_source,
    v_status::public.sync_status,
    v_record_count,
    v_error_jsonb
  );

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the synchronization (Req 13.1). entity_ref
  -- is composed from non-secret identifiers only; no Channel_Secret /
  -- Channel_Access_Token is ever in scope here (Req 13.3).
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    case when v_status = 'failed'
         then 'line_forecast_sync_failed'
         else 'line_forecast_synced'
    end,
    'line',                       -- Sync_Source dimension for this owned-channel sync
    v_site_code,
    format(
      'forecast_input_sync:%s|site_code:%s|status:%s|records_ingested:%s',
      coalesce(v_sync_log_id::text, '(none)'), v_site_code, v_status, v_record_count
    ),
    v_actor
  );

  -- OUT params describing the synchronization.
  site_code        := v_site_code;
  sync_status      := v_status;
  records_ingested := v_record_count;
  sync_log_id      := v_sync_log_id;
  synced           := (v_status <> 'failed');
  return;
end;
$$;

comment on function public.rpc_sync_line_forecast(text, text, text)
  is 'Synchronizes one resolved Active_Site_Code''s LINE order demand into the existing forecasting pipeline: re-checks role + has_site_access, resolves the actor, validates the site against get_active_site_codes(), counts Line_Orders stamped with that site_code (NULL-site orders excluded), invokes the unmodified record_input_sync(Sync_Source=''line'', ...) which appends to the append-only log (failures preserve the last good sync), and writes one audit entry (Req 10.1-10.5, 12.5, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This is a caller-facing RPC (the only write path), so EXECUTE is
-- revoked from PUBLIC and granted to `authenticated`; the in-function role
-- re-check enforces authorization (Req 12.5). The grant is applied only where the
-- role exists so the migration also applies cleanly in a plain PostgreSQL
-- environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_sync_line_forecast(text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_sync_line_forecast(text, text, text) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

-- Migration: line_oa_session_timeout_sweep
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 16.1 Implement the 24-hour Session_Timeout auto-close sweep
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (public.line_oa_conversations with
--                                              status + last_activity_at,
--                                              public.line_oa_audit_log,
--                                              public.line_oa_conversation_status)
--   00000000000004_line_oa_audit_immutability.sql (append-only audit log)
--   (shipped C12) public.resolve_actor()      -- actor resolution for audit
--
-- Scope: the Session_Timeout AUTO-CLOSE SWEEP function ONLY.
--   * public.rpc_sweep_line_session_timeouts()
--
-- This migration does NOT implement the property test (task 16.2) or any other RPC.
--
-- ===========================================================================
-- SESSION_TIMEOUT AUTO-CLOSE SWEEP (Req 3.7)
-- ===========================================================================
-- Each Conversation carries a 24-hour Session_Timeout measured from its
-- last_activity_at. Because the LINE webhook carries no "session ended" signal,
-- expiry is enforced by a periodic sweep rather than by an inbound event. This
-- function transitions every non-closed Conversation whose last_activity_at is
-- strictly older than 24 hours to `closed`, and writes EXACTLY ONE audit entry
-- per closed Conversation (Req 13.1).
--
-- Idle threshold: last_activity_at < (now_utc - interval '24 hours'). A
-- Conversation whose activity is exactly at or after the boundary is left
-- untouched; only those that have been idle BEYOND the window are closed
-- (Req 3.7). Re-running the sweep is naturally idempotent: an already-closed
-- Conversation is excluded by `status <> 'closed'`, so no duplicate closures or
-- audit rows are produced.
--
-- Closing a Conversation does NOT reopen anything and never reactivates a
-- closed thread; a subsequent inbound for the same (line_user_id,
-- vertical_context) opens a fresh Conversation via the ingest RPC (Req 3.8).
-- The partial-unique index `UNIQUE (line_user_id, vertical_context) WHERE
-- status <> 'closed'` permits that because closed rows are excluded from it.
--
-- Actor / secret hygiene: this flow touches NO Channel_Secret or
-- Channel_Access_Token, so there is nothing to scrub; the audit entity_ref is
-- composed from non-secret identifiers only (conversation id + reason)
-- (Req 13.3). The actor is resolved via public.resolve_actor(); when the sweep
-- runs from a scheduled (jobless) context with no request principal, it falls
-- back to a non-secret system label so performed_by is always populated.
--
-- Scheduling note: this function is intended to be invoked periodically by a
-- scheduled job (e.g. pg_cron) rather than by interactive clients, for example:
--   select cron.schedule(
--     'line-oa-session-timeout-sweep',
--     '*/15 * * * *',
--     $cron$ select public.rpc_sweep_line_session_timeouts(); $cron$
--   );
-- The cron registration itself is environment/operations concern and is left
-- out of this migration; only the SECURITY DEFINER sweep function is defined here.
--
-- Requirements: 3.7

-- public.resolve_actor() is a shipped C12 helper that may not exist at
-- migration-build time in a bare environment (it is a platform prerequisite).
-- Disable body validation so the migration applies cleanly; the body is
-- validated at first call (matching the earlier line_oa RPC migrations).
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- public.rpc_sweep_line_session_timeouts(
--     OUT closed_count integer
-- )
--
-- Close every Conversation idle beyond the 24-hour Session_Timeout and audit
-- each closure. Returns the number of Conversations closed by this invocation
-- (0 when none are idle), so a scheduled job can log/monitor sweep volume.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sweep_line_session_timeouts(
  out closed_count integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   text;
  v_cutoff  timestamptz;
begin
  -- Resolve the audit actor from the request context, never from client input
  -- (Req 12.5). The sweep typically runs without an interactive principal, so
  -- fall back to a fixed, non-secret system label (Req 13.1, 13.3).
  v_actor := coalesce(public.resolve_actor(), 'system:line_oa_session_timeout_sweep');

  -- The 24-hour Session_Timeout boundary, in UTC. Conversations whose
  -- last_activity_at is strictly before this instant are idle beyond the window.
  v_cutoff := timezone('utc', now()) - interval '24 hours';

  -- Atomically close all idle, non-closed Conversations and write one audit
  -- entry per closure in the same statement. RETURNING from the UPDATE feeds the
  -- audit INSERT so the closure set and its audit trail can never diverge.
  with closed as (
    update public.line_oa_conversations c
       set status = 'closed'
     where c.status <> 'closed'
       and c.last_activity_at < v_cutoff
    returning c.id, c.vertical_context, c.site_code
  ),
  audited as (
    insert into public.line_oa_audit_log (
      event_type, vertical_context, site_code, entity_ref, performed_by
    )
    select
      'conversation_auto_closed',
      cl.vertical_context,
      cl.site_code,                         -- null while still site_unresolved (Req 13.1)
      format('line_oa_conversation:%s|reason:session_timeout', cl.id),
      v_actor
    from closed cl
    returning 1
  )
  select count(*)::integer from closed
  into closed_count;

  return;
end;
$$;

comment on function public.rpc_sweep_line_session_timeouts()
  is 'Session_Timeout sweep: closes every non-closed LINE Conversation whose last_activity_at is older than 24h and writes one audit entry per closure; resolves the actor via resolve_actor() with a system fallback. Intended for a scheduled job (e.g. pg_cron). Returns the number of conversations closed (Req 3.7, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This is a system sweep meant to run from a scheduled (service) context,
-- not an interactive client write path, so EXECUTE is revoked from PUBLIC and
-- granted only to service_role where it exists. The grant is applied
-- conditionally so the migration also applies cleanly in a plain PostgreSQL
-- environment (e.g. ephemeral CI verification) that lacks the Supabase roles.
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_sweep_line_session_timeouts() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_sweep_line_session_timeouts() to service_role';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

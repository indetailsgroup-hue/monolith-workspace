-- ===========================================================================
-- 0185_trust_kernel_revocation_reason_class.sql
-- MONOLITH Production Trust Kernel — Revocation reason class (plan Task 2)
--
-- Classifies every revocation with a machine-readable reason class so a later
-- task can require SAFETY-class provenance before seeding a deny-only content
-- block (design 2026-07-22 §10.4 revocation semantics; plan
-- 2026-07-24-trust-kernel-safety-content-revocation-registry.en.md Task 2).
--
-- Deny-only / no new authority: this migration only CLASSIFIES an existing
-- revocation. It adds no grant and no positive-authority path; release_revision
-- remains the sole positive authority and revocation's effect is unchanged.
--
-- Additive over the committed 0180-0184 chain (does not edit them). It:
--   1. adds release_revision.revoke_reason_class (four-value domain CHECK),
--   2. widens rr_revoke_shape so a REVOKED row REQUIRES the class and an ACTIVE
--      row REQUIRES it NULL (same widening pattern as 0181),
--   3. replaces rpc_trust_revoke with a required p_reason_class parameter that
--      validates the value, stores it, and adds it to the RELEASE_REVOKED event.
--
-- Phase: NOT_FOR_PRODUCTION (shadow-e0). No production markers/claims.
-- Apply: psql -1 -f supabase/migrations/0185_trust_kernel_revocation_reason_class.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. revoke_reason_class column + four-value domain CHECK (null allowed here;
--    the null-ness-by-status rule is enforced by rr_revoke_shape below).
-- ---------------------------------------------------------------------------
alter table public.release_revision
  add column if not exists revoke_reason_class text;

alter table public.release_revision
  drop constraint if exists rr_revoke_reason_class_domain;
alter table public.release_revision
  add constraint rr_revoke_reason_class_domain check (
    revoke_reason_class is null
    or revoke_reason_class in ('SAFETY','OPERATIONAL','SUPERSEDED','ATTESTATION_STALE')
  );

-- ---------------------------------------------------------------------------
-- 2. Widen rr_revoke_shape: a REVOKED row now REQUIRES revoke_reason_class NOT
--    NULL and an ACTIVE row REQUIRES it NULL — preserving the existing
--    revoked_at / revoked_by_user_id / revoke_sequence clauses (0182:180-186).
-- ---------------------------------------------------------------------------
alter table public.release_revision drop constraint if exists rr_revoke_shape;
alter table public.release_revision add constraint rr_revoke_shape check (
  case status
    when 'ACTIVE'  then revoked_at is null     and revoked_by_user_id is null     and revoke_sequence is null     and revoke_reason_class is null
    when 'REVOKED' then revoked_at is not null and revoked_by_user_id is not null and revoke_sequence is not null and revoke_reason_class is not null
    else false
  end
);

-- ---------------------------------------------------------------------------
-- 3. rpc_trust_revoke — now carries a REQUIRED reason class. A required
--    parameter cannot be added via CREATE OR REPLACE, so drop both the old
--    3-arg and any prior 4-arg signature (defensive/re-runnable) then create.
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_trust_revoke(uuid, uuid, text);
drop function if exists public.rpc_trust_revoke(uuid, uuid, text, text);

create function public.rpc_trust_revoke(
  p_context_id uuid,
  p_release_revision_id uuid,
  p_reason text,
  p_reason_class text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx public.verified_action_context%rowtype;
  v_now timestamptz := clock_timestamp();
  v_seq bigint;
  v_rev_site uuid;
begin
  -- Validate the reason class against the fixed four-value vocabulary BEFORE the
  -- single-use REVOKE context is consumed, so a malformed request never burns an
  -- action context. An unknown class is a malformed revoke request, rejected with
  -- the same stable code this RPC already uses for a malformed request (the
  -- resource-mismatch check below). CHECK-extensible: adding a class is a
  -- versioned change (design §10.4; reasonCodes.ts is the §13 source of truth).
  if p_reason_class is null
     or p_reason_class not in ('SAFETY','OPERATIONAL','SUPERSEDED','ATTESTATION_STALE') then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'unknown revoke reason class';
  end if;

  -- Consume a FRESH REVOKE action context (role SAFETY_REVOKER, §7.3).
  v_ctx := public.consume_verified_action_context(p_context_id, 'REVOKE');
  if v_ctx.resource_id is distinct from p_release_revision_id::text then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'context resource does not match the release revision';
  end if;

  select site_id into v_rev_site from public.release_revision
    where tenant_id = v_ctx.tenant_id and id = p_release_revision_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release revision';
  end if;
  -- Site-authority binding (§7.5, PGA-1): the revision must belong to the site
  -- the REVOKE context was authorized for.
  if v_rev_site is distinct from v_ctx.site_id then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'release revision belongs to a different site than the authorized context';
  end if;

  perform pg_advisory_xact_lock(hashtext('monolith_release_sequence:' || v_ctx.tenant_id::text));
  select coalesce(max(revoke_sequence), 0) + 1 into v_seq from public.release_revision where tenant_id = v_ctx.tenant_id;

  -- Append-only CAS ACTIVE -> REVOKED; a second revoke loses (§10.4).
  update public.release_revision
     set status = 'REVOKED', revoked_at = v_now, revoked_by_user_id = v_ctx.actor_user_id,
         revoke_reason = p_reason, revoke_reason_class = p_reason_class, revoke_sequence = v_seq
   where tenant_id = v_ctx.tenant_id and id = p_release_revision_id and status = 'ACTIVE';
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'release revision is not ACTIVE (revocation is append-only)';
  end if;

  insert into public.release_event (tenant_id, release_revision_id, event_type, sequence, payload)
    values (v_ctx.tenant_id, p_release_revision_id, 'RELEASE_REVOKED', v_seq,
            jsonb_build_object('reason', p_reason, 'reasonClass', p_reason_class));
  insert into public.release_outbox (tenant_id, release_revision_id, kind, payload)
    values (v_ctx.tenant_id, p_release_revision_id, 'EMIT_STATUS_BUNDLE', jsonb_build_object('revokeSequence', v_seq));
  return p_release_revision_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution grants (least privilege) — mirror the 0182 grant block for the old
-- rpc_trust_revoke, now on the 4-arg signature. User-authorized RPC: the human
-- action context is the authority; service_role is allowed for tests and
-- orchestration but cannot mint the underlying human action context (0180).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_trust_revoke(uuid, uuid, text, text) from public, anon;
grant execute on function public.rpc_trust_revoke(uuid, uuid, text, text) to authenticated, service_role;

comment on function public.rpc_trust_revoke(uuid, uuid, text, text)
  is 'Trust Kernel §10.4: consumes a REVOKE action context and append-only CAS-flips an ACTIVE release revision to REVOKED, recording a required reason class (SAFETY/OPERATIONAL/SUPERSEDED/ATTESTATION_STALE) on the row and in the RELEASE_REVOKED event, and emitting a status-bundle outbox row. Deny-only: adds no grant. Stable errors STATE_CONFLICT / AUTH_ACTION_CONTEXT_INVALID / AUTH_SCOPE_DENIED.';

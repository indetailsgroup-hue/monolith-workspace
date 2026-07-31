-- 0192_repair_phase0_consume_org_recheck.sql
-- Repair Intelligence Phase 0 (wave 3.1 review fix): revoke pre-minted
-- authority when its organization or bound site becomes inactive.
--
-- Migration 0189 made organization status load-bearing when an action context
-- is minted, but the 0180 consume function still rechecked only membership
-- state/version. A context minted while its scope was ACTIVE could therefore
-- survive a later organization or site deactivation. Replace the consume
-- function forward-only so scope status is checked under the same row lock
-- immediately before the one-time consume update.

do $$
begin
  if to_regprocedure('public.consume_verified_action_context(uuid,text,boolean)') is not null then
    raise exception 'divergent schema: reconcile 3-arg consume overload before applying 0192 — this branch owns only the 2-arg form';
  end if;
end;
$$;

create or replace function public.consume_verified_action_context(
  p_context_id uuid,
  p_expected_action text
) returns public.verified_action_context
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.verified_action_context%rowtype;
  v_membership public.monolith_membership%rowtype;
begin
  -- Lock the row for one-time-nonce semantics.
  select * into v from public.verified_action_context where id = p_context_id for update;
  if not found then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'unknown action context';
  end if;
  if v.consumed_at is not null then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'action context already consumed';
  end if;
  if clock_timestamp() > v.expires_at then
    raise exception 'AUTH_ACTION_CONTEXT_EXPIRED' using detail = 'action context expired';
  end if;
  if v.action is distinct from p_expected_action then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'action does not match the context';
  end if;

  -- Scope status is live authority, not issuance-time metadata. An organization
  -- deactivation revokes every unconsumed context pinned to that organization.
  if not exists (
    select 1
    from public.monolith_organization o
    where o.tenant_id = v.tenant_id
      and o.id = v.organization_id
      and o.status = 'ACTIVE'
  ) then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'action context organization is no longer active';
  end if;

  -- Current contexts are site-bound; retain the null guard so a future
  -- organization-only context is not accidentally forced through a site check.
  if v.site_id is not null and not exists (
    select 1
    from public.monolith_site s
    where s.tenant_id = v.tenant_id
      and s.organization_id = v.organization_id
      and s.id = v.site_id
      and s.status = 'ACTIVE'
  ) then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'action context site is no longer active';
  end if;

  -- Membership must still be ACTIVE at the version pinned when the context was issued.
  select * into v_membership
  from public.monolith_membership
  where tenant_id = v.tenant_id and id = v.membership_id;
  if not found or v_membership.status <> 'ACTIVE' then
    raise exception 'AUTH_MEMBERSHIP_REVOKED' using detail = 'membership is no longer active';
  end if;
  if v_membership.version <> v.membership_version then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'membership version changed since issuance';
  end if;

  update public.verified_action_context
    set consumed_at = clock_timestamp()
    where id = v.id
    returning * into v;
  return v;
end;
$$;

-- CREATE OR REPLACE preserves ACLs; re-assert the internal-only contract.
revoke all on function public.consume_verified_action_context(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_verified_action_context(uuid, text)
  to service_role;

comment on function public.consume_verified_action_context(uuid, text)
  is 'Trust Kernel §7.2 / Repair Phase 0: locks and one-time-consumes an action context, rechecking action, expiry, ACTIVE organization/site scope, and membership state/version. Stable errors AUTH_ACTION_CONTEXT_INVALID / AUTH_ACTION_CONTEXT_EXPIRED / AUTH_SCOPE_DENIED / AUTH_MEMBERSHIP_REVOKED.';

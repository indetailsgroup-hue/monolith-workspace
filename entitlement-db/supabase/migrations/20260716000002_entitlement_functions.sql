-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- resolver functions (current_org/is_member/assert_org_access/effective_plan/has_feature/feature_limit/can_consume/consume/assert_feature)
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3 = SSOT; passed security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4)
--   lines 150-305 — DO NOT edit here without updating the spec SSOT first.
-- Ordering note: tasks.md says "init -> RLS -> functions -> ..." loosely, but the
--   RLS policies call is_member() so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft own run order).
-- =====================================================================

-- =====================================================================
-- 4. RESOLVER FUNCTIONS
-- =====================================================================
create or replace function public.current_org()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'org_id','')::uuid,
    (select org_id from public.memberships
      where user_id = auth.uid()
      order by created_at asc, org_id asc
      limit 1)
  );
$$;

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.assert_org_access(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') = 'service_role' then return; end if;
  if not public.is_member(p_org) then
    raise exception 'org_access_denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.effective_plan(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case
        when s.status in ('active','trialing') then s.plan_code
        when s.status = 'past_due'
         and coalesce(s.current_period_end, now()) + interval '7 days' > now()
          then s.plan_code
        else 'free'
      end
     from public.subscriptions s where s.org_id = p_org),
    'free'
  );
$$;

-- [F2] boolean: roadmap → plan ไม่มีผล ปลดได้เฉพาะ override (beta)
create or replace function public.has_feature(p_org uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_status public.feature_status; v_override boolean; v_found boolean;
begin
  perform public.assert_org_access(p_org);

  select status into v_status from public.features where key = p_feature;
  if v_status is null then return false; end if;                 -- unknown feature = deny

  select o.bool_value, true into v_override, v_found
    from public.entitlement_overrides o
   where o.org_id = p_org and o.feature_key = p_feature
     and (o.expires_at is null or o.expires_at > now());
  if coalesce(v_found,false) then
    return coalesce(v_override,false);                           -- override ชนะเสมอ (รวม beta)
  end if;

  if v_status = 'roadmap' then return false; end if;             -- [F2] plan ปลด roadmap ไม่ได้

  return coalesce(
    (select pe.bool_value
       from public.plan_entitlements pe
      where pe.plan_code = public.effective_plan(p_org)
        and pe.feature_key = p_feature),
    false
  );
end;
$$;

-- [F2] limit: roadmap → 0 เว้นแต่มี override (beta)
create or replace function public.feature_limit(p_org uuid, p_feature text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v_status public.feature_status; v_override record; v_plan_limit bigint; v_found boolean;
begin
  perform public.assert_org_access(p_org);

  select status into v_status from public.features where key = p_feature;
  if v_status is null then return 0; end if;

  select * into v_override from public.entitlement_overrides o
    where o.org_id = p_org and o.feature_key = p_feature
      and (o.expires_at is null or o.expires_at > now());
  if found then
    return coalesce(v_override.limit_value, -1);
  end if;

  if v_status = 'roadmap' then return 0; end if;                 -- [F2]

  select pe.limit_value, true into v_plan_limit, v_found
    from public.plan_entitlements pe
   where pe.plan_code = public.effective_plan(p_org)
     and pe.feature_key = p_feature;
  if not coalesce(v_found,false) then return 0; end if;
  return coalesce(v_plan_limit, -1);
end;
$$;

create or replace function public.can_consume(p_org uuid, p_feature text, p_amount bigint default 1)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_limit bigint; v_used bigint; v_period text := to_char(now(),'YYYY-MM');
begin
  perform public.assert_org_access(p_org);
  v_limit := public.feature_limit(p_org, p_feature);
  if v_limit = -1 then return true; end if;
  if v_limit = 0  then return false; end if;
  select coalesce(used_value,0) into v_used from public.usage_counters
    where org_id = p_org and feature_key = p_feature and period = v_period;
  return coalesce(v_used,0) + p_amount <= v_limit;
end;
$$;

create or replace function public.consume(p_org uuid, p_feature text, p_amount bigint default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(now(),'YYYY-MM');
begin
  perform public.assert_org_access(p_org);
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || '|' || p_feature, 0));
  if not public.can_consume(p_org, p_feature, p_amount) then
    raise exception 'quota_exceeded: % on %', p_feature, p_org using errcode = 'check_violation';
  end if;
  insert into public.usage_counters(org_id, feature_key, period, used_value)
  values (p_org, p_feature, v_period, p_amount)
  on conflict (org_id, feature_key, period)
  do update set used_value = public.usage_counters.used_value + excluded.used_value;
end;
$$;

create or replace function public.assert_feature(p_org uuid, p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_kind public.gate_kind; v_status public.feature_status;
begin
  select kind, status into v_kind, v_status from public.features where key = p_feature;
  if v_kind is null then
    raise exception 'unknown_feature: %', p_feature using errcode = 'undefined_object';
  end if;
  if v_kind <> 'boolean' then
    raise exception 'wrong_gate_kind: % is %, use feature_limit()/consume()', p_feature, v_kind
      using errcode = 'feature_not_supported';
  end if;
  if not public.has_feature(p_org, p_feature) then
    if v_status = 'roadmap' then
      raise exception 'feature_roadmap: % (coming soon)', p_feature
        using errcode = 'feature_not_supported';                 -- [F2] error แยก ให้ UI ขึ้น "coming soon"
    end if;
    raise exception 'not_entitled: %', p_feature using errcode = 'insufficient_privilege';
  end if;
end;
$$;

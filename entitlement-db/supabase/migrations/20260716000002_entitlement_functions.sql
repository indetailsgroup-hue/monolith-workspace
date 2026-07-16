-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- resolver functions (current_org/is_member/assert_org_access/effective_plan/has_feature/feature_limit/can_consume/consume/assert_feature)
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3.1 = SSOT; security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4,
--    landing fix v0.3.1 [L10]) — DO NOT edit here; edit the spec SSOT then re-split.
-- Ordering note: RLS policies call is_member(), so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft's own run order).
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

-- ---------- v0.3.2 [F6]: billing RPCs (Phase 2.1/2.2) — service role เท่านั้น ----------
create or replace function public.assert_service_role()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_only' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- 2.1: contract เดียวที่ webhook (Stripe หรือ manual) ใช้เขียน subscriptions
-- idempotent upsert ต่อ org — retry ของ provider ซ้ำกี่ครั้งก็ได้ค่าเดิม
create or replace function public.billing_apply_subscription(
  p_org uuid, p_plan_code text, p_status public.sub_status,
  p_period_start timestamptz, p_period_end timestamptz,
  p_provider text default null, p_provider_customer_id text default null,
  p_provider_sub_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_service_role();
  if not exists (select 1 from public.plans where code = p_plan_code) then
    raise exception 'unknown_plan: %', p_plan_code using errcode = 'foreign_key_violation';
  end if;
  insert into public.subscriptions(
    org_id, plan_code, status, current_period_start, current_period_end,
    provider, provider_customer_id, provider_sub_id, updated_at)
  values (p_org, p_plan_code, p_status, p_period_start, p_period_end,
          p_provider, p_provider_customer_id, p_provider_sub_id, now())
  on conflict (org_id) do update
    set plan_code            = excluded.plan_code,
        status               = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end   = excluded.current_period_end,
        provider             = coalesce(excluded.provider, subscriptions.provider),
        provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
        provider_sub_id      = coalesce(excluded.provider_sub_id, subscriptions.provider_sub_id),
        updated_at           = now();
end;
$$;

-- 2.2: reset usage ต้นรอบบิล — เคลียร์ counter ของ period ปัจจุบัน แล้วคืนจำนวนแถวที่ลบ
-- (metering เป็น calendar-month ตาม v0.3: consume ใช้ to_char(now(),'YYYY-MM') —
--  ถ้า owner ต้องการ anchor ตามรอบบิลจริงต้องแก้ semantic ของ consume ด้วย = design note)
create or replace function public.billing_reset_usage(p_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(now(),'YYYY-MM'); v_n integer;
begin
  perform public.assert_service_role();
  delete from public.usage_counters where org_id = p_org and period = v_period;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- v0.3.2 [F5]: JWT org_id (Phase 2.3) ----------
-- ผู้ใช้เลือก org ปัจจุบัน — ต้องเป็นสมาชิก org นั้น (fail-closed)
create or replace function public.set_active_org(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_org_access(p_org);
  update public.profiles set active_org_id = p_org where id = auth.uid();
  if not found then
    raise exception 'profile_not_found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- GoTrue Custom Access Token hook — inject claims.org_id:
--   active_org_id (ถ้ายังเป็นสมาชิก) > membership แรก (deterministic เดียวกับ
--   current_org() fallback: order by created_at, org_id) > ไม่ใส่ claim
-- current_org() ฝั่ง DB อ่าน request.jwt.claims->>'org_id' อยู่แล้ว (v0.3)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid; v_org uuid; v_claims jsonb;
begin
  v_user := nullif(event->>'user_id','')::uuid;
  if v_user is null then return event; end if;
  select coalesce(
    (select p.active_org_id from public.profiles p
      where p.id = v_user and p.active_org_id is not null
        and exists (select 1 from public.memberships m
                     where m.org_id = p.active_org_id and m.user_id = v_user)),
    (select m.org_id from public.memberships m
      where m.user_id = v_user
      order by m.created_at asc, m.org_id asc
      limit 1)
  ) into v_org;
  if v_org is null then return event; end if;
  v_claims := coalesce(event->'claims', '{}'::jsonb) || jsonb_build_object('org_id', v_org::text);
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

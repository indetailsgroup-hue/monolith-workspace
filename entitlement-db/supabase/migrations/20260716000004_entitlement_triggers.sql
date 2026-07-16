-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- stock-quota triggers (projects / machine_profiles / memberships-seats)
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3 = SSOT; passed security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4)
--   lines 370-428 — DO NOT edit here without updating the spec SSOT first.
-- Ordering note: tasks.md says "init -> RLS -> functions -> ..." loosely, but the
--   RLS policies call is_member() so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft own run order).
-- =====================================================================

-- =====================================================================
-- 6. STOCK-QUOTA TRIGGERS (เหมือน v0.2 — atomic)
-- =====================================================================
create or replace function public.enforce_project_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|platform.projects', 0));
  v_limit := public.feature_limit(new.org_id, 'platform.projects');
  if v_limit = -1 then return new; end if;
  select count(*) into v_count from public.projects where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: platform.projects (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_project_quota on public.projects;
create trigger trg_project_quota before insert on public.projects
  for each row execute function public.enforce_project_quota();

create or replace function public.enforce_machine_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|machine.profiles', 0));
  v_limit := public.feature_limit(new.org_id, 'machine.profiles');
  if v_limit = -1 then return new; end if;
  select count(*) into v_count from public.machine_profiles where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: machine.profiles (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_machine_quota on public.machine_profiles;
create trigger trg_machine_quota before insert on public.machine_profiles
  for each row execute function public.enforce_machine_quota();

create or replace function public.enforce_seat_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|platform.seats', 0));
  v_limit := public.feature_limit(new.org_id, 'platform.seats');
  if v_limit = -1 then return new; end if;
  select count(*) into v_count from public.memberships where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: platform.seats (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_seat_quota on public.memberships;
create trigger trg_seat_quota before insert on public.memberships
  for each row execute function public.enforce_seat_quota();

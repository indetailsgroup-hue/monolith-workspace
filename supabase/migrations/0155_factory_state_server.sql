-- Migration: factory_state_server — ADR-060: server authority ของ Designer Workspace (P10/P11/P12)
--
-- ราก S15-1: freeze/release/export ออกแบบเป็น "Server-only authority" แต่ server ไม่เคยถูกสร้าง
-- → สร้างบน Supabase: state machine ใน SQL (authority เดียว, ทุก transition มี event) + edge fn factory-api เป็น HTTP ชั้นบาง
--
-- State machine: DRAFT → freeze → FROZEN → release → RELEASED → revoke → FROZEN
-- can-export: FROZEN หรือ RELEASED (ตรง gate message "Spec must be FROZEN or RELEASED to export")

create table if not exists public.factory_jobs (
  job_id text primary key,
  spec_state text not null default 'DRAFT' check (spec_state in ('DRAFT', 'FROZEN', 'RELEASED')),
  revision_id text,
  manifest_sha256 text,
  packet_sha256 text,
  note text,
  change_class text,
  actor_role text,
  actor_name text,
  frozen_at timestamptz,
  released_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.factory_jobs enable row level security;
create policy factory_jobs_sel on public.factory_jobs for select to authenticated using (true);

create table if not exists public.factory_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  event text not null,           -- freeze | release | revoke | created
  actor_role text,
  actor_name text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default timezone('utc', now())
);
alter table public.factory_job_events enable row level security;
create policy factory_job_events_sel on public.factory_job_events for select to authenticated using (true);

-- state ปัจจุบัน (สร้างแถว DRAFT อัตโนมัติเมื่อยังไม่รู้จัก job — job id มาจากฝั่ง Designer)
create or replace function public.rpc_factory_job_state(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_job_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'job_id required');
  end if;
  insert into public.factory_jobs (job_id) values (btrim(p_job_id))
  on conflict (job_id) do nothing;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id);
  return jsonb_build_object(
    'ok', true, 'jobId', v.job_id, 'specState', v.spec_state,
    'revisionId', v.revision_id, 'manifestSha256', v.manifest_sha256, 'packetSha256', v.packet_sha256,
    'frozenAt', v.frozen_at, 'releasedAt', v.released_at, 'revokedAt', v.revoked_at,
    'updatedAt', v.updated_at);
end; $$;

-- transition เดียวครอบสามแอ็กชัน — state machine บังคับใน SQL
create or replace function public.rpc_factory_job_transition(
  p_job_id text, p_action text, p_actor_role text default 'DESIGNER',
  p_actor_name text default null, p_note text default null, p_change_class text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_rev text;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('freeze', 'release', 'revoke') then
    return jsonb_build_object('ok', false, 'error', 'unknown action');
  end if;
  insert into public.factory_jobs (job_id) values (btrim(p_job_id))
  on conflict (job_id) do nothing;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;

  if p_action = 'freeze' then
    if v.spec_state <> 'DRAFT' then
      return jsonb_build_object('ok', false, 'error', 'cannot freeze: state is ' || v.spec_state);
    end if;
    v_rev := 'REV-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || upper(left(md5(v.job_id || clock_timestamp()::text), 6));
    update public.factory_jobs set spec_state = 'FROZEN', revision_id = v_rev,
      frozen_at = timezone('utc', now()), revoked_at = null,
      note = p_note, change_class = p_change_class, actor_role = p_actor_role, actor_name = p_actor_name,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  elsif p_action = 'release' then
    if v.spec_state <> 'FROZEN' then
      return jsonb_build_object('ok', false, 'error', 'cannot release: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set spec_state = 'RELEASED', released_at = timezone('utc', now()),
      note = p_note, actor_role = p_actor_role, actor_name = p_actor_name,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  else -- revoke
    if v.spec_state <> 'RELEASED' then
      return jsonb_build_object('ok', false, 'error', 'cannot revoke: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set spec_state = 'FROZEN', revoked_at = timezone('utc', now()),
      note = p_note, actor_role = p_actor_role, actor_name = p_actor_name,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  end if;

  insert into public.factory_job_events (job_id, event, actor_role, actor_name, detail)
  values (btrim(p_job_id), p_action, p_actor_role, p_actor_name,
    jsonb_build_object('note', p_note, 'change_class', p_change_class));

  return public.rpc_factory_job_state(p_job_id);
end; $$;

-- P12 proof bundle
create or replace function public.rpc_factory_job_proof(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_state jsonb;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  v_state := public.rpc_factory_job_state(p_job_id);
  select * into v from public.factory_jobs where job_id = btrim(p_job_id);
  return jsonb_build_object(
    'ok', true, 'version', 'MONOLITH_PROOF_V1', 'jobId', v.job_id,
    'fetchedAt', timezone('utc', now()),
    'state', jsonb_build_object(
      'specState', v.spec_state, 'revisionId', v.revision_id,
      'manifestSha256', v.manifest_sha256, 'packetSha256', v.packet_sha256,
      'frozenAt', v.frozen_at, 'releasedAt', v.released_at, 'revokedAt', v.revoked_at,
      'updatedAt', v.updated_at),
    'lineageHead', jsonb_build_object('revisionId', v.revision_id, 'at', v.frozen_at),
    'canExport', v.spec_state in ('FROZEN', 'RELEASED'),
    'canExportReason', case when v.spec_state in ('FROZEN', 'RELEASED') then null
      else 'Spec must be FROZEN or RELEASED to export' end,
    'warnings', '[]'::jsonb);
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_job_state(text)',
    'rpc_factory_job_transition(text, text, text, text, text, text)',
    'rpc_factory_job_proof(text)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function public.%s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;

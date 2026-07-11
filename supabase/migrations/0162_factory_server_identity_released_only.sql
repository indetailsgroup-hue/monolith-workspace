-- 0162: S17-1 server-owned factory identity + S17-2 RELEASED-only invariant
--
-- Trust boundary:
--   factory-api verifies the end-user JWT with Supabase Auth, derives
--   app_metadata.roles + app_metadata.site_codes, and calls these service-role-only
--   RPCs with the resulting server context. No actor parameter has a client default.
--
alter table public.factory_jobs
  add column if not exists actor_subject_id text,
  add column if not exists actor_roles text[] not null default '{}'::text[],
  add column if not exists actor_site_codes text[] not null default '{}'::text[],
  add column if not exists authorization_context_id text;

alter table public.factory_job_events
  add column if not exists actor_subject_id text,
  add column if not exists actor_roles text[] not null default '{}'::text[],
  add column if not exists actor_site_codes text[] not null default '{}'::text[],
  add column if not exists authorization_context_id text;

-- Remove the legacy overload whose actor fields had spoofable defaults.
drop function if exists public.rpc_factory_job_transition(text, text, text, text, text, text);

create function public.rpc_factory_job_transition(
  p_job_id text,
  p_action text,
  p_actor_subject_id text,
  p_actor_roles text[],
  p_actor_site_codes text[],
  p_authorization_context_id text,
  p_actor_role text,
  p_actor_name text,
  p_note text,
  p_change_class text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_rev text;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_actor_subject_id), '') = ''
     or coalesce(array_length(p_actor_roles, 1), 0) = 0
     or coalesce(btrim(p_authorization_context_id), '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_actor_role, '') not in ('DESIGNER', 'FACTORY', 'INSTALLER', 'FINANCE', 'ADMIN') then
    raise exception 'invalid server actor context' using errcode = 'check_violation';
  end if;
  if coalesce(p_action, '') not in ('freeze', 'release', 'revoke', 'unfreeze') then
    return jsonb_build_object('ok', false, 'error', 'unknown action');
  end if;
  if coalesce(btrim(p_job_id), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'job_id required');
  end if;

  insert into public.factory_jobs (job_id) values (btrim(p_job_id))
  on conflict (job_id) do nothing;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;

  if p_action = 'freeze' then
    if v.spec_state <> 'DRAFT' then
      return jsonb_build_object('ok', false, 'error', 'cannot freeze: state is ' || v.spec_state);
    end if;
    v_rev := 'REV-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-'
      || upper(left(md5(v.job_id || clock_timestamp()::text), 6));
    update public.factory_jobs set
      spec_state = 'FROZEN', revision_id = v_rev,
      frozen_at = timezone('utc', now()), revoked_at = null,
      note = p_note, change_class = p_change_class,
      actor_role = p_actor_role, actor_name = p_actor_name,
      actor_subject_id = p_actor_subject_id,
      actor_roles = p_actor_roles,
      actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
      authorization_context_id = p_authorization_context_id,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  elsif p_action = 'release' then
    if v.spec_state <> 'FROZEN' then
      return jsonb_build_object('ok', false, 'error', 'cannot release: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set
      spec_state = 'RELEASED', released_at = timezone('utc', now()),
      note = p_note,
      actor_role = p_actor_role, actor_name = p_actor_name,
      actor_subject_id = p_actor_subject_id,
      actor_roles = p_actor_roles,
      actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
      authorization_context_id = p_authorization_context_id,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  elsif p_action = 'unfreeze' then
    if v.spec_state <> 'FROZEN' then
      return jsonb_build_object('ok', false, 'error', 'cannot unfreeze: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set
      spec_state = 'DRAFT', note = p_note,
      actor_role = p_actor_role, actor_name = p_actor_name,
      actor_subject_id = p_actor_subject_id,
      actor_roles = p_actor_roles,
      actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
      authorization_context_id = p_authorization_context_id,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  else
    if v.spec_state <> 'RELEASED' then
      return jsonb_build_object('ok', false, 'error', 'cannot revoke: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set
      spec_state = 'FROZEN', revoked_at = timezone('utc', now()),
      note = p_note,
      actor_role = p_actor_role, actor_name = p_actor_name,
      actor_subject_id = p_actor_subject_id,
      actor_roles = p_actor_roles,
      actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
      authorization_context_id = p_authorization_context_id,
      updated_at = timezone('utc', now())
    where job_id = v.job_id;
  end if;

  insert into public.factory_job_events (
    job_id, event, actor_role, actor_name, actor_subject_id,
    actor_roles, actor_site_codes, authorization_context_id, detail
  ) values (
    btrim(p_job_id), p_action, p_actor_role, p_actor_name, p_actor_subject_id,
    p_actor_roles, coalesce(p_actor_site_codes, '{}'::text[]), p_authorization_context_id,
    jsonb_build_object('note', p_note, 'change_class', p_change_class)
  );

  return public.rpc_factory_job_state(p_job_id);
end; $$;

-- Proof output is authoritative only when RELEASED (S17-2).
create or replace function public.rpc_factory_job_proof(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  perform public.rpc_factory_job_state(p_job_id);
  select * into v from public.factory_jobs where job_id = btrim(p_job_id);
  return jsonb_build_object(
    'ok', true, 'version', 'MONOLITH_PROOF_V1', 'jobId', v.job_id,
    'fetchedAt', timezone('utc', now()),
    'state', jsonb_build_object(
      'specState', v.spec_state, 'revisionId', v.revision_id,
      'manifestSha256', v.manifest_sha256, 'packetSha256', v.packet_sha256,
      'frozenAt', v.frozen_at, 'releasedAt', v.released_at,
      'revokedAt', v.revoked_at, 'updatedAt', v.updated_at),
    'lineageHead', jsonb_build_object('revisionId', v.revision_id, 'at', v.frozen_at),
    'canExport', v.spec_state = 'RELEASED',
    'canExportReason', case when v.spec_state = 'RELEASED' then null
      else 'Spec must be RELEASED to export' end,
    'warnings', '[]'::jsonb);
end; $$;

-- Remove packet/audit overloads that accepted caller-selected role/name defaults.
drop function if exists public.rpc_factory_job_record_packet(text, text, text, text, text, text);
drop function if exists public.rpc_factory_job_verify_result(text, text, text, text, text);

create function public.rpc_factory_job_record_packet(
  p_job_id text,
  p_packet_sha256 text,
  p_manifest_sha256 text,
  p_storage_path text,
  p_actor_subject_id text,
  p_actor_roles text[],
  p_actor_site_codes text[],
  p_authorization_context_id text,
  p_actor_role text,
  p_actor_name text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_actor_subject_id), '') = ''
     or coalesce(array_length(p_actor_roles, 1), 0) = 0
     or coalesce(btrim(p_authorization_context_id), '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_actor_role, '') not in ('DESIGNER', 'ADMIN') then
    raise exception 'invalid server actor context' using errcode = 'check_violation';
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  if v.spec_state <> 'RELEASED' then
    return jsonb_build_object('ok', false, 'error',
      'cannot record packet: spec must be RELEASED', 'specState', v.spec_state);
  end if;

  update public.factory_jobs set
    packet_sha256 = p_packet_sha256,
    manifest_sha256 = p_manifest_sha256,
    packet_storage_path = p_storage_path,
    actor_role = p_actor_role,
    actor_name = p_actor_name,
    actor_subject_id = p_actor_subject_id,
    actor_roles = p_actor_roles,
    actor_site_codes = coalesce(p_actor_site_codes, '{}'::text[]),
    authorization_context_id = p_authorization_context_id,
    updated_at = timezone('utc', now())
  where job_id = v.job_id;

  insert into public.factory_job_events (
    job_id, event, actor_role, actor_name, actor_subject_id,
    actor_roles, actor_site_codes, authorization_context_id, detail
  ) values (
    v.job_id, 'packet_recorded', p_actor_role, p_actor_name, p_actor_subject_id,
    p_actor_roles, coalesce(p_actor_site_codes, '{}'::text[]), p_authorization_context_id,
    jsonb_build_object('packet_sha256', p_packet_sha256, 'storage_path', p_storage_path)
  );

  return jsonb_build_object('ok', true, 'jobId', v.job_id,
    'packetSha256', p_packet_sha256, 'storagePath', p_storage_path);
end; $$;

create or replace function public.rpc_factory_job_packet_info(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id);
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  return jsonb_build_object('ok', true, 'jobId', v.job_id,
    'specState', v.spec_state, 'revisionId', v.revision_id,
    'packetSha256', v.packet_sha256, 'manifestSha256', v.manifest_sha256,
    'storagePath', v.packet_storage_path,
    'canExport', v.spec_state = 'RELEASED' and v.packet_storage_path is not null);
end; $$;

create function public.rpc_factory_job_verify_result(
  p_job_id text,
  p_verdict text,
  p_computed_sha256 text,
  p_actor_subject_id text,
  p_actor_roles text[],
  p_actor_site_codes text[],
  p_authorization_context_id text,
  p_actor_role text,
  p_actor_name text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_actor_subject_id), '') = ''
     or coalesce(array_length(p_actor_roles, 1), 0) = 0
     or coalesce(btrim(p_authorization_context_id), '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_actor_role, '') not in ('FACTORY', 'ADMIN') then
    raise exception 'invalid server actor context' using errcode = 'check_violation';
  end if;
  if coalesce(p_verdict, '') not in ('PASS', 'FAIL') then
    return jsonb_build_object('ok', false, 'error', 'invalid verdict');
  end if;
  select * into v from public.factory_jobs where job_id = btrim(p_job_id) for update;
  if v.job_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown job');
  end if;
  if v.spec_state <> 'RELEASED' then
    return jsonb_build_object('ok', false, 'error',
      'cannot verify packet: spec must be RELEASED', 'specState', v.spec_state);
  end if;

  insert into public.factory_job_events (
    job_id, event, actor_role, actor_name, actor_subject_id,
    actor_roles, actor_site_codes, authorization_context_id, detail
  ) values (
    v.job_id, 'verify', p_actor_role, p_actor_name, p_actor_subject_id,
    p_actor_roles, coalesce(p_actor_site_codes, '{}'::text[]), p_authorization_context_id,
    jsonb_build_object('verdict', p_verdict, 'computed_sha256', p_computed_sha256)
  );
  return jsonb_build_object('ok', true, 'verdict', p_verdict);
end; $$;

-- Include server-owned identity in activity evidence.
create or replace function public.rpc_factory_job_activity(p_job_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event', e.event,
    'actorRole', e.actor_role,
    'actorName', e.actor_name,
    'actorSubjectId', e.actor_subject_id,
    'actorRoles', to_jsonb(e.actor_roles),
    'actorSiteCodes', to_jsonb(e.actor_site_codes),
    'authorizationContextId', e.authorization_context_id,
    'detail', e.detail,
    'at', e.at
  ) order by e.at desc), '[]'::jsonb) into v
  from public.factory_job_events e where e.job_id = btrim(p_job_id);
  return jsonb_build_object('ok', true, 'jobId', btrim(p_job_id), 'activity', v);
end; $$;

revoke all on function public.rpc_factory_job_transition(
  text, text, text, text[], text[], text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_record_packet(
  text, text, text, text, text, text[], text[], text, text, text
) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_verify_result(
  text, text, text, text, text[], text[], text, text, text
) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_proof(text) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_packet_info(text) from public, anon, authenticated;
revoke all on function public.rpc_factory_job_activity(text) from public, anon, authenticated;

grant execute on function public.rpc_factory_job_transition(
  text, text, text, text[], text[], text, text, text, text, text
) to service_role;
grant execute on function public.rpc_factory_job_record_packet(
  text, text, text, text, text, text[], text[], text, text, text
) to service_role;
grant execute on function public.rpc_factory_job_verify_result(
  text, text, text, text, text[], text[], text, text, text
) to service_role;
grant execute on function public.rpc_factory_job_proof(text) to service_role;
grant execute on function public.rpc_factory_job_packet_info(text) to service_role;
grant execute on function public.rpc_factory_job_activity(text) to service_role;

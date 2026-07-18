-- 0163: storage-hash verdict semantics (Full-System Scrutiny 2026-07-18, B1-02)
--
-- The factory-api "verify" action proves ONLY that the stored ZIP bytes still
-- match the recorded digest. Its verdict vocabulary previously reused the
-- words PASS/FAIL, which downstream UI read as manufacturing verification —
-- authority far wider than the evidence. The verdict is renamed to
-- STORAGE_HASH_MATCH / STORAGE_HASH_MISMATCH; the old values are rejected so
-- no caller can keep laundering a storage check into a full-verifier PASS.
--
-- Historical factory_job_events rows keep their original payloads (append-only
-- record discipline — history is not rewritten). The S17-5 full verifier will
-- own the PKT_* vocabulary via its production wiring (separate task).

create or replace function public.rpc_factory_job_verify_result(
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
  -- B1-02: storage-integrity vocabulary only; PASS/FAIL are rejected here so a
  -- whole-ZIP hash check can never be recorded under full-verification words.
  if coalesce(p_verdict, '') not in ('STORAGE_HASH_MATCH', 'STORAGE_HASH_MISMATCH') then
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
    v.job_id, 'verify', p_actor_role, p_actor_subject_id, p_actor_subject_id,
    p_actor_roles, coalesce(p_actor_site_codes, '{}'::text[]), p_authorization_context_id,
    jsonb_build_object('verdict', p_verdict, 'computed_sha256', p_computed_sha256,
      'scope', 'STORAGE_INTEGRITY_ONLY')
  );
  return jsonb_build_object('ok', true, 'verdict', p_verdict);
end; $$;

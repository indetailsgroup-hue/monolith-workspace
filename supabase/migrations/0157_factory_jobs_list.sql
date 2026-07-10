-- 0157: factory jobs list + activity (ADR-061 มติ 2 — FactoryApp dashboard backend)
-- FactoryApp (P1.1) เรียก GET /factory/jobs + /:id/activity ที่ไม่เคยมีตัวตน
-- ให้ข้อมูลเท่าที่ server รู้จริง (state/revision/เวลา/events) — ไม่แต่งตัวเลขที่ไม่มี

create or replace function public.rpc_factory_jobs_list()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.fn_is_service_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'jobId', j.job_id,
    'specState', j.spec_state,
    'revisionId', j.revision_id,
    'createdAt', j.created_at,
    'updatedAt', j.updated_at,
    'frozenAt', j.frozen_at,
    'releasedAt', j.released_at,
    'eventCount', (select count(*) from public.factory_job_events e where e.job_id = j.job_id)
  ) order by j.updated_at desc), '[]'::jsonb) into v
  from public.factory_jobs j;
  return jsonb_build_object('ok', true, 'jobs', v);
end; $$;

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
    'detail', e.detail,
    'at', e.at
  ) order by e.at desc), '[]'::jsonb) into v
  from public.factory_job_events e where e.job_id = btrim(p_job_id);
  return jsonb_build_object('ok', true, 'jobId', btrim(p_job_id), 'activity', v);
end; $$;

revoke all on function public.rpc_factory_jobs_list() from public, anon, authenticated;
revoke all on function public.rpc_factory_job_activity(text) from public, anon, authenticated;
grant execute on function public.rpc_factory_jobs_list() to service_role;
grant execute on function public.rpc_factory_job_activity(text) to service_role;

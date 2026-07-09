-- 0156: unfreeze transition (FROZEN -> DRAFT) — S15-3
--
-- ราก: ปุ่ม Unfreeze ใน Designer เปลี่ยนแค่ client (set local DRAFT) แต่ server ยัง FROZEN
-- → reload แล้ว state เด้งกลับ = client โกหกผู้ใช้ (พิสูจน์แล้วบน preview 5200)
-- แก้: เพิ่ม action 'unfreeze' ใน state machine ฝั่ง SQL — server เป็น authority เสมอ (ADR-060)
--
-- กติกา: unfreeze ได้จาก FROZEN เท่านั้น (RELEASED ต้อง revoke ก่อน)
-- revision_id คงไว้เป็นประวัติ (freeze ครั้งใหม่จะออก REV ใหม่) — event ลง log เสมอ

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
  if p_action not in ('freeze', 'release', 'revoke', 'unfreeze') then
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
  elsif p_action = 'unfreeze' then
    if v.spec_state <> 'FROZEN' then
      return jsonb_build_object('ok', false, 'error', 'cannot unfreeze: state is ' || v.spec_state);
    end if;
    update public.factory_jobs set spec_state = 'DRAFT',
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

revoke all on function public.rpc_factory_job_transition(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_factory_job_transition(text, text, text, text, text, text) to service_role;

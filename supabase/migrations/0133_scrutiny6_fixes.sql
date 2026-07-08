-- Migration: scrutiny6_fixes — ผล scrutinize รอบ 6 (0131–0132 + UI batch)
--
-- S6-1 (0132 — ร้ายแรง): VO ค้างหลายใบพร้อมกัน (เคสจริง: คนละเรื่อง) → submit_signed เลือก "ใบล่าสุด" เสมอ
--   → ลูกค้าเซ็น VO-1 แต่ระบบอนุมัติ VO-2 + VO-1 เซ็นไม่ได้อีกถาวร (เจอใบ approved → already ตลอด)
--   fix: rebase rpc_field_submit_signed_variation + p_vo_number — ระบุใบชัด; ไม่ระบุ = ต้องมี sent ใบเดียวเท่านั้น
-- ตรวจแล้วไม่เป็นบั๊ก: to_char ค่าลบ ('-5,000' ถูก) · package_detail คืน null เมื่อไม่มีสิทธิ์ (UI guard แล้ว) ·
--   CI secret ว่าง → MonolithBtn ซ่อนเอง · ContractPanel PromiseLike ผ่าน build

drop function if exists public.rpc_field_submit_signed_variation(uuid, text, text);
create or replace function public.rpc_field_submit_signed_variation(
  p_project_id uuid, p_client_key text default null, p_note text default null,
  p_vo_number int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_v record;
  v_sent_count int;
  v_artifact uuid;
  v_status text;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  if p_vo_number is not null then
    select * into v_v from public.variation_orders
    where project_id = p_project_id and vo_number = p_vo_number and status in ('sent', 'approved');
    if v_v.id is null then
      raise exception 'ไม่พบ VO เลขที่ % ที่ส่งแล้วของบ้านนี้', p_vo_number using errcode = 'no_data_found';
    end if;
  else
    select count(*) into v_sent_count from public.variation_orders
    where project_id = p_project_id and status = 'sent';
    if v_sent_count = 0 then
      raise exception 'ยังไม่มี VO ฉบับที่ส่งแล้วของบ้านนี้ — สร้าง + ส่งก่อน' using errcode = 'no_data_found';
    end if;
    if v_sent_count > 1 then
      raise exception 'มี VO ค้างเซ็น % ใบ — ระบุเลขใบ (p_vo_number) ให้ชัดว่าลูกค้าเซ็นใบไหน', v_sent_count
        using errcode = 'check_violation';
    end if;
    select * into v_v from public.variation_orders
    where project_id = p_project_id and status = 'sent';
  end if;

  if v_v.status = 'approved' and v_v.signed_artifact_id is not null then
    return jsonb_build_object('artifact_id', v_v.signed_artifact_id, 'vo_id', v_v.id,
      'vo_number', v_v.vo_number, 'already', true);
  end if;

  v_artifact := public.rpc_capture_ingest('signed_variation_order', 'app',
    'app://field/vo/' || coalesce(p_client_key, gen_random_uuid()::text),
    'vo-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'vo_id', v_v.id,
      'vo_number', v_v.vo_number, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'รูป VO เซ็นแล้ว (field app)',
      jsonb_build_object('project_id', p_project_id::text,
        'vo_number', v_v.vo_number::text, 'note', coalesce(p_note, '')));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  update public.variation_orders
  set status = 'approved', approved_at = timezone('utc', now()), signed_artifact_id = v_artifact
  where id = v_v.id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_approved', p_project_id, v_p.site_code,
    jsonb_build_object('vo_id', v_v.id, 'vo_number', v_v.vo_number,
      'price_impact', v_v.price_impact, 'time_impact_days', v_v.time_impact_days,
      'note', 'ปรับงวด = F3 ผ่าน rpc_field_set_payment_plan/บันทึกรับ เส้น 0108 เดิม'));
  return jsonb_build_object('artifact_id', v_artifact, 'vo_id', v_v.id,
    'vo_number', v_v.vo_number, 'already', false);
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_field_submit_signed_variation(uuid, text, text, int) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_submit_signed_variation(uuid, text, text, int) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_submit_signed_variation(uuid, text, text, int) to service_role';
  end if;
end $$;

-- Migration: material_normalize_review — capture-spine (ADR-029: auto-upsert + needs_review + normalize)
-- Depends on: 0069 (material_master/material_purchase_price), 0076 (normalize_name), C12
--
-- ADR-029 (grill + scrutinize 3 ก.ค. 2026):
--   • คง auto-upsert (รับของไม่สะดุด) แต่ material ที่ auto-สร้างติดธง needs_review ให้ governance merge ภายหลัง
--   • identity: จับคู่ผ่าน name_normalized (unique) — แถวเก่าคงรหัสเดิม; แถวใหม่ derive code จากชื่อ normalized
--   • merge RPC (governance): โอน price history + คำนวณ MAC ใหม่จากประวัติรวม + ปิด active แถว from (non-destructive)
-- หมายเหตุ: การเปลี่ยน matching ใน rpc_capture_promote (costing branch) ทำใน 0079 (promote replace ครั้งเดียว)

-- ---------------------------------------------------------------------------
-- columns: name_normalized (match key ใหม่) + needs_review (คิวรีวิว governance)
-- ---------------------------------------------------------------------------
alter table public.material_master
  add column if not exists name_normalized text,
  add column if not exists needs_review boolean not null default false;

update public.material_master
  set name_normalized = public.normalize_name(name)
  where name_normalized is null;

-- fail-safe: ถ้าข้อมูลเดิมมีชื่อที่ normalize แล้วชนกัน migration จะ fail ให้เห็น (ต้อง merge ก่อน ไม่เดา)
create unique index if not exists ux_material_master_name_normalized
  on public.material_master (name_normalized);

alter table public.material_master
  alter column name_normalized set not null;

comment on column public.material_master.name_normalized is
  'ADR-029: match key (normalize_name) — แถวเก่าคง material_code เดิม; แถวใหม่ derive จากชื่อ normalized';
comment on column public.material_master.needs_review is
  'ADR-029: true เมื่อ auto-สร้างจากการรับของ — คิวให้ governance ตรวจ/merge; governance upsert = false';

-- ---------------------------------------------------------------------------
-- rpc_upsert_material (governance) — เติม name_normalized + เคลียร์ needs_review
-- ---------------------------------------------------------------------------
create or replace function public.rpc_upsert_material(
  p_material_code text,
  p_name text,
  p_unit text default 'unit',
  p_active boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_governance_role() then
    raise exception 'material master: governance role required' using errcode = 'insufficient_privilege';
  end if;
  insert into public.material_master (material_code, name, name_normalized, unit, active, needs_review)
  values (p_material_code, p_name, public.normalize_name(p_name), p_unit, p_active, false)
  on conflict (material_code) do update set
    name = excluded.name, name_normalized = excluded.name_normalized,
    unit = excluded.unit, active = excluded.active, needs_review = false;
  return p_material_code;
end;
$$;
revoke all on function public.rpc_upsert_material(text, text, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- master_refs: material_receipt จับคู่ผ่าน name_normalized (normalize สองฝั่ง — idempotent)
-- ---------------------------------------------------------------------------
update public.capture_type_config
  set master_refs = jsonb_build_object('material', jsonb_build_object(
    'table', 'material_master', 'column', 'name_normalized', 'normalize', true))
  where capture_type = 'material_receipt';

-- ---------------------------------------------------------------------------
-- rpc_merge_material — เครื่องมือ governance รวม material ซ้ำ (ADR-029 ข้อ d)
--   โอน price history from→into, คำนวณ costing ใหม่จากประวัติรวม, ปิด active แถว from (ไม่ลบ)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_merge_material(
  p_from_code text,
  p_into_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved int;
  v_total_qty numeric;
  v_avg numeric;
  v_last_price numeric;
  v_last_at timestamptz;
begin
  if not public.is_governance_role() then
    raise exception 'material merge: governance role required' using errcode = 'insufficient_privilege';
  end if;
  if p_from_code = p_into_code then
    raise exception 'material merge: from = into' using errcode = 'check_violation';
  end if;
  perform 1 from public.material_master where material_code = p_from_code for update;
  if not found then
    raise exception 'material merge: from % not found', p_from_code using errcode = 'no_data_found';
  end if;
  perform 1 from public.material_master where material_code = p_into_code for update;
  if not found then
    raise exception 'material merge: into % not found', p_into_code using errcode = 'no_data_found';
  end if;

  update public.material_purchase_price
    set material_code = p_into_code
    where material_code = p_from_code;
  get diagnostics v_moved = row_count;

  -- คำนวณ costing ของ into ใหม่จากประวัติรวม (MAC ถ่วง qty = sum(total)/sum(qty))
  select coalesce(sum(qty), 0),
         case when coalesce(sum(qty), 0) > 0 then round(sum(total) / sum(qty), 4) end
    into v_total_qty, v_avg
  from public.material_purchase_price where material_code = p_into_code;

  select unit_price, received_at into v_last_price, v_last_at
  from public.material_purchase_price
  where material_code = p_into_code
  order by received_at desc limit 1;

  update public.material_master set
    total_received_qty = v_total_qty,
    moving_avg_price = v_avg,
    last_purchase_price = v_last_price,
    last_purchased_at = v_last_at,
    needs_review = false
  where material_code = p_into_code;

  -- non-destructive: ปิด active + ปลด needs_review + กัน name_normalized ชนอนาคต (ผูก suffix merged)
  update public.material_master set
    active = false,
    needs_review = false,
    name_normalized = name_normalized || ':merged:' || p_into_code
  where material_code = p_from_code;

  return jsonb_build_object(
    'merged_from', p_from_code, 'merged_into', p_into_code,
    'price_rows_moved', v_moved, 'total_received_qty', v_total_qty, 'moving_avg_price', v_avg);
end;
$$;
revoke all on function public.rpc_merge_material(text, text) from public;

-- Migration: material_costing — monolith-accounting (L3 commit-target #3 target: actual_purchase_price)
-- Depends on: 0049 (capture_type_config), 0062 (material_receipt config), 0064 (master_refs pattern), C12
--
-- ปิด seam COSTING/PROCUREMENT: material_receipt (verified) → บันทึกราคาซื้อจริง.
-- owner: material master = สร้าง (want_build), fields ยังไม่ระบุ → default ตาม pattern vendor_master.
-- decisions (documented, owner แก้ได้):
--   • field `price` = ราคาต่อหน่วย (unit price); total = price*qty (PO มี unit price+qty).
--   • costing = moving average ถ่วง qty (MAC) + last_purchase_price; price history append-only.
--   • match by name (deterministic code = 'MAT-'||md5(name)[0:8]); auto-upsert on receipt
--     (ต่างจาก vendor governance-only: วัสดุรับเข้าจริง+ราคา = ground truth, ปิด loop อัตโนมัติ).

-- ---------------------------------------------------------------------------
-- material_master — reference + costing state (match by name)
-- ---------------------------------------------------------------------------
create table if not exists public.material_master (
  material_code       text primary key,
  name                text not null unique,          -- match key (match by name)
  unit                text not null default 'unit',
  active              boolean not null default true,
  last_purchase_price numeric,                        -- ราคาต่อหน่วยล่าสุด
  moving_avg_price    numeric,                         -- ต้นทุนถัวเฉลี่ยเคลื่อนที่ (MAC)
  total_received_qty  numeric not null default 0,      -- qty สะสมที่ใช้ถ่วง MA
  last_purchased_at   timestamptz,
  created_at          timestamptz not null default timezone('utc', now())
);

alter table public.material_master enable row level security;
drop policy if exists material_master_sel on public.material_master;
create policy material_master_sel on public.material_master
  for select to authenticated using (true);  -- reference catalog; write ผ่าน RPC/adapter เท่านั้น

-- admin upsert (governance) — populate material master ล่วงหน้าได้ (เหมือน vendor)
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
  insert into public.material_master (material_code, name, unit, active)
  values (p_material_code, p_name, p_unit, p_active)
  on conflict (material_code) do update set
    name = excluded.name, unit = excluded.unit, active = excluded.active;
  return p_material_code;
end;
$$;
revoke all on function public.rpc_upsert_material(text, text, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- material_purchase_price — ประวัติราคาซื้อจริง (append-only; commit target ของ material_receipt)
-- ---------------------------------------------------------------------------
create table if not exists public.material_purchase_price (
  id                 uuid primary key default gen_random_uuid(),
  material_code      text not null references public.material_master (material_code),
  unit_price         numeric not null,               -- = ai_payload.price
  qty                numeric not null,
  total              numeric not null,               -- unit_price * qty
  po_ref             text,
  spec_match         boolean,
  source_capture_id  uuid,                            -- provenance → capture_artifact
  site_code          text,
  received_by        text not null,                   -- resolve_actor() (text)
  received_at        timestamptz not null default timezone('utc', now())
);
create index if not exists ix_material_price_material on public.material_purchase_price (material_code, received_at);

alter table public.material_purchase_price enable row level security;
drop policy if exists material_purchase_price_sel on public.material_purchase_price;
create policy material_purchase_price_sel on public.material_purchase_price
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- ---------------------------------------------------------------------------
-- master validation wiring (Req 3.1): material_receipt.material → material_master.name
--   reuse 0065 config-driven check ที่ rpc_capture_set_extraction (ไม่พบ → unverified + suspicious → human confirm)
-- ---------------------------------------------------------------------------
update public.capture_type_config
  set master_refs = jsonb_build_object('material', jsonb_build_object('table', 'material_master', 'column', 'name'))
  where capture_type = 'material_receipt';

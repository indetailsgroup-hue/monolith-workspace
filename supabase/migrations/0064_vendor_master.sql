-- Migration: vendor_master — capture-spine (L2, owner decision 2026-06-30: บัญชีก่อน, สร้าง vendor master ใหม่, match by name)
-- Depends on: 0049 (capture_artifact/capture_type_config), C12
--
-- owner answers: vendor_exists='ยังไม่มี — สร้างใหม่'; fields=vendor_code/ชื่อ/tax_id/ที่อยู่/active; vendor_key='ชื่อผู้ขาย'.
-- สร้าง vendor_master (ref data) + admin upsert RPC + คอลัมน์ unverified_fields (Req 3.2 mark) + master_refs config (Req 3.1, config-driven).

-- ---------------------------------------------------------------------------
-- vendor_master — reference data (match by name ตามที่เจ้าของเลือก)
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_master (
  vendor_code text primary key,
  name        text not null,
  tax_id      text,
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists ix_vendor_master_name on public.vendor_master (name);

alter table public.vendor_master enable row level security;
drop policy if exists vendor_master_sel on public.vendor_master;
create policy vendor_master_sel on public.vendor_master
  for select to authenticated using (true);  -- reference catalog; write ผ่าน RPC เท่านั้น

-- admin upsert (governance) — ให้เจ้าของ populate vendor master
create or replace function public.rpc_upsert_vendor(
  p_vendor_code text,
  p_name text,
  p_tax_id text default null,
  p_address text default null,
  p_active boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_governance_role() then
    raise exception 'vendor master: governance role required' using errcode = 'insufficient_privilege';
  end if;
  insert into public.vendor_master (vendor_code, name, tax_id, address, active)
  values (p_vendor_code, p_name, p_tax_id, p_address, p_active)
  on conflict (vendor_code) do update set
    name = excluded.name, tax_id = excluded.tax_id, address = excluded.address, active = excluded.active;
  return p_vendor_code;
end;
$$;
revoke all on function public.rpc_upsert_vendor(text, text, text, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- Req 3.2: unverified_fields ใน capture_artifact (mark field ที่ไม่พบใน master — ไม่ block)
-- ---------------------------------------------------------------------------
alter table public.capture_artifact
  add column if not exists unverified_fields jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Req 3.1 config-driven: master_refs map (extracted field → {table, column}) ใน capture_type_config
-- ---------------------------------------------------------------------------
alter table public.capture_type_config
  add column if not exists master_refs jsonb not null default '{}'::jsonb;

comment on column public.capture_type_config.master_refs is
  'map field→{table,column} สำหรับ master validation (Req 3.1); ตรวจ + mark unverified ใน rpc_capture_set_extraction';

-- expense_document: field 'vendor' → vendor_master.name (match by name ตามที่เจ้าของเลือก)
update public.capture_type_config
  set master_refs = jsonb_build_object('vendor', jsonb_build_object('table', 'vendor_master', 'column', 'name'))
  where capture_type = 'expense_document';

-- Migration: expense_category_map — monolith-accounting (G-4 owner decision: category→account config table)
-- Depends on: 0066 (ledger_account), 0051 (expense_document config), C12
--
-- ผัง category → expense account (5xxx) แบบ config-driven (ไม่ hardcode ใน RPC; fail-safe no-guess:
--   category ที่ไม่พบใน map → adapter raise ที่ 0068, ไม่เดา/ไม่ default เงียบ ๆ).
-- + เพิ่ม 'payment_method' เข้า field_schema ของ expense_document (credit default 2010; cash→1010).

-- ---------------------------------------------------------------------------
-- expense_category_map — config (category text → ledger_account.code)
-- ---------------------------------------------------------------------------
create table if not exists public.expense_category_map (
  category     text primary key,
  account_code text not null references public.ledger_account (code),
  active       boolean not null default true
);

-- seed หมวดพื้นฐาน (map ตรง COA 5xxx). ไม่มี catch-all อัตโนมัติ —
-- ต้องการ 5090 ต้องระบุ category ที่ map ไป 5090 อย่างชัดเจน (no-guess).
insert into public.expense_category_map (category, account_code) values
  ('ค่าเช่า', '5030'),
  ('เงินเดือน', '5020'),
  ('ค่าแรง', '5020'),
  ('ค่าสาธารณูปโภค', '5040'),
  ('ค่าน้ำค่าไฟ', '5040'),
  ('วัสดุสิ้นเปลือง', '5050'),
  ('วัสดุ', '5050'),
  ('ต้นทุนงาน', '5010'),
  ('ต้นทุนขาย', '5010'),
  ('ค่าใช้จ่ายอื่น', '5090'),
  ('อื่นๆ', '5090')
on conflict (category) do update set
  account_code = excluded.account_code, active = excluded.active;

alter table public.expense_category_map enable row level security;
drop policy if exists expense_category_map_sel on public.expense_category_map;
create policy expense_category_map_sel on public.expense_category_map
  for select to authenticated using (true);  -- config catalog; read-only

-- ---------------------------------------------------------------------------
-- เพิ่ม payment_method เข้า field_schema ของ expense_document (additive, idempotent)
--   ใช้ตัดสิน credit account: 'cash' → 1010 เงินสด; อื่น ๆ/ว่าง → 2010 เจ้าหนี้ (default)
-- ---------------------------------------------------------------------------
update public.capture_type_config
  set field_schema = field_schema || jsonb_build_object('payment_method', 'string', 'doc_date', 'string')
  where capture_type = 'expense_document'
    and not (field_schema ? 'payment_method');

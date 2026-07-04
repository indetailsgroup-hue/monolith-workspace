-- Migration: ledger_engine — monolith-accounting (Ledger_Engine seed จาก monolith_accounting.html)
-- Depends on: C12
--
-- port double-entry ledger จาก seed (COA SME + journal + double-entry invariant Σdebit=Σcredit).
-- MVP: book เดียว (internal) THB (base=amount); multi-book/multi-currency = extension ภายหลัง.
-- account (COA) + journal_entry + journal_line + rpc_post_journal_entry (บังคับ balanced). RLS governance|site.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_account_type') then
    create type public.ledger_account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
  end if;
  if not exists (select 1 from pg_type where typname = 'ledger_entry_status') then
    create type public.ledger_entry_status as enum ('draft', 'posted');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- account (ผังบัญชี COA) — seed จาก DEFAULT_COA ของ seed + expense 5xxx
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_account (
  code   text primary key,
  name   text not null,
  type   public.ledger_account_type not null,
  active boolean not null default true
);

insert into public.ledger_account (code, name, type) values
  ('1010','เงินสดและเงินฝากธนาคาร','asset'),
  ('1020','ลูกหนี้การค้า','asset'),
  ('1030','สินค้าคงเหลือ','asset'),
  ('1040','ภาษีซื้อ (VAT ซื้อ)','asset'),
  ('1500','อุปกรณ์และเครื่องใช้สำนักงาน','asset'),
  ('1600','ค่าเสื่อมราคาสะสม','asset'),
  ('2010','เจ้าหนี้การค้า','liability'),
  ('2020','ภาษีขาย (VAT ขาย)','liability'),
  ('2030','ภาษีหัก ณ ที่จ่ายค้างนำส่ง','liability'),
  ('2040','ค่าใช้จ่ายค้างจ่าย','liability'),
  ('2500','เงินกู้ยืมระยะยาว','liability'),
  ('3010','ทุนจดทะเบียน','equity'),
  ('3020','กำไร(ขาดทุน)สะสม','equity'),
  ('4010','รายได้จากการขาย','revenue'),
  ('4020','รายได้จากการบริการ','revenue'),
  ('5010','ต้นทุนขาย/ต้นทุนงาน','expense'),
  ('5020','เงินเดือนและค่าแรง','expense'),
  ('5030','ค่าเช่า','expense'),
  ('5040','ค่าสาธารณูปโภค','expense'),
  ('5050','ค่าวัสดุสิ้นเปลือง','expense'),
  ('5090','ค่าใช้จ่ายอื่น ๆ','expense')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- journal_entry + journal_line (double-entry)
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entry (
  id          uuid primary key default gen_random_uuid(),
  book_id     text not null default 'internal',
  entry_date  date not null default (timezone('utc', now()))::date,
  description text,
  status      public.ledger_entry_status not null default 'posted',
  currency    text not null default 'THB',
  site_code   text,
  source_ref  jsonb,                       -- อ้าง capture_artifact ฯลฯ
  created_by  text not null,
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists ix_journal_entry_book on public.journal_entry (book_id, entry_date);

create table if not exists public.journal_line (
  id               uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entry (id) on delete cascade,
  account_code     text not null references public.ledger_account (code),
  debit            numeric not null default 0,
  credit           numeric not null default 0,
  base_debit       numeric not null default 0,   -- สกุลหลัก (THB)
  base_credit      numeric not null default 0,
  constraint journal_line_one_side check (debit = 0 or credit = 0)  -- หนึ่งข้างเป็น 0
);
create index if not exists ix_journal_line_entry on public.journal_line (journal_entry_id);

-- RLS: accounting = governance หรือ site access
alter table public.ledger_account enable row level security;
alter table public.journal_entry  enable row level security;
alter table public.journal_line   enable row level security;

drop policy if exists ledger_account_sel on public.ledger_account;
create policy ledger_account_sel on public.ledger_account for select to authenticated using (true);

drop policy if exists journal_entry_sel on public.journal_entry;
create policy journal_entry_sel on public.journal_entry for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

drop policy if exists journal_line_sel on public.journal_line;
create policy journal_line_sel on public.journal_line for select to authenticated
  using (public.is_governance_role() or exists (
    select 1 from public.journal_entry je where je.id = journal_line.journal_entry_id
      and public.has_site_access(je.site_code)));

-- ---------------------------------------------------------------------------
-- rpc_post_journal_entry — บังคับ double-entry (Σdebit=Σcredit, ACC-1); ทุก account ต้องมีจริง
-- p_lines = jsonb array ของ {account_code, debit, credit}
-- ---------------------------------------------------------------------------
create or replace function public.rpc_post_journal_entry(
  p_book_id text,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text default 'THB',
  p_status public.ledger_entry_status default 'posted',
  p_site_code text default null,
  p_source_ref jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_sum_debit numeric := 0;
  v_sum_credit numeric := 0;
  v_line jsonb;
  v_code text;
  v_debit numeric;
  v_credit numeric;
  v_entry_id uuid;
begin
  v_actor := public.resolve_actor();
  if v_actor is null then
    raise exception 'ledger: unauthenticated' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_governance_role() then
    raise exception 'ledger: governance/finance role required to post' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'ledger: journal ต้องมีอย่างน้อย 2 บรรทัด' using errcode = 'check_violation';
  end if;

  -- validate accounts + sum
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_code := v_line->>'account_code';
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    if not exists (select 1 from public.ledger_account where code = v_code and active) then
      raise exception 'ledger: unknown/inactive account %', v_code using errcode = 'foreign_key_violation';
    end if;
    if v_debit < 0 or v_credit < 0 or (v_debit > 0 and v_credit > 0) then
      raise exception 'ledger: บรรทัดต้องมี debit หรือ credit ข้างเดียว (>=0)' using errcode = 'check_violation';
    end if;
    v_sum_debit := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
  end loop;

  -- ACC-1 double-entry invariant
  if round(v_sum_debit, 2) <> round(v_sum_credit, 2) then
    raise exception 'ledger: ไม่สมดุล (debit % <> credit %)', v_sum_debit, v_sum_credit using errcode = 'check_violation';
  end if;
  if round(v_sum_debit, 2) = 0 then
    raise exception 'ledger: ยอดรวมเป็นศูนย์' using errcode = 'check_violation';
  end if;

  insert into public.journal_entry (book_id, entry_date, description, status, currency, site_code, source_ref, created_by)
  values (coalesce(p_book_id, 'internal'), coalesce(p_entry_date, (timezone('utc',now()))::date),
          p_description, p_status, coalesce(p_currency, 'THB'), p_site_code, p_source_ref, v_actor)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    insert into public.journal_line (journal_entry_id, account_code, debit, credit, base_debit, base_credit)
    values (v_entry_id, v_line->>'account_code', v_debit, v_credit, v_debit, v_credit);  -- MVP THB: base=amount
  end loop;

  return v_entry_id;
end;
$$;

revoke all on function public.rpc_post_journal_entry(text, date, text, jsonb, text, public.ledger_entry_status, text, jsonb) from public;

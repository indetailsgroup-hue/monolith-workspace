-- Migration: receivables — monolith-accounting (ACC-12 runtime: findOverdueReceivables)
-- Depends on: C12 (resolve_actor/has_site_access/is_governance_role)
--
-- ตาราง receivable + rpc_find_overdue_receivables (mirror src/ledger/receivables.ts predicate):
--   ค้างชำระ = due_date < as_of AND paid < amount. RLS + scope (governance | site access).

create table if not exists public.receivable (
  id          uuid primary key default gen_random_uuid(),
  customer    text not null,
  invoice_ref text,
  due_date    date not null,
  amount      numeric not null check (amount >= 0),
  paid        numeric not null default 0 check (paid >= 0),
  site_code   text,
  created_at  timestamptz not null default timezone('utc', now())
);
create index if not exists ix_receivable_due on public.receivable (due_date);

alter table public.receivable enable row level security;
drop policy if exists receivable_sel on public.receivable;
create policy receivable_sel on public.receivable
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- rpc_find_overdue_receivables — ACC-12: ทั้งหมดและเฉพาะที่ due_date<as_of AND paid<amount,
--   scope ตามสิทธิ์ผู้เรียก (governance | has_site_access). SECURITY DEFINER → บังคับ scope ในเงื่อนไขเอง.
create or replace function public.rpc_find_overdue_receivables(
  p_as_of date default (timezone('utc', now()))::date
)
returns setof public.receivable
language sql
security definer
set search_path = public
as $$
  select r.*
  from public.receivable r
  where r.due_date < p_as_of
    and r.paid < r.amount
    and (public.is_governance_role() or public.has_site_access(r.site_code));
$$;

revoke all on function public.rpc_find_overdue_receivables(date) from public;

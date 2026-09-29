-- Migration: rpc_ledger_entries — Finance Dashboard real-time ledger read (v14.1 — ADR-058)
-- Depends on: 0066_ledger_engine.sql (journal_entry, journal_line, ledger_account)
--
-- Returns all posted journal entries + lines grouped by book for the Finance Dashboard.
-- Called by monolith-workspace FinanceDashboard.tsx LedgerTab (fetchLedgerViaFieldSession).
-- Requires authenticated user with governance or finance role (RLS + explicit check).
-- Respects site_code RLS policies on journal_entry/journal_line.

-- ---------------------------------------------------------------------------
-- rpc_ledger_entries — คืน entry ทั้งหมดที่ posted (grouped by book)
-- Response shape matches RpcLedgerEntry[] in FinanceDashboard.tsx:
--   { entry_id: string, book_id: string, lines: {account_code, debit, credit}[] }
-- ---------------------------------------------------------------------------
create or replace function public.rpc_ledger_entries(
  p_book_id text default null,         -- optional: filter by specific book (null = all books)
  p_from_date date default null,       -- optional: entries from this date
  p_to_date date default null,         -- optional: entries up to this date
  p_status text default 'posted'       -- default: only posted entries
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_result jsonb;
begin
  -- Auth check
  v_actor := public.resolve_actor();
  if v_actor is null then
    raise exception 'rpc_ledger_entries: unauthenticated'
      using errcode = 'insufficient_privilege';
  end if;

  -- Role check: must be governance (ADMIN) or finance role
  if not (public.is_governance_role() or public.has_app_role('finance')) then
    raise exception 'rpc_ledger_entries: requires FINANCE or ADMIN role'
      using errcode = 'insufficient_privilege';
  end if;

  -- Build result: array of { entry_id, book_id, lines[] }
  select coalesce(jsonb_agg(entry_row order by entry_row->>'book_id', entry_row->>'entry_date'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'entry_id', je.id::text,
      'book_id', je.book_id,
      'entry_date', je.entry_date::text,
      'description', je.description,
      'lines', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'account_code', jl.account_code,
            'debit', jl.base_debit,
            'credit', jl.base_credit
          )
        ), '[]'::jsonb)
        from public.journal_line jl
        where jl.journal_entry_id = je.id
      )
    ) as entry_row
    from public.journal_entry je
    where je.status::text = coalesce(p_status, 'posted')
      and (p_book_id is null or je.book_id = p_book_id)
      and (p_from_date is null or je.entry_date >= p_from_date)
      and (p_to_date is null or je.entry_date <= p_to_date)
  ) sub;

  return v_result;
end;
$$;

-- Grant execute to authenticated users (RLS + function-level role check handle authorization)
grant execute on function public.rpc_ledger_entries(text, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- rpc_ledger_summary — lightweight summary for dashboard KPI cards
-- Returns { book_id, entry_count, total_debit, total_credit }[] without full line data
-- ---------------------------------------------------------------------------
create or replace function public.rpc_ledger_summary(
  p_book_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_result jsonb;
begin
  v_actor := public.resolve_actor();
  if v_actor is null then
    raise exception 'rpc_ledger_summary: unauthenticated'
      using errcode = 'insufficient_privilege';
  end if;

  if not (public.is_governance_role() or public.has_app_role('finance')) then
    raise exception 'rpc_ledger_summary: requires FINANCE or ADMIN role'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb)
  into v_result
  from (
    select
      je.book_id,
      count(distinct je.id)::int as entry_count,
      coalesce(sum(jl.base_debit), 0)::numeric(15,2) as total_debit,
      coalesce(sum(jl.base_credit), 0)::numeric(15,2) as total_credit
    from public.journal_entry je
    join public.journal_line jl on jl.journal_entry_id = je.id
    where je.status = 'posted'
      and (p_book_id is null or je.book_id = p_book_id)
    group by je.book_id
  ) sub;

  return v_result;
end;
$$;

grant execute on function public.rpc_ledger_summary(text) to authenticated;

-- ---------------------------------------------------------------------------
-- bank_feed table (for real-time subscriptions via Supabase Realtime)
-- Stores imported bank transactions for WebSocket-based live updates
-- ---------------------------------------------------------------------------
create table if not exists public.bank_feed_txn (
  id          uuid primary key default gen_random_uuid(),
  bank_txn_id text unique not null,              -- external bank reference (idempotent key)
  date        date not null,
  amount      numeric(15,2) not null,
  description text,
  site_code   text,
  match_status text not null default 'pending',  -- 'matched' | 'pending'
  matched_entry_id uuid references public.journal_entry(id),
  imported_at timestamptz not null default timezone('utc', now()),
  imported_by text not null
);

create index if not exists ix_bank_feed_txn_date on public.bank_feed_txn (date desc);
create index if not exists ix_bank_feed_txn_status on public.bank_feed_txn (match_status);

-- RLS: finance + governance can read bank feed
alter table public.bank_feed_txn enable row level security;

drop policy if exists bank_feed_txn_sel on public.bank_feed_txn;
create policy bank_feed_txn_sel on public.bank_feed_txn for select to authenticated
  using (public.is_governance_role() or public.has_app_role('finance')
    or public.has_site_access(site_code));

drop policy if exists bank_feed_txn_ins on public.bank_feed_txn;
create policy bank_feed_txn_ins on public.bank_feed_txn for insert to authenticated
  with check (public.is_governance_role() or public.has_app_role('finance'));

-- Enable Supabase Realtime on bank_feed_txn for WebSocket subscriptions
-- (Supabase automatically exposes tables added to the realtime publication)
alter publication supabase_realtime add table public.bank_feed_txn;

-- ---------------------------------------------------------------------------
-- has_app_role helper (if not already defined) — checks JWT app_metadata.roles[]
-- ---------------------------------------------------------------------------
create or replace function public.has_app_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt()->'app_metadata'->'roles') ? p_role,
    false
  );
$$;

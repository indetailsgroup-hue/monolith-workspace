-- Migration: capture_audit — capture-spine Phase 2 (task 1.2)
-- Depends on: 0049_capture_init.sql, C12
--
-- capture_audit_log (append-only) + immutability trigger + REVOKE UPDATE/DELETE (R-SPINE-9, Property 7).
-- mirror รูปแบบ workflow_audit_log / mcp_audit_log. actor = resolve_actor() (text); scrub PII โดย RPC caller.

create table if not exists public.capture_audit_log (
  id                  uuid primary key default gen_random_uuid(),
  capture_artifact_id uuid null references public.capture_artifact (id),
  capture_type        text null,
  event_type          text not null,            -- ingest/ocr/extract/verify/emit/commit/reject/failure/feedback
  actor               text not null,            -- resolve_actor() (text)
  prev_status         text null,
  next_status         text null,
  detail              jsonb null,               -- scrubbed (no PII/secret)
  at                  timestamptz not null default timezone('utc', now())
);
create index if not exists ix_capture_audit_artifact on public.capture_audit_log (capture_artifact_id);
create index if not exists ix_capture_audit_event_type on public.capture_audit_log (event_type);

-- RLS: artifact ที่ผูก → derive site ผ่าน join; ไม่มี artifact (เช่น failure ก่อนสร้าง) → governance เท่านั้น
alter table public.capture_audit_log enable row level security;
drop policy if exists capture_audit_log_sel on public.capture_audit_log;
create policy capture_audit_log_sel on public.capture_audit_log
  for select to authenticated
  using (
    public.is_governance_role()
    or exists (
      select 1 from public.capture_artifact a
      where a.id = capture_audit_log.capture_artifact_id
        and public.has_site_access(a.site_code)
    )
  );

-- ---------------------------------------------------------------------------
-- Immutability trigger — rejects UPDATE/DELETE (R-SPINE-9)
-- ---------------------------------------------------------------------------
create or replace function public.capture_audit_log_immutable()
returns trigger
language plpgsql as $$
begin
  raise exception
    'capture_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.capture_audit_log_immutable() is
  'Enforces append-only immutability on capture_audit_log by rejecting UPDATE/DELETE (R-SPINE-9, Property 7).';

drop trigger if exists trg_capture_audit_immutable on public.capture_audit_log;
create trigger trg_capture_audit_immutable
  before update or delete on public.capture_audit_log
  for each row execute function public.capture_audit_log_immutable();

revoke update, delete on public.capture_audit_log from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete on public.capture_audit_log from %I', r);
    end if;
  end loop;
end;
$$;

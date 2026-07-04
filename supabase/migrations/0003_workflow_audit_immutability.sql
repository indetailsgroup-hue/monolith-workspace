-- Migration: workflow_audit_immutability — monolith-workflow-copilot Phase 1
-- Spec task: 2.2 (audit log + immutability trigger)
-- Depends on: 0002_workflow_tables_rls.sql, 00000000000000_c12_foundation.sql
--
-- Scope: workflow_audit_log (append-only) + RLS + immutability trigger + REVOKE.
-- Mirrors the shipped line_oa_audit_log immutability pattern (Req 9.1, 9.2):
--   trigger (fires for every role incl. SECURITY DEFINER owner) + REVOKE (privilege).
-- performed_by = text (public.resolve_actor()); secrets/PII scrubbed by the RPCs.

create table if not exists public.workflow_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,                 -- handoff/notification/approval/escalation/copilot/capture/identity/delegation/knowledge_import/...
  work_item_id uuid null,
  process_step text null,
  site_code text null,
  performed_by text not null,               -- public.resolve_actor()
  detail jsonb null,                        -- scrubbed (no secret/PII values)
  at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_workflow_audit_work_item on public.workflow_audit_log (work_item_id);
create index if not exists ix_workflow_audit_event_type on public.workflow_audit_log (event_type);

-- RLS: read scoped by C12 (governance cross-site; branch by has_site_access) (Req 9.4, 10.1, 10.2)
alter table public.workflow_audit_log enable row level security;
drop policy if exists workflow_audit_log_sel on public.workflow_audit_log;
create policy workflow_audit_log_sel on public.workflow_audit_log
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- ---------------------------------------------------------------------------
-- Immutability trigger function — rejects any UPDATE/DELETE (Req 9.2)
-- ---------------------------------------------------------------------------
create or replace function public.workflow_audit_log_immutable()
returns trigger
language plpgsql as $$
begin
  raise exception
    'workflow_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.workflow_audit_log_immutable() is
  'Enforces append-only immutability on workflow_audit_log by rejecting UPDATE/DELETE '
  'at the database level independently of grants (Req 9.2).';

drop trigger if exists trg_workflow_audit_log_immutable on public.workflow_audit_log;
create trigger trg_workflow_audit_log_immutable
  before update or delete on public.workflow_audit_log
  for each row execute function public.workflow_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Revoke UPDATE/DELETE (privilege-level protection; INSERT/SELECT untouched)
-- ---------------------------------------------------------------------------
revoke update, delete on public.workflow_audit_log from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete on public.workflow_audit_log from %I', r);
    end if;
  end loop;
end;
$$;

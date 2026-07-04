-- Migration: mcp_audit — monolith-mcp-layer Phase 2 (task 1.2)
-- Depends on: 0036_mcp_init.sql, C12
--
-- mcp_audit_log (append-only) + immutability trigger + REVOKE UPDATE/DELETE (Req 11.2).
-- mirror รูปแบบ workflow_audit_log (0003): trigger (ครอบทุก role รวม SECURITY DEFINER owner) + REVOKE (privilege).
-- principal = uuid (resolve_actor()); secret/PII scrub โดย RPC.

create table if not exists public.mcp_audit_log (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null,            -- invocation / approval / throttling / expiry / redaction / injection_detected
  tool_name        text null,
  tool_class       public.mcp_tool_class null,
  principal        text not null,            -- public.resolve_actor() (text, email-based)
  site_code        text null,
  autonomy_tier    text null,
  result           text null,
  model_provenance jsonb null,               -- scrubbed (no secret); unknown-fallback (Req 18)
  detail           jsonb null,               -- scrubbed (no secret/PII values)
  at               timestamptz not null default timezone('utc', now())
);
create index if not exists ix_mcp_audit_event_type on public.mcp_audit_log (event_type);
create index if not exists ix_mcp_audit_principal on public.mcp_audit_log (principal);

-- RLS: read scoped by C12 (governance cross-site; branch by has_site_access) (Req 11)
alter table public.mcp_audit_log enable row level security;
drop policy if exists mcp_audit_log_sel on public.mcp_audit_log;
create policy mcp_audit_log_sel on public.mcp_audit_log
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- ---------------------------------------------------------------------------
-- Immutability trigger — rejects any UPDATE/DELETE (Req 11.2)
-- ---------------------------------------------------------------------------
create or replace function public.mcp_audit_log_immutable()
returns trigger
language plpgsql as $$
begin
  raise exception
    'mcp_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.mcp_audit_log_immutable() is
  'Enforces append-only immutability on mcp_audit_log by rejecting UPDATE/DELETE '
  'at the database level independently of grants (Req 11.2).';

drop trigger if exists trg_mcp_audit_immutable on public.mcp_audit_log;
create trigger trg_mcp_audit_immutable
  before update or delete on public.mcp_audit_log
  for each row execute function public.mcp_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Revoke UPDATE/DELETE (privilege-level protection; INSERT/SELECT untouched)
-- ---------------------------------------------------------------------------
revoke update, delete on public.mcp_audit_log from public;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete on public.mcp_audit_log from %I', r);
    end if;
  end loop;
end;
$$;

-- Migration: workflow_tables_rls — monolith-workflow-copilot Phase 1
-- Spec task: 2.1 (core tables + RLS TO authenticated)
-- Depends on: 0001_workflow_init.sql (enums) + 00000000000000_c12_foundation.sql (C12)
--
-- Scope: core tables + RLS SELECT policies (TO authenticated, reuse C12 helpers).
-- NO client write policy — every mutation goes through SECURITY DEFINER RPC (Req 10.3, 10.4).
-- workflow_audit_log + its immutability live in 0003.
--
-- RLS pattern (Req 10.1, 10.2):
--   * site-scoped tables: USING (is_governance_role() OR has_site_access(site_code))
--     site_code text NULL → has_site_access(NULL)=false → Branch_Role blocked naturally
--   * global reference (process_model, knowledge_import): USING (true) for authenticated read
-- Actor-resolved columns use text (public.resolve_actor() returns text: email/uid/fallback).

-- ---------------------------------------------------------------------------
-- identity_binding (Req 1)
-- ---------------------------------------------------------------------------
create table if not exists public.identity_binding (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  line_user_id text not null,
  department text not null,
  site_code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);
-- LINE_User_Id unique per active binding (Req 1.2)
create unique index if not exists ux_identity_binding_active_line_user
  on public.identity_binding (line_user_id) where is_active;

-- ---------------------------------------------------------------------------
-- work_item (Req 2, 16, 20, 21)
-- ---------------------------------------------------------------------------
create table if not exists public.work_item (
  id uuid primary key default gen_random_uuid(),
  site_code text null,
  current_step text not null,
  current_owner uuid null,
  status public.wf_work_item_status not null default 'in_progress',
  version int not null default 0,
  data jsonb not null default '{}'::jsonb,
  primary_customer_id uuid null,
  approver_kind text not null default 'employee',
  revision_count int not null default 0,
  design_locks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- process_model (read-only mirror of Knowledge_Export) (Req 2.1, 11.3)
-- ---------------------------------------------------------------------------
create table if not exists public.process_model (
  process_step text primary key,
  sub_process_group text not null,
  canonical_order int not null,
  approval_quorum public.wf_approval_quorum null,
  requires_approval boolean not null default false
);

-- ---------------------------------------------------------------------------
-- approval_request (Req 3, 4, 8, 13, 15)
-- ---------------------------------------------------------------------------
create table if not exists public.approval_request (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_item(id),
  process_step text not null,
  site_code text null,
  resolved_approver text not null,
  approver_kind text not null default 'employee' check (approver_kind in ('employee', 'customer')),
  quorum public.wf_approval_quorum not null,
  sla_deadline timestamptz not null,
  timeout_at timestamptz not null,
  reminder_50_sent boolean not null default false,
  reminder_100_sent boolean not null default false,
  status public.wf_approval_request_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_approval_request_work_item on public.approval_request (work_item_id);

-- ---------------------------------------------------------------------------
-- approval_decision (Req 4, 15, 16, 18)
-- decider = text (public.resolve_actor() returns text — email/uid/fallback)
-- ---------------------------------------------------------------------------
create table if not exists public.approval_decision (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_request(id),
  site_code text null,
  webhook_event_id text not null unique,
  decider text not null,
  decision public.wf_decision not null,
  channel public.wf_decision_channel not null,
  decided_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- delegation (Req 14)
-- ---------------------------------------------------------------------------
create table if not exists public.delegation (
  id uuid primary key default gen_random_uuid(),
  approver_employee uuid not null,
  acting_approver uuid not null,
  process_step text not null,
  site_code text null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  is_revoked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- copilot_suggestion (Req 5, 12, 17)
-- ---------------------------------------------------------------------------
create table if not exists public.copilot_suggestion (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_item(id),
  site_code text null,
  options jsonb not null,
  pfmea_citation jsonb not null,
  autonomy_tier text not null,
  source_version text not null,
  imported_at timestamptz not null,
  review_status text not null,
  is_stale boolean not null default false,
  is_low_confidence boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ck_copilot_options_2_3 check (jsonb_array_length(options) between 2 and 3)
);

-- ---------------------------------------------------------------------------
-- notification (Req 6, 18)
-- ---------------------------------------------------------------------------
create table if not exists public.notification (
  id uuid primary key default gen_random_uuid(),
  site_code text null,
  target jsonb not null,
  channel public.wf_notification_channel not null,
  category text not null,
  is_direct_responsibility boolean not null default false,
  template_key text not null,
  slots jsonb not null default '{}'::jsonb,
  status public.wf_notification_status not null default 'queued',
  retry_count int not null default 0,
  next_attempt_at timestamptz null,
  error_detail text null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- capture_item (Req 7)
-- captured_by = text (resolve_actor)
-- ---------------------------------------------------------------------------
create table if not exists public.capture_item (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_item(id),
  process_step text not null,
  site_code text null,
  captured_by text not null,
  capture jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- knowledge_import (read-only Knowledge_Export ledger + last-good) (Req 11, 17)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_import (
  id uuid primary key default gen_random_uuid(),
  source_version text not null,
  imported_at timestamptz not null default timezone('utc', now()),
  review_status text not null default 'draft',
  payload jsonb not null,
  is_valid boolean not null default false,
  is_current boolean not null default false
);
-- only one current (last-good) import at a time
create unique index if not exists ux_knowledge_import_current
  on public.knowledge_import ((true)) where is_current;

-- ===========================================================================
-- RLS — enable + SELECT policy TO authenticated (reuse C12). No client write.
-- ===========================================================================
do $$
declare
  t text;
  site_scoped text[] := array[
    'identity_binding', 'work_item', 'approval_request', 'approval_decision',
    'delegation', 'copilot_suggestion', 'notification', 'capture_item'
  ];
  global_ref text[] := array['process_model', 'knowledge_import'];
begin
  foreach t in array site_scoped loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.is_governance_role() or public.has_site_access(site_code))',
      t || '_sel', t
    );
  end loop;

  foreach t in array global_ref loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    -- global reference: readable by any authenticated principal (no site dimension)
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_sel', t
    );
  end loop;
end;
$$;

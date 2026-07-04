-- Migration: workflow_init (enums + extensions) — monolith-workflow-copilot Phase 1
-- Spec task: 1.1 (Scaffold migrations + enums baseline)
-- Depends on: 00000000000000_c12_foundation.sql (C12 helpers) + line_oa_* substrate
--
-- Naming: 4-digit prefix sorts AFTER the 14-digit line_oa_* migrations
-- (lexicographic: "0001..." > "00000000000062...") so C12 + line_oa apply first.
--
-- Scope: enum types only (additive). Tables in 0002, audit immutability in 0003.
-- Conventions: lowercase SQL, additive CREATE only, idempotent guards.

create extension if not exists pgcrypto;

-- Work_Item lifecycle status (Req 2, 4, 15, 21)
-- includes awaiting_requote (Req 21.10) + awaiting_customer_acceptance (Req 21.17)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_work_item_status') then
    create type public.wf_work_item_status as enum (
      'in_progress',
      'awaiting_approval',
      'blocked',
      'rework',
      'awaiting_requote',
      'awaiting_customer_acceptance',
      'completed'
    );
  end if;
end;
$$;

-- Approval quorum rule (Req 11.10, 15.1)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_approval_quorum') then
    create type public.wf_approval_quorum as enum ('unanimous', 'majority', 'first_response');
  end if;
end;
$$;

-- Approval_Request status (Req 3, 4, 13, 15)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_approval_request_status') then
    create type public.wf_approval_request_status as enum ('pending', 'approved', 'rejected', 'escalated');
  end if;
end;
$$;

-- Approval_Decision outcome (Req 4, 15)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_decision') then
    create type public.wf_decision as enum ('approved', 'rejected');
  end if;
end;
$$;

-- Decision channel — LINE or web fallback (Req 18.4)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_decision_channel') then
    create type public.wf_decision_channel as enum ('line', 'web');
  end if;
end;
$$;

-- Notification channel (Req 6.1, 6.2)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_notification_channel') then
    create type public.wf_notification_channel as enum ('direct_push', 'group_message');
  end if;
end;
$$;

-- Notification dispatch status (Req 6, 18)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wf_notification_status') then
    create type public.wf_notification_status as enum ('queued', 'pending', 'sent', 'failed');
  end if;
end;
$$;

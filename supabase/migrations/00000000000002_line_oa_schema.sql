-- Migration: line_oa_schema (enums + the eight line_oa_* tables)
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 2.1 Define enums and create the eight line_oa_* tables
-- Depends on:
--   00000000000000_line_oa_init.sql
--
-- Scope: enum + table DDL ONLY. Uniqueness / partial-unique / CHECK constraints
-- (task 2.2), RLS policies (task 3.1), the audit immutability trigger (task 3.2),
-- and SECURITY DEFINER RPCs (tasks 6-17) are added by later migrations.
--
-- Conventions (matching the shipped platform migrations):
--   * lowercase SQL keywords
--   * uuid surrogate keys default gen_random_uuid()
--   * UTC timestamps default timezone('utc', now())
--   * audit/actor identifiers are text (public.resolve_actor() returns text)
--   * channel secrets live in Supabase Vault; only Vault references are stored here

-- gen_random_uuid() lives in pgcrypto
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Conversation lifecycle state (Req 3, topology Site_Unresolved)
create type public.line_oa_conversation_status as enum (
  'site_unresolved',
  'open',
  'closed'
);

-- Outbound message kind: reply (uses a reply token) vs push (proactive) (Req 4)
create type public.line_oa_send_type as enum (
  'reply',
  'push'
);

-- Outbound delivery status for the staged pending -> sent/failed model (Req 4)
create type public.line_oa_outbound_status as enum (
  'pending',
  'sent',
  'failed'
);

-- ---------------------------------------------------------------------------
-- line_oa_channels
-- One row per LINE channel. Stores ONLY Supabase Vault references for the
-- channel secret and access token -- never plaintext (Req 1.1, 1.5; Decision 1).
-- ---------------------------------------------------------------------------
create table public.line_oa_channels (
  channel_identifier text primary key,
  vertical_context text not null,
  channel_secret_ref text not null,        -- Vault reference (name/uuid), never plaintext
  channel_access_token_ref text not null,  -- Vault reference (name/uuid), never plaintext
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- line_oa_conversations
-- Stateful thread keyed by (line_user_id, vertical_context). site_code is
-- nullable while Site_Unresolved (Req 3, 12.1, 12.7).
-- ---------------------------------------------------------------------------
create table public.line_oa_conversations (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  vertical_context text not null,
  site_code text,                                              -- null while site_unresolved
  status public.line_oa_conversation_status not null default 'site_unresolved',
  last_activity_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- line_oa_inbound_messages
-- Received messages. webhook_event_id is the idempotency anchor; its UNIQUE
-- constraint is added in task 2.2 (Req 2, 3.1).
-- ---------------------------------------------------------------------------
create table public.line_oa_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.line_oa_conversations(id),
  webhook_event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- line_oa_outbound_messages
-- Sent messages recorded with delivery status, template binding, and slot
-- values (Req 4, 5.6). sent_by is the resolved actor (text).
-- ---------------------------------------------------------------------------
create table public.line_oa_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.line_oa_conversations(id),
  send_type public.line_oa_send_type not null,
  status public.line_oa_outbound_status not null default 'pending',
  template_key text not null,
  slot_values jsonb not null,
  error_detail text,
  sent_by text,
  sent_at timestamptz
);

-- ---------------------------------------------------------------------------
-- line_oa_customer_identity
-- Binding of a LINE userId (within a vertical) to a canonical customer_id.
-- The (line_user_id, vertical_context) UNIQUE and the match_confidence CHECK
-- are added in task 2.2 (Req 6, 7).
-- ---------------------------------------------------------------------------
create table public.line_oa_customer_identity (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  vertical_context text not null,
  customer_id uuid not null,
  match_confidence numeric(3,2),
  manual_review_required boolean not null default false
);

-- ---------------------------------------------------------------------------
-- line_oa_message_templates
-- Pre-approved outbound shapes with named slots. vertical_context NULL = shared
-- across verticals; non-NULL = vertical-scoped (Req 5). The composite
-- PRIMARY KEY (template_key, vertical_context) is added in task 2.2.
-- ---------------------------------------------------------------------------
create table public.line_oa_message_templates (
  template_key text not null,
  vertical_context text,                  -- null = shared across verticals
  body text not null,                     -- named slots, e.g. {{order_id}}
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- line_oa_orders (Line_Order)
-- Orders captured through LINE OA. origin_channel_id is stamped 'line_oa'; its
-- CHECK and the webhook_event_id UNIQUE are added in task 2.2 (Req 8).
-- ---------------------------------------------------------------------------
create table public.line_oa_orders (
  id uuid primary key default gen_random_uuid(),
  vertical_context text not null,
  site_code text,                              -- required (active) before Order_Lifecycle submission
  customer_id uuid,
  origin_channel_id text not null default 'line_oa',
  webhook_event_id text,                       -- idempotency for postback orders
  canonical_payload jsonb not null,            -- normalized Order_Lifecycle shape
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- line_oa_audit_log
-- Append-only audit trail. performed_by is the resolved actor (text). The
-- immutability trigger and REVOKE UPDATE, DELETE are added in task 3.2 (Req 13).
-- ---------------------------------------------------------------------------
create table public.line_oa_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  vertical_context text not null,
  site_code text,                              -- null where not yet known
  entity_ref text not null,
  performed_by text not null,                  -- from public.resolve_actor()
  performed_at timestamptz not null default timezone('utc', now())
);

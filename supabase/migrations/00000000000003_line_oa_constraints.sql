-- Migration: line_oa_constraints (uniqueness, partial-unique, and CHECK constraints)
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 2.2 Add uniqueness, partial-unique, and CHECK constraints
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql   (enums + the eight line_oa_* tables)
--
-- Scope: constraints / indexes ONLY. RLS policies (task 3.1), the audit
-- immutability trigger (task 3.2), and SECURITY DEFINER RPCs (tasks 6-17) are
-- added by later migrations. This file does NOT rewrite task 2.1's migration.
--
-- Conventions (matching the shipped platform migrations):
--   * lowercase SQL keywords
--   * named constraints/indexes prefixed with their table name
--   * additive ALTER/CREATE only (no table re-definition)

-- ---------------------------------------------------------------------------
-- line_oa_conversations
-- Partial unique index: at most one non-closed conversation per
-- (line_user_id, vertical_context). Closed conversations are excluded so a new
-- inbound after auto-close opens a fresh conversation rather than colliding
-- (Req 3.1, 3.2, 3.8).
-- ---------------------------------------------------------------------------
create unique index line_oa_conversations_live_uniq
  on public.line_oa_conversations (line_user_id, vertical_context)
  where status <> 'closed';

-- ---------------------------------------------------------------------------
-- line_oa_inbound_messages
-- webhook_event_id is the idempotency anchor; enforce uniqueness at the
-- persistence layer so redelivery cannot create duplicate inbound rows
-- (Req 2.5, 8.7).
-- ---------------------------------------------------------------------------
alter table public.line_oa_inbound_messages
  add constraint line_oa_inbound_messages_webhook_event_id_uniq
  unique (webhook_event_id);

-- ---------------------------------------------------------------------------
-- line_oa_customer_identity
-- Exactly one CustomerIdentity binding per (line_user_id, vertical_context)
-- (Req 6.4). match_confidence, when present, must lie in the closed interval
-- [0.0, 1.0] (Req 7.1).
-- ---------------------------------------------------------------------------
alter table public.line_oa_customer_identity
  add constraint line_oa_customer_identity_user_vertical_uniq
  unique (line_user_id, vertical_context);

alter table public.line_oa_customer_identity
  add constraint line_oa_customer_identity_match_confidence_range_chk
  check (match_confidence between 0.0 and 1.0);

-- ---------------------------------------------------------------------------
-- line_oa_message_templates
-- Composite key on (template_key, vertical_context) per design.md, where
-- vertical_context NULL = a template shared across all verticals (Req 5.2).
--
-- NULL-scope handling: a literal PRIMARY KEY would force vertical_context to be
-- NOT NULL, which would make shared (NULL-scope) templates unstorable and
-- contradict Req 5.2 / the design's "vertical_context text NULL -- NULL = shared".
-- To preserve BOTH the single-row-per-(key, scope) guarantee a primary key
-- provides AND the ability to store one shared template per key, we use a
-- UNIQUE constraint with NULLS NOT DISTINCT (PostgreSQL 15+). This treats NULL
-- scopes as equal, so two (template_key, NULL) rows collide just as a primary
-- key would, while still allowing the NULL (shared) scope to exist.
-- ---------------------------------------------------------------------------
alter table public.line_oa_message_templates
  add constraint line_oa_message_templates_key_vertical_uniq
  unique nulls not distinct (template_key, vertical_context);

-- ---------------------------------------------------------------------------
-- line_oa_orders (Line_Order)
-- webhook_event_id (when present) is unique so a redelivered order-bearing
-- webhook cannot create a duplicate Line_Order (Req 8.7). origin_channel_id is
-- pinned to 'line_oa' for every row captured through this module
-- (Req 8.1, 8.2, 8.8). NULL webhook_event_id (manual orders) is allowed and not
-- constrained by the UNIQUE (NULLs are distinct by default).
-- ---------------------------------------------------------------------------
alter table public.line_oa_orders
  add constraint line_oa_orders_webhook_event_id_uniq
  unique (webhook_event_id);

alter table public.line_oa_orders
  add constraint line_oa_orders_origin_channel_id_chk
  check (origin_channel_id = 'line_oa');

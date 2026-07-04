-- Migration: line_oa_create_order
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 13.1 Implement rpc_create_line_order (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql              (public.line_oa_orders,
--                                                    public.line_oa_conversations,
--                                                    public.line_oa_audit_log, pgcrypto)
--   00000000000002_line_oa_constraints.sql         (orders webhook_event_id UNIQUE,
--                                                    origin_channel_id = 'line_oa' CHECK)
--   00000000000003_line_oa_rls.sql                 (SELECT-only RLS; no client write path)
--   00000000000004_line_oa_audit_immutability.sql  (append-only audit log)
--   00000000000020_line_oa_identity_resolution.sql (public.line_oa_resolve_customer_identity)
--   00000000000030_line_oa_resolve_conversation_site.sql (public.line_oa_resolution_source)
--   (shipped A1) public.get_active_site_codes()    -- canonical active Site_Code source
--   (shipped C12) public.is_governance_role(), public.has_site_access(text),
--                 public.resolve_actor()
--
-- Scope: the ORDER INTAKE RPC ONLY, plus the pure normalization helper it calls.
--   * public.line_oa_normalize_order(text, jsonb)   -- ports the task 5.1 adapter
--   * public.rpc_create_line_order(uuid, jsonb, text, text)
--
-- This migration does NOT implement the property tests (tasks 13.2 / 13.3), the
-- forecasting sync (task 15), or the Edge Functions (task 19).
--
-- ===========================================================================
-- ORDER INTAKE FROM LINE OA (Req 8.1-8.8, 12.5, 12.6)
-- ===========================================================================
-- An order can reach the platform two ways, both funneling through this single
-- SECURITY DEFINER RPC (the only write path):
--   * source = 'postback' -- a Postback_Data_Contract selection (carries a
--     webhook_event_id for idempotency on LINE redelivery), and
--   * source = 'manual'   -- a Manual_Order_Entry by an operator (no
--     webhook_event_id; always a fresh order).
--
-- Behavior:
--   1. Re-checks the caller's role INSIDE the function (Req 12.5, 12.6). Order
--      creation is permitted to a Governance_Role (any active site) OR to a
--      principal holding access to the conversation's site via
--      public.has_site_access(conversation.site_code). A site_unresolved
--      conversation has a NULL site_code, so has_site_access(NULL)=false naturally
--      blocks Branch_Roles there (Req 12.7); only a Governance_Role may create an
--      order on a still-unresolved conversation. A caller with neither is rejected
--      permission-denied with NO state change (Req 12.6).
--   2. Resolves the audit actor via public.resolve_actor() rather than trusting any
--      client-supplied identifier (Req 12.5).
--   3. Idempotency on webhook_event_id (Req 8.7): if an order already exists for the
--      supplied webhook_event_id, the existing order is returned with NO new row and
--      NO duplicate audit. The orders UNIQUE(webhook_event_id) constraint is the
--      persistence-layer guarantee; a per-call SAVEPOINT additionally makes a
--      concurrent redelivery roll back cleanly. Manual orders pass a NULL
--      webhook_event_id and are never deduplicated (NULLs are distinct).
--   4. Normalization (Req 8.3, 8.4): the raw order is mapped to the canonical
--      Order_Lifecycle shape by public.line_oa_normalize_order(vertical_context, ...),
--      a faithful port of the task 5.1 order adapter. Invalid or empty canonical
--      output raises an error and persists nothing -- it is never submitted.
--   5. Stamping (Req 8.1, 8.2, 8.8): every persisted Line_Order carries
--      origin_channel_id='line_oa' (also pinned by the table CHECK), the
--      conversation's vertical_context, the resolved customer_id, and the
--      conversation's site_code (NULL while still site_unresolved).
--   6. Order_Lifecycle site gating (Req 8.5, 8.6): an order is submitted to the
--      Order_Lifecycle ONLY with a resolved active site_code. If the conversation
--      carries a site_code, it is re-validated against public.get_active_site_codes()
--      and an unknown/inactive code is rejected ("unknown or inactive", no state
--      change). If the conversation is still site_unresolved (NULL site_code) the
--      order is persisted but NOT submitted (submitted=false) -- resolution is
--      required first (Req 8.5).
--   7. Audit (Req 13.1): exactly one audit entry per created order recording the
--      vertical, site (where known), source, submission state, and entity ref.
--
-- Secret hygiene (Req 13.3): this flow touches NO Channel_Secret or
-- Channel_Access_Token, so there is nothing to decrypt and nothing to scrub. Every
-- error message and the audit entity_ref are composed from non-secret identifiers
-- only (conversation_id, order_id, site_code, customer_id, source, webhook_event_id).
--
-- Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 12.5, 12.6

-- This migration references the shipped A1/C12 helpers and the line_oa identity
-- helper, which may not exist at migration-build time in a bare environment (they
-- are platform / earlier-migration prerequisites). Disable body validation so the
-- migration applies cleanly; bodies are validated at first call (matching the
-- earlier line_oa RPC migrations).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Resolution/order source enum: which contract carried the order. Created
-- idempotently (it is also created by 00000000000030) so this migration applies
-- cleanly regardless of sibling ordering (Req 8.1 postback / 8.2 manual).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'line_oa_resolution_source'
      and n.nspname = 'public'
  ) then
    create type public.line_oa_resolution_source as enum ('postback', 'manual');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- public.line_oa_normalize_order(
--     p_vertical_context text,
--     p_raw_order        jsonb,
--     OUT ok        boolean,   -- true => canonical is a valid, non-empty order
--     OUT canonical jsonb,     -- the canonical Order_Lifecycle shape (when ok)
--     OUT error     text       -- the rejection reason (when not ok)
-- )
--
-- Pure-logic Order_Intake_Normalization (Req 8.3, 8.4). A faithful PL/pgSQL port of
-- the task 5.1 adapter registry (supabase/functions/_shared/order-adapter.ts):
--
--   * vertical 'monolith' (furniture): raw `line_items[]`, each with a non-empty
--     `sku`, optional `name` (defaults to sku), a positive-integer `quantity`, and
--     optional non-negative `dimensions` {width_mm, height_mm, depth_mm}.
--   * vertical 'food' (TCCK): raw `menu_items[]`, each with a non-empty `item_id`
--     (-> sku), optional `name` (defaults to item_id), a positive-integer
--     `quantity`, and an optional well-formed `modifiers[]` ({id, name}).
--
-- The canonical shape is vertical-agnostic:
--   { vertical_context, items:[{sku,name,quantity,attributes}], item_count }
-- Vertical-specific extras are preserved under each item's `attributes`. An
-- unregistered vertical, a malformed raw order, or an order that yields zero valid
-- items is rejected (ok=false) and never produces submittable output (Req 8.4).
--
-- IMMUTABLE: depends only on its arguments; no I/O, no DB reads.
-- ---------------------------------------------------------------------------
create or replace function public.line_oa_normalize_order(
  p_vertical_context text,
  p_raw_order jsonb,
  out ok boolean,
  out canonical jsonb,
  out error text
)
returns record
language plpgsql
immutable
as $$
declare
  v_items   jsonb := '[]'::jsonb;
  v_elem    jsonb;
  v_idx     int := 0;
  v_sku     text;
  v_name    text;
  v_qty_el  jsonb;
  v_qty     numeric;
  v_attrs   jsonb;
  v_arr     jsonb;
  -- furniture dimensions
  v_dims_raw jsonb;
  v_dims     jsonb;
  v_dim_el   jsonb;
  v_dim_num  numeric;
  v_key      text;
  -- food modifiers
  v_mods_raw jsonb;
  v_mods     jsonb;
  v_mod      jsonb;
  v_mid      text;
  v_mname    text;
begin
  ok := false;
  canonical := null;
  error := null;

  if p_vertical_context is null then
    error := 'no order adapter registered for vertical (null)';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Furniture (MONOLITH) adapter -- line items / dimensions
  -- -------------------------------------------------------------------------
  if p_vertical_context = 'monolith' then
    if p_raw_order is null or jsonb_typeof(p_raw_order) <> 'object' then
      error := 'furniture order must be an object';
      return;
    end if;

    v_arr := p_raw_order -> 'line_items';
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then
      error := 'furniture order requires a ''line_items'' array';
      return;
    end if;
    if jsonb_array_length(v_arr) = 0 then
      error := 'furniture order has no line_items';
      return;
    end if;

    for v_elem in select jsonb_array_elements(v_arr) loop
      if jsonb_typeof(v_elem) <> 'object' then
        error := format('furniture line_items[%s] must be an object', v_idx);
        return;
      end if;

      v_sku := nullif(btrim(coalesce(v_elem ->> 'sku', '')), '');
      if v_sku is null then
        error := format('furniture line_items[%s] requires a non-empty ''sku''', v_idx);
        return;
      end if;

      v_name := nullif(btrim(coalesce(v_elem ->> 'name', '')), '');
      if v_name is null then
        v_name := v_sku;
      end if;

      v_qty_el := v_elem -> 'quantity';
      if v_qty_el is null or jsonb_typeof(v_qty_el) <> 'number' then
        error := format('furniture line_items[%s] requires a positive integer ''quantity''', v_idx);
        return;
      end if;
      v_qty := (v_elem ->> 'quantity')::numeric;
      if v_qty <= 0 or v_qty <> trunc(v_qty) then
        error := format('furniture line_items[%s] requires a positive integer ''quantity''', v_idx);
        return;
      end if;

      -- Dimensions are optional, but if present must be a well-formed object with
      -- non-negative numeric values; only present keys are carried (mirrors the
      -- adapter's readDimension semantics).
      v_attrs := '{}'::jsonb;
      v_dims_raw := v_elem -> 'dimensions';
      if v_dims_raw is not null and jsonb_typeof(v_dims_raw) <> 'null' then
        if jsonb_typeof(v_dims_raw) <> 'object' then
          error := format('furniture line_items[%s].dimensions must be an object', v_idx);
          return;
        end if;
        v_dims := '{}'::jsonb;
        foreach v_key in array array['width_mm', 'height_mm', 'depth_mm'] loop
          v_dim_el := v_dims_raw -> v_key;
          if v_dim_el is null or jsonb_typeof(v_dim_el) = 'null' then
            continue;  -- absent dimension: skip
          elsif jsonb_typeof(v_dim_el) <> 'number' then
            error := format('furniture line_items[%s].dimensions.%s must be a non-negative number', v_idx, v_key);
            return;
          else
            v_dim_num := (v_dims_raw ->> v_key)::numeric;
            if v_dim_num < 0 then
              error := format('furniture line_items[%s].dimensions.%s must be a non-negative number', v_idx, v_key);
              return;
            end if;
            v_dims := v_dims || jsonb_build_object(v_key, v_dim_num);
          end if;
        end loop;
        v_attrs := jsonb_build_object('dimensions', v_dims);
      end if;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'sku', v_sku,
        'name', v_name,
        'quantity', v_qty::int,
        'attributes', v_attrs
      ));
      v_idx := v_idx + 1;
    end loop;

  -- -------------------------------------------------------------------------
  -- Food (TCCK) adapter -- menu items / modifiers
  -- -------------------------------------------------------------------------
  elsif p_vertical_context = 'food' then
    if p_raw_order is null or jsonb_typeof(p_raw_order) <> 'object' then
      error := 'food order must be an object';
      return;
    end if;

    v_arr := p_raw_order -> 'menu_items';
    if v_arr is null or jsonb_typeof(v_arr) <> 'array' then
      error := 'food order requires a ''menu_items'' array';
      return;
    end if;
    if jsonb_array_length(v_arr) = 0 then
      error := 'food order has no menu_items';
      return;
    end if;

    for v_elem in select jsonb_array_elements(v_arr) loop
      if jsonb_typeof(v_elem) <> 'object' then
        error := format('food menu_items[%s] must be an object', v_idx);
        return;
      end if;

      v_sku := nullif(btrim(coalesce(v_elem ->> 'item_id', '')), '');
      if v_sku is null then
        error := format('food menu_items[%s] requires a non-empty ''item_id''', v_idx);
        return;
      end if;

      v_name := nullif(btrim(coalesce(v_elem ->> 'name', '')), '');
      if v_name is null then
        v_name := v_sku;
      end if;

      v_qty_el := v_elem -> 'quantity';
      if v_qty_el is null or jsonb_typeof(v_qty_el) <> 'number' then
        error := format('food menu_items[%s] requires a positive integer ''quantity''', v_idx);
        return;
      end if;
      v_qty := (v_elem ->> 'quantity')::numeric;
      if v_qty <= 0 or v_qty <> trunc(v_qty) then
        error := format('food menu_items[%s] requires a positive integer ''quantity''', v_idx);
        return;
      end if;

      -- Modifiers are optional, but if present must be a well-formed array; each
      -- modifier needs a non-empty id and an optional name (defaults to id).
      v_attrs := '{}'::jsonb;
      v_mods_raw := v_elem -> 'modifiers';
      if v_mods_raw is not null and jsonb_typeof(v_mods_raw) <> 'null' then
        if jsonb_typeof(v_mods_raw) <> 'array' then
          error := format('food menu_items[%s].modifiers must be an array', v_idx);
          return;
        end if;
        v_mods := '[]'::jsonb;
        for v_mod in select jsonb_array_elements(v_mods_raw) loop
          if jsonb_typeof(v_mod) <> 'object' then
            error := format('food menu_items[%s].modifiers must be objects', v_idx);
            return;
          end if;
          v_mid := nullif(btrim(coalesce(v_mod ->> 'id', '')), '');
          if v_mid is null then
            error := format('food menu_items[%s].modifiers require a non-empty ''id''', v_idx);
            return;
          end if;
          v_mname := nullif(btrim(coalesce(v_mod ->> 'name', '')), '');
          if v_mname is null then
            v_mname := v_mid;
          end if;
          v_mods := v_mods || jsonb_build_array(jsonb_build_object('id', v_mid, 'name', v_mname));
        end loop;
        v_attrs := jsonb_build_object('modifiers', v_mods);
      end if;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'sku', v_sku,
        'name', v_name,
        'quantity', v_qty::int,
        'attributes', v_attrs
      ));
      v_idx := v_idx + 1;
    end loop;

  else
    -- No adapter registered for this vertical (mirrors normalizeOrder's reject).
    error := format('no order adapter registered for vertical ''%s''', p_vertical_context);
    return;
  end if;

  -- Core invariant of Req 8.4: empty canonical output is a rejection, never a
  -- submittable order. (Defensive: a non-empty input list with all-valid items
  -- always yields >= 1 item here.)
  if jsonb_array_length(v_items) = 0 then
    error := 'normalization produced an empty order (no valid items)';
    return;
  end if;

  canonical := jsonb_build_object(
    'vertical_context', p_vertical_context,
    'items', v_items,
    'item_count', jsonb_array_length(v_items)
  );
  ok := true;
  return;
end;
$$;

comment on function public.line_oa_normalize_order(text, jsonb)
  is 'Pure Order_Intake_Normalization: ports the task 5.1 order adapter (furniture line_items/dimensions, food menu_items/modifiers) into the canonical Order_Lifecycle shape, returning ok=false with a reason for invalid/empty output so it is never submitted (Req 8.3, 8.4).';

-- Internal helper: invoked only by the SECURITY DEFINER RPC below (running as the
-- owning role). Not a client-facing entry point.
revoke all on function public.line_oa_normalize_order(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- public.rpc_create_line_order(
--     p_conversation_id  uuid,
--     p_raw_order        jsonb,
--     p_source           text default 'manual',   -- 'postback' | 'manual'
--     p_webhook_event_id text default null,        -- idempotency anchor (postback)
--     OUT order_id          uuid,
--     OUT vertical_context  text,
--     OUT site_code         text,
--     OUT customer_id       uuid,
--     OUT origin_channel_id text,
--     OUT submitted         boolean,   -- true => has a resolved active site -> Order_Lifecycle
--     OUT created           boolean    -- false => idempotent: an existing order was returned
-- )
--
-- The single Line_Order write path. Normalizes, stamps, gates on a resolved active
-- site, persists, and audits. Supports postback and manual sources.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_line_order(
  p_conversation_id uuid,
  p_raw_order jsonb,
  p_source text default 'manual',
  p_webhook_event_id text default null,
  out order_id uuid,
  out vertical_context text,
  out site_code text,
  out customer_id uuid,
  out origin_channel_id text,
  out submitted boolean,
  out created boolean
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source           public.line_oa_resolution_source;
  v_actor            text;
  v_vertical_context text;
  v_conv_site_code   text;
  v_conv_status      public.line_oa_conversation_status;
  v_line_user_id     text;
  v_webhook_event_id text;
  v_is_active_code   boolean;
  v_norm_ok          boolean;
  v_canonical        jsonb;
  v_norm_error       text;
  v_customer_id      uuid;
  v_order_id         uuid;
begin
  created := false;
  submitted := false;

  -- -------------------------------------------------------------------------
  -- Input validation. An order is meaningless without a conversation and a raw
  -- order payload. Messages use non-secret identifiers only.
  -- -------------------------------------------------------------------------
  if p_conversation_id is null then
    raise exception 'line_oa: conversation_id is required to create an order'
      using errcode = '22004';   -- null_value_not_allowed
  end if;
  if p_raw_order is null then
    raise exception 'line_oa: raw_order is required to create an order'
      using errcode = '22004';
  end if;

  -- Normalize/validate the source. Only the postback and manual contracts are
  -- supported (Req 8.1, 8.2); anything else is rejected.
  begin
    v_source := coalesce(p_source, 'manual')::public.line_oa_resolution_source;
  exception
    when invalid_text_representation then
      raise exception 'line_oa: unsupported order source (expected postback or manual)'
        using errcode = '22023';   -- invalid_parameter_value
  end;

  -- A blank webhook_event_id is treated as absent (manual-style, never deduped).
  v_webhook_event_id := nullif(btrim(coalesce(p_webhook_event_id, '')), '');

  -- -------------------------------------------------------------------------
  -- Load + lock the target conversation. FOR UPDATE serializes concurrent order
  -- creation / site resolution against this conversation.
  -- -------------------------------------------------------------------------
  select c.vertical_context, c.site_code, c.status, c.line_user_id
    into v_vertical_context, v_conv_site_code, v_conv_status, v_line_user_id
  from public.line_oa_conversations c
  where c.id = p_conversation_id
  for update;

  if v_vertical_context is null then
    raise exception 'line_oa: conversation not found for order creation'
      using errcode = 'P0002';   -- no_data_found; carries no secret/PII
  end if;

  -- A closed conversation is terminal; orders are not captured against it.
  if v_conv_status = 'closed' then
    raise exception 'line_oa: cannot create an order on a closed conversation'
      using errcode = '22023';   -- invalid_parameter_value; state unchanged
  end if;

  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5, 12.6, 12.7). Permitted to a
  -- Governance_Role (any active site) OR to a principal holding access to the
  -- conversation's site. A site_unresolved conversation has a NULL site_code, so
  -- has_site_access(NULL)=false blocks Branch_Roles there; only Governance may
  -- create an order on a still-unresolved conversation. A caller with neither is
  -- rejected permission-denied with NO state change.
  -- -------------------------------------------------------------------------
  if not (public.is_governance_role() or public.has_site_access(v_conv_site_code)) then
    raise exception 'line_oa: permission denied to create an order for this conversation'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- Idempotency on webhook_event_id (Req 8.7). If an order already exists for the
  -- supplied id, return it unchanged with NO new row and NO duplicate audit.
  -- -------------------------------------------------------------------------
  if v_webhook_event_id is not null then
    select o.id, o.vertical_context, o.site_code, o.customer_id, o.origin_channel_id
      into v_order_id, vertical_context, site_code, v_customer_id, origin_channel_id
    from public.line_oa_orders o
    where o.webhook_event_id = v_webhook_event_id;

    if v_order_id is not null then
      order_id    := v_order_id;
      customer_id := v_customer_id;
      submitted   := site_code is not null;   -- a stored active site means it was submitted
      created     := false;
      return;
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Order_Intake_Normalization (Req 8.3, 8.4). Map the raw order via the
  -- conversation's vertical adapter; reject invalid/empty canonical output before
  -- any persistence so it is never submitted to the Order_Lifecycle.
  -- -------------------------------------------------------------------------
  select n.ok, n.canonical, n.error
    into v_norm_ok, v_canonical, v_norm_error
  from public.line_oa_normalize_order(v_vertical_context, p_raw_order) n;

  if not v_norm_ok then
    raise exception 'line_oa: order normalization failed: %', v_norm_error
      using errcode = '22023';   -- invalid_parameter_value; nothing persisted
  end if;

  -- -------------------------------------------------------------------------
  -- Order_Lifecycle site gating (Req 8.5, 8.6). If the conversation carries a
  -- site_code, re-validate it against the ONLY source of valid Site_Codes (A1);
  -- an unknown/inactive code is rejected with state unchanged (Req 8.6). A still
  -- site_unresolved conversation (NULL site_code) yields a persisted-but-not-
  -- submitted order: resolution is required before Order_Lifecycle submission
  -- (Req 8.5).
  -- -------------------------------------------------------------------------
  if v_conv_site_code is not null then
    select exists (
      select 1
      from public.get_active_site_codes() g
      where g.site_code = v_conv_site_code
    )
    into v_is_active_code;

    if not v_is_active_code then
      raise exception 'line_oa: site_code is unknown or inactive'
        using errcode = '22023';   -- invalid_parameter_value; no state change
    end if;

    submitted := true;   -- resolved + active -> submittable to the Order_Lifecycle
  else
    submitted := false;  -- created, pending site resolution (Req 8.5)
  end if;

  -- -------------------------------------------------------------------------
  -- Resolve the canonical Customer_Id for this conversation's (user, vertical)
  -- so the Line_Order is fully stamped (Req 8.8). Reuses the task 7.1 helper,
  -- which is idempotent on (line_user_id, vertical_context).
  -- -------------------------------------------------------------------------
  select ci.customer_id
    into v_customer_id
  from public.line_oa_resolve_customer_identity(v_line_user_id, v_vertical_context) ci;

  -- -------------------------------------------------------------------------
  -- Persist the Line_Order, stamped completely (Req 8.1, 8.2, 8.8). A per-call
  -- SAVEPOINT catches a concurrent redelivery that loses the race on the orders
  -- UNIQUE(webhook_event_id): we roll back this attempt and return the committed
  -- existing order (idempotent, Req 8.7). origin_channel_id is pinned to 'line_oa'
  -- by the table default + CHECK.
  -- -------------------------------------------------------------------------
  begin
    insert into public.line_oa_orders (
      vertical_context, site_code, customer_id, origin_channel_id,
      webhook_event_id, canonical_payload
    )
    values (
      v_vertical_context, v_conv_site_code, v_customer_id, 'line_oa',
      v_webhook_event_id, v_canonical
    )
    returning id, line_oa_orders.vertical_context, line_oa_orders.site_code,
              line_oa_orders.origin_channel_id
      into v_order_id, vertical_context, site_code, origin_channel_id;
  exception
    when unique_violation then
      -- A concurrent creator committed the same webhook_event_id first. Return
      -- the existing order (single-delivery state preserved, no duplicate).
      select o.id, o.vertical_context, o.site_code, o.customer_id, o.origin_channel_id
        into v_order_id, vertical_context, site_code, v_customer_id, origin_channel_id
      from public.line_oa_orders o
      where o.webhook_event_id = v_webhook_event_id;

      order_id    := v_order_id;
      customer_id := v_customer_id;
      submitted   := site_code is not null;
      created     := false;
      return;
  end;

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the created order (Req 13.1). entity_ref
  -- is composed from non-secret identifiers only; no Channel_Secret /
  -- Channel_Access_Token is ever in scope here (Req 13.3). site_code is the
  -- order's (NULL while still site_unresolved).
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'line_order_created',
    v_vertical_context,
    v_conv_site_code,
    format(
      'line_oa_order:%s|conversation_id:%s|source:%s|submitted:%s|customer_id:%s|webhook_event_id:%s',
      v_order_id, p_conversation_id, v_source, submitted, v_customer_id,
      coalesce(v_webhook_event_id, '(none)')
    ),
    v_actor
  );

  -- OUT params describing the created order.
  order_id         := v_order_id;
  customer_id      := v_customer_id;
  created          := true;
  return;
end;
$$;

comment on function public.rpc_create_line_order(uuid, jsonb, text, text)
  is 'Creates a LINE Line_Order (postback or manual): re-checks role + has_site_access, resolves the actor, normalizes the raw order via the vertical adapter (rejecting invalid/empty output), stamps origin_channel_id=''line_oa'' + vertical_context + customer_id, gates Order_Lifecycle submission on a resolved active site_code, is idempotent on webhook_event_id, and writes one audit entry (Req 8.1-8.8, 12.5, 12.6, 13.1).';

-- ---------------------------------------------------------------------------
-- Grants. This is a caller-facing RPC (the only write path), so EXECUTE is
-- revoked from PUBLIC and granted to `authenticated`; the in-function role
-- re-check enforces authorization (Req 12.5, 12.6). The grant is applied only
-- where the role exists so the migration also applies cleanly in a plain
-- PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_create_line_order(uuid, jsonb, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_create_line_order(uuid, jsonb, text, text) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

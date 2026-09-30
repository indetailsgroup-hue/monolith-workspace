-- Migration: 0198_line_oa_revoke_client_write_grants
-- P0-10 / B10: remove direct table write privileges on the eight line_oa_*
-- tables from anon, authenticated and service_role.
--
-- Why: platform default privileges grant INSERT/UPDATE/DELETE/TRUNCATE on every
-- public table to these roles, so a client or service key could write the LINE
-- tables directly, bypassing the SECURITY DEFINER RPCs (TRUNCATE is not governed
-- by RLS at all). Evidence: catalog capture da252d18a
-- (docs/governance/evidence/line-p010-catalog-2026-09-30/): the DEFINER writers
-- are owned by the table owner, so their rights come from ownership, not from
-- membership in service_role.
--
-- Scope (owner-approved 30 September 2026):
--   * REVOKE INSERT, UPDATE, DELETE, TRUNCATE only; no CASCADE.
--   * SELECT, EXECUTE, REFERENCES, TRIGGER, MAINTAIN, ownership, role membership
--     and default privileges are unchanged.
--   * Roles are revoked only where present (0005 pattern), so the migration also
--     applies on plain PostgreSQL.
--   * Fail closed: if any of the three roles still holds an effective table or
--     column write privilege afterwards (for example a grant made by another
--     grantor, or one reached through role membership), the migration raises and
--     rolls back instead of reporting success.
-- Not covered here: EXECUTE on SECURITY DEFINER writers (separate finding),
-- default privileges for future tables, and any production verification.

do $$
declare
  r text;
  t text;
  v_left text[] := '{}';
  v_tables constant text[] := array[
    'line_oa_channels', 'line_oa_conversations', 'line_oa_inbound_messages',
    'line_oa_outbound_messages', 'line_oa_customer_identity',
    'line_oa_message_templates', 'line_oa_orders', 'line_oa_audit_log'
  ];
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array v_tables loop
        execute format('revoke insert, update, delete, truncate on public.%I from %I', t, r);
      end loop;
    end if;
  end loop;

  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array v_tables loop
        if has_table_privilege(r, format('public.%I', t), 'INSERT')
           or has_table_privilege(r, format('public.%I', t), 'UPDATE')
           or has_table_privilege(r, format('public.%I', t), 'DELETE')
           or has_table_privilege(r, format('public.%I', t), 'TRUNCATE')
           or has_any_column_privilege(r, format('public.%I', t), 'INSERT')
           or has_any_column_privilege(r, format('public.%I', t), 'UPDATE') then
          v_left := v_left || format('%s:%s', r, t);
        end if;
      end loop;
    end if;
  end loop;

  if cardinality(v_left) > 0 then
    raise exception 'P0-10: write privileges remain after revoke: %', array_to_string(v_left, ', ')
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

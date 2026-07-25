-- pgTAP DB-level invariants — Repair Intelligence Phase 0 (Task 6)
-- Feature: legacy storage / evidence containment (migration 0190).
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/repair_phase0_containment.sql
--
-- Proves the broad installation-media storage policies are removed and that no
-- client-facing role can invoke the legacy field-photo or capture-ingest
-- authorities directly. Phase 0 creates NO replacement evidence policy; Phase
-- 1A must introduce upload intent, quarantine, scan, exact-object access,
-- durable revocation, and audit in its own approved plan. Rolls back.

\set ON_ERROR_STOP on

begin;
create extension if not exists pgtap;
select plan(5);

select is(
  (select count(*) from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and policyname in ('field_media_insert','field_media_select')),
  0::bigint,
  'broad installation-media policies are removed'
);

select isnt(
  has_function_privilege('authenticated',
    'public.rpc_field_submit_photo(uuid,text,text)', 'EXECUTE'),
  true,
  'authenticated cannot invoke legacy field photo submission'
);

select isnt(
  has_function_privilege('service_role',
    'public.rpc_field_submit_photo(uuid,text,text)', 'EXECUTE'),
  true,
  'service role cannot substitute for a human evidence action'
);

select isnt(
  has_function_privilege('authenticated',
    'public.rpc_capture_ingest(text,text,text,text,text)', 'EXECUTE'),
  true,
  'legacy capture ingest is not a direct authenticated authority'
);

select isnt(
  has_function_privilege('service_role',
    'public.rpc_capture_ingest(text,text,text,text,text)', 'EXECUTE'),
  true,
  'service role cannot substitute for legacy capture ingest either'
);

select * from finish();
rollback;

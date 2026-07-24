-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (Task 11)
-- Feature: P2 quarantine + legacy-route containment (design 2026-07-22 §9 Artifact
--   Class Matrix, §15 legacy migration & route disposition, §7.5 tenant isolation).
--   Migration: 0184_trust_kernel_legacy_containment.sql. Builds on 0155/0161/0182.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_containment.sql
--
-- Asserts that after 0184:
--   * the raw storage-locator COLUMNS are unreadable by human roles, while the
--     status/hash/reference columns remain readable (the client projection)  (§9)
--   * the isolated workload role exists and is the ONLY reader of the private
--     factory-packets bytes, under the tenant-pathed object layout            (§9/§7.5)
--   * the legacy packet + state-transition RPCs are not executable by a human
--     (no legacy production-shaped authority; no dual write)                  (§15)
--   * rpc_trust_release_status is a user-scoped read projection that can NEVER
--     reference the object locator, and anon cannot execute it                (§9/§15)
-- Read-only catalog assertions (0184 already applied); wrapped in a txn that
-- ROLLS BACK. No private key material anywhere.

\set ON_ERROR_STOP on

begin;

create extension if not exists pgtap;

select plan(16);

-- ---------------------------------------------------------------------------
-- (C) Isolated workload role
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from pg_roles where rolname = 'monolith_p2_workload'),
  'isolated workload role monolith_p2_workload exists'
);
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'monolith_p2_workload'),
  'the workload role is NOLOGIN (assumed out of band, never a human login)'
);

-- ---------------------------------------------------------------------------
-- (B) Raw storage-locator columns are unreadable by human roles; the projection
--     columns (status/hash) remain readable.
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.release_artifact', 'object_locator', 'select'),
  'authenticated cannot SELECT release_artifact.object_locator (raw locator contained)'
);
select ok(
  not has_column_privilege('anon', 'public.release_artifact', 'object_locator', 'select'),
  'anon cannot SELECT release_artifact.object_locator'
);
select ok(
  has_column_privilege('authenticated', 'public.release_artifact', 'status', 'select'),
  'authenticated CAN still SELECT release_artifact.status (projection reference retained)'
);
select ok(
  has_column_privilege('authenticated', 'public.release_artifact', 'content_hash', 'select'),
  'authenticated CAN still SELECT release_artifact.content_hash (hash reference retained)'
);
select ok(
  not has_column_privilege('authenticated', 'public.factory_jobs', 'packet_storage_path', 'select'),
  'authenticated cannot SELECT factory_jobs.packet_storage_path (legacy raw locator contained)'
);

-- ---------------------------------------------------------------------------
-- (D) The private bytes are readable ONLY by the isolated workload role.
-- ---------------------------------------------------------------------------
select is(
  (select roles from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'factory_packets_workload_read'),
  array['monolith_p2_workload']::name[],
  'factory-packets read policy targets ONLY the isolated workload role'
);
select ok(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'factory_packets_workload_read') like '%factory-packets%',
  'the workload read policy is scoped to the factory-packets bucket (tenant-pathed)'
);

-- ---------------------------------------------------------------------------
-- (A) Legacy packet + state-transition RPCs are not executable by humans.
-- ---------------------------------------------------------------------------
-- The legacy RPCs may be absent on a stack that never applied 0161/0155; an absent
-- function is trivially not executable, so the containment holds either way.
select ok(
  to_regprocedure('public.rpc_factory_job_record_packet(text,text,text,text,text,text)') is null
    or not has_function_privilege('authenticated', 'public.rpc_factory_job_record_packet(text,text,text,text,text,text)', 'execute'),
  'authenticated cannot execute legacy rpc_factory_job_record_packet (no client P2 publish)'
);
select ok(
  to_regprocedure('public.rpc_factory_job_packet_info(text)') is null
    or not has_function_privilege('authenticated', 'public.rpc_factory_job_packet_info(text)', 'execute'),
  'authenticated cannot execute legacy rpc_factory_job_packet_info (no raw locator readout)'
);
select ok(
  to_regprocedure('public.rpc_factory_job_transition(text,text,text,text,text,text)') is null
    or not has_function_privilege('authenticated', 'public.rpc_factory_job_transition(text,text,text,text,text,text)', 'execute'),
  'authenticated cannot execute legacy rpc_factory_job_transition (no dual mutable authority)'
);

-- ---------------------------------------------------------------------------
-- (E) rpc_trust_release_status: user-scoped read projection, locator-free.
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.rpc_trust_release_status(uuid)', 'execute'),
  'authenticated CAN execute rpc_trust_release_status (the client projection)'
);
select ok(
  not has_function_privilege('anon', 'public.rpc_trust_release_status(uuid)', 'execute'),
  'anon cannot execute rpc_trust_release_status'
);
select ok(
  position('object_locator' in pg_get_functiondef('public.rpc_trust_release_status(uuid)'::regprocedure)) = 0,
  'rpc_trust_release_status NEVER references object_locator — the projection cannot leak a raw locator'
);
select ok(
  (select public.rpc_trust_release_status('00000000-0000-0000-0000-000000000000'::uuid)) is null,
  'rpc_trust_release_status executes and returns no row for an unknown release (no error path)'
);

select * from finish();

rollback;

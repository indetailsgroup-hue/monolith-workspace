-- 0184: MONOLITH Production Trust Kernel — legacy migration & P2 containment (Task 11)
--
-- Design 2026-07-22 §9 (Artifact Class Matrix), §15 (canonicalization-first legacy
-- migration + route disposition ledger), §7.5 (tenant isolation). Builds on 0155
-- (legacy factory state), 0161 (legacy packet store), 0182 (release authority +
-- release_artifact), 0183 (bundles).
--
-- Invariant enforced at the DB: a human/client can NEVER reach P2 plaintext, a raw
-- storage locator, or a reusable signed URL, and no legacy route retains
-- production-shaped authority. The sole mutable release authority stays 0182's
-- release_revision (no dual write). Concretely:
--
--   (A) Revoke authenticated/anon EXECUTE on the legacy packet + state-transition
--       RPCs (defensive + explicit; these are not the release authority).
--   (B) Revoke authenticated/anon SELECT on the raw-locator COLUMNS
--       (release_artifact.object_locator, factory_jobs.packet_storage_path). Status
--       and hash/reference columns stay readable — that is the client projection.
--   (C) Create the isolated workload role `monolith_p2_workload` (NOLOGIN).
--   (D) Tenant-bound storage read policy: the private factory-packets bytes are
--       readable ONLY by the isolated workload role, and only under the tenant-pathed
--       object layout (tenantId/siteId/releaseRevisionId/contentHash). Never
--       authenticated/anon (guarded by storage schema presence).
--   (E) rpc_trust_release_status — a user-scoped READ-ONLY projection over the
--       existing release_revision authority: status + references only, NEVER a
--       locator/URL. Closes the carried-forward status-read RPC delta (Task 5 / PGB-5).
--
-- Apply on the shared stack via:  psql -1 -f supabase/migrations/0184_trust_kernel_legacy_containment.sql
-- (`-1` wraps the whole file in one transaction; this file adds no begin/commit.)
-- Phase: NOT_FOR_PRODUCTION.

-- ---------------------------------------------------------------------------
-- (A) Revoke authenticated/anon execute on the legacy packet + transition RPCs.
--     These are compatibility surfaces, not the release authority; the client
--     goes through the V3 edge, and the edge denies the legacy mutations outright.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.rpc_factory_job_record_packet(text,text,text,text,text,text)',
    'public.rpc_factory_job_packet_info(text)',
    'public.rpc_factory_job_verify_result(text,text,text,text,text)',
    'public.rpc_factory_job_transition(text,text,text,text,text,text)'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from authenticated, anon', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (B) Hide the raw-locator columns from human roles. Hiding ONE column requires
--     removing the table-level SELECT grant (which covers every column) and
--     re-granting SELECT on the safe columns only — a column-level REVOKE alone
--     cannot mask a column already covered by a table grant. object_locator is then
--     unreadable while status/class/hash/reference columns remain the projection.
-- ---------------------------------------------------------------------------
revoke select on public.release_artifact from authenticated, anon;
grant select (
  id, tenant_id, site_id, release_attempt_id, release_revision_id,
  artifact_class, status, content_hash, expected_packet_hash, created_at, updated_at
) on public.release_artifact to authenticated;

-- factory_jobs.packet_storage_path (legacy locator): the legacy `using (true)`
-- authenticated read (§7.5 violation) exposes the raw storage path. Revoke the
-- direct table read from human roles — factory state reaches the client only through
-- the service-role RPC projections (state/proof), never a direct table dump. Guarded
-- so a stack that never granted factory_jobs to authenticated is a clean no-op.
do $$
begin
  if to_regclass('public.factory_jobs') is not null
     and has_column_privilege('authenticated', 'public.factory_jobs', 'packet_storage_path', 'select') then
    execute 'revoke select on public.factory_jobs from authenticated, anon';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (C) Isolated workload identity: the ONLY principal that may read sealed P2 bytes.
--     NOLOGIN; the isolated runner assumes it out of band. It is never a tenant
--     member and never a human authority.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'monolith_p2_workload') then
    create role monolith_p2_workload nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (D) Tenant-bound storage read policy for the private factory-packets bucket:
--     readable only by the isolated workload role, only for the tenant-pathed
--     object layout. Authenticated/anon have no read policy (default deny under
--     storage RLS), so a human never reads the bytes; a signed URL is never issued.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    if exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'factory_packets_workload_read'
    ) then
      drop policy factory_packets_workload_read on storage.objects;
    end if;
    execute $p$
      create policy factory_packets_workload_read on storage.objects
        for select to monolith_p2_workload
        using (
          bucket_id = 'factory-packets'
          and name ~ '^[0-9a-fA-F-]{8,}/[0-9a-fA-F-]{8,}/[0-9a-fA-F-]{8,}/[0-9a-f]{64}'
        )
    $p$;
    grant select on storage.objects to monolith_p2_workload;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (E) User-scoped release-status projection over the EXISTING release_revision
--     authority (0182). security invoker → RLS (membership-scoped) applies, so a
--     caller sees only its own tenant's releases. It returns status + references
--     only and NEVER selects the object locator — the client projection cannot leak.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_trust_release_status(p_release_revision_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'releaseStatus', rr.status,
    'releaseRevisionId', rr.id,
    'candidateHash', rr.candidate_hash,
    'contentHash', rr.content_hash,
    'expectedPacketHash', rr.expected_packet_hash,
    'releaseSequence', rr.release_sequence,
    'releasedAt', rr.released_at,
    'revokedAt', rr.revoked_at,
    'artifactStatus', (
      select a.status
      from public.release_artifact a
      where a.tenant_id = rr.tenant_id and a.release_revision_id = rr.id
      order by a.updated_at desc
      limit 1
    ),
    'artifactClass', (
      select a.artifact_class
      from public.release_artifact a
      where a.tenant_id = rr.tenant_id and a.release_revision_id = rr.id
      order by a.updated_at desc
      limit 1
    )
  )
  from public.release_revision rr
  where rr.id = p_release_revision_id;
$$;

revoke all on function public.rpc_trust_release_status(uuid) from public, anon;
grant execute on function public.rpc_trust_release_status(uuid) to authenticated;

comment on function public.rpc_trust_release_status(uuid) is
  'Trust Kernel §15/§9: user-scoped READ-ONLY projection of the release_revision authority (0182). '
  'security invoker so membership RLS applies. Returns release/artifact STATUS and hash/references only; '
  'never an object locator, URL, or plaintext. The client projection cannot leak a raw storage locator.';

-- 0190_repair_phase0_legacy_containment.sql
-- Repair Intelligence Phase 0 (Task 6): fail-closed legacy containment.
--
-- Removes the broad authenticated installation-media storage policies and
-- revokes every client-facing execution path on the legacy field-photo and
-- capture-ingest authorities. Phase 0 deliberately creates NO replacement
-- evidence policy: Phase 1A must introduce upload intent, object quarantine,
-- malware scan, exact-object access, durable revocation, and audit in its own
-- approved plan. Reversal of this migration must never re-enable an unsafe
-- raw URI, broad bucket read, unsigned artifact route, or client actor
-- authority (see the Phase 0 migration/rollback pack).

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists field_media_insert on storage.objects';
    execute 'drop policy if exists field_media_select on storage.objects';
  end if;
end $$;

revoke all on function public.rpc_field_submit_photo(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_capture_ingest(text, text, text, text, text)
  from public, anon, authenticated, service_role;

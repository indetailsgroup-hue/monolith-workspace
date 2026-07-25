-- 0191_repair_phase0_revoke_legacy_mutation_authority.sql
-- Repair Intelligence Phase 0 (two-vendor review fix #5): remove the parallel
-- mutable factory authority.
--
-- Migration 0162 granted EXECUTE on the legacy factory MUTATION RPCs
-- (rpc_factory_job_transition, rpc_factory_job_record_packet) to service_role,
-- and 0184 revoked them only from authenticated/anon. That left a second
-- mutable authority: a service-role caller could move a job through
-- freeze/release or write a packet with client-supplied actor fields, bypassing
-- the single V3 verified-action-context path (rpc_trust_freeze / begin_release /
-- revoke). Phase 0 exit condition 1 requires exactly one canonical action
-- authority, so these two mutation RPCs are revoked from service_role as well.
--
-- The read-only integrity RPC rpc_factory_job_verify_result is DELIBERATELY
-- left executable by service_role: the edge /verify route (a retained, verdict-
-- only integrity check that returns no bytes, no locator, and no URL) invokes it
-- via the service-role client. Revoking it would break that read path without
-- closing any authority.
--
-- Reconciliation note (review #22): the trust-kernel donor line carries
-- different content at some 019x numbers. This branch deliberately transplanted
-- only the 24-commit kernel; any future donor reconciliation must renumber, not
-- silently merge, colliding migration numbers.

do $$
declare fn oid;
begin
  -- Revoke EXECUTE from service_role on EVERY overload of the two legacy
  -- mutation authorities (drift-proof: matched by name, not a fixed signature).
  for fn in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('rpc_factory_job_transition', 'rpc_factory_job_record_packet')
  loop
    execute format('revoke all on function %s from service_role', fn::regprocedure);
  end loop;
end $$;

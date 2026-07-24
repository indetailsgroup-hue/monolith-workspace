-- ===========================================================================
-- 0187_trust_kernel_commit_deny_check.sql
-- MONOLITH Production Trust Kernel — enforce the deny-only content-revocation
--   registry at commit_release (plan Task 4).
--
-- Design 2026-07-22 §10.4 (revocation semantics — "byte-identical dangerous
--   content can never be re-released") + plan
--   2026-07-24-trust-kernel-safety-content-revocation-registry.en.md Task 4.
--
-- WHAT THIS DOES (deny-only; ADDS one rejection path, grants nothing):
--   CREATE OR REPLACE of the worker-only rpc_trust_commit_release (originally
--   0182:508-607), byte-for-byte identical to the committed body EXCEPT for a
--   single inserted guard. The guard calls fn_content_is_blocked(0186) with the
--   attempt row's authoritative, non-null tenant_id/site_id and the p_content_hash
--   being committed; if the latest content-revocation event for that
--   (tenant, site, content_hash) is a BLOCK, it raises SAFETY_CONTENT_REVOKED.
--
-- WHERE / WHY THIS PLACEMENT:
--   * AFTER the p_content_hash sha256 format guard (a malformed hash is still a
--     PACKET_HASH_MISMATCH, unchanged) and AFTER `select * into v_att` — so
--     v_att.tenant_id / v_att.site_id exist and are NON-NULL (both are NOT NULL
--     columns on release_attempt). fn_content_is_blocked RAISES on a null key
--     (0186 FIX-C), so passing the loaded attempt-row context is required.
--   * BEFORE the `insert into public.release_revision` (and before the approval,
--     event, outbox, and artifact side effects). A denied commit therefore
--     creates NO ACTIVE release_revision and no side-effect rows — a BLOCKED
--     content_hash can never become an ACTIVE release. This is the complete
--     content-keyed checkpoint: the registry is keyed on content_hash and
--     content_hash first enters the release lifecycle here (§10.4).
--   * The commit RPC is worker-only and consumes no verified_action_context, so
--     tenant_id/site_id come from the attempt row (v_att), not a v_ctx.
--
-- fn_content_is_blocked is SECURITY DEFINER, EXECUTE granted to service_role only;
-- rpc_trust_commit_release is SECURITY DEFINER owned by postgres, so the inner
-- call runs in the definer (postgres) context and is permitted. Deny-only: this
-- migration never writes release_revision or any positive-authority row.
--
-- Additive over the committed 0180-0186 chain (does not edit them). CREATE OR
-- REPLACE preserves the owner (postgres) and the ACL; grants are re-asserted
-- defensively below to match 0182 (worker/service_role only).
-- Phase: NOT_FOR_PRODUCTION (shadow-e0). No production markers/claims.
-- Apply: psql -1 -f supabase/migrations/0187_trust_kernel_commit_deny_check.sql
-- ===========================================================================

create or replace function public.rpc_trust_commit_release(
  p_attempt_id uuid,
  p_content_hash text,
  p_expected_packet_hash text,
  p_certificate jsonb,
  p_signer_key_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.release_attempt%rowtype;
  v_cand public.release_candidate%rowtype;
  v_membership public.monolith_membership%rowtype;
  v_now timestamptz := clock_timestamp();
  v_locator text;
begin
  if not public.fn_is_sha256_hex(p_content_hash) or not public.fn_is_sha256_hex(p_expected_packet_hash) then
    raise exception 'PACKET_HASH_MISMATCH' using detail = 'content and packet hashes must be sha256 hex';
  end if;

  -- Lock the attempt.
  select * into v_att from public.release_attempt where id = p_attempt_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release attempt';
  end if;
  if v_att.status <> 'PENDING' then
    raise exception 'STATE_CONFLICT' using detail = 'attempt is not PENDING';
  end if;
  if exists (select 1 from public.release_revision where id = v_att.allocated_revision_id) then
    raise exception 'STATE_CONFLICT' using detail = 'attempt already has a release revision';
  end if;

  -- ---------------------------------------------------------------------------
  -- SAFETY content-revocation gate (design 2026-07-22 §10.4; plan Task 4).
  -- A BLOCKED content_hash must NEVER become an ACTIVE release. Placed as early
  -- as the attempt row is known (so v_att.tenant_id / v_att.site_id are the
  -- authoritative, NON-NULL attempt-row context fn_content_is_blocked requires)
  -- and BEFORE any release_revision INSERT / side effect — a denial creates no
  -- ACTIVE revision, approval, event, outbox, or artifact transition. Deny-only:
  -- this guard ONLY adds a rejection path; it grants nothing and writes nothing.
  -- The reason literal resolves to reasonCodes.ts SAFETY_CONTENT_REVOKED (§13),
  -- mapped to HTTP 409 in the edge (factory-api/trustKernel.ts).
  -- ---------------------------------------------------------------------------
  if public.fn_content_is_blocked(v_att.tenant_id, v_att.site_id, p_content_hash) then
    raise exception 'SAFETY_CONTENT_REVOKED'
      using detail = 'this content_hash is under an active SAFETY content-revocation block; it cannot be committed to an ACTIVE release';
  end if;

  -- Membership must still be ACTIVE at the version pinned at begin (§10.3).
  select * into v_membership from public.monolith_membership
    where tenant_id = v_att.tenant_id and user_id = v_att.actor_user_id;
  if not found or v_membership.status <> 'ACTIVE' then
    raise exception 'AUTH_MEMBERSHIP_REVOKED' using detail = 'approver membership is no longer active';
  end if;
  if v_membership.version <> v_att.membership_version then
    raise exception 'STATE_CONFLICT' using detail = 'approver membership version changed since begin';
  end if;

  select * into v_cand from public.release_candidate
    where tenant_id = v_att.tenant_id and id = v_att.candidate_id for update;

  -- Candidate CAS: at most one ACTIVE release per candidate (belt; the partial
  -- unique index below is the true race guard).
  if exists (select 1 from public.release_revision
               where tenant_id = v_att.tenant_id and candidate_hash = v_att.candidate_hash and status = 'ACTIVE') then
    raise exception 'STATE_CONFLICT' using detail = 'candidate already has an ACTIVE release';
  end if;

  v_locator := v_att.tenant_id::text || '/' || v_att.site_id::text || '/' || v_att.allocated_revision_id::text || '/' || p_content_hash;

  begin
    insert into public.release_revision (
      id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
      sorted_grant_hashes, content_hash, expected_packet_hash, release_certificate, attestation_id,
      attestation_hash, approver_user_id, approver_membership_version, approver_aal, status,
      release_sequence, authorized_at, released_at, committed_at
    ) values (
      v_att.allocated_revision_id, v_att.tenant_id, v_att.site_id, v_att.id, v_att.candidate_id, v_att.candidate_hash,
      v_att.release_authorization_hash, v_cand.sorted_grant_hashes, p_content_hash, p_expected_packet_hash, p_certificate,
      v_cand.attestation_id, v_cand.attestation_hash, v_att.actor_user_id, v_att.membership_version, v_att.aal, 'ACTIVE',
      v_att.release_sequence, v_att.authorized_at, v_att.authorized_at, v_now
    );
  exception when unique_violation then
    -- Lost the release CAS for this candidate (concurrent winner committed first).
    raise exception 'STATE_CONFLICT' using detail = 'lost the release CAS for this candidate';
  end;

  update public.release_artifact
     set status = 'MATERIALIZING', release_revision_id = v_att.allocated_revision_id, content_hash = p_content_hash,
         expected_packet_hash = p_expected_packet_hash, object_locator = v_locator, updated_at = v_now
   where tenant_id = v_att.tenant_id and release_attempt_id = v_att.id and status = 'QUARANTINED';

  -- Four-eyes approval record (§7.4). The CHECK forbids freezer == approver.
  insert into public.release_approval (
    tenant_id, release_attempt_id, release_revision_id, candidate_hash, release_authorization_hash,
    approver_user_id, freezer_user_id, membership_version, aal, decision_at, reason
  ) values (
    v_att.tenant_id, v_att.id, v_att.allocated_revision_id, v_att.candidate_hash, v_att.release_authorization_hash,
    v_att.actor_user_id, v_cand.freezer_user_id, v_att.membership_version, v_att.aal, v_now, 'approved'
  );

  insert into public.release_event (tenant_id, release_revision_id, event_type, sequence, payload)
    values (v_att.tenant_id, v_att.allocated_revision_id, 'RELEASE_COMMITTED', v_att.release_sequence,
            jsonb_build_object('signerKeyId', p_signer_key_id, 'contentHash', p_content_hash));

  insert into public.release_outbox (tenant_id, release_revision_id, kind, payload)
    values (v_att.tenant_id, v_att.allocated_revision_id, 'MATERIALIZE_ARTIFACT',
            jsonb_build_object('expectedPacketHash', p_expected_packet_hash));

  update public.release_attempt set release_revision_id = v_att.allocated_revision_id, updated_at = v_now where id = v_att.id;

  return v_att.allocated_revision_id;
end;
$$;

-- Grants preserved by CREATE OR REPLACE; re-assert defensively to match 0182
-- (worker-only): no authenticated/anon execute; service_role (the worker) only.
revoke all on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text) to service_role;

comment on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text) is
  'Trust Kernel §10.2 commit + §10.4 content-revocation gate (plan Task 4): worker-only ACTIVE-revision commit. Before any release_revision INSERT it calls fn_content_is_blocked(v_att.tenant_id, v_att.site_id, p_content_hash) and raises SAFETY_CONTENT_REVOKED if the content is under an active BLOCK, so a BLOCKED content_hash can never become an ACTIVE release. Deny-only; grants nothing. Phase NOT_FOR_PRODUCTION.';

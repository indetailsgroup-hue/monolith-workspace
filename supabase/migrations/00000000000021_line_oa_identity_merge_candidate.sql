-- Migration: line_oa_identity_merge_candidate
-- Feature: line-oa-commerce (Module B5)
-- Spec task: 7.3 Implement rpc_evaluate_identity_merge_candidate (SECURITY DEFINER)
-- Depends on:
--   00000000000000_line_oa_init.sql
--   00000000000001_line_oa_schema.sql        (public.line_oa_customer_identity,
--                                              public.line_oa_audit_log, pgcrypto)
--   00000000000002_line_oa_constraints.sql   (UNIQUE (line_user_id, vertical_context),
--                                              match_confidence BETWEEN 0.0 AND 1.0)
--   00000000000004_line_oa_audit_immutability.sql (append-only audit log)
--   (shipped C12) public.is_governance_role(), public.resolve_actor()
--
-- Scope: the cross-channel identity merge GUARDRAIL RPC ONLY (R-03).
--   * public.rpc_evaluate_identity_merge_candidate(...)
--
-- This migration does NOT implement the property tests (tasks 7.4/7.5/7.6/7.7),
-- the identity-row unit test (task 7.8), the identity resolution helper (task 7.1,
-- already shipped), or any other RPC.
--
-- ===========================================================================
-- R-03 NO-AUTO-MERGE GUARDRAIL (Req 7)
-- ===========================================================================
-- This wave deliberately ships NO automatic cross-channel identity merge. This
-- RPC only *evaluates* a merge candidate and records the outcome for a human; it
-- NEVER repoints customer_id, so no automatic merge can ever execute regardless
-- of the computed Match_Confidence (including 0.99 and 1.0) (Req 7.3-7.6).
--
-- Behavior:
--   * Re-checks the caller's role INSIDE the function (Req 12.5, 12.6). Cross-
--     channel identity merge is a governance-lead concern (Req 7 user story), so
--     the gate is public.is_governance_role(); a non-governance caller is rejected
--     with a permission-denied error and NO state change (Req 12.6).
--   * Resolves the audit actor via public.resolve_actor() rather than trusting any
--     client-supplied identifier (Req 12.5).
--   * Computes a Match_Confidence and clamps it into the closed interval [0.0, 1.0]
--     (Req 7.1). The column CHECK (task 2.2) is a second line of defense.
--   * Below the threshold (default 0.90) it proposes NO identity link: the binding's
--     customer_id is untouched and manual_review_required is NOT raised (Req 7.2).
--   * For any contemplated cross-channel merge (confidence >= threshold) it sets
--     manual_review_required = true and records the candidate for a human decision,
--     WITHOUT performing any merge (Req 7.3-7.6).
--   * Writes EXACTLY ONE audit entry recording the candidate, the Match_Confidence,
--     and the manual_review_required outcome (Req 7.7, 13.1).
--
-- Secret hygiene (secret-scrub convention): this flow touches NO Channel_Secret or
-- Channel_Access_Token, so there is nothing to decrypt and nothing to scrub. Every
-- error message and the audit entity_ref are constructed from non-secret identifiers
-- only (line_user_id, vertical_context, candidate_customer_id) (Req 13.3).
--
-- Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.5, 12.6

-- This function references the shipped C12 helpers public.is_governance_role() and
-- public.resolve_actor(), which may not exist at migration-build time in a bare
-- environment (they are a platform prerequisite). Disable body validation so the
-- migration applies cleanly; the body is validated at first call (matching the
-- signature-verification migration's approach).
set check_function_bodies = off;

-- gen_random_uuid() lives in pgcrypto; created by the schema migration. Idempotent.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- public.rpc_evaluate_identity_merge_candidate(
--     p_line_user_id          text,
--     p_vertical_context      text,
--     p_candidate_customer_id uuid,
--     p_match_signals         jsonb   default '{}'::jsonb,
--     p_threshold             numeric default 0.90,
--     OUT match_confidence       numeric,
--     OUT manual_review_required boolean,
--     OUT proposed_link          boolean,
--     OUT auto_merged            boolean,
--     OUT outcome                text
-- )
--
-- Evaluate whether p_line_user_id (within p_vertical_context) might correspond to
-- the existing canonical customer p_candidate_customer_id, and record the outcome.
--
-- Match_Confidence computation (deterministic, bounded):
--   * If p_match_signals carries an explicit numeric "score", that value is used.
--   * Otherwise a weighted feature score is derived from optional boolean/numeric
--     signals (phone_match, email_match, name_similarity).
--   * The result is clamped into [0.0, 1.0] and rounded to 2 decimals to fit the
--     numeric(3,2) column (Req 7.1). The clamp guarantees the range invariant for
--     ANY signals, including degenerate/over-weighted inputs.
--
-- OUT parameters (for callers / tests):
--   * match_confidence       -- the clamped score in [0.0, 1.0]
--   * manual_review_required -- true iff a cross-channel merge was contemplated
--   * proposed_link          -- true iff an identity link was proposed (always
--                               false in this wave: a candidate is recorded for a
--                               human, never an automatic link)
--   * auto_merged            -- ALWAYS false (R-03: no automatic merge ever executes)
--   * outcome                -- a non-secret outcome tag for the audit/caller
-- ---------------------------------------------------------------------------
create or replace function public.rpc_evaluate_identity_merge_candidate(
  p_line_user_id text,
  p_vertical_context text,
  p_candidate_customer_id uuid,
  p_match_signals jsonb default '{}'::jsonb,
  p_threshold numeric default 0.90,
  out match_confidence numeric,
  out manual_review_required boolean,
  out proposed_link boolean,
  out auto_merged boolean,
  out outcome text
)
returns record
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_signals     jsonb := coalesce(p_match_signals, '{}'::jsonb);
  v_threshold   numeric;
  v_confidence  numeric;
  v_manual      boolean := false;
  v_outcome     text;
  v_actor       text;
  v_identity_id uuid;
begin
  -- -------------------------------------------------------------------------
  -- Role re-check INSIDE the function (Req 12.5, 12.6). Cross-channel identity
  -- merge is a governance-lead concern (Req 7), so only Governance_Roles may
  -- evaluate a candidate. A non-governance caller is rejected with permission
  -- denied and NO state change.
  -- -------------------------------------------------------------------------
  if not public.is_governance_role() then
    raise exception 'line_oa: permission denied for identity merge evaluation'
      using errcode = '42501';   -- insufficient_privilege; carries no secret/PII
  end if;

  -- -------------------------------------------------------------------------
  -- Input validation. A candidate evaluation is meaningless without both
  -- identity coordinates and a candidate customer. Messages use non-secret
  -- identifiers only.
  -- -------------------------------------------------------------------------
  if p_line_user_id is null or length(btrim(p_line_user_id)) = 0 then
    raise exception 'line_oa: line_user_id is required for merge evaluation'
      using errcode = '22004';   -- null_value_not_allowed
  end if;
  if p_vertical_context is null or length(btrim(p_vertical_context)) = 0 then
    raise exception 'line_oa: vertical_context is required for merge evaluation'
      using errcode = '22004';
  end if;
  if p_candidate_customer_id is null then
    raise exception 'line_oa: candidate_customer_id is required for merge evaluation'
      using errcode = '22004';
  end if;

  -- Resolve the audit actor from the request context, never from client input (Req 12.5).
  v_actor := public.resolve_actor();

  -- -------------------------------------------------------------------------
  -- Compute Match_Confidence and clamp into the closed interval [0.0, 1.0]
  -- (Req 7.1). The threshold is likewise clamped so an out-of-range threshold
  -- cannot subvert the guardrail.
  -- -------------------------------------------------------------------------
  v_threshold := least(1.0, greatest(0.0, coalesce(p_threshold, 0.90)));

  if v_signals ? 'score' then
    -- An explicit pre-computed score (e.g. from an upstream matcher).
    v_confidence := (v_signals ->> 'score')::numeric;
  else
    -- Weighted feature score from optional signals. Absent keys contribute 0.
    v_confidence :=
        (case when (v_signals ->> 'phone_match')::boolean then 0.50 else 0 end)
      + (case when (v_signals ->> 'email_match')::boolean then 0.35 else 0 end)
      + coalesce((v_signals ->> 'name_similarity')::numeric, 0) * 0.15;
  end if;

  -- Clamp + round. The clamp is what guarantees the [0.0, 1.0] range invariant
  -- for ANY input (Property 15); round(_, 2) fits the numeric(3,2) column.
  v_confidence := round(least(1.0, greatest(0.0, coalesce(v_confidence, 0.0))), 2);

  -- -------------------------------------------------------------------------
  -- Decide THIS evaluation's outcome. R-03: NO automatic merge ever executes. We
  -- never repoint customer_id; at most we flag the binding for human review.
  -- v_manual is the decision for THIS candidate and is what we audit and return,
  -- distinct from the binding's accumulated (latched) flag below.
  -- -------------------------------------------------------------------------
  if v_confidence < v_threshold then
    -- Below threshold: propose NO link (Req 7.2). Record the score informationally
    -- but this evaluation raises no review and touches no customer_id.
    v_manual  := false;
    v_outcome := 'no_link_below_threshold';
  else
    -- At/above threshold: a cross-channel merge is contemplated. Flag for human
    -- review and record the candidate; NEVER auto-merge (Req 7.3-7.6).
    v_manual  := true;
    v_outcome := 'manual_review_required_no_auto_merge';
  end if;

  -- -------------------------------------------------------------------------
  -- Record the evaluation on the existing CustomerIdentity binding. The binding
  -- is created during ingestion (task 7.1); a merge candidate presupposes it
  -- exists. We update match_confidence and manual_review_required ONLY -- the
  -- customer_id is left untouched, so no merge is performed (R-03).
  --
  -- The persisted flag is LATCHED with OR so a previously-raised review is never
  -- cleared by a later low-confidence evaluation. The latched row value is NOT
  -- fed back into v_manual: the audit entry and the returned outcome reflect THIS
  -- evaluation's decision, while the row preserves any pending human review.
  -- -------------------------------------------------------------------------
  update public.line_oa_customer_identity ci
     set match_confidence = v_confidence,
         manual_review_required = ci.manual_review_required or v_manual
   where ci.line_user_id = p_line_user_id
     and ci.vertical_context = p_vertical_context
  returning ci.id
    into v_identity_id;

  if v_identity_id is null then
    raise exception 'line_oa: no customer identity binding to evaluate for the given (line_user_id, vertical_context)'
      using errcode = 'P0002';   -- no_data_found; carries no secret/PII
  end if;

  -- -------------------------------------------------------------------------
  -- Audit: EXACTLY ONE entry recording the candidate, the Match_Confidence, and
  -- the manual_review_required outcome (Req 7.7, 13.1). entity_ref is composed
  -- from non-secret identifiers only; no Channel_Secret / Channel_Access_Token is
  -- ever in scope here (Req 13.3). identity merge has no site dimension, so
  -- site_code is NULL.
  -- -------------------------------------------------------------------------
  insert into public.line_oa_audit_log (
    event_type, vertical_context, site_code, entity_ref, performed_by
  )
  values (
    'identity_merge_candidate_evaluated',
    p_vertical_context,
    null,
    format(
      'line_oa_customer_identity:%s|line_user_id:%s|candidate_customer_id:%s|match_confidence:%s|manual_review_required:%s|outcome:%s',
      v_identity_id, p_line_user_id, p_candidate_customer_id, v_confidence, v_manual, v_outcome
    ),
    v_actor
  );

  -- OUT params. auto_merged is ALWAYS false and proposed_link is ALWAYS false in
  -- this wave: a candidate is recorded for a human, never an automatic link/merge.
  match_confidence       := v_confidence;
  manual_review_required := v_manual;
  proposed_link          := false;
  auto_merged            := false;
  outcome                := v_outcome;
  return;
end;
$$;

comment on function public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric)
  is 'R-03 guardrail: evaluates a cross-channel identity merge candidate. Re-checks governance role, resolves the actor, computes a clamped Match_Confidence in [0.0,1.0], proposes no link below the threshold (default 0.90), flags manual_review_required for any contemplated merge, NEVER auto-merges regardless of confidence, and writes exactly one audit entry (Req 7.1-7.7, 12.5, 12.6).';

-- ---------------------------------------------------------------------------
-- Grants. This is a caller-facing RPC (the only write path), so EXECUTE is
-- revoked from PUBLIC and granted to `authenticated`; the in-function
-- is_governance_role() re-check enforces authorization (Req 12.5, 12.6). The
-- grant is applied only where the role exists so the migration also applies
-- cleanly in a plain PostgreSQL environment (e.g. ephemeral CI verification).
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric) to authenticated';
  end if;
end;
$$;

-- Re-enable body validation for any subsequent statements / later migrations.
set check_function_bodies = on;

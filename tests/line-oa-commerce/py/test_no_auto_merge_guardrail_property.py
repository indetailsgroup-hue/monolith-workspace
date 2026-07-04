"""Property test — no-auto-merge guardrail / R-03 (LINE OA Commerce, Module B5).

Spec task: 7.6 Write property test for the no-auto-merge guardrail (R-03).

Implements exactly ONE numbered property against the cross-channel identity
merge GUARDRAIL RPC shipped by task 7.3
(``00000000000021_line_oa_identity_merge_candidate.sql`` —
``public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb,
numeric)``):

    Property 17: For any confidence in [0.0,1.0] including 0.99/1.0, no automatic
    merge executes; candidate recorded manual_review_required and routed to a
    human.
    Validates: Requirements 7.3, 7.4, 7.5, 7.6.

For every generated ``(line_user_id, vertical, score)`` the test seeds a fresh
``line_oa_customer_identity`` binding (its own bound ``customer_id``), then
invokes the RPC with an explicit ``score`` signal so the evaluated
``Match_Confidence`` spans the whole closed interval [0.0, 1.0] — the boundary
values 0.99 and 1.0 are drawn explicitly. For ANY confidence it asserts:

  * ``auto_merged`` is ALWAYS ``False`` — no automatic merge ever executes
    (Req 7.3, 7.4, 7.5);
  * ``proposed_link`` is ALWAYS ``False`` — no automatic link is proposed in
    this wave (R-03);
  * the binding's ``customer_id`` is NEVER repointed — i.e. no merge mutates the
    identity binding regardless of confidence (Req 7.3-7.6).

And for any contemplated cross-channel merge (confidence at/above the default
0.90 threshold) it additionally asserts the candidate is recorded and ROUTED TO
A HUMAN:

  * the returned + persisted ``manual_review_required`` is ``True`` (Req 7.4);
  * exactly one ``line_oa_audit_log`` entry for this evaluation records the
    candidate, its ``match_confidence``, and the ``manual_review_required``
    outcome (Req 7.6).

The RPC is governance-gated: the session injects governance JWT claims via
``set_config('request.jwt.claims', ...)`` (the platform convention) so the
in-function ``public.is_governance_role()`` re-check passes. Each generated
example runs inside a SAVEPOINT that is rolled back, so the test provisions and
tears down its own binding/audit rows without leaking state. Every generated
``line_user_id`` is namespaced with a fresh UUID so it can never collide with
pre-existing rows in a shared test database.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the C12 helpers
(``is_governance_role`` / ``resolve_actor`` / ``auth.jwt``) are absent, the
governance-claims convention is not honored, or the guardrail RPC is not present.
"""

from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Governance principal: admin is one of the governance roles consumed by the
# shipped C12 public.is_governance_role() helper (reads app_metadata.roles). A
# 'sub' is included so public.resolve_actor() has a stable actor to derive.
_GOV_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)

# The RPC's default Match_Confidence_Threshold (see task 7.3 migration).
_THRESHOLD = Decimal("0.90")


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------
# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so generated text
# round-trips through Postgres' text type (which cannot store NUL bytes).
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

vertical_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=32).filter(
    lambda s: len(s.strip()) > 0
)

# Confidence as integer hundredths so the value is an EXACT 2-decimal number
# (the column is numeric(3,2) and the RPC rounds to 2 dp). Explicitly draw the
# boundary/threshold values — including 0.99 and 1.0 — alongside the full range.
_BOUNDARY_PCTS = st.sampled_from([0, 1, 50, 89, 90, 91, 99, 100])
score_pct_strategy = st.one_of(_BOUNDARY_PCTS, st.integers(min_value=0, max_value=100))


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers are
# unavailable or the governance-claims convention is not honored.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping no-auto-merge "
            "guardrail property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping no-auto-merge test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping no-auto-merge test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless the guardrail RPC + C12 helpers exist AND governance claims
    are honored by ``public.is_governance_role()`` in this environment."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)",
            "public.is_governance_role()",
            "public.resolve_actor()",
            "auth.jwt()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "no-auto-merge guardrail property test."
                )

        # Probe (non-mutating): governance claims must make is_governance_role() true.
        cur.execute("savepoint probe")
        try:
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot evaluate governance claims; skipping no-auto-merge "
                f"guardrail property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping no-auto-merge guardrail test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_binding(cur: Any, line_user_id: str, vertical: str) -> tuple[Any, Any]:
    """Seed a fresh CustomerIdentity binding; return (identity_id, customer_id)."""
    cur.execute(
        "insert into public.line_oa_customer_identity "
        "(line_user_id, vertical_context, customer_id) "
        "values (%s, %s, gen_random_uuid()) returning id, customer_id",
        (line_user_id, vertical),
    )
    row = cur.fetchone()
    return row[0], row[1]


def _evaluate(
    cur: Any, line_user_id: str, vertical: str, candidate_id: Any, score: str
) -> dict[str, Any]:
    """Invoke the guardrail RPC with an explicit score signal."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,))
    cur.execute(
        "select match_confidence, manual_review_required, proposed_link, "
        "auto_merged, outcome "
        "from public.rpc_evaluate_identity_merge_candidate(%s, %s, %s, %s::jsonb)",
        (line_user_id, vertical, candidate_id, json.dumps({"score": score})),
    )
    r = cur.fetchone()
    return {
        "match_confidence": r[0],
        "manual_review_required": r[1],
        "proposed_link": r[2],
        "auto_merged": r[3],
        "outcome": r[4],
    }


def _binding(cur: Any, identity_id: Any) -> tuple[Any, bool]:
    """Return (customer_id, manual_review_required) persisted for an identity row."""
    cur.execute(
        "select customer_id, manual_review_required "
        "from public.line_oa_customer_identity where id = %s",
        (identity_id,),
    )
    row = cur.fetchone()
    return row[0], row[1]


def _audit_entries(cur: Any, candidate_id: Any) -> list[str]:
    """Return entity_ref strings of merge-candidate audit entries for a candidate."""
    cur.execute(
        "select entity_ref from public.line_oa_audit_log "
        "where event_type = 'identity_merge_candidate_evaluated' "
        "and entity_ref like %s",
        (f"%candidate_customer_id:{candidate_id}%",),
    )
    return [row[0] for row in cur.fetchall()]


# ---------------------------------------------------------------------------
# Property 17
# ---------------------------------------------------------------------------


@property(
    17,
    "For any confidence in [0.0,1.0] including 0.99/1.0, no automatic merge "
    "executes; candidate recorded manual_review_required and routed to a human",
)
@given(
    user_fragment=st.text(alphabet=_SAFE_TEXT, min_size=0, max_size=24),
    vertical=vertical_strategy,
    score_pct=score_pct_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_no_auto_merge_guardrail(
    db_conn: Any,
    user_fragment: str,
    vertical: str,
    score_pct: int,
) -> None:
    """**Validates: Requirements 7.3, 7.4, 7.5, 7.6**"""
    # An exact 2-decimal confidence spanning [0.00, 1.00], incl. 0.99 and 1.00.
    score_str = f"{score_pct / 100:.2f}"
    expected_conf = Decimal(score_str)
    at_or_above_threshold = expected_conf >= _THRESHOLD

    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"mergetest-{uuid.uuid4().hex}-{user_fragment}"
    # The contemplated cross-channel merge target (a DIFFERENT canonical customer).
    candidate_id = uuid.uuid4()

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop17")
        try:
            identity_id, bound_customer_id = _seed_binding(cur, line_user_id, vertical)
            # The candidate must be a genuinely different customer for the merge to
            # be "cross-channel"; the guardrail must still never repoint to it.
            assert candidate_id != bound_customer_id

            result = _evaluate(cur, line_user_id, vertical, candidate_id, score_str)

            # ---- Invariants holding for ANY confidence (Req 7.3, 7.4, 7.5) ----
            assert result["auto_merged"] is False, (
                "R-03: no automatic merge may ever execute, regardless of "
                f"confidence {score_str}"
            )
            assert result["proposed_link"] is False, (
                "R-03: no automatic identity link is proposed in this wave, "
                f"regardless of confidence {score_str}"
            )
            assert result["match_confidence"] == expected_conf, (
                f"evaluated confidence must equal the supplied score {score_str}"
            )

            # The binding's customer_id must NEVER be repointed (no merge executed).
            persisted_customer_id, persisted_manual = _binding(cur, identity_id)
            assert persisted_customer_id == bound_customer_id, (
                "the binding's customer_id must never be repointed by the "
                f"guardrail (confidence {score_str})"
            )

            # ---- Contemplated cross-channel merge → recorded + routed to human ----
            if at_or_above_threshold:
                # Req 7.4 — flagged for manual review (returned and persisted).
                assert result["manual_review_required"] is True, (
                    "a contemplated merge at/above threshold must set "
                    f"manual_review_required (confidence {score_str})"
                )
                assert persisted_manual is True, (
                    "the binding must persist manual_review_required for review "
                    f"(confidence {score_str})"
                )
                assert result["outcome"] == "manual_review_required_no_auto_merge"

                # Req 7.6 — recorded and routed to a human: exactly one audit entry
                # for this evaluation recording the candidate + the review outcome.
                audits = _audit_entries(cur, candidate_id)
                assert len(audits) == 1, (
                    "exactly one audit entry must record the contemplated merge "
                    f"candidate (got {len(audits)})"
                )
                entity_ref = audits[0]
                assert f"match_confidence:{expected_conf}" in entity_ref, (
                    "the audit entry must record the evaluated Match_Confidence"
                )
                assert "manual_review_required:true" in entity_ref, (
                    "the audit entry must record the manual_review_required outcome"
                )
            else:
                # Below threshold: still no merge, and this evaluation proposes no
                # link nor raises review (Req 7.2 boundary; reinforces R-03).
                assert result["manual_review_required"] is False, (
                    "a below-threshold evaluation must not raise manual review "
                    f"(confidence {score_str})"
                )
                assert persisted_manual is False
                assert result["outcome"] == "no_link_below_threshold"
        finally:
            cur.execute("rollback to savepoint prop17")
            cur.execute("release savepoint prop17")

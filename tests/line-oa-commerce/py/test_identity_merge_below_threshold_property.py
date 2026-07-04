"""Property test — below-threshold no-link (LINE OA Commerce, Module B5).

Spec task: 7.5 Write property test for below-threshold no-link.

Implements exactly ONE numbered property against the merge-candidate guardrail
RPC shipped by task 7.3
(``00000000000021_line_oa_identity_merge_candidate.sql`` —
``public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric)``):

    Property 16: Confidence strictly below the threshold proposes no identity link.
    Validates: Requirements 7.2.

For every generated case the test seeds the prerequisite CustomerIdentity binding
for a ``(line_user_id, vertical_context)`` pair (as the RLS-bypassing table owner,
since there is no client write policy), then invokes the RPC — as a **Governance**
principal, the only role the RPC permits — with either an explicit pre-computed
``score`` or boolean feature signals chosen so the resulting Match_Confidence is
**strictly below** the effective threshold (the default ``0.90`` or an explicit
in-range threshold). It then asserts the below-threshold outcome (Req 7.2):

  * ``proposed_link`` is false (no identity link proposed),
  * ``manual_review_required`` is false for that evaluation,
  * ``auto_merged`` is false,
  * ``outcome`` is ``'no_link_below_threshold'``,
  * the returned ``match_confidence`` equals the expected clamped score, and
  * the binding's ``customer_id`` is untouched and its persisted
    ``manual_review_required`` flag stays false.

The Governance session is simulated with the platform convention used by the
shipped RLS verification harness: ``set_config('request.jwt.claims', ...)`` to
inject the JWT claims the C12 helpers consume, then ``set role authenticated`` so
the RPC's in-function ``public.is_governance_role()`` re-check passes. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own binding without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, or the RPC / C12
helpers are not present.
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

# Governance JWT claims (app_metadata.roles=['admin'] => is_governance_role() true),
# matching the convention used by the RLS read-scoping property test.
_GOV_CLAIMS = json.dumps({"app_metadata": {"roles": ["admin"]}})

VERTICALS = ("monolith", "tcck")

# Exact (no-rounding) confidences produced by the RPC's weighted feature score
# using ONLY the boolean signals (phone_match -> 0.50, email_match -> 0.35);
# name_similarity is intentionally omitted to keep every value a clean 2-decimal
# number and avoid float/round mismatches between Python and Postgres.
#   (phone_match, email_match) -> confidence
_FEATURE_COMBOS = {
    (False, False): Decimal("0.00"),
    (False, True): Decimal("0.35"),
    (True, False): Decimal("0.50"),
    (True, True): Decimal("0.85"),
}


# ---------------------------------------------------------------------------
# Strategy: a (signals, threshold, expected_confidence) case whose confidence
# is STRICTLY below the effective threshold.
# ---------------------------------------------------------------------------


@st.composite
def _below_threshold_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate inputs that yield a Match_Confidence strictly below the threshold.

    Half the cases exercise the default threshold (0.90, passed as NULL); the
    other half pass an explicit in-range threshold. Confidence is supplied either
    as an explicit ``score`` or as boolean feature signals, always at 2-decimal
    precision so the RPC's ``round(_, 2)`` is a no-op and the expected value is
    exact.
    """
    use_default_threshold = draw(st.booleans())
    if use_default_threshold:
        threshold: float | None = None
        eff = Decimal("0.90")
    else:
        # Explicit threshold at 2-decimal precision in [0.01, 1.00].
        t_cents = draw(st.integers(min_value=1, max_value=100))
        eff = Decimal(t_cents) / Decimal(100)
        threshold = float(eff)

    if draw(st.booleans()):
        # Explicit pre-computed score strictly below the effective threshold.
        max_cents = int(eff * 100) - 1  # strictly below eff; >= 0 since eff >= 0.01
        score_cents = draw(st.integers(min_value=0, max_value=max_cents))
        expected = Decimal(score_cents) / Decimal(100)
        signals: dict[str, Any] = {"score": float(expected)}
    else:
        # Boolean feature signals whose weighted confidence is below the threshold.
        allowed = [combo for combo, conf in _FEATURE_COMBOS.items() if conf < eff]
        phone_match, email_match = draw(st.sampled_from(allowed))
        expected = _FEATURE_COMBOS[(phone_match, email_match)]
        signals = {"phone_match": phone_match, "email_match": email_match}

    return {
        "signals": signals,
        "threshold": threshold,
        "expected_confidence": expected,
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers are
# unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping below-threshold no-link "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping below-threshold no-link test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping below-threshold no-link test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless the merge-candidate RPC, the C12 role helpers, and the
    ``authenticated`` role are present (so the governance gate can be exercised).
    """
    with conn.cursor() as cur:
        cur.execute(
            "select to_regprocedure("
            "'public.rpc_evaluate_identity_merge_candidate(text,text,uuid,jsonb,numeric)')"
        )
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.rpc_evaluate_identity_merge_candidate(...) is not installed; "
                "skipping below-threshold no-link property test."
            )

        for proc in ("public.is_governance_role()", "public.resolve_actor()"):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "below-threshold no-link property test."
                )

        cur.execute("select 1 from pg_roles where rolname = 'authenticated'")
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "the 'authenticated' role is not present; skipping below-threshold "
                "no-link property test."
            )
    conn.rollback()


def _evaluate_as_governance(
    cur: Any,
    line_user_id: str,
    vertical_context: str,
    candidate_customer_id: str,
    signals: dict[str, Any],
    threshold: float | None,
) -> dict[str, Any]:
    """Invoke the RPC as a Governance principal and return its OUT row."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,))
    cur.execute("set role authenticated")
    try:
        cur.execute(
            "select match_confidence, manual_review_required, proposed_link, "
            "auto_merged, outcome "
            "from public.rpc_evaluate_identity_merge_candidate(%s, %s, %s, %s::jsonb, %s)",
            (
                line_user_id,
                vertical_context,
                candidate_customer_id,
                json.dumps(signals),
                threshold,
            ),
        )
        row = cur.fetchone()
    finally:
        cur.execute("reset role")
    return {
        "match_confidence": row[0],
        "manual_review_required": row[1],
        "proposed_link": row[2],
        "auto_merged": row[3],
        "outcome": row[4],
    }


# ---------------------------------------------------------------------------
# Property 16
# ---------------------------------------------------------------------------


@property(16, "Confidence strictly below the threshold proposes no identity link")
@given(case=_below_threshold_case(), seed=st.integers(min_value=0, max_value=10_000))
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_below_threshold_no_link(db_conn: Any, case: dict[str, Any], seed: int) -> None:
    """**Validates: Requirements 7.2**"""
    signals: dict[str, Any] = case["signals"]
    threshold: float | None = case["threshold"]
    expected: Decimal = case["expected_confidence"]

    token = uuid.uuid4().hex
    line_user_id = f"U{token}"
    vertical_context = VERTICALS[seed % len(VERTICALS)]
    seeded_customer_id = str(uuid.uuid4())
    candidate_customer_id = str(uuid.uuid4())  # a different, contemplated customer

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop16")
        try:
            # ---- Seed the prerequisite identity binding as the table owner. ----
            cur.execute(
                "insert into public.line_oa_customer_identity "
                "(line_user_id, vertical_context, customer_id, "
                " match_confidence, manual_review_required) "
                "values (%s, %s, %s, null, false)",
                (line_user_id, vertical_context, seeded_customer_id),
            )

            # ---- Invoke the RPC as Governance with a strictly-below-threshold score. ----
            result = _evaluate_as_governance(
                cur,
                line_user_id,
                vertical_context,
                candidate_customer_id,
                signals,
                threshold,
            )

            # ---- Req 7.2: no identity link proposed below the threshold. ----
            assert result["proposed_link"] is False, (
                f"below threshold must propose no link: {result}"
            )
            assert result["manual_review_required"] is False, (
                f"below-threshold evaluation must not require manual review: {result}"
            )
            assert result["auto_merged"] is False, (
                f"no automatic merge may ever execute: {result}"
            )
            assert result["outcome"] == "no_link_below_threshold", (
                f"below-threshold outcome tag mismatch: {result}"
            )
            assert result["match_confidence"] == expected, (
                f"returned confidence {result['match_confidence']} != expected {expected}"
            )

            # ---- The binding's customer_id is untouched and no review latched. ----
            cur.execute(
                "select customer_id, manual_review_required "
                "from public.line_oa_customer_identity "
                "where line_user_id = %s and vertical_context = %s",
                (line_user_id, vertical_context),
            )
            bound_customer_id, bound_manual = cur.fetchone()
            assert str(bound_customer_id) == seeded_customer_id, (
                "below-threshold evaluation must not repoint customer_id: "
                f"{bound_customer_id} != {seeded_customer_id}"
            )
            assert bound_manual is False, (
                "below-threshold evaluation must not latch manual_review_required"
            )
        finally:
            try:
                cur.execute("reset role")
            except Exception:
                pass
            cur.execute("rollback to savepoint prop16")
            cur.execute("release savepoint prop16")

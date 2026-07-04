"""Property test — match-confidence range (LINE OA Commerce, Module B5).

Spec task: 7.4 Write property test for match-confidence range.

Implements exactly ONE numbered property against the cross-channel identity
merge GUARDRAIL RPC shipped by task 7.3
(``00000000000021_line_oa_identity_merge_candidate.sql`` —
``public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric)``):

    Property 15: Computed Match_Confidence is within the closed interval
    [0.0, 1.0].
    Validates: Requirements 7.1.

The RPC computes a Match_Confidence either from an explicit pre-computed
``score`` carried by ``p_match_signals`` or from a weighted feature score
(``phone_match``/``email_match``/``name_similarity``), then clamps it into the
closed interval ``[0.0, 1.0]`` and rounds to two decimals. The clamp is the
invariant under test: for ANY match signals — including degenerate, missing,
over-weighted, or explicitly out-of-range (negative / > 1) inputs — the returned
``match_confidence`` must land within ``[0.0, 1.0]`` inclusive.

For every generated ``(match_signals, threshold)`` example the test:

  * seeds the prerequisite CustomerIdentity binding for a fresh
    ``(line_user_id, vertical_context)`` pair as the (RLS-bypassing) table owner
    — the RPC presupposes the binding exists (task 7.1 creates it at ingestion);
  * assumes the governance principal the RPC's in-function role re-check requires
    by injecting ``app_metadata.roles=['admin']`` JWT claims (so
    ``public.is_governance_role()`` is true) and switching to the
    ``authenticated`` role, mirroring the shipped RLS verification harness;
  * invokes the RPC and asserts the returned ``match_confidence`` is non-NULL and
    within ``[0.0, 1.0]`` inclusive.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own binding without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the RPC / C12 helpers /
``auth.jwt()`` are absent, or the governance role cannot be exercised as
``authenticated``.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# Governance claims so the RPC's in-function is_governance_role() re-check passes.
_GOV_CLAIMS = json.dumps({"app_metadata": {"roles": ["admin"]}})

# Verticals used to add row variety (vertical_context is part of the identity key).
VERTICALS = ("monolith", "tcck")


# ---------------------------------------------------------------------------
# Strategies — arbitrary match signals, deliberately spanning the degenerate,
# over-weighted, and explicitly out-of-range cases the clamp must absorb.
# ---------------------------------------------------------------------------
# Finite numbers only (NaN / +-inf are not valid numeric-castable match signals);
# the magnitude intentionally covers negatives and values well beyond 1.0.
_finite = st.floats(
    allow_nan=False, allow_infinity=False, min_value=-1000.0, max_value=1000.0
)

# An explicit pre-computed score, including out-of-range values (< 0 and > 1).
_score = st.one_of(
    _finite,
    st.integers(min_value=-1000, max_value=1000),
    # A handful of pointed extremes around the [0.0, 1.0] boundaries.
    st.sampled_from([-1.0, -0.01, 0.0, 0.5, 1.0, 1.01, 2.0, 100.0]),
)


@st.composite
def _match_signals(draw: st.DrawFn) -> dict[str, Any]:
    """Generate an arbitrary match-signals object for the RPC.

    Three flavours are mixed: an explicit ``score`` (the matcher-supplied path),
    a weighted-feature object (possibly over-weighted), and a degenerate/empty
    object — each capable of pushing the raw score outside ``[0.0, 1.0]``.
    """
    kind = draw(st.integers(min_value=0, max_value=2))

    if kind == 0:
        # Explicit pre-computed score — frequently out of range.
        return {"score": draw(_score)}

    if kind == 1:
        # Weighted features; name_similarity may be over-weighted / negative.
        signals: dict[str, Any] = {}
        if draw(st.booleans()):
            signals["phone_match"] = draw(st.booleans())
        if draw(st.booleans()):
            signals["email_match"] = draw(st.booleans())
        if draw(st.booleans()):
            signals["name_similarity"] = draw(_finite)
        return signals

    # Degenerate / empty (absent keys contribute 0 → confidence 0.0).
    return {}


# A threshold spanning the valid range plus out-of-range values (the RPC clamps
# the threshold too); ``None`` exercises the function's default (0.90).
_threshold = st.one_of(
    st.none(),
    st.floats(allow_nan=False, allow_infinity=False, min_value=-5.0, max_value=5.0),
)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers are
# unavailable or the governance role cannot be exercised as `authenticated`.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping match-confidence-range "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping match-confidence-range test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping match-confidence-range test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless the RPC, the C12 helpers, ``auth.jwt()``, the ``authenticated``
    role, and the identity table are present AND governance can be exercised as
    ``authenticated``.
    """
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
                    "match-confidence-range property test."
                )

        cur.execute("select 1 from pg_roles where rolname = 'authenticated'")
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "the 'authenticated' role is not present; skipping "
                "match-confidence-range property test."
            )

        # Probe: can we present a governance principal as `authenticated`?
        cur.execute("savepoint probe")
        try:
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute("set role authenticated")
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            cur.execute("reset role")
            if not is_gov:
                cur.execute("rollback to savepoint probe")
                cur.execute("release savepoint probe")
                conn.rollback()
                pytest.skip(
                    "governance role could not be presented via JWT claims; "
                    "skipping match-confidence-range property test."
                )
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
        except Exception as exc:
            try:
                cur.execute("reset role")
            except Exception:
                pass
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                "cannot exercise governance role as 'authenticated'; skipping "
                f"match-confidence-range property test ({exc})."
            )
    conn.rollback()


# ---------------------------------------------------------------------------
# Property 15
# ---------------------------------------------------------------------------


@property(15, "Computed Match_Confidence is within the closed interval [0.0, 1.0]")
@given(signals=_match_signals(), threshold=_threshold)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_match_confidence_range(
    db_conn: Any,
    signals: dict[str, Any],
    threshold: float | None,
) -> None:
    """**Validates: Requirements 7.1**"""
    token = uuid.uuid4().hex
    line_user_id = f"U-{token}"
    vertical_context = VERTICALS[hash(token) % len(VERTICALS)]
    candidate_customer_id = str(uuid.uuid4())

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop15")
        try:
            # ---- Seed the prerequisite CustomerIdentity binding as the owner. ----
            cur.execute(
                "insert into public.line_oa_customer_identity "
                "(line_user_id, vertical_context, customer_id) "
                "values (%s, %s, %s)",
                (line_user_id, vertical_context, str(uuid.uuid4())),
            )

            # ---- Invoke the RPC as a governance principal under `authenticated`. ----
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute("set role authenticated")
            try:
                cur.execute(
                    "select match_confidence "
                    "from public.rpc_evaluate_identity_merge_candidate("
                    "    %s, %s, %s, %s::jsonb, %s)",
                    (
                        line_user_id,
                        vertical_context,
                        candidate_customer_id,
                        json.dumps(signals),
                        threshold,
                    ),
                )
                match_confidence = cur.fetchone()[0]
            finally:
                cur.execute("reset role")

            # Property 15 — the computed Match_Confidence is always within [0.0, 1.0].
            assert match_confidence is not None, (
                "match_confidence must be computed (non-NULL) for "
                f"signals={signals!r}, threshold={threshold!r}"
            )
            assert 0.0 <= float(match_confidence) <= 1.0, (
                "match_confidence must be within the closed interval [0.0, 1.0] for "
                f"signals={signals!r}, threshold={threshold!r}; got {match_confidence!r}"
            )
        finally:
            try:
                cur.execute("reset role")
            except Exception:
                pass
            cur.execute("rollback to savepoint prop15")
            cur.execute("release savepoint prop15")

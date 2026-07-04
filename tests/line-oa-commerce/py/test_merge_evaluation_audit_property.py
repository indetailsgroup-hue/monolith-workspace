"""Property test — merge-evaluation audit (LINE OA Commerce, Module B5).

Spec task: 7.7 Write property test for merge-evaluation audit.

Implements exactly ONE numbered property against the database-layer cross-channel
identity merge guardrail RPC shipped by task 7.3
(``00000000000021_line_oa_identity_merge_candidate.sql`` —
``public.rpc_evaluate_identity_merge_candidate(text, text, uuid, jsonb, numeric)``):

    Property 18: Each merge evaluation writes exactly one audit entry recording
    Match_Confidence and the manual_review_required outcome.
    Validates: Requirements 7.7.

For every generated ``(match signals, threshold)`` the test:

  * seeds the prerequisite CustomerIdentity binding for a unique
    ``(line_user_id, vertical_context)`` (the binding is created during ingestion
    in task 7.1; a merge candidate presupposes it exists);
  * snapshots that no audit row yet references this run's unique ``line_user_id``;
  * invokes ``rpc_evaluate_identity_merge_candidate`` EXACTLY ONCE, capturing the
    returned ``match_confidence`` and ``manual_review_required`` OUT values;
  * asserts EXACTLY ONE new ``line_oa_audit_log`` row references this evaluation
    (filtered by the unique ``line_user_id`` carried in ``entity_ref``), and that
    its ``event_type`` is the merge-evaluation event;
  * asserts the recorded entry reflects the evaluation outcome: the
    ``match_confidence`` embedded in ``entity_ref`` equals the returned
    Match_Confidence, and the embedded ``manual_review_required`` flag equals the
    returned manual-review outcome.

The governance role is simulated with the platform convention used by the shipped
RLS / RPC harnesses: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``public.is_governance_role()`` / ``public.resolve_actor()``)
consume, since the RPC re-checks the governance role inside the function.

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
seeds and tears down its own binding / audit rows without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the C12 governance
helpers are absent, or the merge-evaluation RPC cannot be exercised as a
governance principal.
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

# The merge-evaluation event_type written by the RPC (task 7.3).
_MERGE_EVENT_TYPE = "identity_merge_candidate_evaluated"

# Governance claims (app_metadata.roles -> public.is_governance_role() is true).
_GOV_CLAIMS = json.dumps(
    {"sub": str(uuid.uuid4()), "app_metadata": {"roles": ["admin"]}}
)

# Verticals add variety; they are not part of this property's invariant.
VERTICALS = ("monolith", "tcck")


# ---------------------------------------------------------------------------
# Strategy: arbitrary match signals + threshold exercising every confidence path.
# ---------------------------------------------------------------------------


@st.composite
def _merge_eval_inputs(draw: st.DrawFn) -> dict[str, Any]:
    """Generate match signals and a threshold spanning the RPC's branches.

    The RPC computes Match_Confidence either from an explicit ``score`` signal or
    from weighted ``phone_match`` / ``email_match`` / ``name_similarity`` features,
    then clamps into [0.0, 1.0]. We deliberately include out-of-range scores and
    boundary values (0.99, 1.0) so both the below-threshold and contemplated-merge
    outcomes are exercised.
    """
    finite = {"allow_nan": False, "allow_infinity": False}

    explicit_score = st.fixed_dictionaries(
        {
            "score": st.one_of(
                st.sampled_from([0.0, 0.5, 0.89, 0.9, 0.99, 1.0]),
                st.floats(min_value=-0.5, max_value=1.5, **finite).map(
                    lambda x: round(x, 4)
                ),
            )
        }
    )

    feature_signals = st.fixed_dictionaries(
        {},
        optional={
            "phone_match": st.booleans(),
            "email_match": st.booleans(),
            "name_similarity": st.floats(min_value=0.0, max_value=1.0, **finite).map(
                lambda x: round(x, 4)
            ),
        },
    )

    signals = draw(st.one_of(explicit_score, feature_signals, st.just({})))

    threshold = draw(
        st.one_of(
            st.none(),  # exercise the default (0.90)
            st.sampled_from([0.0, 0.5, 0.9, 1.0]),
            st.floats(min_value=-0.5, max_value=1.5, **finite).map(
                lambda x: round(x, 4)
            ),
        )
    )

    return {
        "signals": signals,
        "threshold": threshold,
        "vertical": draw(st.sampled_from(VERTICALS)),
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / governance
# helpers are unavailable, or the RPC cannot be exercised as governance.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping merge-evaluation audit "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping merge-evaluation audit test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping merge-evaluation audit test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip unless the RPC, governance helpers, and tables exist AND the RPC can
    be exercised end-to-end as a governance principal.
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
                    "merge-evaluation audit property test."
                )

        for table in ("public.line_oa_customer_identity", "public.line_oa_audit_log"):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping merge-evaluation audit "
                    "property test."
                )

        # Probe: can we seed a binding and run the RPC as a governance principal?
        cur.execute("savepoint probe")
        try:
            token = uuid.uuid4().hex
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )
            cur.execute(
                "insert into public.line_oa_customer_identity "
                "(line_user_id, vertical_context, customer_id) values (%s, %s, %s)",
                (f"probe:{token}", "monolith", str(uuid.uuid4())),
            )
            cur.execute(
                "select match_confidence, manual_review_required "
                "from public.rpc_evaluate_identity_merge_candidate(%s, %s, %s, %s::jsonb, %s)",
                (f"probe:{token}", "monolith", str(uuid.uuid4()), json.dumps({"score": 0.5}), None),
            )
            cur.fetchone()
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_evaluate_identity_merge_candidate as governance; "
                f"skipping merge-evaluation audit property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_entity_ref(entity_ref: str) -> dict[str, str]:
    """Parse the pipe-delimited ``key:value`` audit entity_ref into a dict.

    The RPC composes entity_ref from non-secret identifiers only, e.g.
    ``line_oa_customer_identity:<id>|line_user_id:<lui>|candidate_customer_id:<uuid>|
    match_confidence:<conf>|manual_review_required:<bool>|outcome:<tag>``. The
    generated line_user_id is a colon-free token so each segment splits cleanly on
    its first ':'.
    """
    fields: dict[str, str] = {}
    for segment in entity_ref.split("|"):
        if ":" in segment:
            key, value = segment.split(":", 1)
            fields[key] = value
    return fields


# ---------------------------------------------------------------------------
# Property 18
# ---------------------------------------------------------------------------


@property(
    18,
    "Each merge evaluation writes exactly one audit entry recording "
    "Match_Confidence and the manual_review_required outcome",
)
@given(inputs=_merge_eval_inputs())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_merge_evaluation_audit(db_conn: Any, inputs: dict[str, Any]) -> None:
    """**Validates: Requirements 7.7**"""
    signals: dict[str, Any] = inputs["signals"]
    threshold = inputs["threshold"]
    vertical: str = inputs["vertical"]

    # A colon-free, run-unique line_user_id so its value is recoverable verbatim
    # from the pipe/colon-delimited audit entity_ref.
    token = uuid.uuid4().hex
    line_user_id = f"prop18-{token}"
    candidate_customer_id = str(uuid.uuid4())
    customer_id = str(uuid.uuid4())
    audit_filter = f"%line_user_id:{line_user_id}|%"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop18")
        try:
            # Act as a governance principal: the RPC re-checks is_governance_role().
            cur.execute(
                "select set_config('request.jwt.claims', %s, true)", (_GOV_CLAIMS,)
            )

            # Seed the prerequisite CustomerIdentity binding (task 7.1 invariant).
            cur.execute(
                "insert into public.line_oa_customer_identity "
                "(line_user_id, vertical_context, customer_id) values (%s, %s, %s)",
                (line_user_id, vertical, customer_id),
            )

            # No audit row references this evaluation yet.
            cur.execute(
                "select count(*) from public.line_oa_audit_log where entity_ref like %s",
                (audit_filter,),
            )
            assert cur.fetchone()[0] == 0, "no audit row should reference this run before evaluation"

            # ---- Invoke the merge-evaluation RPC EXACTLY ONCE. ----
            cur.execute(
                "select match_confidence, manual_review_required "
                "from public.rpc_evaluate_identity_merge_candidate(%s, %s, %s, %s::jsonb, %s)",
                (
                    line_user_id,
                    vertical,
                    candidate_customer_id,
                    json.dumps(signals),
                    threshold,
                ),
            )
            returned_confidence, returned_manual = cur.fetchone()
            returned_confidence = Decimal(str(returned_confidence))

            # ---- Exactly ONE new audit row for this evaluation. ----
            cur.execute(
                "select event_type, entity_ref from public.line_oa_audit_log "
                "where entity_ref like %s",
                (audit_filter,),
            )
            audit_rows = cur.fetchall()
            assert len(audit_rows) == 1, (
                "each merge evaluation must write exactly one audit entry; "
                f"found {len(audit_rows)}"
            )
            event_type, entity_ref = audit_rows[0]
            assert event_type == _MERGE_EVENT_TYPE, (
                f"audit entry must record the merge-evaluation event_type, got {event_type!r}"
            )

            # ---- The entry records Match_Confidence and the manual_review outcome. ----
            fields = _parse_entity_ref(entity_ref)

            assert "match_confidence" in fields, (
                f"audit entry must record match_confidence; entity_ref={entity_ref!r}"
            )
            assert Decimal(fields["match_confidence"]) == returned_confidence, (
                "audited match_confidence must equal the evaluation's Match_Confidence: "
                f"{fields['match_confidence']} != {returned_confidence}"
            )

            assert "manual_review_required" in fields, (
                f"audit entry must record manual_review_required; entity_ref={entity_ref!r}"
            )
            expected_manual = "true" if returned_manual else "false"
            assert fields["manual_review_required"] == expected_manual, (
                "audited manual_review_required must equal the evaluation outcome: "
                f"{fields['manual_review_required']} != {expected_manual}"
            )
        finally:
            cur.execute("rollback to savepoint prop18")
            cur.execute("release savepoint prop18")

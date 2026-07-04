"""Property test — Session_Timeout auto-close sweep (LINE OA Commerce, Module B5).

Spec task: 16.2 Write property test for timeout auto-close.

Implements exactly ONE numbered property against the Session_Timeout sweep RPC
shipped by task 16.1
(``00000000000061_line_oa_session_timeout_sweep.sql`` —
``public.rpc_sweep_line_session_timeouts()``):

    Property 8: Any conversation idle beyond the 24h Session_Timeout is set to
    closed by the sweep.
    Validates: Requirements 3.7.

The sweep closes every *non-closed* Conversation whose ``last_activity_at`` is
strictly older than the 24-hour Session_Timeout boundary
(``last_activity_at < now_utc - interval '24 hours'``) and leaves everything
else untouched.

Determinism of the boundary
---------------------------
The whole example runs inside a single transaction (one SAVEPOINT that is rolled
back). In PostgreSQL ``now()`` / ``transaction_timestamp()`` returns the START
time of the transaction and is CONSTANT for its whole duration, so the
``now_utc`` used to seed each ``last_activity_at`` is the EXACT SAME instant the
sweep uses to compute its 24-hour cutoff. There is therefore no wall-clock drift
between seeding and sweeping, and the boundary collapses to a clean predicate on
the generated idle offset:

    seeded last_activity_at = now_utc - offset
    sweep closes it  <=>  now_utc - offset < now_utc - 24h  <=>  offset > 24h

So a Conversation idle by *strictly more than* 24h must close, one idle by
*exactly* 24h (the boundary) must remain, and one within the window must remain.
The strategy explicitly samples the 86399 / 86400 / 86401-second neighbourhood of
the boundary so this edge is exercised.

For each generated batch the test seeds several Conversations with varied
statuses (``site_unresolved`` / ``open`` / ``closed``) and varied idle offsets
(some beyond 24h, some within, some exactly on the boundary), each under a fresh
``(line_user_id, vertical_context)`` so the partial-unique live index
(``UNIQUE (line_user_id, vertical_context) WHERE status <> 'closed'``) is never
violated. It then runs the sweep ONCE and asserts, per Conversation:

  * a non-closed Conversation idle beyond 24h  -> becomes ``closed``;
  * a non-closed Conversation at/within 24h     -> status unchanged;
  * an already-closed Conversation              -> stays ``closed`` (unchanged).

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own conversations without leaking state. Every
seeded id is namespaced with a fresh UUID so it can never collide with
pre-existing rows in a shared test database. (The sweep itself is global; the
test only asserts on the Conversations it seeded, and the rollback discards any
incidental closures of pre-existing rows.)

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, or the sweep RPC / its
dependencies are not present.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_BOUNDARY_SECONDS = 24 * 60 * 60  # 86400 — the 24-hour Session_Timeout boundary.

# A conversation lifecycle status to seed. Includes the two non-closed states
# (site_unresolved, open) the sweep may act on plus closed (which it must skip).
status_strategy = st.sampled_from(("site_unresolved", "open", "closed"))

# Idle offset in seconds (how far back last_activity_at is from now_utc). Spans
# 0 .. 48h so each batch mixes within-window and beyond-window rows, and is
# explicitly biased toward the 24h boundary neighbourhood so the edge is tested.
offset_strategy = st.one_of(
    st.integers(min_value=0, max_value=2 * _BOUNDARY_SECONDS),
    st.sampled_from(
        [
            _BOUNDARY_SECONDS - 1,  # 86399 — just inside the window  -> keep
            _BOUNDARY_SECONDS,      # 86400 — exactly on the boundary -> keep
            _BOUNDARY_SECONDS + 1,  # 86401 — just beyond the window  -> close
        ]
    ),
)

# A single conversation to seed: (status, idle_offset_seconds).
conversation_strategy = st.tuples(status_strategy, offset_strategy)

# A batch of conversations seeded and swept together.
batch_strategy = st.lists(conversation_strategy, min_size=1, max_size=6)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC is unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping session-timeout-sweep "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping session-timeout-sweep test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping session-timeout-sweep test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the sweep RPC + its dependencies are present."""
    with conn.cursor() as cur:
        for sig in (
            "public.rpc_sweep_line_session_timeouts()",
            "public.resolve_actor()",
        ):
            cur.execute("select to_regprocedure(%s)", (sig,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{sig} is not installed; skipping session-timeout-sweep property test."
                )

        for rel in ("public.line_oa_conversations", "public.line_oa_audit_log"):
            cur.execute("select to_regclass(%s)", (rel,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{rel} is not installed; skipping session-timeout-sweep property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_conversation(cur: Any, status: str, offset_seconds: int) -> Any:
    """Insert one conversation idle by ``offset_seconds`` and return its id.

    ``last_activity_at`` is anchored to the SAME ``now()`` the sweep will read
    (the transaction start instant), so the 24-hour boundary is exact.
    """
    line_user_id = f"U-timeout-{uuid.uuid4().hex}"
    vertical_context = f"vertical-{uuid.uuid4().hex[:12]}"
    # site_code stays NULL for site_unresolved; a closed/open thread may carry one.
    site_code = None if status == "site_unresolved" else f"SITE-{uuid.uuid4().hex[:8]}"
    cur.execute(
        """
        insert into public.line_oa_conversations
            (line_user_id, vertical_context, site_code, status, last_activity_at)
        values (%s, %s, %s, %s, timezone('utc', now()) - make_interval(secs => %s))
        returning id
        """,
        (line_user_id, vertical_context, site_code, status, offset_seconds),
    )
    return cur.fetchone()[0]


def _status_of(cur: Any, conversation_id: Any) -> str | None:
    cur.execute(
        "select status from public.line_oa_conversations where id = %s",
        (conversation_id,),
    )
    row = cur.fetchone()
    return row[0] if row is not None else None


# ---------------------------------------------------------------------------
# Property 8
# ---------------------------------------------------------------------------


@property(
    8,
    "Any conversation idle beyond the 24h Session_Timeout is set to closed by the sweep",
)
@given(batch=batch_strategy)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_session_timeout_sweep(db_conn: Any, batch: list[tuple[str, int]]) -> None:
    """**Validates: Requirements 3.7**"""
    with db_conn.cursor() as cur:
        cur.execute("savepoint prop8")
        try:
            # Seed the batch and record, per conversation, its original status and
            # whether the sweep is required to close it.
            #   close  <=>  status <> 'closed'  AND  idle offset > 24h (strict).
            seeded: list[dict[str, Any]] = []
            local_expected_closures = 0
            for status, offset_seconds in batch:
                conv_id = _seed_conversation(cur, status, offset_seconds)
                must_close = status != "closed" and offset_seconds > _BOUNDARY_SECONDS
                if must_close:
                    local_expected_closures += 1
                seeded.append(
                    {
                        "id": conv_id,
                        "status": status,
                        "offset_seconds": offset_seconds,
                        "must_close": must_close,
                    }
                )

            # Run the Session_Timeout sweep exactly once.
            cur.execute("select closed_count from public.rpc_sweep_line_session_timeouts()")
            closed_count = cur.fetchone()[0]

            # The sweep is global; it must have closed AT LEAST our idle, non-closed
            # conversations (it may also close pre-existing idle rows, which the
            # savepoint rollback discards).
            assert closed_count >= local_expected_closures, (
                "the sweep must close at least every seeded conversation idle beyond 24h "
                f"(expected >= {local_expected_closures}, reported {closed_count})"
            )

            # Per-conversation outcome, including the exact 24h boundary.
            for conv in seeded:
                final_status = _status_of(cur, conv["id"])
                assert final_status is not None, "seeded conversation must still exist"
                if conv["must_close"]:
                    assert final_status == "closed", (
                        "a non-closed conversation idle beyond 24h "
                        f"(offset={conv['offset_seconds']}s, was {conv['status']}) "
                        "must be closed by the sweep"
                    )
                else:
                    assert final_status == conv["status"], (
                        "a conversation not idle beyond 24h, or already closed "
                        f"(offset={conv['offset_seconds']}s, was {conv['status']}), "
                        f"must be left unchanged but became {final_status}"
                    )
        finally:
            cur.execute("rollback to savepoint prop8")
            cur.execute("release savepoint prop8")

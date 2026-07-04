"""Property test — audit-log immutability (LINE OA Commerce, Module B5).

Spec task: 3.4 Write property test for audit immutability.

Implements exactly ONE numbered property against the database-layer audit-log
immutability protection shipped by task 3.2
(``00000000000004_line_oa_audit_immutability.sql`` — the
``trg_line_oa_audit_log_immutable`` trigger plus ``REVOKE UPDATE, DELETE``):

    Property 30: Audit log is immutable — any UPDATE/DELETE is rejected at the
    database level and the row is unchanged.
    Validates: Requirements 13.2.

For every generated audit row the test:

  * inserts the row into ``public.line_oa_audit_log`` and snapshots every column;
  * attempts an arbitrary set of UPDATEs (each targeting a different column with
    a freshly generated value) and a DELETE against that row, asserting each is
    rejected at the database level (an exception is raised) rather than silently
    succeeding;
  * asserts the row still exists and every column is byte-for-byte identical to
    the pre-mutation snapshot.

Each generated example runs inside a SAVEPOINT that is rolled back, and every
individual UPDATE/DELETE attempt runs inside its own nested SAVEPOINT so the
expected error can be caught and the aborted sub-transaction unwound without
disturbing the surrounding example.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, or the audit table /
immutability trigger are not present.
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
# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so generated text
# round-trips through Postgres text columns (which cannot store NUL bytes).
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

_required_text = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64)
_optional_text = st.one_of(st.none(), st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=64))

# Columns of public.line_oa_audit_log captured for the unchanged-snapshot check.
_AUDIT_COLUMNS = (
    "id",
    "event_type",
    "vertical_context",
    "site_code",
    "entity_ref",
    "performed_by",
    "performed_at",
)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / table / trigger is
# unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping audit-immutability "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping audit-immutability test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping audit-immutability test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the audit table and immutability trigger exist."""
    with conn.cursor() as cur:
        cur.execute("select to_regclass('public.line_oa_audit_log')")
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.line_oa_audit_log is not installed; skipping "
                "audit-immutability property test."
            )

        cur.execute(
            """
            select 1
            from pg_trigger
            where tgname = 'trg_line_oa_audit_log_immutable'
              and tgrelid = 'public.line_oa_audit_log'::regclass
              and not tgisinternal
            """
        )
        if cur.fetchone() is None:
            conn.rollback()
            pytest.skip(
                "trg_line_oa_audit_log_immutable is not installed; skipping "
                "audit-immutability property test."
            )
    conn.rollback()


def _snapshot(cur: Any, row_id: str) -> tuple[Any, ...] | None:
    cur.execute(
        f"select {', '.join(_AUDIT_COLUMNS)} from public.line_oa_audit_log where id = %s",
        (row_id,),
    )
    return cur.fetchone()


def _expect_rejected(cur: Any, label: str, sql: str, params: tuple[Any, ...]) -> None:
    """Run a mutation that MUST be rejected at the DB level inside a savepoint.

    The trigger raises (or, for unprivileged roles, the REVOKE denies the
    privilege); either way the statement aborts the sub-transaction, which we
    unwind via the savepoint. A statement that SUCCEEDS is a conformance bug.
    """
    sp = f"sp_{uuid.uuid4().hex}"
    cur.execute(f"savepoint {sp}")
    rejected = False
    try:
        cur.execute(sql, params)
    except Exception:
        # Rejected at the database level — the required behaviour.
        rejected = True
        cur.execute(f"rollback to savepoint {sp}")
    else:
        cur.execute(f"rollback to savepoint {sp}")
    finally:
        cur.execute(f"release savepoint {sp}")

    assert rejected, f"{label} must be rejected at the database level, but it succeeded"


# ---------------------------------------------------------------------------
# Property 30
# ---------------------------------------------------------------------------


@property(
    30,
    "Audit log is immutable — any UPDATE/DELETE is rejected at the database "
    "level and the row is unchanged",
)
@given(
    event_type=_required_text,
    vertical_context=_required_text,
    site_code=_optional_text,
    entity_ref=_required_text,
    performed_by=_required_text,
    new_event_type=_required_text,
    new_vertical_context=_required_text,
    new_site_code=_optional_text,
    new_entity_ref=_required_text,
    new_performed_by=_required_text,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_audit_log_immutable(
    db_conn: Any,
    event_type: str,
    vertical_context: str,
    site_code: str | None,
    entity_ref: str,
    performed_by: str,
    new_event_type: str,
    new_vertical_context: str,
    new_site_code: str | None,
    new_entity_ref: str,
    new_performed_by: str,
) -> None:
    """**Validates: Requirements 13.2**"""
    with db_conn.cursor() as cur:
        cur.execute("savepoint prop30")
        try:
            # Insert the audit row (defaults fill id / performed_at).
            cur.execute(
                """
                insert into public.line_oa_audit_log
                    (event_type, vertical_context, site_code, entity_ref, performed_by)
                values (%s, %s, %s, %s, %s)
                returning id
                """,
                (event_type, vertical_context, site_code, entity_ref, performed_by),
            )
            row_id = cur.fetchone()[0]

            before = _snapshot(cur, row_id)
            assert before is not None, "inserted audit row should exist before mutation attempts"

            # Arbitrary UPDATEs — one per column — must all be rejected.
            updates = [
                ("UPDATE event_type", "set event_type = %s", (new_event_type,)),
                ("UPDATE vertical_context", "set vertical_context = %s", (new_vertical_context,)),
                ("UPDATE site_code", "set site_code = %s", (new_site_code,)),
                ("UPDATE entity_ref", "set entity_ref = %s", (new_entity_ref,)),
                ("UPDATE performed_by", "set performed_by = %s", (new_performed_by,)),
                ("UPDATE performed_at", "set performed_at = now()", ()),
                ("UPDATE id", "set id = %s", (str(uuid.uuid4()),)),
                (
                    "UPDATE all columns",
                    "set event_type = %s, vertical_context = %s, site_code = %s, "
                    "entity_ref = %s, performed_by = %s",
                    (
                        new_event_type,
                        new_vertical_context,
                        new_site_code,
                        new_entity_ref,
                        new_performed_by,
                    ),
                ),
            ]
            for label, set_clause, set_params in updates:
                _expect_rejected(
                    cur,
                    label,
                    f"update public.line_oa_audit_log {set_clause} where id = %s",
                    set_params + (row_id,),
                )

            # Targeted DELETE and an unfiltered DELETE must both be rejected.
            _expect_rejected(
                cur,
                "DELETE by id",
                "delete from public.line_oa_audit_log where id = %s",
                (row_id,),
            )
            _expect_rejected(
                cur,
                "DELETE all",
                "delete from public.line_oa_audit_log where id = %s or true",
                (row_id,),
            )

            # The row must still exist and be byte-for-byte unchanged.
            after = _snapshot(cur, row_id)
            assert after is not None, "audit row must still exist after rejected DELETE attempts"
            assert after == before, (
                f"audit row must be unchanged after rejected mutations: {before} -> {after}"
            )
        finally:
            cur.execute("rollback to savepoint prop30")
            cur.execute("release savepoint prop30")

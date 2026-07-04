"""Unit test — persisted CustomerIdentity row shape (LINE OA Commerce, Module B5).

Spec task: 7.8 Write unit test for CustomerIdentity row shape.

This is an EXAMPLE-BASED unit test (NOT a numbered property test). It verifies
that the row persisted by the customer-identity resolution helper shipped by
task 7.1 (``00000000000020_line_oa_identity_resolution.sql`` —
``public.line_oa_resolve_customer_identity(text, text)``) into
``public.line_oa_customer_identity`` (table from
``00000000000001_line_oa_schema.sql`` / constraints from
``00000000000002_line_oa_constraints.sql``) carries the full documented shape:

  * ``vertical_context`` — persisted exactly as supplied (Req 6.5);
  * ``line_user_id``     — persisted exactly as supplied;
  * ``customer_id``      — the bound canonical Customer_Id returned by the helper;
  * ``id``               — the identity row id returned by the helper;
  * the documented defaults: ``manual_review_required = false`` and
    ``match_confidence IS NULL`` on a freshly minted binding;
  * all required (NOT NULL) coordinates are present.

Each example runs inside a SAVEPOINT that is rolled back, so the test provisions
and tears down its own binding without leaking state. Every ``line_user_id`` is
namespaced with a fresh UUID so it can never collide with pre-existing rows in a
shared test database.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, or the resolution
helper / table is not present.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest

from harness import database_url, get_connection


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / helper is unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping CustomerIdentity "
            "row-shape unit test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping row-shape unit test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping row-shape unit test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the resolution helper and the table are installed."""
    with conn.cursor() as cur:
        cur.execute(
            "select to_regprocedure('public.line_oa_resolve_customer_identity(text,text)')"
        )
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.line_oa_resolve_customer_identity(text,text) is not installed; "
                "skipping CustomerIdentity row-shape unit test."
            )
        cur.execute("select to_regclass('public.line_oa_customer_identity')")
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.line_oa_customer_identity table is not installed; "
                "skipping CustomerIdentity row-shape unit test."
            )
    conn.rollback()


def _resolve(cur: Any, line_user_id: str, vertical_context: str) -> tuple[Any, Any, bool]:
    """Call the helper, returning (customer_id, identity_id, created)."""
    cur.execute(
        "select customer_id, identity_id, created "
        "from public.line_oa_resolve_customer_identity(%s, %s)",
        (line_user_id, vertical_context),
    )
    row = cur.fetchone()
    return row[0], row[1], row[2]


def _fetch_row(cur: Any, identity_id: Any) -> dict[str, Any]:
    """Return the full persisted identity row as a dict keyed by column name."""
    cur.execute(
        "select id, line_user_id, vertical_context, customer_id, "
        "       match_confidence, manual_review_required "
        "from public.line_oa_customer_identity where id = %s",
        (identity_id,),
    )
    row = cur.fetchone()
    assert row is not None, "the resolved identity row must be persisted and readable"
    return {
        "id": row[0],
        "line_user_id": row[1],
        "vertical_context": row[2],
        "customer_id": row[3],
        "match_confidence": row[4],
        "manual_review_required": row[5],
    }


# ---------------------------------------------------------------------------
# Unit test — persisted row shape (Req 6.5)
# ---------------------------------------------------------------------------


def test_customer_identity_row_shape_includes_required_fields_and_defaults(
    db_conn: Any,
) -> None:
    """A freshly minted CustomerIdentity row carries vertical_context, the
    required coordinates (line_user_id, customer_id, identity id) and the
    documented defaults (manual_review_required=false, match_confidence=NULL).

    Validates: Requirements 6.5.
    """
    line_user_id = f"shapetest-{uuid.uuid4().hex}"
    vertical_context = "monolith"

    with db_conn.cursor() as cur:
        cur.execute("savepoint unit78")
        try:
            customer_id, identity_id, created = _resolve(
                cur, line_user_id, vertical_context
            )

            # The helper minted a brand-new binding for this fresh user id.
            assert created is True, "a fresh (user, vertical) must mint a new binding"
            assert customer_id is not None, "a Customer_Id must be bound on creation"
            assert identity_id is not None, "an identity row id must be returned"

            row = _fetch_row(cur, identity_id)

            # Identity row id matches the value returned by the helper.
            assert row["id"] == identity_id, (
                "the persisted row id must equal the helper's returned identity_id"
            )

            # Required coordinates persisted exactly as supplied / returned.
            assert row["line_user_id"] == line_user_id, (
                "the persisted row must store the supplied line_user_id"
            )
            assert row["vertical_context"] == vertical_context, (
                "the persisted row must store the supplied vertical_context (Req 6.5)"
            )
            assert row["customer_id"] == customer_id, (
                "the persisted row must store the bound Customer_Id returned by the helper"
            )

            # Required NOT NULL fields are all present.
            assert row["id"] is not None
            assert row["line_user_id"] is not None
            assert row["vertical_context"] is not None
            assert row["customer_id"] is not None

            # Documented defaults on a freshly minted binding.
            assert row["manual_review_required"] is False, (
                "manual_review_required must default to false on a new binding"
            )
            assert row["match_confidence"] is None, (
                "match_confidence must default to NULL on a new binding"
            )
        finally:
            cur.execute("rollback to savepoint unit78")
            cur.execute("release savepoint unit78")


def test_customer_identity_row_shape_persists_distinct_vertical_context(
    db_conn: Any,
) -> None:
    """The SAME LINE userId resolved under a DIFFERENT vertical persists a
    distinct row that stores its OWN vertical_context and bound Customer_Id.

    Validates: Requirements 6.5.
    """
    line_user_id = f"shapetest-{uuid.uuid4().hex}"
    vertical_a = "monolith"
    vertical_b = "tcck"

    with db_conn.cursor() as cur:
        cur.execute("savepoint unit78b")
        try:
            cust_a, ident_a, _ = _resolve(cur, line_user_id, vertical_a)
            cust_b, ident_b, _ = _resolve(cur, line_user_id, vertical_b)

            row_a = _fetch_row(cur, ident_a)
            row_b = _fetch_row(cur, ident_b)

            # Each row records its own vertical_context (Req 6.5).
            assert row_a["vertical_context"] == vertical_a
            assert row_b["vertical_context"] == vertical_b

            # Same userId, but distinct bindings and distinct customer ids.
            assert row_a["line_user_id"] == line_user_id
            assert row_b["line_user_id"] == line_user_id
            assert row_a["id"] != row_b["id"]
            assert row_a["customer_id"] != row_b["customer_id"]
            assert row_a["customer_id"] == cust_a
            assert row_b["customer_id"] == cust_b

            # Defaults hold for both rows.
            assert row_a["manual_review_required"] is False
            assert row_b["manual_review_required"] is False
            assert row_a["match_confidence"] is None
            assert row_b["match_confidence"] is None
        finally:
            cur.execute("rollback to savepoint unit78b")
            cur.execute("release savepoint unit78b")

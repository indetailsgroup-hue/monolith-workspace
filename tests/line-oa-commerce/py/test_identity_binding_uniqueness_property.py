"""Property test — identity binding uniqueness (LINE OA Commerce, Module B5).

Spec task: 7.2 Write property test for identity binding uniqueness.

Implements exactly ONE numbered property against the database-layer
customer-identity resolution helper shipped by task 7.1
(``00000000000020_line_oa_identity_resolution.sql`` —
``public.line_oa_resolve_customer_identity(text, text)``) and the
``UNIQUE (line_user_id, vertical_context)`` constraint from task 2.2:

    Property 14: Exactly one CustomerIdentity row per (user, vertical); existing
    binding reused, otherwise a new Customer_Id created and bound.
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5.

For every generated ``(line_user_id, vertical_a, vertical_b, repeats)`` the test:

  * resolves ``(user, vertical_a)`` for the first time and asserts the helper
    minted+bound a new Customer_Id (``created = True``) (Req 6.1, 6.3);
  * resolves ``(user, vertical_a)`` ``repeats`` more times and asserts every
    subsequent call REUSES the binding (``created = False`` and the SAME
    ``customer_id`` / ``identity_id``) (Req 6.2);
  * asserts there is EXACTLY ONE ``line_oa_customer_identity`` row for
    ``(user, vertical_a)`` regardless of the number of calls (Req 6.4);
  * resolves the SAME user in a DIFFERENT vertical ``vertical_b`` and asserts a
    DISTINCT binding is created (``created = True``, different ``customer_id`` and
    ``identity_id``), again exactly one row (Req 6.1, 6.4);
  * asserts each persisted row stores its ``vertical_context`` and the bound
    ``customer_id`` returned by the helper (Req 6.5).

Each generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own bindings without leaking state. Every
generated ``line_user_id`` is additionally namespaced with a fresh UUID so it
can never collide with pre-existing rows in a shared test database.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, or the resolution
helper is not present.
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
# Exclude surrogates (Cs) and control chars (Cc, incl. NUL) so the generated
# text round-trips through Postgres' text type (which cannot store NUL bytes).
_SAFE_TEXT = st.characters(blacklist_categories=("Cs", "Cc"))

# A LINE userId fragment. The helper rejects empty / whitespace-only ids, so we
# require a non-whitespace character to survive the btrim() guard; the value is
# further namespaced with a UUID in the test body.
user_fragment_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=48).filter(
    lambda s: len(s.strip()) > 0
)

# A Vertical_Context value. Likewise must be non-empty after btrim().
vertical_strategy = st.text(alphabet=_SAFE_TEXT, min_size=1, max_size=32).filter(
    lambda s: len(s.strip()) > 0
)

# How many additional (repeat) resolution calls to make for the first vertical.
repeats_strategy = st.integers(min_value=1, max_value=5)


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / helper is unavailable.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping identity-binding "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping identity-binding test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping identity-binding test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _require_dependencies(conn: Any) -> None:
    """Skip the module unless the resolution helper is installed."""
    with conn.cursor() as cur:
        cur.execute(
            "select to_regprocedure('public.line_oa_resolve_customer_identity(text,text)')"
        )
        if cur.fetchone()[0] is None:
            conn.rollback()
            pytest.skip(
                "public.line_oa_resolve_customer_identity(text,text) is not installed; "
                "skipping identity-binding property test."
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


def _row_count(cur: Any, line_user_id: str, vertical_context: str) -> int:
    cur.execute(
        "select count(*) from public.line_oa_customer_identity "
        "where line_user_id = %s and vertical_context = %s",
        (line_user_id, vertical_context),
    )
    return cur.fetchone()[0]


def _persisted_binding(cur: Any, identity_id: Any) -> tuple[str, Any]:
    """Return (vertical_context, customer_id) persisted for an identity row id."""
    cur.execute(
        "select vertical_context, customer_id from public.line_oa_customer_identity "
        "where id = %s",
        (identity_id,),
    )
    return cur.fetchone()


# ---------------------------------------------------------------------------
# Property 14
# ---------------------------------------------------------------------------


@property(
    14,
    "Exactly one CustomerIdentity row per (user, vertical); existing binding reused, "
    "otherwise a new Customer_Id created and bound",
)
@given(
    user_fragment=user_fragment_strategy,
    vertical_a=vertical_strategy,
    vertical_b=vertical_strategy,
    repeats=repeats_strategy,
)
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_identity_binding_uniqueness(
    db_conn: Any,
    user_fragment: str,
    vertical_a: str,
    vertical_b: str,
    repeats: int,
) -> None:
    """**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**"""
    # Guarantee the two verticals genuinely differ (same user, different vertical).
    if vertical_b == vertical_a:
        vertical_b = vertical_a + "\u00b6alt"

    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"idtest-{uuid.uuid4().hex}-{user_fragment}"

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop14")
        try:
            # Req 6.1 / 6.3 — first resolution mints + binds a brand-new Customer_Id.
            cust_a, ident_a, created_a = _resolve(cur, line_user_id, vertical_a)
            assert created_a is True, (
                "first resolution of a (user, vertical) must create a new binding"
            )
            assert cust_a is not None, "a Customer_Id must be bound on creation"
            assert ident_a is not None, "an identity row id must be returned on creation"
            assert _row_count(cur, line_user_id, vertical_a) == 1, (
                "exactly one CustomerIdentity row must exist after the first resolution"
            )

            # Req 6.5 — the persisted row carries its vertical_context and bound customer_id.
            persisted_vc, persisted_cust = _persisted_binding(cur, ident_a)
            assert persisted_vc == vertical_a, (
                "the persisted binding must store its vertical_context"
            )
            assert persisted_cust == cust_a, (
                "the persisted binding must store the bound Customer_Id"
            )

            # Req 6.2 — every subsequent resolution REUSES the same binding.
            for i in range(repeats):
                cust_r, ident_r, created_r = _resolve(cur, line_user_id, vertical_a)
                assert created_r is False, (
                    f"repeat resolution #{i + 1} must reuse the existing binding "
                    "(created=False)"
                )
                assert cust_r == cust_a, (
                    f"repeat resolution #{i + 1} must return the same Customer_Id"
                )
                assert ident_r == ident_a, (
                    f"repeat resolution #{i + 1} must return the same identity row"
                )

            # Req 6.4 — still exactly one row no matter how many times we resolved.
            assert _row_count(cur, line_user_id, vertical_a) == 1, (
                "repeated resolutions must never create additional rows for the pair"
            )

            # Req 6.1 / 6.4 — the SAME user in a DIFFERENT vertical gets a DISTINCT binding.
            cust_b, ident_b, created_b = _resolve(cur, line_user_id, vertical_b)
            assert created_b is True, (
                "the same user in a different vertical must create a new binding"
            )
            assert ident_b != ident_a, (
                "a different vertical must yield a distinct identity row"
            )
            assert cust_b != cust_a, (
                "a different vertical must mint a distinct Customer_Id"
            )
            assert _row_count(cur, line_user_id, vertical_b) == 1, (
                "exactly one CustomerIdentity row must exist for the second vertical"
            )
            # The first vertical's single-row invariant is unaffected.
            assert _row_count(cur, line_user_id, vertical_a) == 1, (
                "binding a second vertical must not duplicate the first vertical's row"
            )

            # Req 6.5 — the second vertical's row persists its own vertical_context.
            persisted_vc_b, persisted_cust_b = _persisted_binding(cur, ident_b)
            assert persisted_vc_b == vertical_b, (
                "the second binding must persist its own vertical_context"
            )
            assert persisted_cust_b == cust_b, (
                "the second binding must store its own bound Customer_Id"
            )
        finally:
            cur.execute("rollback to savepoint prop14")
            cur.execute("release savepoint prop14")

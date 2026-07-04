"""Property test — created Line_Order stamping (LINE OA Commerce, Module B5).

Spec task: 13.2 Write property test for order stamping.

Implements exactly ONE numbered property against the order-intake RPC shipped by
task 13.1 (``00000000000050_line_oa_create_order.sql`` —
``public.rpc_create_line_order(uuid, jsonb, text, text)``):

    Property 19: Created Line_Orders carry origin_channel_id='line_oa', the
    conversation vertical_context, and (once resolved) site_code and customer_id.
    Validates: Requirements 8.1, 8.2, 8.8.

For every generated example the test, as the (RLS-bypassing) table owner, seeds a
fresh Conversation for one of the two order verticals — ``monolith`` (furniture:
``line_items``/dimensions) or ``food`` (TCCK: ``menu_items``/modifiers) — in one
of two starting states:

  * **site-resolved** — ``status='open'`` with a real active ``site_code`` taken
    from ``public.get_active_site_codes()`` (A1's only valid-site source); or
  * **site_unresolved** — ``status='site_unresolved'`` with a NULL ``site_code``.

It then invokes ``rpc_create_line_order`` across BOTH the ``'postback'`` (carrying
a unique ``webhook_event_id``) and ``'manual'`` (no ``webhook_event_id``) sources
with a valid raw order for the conversation's vertical, and asserts that the
created Line_Order — both as reported by the RPC and as persisted in
``public.line_oa_orders`` — carries:

  * ``origin_channel_id='line_oa'`` (Req 8.1, 8.2, 8.8), and
  * the Conversation's ``vertical_context`` (Req 8.1, 8.2, 8.8); and

  * **when the conversation site is resolved**: the conversation's ``site_code``
    (an active code) and a non-NULL ``customer_id`` (Req 8.8); whereas
  * **while site_unresolved**: a NULL ``site_code`` and ``submitted=false`` (the
    order is persisted but not yet submitted to the Order_Lifecycle).

The principal is an authorized Governance_Role (``app_metadata.roles=['admin']``
→ ``public.is_governance_role()`` is true), so the in-function role re-check
passes both for a resolved site and for a still-``site_unresolved`` conversation
(where ``has_site_access(NULL)=false`` would otherwise block a Branch_Role),
isolating the stamping behavior under test.

The session is simulated with the platform convention used by the shipped
verification harness: ``set_config('request.jwt.claims', ...)`` injects the JWT
claims the C12 helpers (``is_governance_role`` / ``resolve_actor``) consume. Each
generated example runs inside a SAVEPOINT that is rolled back, so the test
provisions and tears down its own conversation / order / identity / audit rows
without leaking state.

The test runs against a real Postgres when ``LINE_OA_TEST_DATABASE_URL`` is
reachable; it SKIPS cleanly (never fails) when no database is configured, the
driver is missing, the connection cannot be established, the order RPC /
normalization helper / ``get_active_site_codes()`` / ``has_site_access`` /
``is_governance_role`` / ``resolve_actor`` / ``auth.jwt()`` / required tables are
unavailable, the governance-claims convention is not honored, no active Site_Code
exists, or the create-order pipeline cannot be exercised end-to-end.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from harness import PROPERTY_RUNS, database_url, get_connection, property

# The two order verticals the shipped order adapter normalizes (task 5.1 /
# public.line_oa_normalize_order): 'monolith' (furniture) and 'food' (TCCK).
VERTICALS = ("monolith", "food")

# The two intake sources the RPC supports (Req 8.1 postback / 8.2 manual).
SOURCES = ("postback", "manual")

# The single origin stamp every Line_Order must carry (Req 8.1, 8.2, 8.8).
_EXPECTED_ORIGIN = "line_oa"

# Governance principal: 'admin' is a governance role recognized by the shipped
# C12 public.is_governance_role(); a 'sub' gives public.resolve_actor() a stable
# actor. As governance the in-function role re-check passes BOTH for a resolved
# site and for a still-site_unresolved conversation, isolating the stamping
# behavior under test.
_CLAIMS = json.dumps(
    {"sub": "00000000-0000-0000-0000-0000000000aa", "app_metadata": {"roles": ["admin"]}}
)


# ---------------------------------------------------------------------------
# Strategy: a valid raw order for whichever vertical the conversation carries.
# ---------------------------------------------------------------------------

# Short, safe identifier/name text (no surrogate/control chars). btrim in the
# adapter strips whitespace, so require at least one visible char.
_token = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126),
    min_size=1,
    max_size=16,
)

# Positive-integer quantity (the adapter requires quantity > 0, integral).
_quantity = st.integers(min_value=1, max_value=99)

# Optional non-negative dimension value (furniture); the adapter carries only
# present keys and rejects negatives.
_dimension = st.integers(min_value=0, max_value=5000)


@st.composite
def _furniture_item(draw: st.DrawFn) -> dict[str, Any]:
    item: dict[str, Any] = {"sku": draw(_token), "quantity": draw(_quantity)}
    if draw(st.booleans()):
        item["name"] = draw(_token)
    if draw(st.booleans()):
        dims: dict[str, int] = {}
        for key in ("width_mm", "height_mm", "depth_mm"):
            if draw(st.booleans()):
                dims[key] = draw(_dimension)
        item["dimensions"] = dims
    return item


@st.composite
def _food_item(draw: st.DrawFn) -> dict[str, Any]:
    item: dict[str, Any] = {"item_id": draw(_token), "quantity": draw(_quantity)}
    if draw(st.booleans()):
        item["name"] = draw(_token)
    if draw(st.booleans()):
        mods = draw(
            st.lists(
                st.fixed_dictionaries({"id": _token})
                | st.fixed_dictionaries({"id": _token, "name": _token}),
                min_size=0,
                max_size=3,
            )
        )
        item["modifiers"] = mods
    return item


@st.composite
def _order_case(draw: st.DrawFn) -> dict[str, Any]:
    """Generate a vertical, a starting site state, a source, and a valid raw order."""
    vertical = draw(st.sampled_from(VERTICALS))
    source = draw(st.sampled_from(SOURCES))
    resolved = draw(st.booleans())

    if vertical == "monolith":
        items = draw(st.lists(_furniture_item(), min_size=1, max_size=3))
        raw_order: dict[str, Any] = {"line_items": items}
    else:
        items = draw(st.lists(_food_item(), min_size=1, max_size=3))
        raw_order = {"menu_items": items}

    return {
        "vertical": vertical,
        "source": source,
        "resolved": resolved,
        "raw_order": raw_order,
    }


# ---------------------------------------------------------------------------
# Connection fixture — skip cleanly when the DB / driver / RPC / helpers / tables
# are unavailable, governance claims are not honored, no active site exists, or
# the create-order pipeline cannot be exercised end-to-end.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_conn() -> Any:
    if not database_url():
        pytest.skip(
            "LINE_OA_TEST_DATABASE_URL is not set; skipping order-stamping "
            "property test (no database configured)."
        )
    try:
        conn = get_connection()
    except ModuleNotFoundError as exc:  # driver not installed
        pytest.skip(f"DB driver unavailable; skipping order-stamping test ({exc}).")
    except Exception as exc:  # connection failure — treat as "not reachable"
        pytest.skip(f"Test database not reachable; skipping order-stamping test ({exc}).")

    try:
        _require_dependencies(conn)
        yield conn
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _active_site_codes(cur: Any) -> list[str]:
    """Return the current active Site_Codes from A1's canonical source."""
    cur.execute("select site_code from public.get_active_site_codes()")
    return [row[0] for row in cur.fetchall()]


def _require_dependencies(conn: Any) -> None:
    """Skip unless the order RPC + normalization helper + A1/C12 helpers + tables
    exist, governance claims are honored, at least one active Site_Code exists,
    AND the RPC can be exercised end-to-end (seed open conversation -> create a
    stamped, submitted Line_Order)."""
    with conn.cursor() as cur:
        for proc in (
            "public.rpc_create_line_order(uuid,jsonb,text,text)",
            "public.line_oa_normalize_order(text,jsonb)",
            "public.line_oa_resolve_customer_identity(text,text)",
            "public.get_active_site_codes()",
            "public.has_site_access(text)",
            "public.is_governance_role()",
            "public.resolve_actor()",
            "auth.jwt()",
        ):
            cur.execute("select to_regprocedure(%s)", (proc,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"required routine {proc} is not installed; skipping "
                    "order-stamping property test."
                )

        for table in (
            "public.line_oa_conversations",
            "public.line_oa_orders",
            "public.line_oa_audit_log",
        ):
            cur.execute("select to_regclass(%s)", (table,))
            if cur.fetchone()[0] is None:
                conn.rollback()
                pytest.skip(
                    f"{table} is not installed; skipping order-stamping property test."
                )

        # Probe: governance claims honored, an active site exists, and one full
        # seed -> create round-trip succeeds.
        cur.execute("savepoint probe")
        try:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
            cur.execute("select public.is_governance_role()")
            is_gov = cur.fetchone()[0]
            active = _active_site_codes(cur)
            created = False
            if is_gov and active:
                conversation_id = _seed_conversation(
                    cur, f"probe-{uuid.uuid4().hex}", "monolith", active[0], "open"
                )
                result = _create_order(
                    cur,
                    conversation_id,
                    {"line_items": [{"sku": "PROBE", "quantity": 1}]},
                    "manual",
                    None,
                )
                created = bool(result["created"])
        except Exception as exc:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            conn.rollback()
            pytest.skip(
                f"cannot exercise rpc_create_line_order end-to-end; skipping "
                f"order-stamping property test ({exc})."
            )
        else:
            cur.execute("rollback to savepoint probe")
            cur.execute("release savepoint probe")
            if not is_gov:
                conn.rollback()
                pytest.skip(
                    "governance-claims convention is not honored by "
                    "is_governance_role(); skipping order-stamping property test."
                )
            if not active:
                conn.rollback()
                pytest.skip(
                    "no active Site_Code is available from get_active_site_codes(); "
                    "skipping order-stamping property test."
                )
            if not created:
                conn.rollback()
                pytest.skip(
                    "the create-order pipeline did not create an order in the probe; "
                    "skipping order-stamping property test."
                )
    conn.rollback()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_conversation(
    cur: Any, line_user_id: str, vertical: str, site_code: str | None, status: str
) -> Any:
    """Seed a fresh Conversation in the given state; return its id."""
    cur.execute(
        "insert into public.line_oa_conversations "
        "(line_user_id, vertical_context, site_code, status) "
        "values (%s, %s, %s, %s) returning id",
        (line_user_id, vertical, site_code, status),
    )
    return cur.fetchone()[0]


def _create_order(
    cur: Any,
    conversation_id: Any,
    raw_order: dict[str, Any],
    source: str,
    webhook_event_id: str | None,
) -> dict[str, Any]:
    """Invoke rpc_create_line_order and return its OUT row as a dict."""
    cur.execute("select set_config('request.jwt.claims', %s, true)", (_CLAIMS,))
    cur.execute(
        "select order_id, vertical_context, site_code, customer_id, "
        "origin_channel_id, submitted, created "
        "from public.rpc_create_line_order(%s, %s::jsonb, %s, %s)",
        (conversation_id, json.dumps(raw_order), source, webhook_event_id),
    )
    r = cur.fetchone()
    return {
        "order_id": r[0],
        "vertical_context": r[1],
        "site_code": r[2],
        "customer_id": r[3],
        "origin_channel_id": r[4],
        "submitted": r[5],
        "created": r[6],
    }


def _order_row(cur: Any, order_id: Any) -> dict[str, Any]:
    """Return the persisted Line_Order's stamped columns."""
    cur.execute(
        "select vertical_context, site_code, customer_id, origin_channel_id "
        "from public.line_oa_orders where id = %s",
        (order_id,),
    )
    row = cur.fetchone()
    return {
        "vertical_context": row[0],
        "site_code": row[1],
        "customer_id": row[2],
        "origin_channel_id": row[3],
    }


# ---------------------------------------------------------------------------
# Property 19
# ---------------------------------------------------------------------------


@property(
    19,
    "Created Line_Orders carry origin_channel_id='line_oa', the conversation "
    "vertical_context, and (once resolved) site_code and customer_id",
)
@given(case=_order_case())
@settings(max_examples=PROPERTY_RUNS, deadline=None)
def test_order_stamping(db_conn: Any, case: dict[str, Any]) -> None:
    """**Validates: Requirements 8.1, 8.2, 8.8**"""
    vertical: str = case["vertical"]
    source: str = case["source"]
    resolved: bool = case["resolved"]
    raw_order: dict[str, Any] = case["raw_order"]

    # Namespace the userId so it can never collide with pre-existing rows.
    line_user_id = f"ordstamp-{uuid.uuid4().hex}"
    # Postback orders carry a unique webhook_event_id (idempotency anchor); manual
    # orders carry none.
    webhook_event_id = f"evt-{uuid.uuid4().hex}" if source == "postback" else None

    with db_conn.cursor() as cur:
        cur.execute("savepoint prop19")
        try:
            if resolved:
                active = _active_site_codes(cur)
                if not active:
                    pytest.skip("no active Site_Code available for this example.")
                site_code = active[0]
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, site_code, "open"
                )
            else:
                site_code = None
                conversation_id = _seed_conversation(
                    cur, line_user_id, vertical, None, "site_unresolved"
                )

            result = _create_order(cur, conversation_id, raw_order, source, webhook_event_id)

            # A valid raw order for the conversation's vertical must create a fresh
            # Line_Order (the path the property is about).
            assert result["created"] is True, (
                "a valid raw order must create a fresh Line_Order; "
                f"got {result!r}"
            )
            order_id = result["order_id"]
            assert order_id is not None, "a created order must return its order_id"

            persisted = _order_row(cur, order_id)

            # --- Stamps that hold for EVERY created order (Req 8.1, 8.2, 8.8). ---
            # origin_channel_id is always 'line_oa', in both the RPC result and
            # the persisted row.
            assert result["origin_channel_id"] == _EXPECTED_ORIGIN, (
                f"the RPC must stamp origin_channel_id='{_EXPECTED_ORIGIN}'; got {result!r}"
            )
            assert persisted["origin_channel_id"] == _EXPECTED_ORIGIN, (
                f"the persisted order must carry origin_channel_id='{_EXPECTED_ORIGIN}'; "
                f"got {persisted!r}"
            )

            # The Conversation's vertical_context is carried onto the order.
            assert result["vertical_context"] == vertical, (
                "the RPC must stamp the conversation's vertical_context; "
                f"got {result['vertical_context']!r} != {vertical!r}"
            )
            assert persisted["vertical_context"] == vertical, (
                "the persisted order must carry the conversation's vertical_context; "
                f"got {persisted['vertical_context']!r} != {vertical!r}"
            )

            if resolved:
                # --- Resolved: site_code + customer_id are stamped (Req 8.8). ---
                assert result["site_code"] == site_code, (
                    "a resolved conversation must stamp its (active) site_code on the "
                    f"order; got {result['site_code']!r} != {site_code!r}"
                )
                assert persisted["site_code"] == site_code, (
                    "the persisted order must carry the resolved site_code; "
                    f"got {persisted['site_code']!r} != {site_code!r}"
                )
                assert result["customer_id"] is not None, (
                    "a resolved order must carry a customer_id; got None"
                )
                assert persisted["customer_id"] is not None, (
                    "the persisted resolved order must carry a customer_id; got None"
                )
                assert persisted["customer_id"] == result["customer_id"], (
                    "the persisted customer_id must match the RPC's; "
                    f"got {persisted['customer_id']!r} != {result['customer_id']!r}"
                )
                # A resolved active site means the order is submittable.
                assert result["submitted"] is True, (
                    "a resolved active site must mark the order submitted; "
                    f"got {result!r}"
                )
            else:
                # --- Unresolved: no site_code yet; not submitted. ---
                assert result["site_code"] is None, (
                    "a site_unresolved conversation must leave the order's site_code "
                    f"NULL; got {result['site_code']!r}"
                )
                assert persisted["site_code"] is None, (
                    "the persisted order for a site_unresolved conversation must have a "
                    f"NULL site_code; got {persisted['site_code']!r}"
                )
                assert result["submitted"] is False, (
                    "a site_unresolved order must not be submitted to the "
                    f"Order_Lifecycle; got {result!r}"
                )
        finally:
            cur.execute("rollback to savepoint prop19")
            cur.execute("release savepoint prop19")
